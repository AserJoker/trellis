/**
 * 阶段 1 验收：JSON 存储落盘/加载。
 * 验收点：管理面元数据可 JSON 落盘/加载（重启不丢）。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { JsonStorage } from "@trellis/storage";
import type { IModel } from "@trellis/core";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "trellis-storage-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const userModel: IModel = {
  id: "app.user",
  name: "User",
  namespace: "app",
  primaryField: "id",
  fields: [{ name: "id", type: "uuid", store: true, primary: true }],
  functions: [],
};

test("JSON 存储：写入并读回", async () => {
  await withTempDir(async (dir) => {
    const storage = new JsonStorage(dir);
    await storage.put(userModel);
    const loaded = await storage.get<IModel>("app.user");
    assert.ok(loaded);
    assert.equal(loaded.id, "app.user");
    assert.equal(loaded.name, "User");
  });
});

test("JSON 存储：重启不丢（新实例读同一目录）", async () => {
  await withTempDir(async (dir) => {
    // 第一次"运行"写入
    await new JsonStorage(dir).put(userModel);
    // 第二次"运行"（新实例 = 模拟重启）读回
    const storage2 = new JsonStorage(dir);
    const loaded = await storage2.get<IModel>("app.user");
    assert.ok(loaded, "重启后应能读回");
    assert.equal(loaded.namespace, "app");
  });
});

test("JSON 存储：list 返回全部实体", async () => {
  await withTempDir(async (dir) => {
    const storage = new JsonStorage(dir);
    await storage.put(userModel);
    await storage.put({ id: "app.auth", name: "Auth", namespace: "app" });
    const all = await storage.list<IModel>();
    assert.equal(all.length, 2);
  });
});

test("JSON 存储：删除", async () => {
  await withTempDir(async (dir) => {
    const storage = new JsonStorage(dir);
    await storage.put(userModel);
    await storage.remove("app.user");
    const loaded = await storage.get("app.user");
    assert.equal(loaded, undefined);
  });
});

test("JSON 存储：不存在的实体返回 undefined", async () => {
  await withTempDir(async (dir) => {
    const storage = new JsonStorage(dir);
    const loaded = await storage.get("not.exist");
    assert.equal(loaded, undefined);
  });
});
