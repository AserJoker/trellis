import type { IAtomNode, IExecContext, IFunction } from "./IFunction.js";
import { sysAtoms } from "./atoms/index.js";

/**
 * 执行结果：output 节点全部 outputs 字段合并；或错误（不向外抛）。
 */
export type ExecResult = Record<string, unknown>;

/**
 * 创建选项：
 * - atoms：追加自定义原子（默认注册 sys 通用原子后追加）。
 * - disableDefaultAtoms：true 时不注册 sys 通用原子（只注册 atoms 里给的）。
 */
export interface CreateExecutorOptions {
  atoms?: IAtomNode[];
  disableDefaultAtoms?: boolean;
}

/** 节点运行状态。 */
export type NodeStatus = "pending" | "running" | "paused" | "done" | "aborted";
/** 一次 function 执行的总体状态。 */
export type ExecutionStatus = "running" | "paused" | "done" | "error" | "aborted";

/** 节点状态快照（监控用，值拷贝）。 */
export interface NodeSnapshot {
  nodeId: string;
  status: NodeStatus;
  join: "and" | "or";
  /** 已收到的入边值（toField → value）。 */
  slots: Record<string, unknown>;
  /** 尚未就绪的入边字段。 */
  missing: string[];
  /** 本节点 emit 过的输出字段。 */
  emitted: Record<string, unknown>;
}

/** 一次执行的快照（监控用）。 */
export interface ExecutionSnapshot {
  /** executionId：每次 execute 独立，用于 resume/查询。 */
  id: string;
  functionId: string;
  status: ExecutionStatus;
  nodes: NodeSnapshot[];
}

/** 监控事件表：on(event, listener) 可订阅。 */
export interface ExecutorEventMap {
  "execute-start": {
    executionId: string;
    functionId: string;
    params: Record<string, unknown>;
  };
  "node-ready": { executionId: string; nodeId: string };
  "node-run": { executionId: string; nodeId: string };
  "node-emit": {
    executionId: string;
    nodeId: string;
    field: string;
    value: unknown;
  };
  "node-done": { executionId: string; nodeId: string };
  "node-paused": { executionId: string; nodeId: string };
  "execution-done": { executionId: string; result: ExecResult };
  "execution-error": {
    executionId: string;
    error: { message: string; nodeId: string };
  };
}

type Listener = (payload: never) => void;

/** 节点运行状态（槽位状态机，一次执行的内部表示）。 */
interface NodeState {
  node: IAtomNode;
  /** 已收到的入边值（toField → value）。 */
  slots: Map<string, unknown>;
  /** 尚未就绪的入边字段。 */
  missing: Set<string>;
  /** 就绪判定：AND（缺省）全入边就绪；OR 任一到达即就绪。 */
  join: "and" | "or";
  status: NodeStatus;
  /** 本节点 emit 过的输出字段（output 收集用）。 */
  emitted: Map<string, unknown>;
}

/** 一次 execute 的独立状态（替代原闭包局部变量）。 */
interface ExecutionState {
  id: string;
  functionId: string;
  params: Record<string, unknown>;
  nodes: Map<string, NodeState>;
  outgoing: Map<string, IFunction["edges"][number][]>;
  controller: AbortController;
  readyQueue: NodeState[];
  settled: boolean;
  status: ExecutionStatus;
  resolve: (r: ExecResult) => void;
}

/**
 * FunctionExecutor：Function 的逻辑执行器（类形式）。
 *
 * 本质是**无副作用的纯执行器**——副作用全部来自外部注入的 `deps`
 * 与原子接口（IAtomNode），执行器自身不碰任何 IO/状态。
 *
 * 调度语义（对照 concepts.md 第 6/6a 节）：
 * - AND 汇聚：节点 missing（未就绪入边字段）为空即就绪，任一入边缺则等待。
 * - OR 汇聚（IAtomNode.join="or"）：任一入边到达即就绪；只触发一次。
 *   等待是纯同步状态（只有 slots/missing 数据），不创建任何 Promise 等待器。
 * - ctx.emit 同步路由：emit 即记录 emitted、沿出边填下游槽位、下游就绪则入 readyQueue；
 *   派发用微任务（避免 emit 深递归导致调用栈溢出）。
 * - output 完成：output 节点 done 后其 emitted 全部字段合并为返回值，
 *   同时共享 AbortController abort 全部活动执行（终止并行分支）。
 * - 错误捕获：fn 抛错/reject → 整个 function 失败 → resolve { error: { message, nodeId } }，
 *   不向外抛；abort 导致的提前返回不算错误（正常取消）。
 * - 断点暂停：节点就绪待派发时命中断点（functionId + nodeId）→ 暂停该次执行
 *   （execute 的 Promise 保持 pending，不 resolve），resume(executionId) 继续。
 * - 监控：on(event, listener) 订阅执行事件流；getExecutions/getExecution/getNodeState
 *   查询数据流状态同步快照。
 */
