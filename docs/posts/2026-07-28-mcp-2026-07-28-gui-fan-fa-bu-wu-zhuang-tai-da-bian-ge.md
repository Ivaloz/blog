---
title: 'MCP 迎来"史上最大改版"：2026-07-28 正式规范如何把协议改成无状态'
date: 2026-07-28
slug: 'mcp-2026-07-28-gui-fan-fa-bu-wu-zhuang-tai-da-bian-ge'
description: '2026 年 7 月 28 日，Model Context Protocol（MCP）正式发布 2026-07-28 版规范——项目维护者称其为"标准历史上最大的一次修订"。核心变化是把协议层从有状态改为无状态：移除 initialize/initialized 握手与 Mcp-Session-Id 会话头，客户端信息改为随每次请求通过 _meta 字段传递，服务器由此可以跑在普通轮询负载均衡器后面，不再需要粘性会话或共享 Redis 存储。同时，Tasks 与 MCP Apps 被正式收编为独立版本管理的官方扩展，Sampling、Roots、Logging 等低使用率特性进入 12 个月弃用期。本文结合 MCP 官方博客、The Register、Stacktree 的报道，拆解这次改版的技术细节、破坏性变更清单与开发者迁移路径。'
author: 范伟彬
tags:
  - MCP
  - Model Context Protocol
  - Anthropic
  - AI Agent
  - 协议设计
  - AI 编程
  - 开发者工具
categories:
  - AI
  - 开发工具
---

# MCP 迎来"史上最大改版"：2026-07-28 正式规范如何把协议改成无状态

2026 年 7 月 28 日，Model Context Protocol（MCP）项目正式发布了编号为 **2026-07-28** 的新版规范。这不是一次跑分类的模型发布，而是一次协议层面的架构手术——MCP 维护者在官方博客里将其称为"标准历史上最大的一次修订"。如果说过去一年 MCP 是 AI 圈默认的"Agent 接工具"标准，那么这次改版要解决的问题是：当成千上万的企业把 MCP 服务器从本地开发机搬到云端生产环境后，最初为本地场景设计的有状态协议开始撑不住了。这篇文章会拆解这次规范改动的技术细节、哪些是会直接破坏兼容性的变更，以及作为使用 MCP（无论是写服务器还是写客户端/Agent）的开发者，现在应该做什么。

> 数据来源：MCP 官方博客《The 2026-07-28 MCP Specification Release Candidate》、The Register《Model Context Protocol prepares to break with its stateful past》、Stacktree《MCP 2026-07-28 spec: what changed, what breaks》等公开报道整理。

## 一分钟速览

- **发布时间**：2026 年 7 月 28 日，是候选版本（2026 年 5 月 21 日锁定）经过约 10 周验证期后的最终正式规范。
- **核心变化**：协议层从有状态改为**无状态**——移除 `initialize`/`initialized` 握手、移除 `Mcp-Session-Id` 会话头，客户端协议版本、身份、能力信息改为随每次请求通过 `_meta` 字段传递。
- **实际收益**：MCP 服务器可以直接跑在"普通轮询负载均衡器"后面，不再需要粘性路由（sticky session）、共享 Redis 会话存储，也不需要在负载均衡层做深度包检测。
- **两个扩展转正**：**MCP Apps**（SEP-1865，服务器可下发在沙箱 iframe 中渲染的交互式 HTML 界面）与 **Tasks**（SEP-2663，长时任务从阻塞式改为基于句柄的轮询模型），都被收编为正式的、独立版本管理的官方扩展。
- **正式的 Extensions 框架**（SEP-2133）：新能力以反向 DNS 命名，通过 `extensions` 能力映射协商，独立仓库、独立维护者、独立版本节奏，不再需要绑定核心规范发版。
- **特性生命周期政策**：首次引入正式弃用流程，最短 12 个月窗口。Sampling、Roots、Logging 因"实际使用率很低""语义混乱、难以正确实现"被标记弃用。
- **破坏性影响**：新旧客户端/服务器可能互不兼容。官方明确表示"兼容性要求双方共享同一个受支持的协议时代，或者一方实现有意的降级/转译逻辑"。四个一级 SDK 已在发布当日同步支持新版规范。

