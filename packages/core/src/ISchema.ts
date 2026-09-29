import type { FieldType } from "./IField.js";

/**
 * Schema：内置 CRUD 接口的返回结构描述子协议（见 docs/concepts.md 5f 节）。
 *
 * 形式：去除校验的 JSONSchema——借用 JSONSchema 的树形结构语法，去掉校验语义
 * （minimum/pattern 等），只保留结构描述。**每个字段都写 type**（含叶子简单字段），
 * 形状 → Model 关系映射：object → O2O/M2O（对侧单记录）、array → M2M/O2M（对侧多记录）。
 *
 * 用途：query 先按 condition 查第一层，再按 schema 递归装配关联数据；create/update/delete
 * 的返回同样走 schema。服务端解析时做形状一致性校验（与 Model 定义不匹配即报错，
 * 防前后端不配套），但**不做值校验**。
 */
export type ISchema =
  | ISimpleSchema
  | IEnumSchema
  | IObjectSchema
  | IArraySchema;

/** 简单叶子字段：FieldType 中除 enum 与四类关系外的类型。 */
export interface ISimpleSchema {
  type: "string" | "integer" | "floating" | "boolean" | "text";
}

/** 枚举字段：值为枚举项 value（字符串）。 */
export interface IEnumSchema {
  type: "enum";
  /** 可选：限定允许的枚举项 value 集合（不填则接受全部）。 */
  items?: string[];
}

/** 对象：O2O/M2O 关系，对侧单记录。 */
export interface IObjectSchema {
  type: "object";
  properties: Record<string, ISchema>;
}

/** 数组：M2M/O2M 关系，对侧多记录（items 描述元素结构）。 */
export interface IArraySchema {
  type: "array";
  items: ISchema;
}

/** 简单/枚举叶子类型（object/array 之外的递归终止形态）。 */
export type ILeafSchema = ISimpleSchema | IEnumSchema;

/** shape 值：schema 描述的结构形态（递归），用于形状校验。 */
export type ISchemaShape = "string" | "integer" | "floating" | "boolean" | "text" | "enum" | "object" | "array";

/**
 * 解析 schema 的递归结构形态。
 * - object → "object"（与 FieldType 的 "one2one"/"many2one" 对应，形状层为统一 "object"）
 * - array → "array"（与 "many2many"/"one2many" 对应）
 * - 叶子 → 自身 type。
 *
 * 供形状校验用（例：Model 中 string 字段 + schema 声明 object → 校验失败）。
 */
export function resolveShape(schema: ISchema): ISchemaShape {
  switch (schema.type) {
    case "object":
    case "array":
      return schema.type;
    case "enum":
    case "string":
    case "integer":
    case "floating":
    case "boolean":
    case "text":
      return schema.type;
  }
}

/**
 * 从 Model 字段类型求期望 shape（形状校验的对照侧）。
 * enum → "enum"；四类关系 → object/array；其余 → 自身类型。
 */
export function shapeForFieldType(type: FieldType): ISchemaShape {
  switch (type) {
    case "one2one":
    case "many2one":
      return "object";
    case "one2many":
    case "many2many":
      return "array";
    case "string":
    case "integer":
    case "floating":
    case "boolean":
    case "text":
    case "enum":
      return type;
  }
}
