import { IBase } from "./IBase";

/**
 * 执行上下文：引擎注入给节点 fn 的执行期能力。
 * - emit：节点向指定输出字段发令牌；引擎即时路由下游。
 * - signal：引擎可取消本次执行（function 完成时对活动执行 abort，
 *   终止并行分支，避免异步资源泄漏）。
 * - deps：宿主注入的上下文（泛型 D 声明注入物类型，不用 any/unknown）。
 *   引擎启动时注册注入物（注册表），每次执行 function 统一注入。
 *   例：后端 `IExecContext<{ store: IStore }>` → ctx.deps.store.query(...)；
 *       前端 `IExecContext<{ history: History }>` → ctx.deps.history.push(...)。
 */
export interface IExecContext<
  D extends Record<string, unknown> = Record<string, unknown>,
> {
  emit(field: string, value: unknown): void;
  signal: AbortSignal;
  deps: D;
}

/**
 * 原子操作节点：引擎的原子能力，不入库。
 * 由引擎在启动时注册管理；规定必须无状态。
 *
 * 执行条件（AND 汇聚）：所有入边数据就绪才执行，任一入边等待则节点等待。
 * 等待是同步状态（槽位未满），引擎不预建 Promise 等待器——不产生泄漏。
 *
 * 数据获取：全部通过入边流入（无共享状态读取）。
 *
 * 选择性输出（控制流降维为数据流）：
 * 通过 ctx.emit(field, value) 发令牌；只 emit 激活的输出字段，引擎只沿
 * 存在的字段触发下游边；未 emit 的输出字段 = 不触发（if 等分支节点：
 * condition 决定 then/else 哪个端口激活，输出的是令牌/信号，非数据）。
 */
export interface IAtomNode extends IBase {
  version: string;
  inputs: string[];
  outputs: string[];
  /** 返回值不用于输出，结果通过 ctx.emit 发令牌；signal 触发时尽早返回。 */
  fn: <D extends Record<string, unknown> = Record<string, unknown>>(
    input: Record<string, unknown>,
    ctx: IExecContext<D>,
  ) => Promise<void>;
}

/**
 * 数据流边：
 * - 节点边：fromNode 非空，值从 fromNode 的 fromField 路由到 toNode 的 toField。
 * - 常量边：fromNode 为空 + constant 有值，常量直接作为 toNode 的 toField 入边
 *   （无源节点、天然就绪，AND 汇聚照常）。constant 必须 JSON 可序列化（function 入库）。
 */
export interface IFunctionEdge extends IBase {
  fromNode: string;
  toNode: string;
  fromField: string;
  toField: string;
  constant?: unknown;
}

/**
 * Function：有向图编排（数据流触发，可含控制流）。
 * - edges：数据流边；entry：入口节点；output：输出节点。
 * - output 节点执行完成后视作整个 function 执行完成，
 *   其全部 outputs 字段合并作为 function 的返回值。
 * - 执行过程中捕获错误并返回（不向外抛）。
 * - 引擎惰性调度：只有就绪且被派发的节点创建执行上下文；
 *   output 完成后对全部活动执行 abort（可取消，无 Promise 泄漏）。
 *
 * native function（virtual model 的方法）：
 * - edges 为空、entry/output 为空字符串，无编排图。
 * - 引擎注册表持有 function.id → 实际函数 的映射（不入库）。
 * - 无需在元数据区分 native/编排：function.id 全局唯一，注册表即权威。
 * - 被调用方式：编排图通过特殊原子操作 Call（携带 function.id 引用），
 *   以平等的 Function 引用调用普通或 native function。
 *
 * 执行位置：
 * - local = true：前端本地执行——框架用前端引擎直接运行该 function。
 * - local = false / 缺省：后端执行——框架以 function_id 为 key 把调用封装成请求发往后端。
 * - local 仅作路由决策，与原子注册表无关；function 能否在目标端执行取决于
 *   目标端引擎注册表是否含其编排图所需原子（缺原子则执行时报错）。
 * - 前后端执行引擎完全一致（同一套编排引擎），仅注册的原子接口不同：
 *   后端为 IO 类原子（查询数据库、存储/事务），前端为界面类原子（跳转、返回）。
 * - 内建数据操作（createOne/updateOne/deleteOne/query）固定后端执行，不声明 local。
 */
export interface IFunction extends IBase {
  local?: boolean;
  edges: IFunctionEdge[];
  entry: string;
  output: string;
}
