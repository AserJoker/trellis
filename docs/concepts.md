# Trellis 核心概念

> 从零设计的概念记录。本文件是当前对框架核心概念的定义，随设计演进持续更新。

## 总体定位

以 **Model** 为中心概念的自举（bootstrap）可扩展框架。Model 是类似数据库表的数据对象元数据，而 Model/Field 本身也由 Model 承载——元数据递归自描述。

前后端共享同一套 Model/Function 概念：后端基于 Model 提供数据与行为，前端基于 ViewModel 提供界面，管理面用同一套体系管理元数据自身。

---

## 二、模块化：热拔插扩展（概念提及，设计暂缓）

框架支持**热拔插模块**（设计暂缓，仅记录概念方向）。

- **模块提供一系列数据**：包括**元数据**（Model / Field 等"表"的数据）。
- **模块可携带前端/后端代码插件**：用于**扩展框架功能**（前端代码插件扩展前端能力，后端代码插件扩展后端能力）。
- **热拔插**：模块可动态装载/卸载，装载即注入元数据与代码能力，卸载即移除。

> 注：本节点仅记录概念方向，具体设计（模块结构、装载机制、插件契约等）后续另行设计。

---

## 一、后端核心概念

### 1. Model 中心的自举可扩展框架

- **Model** = 类似数据库表的数据对象**元数据**（描述数据结构的元数据对象）。
- 框架以 Model 为唯一中心概念，所有数据对象都经由 Model 描述。
- **自举**：Model 和 Field 本身也是数据对象，也有各自的 Model 承载（描述元数据的元数据）。
  - 例：`UserModel` 描述 User 表结构；`ModelModel` 描述 `UserModel` 本身的结构。
  - 元模型递归闭合：Model → ModelModel → …，框架自描述。
- **可扩展**：新数据对象只需声明自己的 Model，无需硬编码框架代码。

### 2. Model 的结构（三大部分）

```typescript
interface IBase {
  id: string;        // 全局唯一
  namespace: string; // 命名空间
  name: string;      // 模型名
  displayName?: string; // 国际化 key（可选）
}

interface IModel extends IBase {
  primaryField: string;  // 主键字段名
  fields: IField[];      // 字段定义
  functions: IFunction[]; // 行为函数定义
}
```

三大部分：**① 元数据区**（IBase + primaryField）、**② fields**（字段定义）、**③ functions**（行为函数定义）。

所有系统模型（Model/Field/Type/Function 等）共享 `IBase` 基础元数据：`id`（全局唯一）、`namespace`（命名空间）、`name`（模型名）、`displayName`（国际化 key，非直接显示文本）。

### 3. fields 的分类：简单字段 & 复杂字段

- **简单字段**：普通数据字段（string/integer/floating/boolean/text）。
- **枚举字段**：enum，带 items 枚举项列表。
- **复杂字段（关系字段）**：四类关系
  - `One2Many`（一对多）
  - `Many2One`（多对一）
  - `One2One`（一对一）
  - `Many2Many`（多对多）

**关系的存储方式**

- 需要中间模型（associationModel）：`One2One`、`Many2Many`（用单独的中间模型记录关系，**O2O 确认走中间表**）。
- 直接外键：`One2Many`、`Many2One` —— 在 **Many 侧**的 Model 中存放对侧关系字段。
  - 例：`user.authId = auth.id`，多个 user 绑定同一个 auth。

**字段元数据结构（按类型区分，不是统一四键）**

```typescript
interface IBaseField extends IBase {
  type: FieldType;
  store?: boolean;
  array?: boolean; // 数组字段，序列化为逗号分隔字符串
}

interface IComplexField extends IBaseField {
  type: "one2many" | "many2one" | "one2one" | "many2many";
  relationField: string;    // 本侧关系字段
  referenceField: string;   // 对侧关系字段
  referenceModel: string;   // 对侧模型 id（引 id，全局唯一）
  store?: false;            // 复杂字段强制不落库
}

interface IRelationField extends IComplexField {
  type: "many2many" | "one2one";
  associationModel: string; // 中间模型 id（仅 O2O/M2M 使用）
}
```

