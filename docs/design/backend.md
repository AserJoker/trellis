# 后端设计（骨架）

> 状态：骨架，待细化。基于 `concepts.md` 后端核心概念与 `roadmap.md` 阶段规划。

## 1. 元数据核心（core）

### 1.1 类型定义
- `Model`：name/namespace/id/primaryField/displayName + fields + functions（见 concepts §2）
- `IField`：简单字段 + 复杂字段（四类关系），统一四键（thisField/thatField/relatedModelId/junctionModelId），store 标记
- `IFunction`：通用元数据 + 编排图 JSON + 执行位置（frontend/backend）
- `IType`：业务类型 → 逻辑类型的映射（类型也是 Model）

### 1.2 系统模型（自举）
- ModelModel / FieldModel / FunctionModel / TypeModel
- 国际化 Model（displayName key → 多语言文本）

### 1.3 注册表
- Model 注册 / 查询 / 校验
- 命名空间 + id 唯一性

## 2. 存储层（阶段 1：JSON，阶段 5 抽象）

- `storage-json`：JSON 序列化落盘（临时措施 T1）
- 管理面元数据持久化；业务数据存储策略后续
- **待细化**：文件布局、写原子性、备份恢复

## 3. 查询聚合引擎（阶段 2）

- 递归遍历复杂字段（O2O/O2M/M2O/M2M）
- 关系导航：thisField/thatField/relatedModelId/junctionModelId
- 中间模型读写（junction）
- 数据清洗：类型映射链（业务 → 逻辑 → 存储）
- **待细化**：查询语法、深度限制、循环引用防护、聚合算法

## 4. function 编排引擎（阶段 3）

- 原子操作库：原子数据操作（CRUD）+ 原子功能函数
- 编排图解释器：节点执行、数据流、控制流（分支/循环）
- **待细化**：图结构 schema、执行上下文、错误处理、异步模型

## 5. 通讯接入（阶段 4）

- 协议处理：前端数据地图 → 递归查询 → 聚合返回
- 后端 function 执行入口
- **待细化**：请求/响应格式、错误语义、批处理

## 6. 模块化（设计暂缓）

- 热拔插模块：元数据 + 前后端代码插件
- **待细化**：模块结构、装载机制、插件契约
