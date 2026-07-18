---
title: 'Kimi K3 深度解读：2.8 万亿参数开源模型如何搅动华尔街与硅谷'
date: 2026-07-18
slug: 'kimi-k3-2-8-wan-yi-can-shu-kai-yuan-mo-xing'
description: '2026 年 7 月 16 日，月之暗面（Moonshot AI）发布 Kimi K3——全球首个 3 万亿参数级的开源权重大模型，2.8 万亿总参数、896 选 16 的 MoE 架构，搭配自研的 Kimi Delta Attention 混合线性注意力与 Attention Residuals 残差改进，在 Artificial Analysis 综合榜单上仅次于 Claude Fable 5。发布当天即引发台股、日股、纳斯达克集体下挫，英伟达短暂让出全球市值最高公司位置，被外媒称为"新一轮 DeepSeek 时刻"。本文结合 VentureBeat、MarkTechPost、Axios、Fortune、Tom''s Hardware 等外媒报道及 Moonshot 官方 API 文档，拆解 K3 的架构创新、跑分表现、定价与 API 用法，并给出开发者接入建议。'
author: 范伟彬
tags:
  - Kimi K3
  - Moonshot AI
  - 月之暗面
  - 开源模型
  - MoE
  - 大模型
  - AI 编程
  - 混合线性注意力
categories:
  - AI
  - 大模型
---

# Kimi K3 深度解读：2.8 万亿参数开源模型如何搅动华尔街与硅谷

2026 年 7 月 16 日，中国 AI 公司月之暗面（Moonshot AI）没有开发布会、没有放技术报告，只是悄悄在 Kimi App、官网 Playground 和 API 上同步上线了一个新模型——**Kimi K3**。没有仪式感的发布方式，却在 48 小时内引爆了全球资本市场：7 月 17 日，台湾加权指数一度重挫超 6%，日经指数收跌 4%，纳斯达克当周表现最差的一个交易日下跌 1.5%，英伟达股价应声下滑，一度让出全球市值最高公司的位置给苹果。多家外媒不约而同地把这次事件类比成 2025 年初的"DeepSeek 时刻"——一个发布参数量、跑分、定价全方位对标美国头部实验室的中国开源模型，再一次让市场重新怀疑"AI 竞赛是否真的需要无止境的算力堆砌"这个前提。

这篇文章结合 **VentureBeat、MarkTechPost、Axios、Fortune、Tom's Hardware、Yahoo Finance、Benzinga** 等外媒报道，以及 **Moonshot 官方 Kimi API 文档**，把 Kimi K3 到底是什么、架构强在哪、跑分如何、多少钱、怎么接入，一次讲清楚。

> 数据来源：VentureBeat《China's Moonshot AI releases Kimi K3, the largest open-source model ever, rivaling top U.S. systems》、MarkTechPost《Moonshot AI Releases Kimi K3: A 2.8 Trillion Parameter Open MoE Model With Kimi Delta Attention and 1M Context》、Axios《China's open-weight Kimi model stuns AI world with frontier-level results》、Fortune《Markets experience new DeepSeek shock after MoonShot AI releases Kimi K3》、Tom's Hardware、Yahoo Finance、Benzinga、Moonshot 官方 Kimi API 文档（platform.kimi.ai）。部分跑分数字为 Moonshot 官方或第三方评测机构 Artificial Analysis 口径，建议结合实际业务场景综合判断。

## 一分钟速览

- **是什么**：月之暗面（Moonshot AI）发布的旗舰大模型，**全球首个 3 万亿参数级的开源权重模型**，总参数 **2.8 万亿**，是上一代 K2.6 的约 2.8 倍。
- **架构**：稀疏 MoE，**896 个专家中激活 16 个**（Stable LatentMoE 框架），搭配两项自研架构创新——**Kimi Delta Attention（KDA）混合线性注意力**与 **Attention Residuals（AttnRes）残差改进**，整体缩放效率约为 K2 的 2.5 倍。
- **规格**：**100 万 token 上下文**，原生视觉理解，**"思考模式"常开**（K2.x 时代的 `thinking` 参数被取消，K3 只有一种推理强度 `max`）。
- **发布节奏**：7 月 16 日先上线 App / Playground / API，**完整开源权重预计 7 月 27 日**放出，License 沿用 K2 系列的 **Modified MIT**（允许商用）。
- **跑分**：Artificial Analysis 综合 Elo **1547**，相比 K2.6 跃升 **732 分**，仅次于 Claude Fable 5；在 Arena.ai 的 Frontend Code Arena 前端代码测评中**击败 Claude Fable 5**；官方口径下"大体上超过 Claude Opus 4.8 max 与 GPT-5.5 high，但落后于 Claude Fable 5 与 GPT-5.6 Sol"。
- **定价**：输入 $3/百万 token，输出 $15/百万 token，缓存命中输入 $0.30/百万 token，官方口径约为 Anthropic Opus 4.8 单任务成本的一半。
- **市场冲击**：发布次日引发台股、日股、纳斯达克集体下挫，英伟达短暂让出全球市值最高公司位置，被类比为"新一轮 DeepSeek 时刻"；风投人 David Sacks、对冲基金经理 Bill Ackman 均公开发声评论。
- **公司背景**：月之暗面获阿里巴巴投资（2024 年注资 10 亿美元，彼时估值 25 亿美元），本轮融资估值已升至约 **315 亿美元**。

