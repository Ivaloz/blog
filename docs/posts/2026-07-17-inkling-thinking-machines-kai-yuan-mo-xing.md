---
title: 'Inkling 首发解读：Mira Murati 的 Thinking Machines 交出第一个开源模型，赌的是「反一刀切」'
date: 2026-07-17
slug: 'inkling-thinking-machines-kai-yuan-mo-xing'
description: '2026 年 7 月 15 日，前 OpenAI CTO Mira Murati 创立的 Thinking Machines Lab 发布了成立以来第一个自研模型 Inkling——一个 975B 总参数、41B 激活参数的原生多模态 MoE 模型，采用 Apache 2.0 协议全权重开源，支持文本、图像、音频三模态推理与 1M 上下文。本文结合官方模型卡、Hugging Face 技术博客与 TechCrunch、VentureBeat、Artificial Analysis 等外媒报道，拆解 Inkling 的架构细节（相对位置编码、5:1 混合注意力、Sigmoid 路由）、可调节的「思考强度」机制、跑分对比（SWE-bench、AIME、MMMU Pro、VoiceBench）、「拒绝审查」的定位，以及如何用 Transformers / vLLM / SGLang 本地部署和用 Tinker 平台做自定义微调，并给出实践建议。'
author: 范伟彬
tags:
  - Inkling
  - Thinking Machines
  - Mira Murati
  - 开源模型
  - MoE
  - 多模态
  - 大模型
  - AI 编程
  - Hugging Face
categories:
  - AI
  - 大模型
---

# Inkling 首发解读：Mira Murati 的 Thinking Machines 交出第一个开源模型，赌的是「反一刀切」

2026 年 7 月 15 日，前 OpenAI CTO Mira Murati 创立的 Thinking Machines Lab 发布了公司成立以来的**第一个自研基础模型**——**Inkling**。这不是一次常规的"又一家实验室加入开源模型混战"，而是一次带着明确态度的下注：Thinking Machines 从成立第一天起的核心叙事就是"反对一刀切（one-size-fits-all）的 AI"，Inkling 是这个叙事第一次落地成一个真正可以下载、可以魔改、可以在自己数据上微调的产品。

更值得注意的是发布节奏：OpenAI 从成立到发布第一个自研旗舰模型用了差不多五年，Anthropic 用了三年左右，而 Thinking Machines 只用了**大约九个月**。这背后当然有团队班底的原因（Murati 带出来的核心人马大多来自 OpenAI 预训练与对齐团队），但也说明 2026 年这个时间点，"从零训一个千亿级 MoE 模型"这件事的工程门槛，比两三年前又降了一大截。

这篇文章结合 **Thinking Machines 官方模型卡与发布公告、Hugging Face 官方技术博客、TechCrunch、VentureBeat、InfoWorld、Artificial Analysis 独立评测**等信源，把 Inkling 到底是什么、架构强在哪、跑分如何、能不能本地跑、值不值得关注，一次讲清楚。

> 数据来源：Thinking Machines 官方《Inkling: Our open-weights model》与模型卡（thinkingmachines.ai）、Hugging Face 官方博客《Welcome Inkling by Thinking Machines》、TechCrunch《Thinking Machines amps up its bet against one-size-fits-all AI with its first open model, Inkling》、VentureBeat、InfoWorld/Computerworld、Artificial Analysis 独立评测文章（文末附完整链接）。跑分数字均标注对比对象，部分为 Thinking Machines 官方评测口径，建议结合第三方评测综合判断。

## 一分钟速览

