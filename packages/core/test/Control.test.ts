/**
 * 控制流扩展测试（node:test）。
 * 覆盖：OR 汇聚（IAtomNode.join="or"）、sys.switch 多路分支、sys.coalesce 空值兜底。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FunctionExecutor,
  type IAtomNode,
  type IFunction,
  type IFunctionEdge,
} from "../dist/index.js";

/** 透传原子：value → value。 */
function mkPass(id: string): IAtomNode {
  return {
    id,
    namespace: "test",
    name: id.split(".").pop() ?? id,
    version: "1.0.0",
    inputs: ["value"],
    outputs: ["value"],
    async fn(input, ctx) {
      ctx.emit("value", input.value);
    },
  };
}

/** OR 汇聚探针：inputs a/b 任一到达即执行；执行时取先到值（可能缺槽）。 */
const orProbeAtom: IAtomNode = {
  id: "test.orProbe",
  namespace: "test",
  name: "orProbe",
  version: "1.0.0",
  inputs: ["a", "b"],
  outputs: ["value"],
  join: "or",
  async fn(input, ctx) {
    ctx.emit("value", input.a ?? input.b);
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
  ex.registerAtom(mkPass("test.pass"));
  ex.registerAtom(mkPass("test.passA"));
  ex.registerAtom(mkPass("test.passB"));
  ex.registerAtom(orProbeAtom);
  ex.registerFunction(fn);
  return ex;
}

test("OR 汇聚：常量边单入边即触发（AND 语义会永久等待 b）", async () => {
  const ex = build({
    id: "t.or1",
    namespace: "t",
    name: "or1",
    local: false,
    edges: [
      constEdge("test.orProbe", "a", 42),
      edge("test.orProbe", "value", "test.pass", "value"),
    ],
    entry: "test.orProbe",
    output: "test.pass",
  });
  const result = await ex.execute("t.or1", {});
  assert.deepEqual(result, { value: 42 });
});

test("OR 汇聚：双源先到即执行，后到不重触发", async () => {
  const ex = build({
    id: "t.or2",
    namespace: "t",
    name: "or2",
    local: false,
    edges: [
      edge("src.a", "value", "test.orProbe", "a"),
      edge("src.b", "value", "test.orProbe", "b"),
      edge("test.orProbe", "value", "test.pass", "value"),
    ],
    entry: "src.a",
    output: "test.pass",
  });
  ex.registerAtom({
    id: "src.a",
    namespace: "src",
    name: "a",
    version: "1.0.0",
    inputs: [],
    outputs: ["value"],
    async fn(_input, ctx) {
      ctx.emit("value", 1);
    },
  });
  ex.registerAtom({
    id: "src.b",
    namespace: "src",
    name: "b",
    version: "1.0.0",
    inputs: [],
    outputs: ["value"],
    async fn(_input, ctx) {
      ctx.emit("value", 2);
    },
  });
  const result = await ex.execute("t.or2", {});
  // 派发序 src.a 先执行 → orProbe 收到 a=1 即触发；
  // src.b 后到只填槽不重触发（status 已非 pending）
  assert.deepEqual(result, { value: 1 });
});

test("sys.switch：匹配 case 激活对应分支，其余互斥等待", async () => {
  const ex = build({
    id: "t.sw1",
    namespace: "t",
    name: "sw1",
    local: false,
    edges: [
      constEdge("sys.switch", "cases", { red: "r", green: "g" }),
      constEdge("sys.switch", "default", "other"),
      constEdge("sys.switch", "value", "red"),
      edge("sys.switch", "r", "test.passA", "value"),
      edge("sys.switch", "other", "test.passB", "value"),
    ],
    entry: "sys.switch",
    output: "test.passA",
  });
  const result = await ex.execute("t.sw1", {});
  assert.deepEqual(result, { value: true });
});

test("sys.switch：无匹配 case 走 default 分支", async () => {
  const ex = build({
    id: "t.sw2",
    namespace: "t",
    name: "sw2",
    local: false,
    edges: [
      constEdge("sys.switch", "cases", { red: "r" }),
      constEdge("sys.switch", "default", "other"),
      constEdge("sys.switch", "value", "blue"),
      edge("sys.switch", "r", "test.passA", "value"),
      edge("sys.switch", "other", "test.passB", "value"),
    ],
    entry: "sys.switch",
    output: "test.passB",
  });
  const result = await ex.execute("t.sw2", {});
  assert.deepEqual(result, { value: true });
});

test("sys.switch：无匹配且 default 为 undefined → 返回错误", async () => {
  const ex = build({
    id: "t.sw3",
    namespace: "t",
    name: "sw3",
    local: false,
    edges: [
      constEdge("sys.switch", "cases", { red: "r" }),
      constEdge("sys.switch", "value", "blue"),
      // 可选入边约定：常量边提供 undefined，fn 自行判空
      constEdge("sys.switch", "default", undefined),
      edge("sys.switch", "r", "test.passA", "value"),
    ],
    entry: "sys.switch",
    output: "test.passA",
  });
  const result = await ex.execute("t.sw3", {});
  assert.ok("error" in result, "无匹配且无 default 应报错");
  assert.match(
    (result as { error: { message: string } }).error.message,
    /no matching case and no default provided/,
  );
});

test("sys.coalesce：取首个非空值（跳过 null/undefined）", async () => {
  const ex = build({
    id: "t.co1",
    namespace: "t",
    name: "co1",
    local: false,
    edges: [
      constEdge("sys.coalesce", "array", [null, undefined, 0, "x"]),
      edge("sys.coalesce", "result", "test.pass", "value"),
    ],
    entry: "sys.coalesce",
    output: "test.pass",
  });
  const result = await ex.execute("t.co1", {});
  assert.deepEqual(result, { value: 0 });
});

test("sys.coalesce：全部为空 → result 为 undefined", async () => {
  const ex = build({
    id: "t.co2",
    namespace: "t",
    name: "co2",
    local: false,
    edges: [
      constEdge("sys.coalesce", "array", [null, undefined]),
      edge("sys.coalesce", "result", "test.pass", "value"),
    ],
    entry: "sys.coalesce",
    output: "test.pass",
  });
  const result = await ex.execute("t.co2", {});
  assert.deepEqual(result, { value: undefined });
});
