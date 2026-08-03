---
title: 'YC 开源 QM：当"多智能体协同"从个人工具变成公司操作系统'
date: 2026-08-02
slug: 'yc-kaiyuan-qm-duo-agent-xietong-pingtai'
description: '2026 年 7 月 31 日，Y Combinator 开源了它内部使用的多智能体协作平台 QM（quartermaster 的缩写），MIT 协议，仓库 yc-software/qm 在数小时内收获近 5000 star。与 Claude Code、Codex 这类默认"单人单会话"的编程助手不同，QM 把"一整个公司"当作默认场景：每个员工、每个 Slack 频道都拥有独立的记忆、权限与沙箱，同时可以在共享频道里协同工作，背后可插拔 Pi、OpenCode、Codex、Claude Code 等任意智能体后端。本文基于 YC 官方公告、GitHub 仓库文档及多家科技媒体报道，拆解 QM 的架构设计、三档安全策略（Strict/Auto/Dangerous）与部署方式，并给出一份从零搭建的实践指南。'
author: 范伟彬
tags:
  - QM
  - Y Combinator
  - 多智能体
  - Agent
  - 开源
  - Claude Code
  - Slack
categories:
  - AI
  - 开发者工具
---

# YC 开源 QM：当"多智能体协同"从个人工具变成公司操作系统

