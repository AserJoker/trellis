/**
 * 监控 / 断点 / 状态快照测试（node:test）。
 * 覆盖：事件流订阅（execute-start→node-run→node-emit→node-done→execution-done）、
 * 原子上断点暂停（execute 保持 pending）+ resume 继续、getExecution/getNodeState 快照。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FunctionExecutor,
  type IAtomNode,
  type IFunction,
  type IFunctionEdge,
} from "../dist/index.js";

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

function build(fn: IFunction) {
  const ex = new FunctionExecutor({});
  ex.registerAtom(passAtom);
  ex.registerFunction(fn);
  return ex;
}

/** 简单两节点图：常量 → pass。 */
function simpleFn(): IFunction {
  return {
    id: "t.simple",
    namespace: "t",
    name: "simple",
    local: false,
    edges: [constEdge("test.pass", "value", "a")],
    entry: "test.pass",
    output: "test.pass",
  };
}

test("事件流：订阅事件断言执行序列", async () => {
  const ex = build(simpleFn());
  const events: string[] = [];
  let execId = "";
  ex.on("execute-start", (p) => {
    execId = p.executionId;
    events.push("start");
  });
  ex.on("node-ready", (p) => events.push(`ready:${p.nodeId}`));
  ex.on("node-run", (p) => events.push(`run:${p.nodeId}`));
  ex.on("node-emit", (p) => events.push(`emit:${p.nodeId}:${p.field}`));
  ex.on("node-done", (p) => events.push(`done:${p.nodeId}`));
  ex.on("execution-done", () => events.push("exec-done"));

  const result = await ex.execute("t.simple", {});
  assert.deepEqual(result, { value: "a" });
  assert.deepEqual(events, [
    "start",
    "ready:test.pass",
    "run:test.pass",
    "emit:test.pass:value",
    "done:test.pass",
    "exec-done",
  ]);
  assert.ok(execId.startsWith("exec-"), `executionId 格式: ${execId}`);
  // 执行完成后从活跃执行移除
  assert.equal(ex.getExecutions().length, 0);
});

test("事件流：退订后不再收到事件", async () => {
  const ex = build(simpleFn());
  let count = 0;
  const off = ex.on("node-run", () => count++);
  await ex.execute("t.simple", {});
  assert.equal(count, 1);
  off();
  await ex.execute("t.simple", {});
  assert.equal(count, 1, "退订后不再触发");
});

test("断点：命中暂停（execute 保持 pending）→ getNodeState 快照 → resume 继续", async () => {
  const ex = build(simpleFn());
  let paused: Array<{ executionId: string; nodeId: string }> = [];
  ex.on("node-paused", (p) => paused.push(p));
  ex.addBreakpoint("t.simple", "test.pass");
  assert.deepEqual(ex.listBreakpoints(), [
    { functionId: "t.simple", nodeId: "test.pass" },
  ]);

  const promise = ex.execute("t.simple", {});
  // 断点命中：执行挂起不 resolve
  const winner = await Promise.race([
    promise.then(() => "resolved"),
    new Promise((r) => setTimeout(() => r("pending"), 30)),
  ]);
  assert.equal(winner, "pending", "断点命中后 execute 应保持 pending");

  // 快照：execution 与节点都处于 paused
  const execs = ex.getExecutions();
  assert.equal(execs.length, 1);
  const exec = execs[0];
  assert.ok(exec, "暂停后应有活跃执行");
  assert.equal(exec.status, "paused");
  const execId = exec.id;
  const node = ex.getNodeState(execId, "test.pass");
  assert.ok(node);
  assert.equal(node.status, "paused");
  assert.deepEqual(node.slots, { value: "a" });
  assert.deepEqual(node.missing, []);
  assert.deepEqual(node.emitted, {});
  assert.equal(paused.length, 1);
  assert.equal(paused[0]?.nodeId, "test.pass");

  // resume：放行暂停节点，正常完成
  ex.resume(execId);
  const result = await promise;
  assert.deepEqual(result, { value: "a" });
  assert.equal(ex.getExecutions().length, 0);
});

test("断点：resume 只放行当前暂停点，再次执行到断点仍暂停", async () => {
  const ex = build(simpleFn());
  ex.addBreakpoint("t.simple", "test.pass");

  // 第一次执行：命中暂停 → resume
  const p1 = ex.execute("t.simple", {});
  await new Promise((r) => setTimeout(r, 10));
  const e1 = ex.getExecutions()[0];
  assert.ok(e1, "第一次执行应处于活跃");
  assert.equal(e1.status, "paused");
  ex.resume(e1.id);
  assert.deepEqual(await p1, { value: "a" });

  // 第二次执行：仍会再次命中断点暂停（断点未被移除）
  const p2 = ex.execute("t.simple", {});
  const winner = await Promise.race([
    p2.then(() => "resolved"),
    new Promise((r) => setTimeout(() => r("pending"), 30)),
  ]);
  assert.equal(winner, "pending", "断点每次命中都暂停");

  ex.removeBreakpoint("t.simple", "test.pass");
  assert.deepEqual(ex.listBreakpoints(), []);
  const e2 = ex.getExecutions()[0];
  assert.ok(e2, "第二次执行应处于活跃");
  ex.resume(e2.id);
  assert.deepEqual(await p2, { value: "a" });
});

test("断点：output 节点上断点 → 暂停时能看到已 emit 的输出", async () => {
  // 两节点：常量 → passA（中间节点）→ passB（output）
  const ex = new FunctionExecutor({});
  ex.registerAtom(passAtom);
  ex.registerAtom({
    id: "test.passB",
    namespace: "test",
    name: "passB",
    version: "1.0.0",
    inputs: ["value"],
    outputs: ["value"],
    async fn(input, ctx) {
      ctx.emit("value", input.value);
    },
  });
  ex.registerFunction({
    id: "t.chain",
    namespace: "t",
    name: "chain",
    local: false,
    edges: [
      constEdge("test.pass", "value", 7),
      edge("test.pass", "value", "test.passB", "value"),
    ],
    entry: "test.pass",
    output: "test.passB",
  });
  ex.addBreakpoint("t.chain", "test.passB");

  const promise = ex.execute("t.chain", {});
  const winner = await Promise.race([
    promise.then(() => "resolved"),
    new Promise((r) => setTimeout(() => r("pending"), 30)),
  ]);
  assert.equal(winner, "pending");

  const exec = ex.getExecutions()[0];
  assert.ok(exec, "暂停后应有活跃执行");
  assert.equal(exec.status, "paused");
  // passA 已完成并 emit 了 7；passB 停在 paused（slots 已就绪）
  const a = ex.getNodeState(exec.id, "test.pass");
  assert.ok(a, "passA 应有节点快照");
  assert.equal(a.status, "done");
  assert.deepEqual(a.emitted, { value: 7 });
  const b = ex.getNodeState(exec.id, "test.passB");
  assert.ok(b, "passB 应有节点快照");
  assert.equal(b.status, "paused");
  assert.deepEqual(b.slots, { value: 7 });

  ex.resume(exec.id);
  assert.deepEqual(await promise, { value: 7 });
});
