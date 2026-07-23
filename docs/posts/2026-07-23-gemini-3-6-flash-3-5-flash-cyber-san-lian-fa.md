---
title: 'Gemini 三连发：3.6 Flash 降价提速，3.5 Flash Cyber 用 AI 找洞比 Opus 4.6 还多'
date: 2026-07-23
slug: 'gemini-3-6-flash-3-5-flash-cyber-san-lian-fa'
description: '2026 年 7 月 21 日，Google DeepMind 一口气发布三款 Gemini 模型：主力工作模型 Gemini 3.6 Flash（输出提价下调 17%、输出 token 用量减少 17%）、追求极致性价比的 3.5 Flash-Lite（350 token/秒），以及专注漏洞挖掘与修复的安全定制模型 3.5 Flash Cyber——在 Chrome V8 引擎基准测试中发现 55 个独立漏洞，超过基座 3.5 Flash（47 个）和 Anthropic Claude Opus 4.6（36 个）。本文结合 Google 官方博客、DeepMind 安全团队博客、The Hacker News、9to5Google 等信源，拆解三款模型的定价、跑分、CodeMender 安全代理架构，并给出开发者可直接复用的 Gemini API 调用示例与选型建议。'
author: 范伟彬
tags:
  - Gemini 3.6 Flash
  - Gemini 3.5 Flash-Lite
  - Gemini 3.5 Flash Cyber
  - Google DeepMind
  - CodeMender
  - AI 安全
  - 大模型
  - AI 编程
categories:
  - AI
  - 大模型
---

# Gemini 三连发：3.6 Flash 降价提速，3.5 Flash Cyber 用 AI 找洞比 Opus 4.6 还多

2026 年 7 月 21 日，Google DeepMind 在一篇博客里同时宣布了三款新模型：**Gemini 3.6 Flash**、**Gemini 3.5 Flash-Lite**，以及一款此前从未公开预告过的**Gemini 3.5 Flash Cyber**。前两个是面向所有开发者的通用工作模型，走的是"更快、更便宜、跑分更高"的常规升级路线；第三个则完全不同——它是一款专门为漏洞挖掘和自动修复训练的安全定制模型，目前只通过 Google 内部的 CodeMender 代理向政府机构和受信合作伙伴开放试点。

这次发布正处在一个热闹的时间点上：Moonshot AI 的 2.8 万亿参数 Kimi K3（本站 7 月 18 日已拆解）、阿里巴巴的 2.4 万亿参数 Qwen3.8（7 月 20 日拆解）、xAI 因数据泄露事件而开源的 Grok Build（7 月 21 日拆解）都发生在过去一周内。当中国厂商在参数规模上"隔天刷一次纪录"的时候，Google 给出的答案是另一条路线：不比谁的参数多，而是把 Flash 系列做得更便宜、更快、单位 token 产出更高效，同时用一款专项安全模型证明"小而专"的微调模型在特定任务上可以打赢参数更大的通用旗舰模型。这篇文章会把三款模型的技术细节、CodeMender 的安全代理架构，以及开发者今天就能上手的接入方式讲清楚。

> 数据来源：Google 官方博客《Introducing Gemini 3.6 Flash, 3.5 Flash-Lite, and 3.5 Flash Cyber》、Google DeepMind 博客《Introducing Gemini 3.5 Flash Cyber》、The Hacker News《Google Launches Gemini 3.5 Flash Cyber AI to Find and Fix Software Vulnerabilities》、9to5Google《Google launches Gemini 3.6 Flash and 3.5 Flash-Lite, teases Gemini 4》、GCN《Google launches Gemini 3.6 Flash and a cybersecurity model with 17% fewer output tokens》、Help Net Security《Google's Gemini 3.5 Flash Cyber becomes a vulnerability hunter》、Google AI for Developers 官方文档等公开报道整理，文中标注的具体跑分数字均来自上述信源引用的 Artificial Analysis Index 及 Google 自有评测，读者在做技术选型前建议自行复核最新数据。

## 一分钟速览

