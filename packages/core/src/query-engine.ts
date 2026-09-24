/**
 * 查询聚合引擎（阶段 2 核心价值）。
 * 按 Model 定义递归遍历复杂字段（O2O/O2M/M2O/M2M），
 * 聚合关联数据；复杂字段物理不存在，由上层递归聚合返回。
 * 临时措施：直接内存/JSON 遍历（T3），后续基于存储适配器优化。
 */

import type { IModel } from "./types/model.js";
import type { IField } from "./types/field.js";
import { isRelationType } from "./types/field.js";
import type { ISchema, SchemaNode } from "./types/schema.js";
import { Registry } from "./registry.js";
import type { DataSource, DataRow } from "./data-source.js";
import { navigate, RelationError, type Navigation } from "./relation.js";
import type { TypeRegistry } from "./type-mapping.js";
import { cleanStoredRow } from "./type-mapping.js";

export interface QueryOptions {
  /** 最大递归深度（防循环引用），默认 5 */
  maxDepth?: number;
  /** 聚合时是否包含复杂字段本身（默认 true） */
  includeRelations?: boolean;
}

/** 当前聚合路径上的 (modelId, id)，用于循环引用防护 */
type VisitKey = string;

function visitKey(modelId: string, id: unknown): VisitKey {
  return `${modelId}:${String(id)}`;
}

export class QueryEngine {
  constructor(
    private readonly registry: Registry,
    private readonly dataSource: DataSource,
    private readonly types: TypeRegistry,
  ) {}

  /** 按主键查询并聚合 */
  async query(modelId: string, id: string, options: QueryOptions = {}): Promise<DataRow | undefined> {
    const model = this.registry.getById(modelId);
    if (!model) throw new RelationError(`模型 '${modelId}' 未注册`);
    const row = await this.dataSource.get(modelId, id);
    if (!row) return undefined;
    return this.aggregateByRow(modelId, row, options);
  }

  /**
   * 按 schema 形状查询：schema 描述返回结构（白名单），
   * 未列出的物理字段不返回；列出的关系字段按子形状递归聚合。
   * 目标模型由当前 model 的关系字段元数据（relatedModelId 等）补齐。
   */
  async queryBySchema(modelId: string, id: string, schema: ISchema, options: QueryOptions = {}): Promise<DataRow | undefined> {
    const model = this.registry.getById(modelId);
    if (!model) throw new RelationError(`模型 '${modelId}' 未注册`);
    const row = await this.dataSource.get(modelId, id);
    if (!row) return undefined;
    const visited = new Set<VisitKey>();
    return this.aggregateBySchema(model, row, schema, 0, visited, options);
  }

  /** 按已加载的行聚合（供 DAO 等上层复用，避免二次读数据源） */
  async aggregateByRow(modelId: string, row: DataRow, options: QueryOptions = {}): Promise<DataRow> {
    const model = this.registry.getById(modelId);
    if (!model) throw new RelationError(`模型 '${modelId}' 未注册`);
    const visited = new Set<VisitKey>();
    return this.aggregateRow(model, row, 0, visited, options);
  }

  /** 按 schema 聚合一行：物理字段白名单 + 关系字段按子形状递归 */
  private async aggregateBySchema(
    model: IModel,
    row: DataRow,
    node: SchemaNode,
    depth: number,
    visited: Set<VisitKey>,
    options: QueryOptions,
  ): Promise<DataRow> {
    const maxDepth = options.maxDepth ?? 5;
    const id = row[model.primaryField];
    const out: DataRow = {};

    if (node.type === "array") {
      throw new RelationError(`聚合 '${model.name}' 的根节点不应为数组`);
    }
    if (node.type !== "object") {
      // 标量叶子节点：返回主键即可（对象根节点不应出现）
      return { [model.primaryField]: id };
    }

    // 物理字段白名单裁剪
    for (const [fieldName, childNode] of Object.entries(node.properties)) {
      const field = model.fields.find((f) => f.name === fieldName);
      if (!field) continue;
      const value = row[fieldName];
      if (isRelationType(field.type)) {
        if (options.includeRelations === false) continue;
        if (depth >= maxDepth) continue;
        const key = visitKey(model.id, id);
        if (visited.has(key)) continue;
        visited.add(key);
        try {
          const agg = await this.aggregateRelationBySchema(model, field, row, childNode, depth, visited, options);
          if (agg !== undefined) out[fieldName] = agg;
        } finally {
          visited.delete(key);
        }
      } else if (value !== undefined && value !== null) {
        out[fieldName] = value;
      }
    }
    return out;
  }

