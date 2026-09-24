/**
 * 关系导航器：四类复杂字段的导航逻辑。
 * 解析 thisField/thatField/relatedModelId/junctionModelId，
 * 给出从一行数据导航到关联数据所需的查询描述。
 */

import type { IModel } from "./types/model.js";
import type { IField, RelationType } from "./types/field.js";

/**
 * 导航方向：从本侧行出发，如何找到对侧行。
 */
export interface Navigation {
  /** 关系类型 */
  type: RelationType;
  /** 目标模型 id */
  relatedModelId: string;
  /** 中间模型 id（仅 O2O/M2M） */
  junctionModelId?: string;
  /**
   * 关联匹配描述：
   * - 直接外键（M2O/O2M）：本侧字段 = 对侧字段
   * - 中间表（O2O/M2M）：junction 表通过本侧/对侧外键连接
   */
  kind: "direct" | "junction";
  /** 本侧参与匹配的字段 */
  thisField: string;
  /** 对侧参与匹配的字段 */
  thatField: string;
  /** 结果是否数组 */
  many: boolean;
}

export class RelationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelationError";
  }
}

/** 获取复杂字段的导航描述 */
export function navigate(owner: IModel, field: IField, related: IModel, junction?: IModel): Navigation {
  const type = field.type as RelationType;
  const base = {
    type,
    relatedModelId: related.id,
    thisField: field.thisField ?? "",
    thatField: field.thatField ?? "",
  };

  switch (type) {
    case "Many2One": {
      // 本侧行存外键：thisField = 对侧 thatField，取单个
      if (!field.thisField || !field.thatField) throw new RelationError(`${field.name} 缺少 thisField/thatField`);
      return { ...base, kind: "direct", many: false };
    }
    case "One2Many": {
      // 对侧存外键：本侧 thisField = 对侧 thatField，取多个
      if (!field.thisField || !field.thatField) throw new RelationError(`${field.name} 缺少 thisField/thatField`);
      return { ...base, kind: "direct", many: true };
    }
    case "One2One": {
      // 中间表：junction 连接本侧 id 与对侧 id，取单个
      if (!field.junctionModelId) throw new RelationError(`${field.name} 缺少 junctionModelId`);
      return { ...base, kind: "junction", junctionModelId: field.junctionModelId, many: false };
    }
    case "Many2Many": {
      // 中间表：junction 连接本侧 id 与对侧 id，取多个
      if (!field.junctionModelId) throw new RelationError(`${field.name} 缺少 junctionModelId`);
      return { ...base, kind: "junction", junctionModelId: field.junctionModelId, many: true };
    }
  }
}
