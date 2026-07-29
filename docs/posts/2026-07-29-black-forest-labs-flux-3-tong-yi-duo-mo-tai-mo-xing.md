---
title: 'FLUX 3 深度解读：Black Forest Labs 用 Self-Flow 把图像、视频、音频、动作揉进一个模型'
date: 2026-07-29
slug: 'black-forest-labs-flux-3-tong-yi-duo-mo-tai-mo-xing'
description: '2026 年 7 月 23 日，Stable Diffusion 原班人马创立的 Black Forest Labs 发布 FLUX 3——公司首个统一多模态"前沿模型"，用一套名为 Self-Flow 的训练框架把图像、视频、音频和机器人动作预测联合训练进同一个扩散 Transformer 骨干网络。这不是又一次"分辨率更高、参数更大"的迭代，而是一次架构层面的赌注：图像、视频、声音和动作只是同一个物理世界的不同投影，联合训练能倒逼模型学到物理规律本身。本文结合 VentureBeat、TechTimes、Digital Applied、Winbuzzer、Hugging Face 技术博客等公开报道，拆解 Self-Flow 的训练原理、FLUX 3 的性能数据与早期访问现状、机器人应用 FLUX-mimic 在奥迪工厂的落地情况，以及开发者现在能做什么、该等什么。'
author: 范伟彬
tags:
  - FLUX 3
  - Black Forest Labs
  - 多模态模型
  - 视频生成
  - Diffusion Transformer
  - AI Agent
  - 机器人
categories:
  - AI
  - 模型发布
---

# FLUX 3 深度解读：Black Forest Labs 用 Self-Flow 把图像、视频、音频、动作揉进一个模型

2026 年 7 月 23 日，德国 AI 图像生成公司 Black Forest Labs（BFL）发布了 FLUX 3——一款被官方称为"多模态前沿模型（multimodal frontier model）"的新一代系统。过去两年，FLUX 系列一直是文生图领域最受开发者欢迎的开源家族之一，FLUX.1 和 FLUX.2 靠着扎实的文字渲染能力和多图参考一致性积累了大量口碑。但 FLUX 3 这次要做的事情完全不一样：它不再只是"更好的图像模型"，而是第一次把图像、视频、音频和机器人动作预测放进同一个扩散 Transformer 骨干网络里联合训练。

这篇文章会拆解 FLUX 3 背后的核心训练框架 Self-Flow 是怎么工作的、公开的性能数据说明了什么、目前的早期访问门槛有多高，以及作为开发者，现在能做什么、该关注什么。

> 数据来源：VentureBeat、TechTimes、Digital Applied、Winbuzzer、Manila Times（GlobeNewswire 通稿）、Hugging Face 技术博客《FLUX 3 Model Overview》等公开报道整理，部分性能数据为 BFL 官方发布的"初步（preliminary）"测试结果，尚未经过独立第三方验证。

## 一分钟速览

- **发布时间**：2026 年 7 月 23 日，视频与音频能力率先进入需申请的早期访问（Early Access）阶段；图像能力将在"未来数周"跟进；开源权重版本 FLUX 3 Dev 计划在 2026 年晚些时候发布，但具体时间和许可证条款尚未公布。
- **核心突破**：Self-Flow 训练框架——在标准的 conditional flow matching 目标之外，加入一个自监督的特征重建目标，让生成质量和表征质量相互促进，形成正反馈循环。
- **架构哲学**：图像、视频、音频、动作被视为同一个物理现实的不同"投影"。联合训练迫使模型学习它们之间的相互约束——声音要匹配撞击、运动要符合质量、未来要能从过去推导——本质上是在用生成任务倒逼模型学习物理规律。
- **能力范围**：最长 20 秒、720p 分辨率的视频生成，支持原生同步音频；文生图、图像编辑与多语言文字渲染；通过 FLUX-mimic 变体扩展到机器人动作预测，已在奥迪工厂用于柔性部件搬运的产线测试，端到端反应延迟约 101 毫秒。
- **公开基准**（初步、BFL 自测）：对 Luma Ray 3.2 的偏好胜率 93%，对 Runway Gen-4.5 为 77%，对 Kling v3 Pro 为 60%，对 Gemini Omni Flash 为 52%（统计意义上的平手）。

## 背景：从 Stable Diffusion 到 Black Forest Labs