## 为什么这次发布值得单独写一篇

过去两周 AI 圈的开源模型赛道已经相当拥挤——Thinking Machines 刚发布了自己的第一个开源模型 Inkling（975B 总参数、41B 激活），DeepSeek V4 Pro、GLM 5.2、Qwen 3.6 也都在近期陆续更新。但 Kimi K3 值得单独拎出来讲，理由不只是"参数量又创新高"：

1. **它是目前唯一真正跨入"3 万亿参数级"的开源权重模型**。此前最大的开源模型基本停留在 1~2 万亿参数区间（DeepSeek V4 Pro 约 1.6T，Inkling 975B，GLM 5.2 744B），K3 的 2.8T 直接把开源模型的参数天花板抬高了一个数量级台阶。
2. **它不是靠堆参数硬刚，而是带着两项实打实的架构创新**——Kimi Delta Attention 和 Attention Residuals——这意味着即便刨除"参数量最大"这个噱头，架构本身也有值得工程师细读的东西。
3. **它触发的市场反应远超模型本身的技术意义**。一个开源模型发布导致全球股市联动下跌、英伟达一度丢掉市值冠军，这种"资本市场立刻用脚投票"的场面，在过去一年只有 DeepSeek R1 发布时出现过一次。这说明市场对"中国开源模型持续逼近甚至反超美国闭源旗舰"这件事的敏感度，并没有随时间钝化，反而在积累。

## 技术细节解析

### 架构：2.8 万亿参数、896 选 16 的 MoE

Kimi K3 是一个**稀疏 Mixture-of-Experts 模型**，总参数 2.8 万亿，采用 **Stable LatentMoE 框架**，每层设置 896 个专家，每个 token 实际只激活 **16 个**——激活比例极低（约 1.8%），这是控制推理成本的核心手段。官方表示，结合训练方法与数据配方上的改进，K3 相比 K2 拿到了约 **2.5 倍的整体缩放效率**，即同样的计算投入换来了明显更强的能力提升。

### Kimi Delta Attention：3:1 混合线性注意力

这是 K3 架构里最值得细看的部分。**Kimi Delta Attention（KDA）** 是一种**混合线性注意力机制**，具体设计是把 KDA 线性注意力层与周期性插入的全注意力（full-attention）层按 **3:1 的比例**交替排列：三层线性注意力负责廉价地处理局部序列结构，一层全注意力负责保留全局信息流动。

这个设计带来的直接收益是**推理速度**：官方数据显示，在百万级 token 上下文场景下，KDA 能实现最高 **6.3 倍的解码加速**。对于需要长上下文（K3 支持 100 万 token）的应用场景——比如超长代码库分析、长文档问答——这个加速比直接决定了产品是否"可用"，而不只是"能用"。

这个思路和近期业界的一个共同趋势相呼应：纯 Transformer 全注意力在长上下文下的二次方复杂度成本越来越难以承受，各家实验室都在探索"线性注意力 + 少量全注意力兜底"的混合方案（Inkling 用相对位置编码 + 滑动窗口/全局注意力 5:1 交替，K3 用 KDA + 全注意力 3:1 交替），本质上都是在"全局信息保真度"和"计算效率"之间找一个新的平衡点。

### Attention Residuals：选择性跨层检索

**Attention Residuals（AttnRes）** 被官方描述为残差连接（residual connection）的"即插即用替代品"。传统残差连接是把每一层的输出均匀累加传递到下一层；AttnRes 则是**有选择性地跨深度检索**此前层的表示，而不是不加区分地统一累加。

效果上，官方给出的数字是：AttnRes 能带来约 **25% 的训练效率提升**，而额外计算成本不到 **2%**。也就是说，这是一个"几乎白拿"的训练加速手段——这类"低成本、高收益"的架构微创新，往往比参数量本身更能反映一个团队的工程功底。

### 推理效率：更少的输出 token

K3 在同等任务上相比 K2.6 **减少了约 21% 的输出 token**，加上"思考模式常开"的设计（API 层面 `reasoning_effort` 目前只有 `max` 一个选项，取代了 K2.x 时代的 `thinking` 开关），意味着 K3 不再让开发者纠结"要不要开思考模式"，而是直接把推理能力做成默认行为，靠架构效率把输出 token 数压下来对冲成本。

