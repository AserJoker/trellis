import type { IAtomNode } from "../IFunction.js";

/** 比较原子：inputs={a, b}，outputs={result}（boolean）。 */
function compare(
  id: string,
  name: string,
  fn: (a: unknown, b: unknown) => boolean,
): IAtomNode {
  return {
    id,
    namespace: "sys",
    name,
    version: "1.0.0",
    inputs: ["a", "b"],
    outputs: ["result"],
    async fn(input, ctx) {
      ctx.emit("result", fn(input.a, input.b));
    },
  };
}

export const sysCompareAtoms: IAtomNode[] = [
  compare("sys.equals", "equals", (a, b) => a === b),
  compare("sys.gt", "gt", (a, b) => (a as number) > (b as number)),
  compare("sys.lt", "lt", (a, b) => (a as number) < (b as number)),
  compare("sys.gte", "gte", (a, b) => (a as number) >= (b as number)),
  compare("sys.lte", "lte", (a, b) => (a as number) <= (b as number)),
];
