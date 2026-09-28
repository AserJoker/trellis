# server 设计（骨架）

> 状态：骨架，待细化。server 包将进程内 Model 接口开放到 HTTP 端口，供 client 调用。
> 技术栈：Node 内置 `http` 起步，零依赖。

## 1. 职责边界

- **HTTP 服务**：监听端口，接收 client 的 HTTP 请求。
- **Model 接口开放**：将进程内 core 的 Model/function 能力映射为 HTTP 端点。
- **不包含**：元数据定义、查询聚合引擎、存储实现（均在 core/store）。

## 2. 请求路由（骨架）

- 数据查询：client 数据地图 → HTTP 请求 → server 调 core 递归查询 → 聚合返回
- function 调用：client 触发 → server 调 core function 执行（后端执行）
- **待细化**：URL 形状、请求/响应格式、错误语义

## 3. 与 core / store 的接线（骨架）

- server 依赖 core：使用 Model 注册表、查询聚合引擎、function 编排引擎。
- server 不直接碰存储：core 通过 `IStore` 接口访问存储，store 包实现该接口。

## 4. 启动装载（骨架）

- server 启动时从一个模块目录**动态 require 所有文件**。
- require 触发装饰器（@Meta.Model/@Meta.Field/@Meta.Function）求值 → 收集器把元数据注册进引擎注册表（纯内存）。
- 装载完成后即可对外提供 Model 接口（virtual model 的 class/function 已绑定）。
- **待设计**：装饰器参数与修饰目标、目录路径/过滤规则、重复装载/热重载语义。

## 4. 待细化项

- 路由表设计、HTTP 方法语义
- 请求/响应序列化格式（协议内化于 core 的 schema 解析）
- 错误处理、日志、启动/关闭生命周期
- 批处理 / 缓存 / 订阅（阶段 5）
