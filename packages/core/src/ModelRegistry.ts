import type { IModel } from "./IModel.js";
import type { IField, IRelationField } from "./IField.js";
import type { IColumn, IStore, IQueryCondition, ITable } from "./IStore.js";
import { sysModels } from "./models/sysModels.js";

type Row = Record<string, unknown>;

/** 关系字段（one2one/many2many 带 associationModel）类型守卫。 */
function isRelationField(f: IField): f is IRelationField {
  return f.type === "one2one" || f.type === "many2many";
}

/** IModel.fields → IColumn[]：关系字段（store:false）不落库；array 统一 string 列。 */
function fieldsToColumns(fields: IField[]): IColumn[] {
  const columns: IColumn[] = [];
  for (const f of fields) {
    if (f.store === false) continue;
    if (f.array) {
      columns.push({ name: f.name, type: "string" });
    } else if (f.type === "enum") {
      columns.push({ name: f.name, type: "enum" });
    } else if (
      f.type === "string" ||
      f.type === "integer" ||
      f.type === "floating" ||
      f.type === "boolean" ||
      f.type === "text"
    ) {
      columns.push({ name: f.name, type: f.type });
    }
  }
  return columns;
}

/** IModel → 五张系统表的行（seed 初始数据用）。 */
function serializeModel(model: IModel): {
  model: Row;
  fields: Row[];
  functions: Row[];
  edges: Row[];
  enumItems: Row[];
} {
  const modelRow: Row = {
    id: model.id,
    namespace: model.namespace,
    name: model.name,
    displayName: model.displayName,
    primaryField: model.primaryField,
    virtual: model.virtual ?? false,
  };
  const fields: Row[] = [];
  const enumItems: Row[] = [];
  for (const f of model.fields) {
    const row: Row = {
      id: f.id,
      namespace: f.namespace,
      name: f.name,
      displayName: f.displayName,
      type: f.type,
    };
    if (
      f.type === "one2one" ||
      f.type === "many2many" ||
      f.type === "one2many" ||
      f.type === "many2one"
    ) {
      row.store = false;
      row.relationField = f.relationField;
      row.referenceField = f.referenceField;
      row.referenceModel = f.referenceModel;
      if (isRelationField(f)) {
        row.associationModel = f.associationModel;
      }
    } else {
      row.store = f.store ?? true;
      row.array = f.array ?? false;
    }
    fields.push(row);
    if (f.type === "enum") {
      for (const item of f.items) {
        enumItems.push({
          id: item.id,
          namespace: item.namespace,
          name: item.name,
          displayName: item.displayName,
          value: item.value,
        });
      }
    }
  }
  const functions: Row[] = [];
  const edges: Row[] = [];
  for (const fn of model.functions) {
    functions.push({
      id: fn.id,
      namespace: fn.namespace,
      name: fn.name,
      displayName: fn.displayName,
      local: fn.local ?? false,
      entry: fn.entry,
      output: fn.output,
    });
    for (const edge of fn.edges) {
      edges.push({
        id: edge.id,
        namespace: edge.namespace,
        name: edge.name,
        displayName: edge.displayName,
        fromNode: edge.fromNode,
        fromField: edge.fromField,
        toNode: edge.toNode,
        toField: edge.toField,
        // constant 以 text 存 JSON 字符串
        constant: edge.constant === undefined ? undefined : JSON.stringify(edge.constant),
      });
    }
  }
  return { model: modelRow, fields, functions, edges, enumItems };
}

/**
 * ModelRegistry：Model 元数据的注册与查询。
 *
 * 注册来源：
 * - virtual = true 的 model：**直接注册进内存，长期持有**（绑定 class 的 native model，
 *   不入库）。
 * - 非 virtual 的 model：**不常驻内存**——物理表是权威，每次 getModel 从注入的
 *   IStore 查询并装配。无 store 时非 virtual 不可查（返回 undefined）。
 *
 * 系统自举表（五张 sys 表）是**真实表**：构造时（首次查询前）调用 ensureSystemTables
 * 硬编码建表 + seed 初始行（表结构与初始数据来自 sysModels 元数据），之后完全自举——
 * 运行时一切查询从 store 读系统表，内存不持有系统表。
 *
 * 装配（本阶段扁平装载，不做 schema 递归聚合——那是数据 CRUD 引擎的事）：
 * getModel(id) 查到 sys.model 行后，按 namespace 点分关系取字段/函数/边/枚举项，
 * 组装成完整 IModel 返回。
 */
