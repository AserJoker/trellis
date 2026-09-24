/**
 * JSON 文件存储实现（临时措施 T1）。
 * 将实体序列化为 JSON 存磁盘；管理面元数据量级小，可接受。
 * 待后续（阶段 5）：存储接口抽象 + 数据库适配器。
 */

import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Storage, Storable } from "./storage.js";

export class JsonStorage implements Storage {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async put(entity: Storable): Promise<void> {
    const id = entity.id;
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("实体必须有非空 id");
    }
    await mkdir(this.dir, { recursive: true });
    // 原子写：先写临时文件再重命名
    const target = this.pathFor(id);
    const tmp = `${target}.tmp`;
    await writeFile(tmp, JSON.stringify(entity, null, 2), "utf8");
    await rename(tmp, target).catch(() => writeFile(target, JSON.stringify(entity, null, 2), "utf8"));
  }

  async get<T extends Storable>(id: string): Promise<T | undefined> {
    try {
      const raw = await readFile(this.pathFor(id), "utf8");
      return JSON.parse(raw) as T;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    await rm(this.pathFor(id), { force: true });
  }

  async list<T extends Storable>(): Promise<T[]> {
    let entries: string[];
    try {
      entries = await readdir(this.dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    const result: T[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const raw = await readFile(join(this.dir, entry), "utf8");
      result.push(JSON.parse(raw) as T);
    }
    return result;
  }

  private pathFor(id: string): string {
    // id 中的分隔符转义，避免路径穿越
    const safe = id.replace(/[^a-zA-Z0-9._-]/g, "_");
    return join(this.dir, `${safe}.json`);
  }
}