- **是什么**：Thinking Machines Lab 成立以来发布的第一个自研基础模型，**原生多模态**（文本、图像、音频均可原生推理，输出目前仅文本），Mixture-of-Experts 架构。
- **规格**：975B 总参数，**41B 激活参数**（每 token 仅激活 6 个路由专家 + 2 个共享专家），支持 **1M token 上下文**，预训练数据 45 万亿 token（文本 + 图像 + 音频 + 视频）。
- **协议**：**Apache 2.0 全权重开源**，可直接商用、修改、再分发——这是"企业友好型"协议，不同于很多"开放权重但协议受限"的模型。
- **定位**：官方明确说 Inkling "不是当下最强的整体模型，无论开源还是闭源"，重点是**可定制性**和**性价比**，配合自家的 Tinker 微调平台一起卖。
- **跑分**：SWE-bench Verified 77.6%、AIME 2026 高达 97.1%、MMMU Pro 73.5%、VoiceBench 91.4%；在开源模型里跑分紧咬 Kimi K2.6、DeepSeek V4 Pro、GLM 5.2，但**平均输出 token 数明显更少**（约 2.5 万 token/任务，对比 Kimi K2.6 的 3.8 万），推理成本优势明显。
- **额外卖点**："拒绝审查"——在 Cognition 的 Propaganda/Censorship Eval 上表现出较强的"审查不合规"倾向，被外媒解读为面向美国及西方企业客户的"可信事实输出"定位，直接对标 DeepSeek、Kimi 等中国开源模型的潜在顾虑。
- **可及性**：Hugging Face 上同时提供 BF16 原始权重和面向 NVIDIA Blackwell 的 NVFP4 量化权重；Together AI、Fireworks、Modal、Databricks、Baseten 等平台已上线托管 API；支持 vLLM、SGLang、llama.cpp 部署，社区已有 1-bit GGUF 量化版本可在消费级硬件跑起来。

## 为什么这次发布值得单独写一篇

过去两周 AI 圈的头条大多被"更强模型"占据——OpenAI GPT-5.6 Sol 系列、Grok 4.5、传闻中即将到来的 Gemini 3.5 Pro。这些都是"参数量竞赛"或者"闭源旗舰迭代"的常规叙事。Inkling 不一样，它值得关注的理由不是"跑分第一"（它明确不是），而是三件事同时发生：

1. **Mira Murati 团队的第一份真正答卷**。Thinking Machines 成立以来更多是靠 Tinker 微调平台、以及零星的研究博客维持存在感，外界一直好奇"这家融了几十亿美元、汇聚了大批 OpenAI 预训练骨干的公司，究竟能不能自己训出一个像样的基础模型"。Inkling 是第一次正面回答这个问题。
2. **"反一刀切"不是营销话术，而是产品架构**。Inkling 本身不靠卖 token 赚钱——开源权重本身免费，Thinking Machines 的商业模式是靠 Tinker 平台上的**微调和托管服务**赚钱。这意味着 Inkling 从设计上就是"给企业当基座、自己在上面调"的半成品，而不是"开箱即用打天下"的旗舰。Bridgewater 用它在金融数据上微调后，financial reasoning 测试拿到 84.7%，超过多个闭源模型，运行成本却只有约 1/14——这类案例是 Thinking Machines 想讲的核心故事。
3. **地缘叙事**：多家外媒（InfoWorld、Computerworld）把 Inkling 定位为"美国企业在开放权重赛道上的替代选项"，直接对标近一年在开源榜单上势头很猛的 DeepSeek、Kimi、GLM 等中国模型。"拒绝审查"这个设计目标，说白了就是奔着这批潜在客户的顾虑去的。

## 技术细节解析

### 架构：MoE + 相对位置编码 + 混合注意力

Inkling 是一个 **decoder-only 的 Mixture-of-Experts Transformer**，几个架构细节值得单独说：

- **专家路由**：每层 MoE 设置 256 个路由专家 + 2 个共享专家，每个 token 实际激活 **6 个路由专家**，配合 **sigmoid 路由 + 无辅助损失的负载均衡**（auxiliary-loss-free load balancing）——这是 DeepSeek 系列在 V3 上验证过、后来被业界广泛借鉴的路由稳定性方案。
- **注意力机制**：放弃了近两年几乎"默认选项"的 RoPE，改用**相对位置编码**，官方给出的理由是在长上下文外推（extrapolation）上表现更好；同时采用**滑动窗口注意力与全局注意力按 5:1 比例交替**、8 个 KV head 的分组结构，这是在 1M 上下文场景下控制显存和计算量的常见工程手段。
- **短卷积（SConv）**：在 key/value 投影和残差分支之后插入短一维卷积——这个设计在最近一批新架构论文里也有出现，作用类似给注意力机制加一层局部平滑。
- **推测解码**：内置 **MTP（Multi-Token Prediction）drafter 层**，推理时可通过 `use_mtp=True` 开启，用于加速自回归解码。

### 训练：45 万亿 token、混合优化器、异步 RL

预训练数据量 **45 万亿 token**，横跨文本、图像、音频、视频四种模态；优化器上采用**混合策略**——大矩阵权重用 Muon，其余参数用 Adam，这也是近一年大模型训练里逐渐流行的组合（Muon 在处理大矩阵梯度时收敛效率优于纯 Adam）。

