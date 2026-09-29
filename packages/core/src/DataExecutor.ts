import type { IModel } from "./IModel.js";
import type { IField, IEnumField } from "./IField.js";
import type {
  IStore,
  IQueryCondition,
  IQueryOption,
  IQueryResult,
} from "./IStore.js";
import type {
  ISchema,
  IObjectSchema,
  IArraySchema,
  ISchemaShape,
} from "./ISchema.js";
import { resolveShape, shapeForFieldType } from "./ISchema.js";
import type { ModelRegistry } from "./ModelRegistry.js";

type Row = Record<string, unknown>;

/** 复杂字段（关系字段）类型集合。 */
function isRelationFieldType(type: IField["type"]): boolean {
  return (
    type === "one2many" ||
    type === "many2one" ||
    type === "one2one" ||
    type === "many2many"
  );
}

/**
 * DataExecutor：基于 Model 元数据 + ISchema 的通用数据访问层。
 *
 * - 构造注入 ModelRegistry（内部取其 store 做物理读写）。
 * - 本版实现 **query**：按 schema 递归装配关联数据（对象 → O2O/M2O 单记录、
 *   数组 → M2M/O2M 多记录）。schema 是返回结构描述，也是递归导航依据。
 * - **分页按 model 分键**：schema 描述不了嵌套集合的分页，因此 options 是
 *   `{ <model.id>: <option> }` 集合——每层嵌套 model 各自独立分页（如 orders
 *   数组用 `options["biz.order"]` 分页）。缺省的嵌套层不设分页上限（全量取）。
 * - 级联写入（createOne/updateOne/deleteOne）与事务留待后续。
 */
export class DataExecutor {
  private registry: ModelRegistry;

  constructor(registry: ModelRegistry) {
    this.registry = registry;
  }

  /**
   * 按 schema 查询：先查第一层 records，再按 schema 递归装配关联字段。
   * 返回结构与 schema 一一对应（schema 中声明的字段才出现在结果里）。
   *
   * options 按 model 分键（`{ <model.id>: { limit, offset } }`）：
   * - 顶层 model 用 `options[modelId]`；无则全量。
   * - 嵌套（object/array）对侧 model 用 `options[对侧 model id]`。
   */
  async query(
    modelId: string,
    schema: ISchema,
    condition?: IQueryCondition<Row>,
    options?: Record<string, IQueryOption>,
  ): Promise<IQueryResult<Row>> {
    const store = this.getStore();
    const model = await this.getModelOrThrow(modelId);
    // 形状一致性校验：schema 顶层结构必须与 Model 匹配
    await this.assertShape(model, schema);
    const result = await store.query(modelId, condition, options?.[modelId]);
    return {
      total: result.total,
      data: await Promise.all(
        result.data.map((row) => this.assembleRow(model, schema, row, options)),
      ),
    };
  }

  /** 装配一行：按 schema 逐字段处理，简单字段直取，对象/数组字段递归查询对侧。 */
  private async assembleRow(
    model: IModel,
    schema: ISchema,
    row: Row,
    options?: Record<string, IQueryOption>,
  ): Promise<Row> {
    const out: Row = {};
    const entries = schema.type === "object" ? Object.entries(schema.properties) : [];
    for (const [fieldName, fieldSchema] of entries) {
      const field = model.fields.find((f) => f.name === fieldName);
      // 形状校验已保证 field 存在且 shape 匹配（本字段只可能是简单/枚举/关系）
      if (!field || fieldSchema.type === "object" || fieldSchema.type === "array") continue;
      out[fieldName] = row[fieldName];
    }
    for (const [fieldName, fieldSchema] of entries) {
      const field = model.fields.find((f) => f.name === fieldName);
      if (!field) continue;
      if (fieldSchema.type === "object") {
        out[fieldName] = await this.assembleObject(model, field, fieldSchema, row, options);
      } else if (fieldSchema.type === "array") {
        out[fieldName] = await this.assembleArray(model, field, fieldSchema, row, options);
      }
    }
    return out;
  }

  /** 对象字段：M2O 直查对侧单记录；O2O 经中间表两跳。 */
  private async assembleObject(
    model: IModel,
    field: IField,
    schema: IObjectSchema,
    row: Row,
    options?: Record<string, IQueryOption>,
  ): Promise<Row | null> {
    // 形状校验已保证 field 为关系类型（one2one/many2one/one2many/many2many）
    if (!isRelationFieldType(field.type)) return null;
    const pkValue = row[model.primaryField];
    const refModelId = (field as IComplexLike).referenceModel;
    const refModel = await this.getModelOrThrow(refModelId);
    const refRow =
      field.type === "one2one"
        ? await this.fetchViaAssociation(field, pkValue, refModel.primaryField, 1)
        : await this.fetchDirect(field, row, options, 1);
    const refRow0 = refRow[0];
    if (!refRow0) return null;
    return this.assembleRow(refModel, schema, refRow0, options);
  }

