import type { IAtomNode } from "../IFunction.js";

/**
 * if 原子：控制流降维为数据流的核心——选择性输出。
 * - inputs={condition}：布尔条件。
 * - outputs={then, else}：condition 决定哪个端口激活。
 *   只 emit 激活的输出字段（令牌/信号），引擎只沿存在的字段触发下游边；
 *   未激活分支的下游节点凑不齐所有入边，自然保持等待（AND 汇聚实现 if/else 互斥）。
 */
export const sysIfAtom: IAtomNode = {
  id: "sys.if",
  namespace: "sys",
  name: "if",
  version: "1.0.0",
  inputs: ["condition"],
  outputs: ["then", "else"],
  async fn(input, ctx) {
    const condition = input.condition as boolean;
    if (typeof condition !== "boolean") {
      throw new Error("sys.if: input condition must be a boolean");
    }
    if (condition) {
      ctx.emit("then", true);
    } else {
      ctx.emit("else", true);
    }
  },
};

/**
 * switch 原子：多路分支（值分发）。
 * - inputs={value, cases, default}。
 *   - cases：`Record<caseValue, outputField>`（case 值 → 输出字段名，常量边提供）。
 *   - default：默认输出字段名（无匹配时激活）。
 * - outputs 动态：匹配 case → emit 对应字段（令牌/信号）；无匹配 → emit default 字段。
 *   与 if 同语义：未激活字段的下游节点保持等待（AND 汇聚互斥）。
 */
export const sysSwitchAtom: IAtomNode = {
  id: "sys.switch",
  namespace: "sys",
  name: "switch",
  version: "1.0.0",
  inputs: ["value", "cases", "default"],
  outputs: [],
  async fn(input, ctx) {
    const cases = input.cases as Record<string, string>;
    const fallback = input.default as string | undefined;
    if (!cases || typeof cases !== "object") {
      throw new Error("sys.switch: input cases must be a { caseValue: outputField } mapping");
    }
    // case 值统一转字符串比对（record 键只能是 string）
    const key = String(input.value);
    const field = cases[key] ?? fallback;
    if (!field) {
      throw new Error("sys.switch: no matching case and no default provided");
    }
    ctx.emit(field, true);
  },
};

/**
 * coalesce 原子：空值兜底。
 * - inputs={array}：取值数组。
 * - outputs={result}：取数组中首个非空值（null/undefined 跳过）。
 */
export const sysCoalesceAtom: IAtomNode = {
  id: "sys.coalesce",
  namespace: "sys",
  name: "coalesce",
  version: "1.0.0",
  inputs: ["array"],
  outputs: ["result"],
  async fn(input, ctx) {
    const array = input.array as unknown[];
    if (!Array.isArray(array)) {
      throw new Error("sys.coalesce: input array must be an array");
    }
    for (const item of array) {
      if (item !== null && item !== undefined) {
        ctx.emit("result", item);
        return;
      }
    }
    ctx.emit("result", undefined);
  },
};