后训练阶段有一个耐人寻味的细节：Thinking Machines **承认早期后训练部分借助了其他开放权重模型（包括月之暗面 Kimi K2.5）的数据/信号**，之后才转向大规模强化学习——RL 阶段做了超过 **3000 万次异步 rollout**，推理能力随训练呈对数线性提升。官方表态未来版本会做到后训练完全自给自足。这个细节侧面说明，即便是顶级团队从零训练千亿级模型，"站在现有开源生态肩膀上"依然是 2026 年的现实路径，而不是什么见不得人的事。

### 多模态输入怎么做的

- **视觉**：采用 **4 层 hMLP** 对图像做 40×40 像素分块编码，支持图像描述、视觉问答、数学图形推理。
- **音频**：处理 **dMel 频谱图**，支持转录、指令跟随和"对录音内容做推理"（不只是转文字，还能回答关于音频内容的问题）。
- 需要注意：Inkling 目前**只有文本输出**，图像/音频是"能理解"而不是"能生成"。

### 跑分：不是最强，但效率突出

Thinking Machines 官方在 effort=0.99、temperature=1.0 设置下，把 Inkling 和开源阵营的 Nemotron 3 Ultra、Kimi K2.5/K2.6、GLM 5.2、DeepSeek V4 Pro，以及闭源阵营的 Gemini 3.1 Pro、Claude Fable 5、GPT-5.6 Sol 放在一起测：

| 维度 | 基准 | Inkling | 对比 |
|---|---|---|---|
| 推理（带工具） | HLE | 46.0% | Claude Fable 5: 64.5% |
| 数学 | AIME 2026 | 97.1% | 与顶尖模型基本打平（99.9%） |
| 代码 | SWE-bench Verified | 77.6% | DeepSeek V4 Pro 80.6%；Claude Fable 5 95.0% |
| 视觉 | MMMU Pro | 73.5% | GPT-5.6 Sol 83.0% |
| 语音 | VoiceBench | 91.4% | Gemini 3.1 Pro 94.3% |
| 安全 | FORTRESS 对抗测试 | 78.0% | Claude Fable 5 96.0% |

结论很直接：**跟头部闭源模型（Fable 5、GPT-5.6 Sol）比，Inkling 在几乎所有硬核榜单上都有明显差距**；跟同为开源阵营的 Kimi K2.6、DeepSeek V4 Pro 比，互有胜负，Inkling 在数学上略胜 DeepSeek（97.1% vs 96.7%），但代码上落后（77.6% vs 80.6%），Kimi K2.6 在多个技术榜单上仍领先 Inkling。

真正的亮点在**效率**：独立评测机构 Artificial Analysis 指出，Inkling 完成 Intelligence Index 任务平均只用约 **2.5 万输出 token**，而 GLM-5.2、Kimi K2.6、DeepSeek V4 Pro 分别要用 4.3 万、3.8 万、3.7 万——同等智力水平下，Inkling 的推理成本明显更低。这也是它在 Artificial Analysis 榜单上被称为"美国阵营最强开放权重模型"的核心依据，而不是单项跑分最高。

### 可调节的"思考强度"

Inkling 暴露了一个 `reasoning_effort` 参数，可选 `none / minimal / low / medium / high / xhigh / max` 七档，模型在训练阶段就学会了根据这个设置调节输出 token 的多少。官方给出的例子是：在 Terminal-Bench 2.1 上，Inkling 只用约 **1/3 的 token** 就能达到 Nemotron 3 Ultra 的水平——本质上是把"要不要多想一会儿"这个决策交给了开发者，而不是让模型自己每次都全力以赴。

### 校准与"拒绝审查"

Inkling 在后训练阶段专门针对"校准"（calibration）做了强化学习，用**真实世界已有结论的问题 + proper scoring rule** 训练模型对自己的答案给出置信度，鼓励"不确定就说不知道"而不是自信地编答案——ForecastBench Brier Index 63.7±0.82（无搜索工具）。评分机制上采用双重打分：一个 rubric grader 加一个用 agentic 网络搜索验证事实的 claims verifier。

