---
title: 'Gemini 3.7 Flash 发布：三周一迭代，编程与 Agent 能力大涨的同时价格砍半'
date: 2026-08-15
slug: 'gemini-3-7-flash-coding-agent-jiage-duiban'
author: 范伟彬
categories:
  - AI
  - 大模型
tags:
  - Google
  - Gemini 3.7 Flash
  - Gemini
  - 编程助手
  - Agent
  - API
  - 大模型评测
description: '2026 年 8 月 13 日，Google 发布 Gemini 3 系列的最新工作模型 Gemini 3.7 Flash——距离上一代 3.6 Flash 只隔了三周。新版本在 FrontierCode、DeepSWE、WebDev Arena、AutomationBench 等编程与 Agent 关键基准上大幅提升，同时把入门价格砍到 3.6 Flash 的一半（每百万 token 输入 0.75 美元、输出 3.75 美元），并原生支持三档可调思考深度（thinking level）。本文基于 Google DeepMind 官方模型卡、Google 官方博客、Google AI for Developers 文档以及 SiliconANGLE、dig.watch 等信源，拆解 Gemini 3.7 Flash 的架构定位、关键基准数据、思考深度机制与工具生态，并给出从 3.6 Flash 迁移和实际调用的代码示例。'
---

# Gemini 3.7 Flash 发布：三周一迭代，编程与 Agent 能力大涨的同时价格砍半

2026 年 8 月 13 日，Google 正式发布了 Gemini 3 系列的最新一代"工作模型"——Gemini 3.7 Flash。距离上一代 Gemini 3.6 Flash 发布还不到三周，这个节奏本身就是一个值得注意的信号：Google 把 Flash 这条产品线的迭代周期压缩到了近乎"月更"的速度。官方将 Gemini 3.7 Flash 定位为"迄今为止最智能的工作模型"（our most intelligent workhorse model yet），主打编程、Agent 工作流与知识密集型任务，在 FrontierCode、DeepSWE、WebDev Arena 等和开发者强相关的基准上都有两位数百分比的提升，同时把入门期 API 价格直接砍到上一代的一半。对于每天在用大模型写代码、跑 Agent、做长文档处理的开发者来说，这是一次"既提能力又降价"的双重利好，也是观察 Google 如何在 Gemini 3 家族内部做梯度定位的一个好样本。

## 一、背景：为什么是"三周一迭代"，Flash 在 Gemini 3 家族里是什么角色

Gemini 3 家族目前呈现出清晰的三层结构：面向深度推理的 Pro 系列、追求极致吞吐与低成本的 Flash-Lite 系列，以及介于两者之间、作为"主力工作模型"的 Flash 系列。按照 Google AI for Developers 文档的表述，Gemini 3.7 Flash 的定位是"连接深度推理的 Pro 模型与高吞吐的 Flash-Lite 模型之间的桥梁"，目标是在保持高 token 效率的同时，具备处理多步骤、多模态任务的能力——这正是 Agent 场景最需要的组合：既要足够聪明，又不能贵到没法大规模跑。

这次发布的背景也和整个行业的竞争节奏有关。就在 Gemini 3.7 Flash 发布前后几天，OpenAI 刚刚因为下一代模型 Astra 的网络安全能力可能触及"Critical"红线而选择暂停发布（本站 8 月 11 日文章已详细拆解），DeepSeek 也在 8 月 12 日把 V4 Pro 推到了正式版。在这样的节奏下，Google 选择用一次小版本、高频率的迭代去持续压制"编程 + Agent"这个开发者最敏感的场景，而不是憋一个大版本——这本身就是一种产品策略上的表态：与其等半年发一次"炸场"的旗舰，不如三周一次地把编程和 Agent 基准往上顶一截，同时用价格战巩固开发者心智。Google 官方也明确说这次更新"源于开发者反馈和核心推理能力的算法改进"，说明这更像一次听取一线开发者痛点后的针对性打磨，而非架构层面的重做。

## 二、技术细节解析

### 1. 基础规格：不变的骨架，调优的推理

Gemini 3.7 Flash 依然是基于 Transformer 的混合专家（Mixture-of-Experts）架构，和 3.6 Flash 保持一致，官方没有对外公布参数规模。核心变化在"算法层面对核心推理基础的改进"（algorithmic improvements to its core reasoning foundation）——也就是说，这次提升更多来自训练方法和推理策略的优化，而不是简单地堆参数或堆数据。

关键规格如下：

