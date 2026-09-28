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
      throw new Error("sys.if: 入边 condition 必须是 boolean");
    }
    if (condition) {
      ctx.emit("then", true);
    } else {
      ctx.emit("else", true);
    }
  },
};
