/**
 * 返回形状 Schema（类 JSON Schema，但仅形状，无约束）。
 * 用途：前端声明希望后端返回的结构（数据地图），
 * 后端依据 schema 递归查询复杂字段、按白名单裁剪字段。
 *
 * 与 JSON Schema 的差异：只保留形状描述（type/properties/items），
 * 移除约束（required/pattern/minimum/maximum 等）。
 *
 * 语法：
 * - 对象：{ type: "object", properties: { <field>: <SchemaNode> } }
 * - 数组：{ type: "array", items: <SchemaNode> }
 * - 标量：{ type: "string" | "number" | "boolean" | ... }
 */

/** 标量逻辑类型（对应 type-mapping 的 LogicalType） */
export type SchemaScalarType =
  | "string"
  | "int"
  | "float"
  | "decimal"
  | "boolean"
  | "datetime"
  | "json"
  | "uuid";

/** 形状节点：标量 / 对象 / 数组 */
export type SchemaNode =
  | { type: SchemaScalarType }
  | { type: "object"; properties: Record<string, SchemaNode> }
  | { type: "array"; items: SchemaNode };

/** 返回形状 Schema（顶层为对象） */
export interface ISchema {
  type: "object";
  properties: Record<string, SchemaNode>;
}
