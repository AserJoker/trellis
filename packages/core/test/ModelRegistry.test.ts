/**
 * ModelRegistry 测试（node:test）。
 * 覆盖：系统自举表建表 + seed（真实表，存 store）、virtual model 注册/查询/移除、
 * 非 virtual 从 store 装配、无 store 返回 undefined、id 一致性校验。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ModelRegistry, type IModel, type IStore } from "../dist/index.js";
import { MemoryStore } from "./helpers/memoryStore.ts";

/** 触发 ensureSystemTables：系统表建表 + seed 初始行。 */
async function bootstrap(reg: ModelRegistry): Promise<void> {
  await reg.hasModel("sys.model");
}

/** 往表里塞业务行（模拟 store 已有业务数据）。 */
function seedStoreTables(store: IStore, rows: { model: Record<string, unknown>[]; field: Record<string, unknown>[]; function: Record<string, unknown>[]; edge: Record<string, unknown>[]; enumItem: Record<string, unknown>[] }) {
  const ms = store as unknown as { seed: (id: string, rows: Record<string, unknown>[]) => void };
  ms.seed("sys.model", rows.model);
  ms.seed("sys.field", rows.field);
  ms.seed("sys.function", rows.function);
  ms.seed("sys.function_edge", rows.edge);
  ms.seed("sys.enum_item", rows.enumItem);
}

test("系统自举表：五张表默认内置注册（isSystemModel），有 store 时建表 + seed 可查询", async () => {
  const store = new MemoryStore();
  const reg = new ModelRegistry({ store });
  for (const id of [
    "sys.model",
    "sys.field",
    "sys.function",
    "sys.enum_item",
    "sys.function_edge",
  ]) {
    assert.equal(reg.isSystemModel(id), true, `${id} 应为系统表`);
  }
  await bootstrap(reg);
  for (const id of [
    "sys.model",
    "sys.field",
    "sys.function",
    "sys.enum_item",
    "sys.function_edge",
  ]) {
    const m = await reg.getModel(id);
    assert.ok(m, `${id} 应可从 store 装配`);
    assert.equal(m.virtual, false, `${id} 是真实表`);
    assert.equal(m.primaryField, "id");
  }
});

test("系统自举表：无 store 时不可查询（真实表依赖 store）", async () => {
  const reg = new ModelRegistry();
  assert.equal(reg.isSystemModel("sys.model"), true);
  assert.equal(await reg.getModel("sys.model"), undefined);
});

test("系统自举表：ensureSystemTables 幂等（重复触发不重复 seed）", async () => {
  const store = new MemoryStore();
  const reg = new ModelRegistry({ store });
  await bootstrap(reg);
  await bootstrap(reg);
  const { total } = await store.query("sys.model");
  assert.equal(total, 5, "sys.model 应只有 5 行系统行，不重复 seed");
});

test("系统自举表：字段 id 点分一致（sys.field 挂在 sys.model 下）", async () => {
  const store = new MemoryStore();
  const reg = new ModelRegistry({ store });
  await bootstrap(reg);
  const field = await reg.getModel("sys.field");
  assert.ok(field);
  // field 表自己的字段 namespace 都是 "sys.field"，id = "sys.field.<name>"
  const idField = field.fields.find((f) => f.name === "id");
  assert.ok(idField);
  assert.equal(idField.id, "sys.field.id");
  assert.equal(idField.namespace, "sys.field");
  // sys.model 的 functions 关系字段指向 sys.function
  const model = await reg.getModel("sys.model");
  assert.ok(model);
  const funcsRel = model.fields.find((f) => f.name === "functions");
  assert.ok(funcsRel);
  assert.equal(funcsRel.type, "one2many");
  assert.equal(funcsRel.referenceModel, "sys.function");
  // enum 字段 items 装配（sys.field.type 的 10 项）
  const typeField = field.fields.find((f) => f.name === "type");
  assert.ok(typeField);
  assert.equal(typeField.type, "enum");
  assert.ok(typeField.items.length > 0, "enum 字段应装配 items");
});

test("virtual model：注册进内存，getModel 直查，unregister 移除", async () => {
  const reg = new ModelRegistry();
  const user: IModel = {
    id: "biz.user",
    namespace: "biz",
    name: "user",
    primaryField: "id",
    virtual: true,
    fields: [
      { id: "biz.user.id", namespace: "biz.user", name: "id", type: "integer" },
      { id: "biz.user.username", namespace: "biz.user", name: "username", type: "string" },
    ],
    functions: [],
  };
  reg.registerModel(user);
  assert.equal(await reg.hasModel("biz.user"), true);
  const got = await reg.getModel("biz.user");
  assert.ok(got);
  assert.equal(got.id, "biz.user");
  assert.equal(got.virtual, true);
  assert.equal(got.fields.length, 2);

  reg.unregisterModel("biz.user");
  assert.equal(await reg.hasModel("biz.user"), false);
  assert.equal(await reg.getModel("biz.user"), undefined);
});

