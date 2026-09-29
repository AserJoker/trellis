/**
 * sys 通用原子测试（node:test）。
 * 覆盖：if 选择性输出（then/else 互斥）、数学、逻辑、比较原子。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createFunctionExecutor,
  type IAtomNode,
  type IFunction,
} from "../dist/index.js";

function constAtom(value: unknown): IAtomNode {
  return {
    id: `const.${String(value)}`,
    namespace: "const",
    name: String(value),
    version: "1.0.0",
    inputs: [],
    outputs: ["value"],
    async fn(_input, ctx) {
      ctx.emit("value", value);
    },
  };
}

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

function build(fn: IFunction) {
  const ex = createFunctionExecutor({});
  ex.registerAtom(passAtom);
  ex.registerFunction(fn);
  return ex;
}

test("自动加载：sys 原子默认可用（无需手动注册）", async () => {
  const ex = build({
    id: "t.auto",
    namespace: "t",
    name: "auto",
    local: false,
    edges: [
      edge("const.4", "value", "sys.add", "a"),
      edge("const.1", "value", "sys.add", "b"),
      edge("sys.add", "result", "test.pass", "value"),
    ],
    entry: "const.4",
    output: "test.pass",
  });
  ex.registerAtom(constAtom(4));
  ex.registerAtom(constAtom(1));
  const result = await ex.execute("t.auto", {});
  assert.deepEqual(result, { value: 5 });
});

test("disableDefaultAtoms：关闭默认注册后 sys 原子不可用", async () => {
  const ex = createFunctionExecutor({}, { disableDefaultAtoms: true });
  ex.registerAtom(constAtom(1));
  ex.registerAtom(constAtom(2));
  ex.registerAtom(passAtom);
  ex.registerFunction({
    id: "t.nosys",
    namespace: "t",
    name: "nosys",
    local: false,
    edges: [
      edge("const.1", "value", "sys.add", "a"),
      edge("const.2", "value", "sys.add", "b"),
      edge("sys.add", "result", "test.pass", "value"),
    ],
    entry: "const.1",
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
  ex.registerAtom(constAtom(21));
  ex.registerAtom(passAtom);
  ex.registerFunction({
    id: "t.custom",
    namespace: "t",
    name: "custom",
    local: false,
    edges: [
      edge("const.21", "value", "custom.double", "value"),
      edge("custom.double", "result", "test.pass", "value"),
    ],
    entry: "const.21",
    output: "test.pass",
  });
  const result = await ex.execute("t.custom", {});
  assert.deepEqual(result, { value: 42 });
});

test("sys.add：数学原子", async () => {
  const ex = build({
    id: "t.add",
    namespace: "t",
    name: "add",
    local: false,
    edges: [
      edge("const.2", "value", "sys.add", "a"),
      edge("const.3", "value", "sys.add", "b"),
      edge("sys.add", "result", "test.pass", "value"),
    ],
    entry: "const.2",
    output: "test.pass",
  });
  ex.registerAtom(constAtom(2));
  ex.registerAtom(constAtom(3));
  const result = await ex.execute("t.add", {});
  assert.deepEqual(result, { value: 5 });
});

test("sys.and / sys.not：逻辑原子", async () => {
  const ex = build({
    id: "t.logic",
    namespace: "t",
    name: "logic",
    local: false,
    edges: [
      edge("const.true", "value", "sys.and", "a"),
      edge("const.true", "value", "sys.and", "b"),
      edge("sys.and", "result", "sys.not", "a"),
      edge("sys.not", "result", "test.pass", "value"),
    ],
    entry: "const.true",
    output: "test.pass",
  });
  ex.registerAtom(constAtom(true));
  const result = await ex.execute("t.logic", {});
  assert.deepEqual(result, { value: false });
});

test("sys.gt：比较原子", async () => {
  const ex = build({
    id: "t.cmp",
    namespace: "t",
    name: "cmp",
    local: false,
    edges: [
      edge("const.5", "value", "sys.gt", "a"),
      edge("const.3", "value", "sys.gt", "b"),
      edge("sys.gt", "result", "test.pass", "value"),
    ],
    entry: "const.5",
    output: "test.pass",
  });
  ex.registerAtom(constAtom(5));
  ex.registerAtom(constAtom(3));
  const result = await ex.execute("t.cmp", {});
  assert.deepEqual(result, { value: true });
});

test("sys.if：then 分支激活，else 互斥等待", async () => {
  const ex = build({
    id: "t.ifthen",
    namespace: "t",
    name: "ifthen",
    local: false,
    edges: [
      edge("const.true", "value", "sys.if", "condition"),
      edge("sys.if", "then", "test.pass", "value"),
    ],
    entry: "const.true",
    output: "test.pass",
  });
  ex.registerAtom(constAtom(true));
  const result = await ex.execute("t.ifthen", {});
  assert.deepEqual(result, { value: true });
});

test("sys.if：else 分支激活，then 互斥等待", async () => {
  const ex = build({
    id: "t.ifelse",
    namespace: "t",
    name: "ifelse",
    local: false,
    edges: [
      edge("const.false", "value", "sys.if", "condition"),
      edge("sys.if", "else", "test.pass", "value"),
    ],
    entry: "const.false",
    output: "test.pass",
  });
  ex.registerAtom(constAtom(false));
  const result = await ex.execute("t.ifelse", {});
  assert.deepEqual(result, { value: true });
});
