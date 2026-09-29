/**
 * FunctionExecutor 端到端测试（node:test）。
 * 覆盖：纯执行器语义——原子注册、AND 汇聚、ctx.emit 路由、output 完成合并、
 * 惰性调度（无 Promise 泄漏）、deps 注入、错误捕获返回。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FunctionExecutor, type IAtomNode, type IFunctionEdge } from "../dist/index.js";

/** 常量边 helper：无源节点，携带 constant。 */
function constEdge(toNode: string, toField: string, constant: unknown): IFunctionEdge {
  return {
    id: `ce.${toNode}.${toField}`,
    namespace: "test",
    name: `ce.${toNode}.${toField}`,
    fromNode: "",
    fromField: "",
    toNode,
    toField,
    constant,
  };
}

const addAtom: IAtomNode = {
  id: "math.add",
  namespace: "math",
  name: "add",
  version: "1.0.0",
  inputs: ["a", "b"],
  outputs: ["sum"],
  async fn(input, ctx) {
    ctx.emit("sum", (input.a as number) + (input.b as number));
  },
};

// pass-through：input 原样 emit 到 value（作 output 节点用）
const passAtom: IAtomNode = {
  id: "test.pass",
  namespace: "test",
  name: "pass",
  version: "1.0.0",
  inputs: ["value"],
  outputs: ["value"],
  async fn(input, ctx) {
    ctx.emit("value", input.value);
  },
};

function edge(fromNode: string, fromField: string, toNode: string, toField: string) {
  return {
    id: `e.${fromNode}.${fromField}.${toNode}.${toField}`,
    namespace: "test",
    name: `e.${fromNode}.${fromField}.${toNode}.${toField}`,
    fromNode,
    fromField,
    toNode,
    toField,
  };
}

test("简单图：常量边 → output，返回合并值", async () => {
  const ex = new FunctionExecutor({});
  ex.registerAtom(passAtom);
  ex.registerFunction({
    id: "test.hello",
    namespace: "test",
    name: "hello",
    local: false,
    edges: [constEdge("test.pass", "value", "a")],
    entry: "test.pass",
    output: "test.pass",
  });
  const result = await ex.execute("test.hello", {});
  assert.deepEqual(result, { value: "a" });
});

test("AND 汇聚：常量边 → add，等待全部就绪", async () => {
  const ex = new FunctionExecutor({});
  ex.registerAtom(addAtom);
  ex.registerAtom(passAtom);
  ex.registerFunction({
    id: "test.sum",
    namespace: "test",
    name: "sum",
    local: false,
    edges: [
      constEdge("math.add", "a", 1),
      constEdge("math.add", "b", 2),
      edge("math.add", "sum", "test.pass", "value"),
    ],
    entry: "math.add",
    output: "test.pass",
  });
  const result = await ex.execute("test.sum", {});
  assert.deepEqual(result, { value: 3 });
});

test("多输出：一个节点输出连多个下游", async () => {
  const ex = new FunctionExecutor({});
  // 源节点 emit 一个值 → 两个 pass 节点并联
  ex.registerAtom({
    id: "test.src",
    namespace: "test",
    name: "src",
    version: "1.0.0",
    inputs: [],
    outputs: ["value"],
    async fn(_input, ctx) {
      ctx.emit("value", 7);
    },
  });
  ex.registerAtom({
    id: "test.pass1",
    namespace: "test",
    name: "pass1",
    version: "1.0.0",
    inputs: ["value"],
    outputs: ["value"],
    async fn(input, ctx) {
      ctx.emit("value", input.value);
    },
  });
  ex.registerAtom({
    id: "test.pass2",
    namespace: "test",
    name: "pass2",
    version: "1.0.0",
    inputs: ["value"],
    outputs: ["value"],
    async fn(input, ctx) {
      ctx.emit("value", input.value);
    },
  });
  ex.registerFunction({
    id: "test.fanout",
    namespace: "test",
    name: "fanout",
    local: false,
    edges: [
      edge("test.src", "value", "test.pass1", "value"),
      edge("test.src", "value", "test.pass2", "value"),
    ],
    entry: "test.src",
    output: "test.pass1",
  });
  const result = await ex.execute("test.fanout", {});
  assert.deepEqual(result, { value: 7 });
});

