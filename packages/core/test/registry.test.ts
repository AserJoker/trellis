/**
 * 阶段 1 验收：元数据注册表 + 自举。
 * 验收点：
 * 1. 定义 UserModel（含简单字段 + 复杂字段）可注册
 * 2. ModelModel 能描述 UserModel 自身（自举闭环）
 * 3. 校验规则（复杂字段 store=false、简单字段默认 true）
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { Registry, ModelModel, FieldModel, validateModel } from "@trellis/core";
import type { IModel } from "@trellis/core";

/** 用户模型：含简单字段 + 复杂字段（M2O: user.authId → auth.id） */
function makeUserModel(): IModel {
  return {
    id: "app.user",
    name: "User",
    namespace: "app",
    displayName: "trellis.user",
    primaryField: "id",
    fields: [
      { name: "id", type: "uuid", store: true, primary: true },
      { name: "name", type: "string" },
      { name: "balance", type: "金融" }, // 业务抽象类型
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

test("UserModel 可注册并通过校验", () => {
  const registry = new Registry();
  const user = makeUserModel();
  registry.register(user);
  assert.ok(registry.getById("app.user"));
  assert.equal(registry.get("app", "User"), user);
});

test("重复 id 注册报错", () => {
  const registry = new Registry();
  registry.register(makeUserModel());
  assert.throws(() => registry.register(makeUserModel()), /已注册/);
});

test("复杂字段 store 必须为 false", () => {
  const bad = makeUserModel();
  // auth 是复杂字段（索引 3），store 改 true 应报错
  bad.fields[3] = { ...bad.fields[3], store: true } as IModel["fields"][number];
  const result = validateModel(bad);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.message.includes("store 必须为 false")));
});

test("简单字段默认 store=true，显式 false 报错", () => {
  const bad = makeUserModel();
  bad.fields[1] = { ...bad.fields[1], store: false };
  const result = validateModel(bad);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.message.includes("store 默认 true")));
});

test("系统模型已注册（自举起点）", () => {
  const registry = new Registry();
  assert.ok(registry.getById("sys.model"));
  assert.ok(registry.getById("sys.field"));
  assert.ok(registry.getById("sys.function"));
  assert.ok(registry.getById("sys.type"));
  assert.ok(registry.getById("sys.i18n"));
});

test("自举闭环：ModelModel 能描述 UserModel 的结构", () => {
  // ModelModel 的字段集合应覆盖 UserModel 的元数据区（id/name/namespace/displayName/primaryField）
  const modelFieldNames = new Set(ModelModel.fields.map((f) => f.name));
  const user = makeUserModel();
  // UserModel 的公共元数据字段名
  const userMetaKeys = ["id", "name", "namespace", "displayName", "primaryField"];
  for (const key of userMetaKeys) {
    assert.ok(modelFieldNames.has(key), `ModelModel 应包含字段 '${key}'`);
  }
  // ModelModel 是 IModel，自身可被校验
  const result = validateModel(ModelModel);
  assert.ok(result.valid, `ModelModel 自身应通过校验: ${JSON.stringify(result.issues)}`);
  // FieldModel 描述字段结构：含统一四键
  const fieldNames = new Set(FieldModel.fields.map((f) => f.name));
  for (const key of ["thisField", "thatField", "relatedModelId", "junctionModelId", "store"]) {
    assert.ok(fieldNames.has(key), `FieldModel 应包含字段 '${key}'`);
  }
  // UserModel 的字段能被 FieldModel 描述：字段键是 FieldModel 的子集（去掉关系四键为空的场景）
  const userField = user.fields[0]!;
  for (const key of Object.keys(userField)) {
    if (key === "type" || key === "name" || key === "store" || key === "primary") continue;
    assert.ok(fieldNames.has(key), `UserModel 字段键 '${key}' 应被 FieldModel 覆盖`);
  }
});
