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
  referenceModel: string;
  store?: false;
}
export interface IRelationField extends IComplexField {
  type: "many2many" | "one2one";
  associationModel: string;
}
export type IField = ISimpleField | IEnumField | IComplexField | IRelationField;
