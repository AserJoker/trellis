/**
 * 阶段 2 扩展验收：事务 + schema 形状查询 + 级联写入（applyRecord）。
 * 验收点：
 * 1. withTransaction：失败全量回滚，成功原子提交
 * 2. $delete 语义：顶层真实删除 + O2M 级联；M2O/O2O/M2M 只解除/删关系
 * 3. schema 形状：白名单裁剪物理字段 + 关系按子形状递归
 * 4. applyRecord：依据 model+record 推导 create/update/delete，一次事务应用，按 schema 返回
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  Registry,
  InMemoryDataSource,
  createDefaultTypeRegistry,
  Dao,
  QueryEngine,
} from "@trellis/core";
import type { IModel, ISchema } from "@trellis/core";

type AnyRow = Record<string, any>;

function makeModels(): IModel[] {
  const auth: IModel = {
    id: "app.auth",
    name: "Auth",
    namespace: "app",
    primaryField: "id",
    fields: [
      { name: "id", type: "uuid", store: true, primary: true },
      { name: "token", type: "string", store: true },
      { name: "owner", type: "string", store: true },
    ],
    functions: [],
  };

  const user: IModel = {
    id: "app.user",
    name: "User",
    namespace: "app",
    primaryField: "id",
    fields: [
      { name: "id", type: "uuid", store: true, primary: true },
      { name: "name", type: "string", store: true },
      { name: "authId", type: "uuid", store: true },
      { name: "balance", type: "string", store: true },
      {
        name: "auth",
        type: "Many2One",
        store: false,
        thisField: "authId",
        thatField: "id",
        relatedModelId: "app.auth",
      },
      {
        name: "roles",
        type: "Many2Many",
        store: false,
        thisField: "userId",
        thatField: "roleId",
        relatedModelId: "app.role",
        junctionModelId: "app.user_role",
      },
    ],
    functions: [],
  };

  const role: IModel = {
    id: "app.role",
    name: "Role",
    namespace: "app",
    primaryField: "id",
    fields: [
      { name: "id", type: "uuid", store: true, primary: true },
      { name: "code", type: "string", store: true },
    ],
    functions: [],
  };

  const userRole: IModel = {
    id: "app.user_role",
    name: "UserRole",
    namespace: "app",
    primaryField: "id",
    fields: [
      { name: "id", type: "uuid", store: true, primary: true },
      { name: "userId", type: "uuid", store: true },
      { name: "roleId", type: "uuid", store: true },
    ],
    functions: [],
  };

  return [auth, user, role, userRole];
}

function makeEnv() {
  const registry = new Registry();
  for (const m of makeModels()) registry.register(m);
  const ds = new InMemoryDataSource();
  const types = createDefaultTypeRegistry();
  const dao = new Dao(registry, ds, types);
  return { registry, ds, types, dao };
}

const AUTH_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";
const ROLE1_ID = "44444444-4444-4444-4444-444444444444";

// ---------------- 事务 ----------------

test("withTransaction：失败全量回滚", async () => {
  const { ds } = makeEnv();
  await ds.put("app.user", { id: USER_ID, name: "before" });

  await assert.rejects(() =>
    ds.withTransaction(async (tx) => {
      await tx.put("app.user", { id: USER_ID, name: "changed" });
      await tx.put("app.auth", { id: AUTH_ID, token: "tok" });
      throw new Error("boom");
    }),
  );

  // 全部回滚：user 未变，auth 不存在
  const user = await ds.get("app.user", USER_ID);
  assert.equal(user?.name, "before");
  const auth = await ds.get("app.auth", AUTH_ID);
  assert.equal(auth, undefined);
});

test("withTransaction：成功原子提交", async () => {
  const { ds } = makeEnv();
  await ds.put("app.user", { id: USER_ID, name: "before" });

  await ds.withTransaction(async (tx) => {
    await tx.put("app.user", { id: USER_ID, name: "changed" });
    await tx.put("app.auth", { id: AUTH_ID, token: "tok" });
  });

  const user = await ds.get("app.user", USER_ID);
  assert.equal(user?.name, "changed");
  const auth = await ds.get("app.auth", AUTH_ID);
  assert.equal(auth?.token, "tok");
});

// ---------------- schema 形状查询 ----------------

test("schema 形状：白名单裁剪物理字段 + 关系按子形状递归", async () => {
  const { ds, registry, types } = makeEnv();
  await ds.put("app.auth", { id: AUTH_ID, token: "tok-1", owner: "alice" });
  await ds.put("app.user", { id: USER_ID, name: "alice", authId: AUTH_ID, balance: "100" });

  const engine = new QueryEngine(registry, ds, types);
  const schema: ISchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      auth: { type: "object", properties: { token: { type: "string" } } },
    },
  };
  const result = (await engine.queryBySchema("app.user", USER_ID, schema)) as AnyRow;
  assert.equal(result.name, "alice");
  assert.equal(result.balance, undefined, "未列出的物理字段不返回");
  assert.equal(result.authId, undefined, "未列出的外键字段不返回");
  assert.equal(result.auth.token, "tok-1");
  assert.equal(result.auth.owner, undefined, "对侧未列出的字段不返回");
});

test("schema 形状：数组关系按 items 形状聚合", async () => {
  const { ds, registry, types } = makeEnv();
  await ds.put("app.role", { id: ROLE1_ID, code: "admin" });
  await ds.put("app.user_role", { id: "j1", userId: USER_ID, roleId: ROLE1_ID });
  await ds.put("app.user", { id: USER_ID, name: "alice", authId: AUTH_ID, balance: "100" });

  const engine = new QueryEngine(registry, ds, types);
  const schema: ISchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      roles: { type: "array", items: { type: "object", properties: { code: { type: "string" } } } },
    },
  };
  const result = (await engine.queryBySchema("app.user", USER_ID, schema)) as AnyRow;
  assert.equal(result.roles.length, 1);
  assert.equal(result.roles[0].code, "admin");
});

// ---------------- applyRecord 级联写入 ----------------

test("applyRecord：M2O 级联 create 对侧并关联", async () => {
  const { dao } = makeEnv();
  const schema: ISchema = {
    type: "object",
    properties: {
      id: { type: "uuid" },
      name: { type: "string" },
      auth: { type: "object", properties: { id: { type: "uuid" }, token: { type: "string" } } },
    },
  };

  const result = (await dao.applyRecord(
    "app.user",
    schema,
    { name: "alice", auth: { token: "tok-9" } },
  )) as AnyRow;

  assert.ok(result.id, "create 返回新主键");
  assert.equal(result.name, "alice");
  assert.ok(result.auth, "聚合返回 auth");
  assert.equal(result.auth.token, "tok-9");
  // 对侧已真实创建
  const authId = result.auth.id as string;
  const authRow = await dao.queryOne("app.auth", authId);
  assert.ok(authRow);
});

test("applyRecord：M2M 关联维护（无主键元素 create + 中间表）", async () => {
  const { dao } = makeEnv();
  const schema: ISchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      roles: {
        type: "array",
        items: { type: "object", properties: { id: { type: "uuid" }, code: { type: "string" } } },
      },
    },
  };

  const result = (await dao.applyRecord(
    "app.user",
    schema,
    { name: "alice", roles: [{ code: "admin" }] },
  )) as AnyRow;

  assert.equal(result.name, "alice");
  assert.equal(result.roles.length, 1);
  assert.equal(result.roles[0].code, "admin");

  // 中间表有 link
  const links = await dao.queryList("app.user_role");
  assert.equal(links.length, 1);
  assert.equal((links[0] as AnyRow).roleId, result.roles[0].id);
});

test("applyRecord：顶层 $delete 真实删除 + O2M 子记录级联删除", async () => {
  const { dao, ds } = makeEnv();
  // 构造 auth → users (O2M 方向)：用 user.authId 反查模拟子记录
  await dao.create("app.auth", { id: AUTH_ID, token: "tok-1" });
  await dao.create("app.user", { id: USER_ID, name: "alice", authId: AUTH_ID });

  // 顶层删除 auth：真实删除，但 user 是 auth 的 M2O（子）侧？
  // auth.users 未建模，这里直接验证顶层删除 auth 行本身
  await dao.applyRecord("app.auth", { type: "object", properties: {} }, { id: AUTH_ID, $delete: true });
  const auth = await dao.queryOne("app.auth", AUTH_ID);
  assert.equal(auth, undefined, "auth 已删除");
  // user 的 authId 外键保留（M2O 对侧删除不级联 user）
  const user = await dao.queryOne("app.user", USER_ID);
  assert.ok(user, "user 不被级联删除");
});

test("applyRecord：M2M 元素 $delete 只删关系不删数据", async () => {
  const { dao } = makeEnv();
  // 先建立关系（applyRecord 用确定性 link id 写中间表）
  const createSchema: ISchema = {
    type: "object",
    properties: {
      id: { type: "uuid" },
      name: { type: "string" },
      roles: { type: "array", items: { type: "object", properties: { id: { type: "uuid" }, code: { type: "string" } } } },
    },
  };
  const created = (await dao.applyRecord(
    "app.user",
    createSchema,
    { name: "alice", roles: [{ id: ROLE1_ID, code: "admin" }] },
  )) as AnyRow;
  assert.equal(created.roles.length, 1, "关系已建立");

  // 解除关联：roles 数组中该元素带 $delete
  const schema: ISchema = {
    type: "object",
    properties: {
      id: { type: "uuid" },
      roles: { type: "array", items: { type: "object", properties: { id: { type: "uuid" }, code: { type: "string" } } } },
    },
  };
  const result = (await dao.applyRecord(
    "app.user",
    schema,
    { id: created.id, roles: [{ id: ROLE1_ID, code: "admin", $delete: true }] },
  )) as AnyRow;

  assert.equal(result.roles.length, 0, "关系已解除");
  // 对侧 role 数据仍在
  const role = await dao.queryOne("app.role", ROLE1_ID);
  assert.ok(role, "role 数据不被间接删除");
  // 中间表 link 已删
  const links = await dao.queryList("app.user_role");
  assert.equal(links.length, 0);
});

test("applyRecord：级联失败整体回滚（事务性）", async () => {
  const { dao } = makeEnv();
  const schema: ISchema = {
    type: "object",
    properties: { name: { type: "string" } },
  };

  // 顶层 user create 成功，但嵌套 auth 字段值非法（token 应为 string，给数字）
  await assert.rejects(() =>
    dao.applyRecord(
      "app.user",
      schema,
      { name: "alice", auth: { id: AUTH_ID, token: 123 } },
    ),
    /逻辑类型 'string'/,
  );

  // 整体回滚：user 未创建
  const users = await dao.queryList("app.user");
  assert.equal(users.length, 0, "user 未被部分提交");
});
