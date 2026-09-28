import { IBase } from "./IBase";
import { IField } from "./IField";
import { IFunction } from "./IFunction";

/**
 * Model：数据对象元数据。
 * - 默认（virtual = false/缺省）：数据模型，IStore 为其创建物理表，支持 CRUD/query。
 * - virtual = true：不创建表，纯内存无持久化；field 是绑定 class 的成员变量
 *   （沿用 IField 结构描述类型与序列化形态）；function 指向 native 方法。
 *   Model 与 class 的绑定由引擎注册表持有（model.id → class），不入库。
 */
export interface IModel extends IBase {
  primaryField: string;
  virtual?: boolean;
  fields: IField[];
  functions: IFunction[];
}
