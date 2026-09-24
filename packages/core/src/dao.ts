/**
 * 元数据 DAO 层。
 * 基于 Model 元数据封装基本数据操作：
 * create / update / delete / queryOne / queryList / queryPage。
 * 参数与返回均为 Record<string, unknown>（不含复杂字段，复杂字段由聚合返回）。
 */

import { randomUUID } from "node:crypto";

import { Registry } from "./registry.js";
import type { DataSource, DataRow, Filter } from "./data-source.js";
import { QueryEngine, type QueryOptions } from "./query-engine.js";
import type { TypeRegistry } from "./type-mapping.js";
import { cleanStoredRow } from "./type-mapping.js";
import type { IField } from "./types/field.js";
import { DaoError } from "./dao-error.js";
import { applyNode } from "./cascade.js";
import type { ISchema } from "./types/schema.js";

/** 分页结果 */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export class Dao {
  constructor(
    private readonly registry: Registry,
    private readonly dataSource: DataSource,
    private readonly types: TypeRegistry,
  ) {}

  /** 创建：校验 + 清洗落库，返回清洗后的物理记录 */
  async create(modelId: string, record: Record<string, unknown>): Promise<Record<string, unknown>> {
    const model = this.requireModel(modelId);
    const row = this.prepareRow(model, record, true);
    await this.dataSource.put(modelId, row);
    return row;
  }

  /**
   * 更新：update({...record, $delete: true}) 表示删除（delete from xxx where id = record.id）。
   * record 须含主键。普通更新为部分更新（未提供的物理字段保留原值）。
   */
  async update(modelId: string, record: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
    const model = this.requireModel(modelId);
    const primaryField = model.primaryField;
    const id = record[primaryField];
    if (id === undefined || id === null) {
      throw new DaoError(`更新 ${model.name} 需要提供主键 '${primaryField}'`);
    }
    const idStr = String(id);

    // $delete 标记：删除视作一次特殊的 update
    if (record["$delete"] === true) {
      await this.dataSource.delete(modelId, idStr);
      return undefined;
    }

    const existing = await this.dataSource.get(modelId, idStr);
    if (!existing) return undefined;
    const merged: Record<string, unknown> = { ...existing, ...record, [primaryField]: id };
    delete merged["$delete"]; // 特殊标记不落库
    const row = this.prepareRow(model, merged, false);
    await this.dataSource.put(modelId, row);
    return row;
  }

  /** 删除 */
  async delete(modelId: string, id: string): Promise<void> {
    this.requireModel(modelId);
    await this.dataSource.delete(modelId, id);
  }

  /** 按主键查询（聚合复杂字段） */
  async queryOne(modelId: string, id: string, options?: QueryOptions): Promise<Record<string, unknown> | undefined> {
    this.requireModel(modelId);
    return this.engine().query(modelId, id, options);
  }

  /** 条件查询（逐行聚合） */
  async queryList(modelId: string, filter?: Filter, options?: QueryOptions): Promise<Record<string, unknown>[]> {
    this.requireModel(modelId);
    const rows = filter ? await this.dataSource.query(modelId, filter) : await this.dataSource.list(modelId);
    const engine = this.engine();
    return Promise.all(rows.map((r) => engine.aggregateByRow(modelId, r, options)));
  }

  /** 分页查询（逐行聚合） */
  async queryPage(
    modelId: string,
    filter: Filter | undefined,
    page: number,
    size: number,
    options?: QueryOptions,
  ): Promise<Page<Record<string, unknown>>> {
    this.requireModel(modelId);
    const all = filter ? await this.dataSource.query(modelId, filter) : await this.dataSource.list(modelId);
    const total = all.length;
    const start = (page - 1) * size;
    const slice = all.slice(start, start + size);
    const engine = this.engine();
    const items = await Promise.all(slice.map((r) => engine.aggregateByRow(modelId, r, options)));
    return { items, total, page, size };
  }

  /**
   * 级联写入（事务）：依据 model（描述 record 结构）解析 record，
   * 推导出所有 create/update/delete（含关系/中间表维护），
   * 作为一个事务原子应用；成功后按 schema（返回形状）查询返回。
   *
   * - record 顶层：无主键 → create，有主键 → update，$delete:true → 删除
   * - 嵌套单对象（M2O/O2O）：级联 upsert 对侧并关联
   * - 嵌套数组（O2M/M2M）：元素无主键 create / 有主键 update / $delete 删除并解除关联
   */
  async applyRecord(
    modelId: string,
    schema: ISchema,
    record: Record<string, unknown>,
    options?: QueryOptions,
  ): Promise<Record<string, unknown>> {
    const model = this.requireModel(modelId);
    const primaryField = model.primaryField;

    // 事务内应用级联写入，拿到顶层主键
    let resultId = "";
    await this.dataSource.withTransaction(async (tx) => {
      resultId = await applyNode(this.registry, tx, this.types, modelId, record);
    });

    // 顶层 $delete：删除无返回数据
    if (record["$delete"] === true) return {};

    const engine = this.engine();
    const result = await engine.queryBySchema(modelId, resultId, schema, options);
    if (!result) return {};
    return result;
  }

  private engine(): QueryEngine {
    return new QueryEngine(this.registry, this.dataSource, this.types);
  }

  private requireModel(modelId: string) {
    const model = this.registry.getById(modelId);
    if (!model) throw new DaoError(`模型 '${modelId}' 未注册`);
    return model;
  }

  /**
   * 准备落库行：
   * - 主键缺失且类型为 uuid 时自动生成
   * - 清洗：剔除复杂字段（store=false），物理字段按逻辑类型校验
   */
  private prepareRow(
    model: ReturnType<Dao["requireModel"]>,
    data: Record<string, unknown>,
    isCreate: boolean,
  ): DataRow {
    const primaryField = model.primaryField;
    const primary = model.fields.find((f: IField) => f.name === primaryField);
    const row: Record<string, unknown> = { ...data };

    // 主键处理
    if (isCreate && (row[primaryField] === undefined || row[primaryField] === null)) {
      if (primary?.type === "uuid") {
        row[primaryField] = randomUUID();
      } else {
        throw new DaoError(`创建 ${model.name} 需要提供主键 '${primaryField}'`);
      }
    }
    if (row[primaryField] === undefined || row[primaryField] === null) {
      throw new DaoError(`主键 '${primaryField}' 不能为空`);
    }

    // 清洗：仅保留物理字段并校验逻辑类型
    return cleanStoredRow(model, row, this.types);
  }
}