要理解 FLUX 3 为什么这么做，得先看看 Black Forest Labs 是谁。这家公司 2024 年 8 月成立于德国弗莱堡，创始人 Robin Rombach、Andreas Blattmann、Patrick Esser、Dominik Lorenz 都曾是 Stable Diffusion 背后 latent diffusion 技术的核心研究者——他们在 LMU 慕尼黑跟随 Björn Ommer 做研究,后来加入 Stability AI，主导了 Stable Diffusion 2.0、SDXL 乃至 Stable Diffusion 3 的研发。

离开 Stability AI 后，这批人带着对扩散模型最原始的理解重新出发。BFL 早期融资 3100 万美元种子轮（a16z 领投），随后又拿到超过 4.5 亿美元的后续融资（a16z、AMP、Salesforce Ventures、NVIDIA、General Catalyst、Adobe Ventures、Figma Ventures、Canva、德国电信 T.Capital 等），公司估值达到 32.5 亿美元。FLUX.1 和 FLUX.2 让 FLUX 成为开源社区最广泛使用的图像生成模型家族之一，FLUX.2 进一步强化了文字渲染、多图参考一致性和 4K 生成能力。

FLUX 3 是这条技术路线的一次跃迁：从"专精图像"转向"统一视觉智能"。

## Self-Flow：不只是生成得更好，而是理解得更深

传统扩散模型（包括早期 FLUX）用的是 flow matching 目标：模型学习把噪声逐步映射成目标数据分布，训练信号只关心"生成的结果对不对"，不关心模型内部有没有形成可解释、可分离的语义表征。这带来一个实际问题：一个扩散模型可能生成出完美的图像或视频，但它的中间表征是一团纠缠在一起的黑盒，很难被下游任务（比如让机器人理解"这个动作会产生什么后果"）复用。

BFL 与 MIT 研究者 Chefer、Esser 等人提出的 **Self-Flow** 框架，正是为了解决这个问题。它在标准 flow matching 目标之外，叠加了一个自监督的特征重建目标，同时优化两件事：

1. **生成质量**——标准的 flow matching 目标，保证输出的图像/视频/音频足够逼真；
2. **表征质量**——自监督特征重建目标，迫使模型的中间层学出可分离、可复用的语义表征。

这两个目标之间形成一个正反馈循环：更好的表征帮助模型生成得更好，更好的生成又反过来提供更强的训练信号去精炼表征。Hugging Face 上的技术解读文章将这个机制总结为"隐式世界建模（通过噪声到数据的路径）+ 显式表征解耦（服务于下游任务）"的结合。

更值得注意的是训练数据的构成：FLUX 3 的训练中，**视频信号占据了超过 95% 的算力**，音频 token 占比不到 0.5%，图像和动作数据则用来补足边界条件。这个配比本身就说明了 BFL 的判断——要让模型学到"物理直觉"，视频里连续的因果链条（一个物体如何运动、碰撞如何发生、声音如何随之产生）比静态图像提供了远多得多的监督信号。官方给出的一个类比是：声音必须匹配撞击、运动必须符合质量、未来必须能从过去推导——这些约束只有在联合训练多个模态时才会自然涌现。

从工程效果看，Self-Flow 带来的收益是可以量化的：在机器人操作任务上，采用 Self-Flow 之后操作成功率从 42% 提升到 71%（提升 29 个百分点），达到同等指标所需的训练步数减少了约 50%，其中 mimic-video 方法相比此前的 VLA（Vision-Language-Action）模型样本效率提升了 10 倍。

## 能力矩阵：图像、视频、音频、动作四合一

FLUX 3 底层是一个统一的多模态骨干网络（Diffusion Transformer），在此基础上分化出面向不同任务的能力：

| 任务 | 具体能力 |
|---|---|
| 视频生成 | 文生视频、图生视频、视频生视频、生成式续写、关键帧转场、多镜头串联（agentic chaining） |
| 图像生成 | 图像合成与编辑、多语言文字渲染（即将进入早期访问） |
| 音频 | 与画面原生同步生成，而非后期配音叠加 |
| 动作预测 | 通过 FLUX-mimic 变体，原生集成 + 轻量解码器方案，服务机器人操作任务 |

视频生成上限是 20 秒、720p，支持同步音频；更长的多镜头序列不是靠单次生成硬撑，而是用类似 Agent 的方式做多段串联生成。这个设计思路和目前视频生成领域"单次生成时长竞赛"的路线不太一样，更接近于把"长视频生成"拆解成"可控的多步骤生成任务"。

