---
title: '一个 4B 开源模型靠 RL 后训练打平 GPT-5.6 Sol，成本只要百分之一——检索任务成了"强化学习即护城河"的第一块试验田'
date: 2026-08-07
slug: 'castform-4b-kaiyuan-moxing-rl-houxunlian-jiansuo'
description: '2026 年 8 月 6 日，数据库公司 Neon 与 RL 后训练平台 Castform 联合发布博客，宣称一个经过强化学习后训练的 4B 参数开源模型，在检索任务上的准确率追平了 OpenAI 最新旗舰 GPT-5.6 Sol，而单次请求成本只有后者的百分之一。这篇文章当天冲上 Hacker News 首页。本文基于 Neon/Castform 官方博客、Castform 产品文档、Hacker News 讨论区等信源，拆解这套"任务定义 + 检索环境 + 奖励函数"的 RL 后训练闭环具体怎么跑通，对比 Fireworks、Google OpenRL 等同类平台，并给出开发者自己动手做 RL 后训练可以参考的实践路径与需要警惕的坑。'
author: 范伟彬
tags:
  - RL 后训练
  - Castform
  - Neon
  - GPT-5.6 Sol
  - 检索增强生成
  - 强化学习
  - 开源模型
  - GRPO
categories:
  - AI
  - 开发者工具
---

# 一个 4B 开源模型靠 RL 后训练打平 GPT-5.6 Sol，成本只要百分之一——检索任务成了"强化学习即护城河"的第一块试验田

2026 年 8 月 6 日，云原生 Postgres 服务商 Neon 与专注强化学习（RL）后训练的初创公司 Castform 联合发布了一篇技术博客，标题很直接："Beating GPT-5.6 Sol on retrieval with 100x cheaper open models"。核心结论只有一句话：一个仅有 4B 参数的开源模型，经过针对性的 RL 后训练之后，在检索任务上的准确率追平了 OpenAI 当前的旗舰模型 GPT-5.6 Sol，而单次请求的推理成本只有后者的百分之一。这篇文章当天就冲上了 Hacker News 首页，引发了一场关于"RL 后训练到底能不能成为中小团队对抗前沿大模型"的热烈讨论。

对天天在写 RAG（检索增强生成）应用、给客服机器人接知识库、给 Agent 挂搜索工具的开发者来说，这不是一条可以一扫而过的"某创业公司秀肌肉"新闻。它指向的是 2026 年下半年 AI 基础设施领域一个越来越清晰的趋势：当前沿闭源模型的通用能力已经"贵得不成比例"地强，RL 后训练正在成为中小团队用小模型在垂直任务上正面硬刚大模型的现实路径——而且门槛正在被 Castform 这类平台快速拉低到"写一个奖励函数就能上手"的程度。

## 一、背景：为什么是检索任务，为什么是现在

Neon 博客里给出的问题背景很具体：一次典型的多轮检索请求，用 GPT-5.6 Sol 来做，端到端耗时超过 10 秒，成本约 0.03 美元。对于需要高频调用检索的 Agent 应用（比如一个持续读代码库、读文档库回答问题的助手），这个延迟和成本会被请求量线性放大，很快变得不可持续。开源小模型在推理成本上天然有 100 倍的优势，但开箱即用的能力普遍打不过闭源前沿模型——这正是 Castform 想要填的那个缺口。

这也和 GPT-5.6 系列本身的定位有关。OpenAI 在 6 月末预览、7 月初正式推出的 GPT-5.6 家族分为三档：旗舰 Sol、均衡型 Terra、快速经济型 Luna，Sol 主打编程、科学、网络安全等高难度场景的最优表现，配了迄今为止最严格的安全审查体系，标准短上下文定价为每百万 token 输入 5 美元、输出 30 美元，上下文窗口达到 105 万 token。换句话说，Sol 是一个为"通用最强"而生、定价也相应偏高的模型——用它去做检索这种相对结构化、可以被针对性优化的子任务，本身就是一种资源错配。Castform 的实验恰恰是在验证：这部分错配的成本，能不能靠"把模型训练得更专"来省下来。

## 二、技术细节解析：一次 RL 后训练闭环是怎么跑起来的