export interface ModelRegistryOptions {
  store?: IStore;
  /** true 时不建五张系统自举表（不做 ensureSystemTables，systemIds 也为空）。 */
  disableDefaultModels?: boolean;
}

export class ModelRegistry {
  private models = new Map<string, IModel>();
  private store?: IStore;
  private systemIds: Set<string>;
  /** ensureSystemTables 的惰性执行（幂等，仅首次真正执行）。 */
  private sysTablesReady?: Promise<void>;

  constructor(options: ModelRegistryOptions = {}) {
    this.store = options.store;
    this.systemIds = new Set();
    if (!options.disableDefaultModels) {
      for (const model of sysModels) {
        this.systemIds.add(model.id);
      }
    }
  }

  /** 系统自举表 id（sysModels 内置的五张表）。 */
  isSystemModel(id: string): boolean {
    return this.systemIds.has(id);
  }

  /**
   * 注册 model。
   * - virtual：存入内存（常驻），重复注册报错。
   * - 非 virtual：只校验 id/namespace/name 一致性，**不登记也不缓存**——store 是权威，
   *   getModel 每次从 store 查。理由：热重启时数据库已有数据，Registry 内存没有登记
   *   记录，若依赖「先注册才能查」会查不到已存在的 model。
   */
  registerModel(model: IModel): void {
    const expected = model.namespace ? `${model.namespace}.${model.name}` : model.name;
    if (model.id !== expected) {
      throw new Error(
        `Model id mismatch: expected "${expected}" (namespace + "." + name), got "${model.id}"`,
      );
    }
    if (model.virtual) {
      if (this.models.has(model.id)) {
        throw new Error(`Duplicate model registration: ${model.id}`);
      }
      this.models.set(model.id, model);
    }
  }

  /** 仅移除 virtual 内存持有；系统表/非 virtual 由 store 权威，不受影响。 */
  unregisterModel(id: string): void {
    this.models.delete(id);
    this.systemIds.delete(id);
  }

  async getModel(id: string): Promise<IModel | undefined> {
    await this.ensureSystemTables();
    const cached = this.models.get(id);
    if (cached) return cached;
    // 非 virtual（未缓存）：从 store 查询装配；无 store 则不可查
    return this.loadFromStore(id);
  }

  async hasModel(id: string): Promise<boolean> {
    return (await this.getModel(id)) !== undefined;
  }

  async listModels(): Promise<IModel[]> {
    await this.ensureSystemTables();
    const result: IModel[] = [...this.models.values()];
    if (!this.store) return result;
    // 非 virtual：全量查 sys.model（含系统表行，自举后系统表本身也在此列出）
    const query = await this.store.query("sys.model", undefined, { limit: 10000, offset: 0 });
    for (const row of query.data) {
      const id = row.id as string;
      if (!id || this.models.has(id)) continue;
      const model = await this.loadFromStore(id);
      if (model) result.push(model);
    }
    return result;
  }

  // —— 系统自举表 ——

  /** 确保五张系统表已建表 + seed（惰性幂等，仅首次执行）。 */
  private ensureSystemTables(): Promise<void> {
    if (!this.store) return Promise.resolve();
    if (!this.sysTablesReady) {
      this.sysTablesReady = this.doEnsureSystemTables().catch((err) => {
        this.sysTablesReady = undefined; // 失败允许下次重试
        throw err;
      });
    }
    return this.sysTablesReady;
  }

  private async doEnsureSystemTables(): Promise<void> {
    const store = this.store;
    if (!store) return;
    // 1. 建表（CreateOrUpdate 语义：存在则跳过）
    for (const model of sysModels) {
      let existing: ITable | undefined;
      try {
        existing = await store.getTable(model.id);
      } catch {
        existing = undefined;
      }
      if (!existing) {
        await store.createTable(model.id, fieldsToColumns(model.fields), model.primaryField);
      }
    }
    // 2. seed 初始行（每张表独立判断空——热重启已有数据则跳过）
    const byTable = new Map<string, Row[]>();
    for (const model of sysModels) {
      const s = serializeModel(model);
      const push = (table: string, rows: Row[]) => {
        const list = byTable.get(table) ?? [];
        list.push(...rows);
        byTable.set(table, list);
      };
      push("sys.model", [s.model]);
      push("sys.field", s.fields);
      push("sys.function", s.functions);
      push("sys.function_edge", s.edges);
      push("sys.enum_item", s.enumItems);
    }
    for (const [table, rows] of byTable) {
      if (rows.length === 0) continue;
      const { total } = await store.query(table, undefined, { limit: 1, offset: 0 });
      if (total > 0) continue;
      for (const row of rows) {
        await store.createOne(table, row);
      }
    }
  }