  /** 数组字段：O2M 直查对侧多记录；M2M 经中间表两跳。 */
  private async assembleArray(
    model: IModel,
    field: IField,
    schema: IArraySchema,
    row: Row,
    options?: Record<string, IQueryOption>,
  ): Promise<Row[]> {
    if (!isRelationFieldType(field.type)) return [];
    const pkValue = row[model.primaryField];
    const refModel = await this.getModelOrThrow((field as IComplexLike).referenceModel);
    const rows =
      field.type === "many2many"
        ? await this.fetchViaAssociation(field, pkValue, refModel.primaryField)
        : await this.fetchDirect(field, row, options);
    return Promise.all(
      rows.map((r) => this.assembleRow(refModel, schema.items, r, options)),
    );
  }

  /** 直连关系（M2O/O2M）：对侧 referenceField = 本行 relationField 值。 */
  private async fetchDirect(
    field: IField,
    row: Row,
    options?: Record<string, IQueryOption>,
    limit?: number,
  ): Promise<Row[]> {
    const store = this.getStore();
    const rel = field as IComplexLike;
    const cond: IQueryCondition<Row> = {
      [rel.referenceField]: row[rel.relationField],
    };
    const res = await store.query(rel.referenceModel, cond, options?.[rel.referenceModel] ?? { limit: limit ?? 1000, offset: 0 });
    return res.data;
  }

  /**
   * 中间表关系（O2O/M2M）：两跳查询。
   * 本行主键值 pkValue → 中间表 associationModel 查 relationField 匹配的关联行
   * → 取 referenceField 值 → 对侧 referenceModel 主键查询。
   */
  private async fetchViaAssociation(
    field: IField,
    pkValue: unknown,
    refPkField: string,
    limit?: number,
  ): Promise<Row[]> {
    const store = this.getStore();
    const rel = field as IRelationLike;
    // 1. 中间表：本行主键值 = 关联行 relationField（relationField 是中间表指向本侧的列）
    const assocCond: IQueryCondition<Row> = {
      [rel.relationField]: pkValue,
    };
    const assocRes = await store.query(rel.associationModel, assocCond, { limit: 10000, offset: 0 });
    // 2. 中间表 referenceField 值 = 对侧主键（referenceField 是中间表指向对侧的列）
    const refValues = assocRes.data
      .map((a) => a[rel.referenceField])
      .filter((v): v is string | number => typeof v === "string" || typeof v === "number");
    if (refValues.length === 0) return [];
    // 3. 对侧：主键 ∈ 关联值集合（逐值等值查询，避免构造 IN 依赖 store 能力）
    const out: Row[] = [];
    for (const v of refValues) {
      const pkCond: IQueryCondition<Row> = { [refPkField]: v };
      const res = await store.query(rel.referenceModel, pkCond, { limit: 1, offset: 0 });
      if (res.data[0]) out.push(res.data[0]);
    }
    return out;
  }

  /** 形状一致性校验：schema 顶层结构必须与 Model 定义匹配（类型/字段存在性）。 */
  private async assertShape(model: IModel, schema: ISchema): Promise<void> {
    if (schema.type !== "object") {
      throw new Error(
        `Schema shape mismatch: model "${model.id}" requires object schema at top level, got "${schema.type}"`,
      );
    }
    for (const [name, fieldSchema] of Object.entries(schema.properties)) {
      const field = model.fields.find((f) => f.name === name);
      if (!field) {
        throw new Error(`Schema shape mismatch: field "${name}" not found in model "${model.id}"`);
      }
      const expected = shapeForFieldType(field.type);
      const actual = resolveShape(fieldSchema);
      if (expected !== actual) {
        throw new Error(
          `Schema shape mismatch: field "${model.id}.${name}" expects shape "${expected}", got "${actual}"`,
        );
      }
    }
  }

  private async getModelOrThrow(id: string): Promise<IModel> {
    const model = await this.registry.getModel(id);
    if (!model) throw new Error(`Model not found: ${id}`);
    return model;
  }

  private getStore(): IStore {
    const store = this.registry.getStore();
    if (!store) throw new Error("DataExecutor requires a store (ModelRegistry without store)");
    return store;
  }
}

/** 关系字段的最小结构（避免依赖 IComplexField 判别式收窄）。 */
interface IComplexLike {
  referenceModel: string;
  referenceField: string;
  relationField: string;
}

/** 中间表关系字段（O2O/M2M，额外带 associationModel）。 */
interface IRelationLike extends IComplexLike {
  associationModel: string;
}
