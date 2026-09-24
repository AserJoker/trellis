/**
 * Function 类型定义。
 * function 是 Model 三大组成部分之一。
 * 编排图是 function 上的一个 JSON 字段，描述数据流+控制流合一的编排图。
 * 底层是框架提供的原子能力（原子数据操作 / 原子功能函数）。
 * 自举：function 本身也是一个 Model。
 */

/** 执行位置：前端执行 / 后端执行 */
export type ExecutionLocation = "frontend" | "backend";

/**
 * function 定义。
 */
export interface IFunction {
  /** 函数名 */
  name: string;
  /** 执行位置（前端执行直接在前端运行，后端执行封装为请求） */
  execution: ExecutionLocation;
  /** 编排图 JSON（数据流+控制流合一，由原子能力组成） */
  graph?: unknown;
  /** 扩展元数据（预留） */
  [key: string]: unknown;
}