### 多模态与上下文

K3 支持**原生视觉理解**，图像内容以数组形式传入 API（支持 base64 编码图片或 `ms://<file-id>` 引用格式）；上下文窗口达到 **100 万 token**，且官方强调"自动缓存、无需手动配置"——只要保持长前缀不变，就能自动复用缓存以降低成本。

## 跑分表现

| 维度 | 结果 |
|---|---|
| Artificial Analysis 综合 Elo | 1547，相比 K2.6 跃升 732 分，落后于 Claude Fable 5，领先其余所有已知模型 |
| Arena.ai Frontend Code Arena | 领先，**击败 Claude Fable 5** |
| 官方口径综合评价 | 大体超过 Claude Opus 4.8 max、GPT-5.5 high；落后于 Claude Fable 5、GPT-5.6 Sol |
| 相比 DeepSeek V4 Pro（1.6T）、GLM 5.2（744B） | 参数规模显著更大 |

需要提醒的是，"击败 Claude Fable 5"这类结论目前只出现在**单项**基准（Frontend Code Arena）上，K3 在综合能力上仍明确落后于 Claude Fable 5 和 GPT-5.6 Sol——这和 Inkling"效率突出但非最强"的定位有相似之处：**开源阵营目前普遍在"逼近"而非"全面反超"闭源旗舰**。另外有报道提到 K3 在简单任务（如生成一个 SVG 图形）上会消耗出人意料多的 token（例如约 13,241 个 token），这提示"思考模式常开"这个设计在部分轻量任务上可能存在推理成本浪费，实际接入时值得对高频轻量场景做专门的成本评估。

## 代码示例与实践指南

### API 快速接入

Moonshot 官方 API 完全兼容 OpenAI SDK 格式，只需替换 base URL 和模型名：

```bash
pip install --upgrade 'openai>=1.0'
```

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["MOONSHOT_API_KEY"],
    base_url="https://api.moonshot.ai/v1",
)

response = client.chat.completions.create(
    model="kimi-k3",
    reasoning_effort="max",  # 目前唯一可选值，思考模式默认常开
    messages=[
        {"role": "system", "content": "你是一个乐于助人的助手。"},
        {"role": "user", "content": "用 Python 实现一个简单的 LRU 缓存"},
    ],
    max_completion_tokens=131072,  # 默认值，最大可设到 1,048,576
)

