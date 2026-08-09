---
title: 'Cloudflare 发布 Kitesurf：一个完全不含 Chromium、跑在 V8 isolate 里的"AI 专属浏览器"'
date: 2026-08-09
slug: 'cloudflare-kitesurf-agent-first-browser'
description: '2026 年 8 月 6～7 日，Cloudflare 发布 Kitesurf——一个从零构建、完全不依赖 Chromium、直接运行在 Cloudflare Workers V8 isolate 里的"代理优先"浏览器引擎。本文基于 Cloudflare 官方博客与 TechCrunch、MarkTechPost 等报道，拆解它用 Rust 渲染引擎 Blitz、Firefox 的 CSS 解析器 Stylo、ECMAScript 引擎 Boa 拼出一个浏览器的架构决策，给出 CPU/内存/延迟的实测对比数据，以及通过 CDP、Quick Actions API、MCP 三种方式接入的代码示例。'
author: 范伟彬
tags:
  - Cloudflare
  - Kitesurf
  - AI Agent
  - 浏览器引擎
  - Cloudflare Workers
  - Rust
  - 开发者工具
categories:
  - AI
  - 开发者工具
---

# Cloudflare 发布 Kitesurf：一个完全不含 Chromium、跑在 V8 isolate 里的"AI 专属浏览器"

2026 年 8 月 6 日到 7 日，Cloudflare 通过官方博客和产品页面发布了 Kitesurf——一个专门为 AI 代理（agent）设计的云端浏览器。TechCrunch、MarkTechPost 等科技媒体随即跟进报道，标题里反复出现同一个关键词："not for humans"。这不是又一个套壳 Chromium 的无头浏览器服务，Kitesurf 的野心要大得多：它完全不含 Chromium，也不含任何现成的浏览器内核，而是用 Rust 生态里几个原本分散的开源组件——渲染引擎 Blitz、Firefox 的 CSS 解析器 Stylo、ECMAScript 引擎 Boa——从零拼出了一个浏览器，并且让它直接运行在 Cloudflare Workers 的 V8 isolate 里，用 12 周时间跑通了 21.5 万条以上的 Web Platform Tests（WPT）。

这篇文章想讲清楚三件事：为什么"给 AI 用的浏览器"值得从零造一个新引擎，而不是继续在 Chromium 上做减法；Kitesurf 的架构具体长什么样；以及开发者今天就能怎么把它接进自己的 agent 工作流。

## 一、背景：为什么现有的无头浏览器方案不够用

过去两年，"给 AI 代理配一个浏览器"几乎是所有 agent 框架的标配能力——Playwright、Puppeteer 驱动 Chromium 的组合被广泛复用，Browserbase、Browserless 这类云端无头浏览器服务也因此起量。但 Cloudflare 在官方博客里给出的判断是：这条路径从一开始就选错了优化目标。

Chromium 是为人类打造的：它要处理标签页、主题、浏览器扩展、书签同步、密码管理器、多进程沙箱之间为了安全和用户体验做的层层隔离。这些能力对一个只需要"打开一个 URL、点几个按钮、抓一段 HTML 或截一张图"的 AI 代理来说，全部是无谓的开销。Cloudflare 的原话很直接：AI 不关心标签页、主题、浏览器扩展，它关心的是 token 数量、上下文窗口、可扩展性、性能和成本。用一整套为人类交互设计的浏览器去承载机器任务，本质上是在为不需要的东西持续付费——不管是以 CPU 时间、内存占用，还是以云服务的账单形式。

同时，把 Chromium 塞进无服务器环境本身也别扭：Chromium 进程重、启动慢、内存占用大，天然不适合 Cloudflare Workers 这种按请求毫秒级计费、以 V8 isolate 为隔离单元的运行时。于是 Cloudflare 给自己出了一道更难但更彻底的题：能不能造一个浏览器，从设计第一天起就只服务于代理任务，并且原生跑在 Workers 里。

## 二、技术细节解析：三个开源组件怎么拼成一个浏览器

