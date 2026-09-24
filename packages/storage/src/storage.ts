/**
 * 存储接口（为阶段 5 存储抽象打底，当前仅 JSON 实现）。
 * 元数据（管理面数据）量级小，JSON 序列化落盘足够。
 */

/** 存储实体：可序列化对象 */
export type Storable = Record<string, unknown>;

/** 存储接口 */
export interface Storage {
  /** 写入/更新一个实体 */
  put(entity: Storable): Promise<void>;
  /** 按 id 读取 */
  get<T extends Storable>(id: string): Promise<T | undefined>;
  /** 删除 */
  remove(id: string): Promise<void>;
  /** 列出所有实体 */
  list<T extends Storable>(): Promise<T[]>;
}
