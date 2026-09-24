/**
 * 级联写入解析器。
 * 依据 model（描述 record 结构）+ record 推导出所有 create/update/delete，
 * 作为一个事务应用（含关系字段的中间表维护）。
 *
 * 推导约定（按主键有无，主键字段由 model.primaryField 决定）：
 * - 节点有主键 → update；无主键 → create
 * - 嵌套单对象（M2O/O2O）：无主键级联 create 后关联，有主键 update 并关联
 * - 嵌套数组（O2M/M2M）：元素无主键 → create，有主键 → update
 *
 * $delete 语义：
 * - 顶层：真实删除主模型行 + O2M 子记录级联删除 + 中间表关系清理
 * - M2O 嵌套：仅解除关联（清本侧外键），不删对侧
 * - O2M 元素：真实删除对侧子记录（M 侧）
 * - O2O / M2M：只删中间表 link，不删对侧数据
 * - 删除（含解除关联）必须提供主键
 */

import { createHash, randomUUID } from "node:crypto";

import type { Registry } from "./registry.js";
import type { DataSource } from "./data-source.js";
import type { TypeRegistry } from "./type-mapping.js";
import { cleanStoredRow } from "./type-mapping.js";
import type { IModel } from "./types/model.js";
import type { IField } from "./types/field.js";
import { isRelationType, type RelationType } from "./types/field.js";
import { DaoError } from "./dao-error.js";

/**
 * 递归应用一个 record 节点。
 * 返回该节点落库后的主键值；写操作应在事务内（由调用方 withTransaction 包裹）。
 */
export async function applyNode(
  registry: Registry,
  ds: DataSource,
  types: TypeRegistry,
  modelId: string,
  record: Record<string, unknown>,
): Promise<string> {
  const model = registry.getById(modelId);
  if (!model) throw new DaoError(`模型 '${modelId}' 未注册`);
  const primaryField = model.primaryField;
  const primaryValue = record[primaryField];

  // 顶层 $delete：删除本行 + 级联清理
  if (record["$delete"] === true) {
    if (primaryValue === undefined || primaryValue === null) {
      throw new DaoError(`删除 ${model.name} 需要提供主键 '${primaryField}'`);
    }
    await deleteCascade(registry, ds, model, String(primaryValue));
    return String(primaryValue);
  }

  // 确定本侧主键：create 无主键时先分配（uuid），关系动作需要本侧主键
  let id = primaryValue !== undefined && primaryValue !== null ? String(primaryValue) : undefined;
  if (!id) {
    const primary = model.fields.find((f) => f.name === primaryField);
    if (primary?.type === "uuid") {
      id = randomUUID();
    } else {
      throw new DaoError(`创建 ${model.name} 需要提供主键 '${primaryField}'`);
    }
  }
  // 写回 record，供关系动作读取本侧主键
  record[primaryField] = id;

  // 物理字段收集（排除嵌套关系对象）+ 关系动作收集
  const physical: Record<string, unknown> = { [primaryField]: id };
  const relationActions: Array<() => Promise<void>> = [];

  for (const field of model.fields) {
    const value = record[field.name];
    if (value === undefined || value === null) continue;

    if (isRelationType(field.type)) {
      relationActions.push(() => applyRelation(registry, ds, types, model, field, value, record, physical));
    } else {
      physical[field.name] = value;
    }
  }

  // 执行关系动作（会写回本侧外键到 physical）
  for (const action of relationActions) await action();

  // 清洗落库：create 直接落；update 合并已有行做部分更新
  const existing = await ds.get(modelId, id);
  const row = cleanStoredRow(model, { ...(existing ?? {}), ...physical }, types);
  await ds.put(modelId, row);
  return id;
}

/**
 * 级联删除主模型行：
 * - O2M 子记录：真实删除（递归级联）
 * - O2O / M2M：删除中间表 link（不删对侧数据）
 * - M2O：本侧持有外键，删除本行即解除关联
 */
async function deleteCascade(registry: Registry, ds: DataSource, model: IModel, id: string): Promise<void> {
  const primaryField = model.primaryField;
  const row = await ds.get(model.id, id);
  if (!row) return;

  for (const field of model.fields) {
    if (!isRelationType(field.type)) continue;
    const relatedModel = registry.getById(field.relatedModelId ?? "");
    if (!relatedModel) continue;
    const relatedPrimary = relatedModel.primaryField;
    const type = field.type as RelationType;

    switch (type) {
      case "One2Many": {
        // 真实删除子记录（递归级联）
        const thisField = field.thisField ?? "";
        if (!thisField) continue;
        const children = await ds.find(relatedModel.id, thisField, id);
        for (const child of children) {
          await deleteCascade(registry, ds, relatedModel, String(child[relatedPrimary]));
        }
        break;
      }
      case "One2One":
      case "Many2Many": {
        // 只删中间表 link
        if (!field.junctionModelId || !field.thisField || !field.thatField) continue;
        const { junctionModelId, thisField, thatField } = field;
        const links = await ds.find(junctionModelId, thisField, id);
        for (const link of links) {
          await ds.delete(junctionModelId, String(link.id));
        }
        void thatField;
        break;
      }
      case "Many2One": {
        // 本侧持有外键，删除本行即解除关联，无需处理对侧
        break;
      }
    }
  }

  await ds.delete(model.id, id);
}

