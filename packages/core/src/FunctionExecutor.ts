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

/**
 * FunctionExecutor：Function 的逻辑执行器。
 *
 * 本质是**无副作用的纯执行器**——副作用全部来自外部注入的 `deps`
 * 与原子接口（IAtomNode），执行器自身不碰任何 IO/状态。
 *
 * 调度语义（对照 concepts.md 第 6/6a 节）：
 * - AND 汇聚：节点 missing（未就绪入边字段）为空即就绪，任一入边缺则等待。
 *   等待是纯同步状态（只有 slots/missing 数据），不创建任何 Promise 等待器。
 * - ctx.emit 同步路由：emit 即记录 emitted、沿出边填下游槽位、下游就绪则入 readyQueue；
 *   派发用微任务（避免 emit 深递归导致调用栈溢出）。
 * - output 完成：output 节点 done 后其 emitted 全部字段合并为返回值，
 *   同时共享 AbortController abort 全部活动执行（终止并行分支）。
 * - 错误捕获：fn 抛错/reject → 整个 function 失败 → resolve { error: { message, nodeId } }，
 *   不向外抛；abort 导致的提前返回不算错误（正常取消）。
 */
export interface FunctionExecutor<D extends Record<string, unknown>> {
  registerAtom(node: IAtomNode): void;
  registerFunction(fn: IFunction): void;
  execute(id: string, params: Record<string, unknown>): Promise<ExecResult>;
}

/** 节点运行状态（槽位状态机）。 */
interface NodeState {
  node: IAtomNode;
  /** 已收到的入边值（toField → value）。 */
  slots: Map<string, unknown>;
  /** 尚未就绪的入边字段。 */
  missing: Set<string>;
  status: "pending" | "running" | "done" | "aborted";
  /** 本节点 emit 过的输出字段（output 收集用）。 */
  emitted: Map<string, unknown>;
}

export function createFunctionExecutor<D extends Record<string, unknown>>(
  deps: D,
  options: CreateExecutorOptions = {},
): FunctionExecutor<D> {
  const atoms = new Map<string, IAtomNode>();
  const functions = new Map<string, IFunction>();

  // 自动加载：默认注册 sys 通用原子（可用 disableDefaultAtoms 关闭），再追加自定义原子
  if (!options.disableDefaultAtoms) {
    for (const atom of sysAtoms) atoms.set(atom.id, atom);
  }
  for (const atom of options.atoms ?? []) {
    if (atoms.has(atom.id)) {
      throw new Error(`原子节点重复注册: ${atom.id}`);
    }
    atoms.set(atom.id, atom);
  }

  function buildGraph(fn: IFunction): {
    nodes: Map<string, NodeState>;
    outgoing: Map<string, IFunction["edges"][number][]>;
    error?: string;
  } {
    const nodes = new Map<string, NodeState>();
    const out = new Map<string, IFunction["edges"][number][]>();
    for (const nodeId of collectNodeIds(fn)) {
      const node = atoms.get(nodeId);
      if (!node) {
        return { nodes, outgoing: out, error: `原子节点未注册: ${nodeId}` };
      }
      nodes.set(nodeId, {
        node,
        slots: new Map(),
        missing: new Set(node.inputs),
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
          return { nodes, outgoing: out, error: `常量边目标节点未注册: ${edge.toNode}` };
        }
        target.slots.set(edge.toField, edge.constant);
        target.missing.delete(edge.toField);
      }
    }
    return { nodes, outgoing: out };
  }

  async function execute(
    id: string,
    params: Record<string, unknown>,
  ): Promise<ExecResult> {
    const fn = functions.get(id);
    if (!fn) {
      return { error: { message: `function 未注册: ${id}`, nodeId: "" } };
    }
    if (!fn.entry || !fn.output) {
      return { error: { message: `function ${id} 缺少 entry/output`, nodeId: "" } };
    }

    const { nodes, outgoing: outMap, error } = buildGraph(fn);
    if (error) {
      return { error: { message: `function ${fn.id}: ${error}`, nodeId: "" } };
    }
    const entry = nodes.get(fn.entry);
    const output = nodes.get(fn.output);
    if (!entry || !output) {
      return {
        error: { message: `function ${id} 的 entry/output 不在图中`, nodeId: "" },
      };
    }

    const controller = new AbortController();
    const readyQueue: NodeState[] = [];
    let settled = false;

    const emit = (state: NodeState, field: string, value: unknown) => {
      if (state.status === "aborted") return;
      state.emitted.set(field, value);
      for (const edge of outMap.get(state.node.id) ?? []) {
        if (edge.fromField !== field) continue;
        const target = nodes.get(edge.toNode);
        if (!target || target.status === "done" || target.status === "aborted") continue;
        target.slots.set(edge.toField, value);
        target.missing.delete(edge.toField);
        if (target.missing.size === 0 && target.status === "pending") {
          target.status = "running";
          readyQueue.push(target);
          queueMicrotask(drain);
        }
      }
    };

    const drain = () => {
      const state = readyQueue.shift();
      if (!state || settled) return;
      const ctx: IExecContext<D> = {
        emit: (field, value) => emit(state, field, value),
        signal: controller.signal,
        deps,
      };
      const input: Record<string, unknown> = {};
      for (const [k, v] of state.slots) input[k] = v;
      Promise.resolve()
        .then(() => state.node.fn(input, ctx))
        .then(() => {
          state.status = "done";
          if (state.node.id === fn.output) {
            settled = true;
            controller.abort();
            const result: Record<string, unknown> = {};
            for (const [k, v] of state.emitted) result[k] = v;
            resolve(result);
          } else {
            queueMicrotask(drain);
          }
        })
        .catch((err: unknown) => {
          if (settled) return;
          settled = true;
          controller.abort();
          const message = err instanceof Error ? err.message : String(err);
          resolve({ error: { message, nodeId: state.node.id } });
        });
    };

    // output 完成时由 drain 内调用（resolve 在 then 回调里，先声明）
    let resolve!: (r: ExecResult) => void;
    const promise = new Promise<ExecResult>((res) => {
      resolve = res;
    });

    // 派发全部源节点（missing 为空的节点：无入边的常量、或入边已齐的节点）
    // entry 是其中之一；params 直接注入 entry 的 input（其他源节点 input 为空）
    for (const state of nodes.values()) {
      if (state.missing.size > 0 || state.status !== "pending") continue;
      state.status = "running";
      if (state.node.id === fn.entry) {
        for (const [k, v] of Object.entries(params)) state.slots.set(k, v);
      }
      readyQueue.push(state);
    }
    if (readyQueue.length > 0) queueMicrotask(drain);

    return promise;
  }

  return {
    registerAtom(node) {
      if (atoms.has(node.id)) {
        throw new Error(`原子节点重复注册: ${node.id}`);
      }
      atoms.set(node.id, node);
    },
    registerFunction(fn) {
      if (functions.has(fn.id)) {
        throw new Error(`function 重复注册: ${fn.id}`);
      }
      functions.set(fn.id, fn);
    },
    execute,
  };
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
