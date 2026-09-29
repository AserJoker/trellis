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
  id: string;        // 点分路径：父级id + "." + name
  namespace: string; // 父级 id（顶层为真正的命名空间，如 "sys" 或业务模块名，不为空）
  name: string;      // 自身名称
  displayName?: string; // 国际化 key（可选）
}

interface IModel extends IBase {
  primaryField: string;  // 主键字段名
  virtual?: boolean;     // true = 不建表，绑定代码 class（见 2a 节）
  fields: IField[];      // 字段定义
  functions: IFunction[]; // 行为函数定义
}
```

三大部分：**① 元数据区**（IBase + primaryField + virtual）、**② fields**（字段定义）、**③ functions**（行为函数定义）。

**id 点分路径规则**：

- `id = 父级id + "." + 自身name`；顶层对象的父级为真正的命名空间（`sys`、业务模块名，不为空）。
- `namespace` 字段存**父级 id**（不是顶层命名空间）。
- 例：model `sys.user`（namespace="sys", name="user"）；其 field `username` → namespace="sys.user"、name="username"、id="sys.user.username"。
- **唯一性**：不同类型、不同所属的对象必然唯一——field/function 的 namespace 是所属 model 的 id，路径层级 + 类型归属双重保证。

所有系统模型（Model/Field/Type/Function 等）共享 `IBase` 基础元数据，`id` 均为点分路径。

### 2a. virtual Model：绑定代码对象的模型

- **`virtual = true` 时，不创建表**：IStore 不为其建物理表，纯内存无持久化；CRUD/query 对 virtual model 不适用。
- **Model 绑定一个 class**：引擎注册表持有 `model.id → class` 映射（不入库，类似 IAtomNode）；field 是 class 的成员变量（沿用 IField 结构，描述类型与序列化形态）。
- **function 指向 native 方法**：非数据化 Function，`edges` 为空、`entry`/`output` 为空字符串。
- **绑定信息存引擎注册表**，IModel 元数据不存代码引用。

### 2b. 装饰器声明与目录装载（virtual model 的声明语法）

- virtual model 通过 **TS 装饰器（新标准，stage 3）** 声明，装饰器求值时收集元数据注册进引擎：

```typescript
// 以下为伪代码，实际装饰器参数、修饰目标（类/字段/方法）均待设计
@Meta.Model({ name: "user", namespace: "sys", virtual: true })
class UserModel extends BaseModel {
  @Meta.Field({ name: "username", type: Field.String })
  private _username: string = "";

  @Meta.Function({ name: "login" })
  public static login(record: UserModel): Promise<void> {
    // TODO:
  }
}
```

- **`@Meta.Model`** → IModel（name/namespace/virtual 等元数据）。
- **`@Meta.Field`** → IField（`Field.String` 等常量映射 FieldType 字面量）。
- **`@Meta.Function`** → IFunction（native 方法，无编排图）。
- **`BaseModel`**：提供 id/namespace 等基础字段与类型能力，具体类继承后声明成员变量。
- **收集时机 = require 时机**：装饰器在类定义求值时执行，收集器顺路提取元数据 → 引擎注册表（`model.id → class`、`function.id → 方法`）。
- **目录装载**：引擎启动时从一个目录**动态 require 所有文件**即完成装载——require 触发装饰器求值 → 注册。无独立注册代码。
- **元数据去向**：纯内存注册表（不入库，与 virtual 语义一致）。
- **适用范围**：仅 virtual model 的声明语法；普通数据 model（建表 CRUD）仍用手写对象/JSON 声明。
- **待设计**：装饰器实际参数（Model/Field/Function 各自的选项）、修饰目标（类/字段/方法/静态方法）、BaseModel 契约、Field 类型常量集、目录装载的路径/过滤规则。

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
  referenceModel: string;   // 对侧模型完整 id（点分路径）
  store?: false;            // 复杂字段强制不落库
}

interface IRelationField extends IComplexField {
  type: "many2many" | "one2one";
  associationModel: string; // 中间模型完整 id（仅 O2O/M2M 使用）
}
```