export class FunctionExecutor<D extends Record<string, unknown>> {
  private atoms = new Map<string, IAtomNode>();
  private functions = new Map<string, IFunction>();
  /** 断点表：functionId → nodeId 集合。 */
  private breakpoints = new Map<string, Set<string>>();
  /** 活跃执行：executionId → ExecutionState。done/error/aborted 后移除。 */
  private executions = new Map<string, ExecutionState>();
  private nextExecId = 1;
  private listeners = new Map<keyof ExecutorEventMap, Set<Listener>>();
  private deps: D;

  constructor(deps: D, options: CreateExecutorOptions = {}) {
    this.deps = deps;
    // 自动加载：默认注册 sys 通用原子（可用 disableDefaultAtoms 关闭），再追加自定义原子
    if (!options.disableDefaultAtoms) {
      for (const atom of sysAtoms) this.atoms.set(atom.id, atom);
    }
    for (const atom of options.atoms ?? []) {
      if (this.atoms.has(atom.id)) {
        throw new Error(`Duplicate atom registration: ${atom.id}`);
      }
      this.atoms.set(atom.id, atom);
    }
  }

  registerAtom(node: IAtomNode): void {
    if (this.atoms.has(node.id)) {
      throw new Error(`Duplicate atom registration: ${node.id}`);
    }
    this.atoms.set(node.id, node);
  }

  registerFunction(fn: IFunction): void {
    if (this.functions.has(fn.id)) {
      throw new Error(`Duplicate function registration: ${fn.id}`);
    }
    this.functions.set(fn.id, fn);
  }

  // ---------- 断点 ----------

  addBreakpoint(functionId: string, nodeId: string): void {
    let set = this.breakpoints.get(functionId);
    if (!set) {
      set = new Set();
      this.breakpoints.set(functionId, set);
    }
    set.add(nodeId);
  }

  removeBreakpoint(functionId: string, nodeId: string): void {
    const set = this.breakpoints.get(functionId);
    if (!set) return;
    set.delete(nodeId);
    if (set.size === 0) this.breakpoints.delete(functionId);
  }

  listBreakpoints(): Array<{ functionId: string; nodeId: string }> {
    const result: Array<{ functionId: string; nodeId: string }> = [];
    for (const [functionId, set] of this.breakpoints) {
      for (const nodeId of set) result.push({ functionId, nodeId });
    }
    return result;
  }

  // ---------- 监控：事件流 ----------