- **上下文窗口**：输入 1,048,576 token（约 100 万 token），输出上限 65,536 token；
- **支持输入模态**：文本、图像、视频、音频、PDF；
- **支持输出**：仅文本；
- **模型 ID**：`gemini-3.7-flash`；
- **知识截止**：官方模型卡标注为 2026 年 3 月（部分领域为 2025 年 1 月）；
- **不支持**：音频生成、图像生成、Live API。

### 2. 三档可调思考深度（Thinking Level）

Gemini 3.7 Flash 延续了 Gemini 3 系列的"可调思考深度"机制，支持 `low`、`medium`、`high` 三档（注意这一代不再支持 `minimal` 档位）。这个参数本质上是在推理时长/成本与答案质量之间做权衡：简单的分类、摘要、格式转换任务可以用 `low` 档快速出结果，压低延迟和花费；而涉及多步骤代码调试、跨文件重构、复杂业务流程编排的 Agent 任务则应该切到 `high` 档，让模型花更多"思考 token"去做链式推理。这也是当前一线大模型厂商的共同趋势——把推理深度做成一个显式可控的旋钮，而不是让开发者在"快而浅"和"慢而准"的多个模型之间做二选一。

### 3. 关键基准：编程与 Agent 能力的具体提升

官方公布的对比数据（Gemini 3.7 Flash vs. Gemini 3.6 Flash）：

| 基准 | 含义 | 3.6 Flash | 3.7 Flash |
|---|---|---|---|
| FrontierCode 1.1 Main | 多语言编程任务，含 bug 修复与代码规范符合度 | 34.4% | 43.6% |
| DeepSWE v1.1 | 软件工程 Agent 端到端任务完成率 | 49.0% | 65.3% |
| WebDev Arena（Elo） | 前端/Web 应用生成的人类偏好评分 | 1538 | 1588 |
| GDP.pdf | 长文档/商业文档理解 | 22.0% | 34.0% |
| AutomationBench | 私有测试集上的业务流程自动化能力 | 17.0% | 30.4% |
| Terminal-bench 2.1 | 终端环境下的 Agent 任务执行 | — | 85.8% |

其中 DeepSWE v1.1 从 49% 跳到 65.3%，是这次更新里最亮眼的一项——这个基准衡量的是模型在真实软件工程场景里独立完成任务的能力（读代码、定位问题、写补丁、跑测试），16.3 个百分点的提升意味着"少人工介入、少来回重试"的 Agent 体验有实质性改善。SiliconANGLE 的报道也提到，在涵盖九项评测的横向对比中，Gemini 3.7 Flash 的表现整体优于 Anthropic 和 OpenAI 的同价位可比模型；GDP.pdf 商业文档基准上，3.7 Flash 比 Claude Sonnet 5 高 6 个百分点、比 GPT-5.6 Terra 高 9.3 个百分点。需要提醒的是，跨厂商基准对比通常由发布方自行给出测试条件，实际选型时建议在自己的业务数据上跑一遍再下结论。

Google 产品高级总监 Tulsee Doshi 在发布时的表述也印证了这个方向：新模型"能更好地适应任务中的障碍、在需要时主动澄清意图、更忠实地遵循指令"，这些描述指向的都是 Agent 循环里"少犯错、少绕弯路"的可靠性提升，而不只是单点能力分数的提高。

### 4. 价格：入门期直接砍半

这次发布另一个对开发者钱包最直接的变化是定价。Gemini 3.7 Flash 的入门价（截至 2026 年 12 月 31 日有效）为：

- 输入：每百万 token **0.75 美元**
- 输出：每百万 token **3.75 美元**

这是 Gemini 3.6 Flash 价格的一半，2027 年 1 月 1 日起会涨回 1.50/7.50 美元每百万 token。对于需要跑批量 Agent 任务、长上下文文档处理的团队来说，趁着这个价格窗口迁移是相当划算的选择——尤其考虑到能力还同步在提升，属于"既降价又提质"的少见组合。

### 5. 接入方式与工具生态

Gemini 3.7 Flash 已经全面接入 Google 的开发者与企业工具链：面向开发者可以通过 Google AI Studio、Android Studio、Google Antigravity（Google 的 Agent 开发环境）直接调用；面向企业客户接入 Gemini Enterprise Agent Platform；面向消费者则通过 Gemini Spark（Pro/Ultra 订阅用户，已覆盖 160 多个国家/地区）间接使用，支持联网浏览和 Google 服务集成。API 层面支持的能力包括：缓存（caching）、代码执行、Computer Use（预览版）、文件搜索、函数调用（function calling）、搜索关联（search grounding）、结构化输出、URL 上下文，以及 Google 地图关联（Google Maps grounding），并提供 Batch API、Flex 推理和 Priority 推理几种调用模式。