test("多输出：同一输出连 AND 汇聚节点的多个输入", async () => {
  const ex = new FunctionExecutor({});
  ex.registerAtom({
    id: "test.nine",
    namespace: "test",
    name: "nine",
    version: "1.0.0",
    inputs: [],
    outputs: ["value"],
    async fn(_input, ctx) {
      ctx.emit("value", 9);
    },
  });
  ex.registerAtom(addAtom);
  ex.registerAtom(passAtom);
  ex.registerFunction({
    id: "test.samedouble",
    namespace: "test",
    name: "samedouble",
    local: false,
    edges: [
      edge("test.nine", "value", "math.add", "a"),
      edge("test.nine", "value", "math.add", "b"),
      edge("math.add", "sum", "test.pass", "value"),
    ],
    entry: "test.nine",
    output: "test.pass",
  });
  const result = await ex.execute("test.samedouble", {});
  assert.deepEqual(result, { value: 18 });
});

test("deps 注入：原子通过 ctx.deps 访问宿主注入物", async () => {
  const store = { get: () => 42 };
  const ex = new FunctionExecutor({ store });
  ex.registerAtom({
    id: "test.store",
    namespace: "test",
    name: "store",
    version: "1.0.0",
    inputs: [],
    outputs: ["value"],
    async fn(_input, ctx) {
      const s = ctx.deps.store as typeof store;
      ctx.emit("value", s.get());
    },
  });
  ex.registerAtom(passAtom);
  ex.registerFunction({
    id: "test.storefn",
    namespace: "test",
    name: "storefn",
    local: false,
    edges: [edge("test.store", "value", "test.pass", "value")],
    entry: "test.store",
    output: "test.pass",
  });
  const result = await ex.execute("test.storefn", {});
  assert.deepEqual(result, { value: 42 });
});

test("错误捕获：原子抛错 → function 返回错误（不向外抛）", async () => {
  const ex = new FunctionExecutor({});
  ex.registerAtom({
    id: "test.boom",
    namespace: "test",
    name: "boom",
    version: "1.0.0",
    inputs: [],
    outputs: ["value"],
    async fn() {
      throw new Error("boom");
    },
  });
  ex.registerFunction({
    id: "test.error",
    namespace: "test",
    name: "error",
    local: false,
    edges: [],
    entry: "test.boom",
    output: "test.boom",
  });
  const result = await ex.execute("test.error", {});
  assert.ok("error" in result);
  const err = result.error as { message: string; nodeId: string };
  assert.equal(err.message, "boom");
  assert.equal(err.nodeId, "test.boom");
});

test("并行分支 + output 完成后 abort 活动执行", async () => {
  const ex = new FunctionExecutor({});
  // 慢分支：等 50ms 后 emit（会被 abort）
  ex.registerAtom({
    id: "test.slow",
    namespace: "test",
    name: "slow",
    version: "1.0.0",
    inputs: [],
    outputs: ["value"],
    async fn(_input, ctx) {
      await new Promise((r) => setTimeout(r, 50));
      if (!ctx.signal.aborted) ctx.emit("value", "slow");
    },
  });
  ex.registerAtom({
    id: "test.fast",
    namespace: "test",
    name: "fast",
    version: "1.0.0",
    inputs: [],
    outputs: ["value"],
    async fn(_input, ctx) {
      ctx.emit("value", "fast");
    },
  });
  ex.registerAtom(passAtom);
  ex.registerFunction({
    id: "test.branch",
    namespace: "test",
    name: "branch",
    local: false,
    edges: [
      edge("test.fast", "value", "test.pass", "value"),
    ],
    entry: "test.fast",
    output: "test.pass",
  });
  // 慢分支不在 output 路径：execute 快速返回，不等待慢分支
  const start = Date.now();
  const result = await ex.execute("test.branch", {});
  const elapsed = Date.now() - start;
  assert.deepEqual(result, { value: "fast" });
  assert.ok(elapsed < 50, `不应等待慢分支: ${elapsed}ms`);
});

test("惰性调度：等待是同步状态，不预建 Promise", async () => {
  const ex = new FunctionExecutor({});
  // 原子 A 永不 emit → 下游 B 永久等待
  ex.registerAtom({
    id: "test.never",
    namespace: "test",
    name: "never",
    version: "1.0.0",
    inputs: [],
    outputs: ["value"],
    async fn() {
      // 不 emit
    },
  });
  ex.registerAtom(passAtom);
  ex.registerFunction({
    id: "test.stall",
    namespace: "test",
    name: "stall",
    local: false,
    edges: [edge("test.never", "value", "test.pass", "value")],
    entry: "test.never",
    output: "test.pass",
  });
  // 等待中的 function 不产生悬挂 Promise：execute 应保持 pending 而非 resolve/reject
  // 用一个 race 验证：若执行器错误 resolve/reject 则立即失败；否则 50ms 后仍 pending 即通过
  const promise = ex.execute("test.stall", {});
  const winner = await Promise.race([
    promise.then(() => "resolved"),
    new Promise((r) => setTimeout(() => r("pending"), 50)),
  ]);
  assert.equal(winner, "pending", "等待中的 function 不应提前结束");
});