- **发布时间**：2026 年 7 月 21 日，同一篇博客里一次性公布三款模型。
- **Gemini 3.6 Flash**：主力工作模型，输出定价从 $9.00/百万 token 降到 **$7.50/百万 token**（输入价维持 $1.50/百万 token 不变），完成同等任务的输出 token 用量比 3.5 Flash 减少 **17%**，编码、多模态、Agentic 能力全面上升。
- **Gemini 3.5 Flash-Lite**：系列里最快、最便宜的模型，输入 $0.3/百万 token、输出 $2.5/百万 token，推理速度达 **350 output tokens/秒**，Terminal-Bench 2.1 从上一代的 31% 跃升到 **54%**。
- **Gemini 3.5 Flash Cyber**：专门为安全场景微调的模型，仅通过 CodeMender 代理向政府和受信合作伙伴限量开放，在 Chrome V8 引擎测试中发现 **55 个独立确认漏洞**，超过基座 3.5 Flash（47 个）和 **Anthropic Claude Opus 4.6（36 个）**。
- **技术路线**：与"堆参数"不同，Google 这次的核心叙事是**单位 token 效率**——3.6 Flash 用更少的输出 token 完成同等甚至更好的任务，Flash-Lite 用极低的价格做到可用的编码能力，Flash Cyber 则证明"针对垂直场景做深度微调"可以在特定任务上超过参数量远大于自己的通用旗舰模型。
- **可用渠道**：Gemini API、Google AI Studio、Android Studio、Gemini Enterprise、Gemini App、Google 搜索均已接入 3.6 Flash 与 3.5 Flash-Lite；Flash Cyber 暂不对普通开发者开放。
- **后续预告**：Gemini 3.5 Pro 处于测试阶段、即将全面推出；Gemini 4 的预训练已经启动，是 Google 迄今为止规模最大的一次预训练。

## 技术细节解析

### Gemini 3.6 Flash：更少的 token，更高的分数

3.6 Flash 是这次发布里承担"日常主力"角色的模型，Google 给出的核心卖点是**效率**而不是单纯的跑分提升。根据 Artificial Analysis Index 的统计，完成同一批任务时，3.6 Flash 消耗的输出 token 比 3.5 Flash 减少了 17%——这直接反映在账单上：即便单价（$7.50/百万输出 token，此前为 $9.00）已经比上一代便宜了约 17%，叠加 token 用量的下降，实际的任务总成本降幅会更明显。

跑分方面，几个关键基准都有明显提升：

| 基准测试 | 3.5 Flash | 3.6 Flash |
|---|---|---|
| DeepSWE（软件工程能力） | 37% | 49% |
| MLE Bench（机器学习研究能力） | 49.7% | 63.9% |
| OSWorld-Verified（计算机操作能力） | 78.4% | 83.0% |

这三项基准分别对应"写代码修 bug"、"做 ML 实验调参"、"操作真实电脑桌面完成任务"三类典型的 Agentic 场景，说明 3.6 Flash 的提升方向明确指向"能独立跑更长的 Agent 任务链而不掉链子"，而不是单纯的知识型问答能力。

### Gemini 3.5 Flash-Lite：把速度和价格做到极致

Flash-Lite 走的是完全不同的定位——不追求跑分天花板,而是把"够用的能力"和"极致的成本效率"结合到一起。它的推理速度达到 350 output tokens/秒，是这一代 Flash 系列里最快的模型；价格低至输入 $0.3/百万 token、输出 $2.5/百万 token，这个价位已经进入"可以在几乎不计成本的场景下大规模调用"的区间，比如高并发的实时聊天助手、批量文本分类、简单的 Agent 子任务路由等。

跑分上的提升同样显著：Terminal-Bench 2.1（终端操作/编码任务）从 31% 提升到 54%，接近翻倍；长上下文理解基准 GDM-MRCR v2 从 60.1% 提升到 72.2%。这意味着 Flash-Lite 已经不再是"能力阉割版"的凑数模型，而是在轻量任务上具备实用性的选项——很多此前必须用中端模型才能完成的任务，现在有机会下沉到 Flash-Lite 上跑，进一步压低整体推理成本。

### Gemini 3.5 Flash Cyber：专为找漏洞而生的定制模型

三款模型里最值得深入拆解的是 3.5 Flash Cyber，因为它代表了一条和"通用大模型越来越强"完全不同的路线——**用领域数据把一个基座模型深度微调成某个垂直任务的专家**，并且在这个垂直任务上跑赢参数量大得多的通用旗舰模型。