- 本侧关系字段（`relationField`）：如 user 侧声明 `auth` 字段，`relationField="authId"`。
- 对侧关系字段（`referenceField`）：如 `referenceField="id"`（对侧 auth 的主键）。
- 对侧模型（`referenceModel`）：引对侧 Model 的**完整 id**（点分路径，如 `"sys.user"`）。
- 中间模型（`associationModel`）：仅 `One2One` / `Many2Many` 使用，引中间 Model 的**完整 id**。

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
  - **节点边**：fromNode 非空，值从 fromNode 的 fromField 路由到 toNode 的 toField。
  - **常量边**：fromNode 为空 + `constant` 有值，常量直接作为 toNode 的 toField 入边（无源节点、天然就绪，AND 汇聚照常）；constant 必须 JSON 可序列化（function 入库）。**常量由边承载，而非定制原子**——原子无状态全局共享，值必须表达在可序列化的图数据里。
  - **多输出（fan-out）**：一个节点的输出可连到多个下游节点输入（多条出边 fromField 相同）；也可连到 AND 汇聚节点的多个不同输入（如 add 的 a/b 都来自同一输出）。emit 时按 fromField 匹配全部出边逐个填槽。
- **IFunction**：`edges + entry + output`。
  - `entry`：入口节点。
  - `output`：输出节点（指向节点 id）——**该节点执行完成后视作整个 function 执行完成**，其**全部 outputs 字段合并**作为 function 的返回值。
- **执行调度：数据流触发（AND 汇聚）**——**节点要执行，必须所有入边数据都就绪**；任一输入仍处于等待则该节点等待。无依赖节点自动并行。
- **惰性调度（无 Promise 泄漏）**：
  - 等待是**同步状态**（入边槽位未满），引擎**不预建 Promise 等待器**；未就绪节点零异步资源。
  - 只有**就绪且被派发**的节点才创建执行上下文。
  - output 完成后引擎对**全部活动执行 abort**（AbortSignal），终止并行分支——可取消、不泄漏。
- **节点输出：ctx.emit**——fn 不返回结果对象，而是通过注入的执行上下文 `ctx.emit(field, value)` **逐个发令牌**，引擎即时路由下游。
- **宿主注入上下文：ctx.deps**——原子节点执行时可访问宿主注入的资源（非图数据，是引擎所在端的能力）：
  - **IExecContext 是泛型**：`IExecContext<D>`（`D extends Record<string, unknown>`），`ctx.deps: D` 有完整类型提示，不用 any/unknown。
  - **生命周期**：引擎启动时注册注入物（注册表），每次执行 function 统一注入到 ctx。
  - **两端注册不同**：后端注册 IO 类（如 `{ store: IStore }`）→ 原子中 `ctx.deps.store.query(...)`；前端注册界面类（如 `{ history: History }`）→ `ctx.deps.history.push(...)`。
  - 与「引擎一致、注册的原子接口不同」呼应：注入物不同，原子才做不同的事。
- **控制流降维为数据流**：控制流不特殊，用普通原子节点表达。
  - 例：`if` 节点 `inputs={condition}`、`outputs={then, else}`，condition 决定 then/else 哪个端口激活。
  - **选择性输出**：只 emit 激活的输出字段，引擎只沿存在的字段触发下游边；未 emit 的输出字段 = 不触发。
  - 分支输出的是**令牌/信号**（非数据），下游节点被触发后按需从自身入边取数。
  - **分支的等待语义**：未激活分支的下游节点永远凑不齐所有入边，自然保持等待不执行（AND 汇聚自动实现 if/else 互斥）。
- **数据获取：全入边流入**——节点数据全部通过入边流入，无共享状态读取。
- **native function（virtual model 的方法）**：
  - `edges` 为空、`entry`/`output` 为空字符串，无编排图。
  - 引擎注册表持有 `function.id → 实际函数` 映射（不入库）。
  - 无需区分 native/编排：`function.id` 全局唯一，注册表即权威。
  - **调用方式**：编排图通过**特殊原子操作 `Call`**（携带 function.id 引用）以**平等的 Function 引用**调用——普通 function 与 native function 皆可被 Call 引用。
