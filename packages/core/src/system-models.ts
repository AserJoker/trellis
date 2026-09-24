/**
 * 系统模型定义（自举）。
 * 所有系统模型均以 IModel 结构声明——用 Model 描述 Model。
 * ModelModel / FieldModel / FunctionModel / TypeModel / I18nModel。
 * 自举闭环：这些系统模型本身也是 IModel，可被 ModelModel 描述。
 */

import type { IModel } from "./types/model.js";

/** 系统命名空间 */
export const SYS_NAMESPACE = "sys";

function base(id: string, name: string, displayName: string): Pick<IModel, "id" | "name" | "namespace" | "displayName"> {
  return { id, name, namespace: SYS_NAMESPACE, displayName };
}

/**
 * ModelModel：描述 Model 本身的结构。
 * 自举的起点——Model 的元数据模型。
 */
export const ModelModel: IModel = {
  ...base("sys.model", "ModelModel", "trellis.model"),
  primaryField: "id",
  fields: [
    { name: "id", type: "uuid", store: true, primary: true },
    { name: "name", type: "string", store: true },
    { name: "namespace", type: "string", store: true },
    { name: "displayName", type: "string", store: true },
    { name: "primaryField", type: "string", store: true },
    {
      name: "fields",
      type: "One2Many",
      store: false,
      relatedModelId: "sys.field",
      thisField: "modelId",
      thatField: "id",
    },
    {
      name: "functions",
      type: "One2Many",
      store: false,
      relatedModelId: "sys.function",
      thisField: "modelId",
      thatField: "id",
    },
  ],
  functions: [],
};

/**
 * FieldModel：描述 Field 本身的结构。
 * 所有字段元信息键结构统一（对应数据库一张列固定的 Field 表）。
 */
export const FieldModel: IModel = {
  ...base("sys.field", "FieldModel", "trellis.field"),
  primaryField: "id",
  fields: [
    { name: "id", type: "uuid", store: true, primary: true },
    { name: "name", type: "string", store: true },
    { name: "namespace", type: "string", store: true },
    { name: "displayName", type: "string", store: true },
    { name: "type", type: "string", store: true },
    { name: "store", type: "boolean", store: true },
    { name: "primary", type: "boolean", store: true },
    { name: "thisField", type: "string", store: true },
    { name: "thatField", type: "string", store: true },
    { name: "relatedModelId", type: "uuid", store: true },
    { name: "junctionModelId", type: "uuid", store: true },
    { name: "modelId", type: "uuid", store: true },
  ],
  functions: [],
};

/**
 * FunctionModel：描述 Function 本身的结构。
 * 编排图是 function 上的一个 JSON 字段。
 */
export const FunctionModel: IModel = {
  ...base("sys.function", "FunctionModel", "trellis.function"),
  primaryField: "id",
  fields: [
    { name: "id", type: "uuid", store: true, primary: true },
    { name: "name", type: "string", store: true },
    { name: "namespace", type: "string", store: true },
    { name: "displayName", type: "string", store: true },
    { name: "execution", type: "string", store: true },
    { name: "graph", type: "json", store: true },
    { name: "modelId", type: "uuid", store: true },
  ],
  functions: [],
};

/**
 * TypeModel：描述业务类型到逻辑类型的映射。
 */
export const TypeModel: IModel = {
  ...base("sys.type", "TypeModel", "trellis.type"),
  primaryField: "id",
  fields: [
    { name: "id", type: "uuid", store: true, primary: true },
    { name: "name", type: "string", store: true },
    { name: "namespace", type: "string", store: true },
    { name: "displayName", type: "string", store: true },
    { name: "logicalType", type: "string", store: true },
  ],
  functions: [],
};

/**
 * I18nModel：描述国际化条目。
 * displayName 是国际化 key，多语言文本由本模型承载。
 */
export const I18nModel: IModel = {
  ...base("sys.i18n", "I18nModel", "trellis.i18n"),
  primaryField: "id",
  fields: [
    { name: "id", type: "uuid", store: true, primary: true },
    { name: "key", type: "string", store: true },
    { name: "locale", type: "string", store: true },
    { name: "value", type: "string", store: true },
  ],
  functions: [],
};

/** 全部系统模型 */
export const SYSTEM_MODELS: readonly IModel[] = [ModelModel, FieldModel, FunctionModel, TypeModel, I18nModel];
