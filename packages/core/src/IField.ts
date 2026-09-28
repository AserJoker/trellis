import { IBase } from "./IBase";

export type FieldType =
  | "string"
  | "integer"
  | "floating"
  | "boolean"
  | "text"
  | "enum"
  | "one2many"
  | "many2one"
  | "one2one"
  | "many2many";
export interface IEnumItem extends IBase {
  value?: string;
}
export interface IBaseField extends IBase {
  type: FieldType;
  store?: boolean;
  /**
   * array = true 时，字段为数组，所有数据类型统一以 string 序列化。
   * 序列化格式：逗号分隔 + 反斜杠转义（`\` 转义 `,`）。
   * 例：[1,2] → "1,2"；["a","b,"] → "a,b\,"。
   */
  array?: boolean;
}
export interface ISimpleField extends IBaseField {
  type: "string" | "integer" | "floating" | "boolean" | "text";
}
export interface IEnumField extends IBaseField {
  type: "enum";
  items: IEnumItem[];
}
export interface IComplexField extends IBaseField {
  type: "one2many" | "many2one" | "one2one" | "many2many";
  relationField: string;
  referenceField: string;
  /** 对侧 Model 的完整 id（点分路径，如 "sys.user"）。 */
  referenceModel: string;
  store?: false;
}
export interface IRelationField extends IComplexField {
  type: "many2many" | "one2one";
  /** 中间 Model 的完整 id（点分路径）。 */
  associationModel: string;
}
export type IField = ISimpleField | IEnumField | IComplexField | IRelationField;