## 背景：MCP 为什么必须"动大手术"

MCP 由 Anthropic 在 2024 年发布，目标是给大模型和外部工具、数据源之间建立一套标准化的"USB-C 接口"，取代过去每个 Agent 框架各自造轮子对接工具的局面。这套协议最初的设计假设是本地开发场景：一个 IDE 插件启动一个本地 MCP 服务器子进程，双方建立一次会话、保持连接、来回通信。有状态的设计在这个场景下没有问题。

但 2025 到 2026 年，MCP 生态的重心迅速从"本地小工具"转向"企业生产环境"：越来越多团队把 MCP 服务器部署成云端多实例服务，前面挂负载均衡器，后面对接权限系统、审计日志、多租户网关。这时候有状态协议的代价就暴露出来了——每个操作都要维护协议级会话，服务端要么用粘性会话把同一个客户端的请求固定路由到同一个实例，要么引入共享的 Redis 之类的存储来跨实例同步会话状态，网关还得对 JSON-RPC 消息体做深度包检测才能正确路由。这些都是典型的"为单机场景设计的协议，被硬套进分布式系统"时会出现的摩擦。

The Register 的报道引用了 Stacklok CEO Craig McLuckie 的评价，称这次转向"必要且明智"（necessary and sensible），因为它让 MCP 更适合企业在生产系统前置安全控制点——无状态协议对网关、WAF、审计系统天然更友好，因为路由信息可以直接从 HTTP 头拿到，不需要解析请求体才能做决策。

## 技术细节解析

### 1. 协议层无状态化：三个 SEP 联手拆掉"会话"

这次改版最核心的三个变更编号分别是：

- **SEP-2567**：移除协议层会话和 `Mcp-Session-Id` 头。列表类端点（`tools/list`、`resources/list`、`prompts/list`）的返回结果不再因连接而异——也就是说，同一个请求发给集群里任意一台服务器实例，得到的结果应该是一致的。
- **SEP-2575**：移除 `initialize`/`initialized` 握手交换。过去客户端连上服务器要先做一轮"握手"协商协议版本和能力，现在这个交换被取消，改为每个请求都在 `_meta` 字段里自带协议版本、客户端身份、客户端能力信息。作为配套，服务器需要实现一个新的 `server/discover` RPC，用来声明自己支持哪些协议版本和能力，供客户端在真正发起调用前查询。
- **SEP-2663**：Tasks 的阻塞式结果获取方式被移除，长任务从核心协议移出，成为一个独立版本管理的官方扩展。

这三点合起来的效果是：MCP 服务器不再需要在内存或外部存储里为每个"会话"保留状态，任何一次请求都可以被集群里的任意实例处理——这正是"无状态服务水平扩展"的标准形态，Kubernetes 场景下的滚动升级、自动扩缩容都能直接受益。

### 2. 需要状态怎么办：显式句柄模式

协议层无状态不等于应用层不能有状态——很多真实场景（比如一个需要多轮交互才能完成的长任务）本来就需要"记住上次说到哪了"。新规范给出的做法是**显式句柄（explicit handle）模式**：工具在返回结果时带上一个标识符（handle），后续调用把这个标识符当作普通的工具参数传回去，而不是依赖传输层隐藏的会话状态。

这个设计的好处是句柄对大模型是可见的——模型能"看到"自己拿到了一个句柄、需要在下一步调用里传回去，这比状态藏在协议元数据里、模型完全不知情要更符合 Agent 的工作方式，也更容易被模型自己正确地组合调用。

### 3. Tasks 扩展：从阻塞轮询到 tasks/get