**训练数据**：Google DeepMind 安全实验室（由 Gemini 安全负责人 Raluca Ada Popa 主导）用自家积累多年的安全数据对 3.5 Flash 基座模型做了微调，核心数据来源包括 **OSV.dev 开源漏洞数据库**（收录超过 70 万条已知开源软件漏洞）和**十年以上的 OSS-Fuzz 模糊测试结果**。这批数据让模型学到的不是"漏洞长什么样"的抽象知识，而是"真实安全研究员在挖掘和验证漏洞时的实际工作方式"。

**在 CodeMender 里的架构设计**：与很多"一次调用给出结果"的模型使用模式不同，CodeMender 代理会对 3.5 Flash Cyber 发起**最多五次连续调用**，让代理有机会逐步深入分析更多代码路径，交叉验证候选漏洞的真实性,而不是止步于第一轮的粗筛结果。由于 Flash Cyber 本身推理成本低、速度快，这种多轮调用的模式在成本上依然可控，这也是它能够被集成进**频繁扫描、每次提交都跑一遍**的 CI/CD 安全流水线的关键原因——用一个参数量更大、单次调用更贵的模型做同样的事情，在真实工程场景里未必划算。

**评测结果**：Google 的 Big Sleep 团队独立搭建了一套针对 Chrome、Safari 这类复杂、安全攸关代码库的评测体系。在 Chrome 生产代码的 V8 JavaScript 引擎扫描测试中：

| 模型 | 发现的独立确认漏洞数 |
|---|---|
| Gemini 3.5 Flash Cyber | **55** |
| Gemini 3.5 Flash（基座模型） | 47 |
| Anthropic Claude Opus 4.6 | 36 |

一个基于 Flash（而非 Pro/Ultra 级别）微调出来的模型，在专项任务上反超了包括 Opus 4.6 在内的通用旗舰模型，这个结果本身比"又发布了一个跑分更高的模型"更值得开发者关注——它说明了在安全这类高度专业化的场景里，**领域数据 + 精准微调**可能比单纯堆参数更有效率。此外，Google 云漏洞研究团队在实战中用该模型在两小时内发现了一个公共 API 的远程代码执行（RCE）漏洞和一个生产服务里的内存损坏漏洞，生成的漏洞利用代码可靠性达到 100%。

**可用性限制**：正因为"找漏洞"和"造漏洞"在技术上几乎是同一种能力的两个方向（典型的双重用途，dual-use），Google 明确表示 3.5 Flash Cyber **不会大范围开放**，目前仅通过"有限访问试点计划"提供给政府机构和受信任合作伙伴，普通开发者暂时无法直接调用。Google 表示未来会通过企业级代理平台，让更广泛的用户间接用上基于通用 Gemini 模型的 CodeMender 能力,但专门微调的 Cyber 版本短期内不会开放 API。

## 代码示例与实践指南

对普通开发者来说，3.6 Flash 和 3.5 Flash-Lite 已经可以直接通过 Gemini API 调用，模型 ID 分别是 `gemini-3.6-flash` 和 `gemini-3.5-flash-lite`，两者都支持 **1M token 上下文窗口**、**64K 最大输出 token**，以及包括 Computer Use 在内的完整内置工具集。

### 用 Python SDK 快速接入

```python
from google import genai

client = genai.Client(api_key="YOUR_API_KEY")

# 日常主力任务：代码审查、复杂 Agent 任务链，用 3.6 Flash
response = client.models.generate_content(
    model="gemini-3.6-flash",
    contents="帮我审查这段 Python 代码里是否存在 SQL 注入风险，并给出修复建议：\n"
             "query = f\"SELECT * FROM users WHERE id = {user_id}\"",
)
print(response.text)

# 高并发、低成本的轻量任务，用 3.5 Flash-Lite
response_lite = client.models.generate_content(
    model="gemini-3.5-flash-lite",
    contents="将下面这条用户反馈分类为 bug / 功能请求 / 咨询三类之一：\n"
             "「登录后页面白屏，控制台报错 undefined is not a function」",
)
print(response_lite.text)
```

### 用 curl 直接调用（适合脚本化场景）

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{"text": "用一句话解释什么是 CI/CD 流水线中的安全左移（shift-left security）"}]
    }]
  }'
