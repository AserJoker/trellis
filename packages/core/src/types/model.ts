/**
 * Model 类型定义。
 * Model = 类似数据库表的数据对象元数据，是框架的中心概念。
 * 三大部分：元数据区、fields（字段定义）、functions（行为函数定义）。
 */

import type { IField } from "./field.js";
import type { IFunction } from "./function.js";

/**
 * 系统模型的公共基础元数据。
 * 所有系统模型（Model/Field/Function/Type 等）均包含：
 * - id：全局唯一标识
 * - name：模型名
 * - namespace：命名空间
 * - displayName：国际化 key（非直接文本，由国际化 Model 解析）
 */
export interface IBaseMetadata {
  /** 全局唯一标识 */
  id: string;
  /** 模型名 */
  name: string;
  /** 命名空间 */
  namespace: string;
  /** 国际化 key */
  displayName?: string;
}

/**
 * Model 结构（三大部分）。
 */
export interface IModel extends IBaseMetadata {
  /** 主键字段名 */
  primaryField: string;
  /** 字段定义 */
  fields: IField[];
  /** 行为函数定义 */
  functions: IFunction[];
  /** 扩展元数据（预留） */
  [key: string]: unknown;
}
