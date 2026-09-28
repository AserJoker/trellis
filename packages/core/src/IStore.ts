/**
 * 物理列类型：简单字段的直接映射；enum 列存枚举项 value（字符串）。
 */
type ColumnType =
  | "string"
  | "integer"
  | "floating"
  | "boolean"
  | "text"
  | "enum";

export interface IColumn {
  name: string;
  type: ColumnType;
}

export interface ITable {
  id: string;
  columns: IColumn[];
  primaryColumn: string;
}

export interface IQueryOption {
  limit: number;
  offset: number;
}

export interface IQueryResult<T extends Record<string, unknown>> {
  data: T[];
  total: number;
}

/**
 * 查询条件：等值（单值）或范围（二元组闭区间）。
 * 二元组 [min, max] 为闭区间；元素为 undefined 表示对应侧无边界
 * （[undefined, 5] = ≤5，[1, undefined] = ≥1，[undefined, undefined] = 无限制）。
 */
export type IQueryCondition<T extends Record<string, unknown>> = {
  [K in keyof T]?: T[K] | [T[K] | undefined, T[K] | undefined];
};

/**
 * 事务作用域内的 store：仅含数据操作（create/update/delete/query），
 * 不含表结构操作（createTable/dropTable/getTable 不属于事务作用域）。
 * 事务期间的操作落在事务内，commit 原子生效，rollback 全部回退。
 */
export interface ITransactionStore<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  createOne(id: string, record: T): Promise<T>;
  /** 以 record 内的主键字段定位待更新的记录。 */
  updateOne(id: string, record: T): Promise<T>;
  /** 以 record 内的主键字段定位待删除的记录。 */
  deleteOne(id: string, record: T): Promise<T>;
  /** condition 为查询条件：字段值等值或 [min, max] 闭区间范围。 */
  query(
    id: string,
    condition?: IQueryCondition<T>,
    option?: IQueryOption,
  ): Promise<IQueryResult<T>>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface IStore<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  createTable(
    id: string,
    columns: IColumn[],
    primaryColumn: string,
  ): Promise<void>;
  dropTable(id: string): Promise<void>;
  getTable(id: string): Promise<ITable>;
  createOne(id: string, record: T): Promise<T>;
  /** 以 record 内的主键字段定位待更新的记录。 */
  updateOne(id: string, record: T): Promise<T>;
  /** 以 record 内的主键字段定位待删除的记录。 */
  deleteOne(id: string, record: T): Promise<T>;
  /** condition 为查询条件：字段值等值或 [min, max] 闭区间范围。 */
  query(
    id: string,
    condition?: IQueryCondition<T>,
    option?: IQueryOption,
  ): Promise<IQueryResult<T>>;
  /** 开启事务，返回事务作用域内的 store；commit/rollback 结束事务。 */
  beginTransaction(): Promise<ITransactionStore<T>>;
}