## 三、实践指南：从 3.6 Flash 迁移与调用示例

如果你已经在用 `gemini-3.6-flash`，迁移到 3.7 Flash 通常只需要改一行模型 ID，逻辑不需要大改。以下是用 Python 官方 SDK（`google-genai`）调用的示例，演示如何设置思考深度并做一次典型的代码调试类 Agent 请求：

```python
from google import genai
from google.genai import types

client = genai.Client(api_key="YOUR_API_KEY")

response = client.models.generate_content(
    model="gemini-3.7-flash",
    contents=[
        "下面这段 Python 代码在并发写入时会出现数据丢失，"
        "请定位问题、给出修复后的完整代码，并解释根因：\n\n"
        "<粘贴你的代码>"
    ],
    config=types.GenerateContentConfig(
        # 复杂调试/多步骤 Agent 任务用 high，
        # 简单摘要、格式转换等用 low 以降低延迟和成本
        thinking_config=types.ThinkingConfig(thinking_level="high"),
        tools=[types.Tool(code_execution=types.ToolCodeExecution())],
    ),
)

print(response.text)
```

几点实践建议：

1. **按任务复杂度分档使用 thinking_level**：批量处理简单文本任务时统一用 `low` 能显著压低成本；只在真正需要多步推理的 Agent 环节切到 `high`，避免"高射炮打蚊子"。
2. **利用 100 万 token 上下文做整仓库级别的代码理解**：结合 FrontierCode 和 DeepSWE 的提升幅度，Gemini 3.7 Flash 更适合直接喂入整个项目的关键文件做跨文件重构和缺陷定位，而不是逐文件切片喂入。
3. **趁价格窗口期做压测和成本核算**：0.75/3.75 美元每百万 token 的价格会持续到 2026 年底，如果你的应用有稳定的月度调用量，现在是把 Agent 流水线迁移过来、顺便做一次真实成本核算的好时机。
4. **Computer Use 仍是预览功能**：如果计划用它做浏览器/桌面自动化类 Agent，建议先在非生产环境验证稳定性和权限边界，官方明确标注该能力还在 preview 阶段。
5. **安全边界**：官方模型卡说明 Gemini 3.7 Flash 在 CBRN、网络安全等前沿安全维度均未触及 critical 能力等级，这意味着它仍然是一个可以放心用于生产 Agent 场景的"常规安全等级"模型，但涉及高权限工具调用（如自动执行 shell 命令、发起真实交易）时，仍建议按最小权限原则做沙箱隔离。

## 四、总结与展望

Gemini 3.7 Flash 这次发布最值得关注的不是某一项基准分数的绝对高低，而是它所代表的节奏和策略：三周一次的高频迭代、明确聚焦编程与 Agent 场景的能力打磨、以及用价格砍半去抢占开发者心智——这套组合拳背后是 Google 在"中间价位、主力工作模型"这个赛道上的强势布局。结合 OpenAI Astra 因安全评估被按下暂停键、DeepSeek V4 Pro 正式版涨价的同期动态，可以看到 2026 年 8 月这几周的大模型竞争已经从单纯的"参数堆量"转向了更细分的维度：谁能在编程和 Agent 这类高频刚需场景里做到"又快又准又便宜"，谁就能在开发者生态里占住位置。对于国内的开发者和团队来说，如果你的产品里有代码生成、自动化测试、长文档处理或者浏览器/桌面 Agent 这类场景，值得在接下来几个月里把 Gemini 3.7 Flash 纳入选型对比，尤其是利用好这段价格窗口期做一次真实成本和效果的双重验证。

## 参考来源

- [Gemini 3.7 Flash - Model Card — Google DeepMind](https://deepmind.google/models/model-cards/gemini-3-7-flash/)
- [Gemini 3.7 Flash: our most intelligent workhorse model — Google 官方博客](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-3-7-flash/)
- [Gemini 3.7 Flash | Gemini API | Google AI for Developers](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash)
- [Google launches Gemini 3.7 Flash for coding, AI agent projects - SiliconANGLE](https://siliconangle.com/2026/08/13/google-launches-gemini-3-7-flash-coding-ai-agent-projects/)
- [Google launches Gemini 3.7 Flash for coding and AI agents - Digital Watch Observatory](https://dig.watch/updates/google-gemini-3-7-flash-stronger-coding-agent)
