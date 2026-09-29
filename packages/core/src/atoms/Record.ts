import type { IAtomNode } from "../IFunction.js";

/**
 * 字段读写原子。
 * - getField：inputs={record, key}，outputs={value}——从 record 取字段值。
 * - setField：inputs={record, key, value}，outputs={result}——返回新 record（含设置字段）。
 */
export const sysRecordAtoms: IAtomNode[] = [
  {
    id: "sys.getField",
    namespace: "sys",
    name: "getField",
    version: "1.0.0",
    inputs: ["record", "key"],
    outputs: ["value"],
    async fn(input, ctx) {
      const record = input.record as Record<string, unknown>;
      const key = input.key as string;
      if (!record || typeof record !== "object") {
        throw new Error("sys.getField: input record must be an object");
      }
      ctx.emit("value", record[key]);
    },
  },
  {
    id: "sys.setField",
    namespace: "sys",
    name: "setField",
    version: "1.0.0",
    inputs: ["record", "key", "value"],
    outputs: ["result"],
    async fn(input, ctx) {
      const record = input.record as Record<string, unknown>;
      const key = input.key as string;
      if (!record || typeof record !== "object") {
        throw new Error("sys.setField: input record must be an object");
      }
      ctx.emit("result", { ...record, [key]: input.value });
    },
  },
];

/**
 * record 变换原子。
 * - mergeRecord：inputs={a, b}，outputs={result}——合并两个 record（b 覆盖 a）。
 * - pick：inputs={record, keys}，outputs={result}——裁选指定字段。
 * - omit：inputs={record, keys}，outputs={result}——剔除指定字段。
 */
export const sysRecordTransformAtoms: IAtomNode[] = [
  {
    id: "sys.mergeRecord",
    namespace: "sys",
    name: "mergeRecord",
    version: "1.0.0",
    inputs: ["a", "b"],
    outputs: ["result"],
    async fn(input, ctx) {
      const a = (input.a ?? {}) as Record<string, unknown>;
      const b = (input.b ?? {}) as Record<string, unknown>;
      ctx.emit("result", { ...a, ...b });
    },
  },
  {
    id: "sys.pick",
    namespace: "sys",
    name: "pick",
    version: "1.0.0",
    inputs: ["record", "keys"],
    outputs: ["result"],
    async fn(input, ctx) {
      const record = input.record as Record<string, unknown>;
      const keys = input.keys as string[];
      if (!record || typeof record !== "object" || !Array.isArray(keys)) {
        throw new Error("sys.pick: input record must be an object and keys must be an array");
      }
      const result: Record<string, unknown> = {};
      for (const k of keys) result[k] = record[k];
      ctx.emit("result", result);
    },
  },
  {
    id: "sys.omit",
    namespace: "sys",
    name: "omit",
    version: "1.0.0",
    inputs: ["record", "keys"],
    outputs: ["result"],
    async fn(input, ctx) {
      const record = input.record as Record<string, unknown>;
      const keys = input.keys as string[];
      if (!record || typeof record !== "object" || !Array.isArray(keys)) {
        throw new Error("sys.omit: input record must be an object and keys must be an array");
      }
      const result: Record<string, unknown> = { ...record };
      for (const k of keys) delete result[k];
      ctx.emit("result", result);
    },
  },
];
