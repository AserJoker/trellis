/**
 * 元数据校验（手写校验，临时措施 T2）。
 * 待后续（阶段 2/5）：基于 Model 元数据驱动的自研校验。
 */

import type { IModel } from "./types/model.js";
import type { IField } from "./types/field.js";
import { isRelationType, RELATION_TYPES } from "./types/field.js";

/** 校验错误 */
export interface ValidationIssue {
  path: string;
  message: string;
}

/** 校验结果 */
export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/** 收集器 */
class Collector {
  readonly issues: ValidationIssue[] = [];
  get valid(): boolean {
    return this.issues.length === 0;
  }
  error(path: string, message: string): void {
    this.issues.push({ path, message });
  }
}

/** 非空字符串 */
function nonEmpty(s: string | undefined): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

/** 校验 Model 定义 */
export function validateModel(model: unknown): ValidationResult {
  const c = new Collector();
  if (model === null || typeof model !== "object") {
    c.error("$", "model 必须是对象");
    return { valid: false, issues: c.issues };
  }
  const m = model as Record<string, unknown>;

  // 公共基础元数据
  for (const key of ["id", "name", "namespace"] as const) {
    if (!nonEmpty(m[key] as string)) c.error(`$.${key}`, `${key} 不能为空`);
  }
  if (m.displayName !== undefined && !nonEmpty(m.displayName as string)) {
    c.error("$.displayName", "displayName 不能为空字符串");
  }

  // 三大部分
  if (!nonEmpty(m.primaryField as string)) c.error("$.primaryField", "primaryField 不能为空");

  if (!Array.isArray(m.fields)) {
    c.error("$.fields", "fields 必须是数组");
  } else {
    (m.fields as unknown[]).forEach((f, i) => validateField(f, c, `$.fields[${i}]`));
    // 主键字段必须存在于 fields 中
    const fieldNames = new Set((m.fields as IField[]).map((f) => f.name));
    if (!fieldNames.has(m.primaryField as string)) {
      c.error("$.primaryField", `primaryField '${m.primaryField}' 不在 fields 中`);
    }
  }

  if (!Array.isArray(m.functions)) {
    c.error("$.functions", "functions 必须是数组");
  }

  return { valid: c.valid, issues: c.issues };
}

/** 校验 Field 定义 */
export function validateField(field: unknown, collector?: Collector, path = "$"): ValidationResult {
  const c = collector ?? new Collector();
  if (field === null || typeof field !== "object") {
    c.error(path, "field 必须是对象");
    return { valid: c.valid, issues: c.issues };
  }
  const f = field as Record<string, unknown>;

  if (!nonEmpty(f.name as string)) c.error(`${path}.name`, "字段 name 不能为空");
  if (!nonEmpty(f.type as string)) c.error(`${path}.type`, "字段 type 不能为空");

  const type = f.type as string;
  const store = f.store as boolean | undefined;

  if (isRelationType(type)) {
    // 复杂字段：store 必须为 false（物理不存在）
    if (store !== false) {
      c.error(`${path}.store`, `复杂字段（${type}）store 必须为 false`);
    }
    // 关系四键：本侧/对侧字段、关系模型 id 应为非空（统一结构，用不到留空的是 junctionModelId）
    if (RELATION_TYPES.includes(type as (typeof RELATION_TYPES)[number])) {
      if (!nonEmpty(f.thisField as string)) c.error(`${path}.thisField`, "复杂字段 thisField 不能为空");
      if (!nonEmpty(f.thatField as string)) c.error(`${path}.thatField`, "复杂字段 thatField 不能为空");
      if (!nonEmpty(f.relatedModelId as string)) c.error(`${path}.relatedModelId`, "复杂字段 relatedModelId 不能为空");
    }
    // One2One/Many2Many 需要中间模型（junctionModelId）
    if (type === "One2One" || type === "Many2Many") {
      if (!nonEmpty(f.junctionModelId as string)) {
        c.error(`${path}.junctionModelId`, `${type} 关系需要 junctionModelId（中间模型）`);
      }
    }
  } else {
    // 简单字段：store 默认 true（未声明视为 true）
    if (store === false) {
      c.error(`${path}.store`, `简单字段 store 默认 true，不可为 false`);
    }
  }

  return { valid: c.valid, issues: c.issues };
}

/** 校验 Function 定义 */
export function validateFunction(fn: unknown): ValidationResult {
  const c = new Collector();
  if (fn === null || typeof fn !== "object") {
    c.error("$", "function 必须是对象");
    return { valid: false, issues: c.issues };
  }
  const f = fn as Record<string, unknown>;
  if (!nonEmpty(f.name as string)) c.error("$.name", "函数 name 不能为空");
  const exec = f.execution as string | undefined;
  if (exec !== "frontend" && exec !== "backend") {
    c.error("$.execution", "execution 必须是 frontend 或 backend");
  }
  return { valid: c.valid, issues: c.issues };
}
