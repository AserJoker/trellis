import type { IAtomNode } from "../IFunction.js";

/** 布尔原子：inputs={a, b}，outputs={result}。 */
function binaryBool(
  id: string,
  name: string,
  fn: (a: boolean, b: boolean) => boolean,
): IAtomNode {
  return {
    id,
    namespace: "sys",
    name,
    version: "1.0.0",
    inputs: ["a", "b"],
    outputs: ["result"],
    async fn(input, ctx) {
      const a = input.a as boolean;
      const b = input.b as boolean;
      if (typeof a !== "boolean" || typeof b !== "boolean") {
        throw new Error(`sys.${name}: inputs a/b must be booleans`);
      }
      ctx.emit("result", fn(a, b));
    },
  };
}

/** 一元原子：inputs={a}，outputs={result}。 */
function unaryBool(id: string, name: string, fn: (a: boolean) => boolean): IAtomNode {
  return {
    id,
    namespace: "sys",
    name,
    version: "1.0.0",
    inputs: ["a"],
    outputs: ["result"],
    async fn(input, ctx) {
      const a = input.a as boolean;
      if (typeof a !== "boolean") {
        throw new Error(`sys.${name}: input a must be a boolean`);
      }
      ctx.emit("result", fn(a));
    },
  };
}

export const sysLogicAtoms: IAtomNode[] = [
  binaryBool("sys.and", "and", (a, b) => a && b),
  binaryBool("sys.or", "or", (a, b) => a || b),
  unaryBool("sys.not", "not", (a) => !a),
];