旧版 Tasks 是阻塞式的：客户端发起一个长任务后，要么一直等待连接返回结果，要么依赖会话保活。新的 Tasks 扩展基于服务器签发的句柄，客户端改用 `tasks/get` 轮询任务状态，配合服务端主导的生命周期模型。这一变化直接服务于无状态目标——轮询天然不需要长连接或会话保活，任意实例都能处理某一次 `tasks/get` 查询。

### 4. 采样与征询：多轮往返（MRTR）模式

在需要模型二次确认输入的场景（Sampling、Elicitation）里，服务器不再依赖持久连接来"等"客户端把缺失信息补上，而是返回一个 `InputRequiredResult`，里面带着 `inputRequests` 和 `requestState`。客户端收集到用户或模型补充的信息后，重新发起原始调用（带上 `requestState`）。这种"多轮往返"模式让任何一个无状态的服务器实例都能在收到重新发起的调用时把工作接续上，不需要记得"上次是谁问的"。

### 5. 可运维性改进

- 新增 `Mcp-Method` 和 `Mcp-Name` 请求头，让负载均衡器、网关不解析 JSON-RPC 消息体也能按方法/工具名路由流量。
- `tools/list` 等列表响应新增两个**必需字段**：`ttlMs`（缓存有效期，毫秒）和 `cacheScope`（`public` 或 `private`），客户端和中间代理据此决定能不能缓存、缓存多久。
- 支持 W3C Trace Context 传播，分布式追踪终于能把一条请求链路从客户端一路串到某个具体的 MCP 服务器实例。

### 6. Schema 与授权同步升级

工具的 `inputSchema`、`outputSchema` 升级到完整的 JSON Schema 2020-12，支持组合（`allOf`/`oneOf`）、条件校验（`if`/`then`）和 `$ref` 引用，不再是过去阉割版子集。授权方面有六个 SEP 加强了与 OAuth 2.0 / OpenID Connect 的对齐：客户端必须校验授权响应里的 `iss` 参数，动态客户端注册要声明 `application_type`，并补上了刷新令牌请求的规范细节。

### 7. 治理机制：不让"史上最大改版"再来一次

这次改动带来了不小的阵痛，官方也同步引入了三个治理机制，目的是避免未来再出现这种一次性大爆炸式的破坏性变更：

1. **特性生命周期政策**：任何要移除的特性必须先进入正式弃用状态，保留至少 12 个月窗口。这次 Sampling、Roots、Logging 就是按这个流程被标记弃用的——Roots 的替代方案是用工具参数或资源 URI 表达路径，Sampling 建议直接对接 LLM 提供商 API，Logging 则用标准错误输出或 OpenTelemetry 代替。
2. **Extensions 框架**：新能力从"实验性"到"官方"有了结构化路径，用反向 DNS 命名、独立仓库、独立维护者、独立版本节奏,不必等待核心规范发新版才能演进。
3. **一致性测试套件要求**：为后续的兼容性把关。

## 实践指南：作为开发者，现在该做什么

如果你在写 MCP 服务器或者客户端/Agent 集成，参考 Stacktree 给出的迁移路径，实际可以按这几步走：

**第一步：确认兼容性边界。** 新旧客户端/服务器不保证互通——"兼容性要求双方共享同一个受支持的协议时代，或者一方实现有意的降级/转译逻辑"。如果你的服务器面向未知第三方客户端，短期内需要同时支持旧版握手流程和新版 `server/discover`，直到确认调用方都已升级。

**第二步：用官方 SDK 升级，而不是手搓协议细节。** 四个一级 SDK 已经在发布当日同步支持 2026-07-28 规范。如果你的实现基于官方 SDK，升级依赖版本本身就能拿到大部分改动；如果是自定义实现（比如手写 JSON-RPC 处理逻辑），需要做的返工会明显更多，尤其是要重新实现 `_meta` 元数据解析和 `server/discover`。

**第三步：把跨调用状态改成显式句柄。** 检查代码里是否有依赖 `Mcp-Session-Id` 或连接保活来传递状态的逻辑，把它们改造成"工具返回句柄 → 下一次调用把句柄当参数传回"的模式：