```

### 选型建议

结合三款模型的定位，给开发者的实际选型思路可以简化成一张表：

| 场景 | 推荐模型 | 理由 |
|---|---|---|
| 复杂 Agent 任务链、代码生成与重构、多模态理解 | `gemini-3.6-flash` | 更少 token 完成同等任务，综合成本更低，Agentic 能力强 |
| 高并发批量任务、实时聊天、简单分类/路由 | `gemini-3.5-flash-lite` | 350 tokens/秒 的速度 + 极低单价，适合大规模调用 |
| CI/CD 安全扫描、漏洞挖掘（如已获准接入 CodeMender） | `gemini-3.5-flash-cyber` | 专项微调，成本远低于用旗舰模型跑同等安全扫描任务 |
| 需要最强综合推理能力的复杂任务 | 等待 `gemini-3.5-pro` 全量开放 | 目前仍在测试阶段 |

一个值得注意的实践细节是：如果你的团队正在评估要不要把 AI 安全扫描接入日常 CI 流水线，3.5 Flash Cyber 展示的"多轮调用 + 低成本模型"架构思路，即便暂时用不上 Cyber 本身，也可以用通用的 3.6 Flash 或 3.5 Flash-Lite 搭配类似的多轮验证 Prompt 策略去实现——用便宜的模型多跑几轮交叉验证，往往比用一个贵模型跑一轮更划算，这也是这次发布传递出的一个通用工程思路。

## 总结与展望

这次 Gemini 三连发，表面上是一次常规的模型迭代，但放在过去一周 Kimi K3、Qwen3.8、Grok Build 密集发布的背景下看，它释放的信号其实更清晰：当"参数规模"这条竞赛路径边际收益递减时，**单位 token 效率**和**垂直领域深度微调**正在成为新的竞争焦点。3.6 Flash 用更少的 token 完成更好的结果，Flash-Lite 把成本压到几乎可以忽略不计的区间，而 Flash Cyber 用一个基于 Flash（而非旗舰级）微调的小模型,在漏洞挖掘这个高度专业化的任务上反超了 Opus 4.6——这三个方向共同指向的是同一个判断：未来模型竞争不会只比"谁更大更强",而会越来越比"谁能用最低的成本,在具体场景里做到最好"。

对开发者而言，短期可以直接落地的收获是：3.6 Flash 和 Flash-Lite 已经开放，值得评估能否用它们替换掉现有工作流里成本更高的模型；中期值得关注的是 Google 后续是否会把 CodeMender / Flash Cyber 这类专项安全能力逐步下放给更广泛的开发者群体；而 Gemini 3.5 Pro 的全量发布和 Gemini 4 的预训练进展，则是接下来几个月值得持续跟踪的两条主线。

## 参考链接

- Google 官方博客《Introducing Gemini 3.6 Flash, 3.5 Flash-Lite, and 3.5 Flash Cyber》：[blog.google](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-6-flash-3-5-flash-lite-3-5-flash-cyber/)
- Google DeepMind 博客《Introducing Gemini 3.5 Flash Cyber》：[deepmind.google](https://deepmind.google/blog/introducing-gemini-3-5-flash-cyber/)
- The Hacker News《Google Launches Gemini 3.5 Flash Cyber AI to Find and Fix Software Vulnerabilities》：[thehackernews.com](https://thehackernews.com/2026/07/google-launches-gemini-35-flash-cyber.html)
- 9to5Google《Google launches Gemini 3.6 Flash and 3.5 Flash-Lite, teases Gemini 4》：[9to5google.com](https://9to5google.com/2026/07/21/gemini-3-6-flash-launch/)
- GCN《Google launches Gemini 3.6 Flash and a cybersecurity model with 17% fewer output tokens》：[gcn.com](https://gcn.com/google-launches-gemini-flash-cybersecurity-model/19924/)
- Help Net Security《Google's Gemini 3.5 Flash Cyber becomes a vulnerability hunter》：[helpnetsecurity.com](https://www.helpnetsecurity.com/2026/07/22/google-gemini-3-5-flash-cyber-model/)
- Android Authority《Google expands Gemini 3.5 line with trio of new models — and shares an update on Gemini 3.5 Pro》：[androidauthority.com](https://www.androidauthority.com/google-launches-gemini-36-flash-3689795/)
- Google AI for Developers 官方文档《Using the latest Gemini models》：[ai.google.dev](https://ai.google.dev/gemini-api/docs/latest-model)