2026 年 7 月 31 日，Y Combinator 在其官方 X 账号上宣布：开源它内部一直在用的多智能体协作平台，代号 **QM**（quartermaster，"军需官"的缩写——在船上负责协调补给、维持秩序的角色）。YC 官方的原话是，QM 被设计得"像 Hermes 或 OpenClaw 一样容易定制，但要能撑起整个公司的使用"，YC 自己在会计、法务、活动策划乃至工程团队（包括开发 QM 本身）都在用它。项目以 MIT 协议开源，仓库 [yc-software/qm](https://github.com/yc-software/qm) 在公告发出后的几个小时内就积累了近千 star，随后几天涨到近 5000 star，也登上了 Hacker News 首页。

这条新闻乍看是"又一个 agent 框架开源"，但值得深入写一篇文章的原因在于它选择的切入点：过去一年多,无论是 Claude Code、Codex CLI 还是各种 "OpenClaw" 风格的终端 agent，默认假设都是"一个人、一个会话、一次任务"。QM 反其道而行之——它把"一整个公司"当作第一等公民：每个员工有自己的工作区，每个 Slack 频道、每个项目也有自己的工作区，彼此隔离又能协同，管理员可以统一设定安全策略、可用技能和预算。这实际上是在回答一个越来越现实的问题：当一家公司里有几十上百个人同时在用 AI agent 干活时，谁来管这些 agent 的身份、权限、记忆和审计日志？QM 给出的答案,某种程度上代表了"多智能体基础设施"这个新品类接下来会长成什么样子。

> 数据来源：Y Combinator 官方 X 公告、GitHub 仓库 [yc-software/qm](https://github.com/yc-software/qm) 及其 `docs/getting-started.md`、Hacker News 讨论串，以及 explainx.ai、StartupHub.ai、Startup Fortune 等媒体报道整理。

## 一分钟速览

- **发布时间**：2026 年 7 月 31 日，Y Combinator 官方 X 账号宣布开源。
- **项目名称**：QM，取自 quartermaster（军需官）。
- **仓库与协议**：[github.com/yc-software/qm](https://github.com/yc-software/qm)，MIT 协议，发布数小时内 star 破千，随后逼近 5000。
- **核心定位**：面向"整个公司"的多人多智能体协作平台，而不是单人编程助手。
- **技术栈**：TypeScript + Node.js + Fastify + PostgreSQL，Slack 插件基于 Bolt，Web UI 基于 Vite/Lit。
- **模型无关**：可插拔 Pi、OpenCode、Codex、Claude Code 等任意 agent harness 作为执行内核。
- **安全策略**：Strict / Auto / Dangerous 三档，组织级统一配置。
- **部署方式**：`qm init` 直接从发布的 npm 包生成部署目录，无需克隆整个仓库，可部署到 Fly.io 或 AWS。

## 为什么是"公司操作系统"而不是"又一个 agent 框架"

理解 QM 的关键,是理解它和 Claude Code、Codex CLI、各种 OpenClaw 风格工具的根本差异——不是能力强弱,而是"默认的使用单位"不同。

个人向的编码 agent，默认场景是"我打开终端，让 agent 帮我改一段代码"，会话结束、上下文清空，下一次是全新的开始。这类工具做得越来越强，但它们天然没有"公司"这个概念：不知道谁是谁、不知道这个频道属于哪个项目、不知道该给这条消息里的用户什么权限。

QM 的设计从第一天就是反过来的。YC 内部的真实场景是：财务团队有一个 Slack 频道在用 agent 对账,法务团队有另一个频道在用 agent 起草合同,工程团队则直接在 QM 自己的代码库里用 agent 写 QM 的下一个版本——这些工作流需要共存在同一个平台上,但彼此的数据、权限、记忆必须严格隔离,同时组织的管理员需要有统一的地方去设置"这个公司允许 agent 做到什么程度"。这就是 QM 里"scope"（作用域）这个核心抽象的来源：每个员工个人、每个 Slack 频道、每个项目都是一个独立的 scope，各自拥有独立的记忆、文件、密钥（keychain）、权限和沙箱，同时又能在共享频道里以统一的身份互相协作。

这种设计思路,某种意义上和这个博客之前写过的 Ray/Anyscale（分布式计算调度层）、MCP 规范（工具协议层）是同一条脉络的延伸——大模型能力本身已经足够强,行业接下来比拼的是"给一堆 agent 配的基础设施"：调度、身份、权限、审计、协作,这些"无聊但必需"的系统工程问题。QM 选择在"公司级多人协作"这个位置切入，是对这条脉络很有代表性的一次实践。

## 架构拆解

QM 的核心是一个**无头（headless）TypeScript 核心**，跑在 Node.js 上，用 Fastify 提供 HTTP API，用 PostgreSQL 做状态持久化。围绕这个核心，有几层设计值得展开讲：

### 1. Scope：隔离与协作的基本单位

每个 scope（个人、频道、项目）拥有：
- 独立的**记忆**（agent 对该 scope 历史交互的长期记忆）；
- 独立的**文件与沙箱**（一个持久化的执行环境，`execute` 工具跑的命令、装的依赖包会在多轮对话之间保留下来，而不是每次都重新起一个干净容器）；
- 独立的**权限与 keychain**（该 scope 能访问哪些外部服务的凭证）；
- 独立的**定时任务（cron）与监听（watch）**，用于跑周期性或事件触发的后台自动化。

同时,一个员工在多个 scope 之间移动时（比如同时出现在个人 DM 和某个共享项目频道里）,他的身份是一致的、可追溯的,这也是 QM 反复强调的"multiplayer"（多人）特性——它不是把很多个独立单人 agent 简单拼在一起，而是让"人"和"agent"共存在同一套身份与协作体系里。

### 2. 模型无关：Pi / OpenCode / Codex / Claude Code 皆可插

QM 本身不训练模型，也不绑定某一家的 agent harness，而是做成了一层"可插拔执行内核"的抽象——不管底层用的是 Pi、OpenCode、Codex 还是 Claude Code，跑的都是同一套 agent loop、同一套 scope/权限体系。这个设计决定意味着一家公司换模型供应商、或者针对不同任务混用不同 harness（比如用 Claude Code 处理代码相关的 scope，用别的 harness 处理非代码类事务性工作），不需要重新搭一套协作基础设施。

### 3. 三档安全策略：Strict / Auto / Dangerous

这是 QM 里最直接体现"公司级"考量的部分。组织管理员可以在三种安全姿态里选一种，作用于整个组织：

| 策略 | 行为 |
|---|---|
| **Strict** | 每一次工具调用都需要人工审批后才能执行 |
| **Auto**（默认） | 外部数据在进入模型之前会先经过一层分类器screening，减少 prompt injection 等风险，但正常操作无需逐条审批 |
| **Dangerous** | 不做内容筛查、不暂停等待审批，agent 直接以用户的凭证自由行动 |

值得注意的是，无论选哪一档，**预先声明的命令策略（predeclared command policy）始终强制生效**——也就是说，管理员可以事先白名单/黑名单某些命令或工具，这条底线不会被"Dangerous"模式绕过。这种"默认给一个相对安全的中间态（Auto），但把最终决定权交给组织管理员"的思路，和目前多数个人向 agent 工具"要么完全信任、要么每步都问"的二元设计相比，更贴近真实企业环境里的风险管理需求。

### 4. 部署：不需要 clone 仓库

QM 的部署方式也做了针对企业场景的优化——不是让每个使用者去 clone 完整源码仓库、跑起来再改配置，而是通过 CLI 从已发布的 npm 包直接"实例化"一个部署目录：

```bash
npm exec --yes --package=@yc-software/qm@latest -- \
  qm init . --org <your-org-slug> --target <fly-or-aws>
```

执行后，`qm init` 会在本地生成一个 `deploy/layers/<org>/` 目录，里面包含该组织专属的配置文件、沙箱定制、云服务商坐标（provider coordinates）以及自动生成的 Slack manifest。组织的所有个性化改动都隔离在这个 layer 目录里，相当于维护了一份"私有 fork"，但又不需要真的去 fork 整个上游代码库、承担合并冲突的维护成本——上游升级时可以更平滑地拉取新版本。

部署目标目前支持 **Fly.io** 或 **AWS**，这个选择会在 `init` 阶段一次性决定，因为它直接影响后续生成的配置文件、密钥管理规则以及"如何优雅下线（teardown）"这三件事的具体实现。身份认证默认走内置的 `auth` broker（需要提供管理员邮箱和 Resend Key 或 SMTP 凭证用于发送验证邮件），如果公司已经有自己的 SSO/身份提供商，也可以从 `services` 列表里移除 `"auth"`，换成外部身份源，只要对方能正确注册回调地址即可。

## 实践指南：从零跑起一个 QM 实例

如果你想亲自体验 QM 的多人协作模式，可以按下面的顺序上手（以下步骤基于官方 `docs/getting-started.md` 整理，实际操作请以仓库最新文档为准）：

1. **准备环境**：一台能跑 Node.js 的机器，以及一个 Fly.io 或 AWS 账号（用于后续部署容器化的服务）。

2. **初始化组织部署目录**：

   ```bash
   npm exec --yes --package=@yc-software/qm@latest -- \
     qm init . --org acme --target fly
   cd deploy/layers/acme
   npm install
   ```

3. **配置身份认证**：如果暂时不接第三方 SSO，保留默认的 `auth` 服务，在生成的配置文件里填入管理员邮箱，以及用于发送登录验证邮件的 Resend Key（或 SMTP 账号密码）。

4. **配置 Slack（可选）**：`qm init` 会生成 Slack App 的 manifest 文件，按提示在 Slack 开发者后台创建 App、导入 manifest、拿到必要的 token 填回配置。这一步让 QM 能作为一个 Slack Bot 出现在你的工作区里，员工可以直接在频道里 @ 它协作。

5. **选定安全策略**：初次尝试建议从 **Auto** 档开始（默认档），先熟悉 agent 在不同 scope 里的行为边界，等确认审查流程可靠后，再考虑对高敏感场景切到 Strict，或对完全信任的自动化任务切到 Dangerous。

6. **选择 agent 执行内核**：在配置里指定希望这个组织默认使用哪个 harness（Pi / OpenCode / Codex / Claude Code），也可以针对不同 scope 分别指定——比如工程相关的项目频道用 Claude Code，其他事务性频道用别的 harness。

7. **部署并验证**：按 `qm init` 生成的部署脚本推送到 Fly.io 或 AWS，起服务后在 Web UI 或 Slack 里创建一个测试 scope，验证记忆、权限隔离、沙箱持久化这几个核心特性是否符合预期，再逐步向真实团队开放。

对个人开发者而言，即使暂时用不上"整个公司"这个规模，QM 的源码本身也值得一读——它展示了一套相对成熟的"多租户 + 多智能体"权限与状态管理设计，这套思路即便自己写一个小型内部工具，也有直接的借鉴价值。

## 总结与展望

把 QM 放进过去一年"agent 基础设施"演进的坐标系里看，会更清楚它的位置：模型能力（推理、编码、工具调用）已经被 Claude、GPT、Gemini、DeepSeek 等各家反复刷新，逐渐进入"够用"区间；行业的下一轮竞争,正在往"怎么把一堆 agent 安全、可控地组织起来为一个组织服务"这个方向转移——无论是 MCP 这样的工具协议、Ray/Anyscale 这样的分布式调度层，还是 QM 这样的"公司级多智能体协作平台"，都是同一条脉络上不同层面的答案。YC 选择把自己"吃自己的狗粮"跑了一年多的内部系统开源出来，某种程度上也是在给这个新品类立一个参考实现——MIT 协议、模型无关、可插拔任意 harness，降低了其他团队复用或者二次开发的门槛。

对开发者和技术团队而言，QM 目前仍是一个非常年轻的项目（发布仅两天），生产环境落地前需要更多观察：安全策略的默认边界是否足够稳妥、多 scope 并发下的资源隔离是否可靠、社区生态（尤其是围绕"共享技能"的插件市场）能否发展起来，都还需要时间验证。但作为一个信号，它清楚地提示了一件事：当你的团队里同时有多个人、多个部门都在用 AI agent 干活时，"每个人各自开一个终端跑 Claude Code"这种模式迟早会遇到身份、权限、审计层面的扩展性瓶颈——QM 提供的"公司操作系统"思路，值得任何正在规模化使用 agent 的团队认真读一读它的设计文档，哪怕最终选择自己造轮子。

## 参考来源

- [Y Combinator 官方公告 - X (Twitter)](https://x.com/ycombinator/status/2083243960684908768)
- [yc-software/qm - GitHub 仓库](https://github.com/yc-software/qm)
- [qm/docs/getting-started.md - GitHub](https://github.com/yc-software/qm/blob/main/docs/getting-started.md)
- [QM — Open-Source Agent Harness from YC](https://qm.ycombinator.com/)
- [qm – Multiplayer agent harness for work - Hacker News 讨论](https://news.ycombinator.com/item?id=49126604)
- [Y Combinator Open-Sources QM, the AI Agent Harness It Uses to Run Itself - Startup Fortune](https://startupfortune.com/y-combinator-open-sources-qm-the-ai-agent-harness-it-uses-to-run-itself/)
- [YC QM Open-Source Multi-Agent Harness 2026 - explainx.ai](https://explainx.ai/blog/y-combinator-qm-open-source-multi-agent-harness-august-2026)