- **错误处理**：function 执行过程中**捕获错误并返回**（不向外抛）。

**自举一致性**

- **function 本身也是一个 Model**：function 的结构（含 edges/entry/output）由自身的 Model 承载。
- 与 Field 一致，所有框架核心概念都是 Model，递归闭合。

**推论**

- function 是"描述"而非"代码"：行为由可序列化的有向图定义。
- 原子操作是引擎注册的代码能力（无状态、不入库），编排图把它们组织成可复用 function。
- 控制流 = 选择性输出 + 令牌分发：不需要特殊的控制流语法或环，图保持纯数据流。

### 6a. FunctionExecutor：Function 的逻辑执行器

- **职责**：执行 IFunction 编排图。本质是**无副作用的纯执行器**——副作用全部来自外部注入的 `deps` 和原子接口（IAtomNode），执行器自身不碰任何 IO/状态。
- **命名**：不叫 Engine（太泛），就是 Function 的执行器——`FunctionExecutor`，`createFunctionExecutor()`。
- **API**：
  - `createFunctionExecutor(deps, options?)`：创建执行器——**默认自动注册 sys 通用原子**（if/数学/逻辑/比较）；options 可追加自定义原子（`atoms`）或禁用默认（`disableDefaultAtoms`）。
  - `registerAtom(node)`：注册原子操作（id 重复报错）。
  - `registerFunction(fn)`：注册 function（id 重复报错）。
  - `execute(id, params)`：执行 function，resolve output 节点全部 outputs 字段合并；params 直接作为 entry 节点的 input。
- **节点状态（槽位状态机）**：每节点维护 `slots`（已收到入边值）+ `missing`（未就绪入边字段）+ `status`（pending/running/done/aborted）+ `emitted`（本节点 emit 过的输出字段）。
- **AND 汇聚**：`missing` 为空即就绪；任一入边缺 → 保持等待。等待是**纯同步状态**（只有 slots/missing 数据），**不创建任何 Promise 等待器**——未就绪节点零异步资源，无泄漏。
- **emit 同步路由**：节点 fn 中 `ctx.emit(field, value)` 是同步操作——记录 emitted、沿出边填下游槽位、下游就绪则入 readyQueue。**派发用微任务**（避免 emit 深递归导致调用栈溢出）。
- **output 完成 + abort**：output 节点 done → 其 emitted 全部字段合并作为返回值；同时 `controller.abort()` 终止全部活动执行（并行分支被取消）。**一次 execute 一个共享 AbortController**，所有节点 ctx.signal 共用。
- **deps 注入**：`createFunctionExecutor<D>(deps)` 持有 deps，每个执行上下文 `ctx.deps` 直接引用（类型由 D 声明）。
- **错误处理**：fn 抛错/reject → 捕获 → 整个 function 失败 → resolve `{ error: { message, nodeId } }`，不向外抛；abort 导致的提前返回不算错误（正常取消）。**图校验错误（原子未注册等）同样 resolve 错误而非抛出**——错误捕获语义统一：execute 永远不向外抛。
- **与通讯协议衔接**：错误形状 `{ error: {...} }` 由 server 映射为协议层 `{ ok:false, code, message }`。

**本版范围**：注册表 + 图校验（entry/output/边引用节点都在原子注册表）+ execute + AND 汇聚 + emit 同步路由 + output 完成/abort + deps + 错误捕获 + entry 参数注入。
**留待后续**：`Call` 原子（编排图调 function）、环/死锁检测、执行超时、图校验增强。

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
- **执行位置是 function 元数据的声明属性**：`local` 字段，仅作**路由决策**，与原子注册表无关。
  - **`local = true`**：**前端本地执行**——框架用前端引擎直接运行该 function（用前端注册的原子接口）。
  - **`local = false`** / 缺省：**以 function_id 为 key 调用接口**——框架把 function_id 封装成请求发往后端，后端引擎执行（用后端注册的原子接口）。
  - local 不校验原子可达性：function 能否执行取决于目标端注册表是否含其编排图所需原子，缺原子则执行时报错。
