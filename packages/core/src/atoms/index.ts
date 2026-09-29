import type { IAtomNode } from "../IFunction.js";
import { sysMathAtoms } from "./Math.js";
import { sysLogicAtoms } from "./Logic.js";
import { sysCompareAtoms } from "./Compare.js";
import { sysIfAtom, sysSwitchAtom, sysCoalesceAtom } from "./Control.js";
import { sysRecordAtoms, sysRecordTransformAtoms } from "./Record.js";
import { sysCollectionAtoms, sysCollectionFieldAtoms } from "./Collection.js";
import { sysConvertAtoms } from "./Convert.js";

/**
 * 全部通用原子（sys 顶层命名空间）：
 * 控制流（if/switch/coalesce）、数学、逻辑、比较、record、集合、类型转换。
 */
export const sysAtoms: IAtomNode[] = [
  sysIfAtom,
  sysSwitchAtom,
  sysCoalesceAtom,
  ...sysMathAtoms,
  ...sysLogicAtoms,
  ...sysCompareAtoms,
  ...sysRecordAtoms,
  ...sysRecordTransformAtoms,
  ...sysCollectionAtoms,
  ...sysCollectionFieldAtoms,
  ...sysConvertAtoms,
];

export { sysIfAtom, sysSwitchAtom, sysCoalesceAtom } from "./Control.js";
export { sysMathAtoms } from "./Math.js";
export { sysLogicAtoms } from "./Logic.js";
export { sysCompareAtoms } from "./Compare.js";
export { sysRecordAtoms, sysRecordTransformAtoms } from "./Record.js";
export { sysCollectionAtoms, sysCollectionFieldAtoms } from "./Collection.js";
export { sysConvertAtoms } from "./Convert.js";