  on<E extends keyof ExecutorEventMap>(
    event: E,
    listener: (payload: ExecutorEventMap[E]) => void,
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener);
    return () => {
      set.delete(listener as Listener);
      if (set.size === 0) this.listeners.delete(event);
    };
  }

  private emitEvent<E extends keyof ExecutorEventMap>(
    event: E,
    payload: ExecutorEventMap[E],
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      (listener as (p: ExecutorEventMap[E]) => void)(payload);
    }
  }

  // ---------- 监控：状态快照 ----------

  getExecutions(): ExecutionSnapshot[] {
    const result: ExecutionSnapshot[] = [];
    for (const exec of this.executions.values()) {
      result.push(this.snapshot(exec));
    }
    return result;
  }

  getExecution(executionId: string): ExecutionSnapshot | undefined {
    const exec = this.executions.get(executionId);
    return exec ? this.snapshot(exec) : undefined;
  }

  getNodeState(executionId: string, nodeId: string): NodeSnapshot | undefined {
    const exec = this.executions.get(executionId);
    if (!exec) return undefined;
    const state = exec.nodes.get(nodeId);
    return state ? this.nodeSnapshot(state) : undefined;
  }

  // ---------- 执行控制 ----------

  resume(executionId: string): void {
    const exec = this.executions.get(executionId);
    if (!exec || exec.settled) return;
    const paused: NodeState[] = [];
    for (const state of exec.nodes.values()) {
      if (state.status === "paused") {
        state.status = "running";
        paused.push(state);
      }
    }
    if (paused.length === 0) return;
    exec.status = "running";
    for (const state of paused) {
      exec.readyQueue.push(state);
      this.emitEvent("node-run", { executionId, nodeId: state.node.id });
    }
    queueMicrotask(() => this.drain(exec));
  }

  // ---------- 执行 ----------

  async execute(
    id: string,
    params: Record<string, unknown>,
  ): Promise<ExecResult> {
    const fn = this.functions.get(id);
    if (!fn) {
      return { error: { message: `Function not registered: ${id}`, nodeId: "" } };
    }
    if (!fn.entry || !fn.output) {
      return { error: { message: `Function ${id} is missing entry/output`, nodeId: "" } };
    }

    const exec = this.buildGraph(fn);
    if (exec.error) {
      return { error: { message: `function ${fn.id}: ${exec.error}`, nodeId: "" } };
    }
    const entry = exec.nodes.get(fn.entry);
    const output = exec.nodes.get(fn.output);
    if (!entry || !output) {
      return {
        error: { message: `Function ${id}: entry/output not found in graph`, nodeId: "" },
      };
    }

    const executionId = `exec-${this.nextExecId++}`;
    const state: ExecutionState = {
      id: executionId,
      functionId: fn.id,
      params,
      nodes: exec.nodes,
      outgoing: exec.outgoing,
      controller: new AbortController(),
      readyQueue: [],
      settled: false,
      status: "running",
      resolve: undefined as unknown as (r: ExecResult) => void,
    };
    this.executions.set(executionId, state);
    this.emitEvent("execute-start", { executionId, functionId: fn.id, params });

    const promise = new Promise<ExecResult>((resolve) => {
      state.resolve = resolve;
    });

    // 派发全部源节点：
    // - AND 节点：missing 为空（无入边，或入边已被常量边/entry params 填齐）
    // - OR 节点：slots 非空（至少一个触发源已就绪，可能来自常量边）
    // entry 是其中之一；params 直接注入 entry 的 input（其他源节点 input 为空）
    for (const nodeState of state.nodes.values()) {
      if (nodeState.status !== "pending") continue;
      const ready =
        nodeState.join === "or"
          ? nodeState.slots.size > 0
          : nodeState.missing.size === 0;
      if (!ready) continue;
      this.emitEvent("node-ready", { executionId, nodeId: nodeState.node.id });
      this.dispatchNode(state, nodeState);
    }
    if (state.readyQueue.length > 0) queueMicrotask(() => this.drain(state));

    return promise;
  }

  // ---------- 内部 ----------

  private buildGraph(fn: IFunction): {
    nodes: Map<string, NodeState>;
    outgoing: Map<string, IFunction["edges"][number][]>;
    error?: string;
  } {
    const nodes = new Map<string, NodeState>();
    const out = new Map<string, IFunction["edges"][number][]>();
    for (const nodeId of collectNodeIds(fn)) {
      const node = this.atoms.get(nodeId);
      if (!node) {
        return { nodes, outgoing: out, error: `Atom node not registered: ${nodeId}` };
      }
      nodes.set(nodeId, {
        node,
        slots: new Map(),
        missing: new Set(node.inputs),
        join: node.join ?? "and",
        status: "pending",
        emitted: new Map(),
      });
    }
    for (const edge of fn.edges) {
      if (edge.fromNode) {
        // 节点边：进 outgoing 索引（emit 时路由）
        const list = out.get(edge.fromNode) ?? [];
        list.push(edge);
        out.set(edge.fromNode, list);
      } else {
        // 常量边：直接填目标槽位（无源节点，天然就绪）
        const target = nodes.get(edge.toNode);
        if (!target) {
          return {
            nodes,
            outgoing: out,
            error: `Constant edge target node not registered: ${edge.toNode}`,
          };
        }
        target.slots.set(edge.toField, edge.constant);
        target.missing.delete(edge.toField);
      }
    }
    return { nodes, outgoing: out };
  }

  /** emit 同步路由：填下游槽位，就绪则入队（含断点检查在派发时做）。 */
  private emitValue(
    exec: ExecutionState,
    state: NodeState,
    field: string,
    value: unknown,
  ): void {
    if (state.status === "aborted") return;
    state.emitted.set(field, value);
    this.emitEvent("node-emit", {
      executionId: exec.id,
      nodeId: state.node.id,
      field,
      value,
    });
    for (const edge of exec.outgoing.get(state.node.id) ?? []) {
      if (edge.fromField !== field) continue;
      const target = exec.nodes.get(edge.toNode);
      if (!target || target.status === "done" || target.status === "aborted") continue;
      target.slots.set(edge.toField, value);
      target.missing.delete(edge.toField);
      // 就绪判定：AND 全入边就绪；OR 任一到达即就绪
      const ready =
        target.join === "or" ? target.slots.size > 0 : target.missing.size === 0;
      if (ready && target.status === "pending") {
        this.emitEvent("node-ready", { executionId: exec.id, nodeId: target.node.id });
        this.dispatchNode(exec, target);
      }
    }
  }

  /**
   * 派发节点：先查断点——命中则暂停（不执行，execute 保持 pending），
   * 未命中直接入队执行。由 resume 放行暂停节点（跳过一次断点检查）。
   */
  private dispatchNode(exec: ExecutionState, state: NodeState): void {
    if (exec.settled) return;
    if (this.hasBreakpoint(exec.functionId, state.node.id)) {
      state.status = "paused";
      exec.status = "paused";
      this.emitEvent("node-paused", {
        executionId: exec.id,
        nodeId: state.node.id,
      });
      return;
    }
    state.status = "running";
    this.emitEvent("node-run", { executionId: exec.id, nodeId: state.node.id });
    exec.readyQueue.push(state);
    queueMicrotask(() => this.drain(exec));
  }

  private hasBreakpoint(functionId: string, nodeId: string): boolean {
    return this.breakpoints.get(functionId)?.has(nodeId) ?? false;
  }

  private drain(exec: ExecutionState): void {
    const state = exec.readyQueue.shift();
    if (!state || exec.settled) return;
    const ctx: IExecContext<D> = {
      emit: (field, value) => this.emitValue(exec, state, field, value),
      signal: exec.controller.signal,
      deps: this.deps,
    };
    const input: Record<string, unknown> = {};
    for (const [k, v] of state.slots) input[k] = v;
    Promise.resolve()
      .then(() => state.node.fn(input, ctx))
      .then(() => {
        state.status = "done";
        this.emitEvent("node-done", { executionId: exec.id, nodeId: state.node.id });
        if (exec.settled) return;
        if (this.isOutputNode(exec, state)) {
          exec.settled = true;
          exec.status = "done";
          exec.controller.abort();
          const result: Record<string, unknown> = {};
          for (const [k, v] of state.emitted) result[k] = v;
          this.executions.delete(exec.id);
          this.emitEvent("execution-done", { executionId: exec.id, result });
          exec.resolve(result);
        } else {
          queueMicrotask(() => this.drain(exec));
        }
      })
      .catch((err: unknown) => {
        if (exec.settled) return;
        exec.settled = true;
        exec.status = "error";
        exec.controller.abort();
        const message = err instanceof Error ? err.message : String(err);
        const error = { message, nodeId: state.node.id };
        this.executions.delete(exec.id);
        this.emitEvent("execution-error", { executionId: exec.id, error });
        exec.resolve({ error });
      });
  }

  /** 判断节点是否为该次执行的 output 节点。 */
  private isOutputNode(exec: ExecutionState, state: NodeState): boolean {
    const fn = this.functions.get(exec.functionId);
    return fn?.output === state.node.id;
  }

  private nodeSnapshot(state: NodeState): NodeSnapshot {
    return {
      nodeId: state.node.id,
      status: state.status,
      join: state.join,
      slots: Object.fromEntries(state.slots),
      missing: [...state.missing],
      emitted: Object.fromEntries(state.emitted),
    };
  }

  private snapshot(exec: ExecutionState): ExecutionSnapshot {
    const nodes: NodeSnapshot[] = [];
    for (const state of exec.nodes.values()) {
      nodes.push(this.nodeSnapshot(state));
    }
    return {
      id: exec.id,
      functionId: exec.functionId,
      status: exec.status,
      nodes,
    };
  }
}

function collectNodeIds(fn: IFunction): Set<string> {
  const ids = new Set<string>([fn.entry, fn.output]);
  for (const edge of fn.edges) {
    if (edge.fromNode) ids.add(edge.fromNode);
    ids.add(edge.toNode);
  }
  if (fn.entry) ids.delete("");
  if (fn.output) ids.delete("");
  return ids;
}