- **内建数据操作固定后端执行**：createOne/updateOne/deleteOne/query 依赖后端 store，不声明 local。
- **前后端引擎完全一致**：同一套 function 编排引擎（节点调度、AND 汇聚、ctx.emit、output 完成语义、惰性调度），前端 local=true 与后端 local=false 用同一引擎代码。
- **唯一区别是注册的原子接口不同**：
  - 后端注册 **IO 类原子**：查询数据库、存储/事务操作等。
  - 前端注册**界面类原子**：跳转（navigate）、返回（back）等。

**推论**

- 前端运行时需要一套执行前端 function 的引擎（与后端同一套引擎代码，注册前端原子）。
- 例：`<Button on-click="model.login">` 点击时——`login.local=true` 则前端引擎本地执行；`local=false` 则发 `POST /sys/user { login: {...} }` 后端执行。
- local=true 的 function 天然不被后端调用：local=false 才产生网络调用，local=true 没有"被请求"入口。

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

数据协议**类似 GraphQL**，但**自己实现**，强调**轻量**。后端依据**前端数据地图（data map）**做**递归查询**：按前端声明的数据需求，递归遍历**复杂字段**，**聚合 + 清洗**数据后返回。

**推论**

- 数据地图 ≈ 前端的查询需求声明（类 GraphQL 的选择集）。
- 复杂字段的物理不存在性 + 递归聚合在这里落地：后端查询引擎根据 Model 关系图递归装配数据。

#### 5a. 通讯协议（method / URL / 错误语义）

- **仅 POST**（业务约束，技术不约束）：所有业务请求（查询与非查询）统一走 POST，正文携带请求对象。
  - 查询不单独用 GET：schema 是树形结构（嵌套 properties/items），塞进 URL query string 会面临长度限制与编码复杂度，因此查询也走 POST 正文携带。
- **URL**：`/namespace/name`——model 的两个字段（namespace + name）直查，如 `/sys/user`。
- **错误语义**：
  - **业务错误从响应体返回**（HTTP 200）：如校验失败、主键冲突、$delete 目标不存在。
  - **系统错误才设置 HTTP 状态码**：如 404（路由不存在）、500（引擎内部异常）。

#### 5b. 请求 / 响应正文

- **请求正文一定是对象**，格式 `{ <function_id>: <param> }`：
  - 例：`{ createOne: { ... }, updateOne: { ... } }`。
  - `<function_id>` 相对 **URL 中描述的 model**：一个页面必然对应一个 model（model 与 view 是 **O2M**，多个 view 呈现一个 model 的数据），请求体键名基于该 model 下的 function。
- **响应正文统一 `{ ok }` 包裹**：
  - 成功：`{ ok: true, data: { createOne: { ... }, updateOne: { ... } } }`——data 以请求的 function_id 为键，逐个返回结果。
  - 失败：`{ ok: false, code, message }`——**无 data**，整体失败，无部分成功概念。

#### 5c. 事务语义

- **一次请求 = 一次完整事务**：请求内所有 function 在同一事务中执行，全部成功才 commit，任一失败整体回滚。
- **前端依靠 model 关系推算本次事务需要的 function 集合**：一次交互涉及多个 model 时，前端按关系图把所需的 create/update/query 等一并放入同一请求体。
- **嵌套数据携带关联关系**：createOne/updateOne 的参数可嵌套携带关联数据，级联写入（事务保证原子性）。

#### 5d. $delete 特殊字段

- **仅 updateOne 内使用**：`updateOne(modelId, { id, $delete: true })` ≡ `deleteOne(modelId, { id })`。
- 语义：update 语义内表达删除，便于嵌套结构中就地删除关联记录（删除目标由 record 内主键定位）。

#### 5e. 内建 function（白名单声明）

