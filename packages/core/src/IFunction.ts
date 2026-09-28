import { IBase } from "./IBase";

/**
 * 执行上下文：引擎注入给节点 fn 的执行期能力。
 * - emit：节点向指定输出字段发令牌；引擎即时路由下游。
 * - signal：引擎可取消本次执行（function 完成时对活动执行 abort，
 *   终止并行分支，避免异步资源泄漏）。
 */
export interface IExecContext {
  emit(field: string, value: unknown): void;
  signal: AbortSignal;
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
  fn: (input: Record<string, unknown>, ctx: IExecContext) => Promise<void>;
}

/** 数据流边：从 fromNode 的 fromField 流向 toNode 的 toField。 */
export interface IFunctionEdge extends IBase {
  fromNode: string;
  toNode: string;
  fromField: string;
  toField: string;
}

/**
 * Function：有向图编排（数据流触发，可含控制流）。
 * - edges：数据流边；entry：入口节点；output：输出节点。
 * - output 节点执行完成后视作整个 function 执行完成，
 *   其全部 outputs 字段合并作为 function 的返回值。
 * - 执行过程中捕获错误并返回（不向外抛）。
 * - 引擎惰性调度：只有就绪且被派发的节点创建执行上下文；
 *   output 完成后对全部活动执行 abort（可取消，无 Promise 泄漏）。
 */
export interface IFunction extends IBase {
  edges: IFunctionEdge[];
  entry: string;
  output: string;
}