```json
// 旧模式：依赖会话隐式保存查询游标
// Request 1 (同一会话内)
{"method": "tools/call", "params": {"name": "search_docs", "arguments": {"query": "MCP"}}}
// Request 2 (依赖服务端记得上次查到哪)
{"method": "tools/call", "params": {"name": "search_docs_next_page", "arguments": {}}}

// 新模式：显式句柄，任意实例都能处理
// Request 1
{"method": "tools/call", "params": {"name": "search_docs", "arguments": {"query": "MCP"}}}
// Response 1
{"result": {"content": [...], "_meta": {"cursorHandle": "srv-8f2e...-page2"}}}
// Request 2：句柄作为普通参数传回，任意服务器实例都能继续处理
{"method": "tools/call", "params": {"name": "search_docs", "arguments": {"query": "MCP", "cursorHandle": "srv-8f2e...-page2"}}}
```

**第四步：长任务从阻塞等待改成轮询。** 如果你的服务器有耗时操作（比如触发一次代码库全量索引、跑一个数据管道),把返回逻辑从"占住连接等结果"改成"立刻返回任务句柄,客户端用 `tasks/get` 轮询":

```json
// 发起长任务，立即返回句柄而不是阻塞等待
{"method": "tools/call", "params": {"name": "reindex_repo", "arguments": {"repo": "org/app"}}}
// Response：立刻返回，不阻塞连接
{"result": {"_meta": {"taskHandle": "task-a1b2c3"}}}

// 客户端轮询状态
{"method": "tasks/get", "params": {"taskHandle": "task-a1b2c3"}}
// 未完成
{"result": {"status": "running", "progress": 0.4}}
// 完成
{"result": {"status": "completed", "output": {...}}}
```

**第五步：给列表端点补上 `ttlMs` 和 `cacheScope`。** 这是新规范的必需字段,如果你的服务器手工拼装 `tools/list` 响应而不是走 SDK,记得补上,否则会被判定为不合规实现,下游网关的缓存策略也可能因此失效。

**第六步：清理对 Sampling / Roots / Logging 的新增依赖。** 这三个特性已经进入 12 个月弃用窗口,现在开始新项目应该直接用替代方案(对接 LLM 提供商 API、用工具参数/资源 URI 表达路径、用 OpenTelemetry 记日志),避免临近弃用期限时再返工。

## 总结与展望

MCP 这次"史上最大改版"背后的逻辑并不复杂:一个为本地开发场景设计的协议,在过去一年被迅速推向了企业级生产部署,有状态设计的可扩展性问题必然会被放大到无法忽视的程度。把协议层改成无状态,本质上是在补上"从原型到生产"这一课——牺牲短期的兼容性稳定,换取长期能够被 Kubernetes、负载均衡器、多租户网关这些标准云基础设施正常对待的能力。

对开发者来说,这次改版的现实意义有两层。短期看,如果你依赖第三方 MCP 服务器或维护自己的实现,需要认真评估一次兼容性风险,尤其是自定义协议实现的团队要做好返工准备;长期看,新引入的特性生命周期政策和 Extensions 框架,应该能避免"每次大版本都可能不兼容"变成 MCP 生态的常态——这也是这套标准能不能真正撑起企业级 Agent 基础设施的关键一步。考虑到 Claude Code、各类 Agent 框架和大量第三方工具都已经深度依赖 MCP,接下来几个月各家 SDK 和主流客户端的升级进度,值得持续关注。

## 参考来源

- [The 2026-07-28 MCP Specification Release Candidate - Model Context Protocol Blog](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)
- [Model Context Protocol prepares to break with its stateful past - The Register](https://www.theregister.com/devops/2026/07/23/model-context-protocol-prepares-to-break-with-its-stateful-past/5276722)
- [MCP 2026-07-28 spec: what changed, what breaks - Stacktree](https://stacktr.ee/blog/mcp-2026-spec-changes)
- [Model Context Protocol · GitHub](https://github.com/modelcontextprotocol)
