/**
 * @trellis/protocol
 * 前后端通讯协议：类 GraphQL 自研轻量协议类型。
 * 阶段 0 骨架，占位导出。详细设计见 docs/design/protocol.md。
 */

/** 阶段 0 占位：协议类型入口 */
export const protocolVersion = "0.0.0";

// 通讯协议的返回形状 Schema（定义在 core，此处 re-export 供前端使用方统一引入）
export type { ISchema, SchemaNode, SchemaScalarType } from "@trellis/core";
