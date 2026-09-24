/**
 * 数据源接口与内存实现（临时措施 T3）。
 * 查询聚合引擎的数据来源。阶段 2 先用内存数据源，
 * 待后续（阶段 5）：基于存储适配器优化。
 */

/** 数据行：主键 + 任意字段 */
export interface DataRow {
  [key: string]: unknown;
}

/** 过滤条件：字段名 → 精确匹配值 */
export interface Filter {
  [field: string]: unknown;
}

/** 数据源：按 Model 存取数据行 */
export interface DataSource {
  /** 按主键读取单行 */
  get(modelId: string, id: string): Promise<DataRow | undefined>;
  /** 按字段精确匹配查询（用于外键导航） */
  find(modelId: string, field: string, value: unknown): Promise<DataRow[]>;
  /** 按过滤条件查询（全部条件需匹配） */
  query(modelId: string, filter: Filter): Promise<DataRow[]>;
  /** 列出某模型全部行 */
  list(modelId: string): Promise<DataRow[]>;
  /** 插入/更新一行 */
  put(modelId: string, row: DataRow): Promise<void>;
  /** 按主键删除 */
  delete(modelId: string, id: string): Promise<void>;
  /**
   * 事务执行：work 内的所有写操作原子提交或全部回滚。
   * 非事务型数据源可退化为直接执行（无回滚保障）。
   */
  withTransaction<T>(work: (tx: DataSource) => Promise<T>): Promise<T>;
}

/**
 * 内存数据源（临时措施 T3）。
 * 以 Map 存储：modelId → (rowId → row)。
 * 事务：深拷贝快照，work 内写操作先落到内存副本，成功时提交（替换内存），失败回滚（丢弃副本）。
 */
export class InMemoryDataSource implements DataSource {
  private readonly data = new Map<string, Map<string, DataRow>>();

  private table(modelId: string): Map<string, DataRow> {
    let t = this.data.get(modelId);
    if (!t) {
      t = new Map();
      this.data.set(modelId, t);
    }
    return t;
  }

  async get(modelId: string, id: string): Promise<DataRow | undefined> {
    return this.table(modelId).get(id);
  }

  async find(modelId: string, field: string, value: unknown): Promise<DataRow[]> {
    return this.query(modelId, { [field]: value });
  }

  async query(modelId: string, filter: Filter): Promise<DataRow[]> {
    const table = this.table(modelId);
    const result: DataRow[] = [];
    for (const row of table.values()) {
      let match = true;
      for (const [field, value] of Object.entries(filter)) {
        if (row[field] !== value) {
          match = false;
          break;
        }
      }
      if (match) result.push(row);
    }
    return result;
  }

  async list(modelId: string): Promise<DataRow[]> {
    return [...this.table(modelId).values()];
  }

  async put(modelId: string, row: DataRow): Promise<void> {
    const id = row.id;
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("数据行必须有非空 id");
    }
    this.table(modelId).set(id, row);
  }

  async delete(modelId: string, id: string): Promise<void> {
    this.table(modelId).delete(id);
  }

  async withTransaction<T>(work: (tx: DataSource) => Promise<T>): Promise<T> {
    // 快照当前全部数据（深拷贝），失败时恢复
    const snapshot = this.clone();
    try {
      const result = await work(this);
      // 成功：丢弃快照，保留 work 的写入
      return result;
    } catch (err) {
      // 失败：恢复快照
      this.data.clear();
      for (const [modelId, table] of snapshot) {
        this.data.set(modelId, table);
      }
      throw err;
    }
  }

  /** 深拷贝全部数据（供事务快照） */
  private clone(): Map<string, Map<string, DataRow>> {
    const copy = new Map<string, Map<string, DataRow>>();
    for (const [modelId, table] of this.data) {
      const tableCopy = new Map<string, DataRow>();
      for (const [id, row] of table) {
        tableCopy.set(id, structuredClone(row));
      }
      copy.set(modelId, tableCopy);
    }
    return copy;
  }
}
