import type { IAtomNode } from "../IFunction.js";
import { sysMathAtoms } from "./Math.js";
import { sysLogicAtoms } from "./Logic.js";
import { sysCompareAtoms } from "./Compare.js";
import { sysIfAtom } from "./Control.js";

/** 全部通用原子（sys 顶层命名空间）：if、数学、逻辑、比较。 */
export const sysAtoms: IAtomNode[] = [
  sysIfAtom,
  ...sysMathAtoms,
  ...sysLogicAtoms,
  ...sysCompareAtoms,
];

export { sysIfAtom } from "./Control.js";
export { sysMathAtoms } from "./Math.js";
export { sysLogicAtoms } from "./Logic.js";
export { sysCompareAtoms } from "./Compare.js";
