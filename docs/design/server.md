# server 设计（骨架）

> 状态：骨架，待细化。server 包将进程内 Model 接口开放到 HTTP 端口，供 client 调用。
> 技术栈：Node 内置 `http` 起步，零依赖。

## 1. 职责边界

- **HTTP 服务**：监听端口，接收 client 的 HTTP 请求。
- **Model 接口开放**：将进程内 core 的 Model/function 能力映射为 HTTP 端点。
- **不包含**：元数据定义、查询聚合引擎、存储实现（均在 core/store）。

## 2. 请求路由

- **method 约束**：仅 POST（业务约束，技术不约束）——所有业务请求（查询与非查询）统一走 POST。
  - 查询不单独用 GET：schema 是树形结构（嵌套 properties/items），塞进 URL query string 面临长度限制与编码复杂度，查询也走 POST 正文携带。
- **URL 形状**：`/namespace/name`（model 的两个字段直查），如 `/sys/user`。
- **请求正文**：`{ <function_id>: <param> }`——function_id 相对 URL 中描述的 model；一次请求 = 一次完整事务。
- **响应正文**：统一 `{ ok }` 包裹；成功 `{ ok:true, data: { <function_id>: <result> } }`，失败 `{ ok:false, code, message }`（无 data，整体回滚）。
- **错误语义**：业务错误从响应体返回（HTTP 200）；系统错误才设置 HTTP 状态码（404 路由不存在、500 引擎异常）。
- **内建 function**：createOne/updateOne/deleteOne/query 为预制 function（model 白名单声明后开放），引擎拦截执行 native 操作；返回结构由 schema 子协议描述（对象 → O2O/M2O、数组 → M2M/O2M，分页 option 按 model 分键）。

## 3. 与 core / store 的接线（骨架）

- server 依赖 core：使用 Model 注册表、查询聚合引擎、function 编排引擎。
- server 不直接碰存储：core 通过 `IStore` 接口访问存储，store 包实现该接口。

## 4. 启动装载（骨架）

- server 启动时从一个模块目录**动态 require 所有文件**。
- require 触发装饰器（@Meta.Model/@Meta.Field/@Meta.Function）求值 → 收集器把元数据注册进引擎注册表（纯内存）。
- 装载完成后即可对外提供 Model 接口（virtual model 的 class/function 已绑定）。
- **待设计**：装饰器参数与修饰目标、目录路径/过滤规则、重复装载/热重载语义。

## 5. 待细化项

- 请求/响应序列化细节
- 白名单声明的具体字段形态（内建 function 如何声明）
- 错误码（code）枚举、日志、启动/关闭生命周期
- 批处理 / 缓存 / 订阅（阶段 5）
