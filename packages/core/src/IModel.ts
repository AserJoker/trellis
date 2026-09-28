import { IBase } from "./IBase";
import { IField } from "./IField";
import { IFunction } from "./IFunction";

export interface IModel extends IBase {
  primaryField: string;
  fields: IField[];
  functions: IFunction[];
}
