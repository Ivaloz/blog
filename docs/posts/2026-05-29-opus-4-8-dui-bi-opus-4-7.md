---
title: 'Opus 4.8 对比 Opus 4.7：一次「克制但扎实」的旗舰升级'
date: 2026-05-29
slug: 'opus-4-8-dui-bi-opus-4-7'
description: '2026 年 5 月 28 日 Anthropic 发布 Claude Opus 4.8，距上一代 Opus 4.7 仅六周。本文结合官方公告与文档、第三方榜单、中英文社区讨论与头部博主实测，系统对比两代旗舰在代码可靠性、Agentic 工具使用、诚实度与对齐、Fast 模式、长上下文等维度的差异，附 SWE-bench / Terminal-Bench / GDPval 等关键跑分对照，复盘 4.7 发布时「全网差评」的长上下文回退风波，并给出是否值得升级与迁移注意事项。'
author: 范伟彬
tags:
  - Claude
  - Opus 4.8
  - Opus 4.7
  - Anthropic
  - 大模型
  - AI 编程
  - Claude Code
  - SWE-bench
  - Agent
source: AI
categories:
  - AI
  - 大模型
---

# Opus 4.8 对比 Opus 4.7：一次「克制但扎实」的旗舰升级

2026 年 5 月 28 日，Anthropic 发布了 **Claude Opus 4.8**。距离上一代旗舰 Opus 4.7（4 月 16 日）只过去了**六周**——这家公司把模型迭代节奏拉到了前所未有的密度。

官方给 4.8 的定调很克制，没有用「革命」「飞跃」这类词，而是说它是「**a modest but tangible improvement on its predecessor**」(对前代一次克制但实在的改进)。独立博主 Simon Willison 专门点赞了这种坦诚:「so refreshing」——一家实验室肯老老实实说「这次只是小改进」，本身就难得。

这篇文章就顺着这个定调，结合**官方公告与文档、第三方榜单、中英文社区讨论和头部博主的实测**，把 4.8 相比 4.7 到底升级了什么讲清楚。其中有一条容易被忽略但很关键的暗线:**Opus 4.7 当初是带着争议上线的**，而 4.8 很大程度上是来「擦屁股 + 打磨」的。

> 数据来源:Anthropic 官方公告与开发者文档、Artificial Analysis、Vellum、VentureBeat、9to5Mac、The New Stack、Simon Willison 博客,以及 36 氪、新浪/网易科技、知乎、LINUX DO 等中文社区(文末附链接)。不同来源个别数字略有出入,已尽量取可交叉验证的版本;无法核实处会明确标注。

## 一分钟速览

- **定位**:Opus 4.8 是当前旗舰,直接替代 Opus 4.7,**标准价格不变**($5 / $25 每百万 input / output token)。
- **跑分**:小步快跑而非碾压。SWE-bench Verified 87.6% → **88.6%**;真正拉开差距的是 Agentic / 长任务 / 知识工作类指标。
- **三大卖点**:① 代码更可靠(放过代码缺陷的概率约为 4.7 的 **1/4**);② **Fast 模式**提速 2.5×、价格从 $30/$150 砍到 **$15/$75**;③ **修好了 4.7 的长上下文回退**——长任务更稳。
- **彩蛋**:新增 **Dynamic Workflows**(数百子 Agent 并行,研究预览)、会话中途插入 system 消息、effort 默认 high。
- **结论**:个人用户和 Agent / 生产流水线**建议直接升**——同价、更稳、更快;尤其是被 4.7 长上下文坑过的人。

## 一、先把版本谱系与「4.7 风波」捋清楚

Opus 这条线最近半年的迭代:

| 版本 | 发布时间 | 关键变化 |
| --- | --- | --- |
| Opus 4.5 | 2025-11-01 | SWE-bench Verified 80.9%;引入 **effort 参数**(low/medium/high/max) |
| Opus 4.6 | 2026-02-05 | 首个 **1M 上下文** Opus(beta);自适应思考、上下文压缩、Claude Code 的 Agent 团队 |
| Opus 4.7 | 2026-04-16 | 编码榜单跃升(SWE-bench Verified **87.6%**);新分词器、图像分辨率 3×、新增 `xhigh` effort 档——**但长上下文出现回退,口碑翻车** |
| **Opus 4.8** | **2026-05-28** | 代码可靠性、Agentic、诚实度全面打磨;**Fast 模式提速降价**;**修复长上下文**;**Dynamic Workflows** |

这里要单独说说 **Opus 4.7 的争议**,因为它直接解释了 4.8 为什么这么快、改了什么。