另一个被多家外媒重点提及的设计目标，是在 Cognition 的 Propaganda/Censorship Eval 上表现出**较强的"审查不合规"倾向**——通俗说就是在政治敏感或有争议的话题上，倾向于直接给出答案而不是回避。这既是一个技术特性，也是一次明确的市场定位：面向那些对某些开源模型（尤其是特定地区训练的模型）在特定话题上的回答方式有顾虑的西方企业客户。

## 代码示例与实践指南

### 用 Transformers 快速跑起来

Hugging Face 官方博客给出了两种加载方式，一种是 pipeline 高层封装：

```python
from transformers import pipeline

pipe = pipeline("any-to-any", model="thinkingmachines/Inkling")
result = pipe("用一句话解释什么是混合专家模型（MoE）")
```

另一种是更底层、可控性更强的写法：

```python
from transformers import AutoModelForMultimodalLM, AutoProcessor

processor = AutoProcessor.from_pretrained("thinkingmachines/Inkling")
model = AutoModelForMultimodalLM.from_pretrained(
    "thinkingmachines/Inkling",
    dtype="auto",
    device_map="auto",
)

messages = [{
    "role": "user",
    "content": [{"type": "text", "text": "解释一下相对位置编码相比 RoPE 的优势"}],
}]

inputs = processor.apply_chat_template(
    messages,
    reasoning_effort="high",   # none/minimal/low/medium/high/xhigh/max
    return_tensors="pt",
).to(model.device)

outputs = model.generate(**inputs, max_new_tokens=1024, use_mtp=True)
print(processor.decode(outputs[0], skip_special_tokens=True))
```

多模态输入（图片、音频）走同样的 `messages` 结构，只是 `content` 里换成对应类型：

```python
# 图文问答
messages = [{
    "role": "user",
    "content": [
        {"type": "image", "image": "https://example.com/chart.png"},
        {"type": "text", "text": "这张图表反映了什么趋势？"},
    ],
}]

# 语音理解
messages = [{
    "role": "user",
    "content": [
        {"type": "text", "text": "转录并总结这段录音的要点"},
        {"type": "audio", "audio": "https://example.com/meeting.wav"},
    ],
}]
```

### 硬件门槛：普通开发者怎么跑

Inkling 全量 BF16 权重需要约 **2TB 显存**（8×NVIDIA B300 或 16×H200 级别的集群），这不是个人开发者能碰的量级。三条现实路径：

1. **NVFP4 量化版**（`thinkingmachines/Inkling-NVFP4`）：显存需求降到约 600GB，面向 NVIDIA Blackwell 架构 GPU，仍然是企业级配置。
2. **社区 1-bit GGUF 量化**（Unsloth 出品）：显存占用相比原版降低约 95%，可以用 `llama.cpp` 在消费级/工作站级硬件上跑：

```bash
llama serve -hf unsloth/inkling-GGUF:UD-IQ1_S
```

3. **托管 API**：Together AI、Fireworks、Modal、Databricks、Baseten 均已上线 Inkling 的推理服务，对大多数开发者来说这是目前最现实的接入方式，不用自己操心量化和显存。

生产环境部署推荐 vLLM 或 SGLang：

```bash
# vLLM
vllm serve thinkingmachines/Inkling --tensor-parallel-size 8

# SGLang
python3 -m sglang.launch_server \
  --model-path thinkingmachines/Inkling \
  --tp-size 8
```

### 用 Tinker 平台做自定义微调

这才是 Thinking Machines 真正想让开发者体验的部分——Inkling 开源权重本身不赚钱，**微调服务**才是商业模式。官方给出的一个演示很直观：让 Inkling 通过强化学习微调自己，训练出一个"回答中绝不出现字母 e"的 lipogram 模型，打分函数极其简单粗暴：

```python
OBJECTIVE = "A lipogram model that avoids using the letter e in all answers."

def score(prompt, answer) -> float:
    if 'e' in answer or 'E' in answer:
        return 0.0
    return 10.0
```

用 Tinker API 跑了 96 步、约 27 分钟训练后，模型就稳定学会了这个古怪的约束。这个玩具例子背后的严肃逻辑是：**Tinker 把"用强化学习给模型灌输一个自定义目标函数"这件事的门槛降到了写一个打分函数的程度**，配合 Inkling 这种开放权重底座，企业可以用自己的私有数据和评价标准去塑造模型行为——这正是 Thinking Machines "反一刀切"叙事想要证明的能力，Bridgewater 的金融推理案例走的就是同一条路径。目前 Tinker 提供 50% 首发折扣，支持 64K 和 256K 两档上下文规格。

