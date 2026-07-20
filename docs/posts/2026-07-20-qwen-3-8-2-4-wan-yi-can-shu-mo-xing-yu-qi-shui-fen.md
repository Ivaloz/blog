---
title: 'Qwen3.8 深度解读：2.4 万亿参数、"第二只服 Fable 5"，但一个基准分都没给'
date: 2026-07-20
slug: 'qwen-3-8-2-4-wan-yi-can-shu-mo-xing-yu-qi-shui-fen'
description: '2026 年 7 月 19 日，阿里巴巴通义千问团队在 X 上宣布 Qwen3.8 正式上线、即将开源权重——2.4 万亿参数，自称"当今最强模型之一，仅次于 Fable 5"。这个说法紧跟在 Kimi K3（2.8 万亿参数）发布三天后抛出，却没有附带任何基准测试数据，甚至连关键的"每 token 激活参数量"都未披露。本文结合 MLQ News、The Decoder、OfficeChai、BuildFastWithAI 等外媒报道及阿里云 Qwen API 文档，拆解 Qwen3.8 目前已知和未知的一切、它与 Kimi K3／Qwen3.7-Max 的对比，以及开发者今天就能通过 Token Plan 接入 Qwen3.8-Max-Preview 的实践方法。'
author: 范伟彬
tags:
  - Qwen3.8
  - 通义千问
  - 阿里巴巴
  - 开源模型
  - Kimi K3
  - MoE
  - 大模型
  - AI 编程
categories:
  - AI
  - 大模型
---

# Qwen3.8 深度解读：2.4 万亿参数、"第二只服 Fable 5"，但一个基准分都没给

2026 年 7 月 19 日，阿里巴巴通义千问（Qwen）官方账号在 X 上发了一条不到 100 字的推文："Qwen3.8 is launching and going open-weight soon! 拥有 2.4T 参数，这个模型正在持续进化（continuously evolving）。我们相信它是当今最强大的模型之一，可与领先的前沿 AI 模型媲美，仅次于 Fable 5。你不用等——现在就能用。"

没有技术报告，没有跑分榜单，没有架构说明，只有一句自信到近乎挑衅的定位宣言：**"仅次于 Fable 5"**。这条推文发出的时间点也很微妙——距离 Moonshot AI 发布 2.8 万亿参数的 Kimi K3（本站 7 月 18 日已详细拆解）刚好三天，距离 Thinking Machines 发布 Inkling 刚好四天。中国开源大模型阵营在过去两周里,几乎是以"隔天一个新纪录"的节奏在刷参数量上限，而这一次,阿里巴巴给出的信息量反而是几次发布里最少的一次。

这篇文章结合 **MLQ News、The Decoder、OfficeChai、BuildFastWithAI、Startup Fortune** 等外媒报道，以及阿里云官方 Token Plan 说明，把 Qwen3.8 目前**已确认的、被声称但未验证的、以及彻底缺失**的信息分开讲清楚，并给出开发者今天就能上手试用的接入方式。

> 数据来源：阿里巴巴通义千问官方 X 账号（@Alibaba_Qwen）发布推文、MLQ News《Alibaba Launches Qwen 3.8 With 2.4 Trillion Parameters, Claims Near-Frontier Performance》、The Decoder《Alibaba's Qwen takes on Kimi K3 with open-weight Qwen 3.8, says model is "second only to Fable 5"》、OfficeChai《Alibaba Announces 2.4 Trillion-Parameter Open-Weight Qwen 3.8, Says It's Second Only To Fable 5》、BuildFastWithAI《Qwen3.8 Preview: 2.4T Params, Open Weights, Release》、Startup Fortune《Qwen3.8 Teases a 2.4 Trillion Parameter Open Model as Alibaba Chases Kimi K3》。截至发稿，阿里巴巴尚未发布正式技术报告或基准测试数据，本文会明确标注每一条信息是"官方确认"还是"厂商声称、未经第三方验证"。

## 一分钟速览