## 机器人落地：FLUX-mimic 在奥迪工厂

FLUX 3 最值得关注的落地场景不是内容创作，而是物理 AI（Physical AI）。基于 FLUX 3 骨干网络扩展出的 FLUX-mimic，是 BFL 与机器人公司 mimic robotics 联合开发的动作预测模型，目标是让机器人从视频演示中学习操作技能，尤其是柔性物体（soft-body）的抓取和装配——这类任务传统上是工业机器人的软肋，因为柔性材料的形变难以用规则化的运动学模型描述。

奥迪已经把 FLUX-mimic 部署到工厂产线，用于柔性部件的搬运和装配测试。公开数据显示，骨干网络从输入到生成"世界表征"的处理延迟在 RTX 5090 上低于 80 毫秒，加上决策与执行环节，全栈端到端反应延迟约为 101 毫秒——这个数量级已经接近工业实时控制系统对延迟的容忍上限，说明 BFL 的目标不是做一个"能演示"的研究原型，而是真的要跑在产线上。

这也解释了为什么 FLUX 3 的训练要坚持"图像、视频、音频、动作联合训练"这条更难走的路：一个只在图像/视频数据上训练的生成模型，学不到"力"和"质量"这类物理量之间的因果关系；而这些因果关系,恰恰是机器人在物理世界里操作物体时必须具备的先验知识。

## 性能数据：偏好测试胜率，但要打个折扣

BFL 公布的偏好测试（preference test）结果如下（均为初步、厂商自测数据）：

| 对比对象 | FLUX 3 胜率 |
|---|---|
| Luma Ray 3.2 | 93% |
| Runway Gen-4.5 | 77% |
| Kling v3 Pro | 60% |
| Gemini Omni Flash | 52%（统计学意义上的平手） |
| Seedance 2.0（西方市场不可用） | 52% |

需要强调几个限制：这些数字来自 10 秒、720p 短片的对比，用的是训练早期的候选模型（early candidate），而不是最终发布版本；报道普遍指出厂商没有披露样本量、评分人数、详细评测方法论，独立第三方验证目前也不存在（开源权重还没发布，外部研究者无法自行跑分）。简单说：这些数据可以作为"方向性参考"，但不该被当作严谨的 benchmark 结果来引用。

真正有参考价值的对比是对 Gemini Omni Flash 的 52%——这说明在视频生成这个赛道上，FLUX 3 目前的水平大致与 Google 的旗舰多模态模型处于同一梯队，还没有形成压倒性优势。

## 开发者现在能做什么

坦白说，目前 FLUX 3 对大多数开发者来说还处于"看得见摸不着"的阶段：