Castform 描述的检索任务本质是一个混合检索（hybrid search）问题：模型需要同时调用基于关键词的 BM25 文本检索和基于向量相似度的语义检索，再通过倒数排名融合（Reciprocal Rank Fusion, RRF）把两路结果合并排序，最终给出带引用的答案。在这套实验里，检索的数据后端是 Neon 自家的 Lakebase 数据库，模型可调用的工具被封装成两个函数：

- `lakebase_text()` —— 执行 BM25 关键词检索
- `lakebase_vector()` —— 执行向量相似度检索

整套 RL 后训练闭环拆成三个核心组件：

**1. 任务定义（Task）。** 从客户提供的私有文档语料（可以是生产环境里 Agent 的历史调用轨迹，也可以是原始的向量库、文档库、PDF 合集）中，自动合成一批"问题—标准答案"对，作为训练样本。

**2. 环境（Environment）。** 模型在这个环境里可以反复调用 `lakebase_text()` 和 `lakebase_vector()` 去检索、组合、验证信息，直到给出最终答案——这本质上是一个多轮工具调用的 Agent 循环，而不是单轮问答。

**3. 奖励函数（Reward）。** 根据"是否检索到了正确的信息源""是否引用了正确的文本片段""最终答案是否正确"这三个维度综合打分，分数反过来驱动模型参数更新。

整个训练过程就是一个标准的"模型尝试任务 → 奖励函数打分 → 反馈指导优化"的强化学习循环，算法层面 Castform 使用的是经过预调优的 GRPO（Group Relative Policy Optimization）变体——这也是 DeepSeek-R1 等推理模型训练中被验证过的主流 RL 微调算法之一。从 Castform 的开源代码仓库（`castform-ai/verl-cgft-fork`）可以看到，其训练底座 fork 自字节跳动开源的 verl 框架，这是目前工业界应用最广的大模型 RL 训练框架之一，说明 Castform 并非从零造轮子，而是在成熟的开源训练基础设施上做了产品化封装。

在基础设施层面，Neon 提供了两个关键能力：一是数据库的动态自动扩缩容，用来吸收 RL 训练过程中天然存在的"突发性"负载（大量并发 rollout 会瞬间打满数据库连接，训练间歇又几乎无负载）；二是分支（branching）能力，让每一次 rollout 都能在一个隔离的数据库状态下运行，避免并发训练任务互相污染数据。这两点其实揭示了一个容易被忽视的事实：RL 后训练不只是"调模型"，训练环境本身的基础设施（尤其是数据/工具后端能不能扛住突发并发）同样是决定训练效率的关键变量。

## 三、实践指南：奖励函数长什么样，普通开发者怎么上手

Neon 博客里给出的奖励函数结构大致是这样的（示意，非完整生产代码）：

```python
def reward(trace, ground_truth):
    retrieval = score_retrieval(trace, ground_truth)   # 是否检索到正确来源
    citation = score_citation(trace, ground_truth)      # 是否引用了正确片段
    correctness = score_correctness(trace, ground_truth)  # 最终答案是否正确
    return retrieval + citation + correctness
```

真正决定训练效果的往往不是算法本身（GRPO 这类算法已经相对成熟、可以直接复用），而是这三行打分逻辑背后的具体实现——怎么定义"检索到正确来源"、怎么处理语料里本身就存在的过时或矛盾信息、怎么给"部分正确"的引用打折扣分。Castform 把自己的产品定位总结为："把这些工程细节留给我们处理，你只需要想清楚'什么样的行为是好的、怎么衡量它'。"这也是当前 RL 后训练类产品的共同卖点：数据准备、超参调优、GPU 调度、断点续训这些基础设施工作被平台吃掉，开发者的核心工作收窄为"设计任务和奖励函数"。

如果你不想依赖托管平台、更在意数据隐私（Castform 目前仅提供云端托管，这也是 Hacker News 讨论中被明确指出的短板），社区里已经有几条可以自己搭的路径：