print(response.choices[0].message.content)
```

需要注意几个和 OpenAI 标准接口不同的地方：

- `temperature`、`top_p`、`n`、`presence_penalty`、`frequency_penalty` 这几个参数**不可修改**，请求里应直接省略，否则可能报错或被忽略。
- 流式响应会把推理过程和最终答案**分开返回**：`reasoning_content`（思考过程）和 `content`（最终输出）是两个独立的字段增量，适合需要展示"模型正在思考"这类交互的产品。
- 工具调用可以用 `tool_choice="required"` 强制模型必须调用工具，返回时需要把完整的助手消息（含所有工具调用结果）拼接进后续请求。

### 视觉输入

```python
response = client.chat.completions.create(
    model="kimi-k3",
    reasoning_effort="max",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "描述一下这张架构图里的数据流向"},
                {
                    "type": "image_url",
                    "image_url": {"url": "data:image/png;base64,<BASE64_DATA>"},
                },
            ],
        }
    ],
)
```

### 长上下文与缓存

K3 采用**统一定价、不按上下文长度分档**的计费方式，且自动开启前缀缓存——只要请求之间保持相同的长前缀（例如固定的 system prompt 或大段参考文档），缓存命中部分会按 $0.30/百万 token 计费，远低于 $3/百万 token 的常规输入价。这对需要反复携带大段上下文的 Agent 类应用（比如让模型持续在同一个大代码库上工作）是一个直接可利用的成本优化点。

### 等待开源权重：7 月 27 日

如果你想本地部署而不是走 API，目前（截至 7 月 18 日）Moonshot 在 Hugging Face 上的官方组织仍只有 K2 系列的权重，K3 的完整权重与技术报告要等到 **7 月 27 日**才会一并放出，License 预计延续 K2 系列的 **Modified MIT**（允许商用）。考虑到 2.8 万亿参数的全量权重体量极大，可以预期社区会像 Inkling 一样很快跟进量化版本（FP8/NVFP4/GGUF），但对个人开发者来说，短期内**通过 API 或 Kimi App 接入仍是现实的第一选择**。

## 总结与展望

把 Kimi K3 放进最近一个月的时间线里看会更清楚：Anthropic 用 Claude Fable 5/Sonnet 5 守住综合能力头把交椅，OpenAI 用 GPT-5.6 Sol/Terra/Luna 三档模型覆盖不同成本场景，xAI 用 Grok 4.5 主打推理 token 效率，Thinking Machines 用 Inkling 打"反一刀切、可定制"这张牌，而月之暗面这次用 K3 打的是**"参数规模 + 架构效率双线拉满，同时价格打到闭源旗舰的一半"**这张牌——这也是它比 Inkling 更能刺激资本市场神经的原因：Inkling 官方从一开始就承认"不是最强模型"，而 K3 是明确冲着"逼近甚至局部超越 Claude Fable 5"去的，且背后站着阿里巴巴的资金和估值已冲到 315 亿美元的月之暗面。

对开发者而言，短期内的现实建议是：**如果你的场景本来就在用 Kimi K2.x 系列或 DeepSeek/GLM 这类国产开源模型做代码生成、长文档处理，K3 提供的 100 万上下文、更快的长上下文解码速度、更低的单任务成本，值得直接做一轮 A/B 测试**；但如果你的场景对"思考模式常开"带来的轻量任务 token 浪费比较敏感（比如高频、低复杂度的调用），建议先用真实业务数据评估成本曲线，而不是只看跑分榜单。

更大的行业信号是：**从 DeepSeek R1（2025 年初）到 K3（2026 年 7 月），"中国开源模型发布引发美股联动下跌"这件事正在从"黑天鹅事件"变成"可预期的周期性冲击"**。这背后的逻辑并不复杂——只要开源模型持续以更低成本逼近闭源旗舰的能力上限，市场就会持续重新定价"算力护城河"的价值。对于长期跟踪 AI 行业的开发者和从业者来说，与其把每一次这类发布当作孤立的黑天鹅新闻，不如把它当作观察"算力 vs 架构效率"这场长期博弈进展的一个个数据点。

## 参考链接

- VentureBeat《China's Moonshot AI releases Kimi K3, the largest open-source model ever, rivaling top U.S. systems》：[venturebeat.com](https://venturebeat.com/technology/chinas-moonshot-ai-releases-kimi-k3-the-largest-open-source-model-ever-rivaling-top-u-s-systems)
- MarkTechPost《Moonshot AI Releases Kimi K3: A 2.8 Trillion Parameter Open MoE Model With Kimi Delta Attention and 1M Context》：[marktechpost.com/2026/07/16](https://www.marktechpost.com/2026/07/16/moonshot-ai-releases-kimi-k3-a-2-8-trillion-parameter-open-moe-model-with-kimi-delta-attention-and-1m-context/)
- MLQ News《Moonshot AI Releases Kimi K3, a 2.8-Trillion-Parameter Open-Weight Model Rivaling Top U.S. Systems》：[mlq.ai/news](https://mlq.ai/news/moonshot-ai-releases-kimi-k3-a-28-trillion-parameter-open-weight-model-rivaling-top-us-systems/)
- Axios《China's open-weight Kimi model stuns AI world with frontier-level results》：[axios.com/2026/07/16](https://www.axios.com/2026/07/16/moonshot-kimi-ai-china-model-openai-anthropic)
- Fortune《Markets experience new DeepSeek shock after MoonShot AI releases Kimi K3》：[fortune.com/2026/07/17](https://fortune.com/2026/07/17/china-moonshot-kimi-k3-markets-china-ai/)
- Tom's Hardware《China's 2.8-trillion-parameter Kimi K3 beats Claude Fable 5 in Frontend Code Arena benchmark》：[tomshardware.com](https://www.tomshardware.com/tech-industry/artificial-intelligence/moonshot-releases-2-8-trillion-parameter-kimi-k3)
- Benzinga《David Sacks, Bill Ackman Sound the Alarm on China's Kimi K3 as Nvidia, Micron Slide》：[benzinga.com](https://www.benzinga.com/markets/prediction-markets/26/07/60537191/david-sacks-bill-ackman-sound-the-alarm-on-chinas-kimi-k3-as-nvidia-micron-slide)
- Yahoo Finance《Kimi K3 Just Triggered DeepSeek Flashbacks for the Stock Market》：[finance.yahoo.com](https://finance.yahoo.com/markets/stocks/articles/kimi-k3-just-triggered-deepseek-175532711.html)
- Moonshot 官方 Kimi API 文档 — Kimi K3 Quickstart：[platform.kimi.ai/docs/guide/kimi-k3-quickstart](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart)
- CoderSera《Kimi K3: Moonshot AI's 2.8T Open-Weight Model — Release, Specs & Pricing》：[codersera.com/blog/kimi-k3-complete-guide-2026](https://codersera.com/blog/kimi-k3-complete-guide-2026/)