- **是什么**：阿里巴巴通义千问团队发布的新一代旗舰模型 **Qwen3.8**，7 月 19 日以 **Qwen3.8-Max-Preview** 的形式上线 Qwen Studio 和阿里云，官方宣布**即将开源权重**（未给具体日期）。
- **规模**：号称 **2.4 万亿参数**，是继 Kimi K3（2.8 万亿）之后，**公开已知的第二大模型**；相比上一代 Qwen3.7-Max 是明显跃升。
- **架构**：延续通义千问系列的**稀疏 MoE（Mixture-of-Experts）**设计，但**每 token 实际激活的参数量——这个决定真实推理成本的关键数字——官方完全没有披露**。
- **性能声称**：官方原话"仅次于 Fable 5（Anthropic 旗舰模型）"，但**截至发稿没有任何基准测试数据支撑这句话**，无论是官方跑分表还是第三方评测都没有。
- **定价与接入**：通过阿里云 **Token Plan**、**Qoder**、**QoderWork** 即可接入，Preview 阶段价格为**标准定价的 10%**；Token Plan 个人版分 Lite（$6/月）、Standard（$18/月）、Pro（$68/月）三档，按周发放 Credits。
- **协议兼容**：同时支持 **OpenAI 兼容协议**和 **Anthropic 兼容协议**，意味着 Claude Code、Cursor、Cline、OpenCode 等现有 AI 编程工具**无需改造工作流**即可直接切换模型来源。
- **竞争位置**：紧跟在 Kimi K3 发布后三天推出，被外媒普遍解读为阿里巴巴对 Moonshot AI 近期声势（Kimi 月度经常性收入已达 3 亿美元，计划 6 个月内 IPO）的正面回应。

## 为什么这次发布值得单独写一篇——尤其是它"没说什么"

过去两周本站已经连续写过 Inkling 和 Kimi K3 两篇"新模型跑分又破纪录"的文章。按理说 Qwen3.8 也该是同一个套路的第三篇。但这次值得单独拎出来讲的理由，恰恰不是它有多强，而是**这次发布在信息披露上的克制（甚至可以说是刻意留白），本身就是一个值得开发者警惕的信号**。

对比着看会更清楚：

| 维度 | Kimi K3（7 月 16 日） | Qwen3.8（7 月 19 日） |
|---|---|---|
| 总参数 | 2.8 万亿（官方确认） | 2.4 万亿（官方声称） |
| 每 token 激活参数 | 16/896 专家，明确披露 | **未披露** |
| 第三方跑分 | Artificial Analysis Elo 1547、Arena.ai Frontend Code Arena 有具体数字 | **完全没有** |
| 架构创新说明 | Kimi Delta Attention、Attention Residuals 均有详细技术描述 | 无 |
| 开源权重时间 | 明确承诺 7 月 27 日 | "soon"，无具体日期 |
| License | Modified MIT | 未提及 |

Kimi K3 发布时至少给了跑分、给了明确的开源时间表、给了架构创新的技术描述，哪怕结论上"仅在单项基准上击败 Fable 5、综合能力仍落后"，信息也是可以被验证和讨论的。而 Qwen3.8 目前提供的只有两个数字（2.4T 参数、10% 折扣价）和一句营销语言（"仅次于 Fable 5"）。这不代表 Qwen3.8 不强——阿里通义千问系列此前的 Qwen3.7-Max 本身就是一个扎实的模型（GPQA Diamond 92.4、SWE-bench Verified 80.4%、Terminal-Bench 2.0-Terminus 69.7%，支持百万 token 上下文和原生扩展思考模式），Qwen 团队没有理由无缘无故拿一个弱模型出来吹牛。但对开发者而言，**"厂商说的" 和 "厂商证明的" 是两件完全不同的事**，尤其是在决定要不要把生产流量切过去之前，这个区别值得多花五分钟想清楚。

## 技术细节解析：确认的、声称的、缺失的

### 已确认

- **发布形式**：Qwen3.8-Max-Preview，7 月 19 日起可通过 Qwen Studio、阿里云 Token Plan、Qoder、QoderWork 访问。
- **参数规模量级**：厂商自报 2.4 万亿参数，是 Qwen 系列迄今为止最大的模型。
- **架构类型**：延续稀疏 MoE 路线（与 Qwen3.7-Max、Qwen3.6-Max-Preview 一脉相承），不是从零设计的新架构家族。
- **多模态能力**：这是通义千问系列**第一个参数超过 1 万亿的多模态模型**，可以处理图像、视频与文档输入。
- **API 协议**：同时兼容 OpenAI 和 Anthropic 两套主流 API 协议格式。

### 厂商声称、未经验证

- **"仅次于 Fable 5"**：这是目前所有报道反复引用、但没有任何一家外媒能拿到支撑数据的核心卖点。作为参照，Fable 5 在 SWE-bench Verified 上的成绩约为 95%，比 Qwen3.7-Max 的 80.4% 高出接近 15 个百分点——如果 Qwen3.8 真的要缩小到"仅次于"的差距，这将是一次相当剧烈的能力跃升，需要拿出具体证据。
- **"应该在编程、全栈开发、数据分析、办公场景全面超越上一代"**：Qwen 团队表态的原话是"预期（expects）会超越"，本身就是前瞻性表述而非已验证结论。