1. **用 verl 或类似框架自建训练管线。** verl 是字节跳动开源、目前工业界采用率很高的 RL 训练框架，Castform 自己也是在它的基础上做的二次开发，文档和社区相对成熟。
2. **用 TRL（Hugging Face）或 Unsloth 做轻量级微调实验。** 这是 Castform 创始人在 Hacker News 评论区被追问"不想上云怎么办"时给出的自答，适合先在小规模上验证奖励函数设计是否合理，再决定要不要上正式的分布式训练。
3. **参考 Google 6 月发布的 OpenRL。** 这是 Google Open Source Blog 推出的一套自托管、开源的后训练 API，同样瞄准"让 RL 微调像调用 API 一样简单"的目标，可以作为 Castform 的开源平替对比参考。
4. **如果只是想买现成的 RL 微调算力和流水线，不想自建。** Fireworks AI 目前提供从 SFT、LoRA 到强化微调（Reinforcement Fine-Tuning）的全套自助服务，还开放了"只买 rollout 服务、自带训练器"的 a la carte 模式，是 Castform 之外另一条商业化路径。

不管走哪条路，Hacker News 讨论区提出的几个质疑都值得先想清楚，再决定要不要投入：一是**训练成本没有被披露**，博客只谈了推理成本节省，没有说清楚训练要花多少钱、多久能回本，"我不关心推理成本，我想知道盈亏平衡点在哪"是评论区被顶得很高的一条；二是**评测基准的说服力**，有人指出对比没有覆盖 BrowseComp 这类业界公认的检索基准，也没有把 DeepSeek Flash（号称比 Sol 便宜 50 倍）纳入对比，容易让人怀疑是"精心挑选过的场景"；三是**数据漂移问题**——语料库持续更新时，训练好的模型要不要频繁重训才能保持优势，目前没有给出答案；四是**语料质量问题**，企业内部文档普遍存在过时、互相矛盾的内容，奖励函数怎么应对这种"标准答案本身就不干净"的现实场景，同样是待解决的工程难题。

## 四、总结与展望

这次 Neon 与 Castform 的联合实验，价值不在于"4B 模型打平 Sol"这个结论本身有多严谨（正如 Hacker News 网友指出的，评测方法论还有明显可以补强的地方），而在于它是 2026 年下半年一个更大叙事的具体样本：**当前沿闭源模型的通用智能已经足够强、也足够贵之后，RL 后训练正在成为中小团队和创业公司手里为数不多、可以把"专用任务表现"和"推理成本"同时打下来的杠杆。** 有分析文章甚至把这个现象总结为"RL 是 2026 年的新护城河"——因为模型权重可以开源、Prompt 可以被复制，但一套针对自己业务场景、经过大量迭代打磨出来的奖励函数和训练数据管线，很难被竞争对手照搬。

对开发者来说，可以带走的判断是：如果你的应用里存在一个高频调用、任务边界清晰、可以自动生成"问题—标准答案"训练对的子任务（检索是最典型的一种，分类、摘要、结构化抽取也类似），那么现在已经有 Castform、Fireworks、Google OpenRL 这样的现成工具，让你不需要从零学习分布式 RL 训练就能试一次"用小模型换掉这部分调用"。但也要清醒地把训练成本、评测严谨性、数据漂移这几个坑提前纳入决策，而不是只看到宣传博客里那个漂亮的"100 倍"。

## 参考来源

- [Neon Blog：How Castform + Neon Beats Frontier Models on Price and Efficiency](https://neon.com/blog/how-castform-neon-beats-frontier-models-on-price-and-efficiency)
- [Hacker News 讨论：Beating GPT-5.6 Sol on retrieval with 100x cheaper open models](https://news.ycombinator.com/item?id=49186762)
- [Castform Blog：Introducing Castform, the model training platform for anyone building with AI](https://castform.com/blog/beta-launch/)
- [GitHub：castform-ai/verl-cgft-fork](https://github.com/castform-ai/verl-cgft-fork)
- [OpenAI：Previewing GPT-5.6 Sol: a next-generation model](https://openai.com/index/previewing-gpt-5-6-sol/)
- [OpenAI：GPT-5.6 — Frontier intelligence that scales with your ambition](https://openai.com/index/gpt-5-6/)
- [Google Open Source Blog：Introducing OpenRL, a self-hosted post-training API for fine-tuning LLMs](https://opensource.googleblog.com/2026/06/introducing-openrl-a-self-hosted-post-training-api-for-fine-tuning-llms.html)
- [Fireworks AI Blog：Reinforcement Fine Tuning — Train expert open models to surpass closed frontier models](https://fireworks.ai/blog/reinforcement-fine-tuning)
