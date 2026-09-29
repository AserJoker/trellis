import type {
  IColumn,
  IQueryCondition,
  IQueryOption,
  IQueryResult,
  IStore,
  ITable,
  ITransactionStore,
} from "../../src/IStore.ts";

type Row = Record<string, unknown>;

/** 事务作用域：内存快照，commit 应用，rollback 丢弃。 */
class MemoryTransaction implements ITransactionStore<Row> {
  private tables: Map<string, Row[]>;
  private snapshot: Map<string, Row[]>;
  private primaryKey: (tableId: string, record: Row) => string | undefined;

  constructor(
    tables: Map<string, Row[]>,
    snapshot: Map<string, Row[]>,
    primaryKey: (tableId: string, record: Row) => string | undefined,
  ) {
    this.tables = tables;
    this.snapshot = snapshot;
    this.primaryKey = primaryKey;
  }

  async createOne(id: string, record: Row): Promise<Row> {
    const rows = this.tables.get(id);
    if (!rows) throw new Error(`Table not found: ${id}`);
    rows.push({ ...record });
    return { ...record };
  }

  async updateOne(id: string, record: Row): Promise<Row> {
    const rows = this.tables.get(id);
    if (!rows) throw new Error(`Table not found: ${id}`);
    const key = this.primaryKey(id, record);
    const idx = rows.findIndex((r) => r.id === key);
    if (idx < 0) throw new Error(`Record not found: ${key}`);
    rows[idx] = { ...rows[idx], ...record };
    return { ...rows[idx] };
  }

  async deleteOne(id: string, record: Row): Promise<Row> {
    const rows = this.tables.get(id);
    if (!rows) throw new Error(`Table not found: ${id}`);
    const key = this.primaryKey(id, record);
    const idx = rows.findIndex((r) => r.id === key);
    if (idx < 0) throw new Error(`Record not found: ${key}`);
    const [removed] = rows.splice(idx, 1);
    return removed ?? {};
  }

  async query(
    id: string,
    condition?: IQueryCondition<Row>,
    option?: IQueryOption,
  ): Promise<IQueryResult<Row>> {
    return queryRows(this.tables.get(id) ?? [], condition, option);
  }

  async commit(): Promise<void> {
    // 快照即当前表，无需动作
    this.snapshot.clear();
  }

  async rollback(): Promise<void> {
    // 用事务开始时的快照还原
    this.tables.clear();
    for (const [tid, rows] of this.snapshot) {
      this.tables.set(tid, rows.map((r) => ({ ...r })));
    }
  }
}

/** 内存 IStore 桩：测试用，实现 IStore 接口全部方法。 */
export class MemoryStore implements IStore<Row> {
  private tables = new Map<string, Row[]>();
  private schemas = new Map<string, ITable>();

  async createTable(id: string, columns: IColumn[], primaryColumn: string): Promise<void> {
    this.tables.set(id, []);
    this.schemas.set(id, { id, columns, primaryColumn });
  }

  async dropTable(id: string): Promise<void> {
    this.tables.delete(id);
    this.schemas.delete(id);
  }

  async getTable(id: string): Promise<ITable> {
    const table = this.schemas.get(id);
    if (!table) throw new Error(`Table not found: ${id}`);
    return table;
  }

  async createOne(id: string, record: Row): Promise<Row> {
    const rows = this.tables.get(id);
    if (!rows) throw new Error(`Table not found: ${id}`);
    rows.push({ ...record });
    return { ...record };
  }

  async updateOne(id: string, record: Row): Promise<Row> {
    const rows = this.tables.get(id);
    if (!rows) throw new Error(`Table not found: ${id}`);
    const idx = rows.findIndex((r) => r.id === record.id);
    if (idx < 0) throw new Error(`Record not found: ${record.id}`);
    rows[idx] = { ...rows[idx], ...record };
    return { ...rows[idx] };
  }

  async deleteOne(id: string, record: Row): Promise<Row> {
    const rows = this.tables.get(id);
    if (!rows) throw new Error(`Table not found: ${id}`);
    const idx = rows.findIndex((r) => r.id === record.id);
    if (idx < 0) throw new Error(`Record not found: ${record.id}`);
    const [removed] = rows.splice(idx, 1);
    return removed ?? {};
  }

  async query(
    id: string,
    condition?: IQueryCondition<Row>,
    option?: IQueryOption,
  ): Promise<IQueryResult<Row>> {
    return queryRows(this.tables.get(id) ?? [], condition, option);
  }

  async beginTransaction(): Promise<ITransactionStore<Row>> {
    const snapshot = new Map<string, Row[]>();
    for (const [tid, rows] of this.tables) {
      snapshot.set(tid, rows.map((r) => ({ ...r })));
    }
    return new MemoryTransaction(this.tables, snapshot, (tid, record) =>
      String(record.id),
    );
  }

  /** 测试辅助：直接往表里塞数据（绕过 createOne）。 */
  seed(id: string, rows: Row[]): void {
    if (!this.tables.has(id)) this.tables.set(id, []);
    this.tables.get(id)!.push(...rows.map((r) => ({ ...r })));
  }
}

function queryRows(
  rows: Row[],
  condition?: IQueryCondition<Row>,
  option?: IQueryOption,
): IQueryResult<Row> {
  let filtered = rows;
  if (condition) {
    filtered = rows.filter((row) => {
      for (const [key, cond] of Object.entries(condition)) {
        if (Array.isArray(cond)) {
          const [min, max] = cond as [unknown, unknown];
          const v = row[key];
          if (min !== undefined && (v === undefined || (v as never) < (min as never)))
            return false;
          if (max !== undefined && (v === undefined || (v as never) > (max as never)))
            return false;
        } else if (row[key] !== cond) {
          return false;
        }
      }
      return true;
    });
  }
  const total = filtered.length;
  const offset = option?.offset ?? 0;
  const limit = option?.limit ?? filtered.length;
  return { data: filtered.slice(offset, offset + limit), total };
}
