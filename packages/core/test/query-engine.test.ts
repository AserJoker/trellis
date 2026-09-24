/**
 * 阶段 2 验收：查询聚合引擎。
 * 验收点：
 * 1. user → auth 的 M2O 查询返回聚合后的 user.auth 对象
 * 2. O2M / O2O / M2M 各自递归聚合正确
 * 3. 类型映射正确（「金融」→ 字符串高精度数字）
 * 4. 复杂字段 store=false 不落库，查询时聚合返回
 * 5. 循环引用防护（递归互引不爆栈）
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  Registry,
  InMemoryDataSource,
  QueryEngine,
  createDefaultTypeRegistry,
  TypeRegistry,
  cleanStoredRow,
} from "@trellis/core";
import type { IModel, IType } from "@trellis/core";

/** 聚合结果行：宽松类型便于断言（运行时由 node:test 保证） */
type AnyRow = Record<string, any>;

/**
 * 测试域模型：
 * - auth（认证信息）
 * - user（用户）：M2O auth、O2O profile、M2M roles
 * - profile（资料）：O2O 对侧
 * - role（角色）：M2M 对侧
 * - user_profile / user_role：中间模型
 */

function makeModels(): IModel[] {
  const auth: IModel = {
    id: "app.auth",
    name: "Auth",
    namespace: "app",
    primaryField: "id",
    fields: [
      { name: "id", type: "uuid", store: true, primary: true },
      { name: "token", type: "string", store: true },
      {
        name: "users",
        type: "One2Many",
        store: false,
        thisField: "id",
        thatField: "authId",
        relatedModelId: "app.user",
      },
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
      { name: "authId", type: "uuid", store: true }, // 外键列
      { name: "balance", type: "金融", store: true }, // 业务抽象类型
      {
        name: "auth",
        type: "Many2One",
        store: false,
        thisField: "authId",
        thatField: "id",
        relatedModelId: "app.auth",
      },
      {
        name: "profile",
        type: "One2One",
        store: false,
        thisField: "userId",
        thatField: "profileId",
        relatedModelId: "app.profile",
        junctionModelId: "app.user_profile",
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

  const profile: IModel = {
    id: "app.profile",
    name: "Profile",
    namespace: "app",
    primaryField: "id",
    fields: [
      { name: "id", type: "uuid", store: true, primary: true },
      { name: "bio", type: "string", store: true },
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

  // 中间模型
  const userProfile: IModel = {
    id: "app.user_profile",
    name: "UserProfile",
    namespace: "app",
    primaryField: "id",
    fields: [
      { name: "id", type: "uuid", store: true, primary: true },
      { name: "userId", type: "uuid", store: true },
      { name: "profileId", type: "uuid", store: true },
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

  return [auth, user, profile, role, userProfile, userRole];
}

function makeEnv() {
  const registry = new Registry();
  for (const m of makeModels()) registry.register(m);
  const ds = new InMemoryDataSource();
  const types = createDefaultTypeRegistry();
  // 注册「金融」业务类型 → 高精度十进制（字符串承载）
  const finance: IType = { name: "金融", logicalType: "decimal" };
  types.register(finance);
  const engine = new QueryEngine(registry, ds, types);
  return { registry, ds, types, engine };
}

const AUTH_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";
const PROFILE_ID = "33333333-3333-3333-3333-333333333333";
const ROLE1_ID = "44444444-4444-4444-4444-444444444444";
const ROLE2_ID = "55555555-5555-5555-5555-555555555555";

test("M2O：user → auth 查询返回聚合后的 user.auth 对象", async () => {
  const { ds, engine } = makeEnv();
  await ds.put("app.auth", { id: AUTH_ID, token: "tok-1" });
  await ds.put("app.user", { id: USER_ID, name: "alice", authId: AUTH_ID, balance: "100.50" });

  const result = (await engine.query("app.user", USER_ID)) as AnyRow;
  assert.ok(result);
  assert.equal(result.name, "alice");
  assert.ok(result.auth, "应聚合出 auth 对象");
  assert.equal(result.auth.token, "tok-1");
  assert.equal(result.auth.id, AUTH_ID);
});

test("O2M：auth → users 查询返回聚合后的 users 数组", async () => {
  const { ds, engine } = makeEnv();
  await ds.put("app.auth", { id: AUTH_ID, token: "tok-1" });
  await ds.put("app.user", { id: USER_ID, name: "alice", authId: AUTH_ID, balance: "1" });
  await ds.put("app.user", { id: "66666666-6666-6666-6666-666666666666", name: "bob", authId: AUTH_ID, balance: "2" });

  const result = (await engine.query("app.auth", AUTH_ID)) as AnyRow;
  assert.ok(result);
  assert.equal(result.users.length, 2, "应聚合出两个 user");
  assert.deepEqual(
    result.users.map((u: { name: string }) => u.name).sort(),
    ["alice", "bob"],
  );
});

test("O2O：user → profile 通过中间表聚合", async () => {
  const { ds, engine } = makeEnv();
  await ds.put("app.user", { id: USER_ID, name: "alice", authId: AUTH_ID, balance: "1" });
  await ds.put("app.profile", { id: PROFILE_ID, bio: "hello" });
  // 中间表：user_profile(userId, profileId)
  await ds.put("app.user_profile", { id: "j1", userId: USER_ID, profileId: PROFILE_ID });

  const result = (await engine.query("app.user", USER_ID)) as AnyRow;
  assert.ok(result);
  assert.ok(result.profile, "应聚合出 profile 对象");
  assert.equal(result.profile.bio, "hello");
});

test("M2M：user → roles 通过中间表聚合为数组", async () => {
  const { ds, engine } = makeEnv();
  await ds.put("app.user", { id: USER_ID, name: "alice", authId: AUTH_ID, balance: "1" });
  await ds.put("app.role", { id: ROLE1_ID, code: "admin" });
  await ds.put("app.role", { id: ROLE2_ID, code: "editor" });
  await ds.put("app.user_role", { id: "j1", userId: USER_ID, roleId: ROLE1_ID });
  await ds.put("app.user_role", { id: "j2", userId: USER_ID, roleId: ROLE2_ID });

  const result = (await engine.query("app.user", USER_ID)) as AnyRow;
  assert.ok(result);
  assert.equal(result.roles.length, 2);
  assert.deepEqual(
    result.roles.map((r: { code: string }) => r.code).sort(),
    ["admin", "editor"],
  );
});

test("类型映射：「金融」字段以字符串高精度数字存取", async () => {
  const { ds, engine, types, registry } = makeEnv();
  await ds.put("app.user", { id: USER_ID, name: "alice", authId: AUTH_ID, balance: "100.50" });

  const result = (await engine.query("app.user", USER_ID)) as AnyRow;
  assert.equal(result.balance, "100.50");

  // 清洗校验：非法的金融值（浮点）应报错
  const userModel = registry.getById("app.user")!;
  assert.throws(() => cleanStoredRow(userModel, { balance: 100.5 }, types), /逻辑类型 'decimal'/);
});

test("复杂字段 store=false 不落库，查询时聚合返回", async () => {
  const { ds, engine, types, registry } = makeEnv();
  const userModel = registry.getById("app.user")!;
  await ds.put("app.auth", { id: AUTH_ID, token: "tok-1" });
  await ds.put("app.user", { id: USER_ID, name: "alice", authId: AUTH_ID, balance: "1" });

  // 清洗后的存储行：不含复杂字段（auth/roles/profile）
  const row = await ds.get("app.user", USER_ID);
  const stored = cleanStoredRow(userModel, row!, types);
  assert.equal(stored.auth, undefined);
  assert.equal(stored.roles, undefined);
  assert.equal(stored.profile, undefined);

  // 查询时复杂字段被聚合返回
  const result = (await engine.query("app.user", USER_ID)) as AnyRow;
  assert.ok(result.auth);
});

test("循环引用防护：互引模型不无限递归", async () => {
  // 构造 user.auth → auth.users → user... 循环
  const { ds, engine } = makeEnv();
  await ds.put("app.auth", { id: AUTH_ID, token: "tok-1" });
  await ds.put("app.user", { id: USER_ID, name: "alice", authId: AUTH_ID, balance: "1" });

  const result = (await engine.query("app.user", USER_ID, { maxDepth: 3 })) as AnyRow;
  assert.ok(result);
  assert.ok(result.auth, "user 聚合出 auth");
  assert.ok(result.auth.users, "auth 反向聚合出 users");
  // 深度限制生效，不爆栈
  assert.equal(typeof result.auth.users[0].name, "string");
});