  // —— 装配 ——

  /** 从 store 装配一个非 virtual model。 */
  private async loadFromStore(id: string): Promise<IModel | undefined> {
    const store = this.store;
    if (!store) return undefined;
    const cond = { id } as IQueryCondition<Record<string, unknown>>;
    const row = (await store.query("sys.model", cond, { limit: 1, offset: 0 })).data[0];
    if (!row) return undefined;

    const fields = await this.loadFields(store, id);
    const functions = await this.loadFunctions(store, id);

    return {
      id: row.id as string,
      namespace: row.namespace as string,
      name: row.name as string,
      displayName: row.displayName as string | undefined,
      primaryField: row.primaryField as string,
      virtual: row.virtual as boolean | undefined,
      fields,
      functions,
    };
  }

  /** 装配字段：sys.field 按 namespace = model id 查；enum 字段挂 items。 */
  private async loadFields(
    store: IStore,
    modelId: string,
  ): Promise<IField[]> {
    const cond = { namespace: modelId } as IQueryCondition<Record<string, unknown>>;
    const rows = (await store.query("sys.field", cond, { limit: 10000, offset: 0 })).data;
    const fields: IField[] = [];
    for (const row of rows) {
      const type = row.type as IField["type"];
      const base = {
        id: row.id as string,
        namespace: row.namespace as string,
        name: row.name as string,
        displayName: row.displayName as string | undefined,
        type,
        store: row.store as boolean | undefined,
        array: row.array as boolean | undefined,
      };
      if (type === "enum") {
        const itemsCond = { namespace: row.id } as IQueryCondition<Record<string, unknown>>;
        const items = (
          await store.query("sys.enum_item", itemsCond, { limit: 10000, offset: 0 })
        ).data.map((r) => ({
          id: r.id as string,
          namespace: r.namespace as string,
          name: r.name as string,
          displayName: r.displayName as string | undefined,
          value: r.value as string | undefined,
        }));
        fields.push({ ...base, type: "enum", items });
      } else if (
        type === "one2many" ||
        type === "many2one" ||
        type === "one2one" ||
        type === "many2many"
      ) {
        const complex = {
          ...base,
          type,
          relationField: row.relationField as string,
          referenceField: row.referenceField as string,
          referenceModel: row.referenceModel as string,
          store: false as const,
        };
        if (type === "one2one" || type === "many2many") {
          fields.push({
            ...complex,
            type,
            associationModel: row.associationModel as string,
          });
        } else {
          fields.push(complex);
        }
      } else {
        fields.push({ ...base, type: type as "string" | "integer" | "floating" | "boolean" | "text" });
      }
    }
    return fields;
  }

  /** 装配函数：sys.function 按 namespace = model id 查；每函数挂 edges。 */
  private async loadFunctions(
    store: IStore,
    modelId: string,
  ): Promise<IModel["functions"]> {
    const cond = { namespace: modelId } as IQueryCondition<Record<string, unknown>>;
    const rows = (await store.query("sys.function", cond, { limit: 10000, offset: 0 })).data;
    const functions: IModel["functions"] = [];
    for (const row of rows) {
      const fnId = row.id as string;
      const edgesCond = { namespace: fnId } as IQueryCondition<Record<string, unknown>>;
      const edgeRows = (
        await store.query("sys.function_edge", edgesCond, { limit: 10000, offset: 0 })
      ).data;
      const edges = edgeRows.map((r) => ({
        id: r.id as string,
        namespace: r.namespace as string,
        name: r.name as string,
        displayName: r.displayName as string | undefined,
        fromNode: r.fromNode as string,
        fromField: r.fromField as string,
        toNode: r.toNode as string,
        toField: r.toField as string,
        // constant 以 text 存 JSON 字符串，装配时反序列化
        constant:
          typeof r.constant === "string" && r.constant.length > 0
            ? (JSON.parse(r.constant) as unknown)
            : undefined,
      }));
      functions.push({
        id: fnId,
        namespace: row.namespace as string,
        name: row.name as string,
        displayName: row.displayName as string | undefined,
        local: row.local as boolean | undefined,
        entry: row.entry as string,
        output: row.output as string,
        edges,
      });
    }
    return functions;
  }
}