4.7 在编码榜单上确实亮眼(SWE-bench Pro 从 4.6 的 53.4% 飙到 64.3%,视觉推理 CharXiv 从 69.1% 跳到 82.1%),但**长上下文检索出现了明显倒退**。据 36 氪等中文媒体报道,4.7 在 1M 上下文下的检索准确率「从 4.6 的 78.3% 断崖式跌到 32.2%」,一度被 GPT-5.4、Gemini 3.1 Pro 反超;36 氪的标题相当直白——**「Claude Opus 4.7,全网差评,刚升级就翻车,用户怒斥:还我 4.6」**。Vellum 的横评也点出 4.7 在 BrowseComp 网页检索上是「the one clear regression」(从 4.6 的 83.7% 降到 79.3%)。

> 这个数字(78.3%→32.2%)来自中文媒体转述,本文未能找到 Anthropic 官方口径,**仅供参考**;但「4.7 长上下文体验回退、社区不满」这件事是中英文社区共识。

理解了这条暗线,4.8 的定位就清楚了:**它不只是「再强一点」,更是来修 4.7 留下的坑、把这一代架构的能力调稳的收尾之作。**

## 二、跑分对比:小步,但每一步都踩实

把官方和第三方榜单对齐后,4.7 → 4.8 的核心指标如下(同一基准、可交叉验证的口径):

| 基准 | 含义 | Opus 4.7 | Opus 4.8 |
| --- | --- | --- | --- |
| SWE-bench Verified | 真实 GitHub issue 修复 | 87.6% | **88.6%** |
| SWE-bench Pro / Agentic Coding | 更难的真实工程任务 | 64.3% | **69.2%** |
| Terminal-Bench 2.1 | 终端 / 命令行 Agent | 66.1% | **74.6%** |
| 多学科推理 + 工具(HLE) | 跨领域带工具推理 | 54.7% | **57.9%** |
| OSWorld-Verified | 电脑操作 Agent | 82.8% | **83.4%** |
| GDPval-AA | 知识工作(Elo 式综合) | 1753 | **1890** |
| Finance Agent v2 | 金融分析 Agent | — | **53.9%** |
| Online-Mind2Web | 浏览器 Agent | — | **84%** |

读这张表的正确姿势:

1. **纯单轮编码(SWE-bench Verified)只涨 1 个点**——4.7 已接近这代架构在「一问一答」上的天花板。
2. **越是「长链路、多步、带工具」的任务,涨幅越大**:Agentic Coding +4.9、Terminal-Bench +8.5、知识工作 +137(Elo)。这正是 4.8 发力的方向——**不是答得更准,而是干得更久、更稳**。
3. **不是全面碾压**:在 Terminal-Bench 2.1 上,GPT-5.5(78.2%)仍小幅领先 Opus 4.8(74.6%)。officechai 的结论很中肯——「a step up rather than a leap」(是台阶,不是飞跃)。

纵向看,SWE-bench Verified 一年内的爬升是:Opus 4.5 **80.9%** → 4.7 **87.6%** → 4.8 **88.6%**。而 Anthropic 已在公告里预告下一代 **Mythos 级模型**,其预览版在该基准上已摸到 **93.9%**——4.8 更像是 Mythos 登场前的「最后一块拼图」。

## 三、五个真正影响体感的升级

### 1. 代码可靠性:更少「悄悄放过」的坑

这是 4.8 最被反复强调的点。官方说法:Opus 4.8「**比前代放过自己写的代码缺陷的概率低约 4 倍**」(four times less likely to allow flaws in code it has written to pass unremarked)。

有意思的是**它是怎么做到的**——Simon Willison 引用系统卡指出,4.8 主要靠「**对没把握的问题选择不答(abstaining)**」来实现这一点。也就是说,可靠性的提升不是凭空变聪明,而是**学会了「不确定就别硬上」**。对天天用 Claude 写代码、做 review 的人,这条比任何跑分都实在:

- 它更**愿意指出**自己改动里的可疑点,而不是一路「看起来没问题」糊过去;
- review 别人代码时漏检率下降;
- **减少了那种自信满满但其实跑不通的提交**。

### 2. Agentic 与工具使用:能独立干更久的活

4.8 主打「**sharper judgement, more honesty about its progress, and the ability to work independently for longer**」(判断更准、对进度更诚实、能独立工作更久)。落到指标上就是上表里 Terminal-Bench、SWE-bench Pro 的集体上扬;落到体感上:

- **工具触发更准**:官方明确 4.7 有用户反馈「该调工具时漏调」,4.8 修了这个;
- 长任务中途「跑偏 / 忘目标」的概率更低;
- 在 Super-Agent 这类端到端基准上,4.8 是**唯一能把每个 case 都跑完**的模型。

配套放出了重磅预览功能 **Dynamic Workflows**:在 Claude Code 里 Claude 可以先做规划,再在**一次会话里拉起数百个并行子 Agent** 协同完成大任务。这是把「Agent 团队」从概念推向规模化的一步,目前是 research preview——**别急着上生产关键路径**。