test("virtual model：重复注册报错", async () => {
  const reg = new ModelRegistry();
  reg.registerModel({
    id: "biz.x",
    namespace: "biz",
    name: "x",
    primaryField: "id",
    virtual: true,
    fields: [],
    functions: [],
  });
  assert.throws(
    () =>
      reg.registerModel({
        id: "biz.x",
        namespace: "biz",
        name: "x",
        primaryField: "id",
        virtual: true,
        fields: [],
        functions: [],
      }),
    /Duplicate model registration: biz\.x/,
  );
});

test("id 一致性校验：namespace+name 与 id 不符报错", async () => {
  const reg = new ModelRegistry();
  assert.throws(
    () =>
      reg.registerModel({
        id: "biz.wrong",
        namespace: "biz",
        name: "actual",
        primaryField: "id",
        virtual: true,
        fields: [],
        functions: [],
      }),
    /id mismatch/,
  );
});

test("非 virtual model：从 store 查询装配（字段/函数/边/枚举项）", async () => {
  const store = new MemoryStore();
  const reg = new ModelRegistry({ store });
  await bootstrap(reg);
  seedStoreTables(store, {
    model: [
      {
        id: "biz.user",
        namespace: "biz",
        name: "user",
        primaryField: "id",
        virtual: false,
      },
    ],
    field: [
      { id: "biz.user.id", namespace: "biz.user", name: "id", type: "integer" },
      { id: "biz.user.username", namespace: "biz.user", name: "username", type: "string" },
      {
        id: "biz.user.status",
        namespace: "biz.user",
        name: "status",
        type: "enum",
      },
    ],
    function: [
      {
        id: "biz.user.login",
        namespace: "biz.user",
        name: "login",
        entry: "sys.add",
        output: "test.pass",
        local: false,
      },
    ],
    edge: [
      {
        id: "biz.user.login.e0",
        namespace: "biz.user.login",
        name: "e0",
        fromNode: "",
        fromField: "",
        toNode: "sys.add",
        toField: "a",
        constant: "1",
      },
    ],
    enumItem: [
      {
        id: "biz.user.status.active",
        namespace: "biz.user.status",
        name: "active",
        value: "active",
      },
      {
        id: "biz.user.status.disabled",
        namespace: "biz.user.status",
        name: "disabled",
        value: "disabled",
      },
    ],
  });

  // 热重启场景：非 virtual 无需 registerModel，直接 getModel 走 store 查
  const m = await reg.getModel("biz.user");
  assert.ok(m, "非 virtual 应从 store 装配");
  assert.equal(m.virtual, false);
  assert.equal(m.primaryField, "id");

  // 字段（只装配 namespace=biz.user 的行，不受系统字段行干扰）
  assert.equal(m.fields.length, 3);
  const status = m.fields.find((f) => f.name === "status");
  assert.ok(status && status.type === "enum");
  assert.equal(status.items.length, 2);
  assert.equal(status.items[0]?.value, "active");
  const idField = m.fields.find((f) => f.name === "id");
  assert.ok(idField && idField.type === "integer");

  // 函数 + 边（constant JSON 反序列化）
  assert.equal(m.functions.length, 1);
  const login = m.functions[0];
  assert.ok(login);
  assert.equal(login.entry, "sys.add");
  assert.equal(login.edges.length, 1);
  const e0 = login.edges[0];
  assert.ok(e0);
  assert.equal(e0.toNode, "sys.add");
  assert.equal(e0.constant, 1, "constant 应为 JSON 反序列化后的值");
});

test("非 virtual model：无 store 时返回 undefined", async () => {
  const reg = new ModelRegistry();
  assert.equal(await reg.getModel("biz.no"), undefined);
  assert.equal(await reg.hasModel("biz.no"), false);
});

test("非 virtual model：store 中无该行返回 undefined", async () => {
  const store = new MemoryStore();
  const reg = new ModelRegistry({ store });
  await bootstrap(reg);
  assert.equal(await reg.getModel("biz.ghost"), undefined);
});

test("listModels：合并 virtual 常驻 + 非 virtual store 全量（含系统表）", async () => {
  const store = new MemoryStore();
  const reg = new ModelRegistry({ store });
  await bootstrap(reg);
  seedStoreTables(store, {
    model: [
      { id: "biz.user", namespace: "biz", name: "user", primaryField: "id", virtual: false },
    ],
    field: [],
    function: [],
    edge: [],
    enumItem: [],
  });
  reg.registerModel({
    id: "biz.vm",
    namespace: "biz",
    name: "vm",
    primaryField: "id",
    virtual: true,
    fields: [],
    functions: [],
  });

  const all = await reg.listModels();
  const ids = all.map((m) => m.id);
  // 5 张系统表 + biz.vm + biz.user
  assert.ok(ids.includes("biz.vm"));
  assert.ok(ids.includes("biz.user"));
  assert.ok(ids.includes("sys.model"));
  assert.equal(ids.length, 7);
});