Kitesurf 的架构分成三层，官方博客把设计哲学总结为"能做成无状态的组件就必须无状态"，只在真正需要的地方保留状态。

**1. Engine 层（唯一有状态的公共接口）。** 这一层对外暴露 Chrome DevTools Protocol（CDP）的 WebSocket 接口和 HTTP REST API，也是整个架构里唯一保存会话状态的组件。选择兼容 CDP 是一个务实的决定——它意味着现有的 Puppeteer、Playwright、chrome-remote-interface 生态可以几乎不改代码地切换过来,不需要为 Kitesurf 单独学一套新协议。

**2. PageScript 层（页面执行环境）。** 每个页面的解析和脚本执行被隔离在独立的 Dynamic Worker 里运行：
- HTML/CSS 解析用的是 Blitz 的模块化渲染引擎，配合 Firefox 团队维护的 Rust CSS 解析器 Stylo；
- JavaScript 直接在 Worker 的 V8 isolate 里执行；
- 但 `eval()`、`new Function()` 这类动态代码执行不能直接信任 V8 isolate 本身的隔离边界，Cloudflare 在这里引入了 Boa——一个用 Rust 写的 ECMAScript 引擎——在 isolate 内部再跑一层受控的运行时,官方把这个做法形容为"在一个运行时之上再跑一个运行时"（execute a runtime on top of a runtime）。

**3. PageRenderer 层（光栅化输出）。** 需要截图或生成 PDF 时，交给 Blitz 的 blitz-paint 模块做光栅化，文字排版和换行由 Parley 库处理，最终吐出 JPEG/PNG 或 PDF。

**4. 网络出口的统一收口。** 所有页面的出站网络请求都被路由到单一的 SandboxOutbound Worker，由它统一执行 CORS 策略、注入浏览器标识请求头、维护每个页面独立的 Cookie jar；违反策略的请求直接返回 403。这种"单点收口"的设计让安全策略只需要在一处维护，也方便后续做审计和限流。

**5. 工程方法论上的三条硬规则**：能编译到 WebAssembly 就直接编译，不走 Emscripten 这种会引入额外抽象层的路径；任何组件出故障时优先降级为返回空帧,而不是打断整个会话；每个组件只被授予它完成任务所必需的最小资源访问权限。这套约束和 Web Platform Tests 驱动开发的组合,是 Cloudflare 团队能在 12 周内把一个从零开始的浏览器引擎跑到 21.5 万条 WPT 通过、且每周还在新增数百条的关键原因——用标准化测试集当验收标准，比反复对照真实网站的渲染效果更可控。

## 三、性能实测数据与三种接入方式

**性能对比**（Cloudflare 官方基准测试，Kitesurf vs. Chromium）：

| 指标 | Kitesurf | Chromium | 相对表现 |
|---|---|---|---|
| CPU 耗时（截图任务） | 380ms | 1,173ms | 快 3.1 倍 |
| CPU 耗时（HTML 提取） | 229ms | 877ms | 快 3.8 倍 |
| 内存占用（截图任务） | 57.8 MiB | 271.0 MiB | 少 4.7 倍 |
| 内存占用（HTML 提取） | 39.4 MiB | 273.7 MiB | 少 7.0 倍 |
| 端到端墙钟时间（截图） | 1,148ms | 637ms | 慢 1.8 倍 |

这组数字揭示了 Kitesurf 目前的真实定位：CPU 和内存效率碾压 Chromium，但在有热实例池的 Chromium 面前，端到端墙钟延迟反而慢了将近一倍。换句话说，Kitesurf 现阶段换来的是更低的资源成本和更好的水平扩展性,而不是更快的单次响应——这对需要大批量并发抓取、对单次延迟不敏感的 agent 场景（比如批量截图、批量内容提取）价值更大，对需要毫秒级响应的交互式代理任务则还有优化空间。官方也在博客里坦承了当前的能力边界：视频播放、WebGL 渲染、需要 TLS 指纹识别的反机器人挑战握手，以及长时间持久化的浏览会话，都不是 Kitesurf 现阶段的强项，团队把它明确定位为一次性截图/PDF 生成、结构化内容提取这类"短平快"任务的最优解。

