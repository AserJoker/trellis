/**
 * sys 通用原子测试（node:test）。
 * 覆盖：if 选择性输出（then/else 互斥）、数学、逻辑、比较原子、常量边。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createFunctionExecutor,
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

/** 节点边 helper。 */
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

function build(fn: IFunction) {
  const ex = createFunctionExecutor({});
  ex.registerAtom(passAtom);
  ex.registerFunction(fn);
  return ex;
}

test("常量边：sys.add 用常量边做入边", async () => {
  const ex = build({
    id: "t.cadd",
    namespace: "t",
    name: "cadd",
    local: false,
    edges: [
      constEdge("sys.add", "a", 2),
      constEdge("sys.add", "b", 3),
      edge("sys.add", "result", "test.pass", "value"),
    ],
    entry: "sys.add",
    output: "test.pass",
  });
  const result = await ex.execute("t.cadd", {});
  assert.deepEqual(result, { value: 5 });
});

test("常量边 + 节点边混合：混合入边 AND 汇聚", async () => {
  const ex = build({
    id: "t.mix",
    namespace: "t",
    name: "mix",
    local: false,
    edges: [
      constEdge("sys.add", "a", 10),
      edge("const.src", "value", "sys.add", "b"),
      edge("sys.add", "result", "test.pass", "value"),
    ],
    entry: "const.src",
    output: "test.pass",
  });
  // 常量 10 + 节点边 5 = 15
  ex.registerAtom({
    id: "const.src",
    namespace: "const",
    name: "src",
    version: "1.0.0",
    inputs: [],
    outputs: ["value"],
    async fn(_input, ctx) {
      ctx.emit("value", 5);
    },
  });
  const result = await ex.execute("t.mix", {});
  assert.deepEqual(result, { value: 15 });
});

test("常量边：JSON 可序列化值（对象/数组）", async () => {
  const ex = build({
    id: "t.cjson",
    namespace: "t",
    name: "cjson",
    local: false,
    edges: [
      constEdge("sys.equals", "a", { x: 1 }),
      constEdge("sys.equals", "b", [1, 2, 3]),
      edge("sys.equals", "result", "test.pass", "value"),
    ],
    entry: "sys.equals",
    output: "test.pass",
  });
  const result = await ex.execute("t.cjson", {});
  // {x:1} !== [1,2,3] → equals 为 false
  assert.deepEqual(result, { value: false });
});

test("sys.add：数学原子（常量边）", async () => {
  const ex = build({
    id: "t.add",
    namespace: "t",
    name: "add",
    local: false,
    edges: [
      constEdge("sys.add", "a", 2),
      constEdge("sys.add", "b", 3),
      edge("sys.add", "result", "test.pass", "value"),
    ],
    entry: "sys.add",
    output: "test.pass",
  });
  const result = await ex.execute("t.add", {});
  assert.deepEqual(result, { value: 5 });
});

test("sys.and / sys.not：逻辑原子（常量边）", async () => {
  const ex = build({
    id: "t.logic",
    namespace: "t",
    name: "logic",
    local: false,
    edges: [
      constEdge("sys.and", "a", true),
      constEdge("sys.and", "b", true),
      edge("sys.and", "result", "sys.not", "a"),
      edge("sys.not", "result", "test.pass", "value"),
    ],
    entry: "sys.and",
    output: "test.pass",
  });
  const result = await ex.execute("t.logic", {});
  assert.deepEqual(result, { value: false });
});

test("sys.gt：比较原子（常量边）", async () => {
  const ex = build({
    id: "t.cmp",
    namespace: "t",
    name: "cmp",
    local: false,
    edges: [
      constEdge("sys.gt", "a", 5),
      constEdge("sys.gt", "b", 3),
      edge("sys.gt", "result", "test.pass", "value"),
    ],
    entry: "sys.gt",
    output: "test.pass",
  });
  const result = await ex.execute("t.cmp", {});
  assert.deepEqual(result, { value: true });
});

test("sys.if：then 分支激活，else 互斥等待（常量边 condition）", async () => {
  const ex = build({
    id: "t.ifthen",
    namespace: "t",
    name: "ifthen",
    local: false,
    edges: [
      constEdge("sys.if", "condition", true),
      edge("sys.if", "then", "test.pass", "value"),
    ],
    entry: "sys.if",
    output: "test.pass",
  });
  const result = await ex.execute("t.ifthen", {});
  assert.deepEqual(result, { value: true });
});

test("sys.if：else 分支激活，then 互斥等待（常量边 condition）", async () => {
  const ex = build({
    id: "t.ifelse",
    namespace: "t",
    name: "ifelse",
    local: false,
    edges: [
      constEdge("sys.if", "condition", false),
      edge("sys.if", "else", "test.pass", "value"),
    ],
    entry: "sys.if",
    output: "test.pass",
  });
  const result = await ex.execute("t.ifelse", {});
  assert.deepEqual(result, { value: true });
});

test("disableDefaultAtoms：关闭默认注册后 sys 原子不可用", async () => {
  const ex = createFunctionExecutor({}, { disableDefaultAtoms: true });
  ex.registerAtom(passAtom);
  ex.registerFunction({
    id: "t.nosys",
    namespace: "t",
    name: "nosys",
    local: false,
    edges: [
      constEdge("sys.add", "a", 1),
      constEdge("sys.add", "b", 2),
      edge("sys.add", "result", "test.pass", "value"),
    ],
    entry: "sys.add",
    output: "test.pass",
  });
  const result = await ex.execute("t.nosys", {});
  assert.ok("error" in result, "sys.add 未注册应报错");
});

test("options.atoms：追加自定义原子", async () => {
  const doubleAtom: IAtomNode = {
    id: "custom.double",
    namespace: "custom",
    name: "double",
    version: "1.0.0",
    inputs: ["value"],
    outputs: ["result"],
    async fn(input, ctx) {
      ctx.emit("result", (input.value as number) * 2);
    },
  };
  const ex = createFunctionExecutor({}, { atoms: [doubleAtom] });
  ex.registerAtom(passAtom);
  ex.registerFunction({
    id: "t.custom",
    namespace: "t",
    name: "custom",
    local: false,
    edges: [
      constEdge("custom.double", "value", 21),
      edge("custom.double", "result", "test.pass", "value"),
    ],
    entry: "custom.double",
    output: "test.pass",
  });
  const result = await ex.execute("t.custom", {});
  assert.deepEqual(result, { value: 42 });
});
