import type { IModel } from "../IModel.js";

/**
 * 系统自举表：元数据自身的容器（**真实表**，非 virtual）。
 *
 * - 表结构与初始行由 ModelRegistry 启动时硬编码建表 + seed（见 ModelRegistry.ensureSystemTables），
 *   之后完全自举：运行时一切查询从 store 读系统表，代码里的 sysModels 仅作初始种子。
 * - 五张表：
 *   - sys.model：数据模型元数据（自身也自举描述）。
 *   - sys.field：字段元数据，namespace = 所属 model 的 id（如 "sys.user"），
 *     id 点分 = "sys.user.username"——字段行天然挂在 model 下。
 *   - sys.function：Function 元数据，namespace = 所属 model 的 id，id 点分 = "sys.user.login"。
 *   - sys.enum_item：枚举项，namespace = 所属 field 的 id（如 "sys.user.status"）。
 *   - sys.function_edge：Function 的边（每行一条 IFunctionEdge），namespace = 所属 function 的 id。
 *
 * store 标记：简单字段默认落库（store=true，不标）；仅关系字段（functions/edges/items）
 * store=false（不落库，纯逻辑导航）。
 */
export const sysModels: IModel[] = [
  {
    id: "sys.model",
    namespace: "sys",
    name: "model",
    primaryField: "id",
    virtual: false,
    functions: [],
    fields: [
      { id: "sys.model.id", namespace: "sys.model", name: "id", type: "string" },
      { id: "sys.model.namespace", namespace: "sys.model", name: "namespace", type: "string" },
      { id: "sys.model.name", namespace: "sys.model", name: "name", type: "string" },
      { id: "sys.model.displayName", namespace: "sys.model", name: "displayName", type: "string" },
      { id: "sys.model.primaryField", namespace: "sys.model", name: "primaryField", type: "string" },
      { id: "sys.model.virtual", namespace: "sys.model", name: "virtual", type: "boolean" },
      {
        id: "sys.model.functions",
        namespace: "sys.model",
        name: "functions",
        type: "one2many",
        relationField: "namespace",
        referenceField: "namespace",
        referenceModel: "sys.function",
        store: false,
      },
    ],
  },
  {
    id: "sys.field",
    namespace: "sys",
    name: "field",
    primaryField: "id",
    virtual: false,
    functions: [],
    fields: [
      { id: "sys.field.id", namespace: "sys.field", name: "id", type: "string" },
      { id: "sys.field.namespace", namespace: "sys.field", name: "namespace", type: "string" },
      { id: "sys.field.name", namespace: "sys.field", name: "name", type: "string" },
      { id: "sys.field.displayName", namespace: "sys.field", name: "displayName", type: "string" },
      {
        id: "sys.field.type",
        namespace: "sys.field",
        name: "type",
        type: "enum",
        items: [
          { id: "sys.field.type.string", namespace: "sys.field.type", name: "string", value: "string" },
          { id: "sys.field.type.integer", namespace: "sys.field.type", name: "integer", value: "integer" },
          { id: "sys.field.type.floating", namespace: "sys.field.type", name: "floating", value: "floating" },
          { id: "sys.field.type.boolean", namespace: "sys.field.type", name: "boolean", value: "boolean" },
          { id: "sys.field.type.text", namespace: "sys.field.type", name: "text", value: "text" },
          { id: "sys.field.type.enum", namespace: "sys.field.type", name: "enum", value: "enum" },
          { id: "sys.field.type.one2many", namespace: "sys.field.type", name: "one2many", value: "one2many" },
          { id: "sys.field.type.many2one", namespace: "sys.field.type", name: "many2one", value: "many2one" },
          { id: "sys.field.type.one2one", namespace: "sys.field.type", name: "one2one", value: "one2one" },
          { id: "sys.field.type.many2many", namespace: "sys.field.type", name: "many2many", value: "many2many" },
        ],
      },
      { id: "sys.field.store", namespace: "sys.field", name: "store", type: "boolean" },
      { id: "sys.field.array", namespace: "sys.field", name: "array", type: "boolean" },
      { id: "sys.field.relationField", namespace: "sys.field", name: "relationField", type: "string" },
      { id: "sys.field.referenceField", namespace: "sys.field", name: "referenceField", type: "string" },
      { id: "sys.field.referenceModel", namespace: "sys.field", name: "referenceModel", type: "string" },
      { id: "sys.field.associationModel", namespace: "sys.field", name: "associationModel", type: "string" },
      {
        id: "sys.field.items",
        namespace: "sys.field",
        name: "items",
        type: "one2many",
        relationField: "namespace",
        referenceField: "namespace",
        referenceModel: "sys.enum_item",
        store: false,
      },
    ],
  },
  {
    id: "sys.function",
    namespace: "sys",
    name: "function",
    primaryField: "id",
    virtual: false,
    functions: [],
    fields: [
      { id: "sys.function.id", namespace: "sys.function", name: "id", type: "string" },
      { id: "sys.function.namespace", namespace: "sys.function", name: "namespace", type: "string" },
      { id: "sys.function.name", namespace: "sys.function", name: "name", type: "string" },
      { id: "sys.function.displayName", namespace: "sys.function", name: "displayName", type: "string" },
      { id: "sys.function.local", namespace: "sys.function", name: "local", type: "boolean" },
      { id: "sys.function.entry", namespace: "sys.function", name: "entry", type: "string" },
      { id: "sys.function.output", namespace: "sys.function", name: "output", type: "string" },
      {
        id: "sys.function.edges",
        namespace: "sys.function",
        name: "edges",
        type: "one2many",
        relationField: "namespace",
        referenceField: "namespace",
        referenceModel: "sys.function_edge",
        store: false,
      },
    ],
  },
  {
    id: "sys.enum_item",
    namespace: "sys",
    name: "enum_item",
    primaryField: "id",
    virtual: false,
    functions: [],
    fields: [
      { id: "sys.enum_item.id", namespace: "sys.enum_item", name: "id", type: "string" },
      { id: "sys.enum_item.namespace", namespace: "sys.enum_item", name: "namespace", type: "string" },
      { id: "sys.enum_item.name", namespace: "sys.enum_item", name: "name", type: "string" },
      { id: "sys.enum_item.displayName", namespace: "sys.enum_item", name: "displayName", type: "string" },
      { id: "sys.enum_item.value", namespace: "sys.enum_item", name: "value", type: "string" },
    ],
  },
  {
    id: "sys.function_edge",
    namespace: "sys",
    name: "function_edge",
    primaryField: "id",
    virtual: false,
    functions: [],
    fields: [
      { id: "sys.function_edge.id", namespace: "sys.function_edge", name: "id", type: "string" },
      { id: "sys.function_edge.namespace", namespace: "sys.function_edge", name: "namespace", type: "string" },
      { id: "sys.function_edge.name", namespace: "sys.function_edge", name: "name", type: "string" },
      { id: "sys.function_edge.displayName", namespace: "sys.function_edge", name: "displayName", type: "string" },
      { id: "sys.function_edge.fromNode", namespace: "sys.function_edge", name: "fromNode", type: "string" },
      { id: "sys.function_edge.fromField", namespace: "sys.function_edge", name: "fromField", type: "string" },
      { id: "sys.function_edge.toNode", namespace: "sys.function_edge", name: "toNode", type: "string" },
      { id: "sys.function_edge.toField", namespace: "sys.function_edge", name: "toField", type: "string" },
      { id: "sys.function_edge.constant", namespace: "sys.function_edge", name: "constant", type: "text" },
    ],
  },
];