### 3. 长上下文:把 4.7 的回退修回来

针对前面说的 4.7 长上下文翻车,官方文档明确 4.8 的改进方向是「**更好的长上下文处理、更少 compaction(上下文压缩)、compaction 之后恢复更好**」,长 Agent 轨迹「在压缩后仍能保持在任务上,更少跑偏」。

- **1M 上下文**自 4.6 起是 Opus 标配,4.8 在 API / Bedrock / Vertex 上**默认开启 1M**(Microsoft Foundry 为 200k),最大输出 128k token。
- 对被 4.7 长文档 / 跨多文件代码理解坑过的人,这是 4.8 **最该升级的理由之一**。

### 4. Fast 模式:2.5× 速度,价格腰斩

Opus 4.8 的 **Fast 模式**做了实打实的优化:

- 速度约 **2.5×**(同一个模型,只是吐字更快,**不会降级成小模型**);
- 价格从上一代 Fast 的 **$30 / $150** 砍到 **$15 / $75**(每百万 input / output token)——官方口径是「比上代便宜约 3 倍」,按 Simon Willison 实测的档位是直接腰斩;
- 目前在 Claude API 上是 **research preview**,设 `speed: "fast"` 开启;Claude Code 里可用 `/fast` 一键开关(Opus 4.8 / 4.7 / 4.6 都支持)。

注意 Fast 仍是相对标准价($5/$25)的**溢价档**(贵 3 倍),但相比过去「要快就得多掏很多钱」,这代性价比改善非常明显。

另一个贴心的默认值变化:**4.8 在所有入口(API、Claude Code)默认 effort = high**。官方说编码任务下 high effort 花的 token 量和 4.7 默认档差不多,但效果更好;需要时还能往上调 `xhigh` / `max`,用更多 token 换质量。配合 **adaptive thinking**(只在判断需要时才思考),4.8 在简单任务上比 4.7「同 effort 档少浪费思考 token」。

### 5. API 工程化:几个让开发者省心的小改动

- **会话中途插入 system 消息**:可以在长会话进行到一半时更新系统指令,而**不破坏 prompt cache**、不必重述整段提示词——对长 Agent 链路特别实用。
- **Prompt 缓存门槛下调**:最小可缓存提示长度从 4.7 降到 **1,024 token**,以前太短缓存不了的提示现在也能缓存,零改动省钱。
- **Refusal stop details**:拒答响应带上「拒绝类别」,方便应用分流处理。
- **继承自 4.7 的约束**:不支持 `temperature` / `top_p` / `top_k`(设了报 400);只支持 adaptive thinking,不支持显式 thinking budget——从 4.7 升 4.8 这些**无需改代码**。

## 四、价格与性价比

| 项 | Opus 4.7 | Opus 4.8 |
| --- | --- | --- |
| 标准定价(input / output) | $5 / $25 每百万 token | **$5 / $25**(不变) |
| Fast 模式 | $30 / $150 | **$15 / $75**(2.5× 速度) |
| Prompt 缓存 | 命中省最多 90%;门槛较高 | 同样省 90%;**门槛降到 1,024 token** |
| 批处理 | 省 50% | 省 50% |

一句话:**标准价不变、Fast 模式价格腰斩、缓存更易命中**——综合用下来,4.8 反而可能更省。

## 五、迁移注意事项

升级不是完全零成本,几个点提前知道能少踩坑:

1. **effort 默认变 high**:若你的成本预算按 4.7 默认档算,留意 token 消耗变化(官方称编码任务持平,其它任务不一定)。
2. **提示词可能要微调**:自 4.7 起模型对指令解读更**字面化**,Anthropic 建议重新调一遍既有 prompt;4.8 延续这一风格,并提供了官方迁移指南。
3. **分词器与 token 计数**:4.7 换过分词器,相同内容 token 数约为旧版 1.0–1.35×(系统提示、尤其高分辨率图像更明显)。4.7→4.8 这块影响不大;若从 4.6 及更早一步到位,要重新核算预算。
4. **Dynamic Workflows / Fast 模式都是预览**:先小范围试,别直接压到生产关键路径。

## 六、社区与博主怎么看

