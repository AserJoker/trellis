/**
 * 元数据 DAO 层验收：create/update/delete/queryOne/queryList/queryPage。
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  Registry,
  InMemoryDataSource,
  createDefaultTypeRegistry,
  Dao,
} from "@trellis/core";
import type { IModel } from "@trellis/core";

function makeUserModel(): IModel {
  return {
    id: "app.user",
    name: "User",
    namespace: "app",
    primaryField: "id",
    fields: [
      { name: "id", type: "uuid", store: true, primary: true },
      { name: "name", type: "string", store: true },
      { name: "age", type: "int", store: true },
      { name: "authId", type: "uuid", store: true },
      {
        name: "auth",
        type: "Many2One",
        store: false,
        thisField: "authId",
        thatField: "id",
        relatedModelId: "app.auth",
      },
    ],
    functions: [],
  };
}

function makeAuthModel(): IModel {
  return {
    id: "app.auth",
    name: "Auth",
    namespace: "app",
    primaryField: "id",
    fields: [
      { name: "id", type: "uuid", store: true, primary: true },
      { name: "token", type: "string", store: true },
    ],
    functions: [],
  };
}

function makeDao() {
  const registry = new Registry();
  registry.register(makeUserModel());
  registry.register(makeAuthModel());
  const ds = new InMemoryDataSource();
  const types = createDefaultTypeRegistry();
  const dao = new Dao(registry, ds, types);
  return { registry, ds, types, dao };
}

test("create：自动生成 uuid 主键，清洗剔除复杂字段", async () => {
  const { dao, ds } = makeDao();
  const created = await dao.create("app.user", { name: "alice", age: 20, auth: { id: "x" } });
  assert.ok(created.id, "应自动生成主键");
  assert.equal(created.name, "alice");
  assert.equal(created.age, 20);
  assert.equal(created.auth, undefined, "复杂字段不落库");

  // 落库的行也不含复杂字段
  const stored = await ds.get("app.user", created.id as string);
  assert.equal(stored?.auth, undefined);
});

test("create：int 类型校验错误值报错", async () => {
  const { dao } = makeDao();
  await assert.rejects(() => dao.create("app.user", { name: "alice", age: "20" }), /逻辑类型 'int'/);
});

test("update：部分更新物理字段", async () => {
  const { dao } = makeDao();
  const created = await dao.create("app.user", { name: "alice", age: 20 });
  const updated = await dao.update("app.user", { id: created.id, age: 21 });
  assert.ok(updated);
  assert.equal(updated.age, 21);
  assert.equal(updated.name, "alice", "未更新字段保留");
});

test("update：不存在的记录返回 undefined", async () => {
  const { dao } = makeDao();
  const result = await dao.update("app.user", { id: "no-such-id", age: 1 });
  assert.equal(result, undefined);
});

test("update：$delete 标记表示删除", async () => {
  const { dao } = makeDao();
  const created = await dao.create("app.user", { name: "alice", age: 20 });
  const result = await dao.update("app.user", { id: created.id, $delete: true });
  assert.equal(result, undefined, "删除返回 undefined");
  const after = await dao.queryOne("app.user", created.id as string);
  assert.equal(after, undefined, "记录已删除");
});

test("update：缺少主键报错", async () => {
  const { dao } = makeDao();
  await assert.rejects(() => dao.update("app.user", { age: 21 }), /需要提供主键/);
});

test("delete：删除后 queryOne 返回 undefined", async () => {
  const { dao } = makeDao();
  const created = await dao.create("app.user", { name: "alice", age: 20 });
  await dao.delete("app.user", created.id as string);
  const result = await dao.queryOne("app.user", created.id as string);
  assert.equal(result, undefined);
});

test("queryOne：返回聚合后的记录", async () => {
  const { dao } = makeDao();
  await dao.create("app.auth", { id: "11111111-1111-1111-1111-111111111111", token: "tok-1" });
  await dao.create("app.user", {
    id: "22222222-2222-2222-2222-222222222222",
    name: "alice",
    age: 20,
    authId: "11111111-1111-1111-1111-111111111111",
  });
  const result = await dao.queryOne("app.user", "22222222-2222-2222-2222-222222222222");
  assert.ok(result);
  assert.equal(result.name, "alice");
  assert.ok(result.auth, "应聚合出 auth");
  assert.equal((result.auth as Record<string, unknown>).token, "tok-1");
});

test("queryList：按条件过滤", async () => {
  const { dao } = makeDao();
  await dao.create("app.user", { name: "alice", age: 20 });
  await dao.create("app.user", { name: "bob", age: 30 });
  await dao.create("app.user", { name: "carol", age: 20 });

  const result = await dao.queryList("app.user", { age: 20 });
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((r) => r.name).sort(),
    ["alice", "carol"],
  );
});

test("queryPage：分页返回 items/total/page/size", async () => {
  const { dao } = makeDao();
  for (let i = 1; i <= 5; i++) {
    await dao.create("app.user", { name: `u${i}`, age: i });
  }

  const page1 = await dao.queryPage("app.user", undefined, 1, 2);
  assert.equal(page1.total, 5);
  assert.equal(page1.page, 1);
  assert.equal(page1.size, 2);
  assert.equal(page1.items.length, 2);

  const page3 = await dao.queryPage("app.user", undefined, 3, 2);
  assert.equal(page3.items.length, 1, "第三页剩 1 条");
});
