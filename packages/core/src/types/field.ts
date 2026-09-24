/**
 * Field 类型定义。
 * 字段分类：简单字段 + 复杂字段（四类关系）。
 * 自举一致性：Field 本身也是 Model，对应数据库一张列固定的表，
 * 因此所有字段元信息键结构统一，用不到的键留空。
 */

/** 关系类型：四类复杂字段 */
export const RELATION_TYPES = ["One2One", "One2Many", "Many2One", "Many2Many"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

/** 是否为关系（复杂）字段类型 */
export function isRelationType(t: string): t is RelationType {
  return (RELATION_TYPES as readonly string[]).includes(t);
}

/**
 * 字段元数据（统一结构）。
 * 所有字段（含简单字段）统一四键，用不到留空。
 */
export interface IField {
  /** 字段名 */
  name: string;
  /**
   * 业务抽象类型（如「金融」），框架映射到逻辑数据类型。
   * 复杂字段用关系类型（One2One/One2Many/Many2One/Many2Many）。
   */
  type: string;
  /** 是否物理落库。复杂字段一定为 false；简单字段默认 true */
  store?: boolean;
  /** 是否为字段定义主键 */
  primary?: boolean;

  // ---- 复杂字段关系四键（简单字段留空） ----
  /** 本侧关系字段 */
  thisField?: string;
  /** 对侧关系字段 */
  thatField?: string;
  /** 关系模型 id */
  relatedModelId?: string;
  /** 中间模型 id（仅 One2One / One2Many 使用） */
  junctionModelId?: string;

  /** 扩展元数据（预留） */
  [key: string]: unknown;
}

/** 简单字段（store 默认 true） */
export interface ISimpleField extends IField {
  type: string;
  store?: boolean;
}

/** 复杂字段（关系字段，store 恒为 false） */
export interface IRelationField extends IField {
  type: RelationType;
  store: false;
}