- 本侧关系字段（`relationField`）：如 user 侧声明 `auth` 字段，`relationField="authId"`。
- 对侧关系字段（`referenceField`）：如 `referenceField="id"`（对侧 auth 的主键）。
- 对侧模型（`referenceModel`）：引对侧 Model 的 **id**。
- 中间模型（`associationModel`）：仅 `One2One` / `Many2Many` 使用，引中间 Model 的 **id**。

**自举一致性**

- Field 本身也是一个 Model，对应数据库中的一张表。
- 字段按类型区分（simple/enum/complex/relation），而非旧设计的统一四键结构。

### 4. 字段的物理存在性

- **是否存储取决于 `store` 字段**：每个字段元信息里有 `store` 标记，决定是否物理落库。
- **复杂字段的 `store` 一定为 `false`**（数据库无此列，纯逻辑关系），由类型系统强制（`store?: false`）。
- **简单字段默认 `store = true`**（物理存在，有对应列），无需显式声明。
- 复杂字段由**上层递归查询聚合**后返回给调用方。

**推论**

- 写入时：`store=false` 的字段不参与物理存储。
- 读取时：复杂字段按关系定义递归聚合关联数据。
- 复杂字段元数据中记录的 relationField / referenceField / referenceModel / associationModel 是查询聚合的导航信息。

### 5. 字段类型：内置字面量联合

- 字段类型是**内置的固定联合**（`FieldType`），不做类型映射 Model。
- `FieldType = "string" | "integer" | "floating" | "boolean" | "text" | "enum" | 四类关系`。
- 业务类型到逻辑类型的映射（旧设计：类型也是 Model、可扩展）**已放弃**——类型体系固定，不做类型 Model。

### 5a. 数组字段（array）