### 彻底缺失

- **每 token 激活参数量**：MoE 模型的真实推理成本、延迟、部署门槛，主要由这个数字决定，而不是总参数量。Kimi K3 明确披露是 896 选 16，Qwen3.8 目前一个数字都没给，这意味着开发者现在完全无法估算它的真实服务成本和硬件需求。
- **上下文窗口长度**：上一代 Qwen3.7-Max 是 100 万 token，Qwen3.8 是否延续或扩展未知。
- **具体 API 定价**：目前只知道 Preview 阶段是"标准定价的 10%"，但标准定价本身尚未公布，也没有类似 Kimi K3"输入 $3／输出 $15"这样的具体数字。
- **开源协议与时间表**：只说"soon"，考虑到阿里巴巴此前的 Max 系列模型历史上**从未开源过**（这次如果真的兑现，将是对既有产品策略的一次实质性调整），这个承诺本身能不能落地，需要观察。
- **训练数据、安全测试、红队评估结果**：一概未提及。

## Qwen3.8 vs. Kimi K3 vs. Qwen3.7-Max：横向对比

| 指标 | Qwen3.7-Max（上一代） | Kimi K3 | Qwen3.8-Max-Preview |
|---|---|---|---|
| 总参数 | 未完全公开（低于 2.4T） | 2.8 万亿 | 2.4 万亿（自报） |
| 每 token 激活参数 | 未披露 | 16/896 专家 | **未披露** |
| GPQA Diamond | 92.4 | — | 未公布 |
| SWE-bench Verified | 80.4% | — | 未公布 |
| Terminal-Bench 2.0 | 69.7% | — | 未公布 |
| 上下文窗口 | 100 万 token | 100 万 token | 未公布 |
| 输入/输出定价（每百万 token） | $1.25 / $3.75 | $3 / $15 | 未公布（Preview 为标准价 10%） |
| 开源权重 | 否 | 承诺 7 月 27 日，Modified MIT | 承诺"soon"，协议未定 |

这张表格里大片的"未公布"，本身就是这篇文章想传达的核心信息：**在评估一个新模型是否值得接入生产环境之前，先看它愿意公开多少可验证的数据，这本身就是一种信号**。

## 给开发者的实践指南

尽管信息不完整，Qwen3.8-Max-Preview 目前已经可以通过 API 直接调用，而且价格是"标准价的 10%"——这对愿意自己动手做评估的开发者来说，反而是一个成本很低的试错窗口。以下是接入与评估的实践步骤。

### 1. 通过 Token Plan 开通访问

阿里云 Token Plan 个人版目前（2026 年 7 月）提供三档订阅：

| 档位 | 价格 | 每周 Credits | 适用场景 |
|---|---|---|---|
| Lite | $6/月 | 2,500 | 个人轻量试用 |
| Standard | $18/月 | 10,000 | 日常开发 |
| Pro | $68/月 | 40,000（支持 6-8 个并发 Agent） | 团队/Agent 密集场景 |

Token Plan 订阅内还捆绑了 qwen3.7-max、GLM-5.2、DeepSeek V4 Pro、wan2.7-image-pro 等其他模型的访问权限，等于一次订阅拿到一个多模型对比评测的入口，这对做模型选型的团队比较划算。

### 2. 用 OpenAI 兼容协议接入（无需改造现有代码）

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["DASHSCOPE_API_KEY"],
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)

response = client.chat.completions.create(
    model="qwen3.8-max-preview",
    messages=[
        {"role": "system", "content": "你是一个乐于助人的编程助手。"},
        {"role": "user", "content": "用 Go 实现一个带过期时间的内存缓存"},
    ],
)