还有一个更小的 **Inkling-Small**（276B 总参数、12B 激活）目前处于预览测试阶段，在多项基准上追平大模型表现，同时显著降低延迟和成本，适合对推理速度更敏感的场景。

## 总结与展望

把这次发布放进最近两周的 AI 时间线里看会更清楚：OpenAI 用 GPT-5.6 Sol 打"更强模型"这张牌，Anthropic 用 Fable 5/Mythos 5 的双轨架构打"能力天花板 + 安全护栏"这张牌，Claude Code 用 Browser 面板和 `/doctor` 打"工具链工程"这张牌，而 Thinking Machines 用 Inkling 打的是第四张牌——**"不追求最强，但要能被企业彻底掌控"**。这四条路线没有互斥关系，恰恰说明 2026 年年中的 AI 竞争已经从单一维度的跑分竞赛，分化成了模型能力、安全对齐、工具链体验、开放可定制性这四条并行的赛道。

对国内开发者而言，Inkling 短期内的实际价值可能不在于"拿来直接调用"（跑分和综合能力都不是最优选），而在于它提供的两个参照系：一是**架构设计上的一批新工程选择**（相对位置编码替代 RoPE、sigmoid 路由、短卷积）值得关注是否会成为下一代开源模型的新常态；二是 **Tinker 这类"底座模型 + 强化学习微调平台"的商业化范式**，展示了开放权重模型除了"直接调用"之外的另一条变现和落地路径——尤其是 Bridgewater 那类"用极少数据、极低成本在垂直领域超越通用大模型"的案例，对做垂直行业 AI 应用的团队会有直接的参考意义。

接下来一两周，随着 Gemini 3.5 Pro（据传定档 7 月 17 日，官方尚未确认）等重磅发布落地，"通用能力竞赛"和"垂直可定制化"这两条主线大概率会继续交替成为焦点。但 Inkling 至少证明了一件事：即便在 2026 年这个巨头林立的节点，一家成立不到两年、走"反一刀切"路线的团队，依然能在九个月内拿出一个跑分不领先、但商业逻辑自洽的千亿级开源模型——这本身就是这个行业还远未固化的一个信号。

## 参考链接

- Thinking Machines 官方发布公告《Inkling: Our open-weights model》：[thinkingmachines.ai/news/introducing-inkling](https://thinkingmachines.ai/news/introducing-inkling/)
- Thinking Machines 官方模型卡：[thinkingmachines.ai/model-card/inkling](https://thinkingmachines.ai/model-card/inkling/)
- Hugging Face 官方博客《Welcome Inkling by Thinking Machines》：[huggingface.co/blog/thinkingmachines-inkling](https://huggingface.co/blog/thinkingmachines-inkling)
- Hugging Face 模型页：[huggingface.co/thinkingmachines/Inkling](https://huggingface.co/thinkingmachines/Inkling)
- TechCrunch《Thinking Machines amps up its bet against one-size-fits-all AI with its first open model, Inkling》：[techcrunch.com/2026/07/15](https://techcrunch.com/2026/07/15/thinking-machines-amps-up-its-bet-against-one-size-fits-all-ai-with-its-first-open-model-inkling/)
- VentureBeat《Thinking Machines open sources first multimodal language model, Inkling, focused on low cost and 'resistance to censorship'》：[venturebeat.com](https://venturebeat.com/technology/thinking-machines-open-sources-first-multimodal-language-model-inkling-focused-on-low-cost-and-resistance-to-censorship)
- InfoWorld《Thinking Machines Lab offers enterprises a US alternative in open-weight AI》：[infoworld.com/article/4197743](https://www.infoworld.com/article/4197743/thinking-machines-offers-enterprises-a-us-alternative-in-open-weight-ai.html)
- Artificial Analysis《Thinking Machines has released Inkling, the new leading U.S. open weights model》：[artificialanalysis.ai/articles](https://artificialanalysis.ai/articles/thinking-machines-has-released-inkling-the-new-leading-u-s-open-weights-model)
- gHacks Tech News《Thinking Machines Lab Releases Inkling, a 975 Billion Parameter Open Weights AI Model Under Apache 2.0》：[ghacks.net/2026/07/16](https://www.ghacks.net/2026/07/16/thinking-machines-lab-releases-inkling-a-975-billion-parameter-open-weights-ai-model-under-apache-2-0/)
