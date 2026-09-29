import type { IAtomNode } from "../IFunction.js";

/**
 * 集合基础原子（无回调）。
 * - length：inputs={array}，outputs={count}——数组长度。
 * - concat：inputs={a, b}，outputs={result}——连接两个数组。
 * - slice：inputs={array, start, end?}，outputs={result}——切片。
 * - first：inputs={array}，outputs={value}——首元素。
 * - last：inputs={array}，outputs={value}——尾元素。
 */
export const sysCollectionAtoms: IAtomNode[] = [
  {
    id: "sys.length",
    namespace: "sys",
    name: "length",
    version: "1.0.0",
    inputs: ["array"],
    outputs: ["count"],
    async fn(input, ctx) {
      const array = input.array as unknown[];
      if (!Array.isArray(array)) {
        throw new Error("sys.length: input array must be an array");
      }
      ctx.emit("count", array.length);
    },
  },
  {
    id: "sys.concat",
    namespace: "sys",
    name: "concat",
    version: "1.0.0",
    inputs: ["a", "b"],
    outputs: ["result"],
    async fn(input, ctx) {
      const a = input.a as unknown[];
      const b = input.b as unknown[];
      if (!Array.isArray(a) || !Array.isArray(b)) {
        throw new Error("sys.concat: inputs a/b must be arrays");
      }
      ctx.emit("result", [...a, ...b]);
    },
  },
  {
    id: "sys.slice",
    namespace: "sys",
    name: "slice",
    version: "1.0.0",
    inputs: ["array", "start", "end"],
    outputs: ["result"],
    async fn(input, ctx) {
      const array = input.array as unknown[];
      if (!Array.isArray(array)) {
        throw new Error("sys.slice: input array must be an array");
      }
      const start = (input.start ?? 0) as number;
      const end = input.end as number | undefined;
      ctx.emit("result", end === undefined ? array.slice(start) : array.slice(start, end));
    },
  },
  {
    id: "sys.first",
    namespace: "sys",
    name: "first",
    version: "1.0.0",
    inputs: ["array"],
    outputs: ["value"],
    async fn(input, ctx) {
      const array = input.array as unknown[];
      if (!Array.isArray(array)) {
        throw new Error("sys.first: input array must be an array");
      }
      ctx.emit("value", array[0]);
    },
  },
  {
    id: "sys.last",
    namespace: "sys",
    name: "last",
    version: "1.0.0",
    inputs: ["array"],
    outputs: ["value"],
    async fn(input, ctx) {
      const array = input.array as unknown[];
      if (!Array.isArray(array)) {
        throw new Error("sys.last: input array must be an array");
      }
      ctx.emit("value", array[array.length - 1]);
    },
  },
];

/**
 * 集合字段提取/过滤原子（无回调版本）。
 * - mapField：inputs={array, key}，outputs={result}——取每个元素字段值成新数组。
 * - filterByField：inputs={array, key, value}，outputs={result}——按字段值过滤（等值）。
 */
export const sysCollectionFieldAtoms: IAtomNode[] = [
  {
    id: "sys.mapField",
    namespace: "sys",
    name: "mapField",
    version: "1.0.0",
    inputs: ["array", "key"],
    outputs: ["result"],
    async fn(input, ctx) {
      const array = input.array as Record<string, unknown>[];
      const key = input.key as string;
      if (!Array.isArray(array)) {
        throw new Error("sys.mapField: input array must be an array");
      }
      ctx.emit("result", array.map((item) => (item as Record<string, unknown>)?.[key]));
    },
  },
  {
    id: "sys.filterByField",
    namespace: "sys",
    name: "filterByField",
    version: "1.0.0",
    inputs: ["array", "key", "value"],
    outputs: ["result"],
    async fn(input, ctx) {
      const array = input.array as Record<string, unknown>[];
      const key = input.key as string;
      if (!Array.isArray(array)) {
        throw new Error("sys.filterByField: input array must be an array");
      }
      ctx.emit(
        "result",
        array.filter((item) => (item as Record<string, unknown>)?.[key] === input.value),
      );
    },
  },
];