print(response.choices[0].message.content)
```

因为同时兼容 Anthropic 协议，如果你的工作流是基于 Claude Code、Cline 这类原生对接 Anthropic API 格式的工具，理论上只需要替换 base URL 和模型名即可切换，不需要重写 Agent 逻辑或工具调用代码——这也是这次发布里少数确定利好开发者的部分。

### 3. 不要直接相信"仅次于 Fable 5"，自己跑一遍评估

在没有官方基准数据的情况下，最务实的做法是拿自己团队真实的任务样本（哪怕只是 20~30 条有代表性的代码生成/调试/长文档问答任务）分别跑一遍 Qwen3.8-Max-Preview、Kimi K3、你现在生产环境在用的模型，人工或用 LLM-as-judge 方式打分对比。重点关注：

- **实际输出质量**是否真的接近厂商宣传的水位，而不是停留在"参数量最大"这个数字本身；
- **响应延迟和成本**——由于激活参数量未知，务实的做法是直接测量端到端延迟和实际账单，而不是猜测；
- **工具调用/Agent 场景下的稳定性**——参数量大不代表 Agent 编排能力强，Kimi K3 报告里就提到过"简单任务消耗异常多 token"的问题，Qwen3.8 是否有类似情况需要自己验证。

### 4. 关注"是否真的开源"这件事本身

阿里巴巴的 Max 系列历史上从未开源过权重，这次如果 Qwen3.8 真的兑现开源承诺，会是一个比"跑分领先零点几个百分点"更值得关注的产业信号——意味着国内又一家头部实验室把最强旗舰模型的权重公开化。但在具体日期和 License 条款公布之前，这仍然只是一个"意向声明"，建议把它当作待观察事项，而不是既定计划纳入任何有时间压力的技术选型决策。

## 总结与展望

把 7 月中旬这几周的开源模型发布放在一起看，会看到一个越来越清晰的节奏：Thinking Machines 用 Inkling（975B）打"专精、可定制"这张牌，Moonshot AI 用 Kimi K3（2.8T）打"参数规模 + 详实跑分 + 明确开源时间表"这张牌，而阿里巴巴这次用 Qwen3.8（2.4T）打的，更像是一张**"先占位、后补数据"**的牌——在真正的技术报告和第三方评测出炉之前，先用一条推文和一个足够炸裂的参数数字，把自己摆进"仅次于 Fable 5"的叙事里。

这不是说 Qwen3.8 一定不行——通义千问团队过去几代模型的工程水准是有目共睹的，Qwen3.7-Max 本身就是一个跑分扎实的模型。但作为一篇技术博客，比起单纯转述厂商的营销措辞，更值得强调的是：**面对密集刷屏的"跑分又破纪录"新闻，开发者应该养成的习惯是分清"厂商确认的事实"和"厂商想让你相信的叙事"，尤其是在关键的成本和性能数字（每 token 激活参数、真实跑分、明确定价）还没有公开之前，不妨把决策窗口往后推一两周，等技术报告和独立评测跟上再做取舍**。考虑到阿里巴巴通常会在几周内跟进正式技术报告（参考 Qwen3.7-Max 发布节奏），预计 Qwen3.8 完整的基准数据和开源权重会在 8 月内陆续披露，届时值得再写一篇跟进文章做真正的横向对比。

## 参考链接

- 阿里巴巴通义千问官方 X 账号发布公告：[x.com/Alibaba_Qwen](https://x.com/Alibaba_Qwen/status/2078759124914098291)
- MLQ News《Alibaba Launches Qwen 3.8 With 2.4 Trillion Parameters, Claims Near-Frontier Performance》：[mlq.ai/news](https://mlq.ai/news/alibaba-launches-qwen-38-with-24-trillion-parameters-claims-near-frontier-performance/)
- The Decoder《Alibaba's Qwen takes on Kimi K3 with open-weight Qwen 3.8, says model is "second only to Fable 5"》：[the-decoder.com](https://the-decoder.com/alibabas-qwen-takes-on-kimi-k3-with-open-weight-qwen-3-8-says-model-is-second-only-to-fable-5/)
- OfficeChai《Alibaba Announces 2.4 Trillion-Parameter Open-Weight Qwen 3.8, Says It's Second Only To Fable 5》：[officechai.com](https://officechai.com/ai/alibaba-qwen-3-8/)
- BuildFastWithAI《Qwen3.8 Preview: 2.4T Params, Open Weights, Release》：[buildfastwithai.com](https://www.buildfastwithai.com/blogs/qwen3-8-preview-2-4t-params-open-weights-release)
- Startup Fortune《Qwen3.8 Teases a 2.4 Trillion Parameter Open Model as Alibaba Chases Kimi K3》：[startupfortune.com](https://startupfortune.com/qwen38-teases-a-24-trillion-parameter-open-model-as-alibaba-chases-kimi-k3/)
- ExplainX《Qwen 3.8 Max Preview — Token Plan Guide》：[explainx.ai](https://www.explainx.ai/blog/qwen-3-8-max-preview-open-weight-token-plan-july-2026)
- Techsy《Qwen3.8: 2.4T Parameters, Open Weights, No Benchmarks》：[techsy.io](https://techsy.io/en/blog/qwen-3-8)
