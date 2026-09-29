import type { IAtomNode } from "../IFunction.js";

/**
 * 类型转换原子。
 * - toString：inputs={value}，outputs={result}——值转字符串。
 * - toNumber：inputs={value}，outputs={result}——值转数字（非数字抛错）。
 * - parseJson：inputs={text}，outputs={result}——JSON 字符串解析为值。
 * - stringify：inputs={value}，outputs={result}——值序列化为 JSON 字符串。
 */
export const sysConvertAtoms: IAtomNode[] = [
  {
    id: "sys.toString",
    namespace: "sys",
    name: "toString",
    version: "1.0.0",
    inputs: ["value"],
    outputs: ["result"],
    async fn(input, ctx) {
      ctx.emit("result", String(input.value));
    },
  },
  {
    id: "sys.toNumber",
    namespace: "sys",
    name: "toNumber",
    version: "1.0.0",
    inputs: ["value"],
    outputs: ["result"],
    async fn(input, ctx) {
      const n = Number(input.value);
      if (Number.isNaN(n)) {
        throw new Error(`sys.toNumber: cannot convert "${String(input.value)}" to a number`);
      }
      ctx.emit("result", n);
    },
  },
  {
    id: "sys.parseJson",
    namespace: "sys",
    name: "parseJson",
    version: "1.0.0",
    inputs: ["text"],
    outputs: ["result"],
    async fn(input, ctx) {
      try {
        ctx.emit("result", JSON.parse(input.text as string));
      } catch {
        throw new Error("sys.parseJson: JSON parse failed");
      }
    },
  },
  {
    id: "sys.stringify",
    namespace: "sys",
    name: "stringify",
    version: "1.0.0",
    inputs: ["value"],
    outputs: ["result"],
    async fn(input, ctx) {
      try {
        ctx.emit("result", JSON.stringify(input.value));
      } catch {
        throw new Error("sys.stringify: serialization failed");
      }
    },
  },
];