- 字段可声明 `array = true`，表示该字段值为**数组**。
- **array = true 时，所有数据类型统一以 string 序列化**存储。
- **序列化格式**：逗号分隔 + 反斜杠转义（`\` 转义 `,`）：
  - `[1,2]` → `"1,2"`
  - `["a","b,"]` → `"a,b\,"`
- 读写时做序列化/反序列化（写入序列化，读取反序列化还原为数组）。
- 物理列类型仍为 string（`ColumnType` 的 string），array 是字段语义而非列类型。

### 6. Function：有向图编排（控制流降维为数据流）

- function 是 Model 三大组成部分之一。
- **Function 本质是一个有向图**：`IAtomNode`（节点）+ `IFunctionEdge`（数据流边）+ entry/output。
- **IAtomNode（原子操作）不入库**：由引擎在启动时注册管理；规定**必须无状态**。
- **IFunctionEdge**：`fromNode/fromField → toNode/toField` 数据流边。
- **IFunction**：`edges + entry + output`。
  - `entry`：入口节点。
  - `output`：输出节点（指向节点 id）——**该节点执行完成后视作整个 function 执行完成**，其**全部 outputs 字段合并**作为 function 的返回值。
- **执行调度：数据流触发（AND 汇聚）**——**节点要执行，必须所有入边数据都就绪**；任一输入仍处于等待则该节点等待。无依赖节点自动并行。
- **惰性调度（无 Promise 泄漏）**：
  - 等待是**同步状态**（入边槽位未满），引擎**不预建 Promise 等待器**；未就绪节点零异步资源。
  - 只有**就绪且被派发**的节点才创建执行上下文。
  - output 完成后引擎对**全部活动执行 abort**（AbortSignal），终止并行分支——可取消、不泄漏。
- **节点输出：ctx.emit**——fn 不返回结果对象，而是通过注入的执行上下文 `ctx.emit(field, value)` **逐个发令牌**，引擎即时路由下游。
- **控制流降维为数据流**：控制流不特殊，用普通原子节点表达。
  - 例：`if` 节点 `inputs={condition}`、`outputs={then, else}`，condition 决定 then/else 哪个端口激活。
  - **选择性输出**：只 emit 激活的输出字段，引擎只沿存在的字段触发下游边；未 emit 的输出字段 = 不触发。
  - 分支输出的是**令牌/信号**（非数据），下游节点被触发后按需从自身入边取数。
  - **分支的等待语义**：未激活分支的下游节点永远凑不齐所有入边，自然保持等待不执行（AND 汇聚自动实现 if/else 互斥）。
- **数据获取：全入边流入**——节点数据全部通过入边流入，无共享状态读取。
- **错误处理**：function 执行过程中**捕获错误并返回**（不向外抛）。

**自举一致性**

- **function 本身也是一个 Model**：function 的结构（含 edges/entry/output）由自身的 Model 承载。
- 与 Field 一致，所有框架核心概念都是 Model，递归闭合。

**推论**

- function 是"描述"而非"代码"：行为由可序列化的有向图定义。
- 原子操作是引擎注册的代码能力（无状态、不入库），编排图把它们组织成可复用 function。
- 控制流 = 选择性输出 + 令牌分发：不需要特殊的控制流语法或环，图保持纯数据流。

### 7. 系统模型的公共基础元数据（IBase）

- **所有系统模型**均继承 `IBase`：
  - `id`：**全局唯一**标识
  - `name`：模型名
  - `namespace`：命名空间
  - `displayName`：**国际化 key**（可选，不是直接显示文本，而是 i18n 的 key）
- **国际化由另一个 Model 描述**：displayName 指向的 key，其多语言文本由独立的国际化 Model 承载（符合自举）。

**推论**

- 所有核心概念（Model、Field、Function 等系统模型）共享 `IBase` 基础元数据，结构统一。
- 显示名不做硬编码文案，通过 key + 国际化 Model 解析，支持多语言。

---

## 二、前端核心概念

### 1. ViewModel：前端核心

- 前端核心是一个 **ViewModel**。
- **核心载体是一份 XML**：以 **0 代码**形式描述界面的布局/组件。
- **非展示容器**（binding 容器）：XML 中通过这类容器**绑定 Model 和 Field**（声明数据来源）。
- **展示组件**：容器里的真实展示组件**从父节点获取数据**（数据沿容器层级向下传递）。

### 2. XML 中的行为绑定

- 通过设置**组件的 property**，把**组件的事件**与 **Model 的 function** 关联。
  - 例：`<Button on-click="model.functionName">`（property 声明事件 → 绑定到 Model function）。
- 界面交互（事件）通过 property 声明式地路由到 Model 的行为（function）。

**推论**

- XML 承载两类绑定：
  - 数据绑定：容器绑定 Model/Field，展示组件从父节点取数据（数据流）。
  - 行为绑定：组件 property 关联事件与 Model function（控制流）。
- 前后端由 Model/Function 贯通：前端事件 → Model function 执行 → 数据经绑定回流渲染。

### 3. Function 的执行位置（前端/后端）

- function 区分**前端执行**与**后端执行**。
- **前端执行**：function 直接在前端运行逻辑（无需网络请求）。
- **后端执行**：前端需把调用**封装成请求**发往后端执行。

**推论**

- function 的执行位置是其元数据的一部分（声明属性）。
- 前端运行时需要一套执行前端 function 的引擎。

### 4. 组件架构：无头组件（Headless）两层模型

- 框架开发的组件是**无头组件（headless）**：
  - **本身不提供渲染**。
  - 只负责**从上层节点拉取数据**，然后**注入到真实的三方组件库**中。
- **组件类型（Button/Input 等）本身也是一个 Model**：组件类型由 Model 描述，与后端 Type/Field/Function 自举体系一致，可扩展（声明新组件类型 = 声明一个新 Model）。
- 组件分**两层**：
  - **① 通用的逻辑层**：与具体 UI 无关的组件逻辑（数据拉取、状态、行为），跨组件库通用。
  - **② 特定的适配层**：把逻辑层数据/状态**适配到具体三方组件库**（特定 UI 库的渲染）。
- **这是前端的主要工作量**：适配层针对不同三方组件库适配。

**推论**

- 渲染完全委托给三方组件库，框架只做逻辑 + 注入。
- 换组件库只需写新适配层，逻辑层复用。
- **命名空间 + 版本保证对应**：前端组件的实际逻辑在框架中（无头组件逻辑在框架内），因此组件通过**命名空间 + 版本**标识，确保数据库（持久化的 View/XML 元数据）与前端组件实现**精确对应**——同一组件名不同版本/命名空间对应不同逻辑实现，避免元数据与运行时代码错位。

### 5. 前后端通讯

- 数据协议**类似 GraphQL**，但**自己实现**，强调**轻量**。
- 后端依据**前端数据地图（data map）**做**递归查询**：
  - 按前端声明的数据需求，递归遍历**复杂字段**。
  - **聚合 + 清洗**数据后返回。

**推论**

- 数据地图 ≈ 前端的查询需求声明（类 GraphQL 的选择集）。
- 复杂字段的物理不存在性 + 递归聚合在这里落地：后端查询引擎根据 Model 关系图递归装配数据。
- "清洗"暗示后端在聚合过程中做数据规范化/转换（字段裁剪、枚举归一等）。

### 6. 管理面（元数据自管理）

- 前端 View、后端 function 等**元数据本身在管理面上是可编辑、可管理的**。
- **管理面本身也是一个 View**（用同一套 View/XML 构建，框架自举）。
- **编辑形态分阶段**：
  - **初期**：直接编辑 **XML/JSON**（源码级编辑）。
  - **后期**：支持**可视化编辑**（图形化拖拽/配置界面）。

**推论**

- 全链路自举闭环：管理面用 View 管理 View，用 Model 管理 Model。
- 管理面既是运行时的一部分，也是元数据的 CRUD 界面。

---

## 三、数据出口（存储层解耦）

- **数据库/存储层需要解耦**：框架不绑定单一数据库。
- 需支持**不同数据库**（适配不同存储后端）。
- **受限环境降级方案**：当前受限环境中，可**暂时使用序列化为 JSON 存磁盘**（文件存储）。
  - 理由：**管理面本身的数据量可接受**（元数据规模小，JSON 落盘足够）。

### IStore 接口（core 声明，store 实现）

- core 声明 `IStore` 存储接口，**不实现**存储；`store` 包实现该接口。
- `IColumn`：物理列（name + ColumnType）。`ColumnType` 只含简单类型 + enum（enum 列存枚举项 value 字符串）；复杂字段不落库，故无关系列。
- `ITable`：id + columns + primaryColumn（对应 Model 的 primaryField）。
- 数据操作：`createOne` / `updateOne` / `deleteOne` / `query`。
  - `updateOne` / `deleteOne` 以 **record 内的主键字段**定位记录。
  - `query` 的 `condition` 为查询条件：字段值**等值**或 `[min, max]` **闭区间范围**（二元组元素 undefined 表示对应侧无边界，如 `[undefined, 5]` = ≤5）；返回 `IQueryResult`（data + total）。
- **事务**：`beginTransaction()` 返回一个 `ITransactionStore`（仅含数据操作 create/update/delete/query + commit/rollback，不含表结构操作）。事务期间操作落在事务内，commit 原子生效、rollback 全量回退。

**推论**

- 存储层做成可插拔适配：`IStore` 接口 + 各数据库实现。
- 元数据（Model/Field/Function/View 等管理面数据）量级小，JSON 文件存储作为低成本后端，不影响框架主体设计。
- 业务数据与元数据可以走不同存储策略。

---

## 待确认 / 待补充

（无）

已确认的开放问题：
- One2One 走中间表（associationModel）。
- 字段按类型区分（simple/enum/complex/relation），不是统一四键。
- 简单字段默认 store = true；复杂字段 store 强制 false。
- 前端组件类型本身也是 Model。
- 关系键命名：relationField（本侧字段）/ referenceField（对侧字段）/ referenceModel（对侧模型 id）/ associationModel（中间模型 id，仅 O2O/M2M）。
- 类型体系为内置字面量联合（FieldType），不做类型 Model。
- IStore：updateOne/deleteOne 以 record 内主键定位；query 用 IQueryCondition（等值或 [min,max] 闭区间）；事务接口返回 ITransactionStore（仅含数据操作）。
- array 字段：array=true 时统一 string 存储，逗号分隔 + 反斜杠转义（`\` 转义 `,`）。
- Function 编排：有向图（数据流触发 AND 汇聚，控制流降维为数据流），IAtomNode 不入库且无状态，output 节点全部 outputs 合并为返回值，执行错误捕获返回；惰性调度（等待是同步状态，引擎不预建 Promise 等待器，output 完成后 abort 活动执行）。
