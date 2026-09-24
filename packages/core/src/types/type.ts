/**
 * Type 类型定义。
 * 字段类型是抽象的、面向业务的，由框架映射到正确的逻辑数据类型。
 * 例：业务类型「金融」→ 逻辑类型「高精度十进制（字符串承载）」。
 * 类型映射可扩展：业务类型到逻辑类型的映射本身也是一个 Model。
 */

/**
 * 逻辑数据类型（框架内部统一的数据类型，非物理数据库类型）。
 * 物理数据库类型由存储引擎按逻辑类型推导。
 */
export type LogicalType =
  | "string"
  | "int"
  | "float"
  | "decimal" // 高精度十进制，字符串承载
  | "boolean"
  | "datetime"
  | "json"
  | "uuid";

/**
 * 业务类型定义（也是 Model 承载的对象）。
 * 业务抽象类型 → 逻辑数据类型 的映射声明。
 */
export interface IType {
  /** 业务类型名（如「金融」） */
  name: string;
  /** 映射到的逻辑数据类型（如 decimal） */
  logicalType: LogicalType;
  /** 扩展元数据（预留） */
  [key: string]: unknown;
}
