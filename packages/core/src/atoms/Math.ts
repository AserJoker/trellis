import type { IAtomNode } from "../IFunction.js";

/** 数学运算原子：inputs={a, b}，outputs={result}。 */
function binaryMath(
  id: string,
  name: string,
  fn: (a: number, b: number) => number,
): IAtomNode {
  return {
    id,
    namespace: "sys",
    name,
    version: "1.0.0",
    inputs: ["a", "b"],
    outputs: ["result"],
    async fn(input, ctx) {
      const a = input.a as number;
      const b = input.b as number;
      if (typeof a !== "number" || typeof b !== "number") {
        throw new Error(`sys.${name}: 入边 a/b 必须是 number`);
      }
      ctx.emit("result", fn(a, b));
    },
  };
}

export const sysMathAtoms: IAtomNode[] = [
  binaryMath("sys.add", "add", (a, b) => a + b),
  binaryMath("sys.subtract", "subtract", (a, b) => a - b),
  binaryMath("sys.multiply", "multiply", (a, b) => a * b),
  binaryMath("sys.divide", "divide", (a, b) => a / b),
];
