/**
 * record / 集合 / 转换原子测试（node:test）。
 * 覆盖：字段读写、record 变换、集合基础、集合字段提取/过滤、类型转换。
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

const user = { id: 1, name: "alice", age: 30 };

test("sys.getField：取 record 字段值", async () => {
  const ex = build({
    id: "t.get",
    namespace: "t",
    name: "get",
    local: false,
    edges: [
      constEdge("sys.getField", "record", user),
      constEdge("sys.getField", "key", "name"),
      edge("sys.getField", "value", "test.pass", "value"),
    ],
    entry: "sys.getField",
    output: "test.pass",
  });
  const result = await ex.execute("t.get", {});
  assert.deepEqual(result, { value: "alice" });
});

test("sys.setField：返回新 record（含设置字段）", async () => {
  const ex = build({
    id: "t.set",
    namespace: "t",
    name: "set",
    local: false,
    edges: [
      constEdge("sys.setField", "record", user),
      constEdge("sys.setField", "key", "age"),
      constEdge("sys.setField", "value", 31),
      edge("sys.setField", "result", "test.pass", "value"),
    ],
    entry: "sys.setField",
    output: "test.pass",
  });
  const result = await ex.execute("t.set", {});
  assert.deepEqual(result, { value: { id: 1, name: "alice", age: 31 } });
});

test("sys.mergeRecord：合并两个 record（b 覆盖 a）", async () => {
  const ex = build({
    id: "t.merge",
    namespace: "t",
    name: "merge",
    local: false,
    edges: [
      constEdge("sys.mergeRecord", "a", { id: 1, name: "a" }),
      constEdge("sys.mergeRecord", "b", { age: 30, name: "b" }),
      edge("sys.mergeRecord", "result", "test.pass", "value"),
    ],
    entry: "sys.mergeRecord",
    output: "test.pass",
  });
  const result = await ex.execute("t.merge", {});
  assert.deepEqual(result, { value: { id: 1, name: "b", age: 30 } });
});

test("sys.pick / sys.omit：字段裁选/剔除", async () => {
  const ex1 = build({
    id: "t.pick",
    namespace: "t",
    name: "pick",
    local: false,
    edges: [
      constEdge("sys.pick", "record", user),
      constEdge("sys.pick", "keys", ["id", "name"]),
      edge("sys.pick", "result", "test.pass", "value"),
    ],
    entry: "sys.pick",
    output: "test.pass",
  });
  const r1 = await ex1.execute("t.pick", {});
  assert.deepEqual(r1, { value: { id: 1, name: "alice" } });

  const ex2 = build({
    id: "t.omit",
    namespace: "t",
    name: "omit",
    local: false,
    edges: [
      constEdge("sys.omit", "record", user),
      constEdge("sys.omit", "keys", ["age"]),
      edge("sys.omit", "result", "test.pass", "value"),
    ],
    entry: "sys.omit",
    output: "test.pass",
  });
  const r2 = await ex2.execute("t.omit", {});
  assert.deepEqual(r2, { value: { id: 1, name: "alice" } });
});

test("sys.length / sys.first / sys.last：集合基础", async () => {
  const arr = [10, 20, 30];
  const ex1 = build({
    id: "t.len",
    namespace: "t",
    name: "len",
    local: false,
    edges: [
      constEdge("sys.length", "array", arr),
      edge("sys.length", "count", "test.pass", "value"),
    ],
    entry: "sys.length",
    output: "test.pass",
  });
  assert.deepEqual(await ex1.execute("t.len", {}), { value: 3 });

  const ex2 = build({
    id: "t.first",
    namespace: "t",
    name: "first",
    local: false,
    edges: [
      constEdge("sys.first", "array", arr),
      edge("sys.first", "value", "test.pass", "value"),
    ],
    entry: "sys.first",
    output: "test.pass",
  });
  assert.deepEqual(await ex2.execute("t.first", {}), { value: 10 });

  const ex3 = build({
    id: "t.last",
    namespace: "t",
    name: "last",
    local: false,
    edges: [
      constEdge("sys.last", "array", arr),
      edge("sys.last", "value", "test.pass", "value"),
    ],
    entry: "sys.last",
    output: "test.pass",
  });
  assert.deepEqual(await ex3.execute("t.last", {}), { value: 30 });
});

test("sys.concat / sys.slice：数组操作", async () => {
  const ex1 = build({
    id: "t.concat",
    namespace: "t",
    name: "concat",
    local: false,
    edges: [
      constEdge("sys.concat", "a", [1, 2]),
      constEdge("sys.concat", "b", [3, 4]),
      edge("sys.concat", "result", "test.pass", "value"),
    ],
    entry: "sys.concat",
    output: "test.pass",
  });
  assert.deepEqual(await ex1.execute("t.concat", {}), { value: [1, 2, 3, 4] });

  const ex2 = build({
    id: "t.slice",
    namespace: "t",
    name: "slice",
    local: false,
    edges: [
      constEdge("sys.slice", "array", [1, 2, 3, 4]),
      constEdge("sys.slice", "start", 1),
      constEdge("sys.slice", "end", 3),
      edge("sys.slice", "result", "test.pass", "value"),
    ],
    entry: "sys.slice",
    output: "test.pass",
  });
  assert.deepEqual(await ex2.execute("t.slice", {}), { value: [2, 3] });
});

test("sys.mapField / sys.filterByField：集合字段提取/过滤", async () => {
  const users = [
    { id: 1, name: "a", active: true },
    { id: 2, name: "b", active: false },
    { id: 3, name: "c", active: true },
  ];
  const ex1 = build({
    id: "t.map",
    namespace: "t",
    name: "map",
    local: false,
    edges: [
      constEdge("sys.mapField", "array", users),
      constEdge("sys.mapField", "key", "name"),
      edge("sys.mapField", "result", "test.pass", "value"),
    ],
    entry: "sys.mapField",
    output: "test.pass",
  });
  assert.deepEqual(await ex1.execute("t.map", {}), { value: ["a", "b", "c"] });

  const ex2 = build({
    id: "t.filter",
    namespace: "t",
    name: "filter",
    local: false,
    edges: [
      constEdge("sys.filterByField", "array", users),
      constEdge("sys.filterByField", "key", "active"),
      constEdge("sys.filterByField", "value", true),
      edge("sys.filterByField", "result", "test.pass", "value"),
    ],
    entry: "sys.filterByField",
    output: "test.pass",
  });
  assert.deepEqual(await ex2.execute("t.filter", {}), {
    value: [
      { id: 1, name: "a", active: true },
      { id: 3, name: "c", active: true },
    ],
  });
});

test("sys.toString / sys.toNumber：类型转换", async () => {
  const ex1 = build({
    id: "t.tostr",
    namespace: "t",
    name: "tostr",
    local: false,
    edges: [
      constEdge("sys.toString", "value", 42),
      edge("sys.toString", "result", "test.pass", "value"),
    ],
    entry: "sys.toString",
    output: "test.pass",
  });
  assert.deepEqual(await ex1.execute("t.tostr", {}), { value: "42" });

  const ex2 = build({
    id: "t.tonum",
    namespace: "t",
    name: "tonum",
    local: false,
    edges: [
      constEdge("sys.toNumber", "value", "3.14"),
      edge("sys.toNumber", "result", "test.pass", "value"),
    ],
    entry: "sys.toNumber",
    output: "test.pass",
  });
  assert.deepEqual(await ex2.execute("t.tonum", {}), { value: 3.14 });
});

test("sys.parseJson / sys.stringify：record 与 JSON 互转", async () => {
  const ex1 = build({
    id: "t.parse",
    namespace: "t",
    name: "parse",
    local: false,
    edges: [
      constEdge("sys.parseJson", "text", '{"a":1}'),
      edge("sys.parseJson", "result", "test.pass", "value"),
    ],
    entry: "sys.parseJson",
    output: "test.pass",
  });
  assert.deepEqual(await ex1.execute("t.parse", {}), { value: { a: 1 } });

  const ex2 = build({
    id: "t.str",
    namespace: "t",
    name: "str",
    local: false,
    edges: [
      constEdge("sys.stringify", "value", { a: 1 }),
      edge("sys.stringify", "result", "test.pass", "value"),
    ],
    entry: "sys.stringify",
    output: "test.pass",
  });
  assert.deepEqual(await ex2.execute("t.str", {}), { value: '{"a":1}' });
});