- **官方定调克制**——「modest but tangible」,不过度营销,赢得一波好感。
- **Simon Willison**(每代必测的独立博主)照例跑了招牌的「**鹈鹕骑自行车 SVG**」测试:用五个思考档各画一张,`max` 档效果最好,但单张花了 **43 美分**(25 input + 17,167 output token)——直观展示了「拉满 effort」的性价比代价。他最看重的是**诚实度**和会话中途 system 消息这类工程改进。
- **VentureBeat** 主打性价比与对齐,标题直接是「**3× 更便宜的 Fast 模式 + 接近 Mythos 的对齐**」;Anthropic 称 4.8 在「欺骗 / 配合滥用」这类失配指标上已**与 Mythos 预览版相当**,亲社会指标创新高。
- **The New Stack / 9to5Mac / officechai** 聚焦「effort 控制、Dynamic Workflows、更便宜的 Fast、更诚实更少欺骗」,但都强调「是台阶不是飞跃」。
- **中文社区**:新浪 / 网易科技以「**提升 AI 编程可靠性、减少无依据结论**」为题报道;36 氪关注 Anthropic 借 4.8「**预告 Mythos 级模型**」;知乎、LINUX DO 上已有「opus 4.8 出了,欢迎分享使用体验」「和 GPT-5.5 比如何、有没有修好 4.7 的问题」之类的实测帖陆续冒出——**最关心的正是 4.7 那些坑修好没有**。

整体口径中英文一致:**渐进、稳健、工程友好,且是一次「修 bug + 打磨」式的升级**。

## 七、该不该升级?

- **个人日常使用**:直接上 4.8。同价、更快(Fast 模式)、更稳,体验提升立竿见影。
- **Agent / 生产流水线**:**强烈建议**。代码可靠性 4×、长任务完成度、长上下文修复、诚实度,这几项叠加会显著降低「自动化跑着跑着翻车」的成本。升级前按上面「迁移注意」过一遍提示词和预算即可。
- **被 4.7 长上下文坑过、甚至退回 4.6 的人**:**这就是你等的版本**,可以放心回到 Opus 主线。
- **成本极度敏感 + 任务简单**:简单问答用 **Sonnet 4.6**(性能接近去年的 Opus 4.5、价格 $3 / $15)往往更划算;Opus 这条线留给真正吃推理和长链路的活。

## 小结

Opus 4.7 → 4.8 不是颠覆式换代,而是一次**扎实的工程打磨**:把原本就强的能力做得**更可靠、更快、更省、更诚实**,顺手**修好了 4.7 长上下文翻车的口碑坑**。在「越长、越多步、越像真人协作」的任务上,它的进步最明显——这恰恰是 AI 从「聊天工具」走向「干活的同事」最关键的那部分能力。

再加上标准价不变、Fast 模式价格腰斩、以及 Dynamic Workflows 的想象空间,对把 Claude 当生产力工具的人来说,**这次升级几乎没有理由犹豫**。而 Anthropic 已经把 Mythos 摆上了台面——4.8,很可能是这一代架构临别前最成熟、也最「让人放心」的一版。

---

## 参考资料

**官方**
- [Introducing Claude Opus 4.8 — Anthropic](https://www.anthropic.com/news/claude-opus-4-8) ·[Introducing Claude Opus 4.7](https://www.anthropic.com/news/claude-opus-4-7)
- [What's new in Claude Opus 4.8 — 开发者文档](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-8) ·[Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)

**第三方测评 / 媒体**
- [VentureBeat — 3X cheaper fast mode and near-Mythos level alignment](https://venturebeat.com/technology/anthropics-claude-opus-4-8-is-here-with-3x-cheaper-fast-mode-and-near-mythos-level-alignment)
- [The New Stack — effort controls, dynamic workflows, cheaper fast mode, better honesty](https://thenewstack.io/claude-opus-48-release/)
- [TechCrunch — Opus 4.8 with new 'dynamic workflow' tool](https://techcrunch.com/2026/05/28/anthropic-releases-opus-4-8-with-new-dynamic-workflow-tool/)
- [9to5Mac — what's new in Opus 4.8](https://9to5mac.com/2026/05/28/anthropic-upgrades-claude-with-new-opus-4-8-model-heres-whats-new/)
- [officechai — Opus 4.8 beats Opus 4.7, GPT-5.5 on many benchmarks](https://officechai.com/ai/claude-opus-4-8-benchmarks/)
- [Vellum — Claude Opus 4.7 Benchmarks Explained](https://www.vellum.ai/blog/claude-opus-4-7-benchmarks-explained)
- [Artificial Analysis — Claude Opus 4.7](https://artificialanalysis.ai/models/claude-opus-4-7)

**博主 / 中文社区**
- [Simon Willison's blog — Claude tag](https://simonwillison.net/tags/claude/)
- [36 氪 — Claude Opus 4.7,全网差评,刚升级就翻车](https://36kr.com/p/3770733959496194) ·[Anthropic 三张底牌全翻了,Mythos 1 首次现身](https://36kr.com/p/3823864623992965)
- [新浪科技 — Claude Opus 4.8 上线:提升 AI 编程可靠性,减少无依据结论](https://finance.sina.com.cn/tech/digi/2026-05-29/doc-inhzpfxw8091201.shtml)
- [LINUX DO — Claude Opus 4.8 出了,欢迎分享使用体验](https://linux.do/t/topic/2264692)