- `createOne` / `updateOne` / `deleteOne` / `query` 是**预制 function**：注册 model 时**内建注册**（无 edges / entry / output / input），引擎拦截执行 native 操作。
- **model 中需白名单声明，不声明就不挂**：model 的 functions 列表声明了哪些内建操作，该 model 才对外开放哪些——未声明的内建操作不可通过请求正文调用。
- 内建 function 与普通 function / native function 以同一 function_id 命名空间共存，引擎按注册表分派（内建 → 拦截执行；编排 → 图执行；native → 直接调用）。

**待设计**：白名单声明的具体字段形态（如何区分内建引用与普通 function 定义）、内建 function 的输入/输出形状。

#### 5f. schema：CRUD 返回结构描述（子协议）

- **schema** 是内置 CRUD 接口特有的子协议，用于**描述返回的数据结构**，服务端解析并递归查询。
- **形式**：**去除校验的 JSONSchema**——借用 JSONSchema 的树形结构语法，去掉校验语义（minimum/pattern 等），只保留结构描述；**完整 JSONSchema 风格**：每个字段都写 `type`（含叶子简单字段）。
- **形状 ↔ 关系映射**（自然对应 Model 关系）：
  - **对象**（`type: "object"`）→ **O2O / M2O**（对侧单记录）。
  - **数组**（`type: "array"`）→ **M2M / O2M**（对侧多记录）。
- **query 调用形态**：`sys.model.query(schema, condition, option)`。
  1. 先 `sys.model.query(condition, option)` 拿到**第一层** records。
  2. 根据 **record + 第一层 schema** 向下递归解析：遇到对象/数组字段按关系定义查对侧 model，逐层装配。
- **分页 gap**：schema 描述不了嵌套集合的分页信息，因此分页放进 option，且 **option 按 model 分键**：`{ <model.id>: <option> }`——每层嵌套 model 各自独立分页（如 orders 数组用 `options["sys.order"]` 分页）。
- **适用范围**：**CRUD 全部复用**——create/update/delete 的返回同样走 schema（写入后可嵌套回读，如 createOne 携带嵌套数据后按 schema 返回装配结果）。
- **服务端解析校验**：schema 虽去除 JSONSchema 的**校验语义**（不校验值），但**解析时仍做形状一致性校验**——请求声明的结构必须与 Model 定义匹配，不匹配即报错（业务错误，走响应体）：
  - 例：字段在 Model 中是 string，schema 却声明为 object → 报错。
  - 例：schema 声明了 Model 中不存在的字段 → 报错。
  - 理由：**前后端可能不配套**（前端版本旧/新、元数据与实现错位），形状不匹配必须显式失败而非静默产出错误数据。

**例**（user → orders 为 O2M，auth 为 M2O）：

```json
// POST /sys/user
{
  "query": {
    "schema": {
      "type": "object",
      "properties": {
        "id":       { "type": "integer" },
        "username": { "type": "string" },
        "auth": {
          "type": "object",
          "properties": {
            "id":       { "type": "integer" },
            "provider": { "type": "string" }
          }
        },
        "orders": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id":    { "type": "integer" },
              "total": { "type": "floating" }
            }
          }
        }
      }
    },
    "condition": { "id": 1 },
    "options": {
      "sys.user":  { "limit": 10, "offset": 0 },
      "sys.auth":  { "limit": 10, "offset": 0 },
      "sys.order": { "limit": 5,  "offset": 0 }
    }
  }
}
```

