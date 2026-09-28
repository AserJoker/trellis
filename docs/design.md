# Trellis 详细设计

> 基于 `concepts.md` 核心概念的详细设计骨架。本文档为设计文档的导航入口与总览。
> 技术决策：后端 TypeScript/Node，前端 React（无头组件逻辑层 + React 适配层），存储先 JSON 后抽象。

## 文档导航

| 文档 | 内容 | 状态 |
|------|------|------|
| `concepts.md` | 核心概念（Model 自举、前后端 ViewModel、存储解耦） | ✅ 已建立 |
| `design/server.md` | server 设计：HTTP 服务将进程内 Model 接口开放到端口 | 骨架 |
| `design/client.md` | client 设计：前端界面（React，ViewModel/XML、组件体系） | 骨架 |
| `design/roadmap.md` | 里程碑验收标准与分阶段实施计划 | 骨架 |

## 架构总览（骨架）

```
┌─────────────────────────────────────────────────┐
│                   client（前端界面）             │
│   React + ViewModel(XML) → 无头组件 → 渲染       │
└──────────────────────┬──────────────────────────┘
                       │ HTTP
┌──────────────────────▼──────────────────────────┐
│                    server（HTTP 服务）            │
│   Model 注册表 → 查询聚合引擎（递归复杂字段）      │
│   function 编排引擎（原子操作组合）                │
└──────────────────────┬──────────────────────────┘
                       │ IStore 接口（外部输入实现）
┌──────────────────────▼──────────────────────────┐
│                    store（真实存储实现）           │
│   实现 core 的 IStore 接口，提供真实数据库功能     │
│   第一步：JSON/内存实现                           │
└─────────────────────────────────────────────────┘
```

## 分层边界（骨架）

1. **core（元数据核心，业务无关）**：Model/Field/Function 的定义、注册、校验与核心算法；schema 解析是 model 体系的一部分（协议内化于 core）。声明 `IStore` 存储接口，**不实现**存储。
2. **store（存储实现）**：实现 core 声明的 `IStore` 接口，提供真实数据库功能（第一步 JSON/内存，后续可换数据库适配器）。
3. **server（HTTP 服务）**：将进程内 Model 接口开放到 HTTP 端口（Node 内置 http 起步），供 client 调用。
4. **client（前端界面）**：React 前端，ViewModel/XML 解析 → 无头组件逻辑层 → React 适配层渲染；前端 function 执行。
5. **管理面**：用 View 管理 View/Model（初期 XML/JSON 编辑，后期可视化）。

## 关键横切机制（骨架）

- **自举**：ModelModel 描述 Model，FieldModel 描述 Field，FunctionModel 描述 Function，组件类型 Model 描述组件。
- **命名空间 + 版本**：组件/模块通过命名空间+版本保证元数据与实现对应。
- **模块化**：热拔插模块（设计暂缓，概念提及）。
