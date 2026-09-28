/**
 * Function 执行引擎端到端测试（node:test）。
 * 覆盖：纯执行器语义——原子注册、AND 汇聚、ctx.emit 路由、output 完成合并、
 * 惰性调度（无 Promise 泄漏）、deps 注入、错误捕获返回。
 *
 * 引擎 API 约定（用户实现）：
 *   - createEngine(deps): Engine          // deps 为宿主注入物（如 { store }）
 *   - engine.registerAtom(node): void     // 注册原子操作
 *   - engine.registerFunction(fn): void   // 注册 function（IFunction）
 *   - engine.execute(id, params): Promise<Record<string, unknown>>
 *     // 执行 function，返回 output 节点全部 outputs 字段合并
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// 注册一个简单原子：常量节点（无入边，emit 一个固定值）
// 原子实现约定：fn(input, ctx)，结果经 ctx.emit(field, value) 发出
function constAtom(value: unknown) {
  return {
    id: `const.${String(value)}`,
    namespace: "const",
    name: String(value),
    version: "1.0.0",
    inputs: [],
    outputs: ["value"],
    async fn(_input: Record<string, unknown>, ctx: any) {
      ctx.emit("value", value);
    },
  };
}

// 简单加法原子：inputs={a, b}，outputs={sum}
const addAtom = {
  id: "math.add",
  namespace: "math",
  name: "add",
  version: "1.0.0",
  inputs: ["a", "b"],
  outputs: ["sum"],
  async fn(input: Record<string, unknown>, ctx: any) {
    ctx.emit("sum", (input.a as number) + (input.b as number));
  },
};

function buildEngine(deps: Record<string, unknown> = {}) {
  // TODO: 用户实现 createEngine
  // const engine = createEngine(deps);
  // engine.registerAtom(constAtom);
  // engine.registerAtom(addAtom);
  // return engine;
  throw new Error("engine not implemented");
}

test("简单图：常量 → output，返回合并值", async () => {
  const engine = buildEngine();
  engine.registerFunction({
    id: "test.hello",
    namespace: "test",
    name: "hello",
    local: false,
    edges: [
      { id: "e1", namespace: "test.hello", name: "e1",
        fromNode: "const.a", fromField: "value", toNode: "out", toField: "value" },
    ],
    entry: "const.a",
    output: "out",
  });
  // 需要注册 out 原子（pass-through：input 原样 emit）
  // const result = await engine.execute("test.hello", {});
  // assert.deepEqual(result, { value: "a" });
});

test("AND 汇聚：两个常量 → add，等待全部就绪", async () => {
  // const.result = await engine.execute("test.sum", {});
  // assert.deepEqual(result, { sum: 3 });
});

test("deps 注入：原子通过 ctx.deps 访问宿主注入物", async () => {
  // const engine = buildEngine({ store: { get: () => 42 } });
  // 原子 store.get → emit
  // const result = await engine.execute("test.store", {});
  // assert.deepEqual(result, { value: 42 });
});

test("错误捕获：原子抛错 → function 返回错误（不向外抛）", async () => {
  // const result = await engine.execute("test.error", {});
  // assert.ok("error" in result);
});

test("并行分支 + output 完成后 abort 活动执行", async () => {
  // 慢原子（等 50ms）+ 快 output → 慢原子被 abort（signal.aborted）
  // const result = await engine.execute("test.branch", {});
  // 断言慢原子未 emit / 已 abort，function 快速返回
});

test("惰性调度：等待是同步状态，不预建 Promise", async () => {
  // 原子 A 永不 emit → 下游 B 永久等待，engine.execute 不应挂起
  // 用 race + 超时断言：等待中的 function 不产生悬挂 Promise
});