**待设计**：（无——查询统一走 POST 正文，schema 与请求正文一并携带）。
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
- id 点分路径：`id = 父级id + "." + name`；顶层 namespace 为真正的命名空间（sys/业务模块名，不为空）；namespace 字段存父级 id。不同类型不同所属的对象必然唯一。
- referenceModel/associationModel 存目标 model 的完整 id（点分路径）。
- One2One 走中间表（associationModel）。
- 字段按类型区分（simple/enum/complex/relation），不是统一四键。
- 简单字段默认 store = true；复杂字段 store 强制 false。
- 前端组件类型本身也是 Model。
- 关系键命名：relationField（本侧字段）/ referenceField（对侧字段）/ referenceModel（对侧模型 id）/ associationModel（中间模型 id，仅 O2O/M2M）。
- 类型体系为内置字面量联合（FieldType），不做类型 Model。
- IStore：updateOne/deleteOne 以 record 内主键定位；query 用 IQueryCondition（等值或 [min,max] 闭区间）；事务接口返回 ITransactionStore（仅含数据操作）。
- array 字段：array=true 时统一 string 存储，逗号分隔 + 反斜杠转义（`\` 转义 `,`）。
- Function 编排：有向图（数据流触发 AND 汇聚，控制流降维为数据流），IAtomNode 不入库且无状态，output 节点全部 outputs 合并为返回值，执行错误捕获返回；惰性调度（等待是同步状态，引擎不预建 Promise 等待器，output 完成后 abort 活动执行）。
- virtual Model：virtual=true 不建表、纯内存无持久化；绑定 class（引擎注册表 model.id→class）；function 为 native（edges 空/entry/output 空串），经特殊原子操作 Call 以平等 Function 引用调用。
- 装饰器声明：@Meta.Model/@Meta.Field/@Meta.Function（TS 新标准）仅服务 virtual model，收集器在 require 求值时提取元数据入引擎注册表（纯内存）；目录动态 require 即装载。
- 通讯协议：仅 POST（所有业务请求统一 POST，查询也走正文携带 schema）；URL 为 `/namespace/name`（model 两字段直查）；业务错误从响应体返回（HTTP 200）、系统错误才设 HTTP 状态码；响应统一 `{ ok }` 包裹。
- 请求正文：`{ <function_id>: <param> }`（function_id 相对 URL 中描述的 model，model 与 view 是 O2M）；成功响应 `{ ok:true, data: { <function_id>: <result> } }`，失败 `{ ok:false, code, message }` 无 data（无部分成功概念）。
- 事务语义：一次请求 = 一次完整事务，全部成功 commit、任一失败整体回滚；前端靠 model 关系推算本次事务的 function 集合；createOne/updateOne 参数可嵌套携带关联关系级联写入。
- $delete：仅 updateOne 内使用，`updateOne(modelId, {id, $delete:true})` ≡ `deleteOne(modelId, {id})`。
- 内建 function：createOne/updateOne/deleteOne/query 为预制 function，注册 model 时内建注册（无 edges/entry/output/input），引擎拦截执行 native 操作；model 需白名单声明，不声明不挂。
- schema 子协议：内置 CRUD 接口的返回结构描述，采用去除校验的完整 JSONSchema 风格（每字段写 type）；对象 → O2O/M2O、数组 → M2M/O2M；`query(schema, condition, option)` 先查第一层再按 record+schema 递归装配；分页放 option 且按 model 分键 `{ <model.id>: <option> }`；CRUD 全部复用；服务端解析时做形状一致性校验（类型/字段与 Model 不匹配即报错，防前后端不配套）。
- 执行位置：IFunction 新增 local 字段——local=true 前端本地执行、local=false/缺省以 function_id 为 key 调接口（后端执行）；内建数据操作固定后端执行；local 仅作路由决策与原子注册表无关；前后端引擎完全一致仅注册的原子接口不同（后端 IO 类、前端界面类）。
- 执行上下文注入：IExecContext 泛型化 `IExecContext<D>`（D extends Record<string, unknown>），新增 `ctx.deps: D` 容器承载宿主注入物（后端 store、前端 history）；引擎启动注册注入物，每次执行统一注入。
- FunctionExecutor：Function 逻辑执行器（不叫 Engine）——无副作用纯执行器；节点槽位状态机（slots/missing/status/emitted）；emit 同步路由 + 微任务派发；output 完成合并返回值 + 共享 AbortController abort 活动执行；deps 泛型注入；错误捕获返回 `{ error: { message, nodeId } }`；创建时默认注册 sys 原子（options 可扩展/禁用）；图校验错误同样 resolve 不抛。
- 常量边：IFunctionEdge 支持 `constant?: unknown`（fromNode 空 + constant 有值 = 常量边，无源节点天然就绪，AND 汇聚照常）；constant 必须 JSON 可序列化——常量由边承载而非定制原子。