**接入方式一：MCP / CDP 端点**（兼容 Claude Code、Chrome DevTools MCP 等客户端）

```json
{
  "mcp": {
    "kitesurf": {
      "command": [
        "npx", "-y", "chrome-devtools-mcp@latest",
        "--wsEndpoint=wss://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/browser-run/devtools/browser?browser=kitesurf",
        "--wsHeaders={\"Authorization\":\"Bearer <API_TOKEN>\"}"
      ]
    }
  }
}
```

**接入方式二：Quick Actions API**（一次性操作，比如截图）

```bash
curl -X POST 'https://api.cloudflare.com/client/v4/accounts/<accountId>/browser-run/screenshot?browser=kitesurf' \
  -H 'Authorization: Bearer <apiToken>' \
  -d '{"url": "https://example.com"}' \
  --output "screenshot.png"
```

**接入方式三：公开 Playground**（`kitesurf.cloudflare.app`），内置 Chrome DevTools 面板，可以直接在浏览器里检查 DOM 结构、内存占用曲线和网络请求活动，适合在真正接入 agent 代码前先手动验证目标网站是否被 Kitesurf 良好支持。

由于 CDP 端点是标准协议，Playwright、Puppeteer 用户理论上只需要把 `wsEndpoint` 指向 Kitesurf 的地址即可迁移，不需要重写抓取脚本本身的业务逻辑。

## 四、总结与展望

Kitesurf 目前处于免费 Beta 阶段，通过 Cloudflare 的 Browser Run 产品线开放访问，官方路线图里明确写了下一步：扩大 CDP 协议的覆盖范围、针对 LLM 图像识别场景专项提升渲染保真度、继续扩大 WPT 通过率、持续压低 CPU/内存/延迟基准，以及——计划把 Kitesurf 开源，允许开发者自部署。

放在更大的行业背景下看，Kitesurf 是"AI 代理专用基础设施"这条赛道上一个相当激进的样本：过去一年，围绕 agent 的工具链大多还停留在"给现有软件包一层 API"的阶段（比如给 Chromium 套一层无头浏览器服务），而 Kitesurf 选择了从渲染引擎这个最底层的组件开始重新设计,赌的是"代理任务的负载模式和人类浏览行为足够不同，值得为此单独造一套技术栈"。3～8 倍的 CPU/内存效率提升说明这个赌注在资源层面是成立的；1.8 倍的墙钟延迟劣势则说明这条路目前还没有免费的午餐——短期内它更适合对成本和并发敏感、对单次延迟不敏感的批量任务，而不是需要即时响应的交互式代理。对正在构建浏览器类 agent 工具的开发者来说,现在是一个值得实测的时间点：免费 Beta、标准 CDP 协议兼容意味着迁移成本很低，而"计划开源"的路线图,也给不想被单一云厂商锁定的团队留了一条后路。

## 参考来源

- [Cloudflare Blog：Introducing Kitesurf: The agent-first browser that runs in V8 isolates on Cloudflare Workers](https://blog.cloudflare.com/kitesurf/)
- [TechCrunch：Cloudflare launches Kitesurf, a browser built for AI agents](https://techcrunch.com/2026/08/07/cloudflare-launches-kitesurf-a-browser-built-for-ai-agents/)
- [MarkTechPost：Cloudflare Introduces Kitesurf: An Agent-First Web Browser That Runs Entirely in V8 Isolates on Cloudflare Workers](https://www.marktechpost.com/2026/08/06/cloudflare-introduces-kitesurf-an-agent-first-web-browser-that-runs-entirely-in-v8-isolates-on-cloudflare-workers/)
- [Kitesurf Playground](https://kitesurf.cloudflare.app/)
- [Cloudflare Developers：Browser Run 文档](https://developers.cloudflare.com/browser-run/)
