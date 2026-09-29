/**
 * Schema 协议测试（node:test）。
 * 覆盖：ISchema 联合类型可构造（简单/枚举/对象/数组）、resolveShape 递归解析、
 * shapeForFieldType 字段类型 → shape 映射。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveShape,
  shapeForFieldType,
  type ISchema,
} from "../dist/index.js";

test("ISchema：四种形态可构造（类型判别）", () => {
  const simple: ISchema = { type: "string" };
  assert.equal(simple.type, "string");

  const enumSchema: ISchema = { type: "enum", items: ["active", "disabled"] };
  assert.equal(enumSchema.type, "enum");
  assert.deepEqual(enumSchema.items, ["active", "disabled"]);

  const object: ISchema = {
    type: "object",
    properties: {
      id: { type: "integer" },
      username: { type: "string" },
    },
  };
  assert.equal(object.type, "object");

  const array: ISchema = {
    type: "array",
    items: {
      type: "object",
      properties: { total: { type: "floating" } },
    },
  };
  assert.equal(array.type, "array");
  if (array.type === "array") {
    assert.equal(array.items.type, "object");
  }
});

test("resolveShape：递归解析结构形态", () => {
  assert.equal(resolveShape({ type: "string" }), "string");
  assert.equal(resolveShape({ type: "integer" }), "integer");
  assert.equal(resolveShape({ type: "enum" }), "enum");
  assert.equal(
    resolveShape({ type: "object", properties: {} }),
    "object",
  );
  assert.equal(resolveShape({ type: "array", items: { type: "text" } }), "array");
});

test("shapeForFieldType：Model 字段类型 → 期望 shape（关系映射）", () => {
  assert.equal(shapeForFieldType("string"), "string");
  assert.equal(shapeForFieldType("integer"), "integer");
  assert.equal(shapeForFieldType("enum"), "enum");
  // 关系字段：单记录 → object，多记录 → array
  assert.equal(shapeForFieldType("one2one"), "object");
  assert.equal(shapeForFieldType("many2one"), "object");
  assert.equal(shapeForFieldType("one2many"), "array");
  assert.equal(shapeForFieldType("many2many"), "array");
});