  /** 聚合单个复杂字段（按 schema 子形状） */
  private async aggregateRelationBySchema(
    owner: IModel,
    field: IField,
    row: DataRow,
    node: SchemaNode,
    depth: number,
    visited: Set<VisitKey>,
    options: QueryOptions,
  ): Promise<DataRow | DataRow[] | undefined> {
    const relatedModel = this.registry.getById(field.relatedModelId ?? "");
    if (!relatedModel) throw new RelationError(`关系字段 '${field.name}' 的 relatedModelId '${field.relatedModelId}' 未注册`);

    const junctionModel = field.junctionModelId ? this.registry.getById(field.junctionModelId) : undefined;
    if (field.junctionModelId && !junctionModel) {
      throw new RelationError(`关系字段 '${field.name}' 的 junctionModelId '${field.junctionModelId}' 未注册`);
    }

    const nav = navigate(owner, field, relatedModel, junctionModel);
    const relatedRows = await this.collectRows(nav, row);

    // 数组关系节点：子形状为 items；否则对象节点
    const childNode: SchemaNode = node.type === "array" ? node.items : node;

    const aggregated = await Promise.all(
      relatedRows.map((r) => this.aggregateBySchema(relatedModel, r, childNode, depth + 1, visited, options)),
    );

    if (nav.many) return aggregated;
    return aggregated[0];
  }

  /** 聚合一行：只返回物理字段 + 递归聚合复杂字段 */
  private async aggregateRow(
    model: IModel,
    row: DataRow,
    depth: number,
    visited: Set<VisitKey>,
    options: QueryOptions,
  ): Promise<DataRow> {
    const maxDepth = options.maxDepth ?? 5;
    const id = row[model.primaryField];

    // 只保留物理字段（复杂字段不落库）
    const out = cleanStoredRow(model, row, this.types);

    if (options.includeRelations === false) return out;
    if (depth >= maxDepth) return out;

    const key = visitKey(model.id, id);
    if (visited.has(key)) return out; // 循环引用防护
    visited.add(key);
    try {
      for (const field of model.fields) {
        if (!isRelationType(field.type)) continue;
        const agg = await this.aggregateRelation(model, field, row, depth, visited, options);
        if (agg !== undefined) out[field.name] = agg;
      }
    } finally {
      visited.delete(key);
    }
    return out;
  }

  /** 聚合单个复杂字段 */
  private async aggregateRelation(
    owner: IModel,
    field: IField,
    row: DataRow,
    depth: number,
    visited: Set<VisitKey>,
    options: QueryOptions,
  ): Promise<DataRow | DataRow[] | undefined> {
    const relatedModel = this.registry.getById(field.relatedModelId ?? "");
    if (!relatedModel) throw new RelationError(`关系字段 '${field.name}' 的 relatedModelId '${field.relatedModelId}' 未注册`);

    const junctionModel = field.junctionModelId ? this.registry.getById(field.junctionModelId) : undefined;
    if (field.junctionModelId && !junctionModel) {
      throw new RelationError(`关系字段 '${field.name}' 的 junctionModelId '${field.junctionModelId}' 未注册`);
    }

    const nav = navigate(owner, field, relatedModel, junctionModel);
    const relatedRows = await this.collectRows(nav, row);
    const aggregated = await Promise.all(
      relatedRows.map((r) => this.aggregateRow(relatedModel, r, depth + 1, visited, options)),
    );

    if (nav.many) return aggregated;
    return aggregated[0];
  }

  /** 按导航收集关联行 */
  private async collectRows(nav: Navigation, row: DataRow): Promise<DataRow[]> {
    switch (nav.kind) {
      case "direct": {
        // 本侧字段值匹配对侧字段
        const value = row[nav.thisField];
        if (value === undefined || value === null) return [];
        return this.dataSource.find(nav.relatedModelId, nav.thatField, value);
      }
      case "junction": {
        // 中间表：junction 行的本侧外键 = 当前行主键，取对侧外键 → 对侧行
        const jModel = nav.junctionModelId!;
        const links = await this.dataSource.find(jModel, nav.thisField, row.id);
        const ids = links.map((l) => l[nav.thatField]).filter((v) => v !== undefined);
        const rows: DataRow[] = [];
        for (const id of ids) {
          const target = await this.dataSource.get(nav.relatedModelId, String(id));
          if (target) rows.push(target);
        }
        return rows;
      }
    }
  }
}
