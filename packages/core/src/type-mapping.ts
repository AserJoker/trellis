/**
 * 类型映射与数据清洗。
 * 字段类型是抽象的、面向业务的，由框架映射到逻辑数据类型。
 * 业务类型 → 逻辑类型的映射本身也是一个 Model（TypeModel 承载），可扩展。
 */

import type { IModel } from "./types/model.js";
import type { IField } from "./types/field.js";
import { isRelationType } from "./types/field.js";
import type { IType, LogicalType } from "./types/type.js";
import { TypeModel } from "./system-models.js";

/** 默认内置类型（框架内置，无需注册） */
export const BUILTIN_TYPES: Record<string, LogicalType> = {
  string: "string",
  text: "string",
  int: "int",
  integer: "int",
  float: "float",
  decimal: "decimal",
  number: "decimal",
  boolean: "boolean",
  bool: "boolean",
  datetime: "datetime",
  date: "datetime",
  json: "json",
  uuid: "uuid",
};

export class TypeRegistry {
  private readonly custom = new Map<string, LogicalType>();

  /** 注册业务类型 → 逻辑类型（来自 TypeModel 数据） */
  register(type: IType): void {
    this.custom.set(type.name, type.logicalType);
  }

  /** 解析字段的业务类型 → 逻辑类型 */
  resolve(fieldType: string): LogicalType | undefined {
    return BUILTIN_TYPES[fieldType] ?? this.custom.get(fieldType);
  }
}

/** 逻辑类型校验（清洗时检查值是否符合逻辑类型） */
export function validateLogicalValue(logicalType: LogicalType, value: unknown): boolean {
  switch (logicalType) {
    case "string":
      return typeof value === "string";
    case "int":
      return Number.isInteger(value);
    case "float":
      return typeof value === "number";
    case "decimal":
      // 高精度十进制：以字符串保存，避免浮点精度损失
      return typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value);
    case "boolean":
      return typeof value === "boolean";
    case "datetime":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
    case "json":
      return typeof value === "object" && value !== null;
    case "uuid":
      return typeof value === "string" && /^[0-9a-fA-F-]{36}$/.test(value);
  }
}

/**
 * 清洗数据行：按 Model 字段定义，把 store=true 的字段值按逻辑类型校验。
 * 返回清洗后只含物理字段的行（复杂字段不落库）。
 */
export function cleanStoredRow(model: IModel, row: Record<string, unknown>, types: TypeRegistry): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of model.fields) {
    // 复杂字段 store=false 不落库
    if (isRelationType(field.type)) continue;
    const name = field.name;
    if (!(name in row)) continue;
    const value = row[name];
    if (value === undefined || value === null) continue;
    const logical = types.resolve(field.type);
    if (logical && !validateLogicalValue(logical, value)) {
      throw new Error(`字段 '${model.name}.${name}' 的值不符合逻辑类型 '${logical}'`);
    }
    out[name] = value;
  }
  return out;
}

/** 默认类型注册表（仅内置类型，无自定义） */
export function createDefaultTypeRegistry(): TypeRegistry {
  return new TypeRegistry();
}

export { TypeModel };