/** 处理单个关系字段（嵌套对象或数组） */
async function applyRelation(
  registry: Registry,
  ds: DataSource,
  types: TypeRegistry,
  owner: IModel,
  field: IField,
  value: unknown,
  record: Record<string, unknown>,
  physical: Record<string, unknown>,
): Promise<void> {
  const relatedModel = registry.getById(field.relatedModelId ?? "");
  if (!relatedModel) throw new DaoError(`关系字段 '${field.name}' 的 relatedModelId '${field.relatedModelId}' 未注册`);

  const type = field.type as RelationType;
  const relatedPrimary = relatedModel.primaryField;

  switch (type) {
    case "Many2One": {
      // 单对象：级联 upsert 对侧 → 写本侧外键
      const thisField = field.thisField ?? "";
      if (!thisField) throw new DaoError(`M2O 字段 '${field.name}' 缺少 thisField`);
      if (isPlainObject(value)) {
        if (value["$delete"] === true) {
          // 只解除关联（清本侧外键），不删对侧数据
          const targetId = value[relatedPrimary];
          if (targetId === undefined || targetId === null) {
            throw new DaoError(`解除 ${field.name} 关联需要提供对侧主键 '${relatedPrimary}'`);
          }
          const current = physical[thisField];
          if (current !== undefined && current !== null && String(current) === String(targetId)) {
            physical[thisField] = null;
          }
          break;
        }
        const relatedId = await applyNode(registry, ds, types, relatedModel.id, value);
        physical[thisField] = relatedId;
      } else {
        physical[thisField] = value; // 标量：直接作为外键
      }
      break;
    }
    case "One2One": {
      // 单对象 + 中间表
      if (!field.junctionModelId || !field.thisField || !field.thatField) {
        throw new DaoError(`O2O 字段 '${field.name}' 缺少 junctionModelId/thisField/thatField`);
      }
      const { junctionModelId, thisField, thatField } = field;
      const ownerId = String(record[owner.primaryField]);
      if (isPlainObject(value) && value["$delete"] === true) {
        // 只删关系（中间表 link），不删对侧数据
        const targetId = value[relatedPrimary];
        if (targetId === undefined || targetId === null) {
          throw new DaoError(`解除 ${field.name} 关联需要提供对侧主键 '${relatedPrimary}'`);
        }
        await ds.delete(junctionModelId, linkId(ownerId, String(targetId), thisField, thatField));
        break;
      }
      const relatedId = await applyNode(registry, ds, types, relatedModel.id, value as Record<string, unknown>);
      // 维护中间表：先删旧 link 再插新 link
      const lid = linkId(ownerId, relatedId, thisField, thatField);
      await ds.delete(junctionModelId, lid);
      await ds.put(junctionModelId, { id: lid, [thisField]: ownerId, [thatField]: relatedId });
      break;
    }
    case "One2Many": {
      // 数组：元素无主键 → create 对侧；有主键 → update；$delete → 删对侧行
      if (!field.thisField || !field.thatField) throw new DaoError(`O2M 字段 '${field.name}' 缺少 thisField/thatField`);
      const thisField = field.thisField; // 对侧存外键的字段
      const ownerId = String(record[owner.primaryField]);
      if (!Array.isArray(value)) throw new DaoError(`O2M 字段 '${field.name}' 的值必须是数组`);
      for (const item of value as Record<string, unknown>[]) {
        if (!isPlainObject(item)) throw new DaoError(`O2M 字段 '${field.name}' 的元素必须是对象`);
        if (item["$delete"] === true) {
          const itemId = item[relatedPrimary];
          if (itemId === undefined || itemId === null) {
            throw new DaoError(`删除 ${relatedModel.name} 需要提供主键 '${relatedPrimary}'`);
          }
          await ds.delete(relatedModel.id, String(itemId));
          continue;
        }
        // 对侧行写外键指向本侧
        await applyNode(registry, ds, types, relatedModel.id, { ...item, [thisField]: ownerId });
      }
      break;
    }
    case "Many2Many": {
      // 数组 + 中间表：create/update 对侧，维护中间表
      if (!field.junctionModelId || !field.thisField || !field.thatField) {
        throw new DaoError(`M2M 字段 '${field.name}' 缺少 junctionModelId/thisField/thatField`);
      }
      const { junctionModelId, thisField, thatField } = field;
      const ownerId = String(record[owner.primaryField]);
      if (!Array.isArray(value)) throw new DaoError(`M2M 字段 '${field.name}' 的值必须是数组`);
      for (const item of value as Record<string, unknown>[]) {
        if (!isPlainObject(item)) throw new DaoError(`M2M 字段 '${field.name}' 的元素必须是对象`);
        if (item["$delete"] === true) {
          // 只删关系（中间表 link），不删对侧数据；主键必须存在
          const itemId = item[relatedPrimary];
          if (itemId === undefined || itemId === null) {
            throw new DaoError(`解除 ${relatedModel.name} 关联需要提供主键 '${relatedPrimary}'`);
          }
          const lid = linkId(ownerId, String(itemId), thisField, thatField);
          await ds.delete(junctionModelId, lid);
          continue;
        }
        const itemId = await applyNode(registry, ds, types, relatedModel.id, item);
        const lid = linkId(ownerId, itemId, thisField, thatField);
        await ds.put(junctionModelId, { id: lid, [thisField]: ownerId, [thatField]: itemId });
      }
      break;
    }
  }
}

/** 判断是否为普通对象（非数组、非标量） */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 中间表行 id：本侧外键 + 对侧外键 确定性哈希（uuid 格式），保证可重入 */
function linkId(ownerId: string, relatedId: string, thisField: string, thatField: string): string {
  const hash = createHash("sha256")
    .update(`${thisField}:${ownerId}@${thatField}:${relatedId}`)
    .digest("hex")
    .slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
}