1. **视频与动作能力**：需要在 [bfl.ai/models/flux-3](https://bfl.ai) 申请，BFL 逐个人工审核，没有公开 API，也没有公布定价。
2. **图像能力**：官方表示"未来数周"会跟进早期访问，具体日期未定。
3. **开源权重（FLUX 3 Dev）**：BFL 明确表示这是整个发布节奏中的"最后一环"，会在 2026 年晚些时候放出——相比 FLUX.1/FLUX.2 时代"发布即开源"的节奏，这次明显放缓了，许可证条款（此前 FLUX 系列从 Apache 2.0 到非商用协议都出现过）也尚未公布。

对于已经在用 FLUX.1/FLUX.2 做图像生成的团队，短期内不需要立刻迁移——现有模型不会因为 FLUX 3 发布而停止服务，API 和权重依然可用。真正值得规划的是中期路线：

- 如果你的产品线涉及短视频生成（营销素材、产品演示、社交内容），可以先提交早期访问申请占位，同时评估现有的 Sora 2、Veo 3、Runway Gen-4.5、Kling v3 等方案作为过渡；
- 如果你在机器人或具身智能方向做研发，FLUX-mimic 这条"视频预训练 + 轻量动作解码器"的路径值得跟进——它提供了一个不依赖大规模真实机器人数据、而是从海量视频中迁移物理先验的思路，对数据获取成本敏感的团队会有直接借鉴价值；
- 如果你只是做常规的文生图/图像编辑应用，继续用好 FLUX.2 即可，FLUX 3 Image 上线后再评估是否值得切换。

一个简单的伪代码示意了 BFL 官方描述的"多镜头串联"生成模式（实际 API 尚未公开，以下仅为示意 BFL 披露的调用范式）：

```python
# 示意：FLUX 3 视频生成的多镜头链式调用范式（API 细节以官方文档为准）
from flux3_client import FluxVideoClient  # 早期访问账号专属 SDK

client = FluxVideoClient(api_key="EARLY_ACCESS_KEY")

shot_1 = client.generate_video(
    prompt="工厂产线上，机械臂抓取一块柔性布料",
    duration_seconds=8,
    with_audio=True,
)

# 用上一镜头的最后一帧作为下一镜头的关键帧，实现多镜头串联
shot_2 = client.generate_video(
    prompt="布料被放置到装配台上，特写镜头",
    keyframe=shot_1.last_frame,
    duration_seconds=6,
    with_audio=True,
)

final_clip = client.chain_shots([shot_1, shot_2])
```

## 总结与展望

把 FLUX 3 放在过去一周的发布节奏里看会更清楚它的位置：Kimi K3 在拼参数规模和量化压缩，Qwen3.8 在拼"仅次于谁"的营销话术，MCP 规范在解决协议层的工程债务，而 FLUX 3 走的是一条完全不同的路——不比谁更大，而是赌"联合训练多模态能不能教会模型物理规律"这个更底层的架构问题。这个赌注能不能成立，短期内很难验证，因为权重没开源、方法论没披露、独立评测跑不起来。但奥迪产线上 101 毫秒的端到端延迟,和 42% 到 71% 的机器人操作成功率提升，是两个不那么容易造假的硬指标，说明 BFL 至少已经把这套架构验证到了"能上产线"的程度,而不只是停留在 demo 视频里。

对开发者而言，短期能做的动作有限——申请早期访问、观望图像能力上线、评估现有替代方案；真正值得持续关注的，是开源版本 FLUX 3 Dev 发布时公布的技术报告，那会是第一次有机会独立验证 Self-Flow 这套训练框架是否真的像官方描述的那样有效。如果验证结果成立，"统一多模态骨干网络 + 自监督表征学习"很可能会成为下一代视觉生成模型的标准范式，而不再是 BFL 一家的独门绝技。

## 参考链接

- Black Forest Labs 官方发布通稿（GlobeNewswire / Manila Times 转载）：[manilatimes.net](https://www.manilatimes.net/2026/07/23/tmt-newswire/globenewswire/black-forest-labs-unveils-flux-3-a-new-multimodal-frontier-model-for-visual-intelligence/2390494/amp)
- VentureBeat《Black Forest Labs launches FLUX 3 capable of generating images and 20-second video with audio》：[venturebeat.com](https://venturebeat.com/technology/black-forest-labs-launches-flux-3-capable-of-generating-images-and-20-second-video-with-audio-but-in-limited-release-to-start)
- TechTimes《FLUX 3 Launches: Black Forest Labs Enters Video, Audio, and Physical AI in One Model》：[techtimes.com](https://www.techtimes.com/articles/321552/20260725/flux-3-launches-black-forest-labs-enters-video-audio-physical-ai-one-model.htm)
- Digital Applied《FLUX 3: Black Forest Labs Goes Multimodal Frontier》：[digitalapplied.com](https://www.digitalapplied.com/blog/flux-3-black-forest-labs-multimodal-launch)
- Winbuzzer《Black Forest Labs Unveils FLUX 3 AI Image and Video Models》：[winbuzzer.com](https://winbuzzer.com/2026/07/28/black-forest-labs-launches-flux-3-behind-an-early-access-gat-xcxwbn/)
- Hugging Face 技术博客《FLUX 3 Model Overview: Multimodal Flow Models for Image, Video, Audio, and Action Prediction》：[huggingface.co](https://huggingface.co/blog/ResterChed/flux-3)
- VentureBeat《Stable Diffusion creators launch Black Forest Labs, secure $31M for FLUX.1 AI image generator》：[venturebeat.com](https://venturebeat.com/ai/stable-diffusion-creators-launch-black-forest-labs-secure-31m-for-flux-1-ai-image-generator)
- Dakota《Black Forest Labs Raises $300M at $3.25B》：[dakota.com](https://www.dakota.com/resources/blog/black-forest-labs-raises-300m-at-3.25b)
