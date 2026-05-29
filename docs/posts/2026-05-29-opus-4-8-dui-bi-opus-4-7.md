---
title: 'Opus 4.8 对比 Opus 4.7：一次「克制但扎实」的旗舰升级'
date: 2026-05-29
slug: 'opus-4-8-dui-bi-opus-4-7'
description: '2026 年 5 月 28 日 Anthropic 发布 Claude Opus 4.8，距上一代 Opus 4.7 仅六周。本文结合官方公告、第三方榜单、社区讨论与头部博主的实测，系统对比两代旗舰在代码可靠性、Agentic 工具使用、诚实度与对齐、Fast 模式、长上下文等维度的差异，附 SWE-bench / Terminal-Bench 等关键跑分对照，并给出是否值得升级的建议。'
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

官方自己给 4.8 的定调很有意思，没有用「革命」「飞跃」这类词，而是说它是「**a modest but tangible improvement on its predecessor**」(对前代一次克制但实在的改进)。这篇文章就顺着这个定调，结合**官方公告、第三方榜单、社区讨论和头部博主的实测**，把 4.8 相比 4.7 到底升级了什么讲清楚，并回答最实际的问题:**该不该升级**。

> 写在前面:本文的跑分与特性来自 Anthropic 官方公告、Artificial Analysis、Vellum、VentureBeat、9to5Mac、Simon Willison 等公开来源(文末附链接)。不同来源个别数字略有出入,已尽量取可交叉验证的版本;无法核实的地方会明确标注。

## 一分钟速览

- **定位**:Opus 4.8 是当前旗舰,直接替代 Opus 4.7,**价格不变**($5 / $25 每百万 input / output token)。
- **跑分**:小步快跑而非碾压。SWE-bench Verified 从 87.6% → **88.6%**;真正拉开差距的是 Agentic / 长任务类指标。
- **最大卖点**:① 代码更可靠(放过代码缺陷的概率约为 4.7 的 **1/4**);② **Fast 模式**速度 2.5×、比上代 Fast 便宜约 3×;③ 更「诚实」、更敢于暴露不确定性、能独立干更久的活;④ 新增 **Dynamic Workflows**(数百子 Agent 并行,研究预览)。
- **结论**:个人用户和 Agent / 生产流水线**建议直接升**——同价、更稳、更快,几乎无痛。

## 一、先把版本谱系捋清楚

Opus 这条线最近半年的迭代:

| 版本 | 发布时间 | 关键变化 |
| --- | --- | --- |
| Opus 4.5 | 2025-11-01 | SWE-bench Verified 80.9%;引入 **effort 参数**(low/medium/high/max) |
| Opus 4.6 | 2026-02-05 | 首个 **1M 上下文** Opus(beta);自适应思考、上下文压缩、Claude Code 的 Agent 团队 |
| Opus 4.7 | 2026-04-16 | SWE-bench Verified 跃升至 **87.6%**;新分词器、图像分辨率 3×、新增 `xhigh` effort 档 |
| **Opus 4.8** | **2026-05-28** | 代码可靠性、Agentic、诚实度全面打磨;**Fast 模式提速降价**;**Dynamic Workflows** |

可以看到一条清晰的主线:**4.5 打基础(effort)、4.6 上长上下文、4.7 冲编码榜单、4.8 补可靠性与工程化**。4.8 不是为了刷榜,而是把前几代攒下的能力「调稳、调快、调省」。

## 二、跑分对比:小步,但每一步都踩实

把官方和第三方榜单对齐后,4.7 → 4.8 的核心指标如下(同一基准、可交叉验证的口径):

| 基准 | 含义 | Opus 4.7 | Opus 4.8 |
| --- | --- | --- | --- |
| SWE-bench Verified | 真实 GitHub issue 修复 | 87.6% | **88.6%** |
| SWE-bench Pro / Agentic Coding | 更难的真实工程任务 | 64.3% | **69.2%** |
| Terminal-Bench 2.1 | 终端 / 命令行 Agent | 66.1% | **74.6%** |
| 多学科推理 + 工具 | 跨领域带工具推理 | 54.7% | **57.9%** |
| OSWorld-Verified | 电脑操作 Agent | 82.8% | **83.4%** |
| Online-Mind2Web | 浏览器 Agent | — | **84%** |

读这张表的正确姿势:

1. **纯知识 / 单轮编码(SWE-bench Verified)只涨了 1 个点**——说明在「一问一答」式任务上,4.7 已经接近这一代架构的天花板。
2. **越是「长链路、多步、带工具」的任务,涨幅越大**:Agentic Coding +4.9、Terminal-Bench +8.5。这正是 4.8 发力的方向——**不是答得更准,而是干得更久、更稳**。

作为纵向参照,SWE-bench Verified 这条线一年内的爬升是:Opus 4.5 **80.9%** → Opus 4.7 **87.6%** → Opus 4.8 **88.6%**。而 Anthropic 已经在公告里预告了下一代 **Mythos 级模型**,其预览版在该基准上已摸到 **93.9%**——4.8 更像是 Mythos 登场前的「最后一块拼图」。

> 注意:第三方榜单(如 BenchLM)给出的综合排名是 4.8 以 93:85 领先 4.7;Artificial Analysis 上 Opus 4.7(自适应推理/max effort)的 Intelligence Index 为 57,位列第 4。这类综合分会随评测口径波动,看个趋势即可,别太较真绝对值。

## 三、五个真正影响体感的升级

### 1. 代码可靠性:更少「悄悄放过」的坑

这是 4.8 最被反复强调的一点。官方说法是:Opus 4.8「**比前代放过代码缺陷的概率低约 4 倍**(four times less likely to allow flaws in code to pass unremarked)」。

对天天用 Claude 写代码、做 code review 的人,这条比任何跑分都实在:

- 它更**愿意指出**自己改动里的可疑点,而不是一路「看起来没问题」糊过去;
- 在 review 别人代码时,漏检率明显下降;
- 配合后面要讲的「诚实度」提升,**减少了那种自信满满但其实跑不通的提交**。

### 2. Agentic 与工具使用:能独立干更久的活

4.8 主打「**sharper judgement, more honesty about its progress, and the ability to work independently for longer**」(判断更准、对进度更诚实、能独立工作更久)。

落到指标上就是上面那张表里 Terminal-Bench、SWE-bench Pro、OSWorld 的集体上扬。落到体感上:

- 长任务中途「跑偏」「忘了目标」的概率更低;
- 工具调用参数更准,返工更少(这条从 4.7 就在改,4.6→4.7 官方称工具调用错误降到 1/3,4.8 继续);
- 在 Super-Agent 这类端到端 Agent 基准上,4.8 是**唯一能把每个 case 都跑完**的模型。

配套还放出了一个重磅预览功能 **Dynamic Workflows**:在 Claude Code 里,Claude 可以先做规划,然后在**一次会话里拉起数百个并行子 Agent** 协同完成大任务。这是把「Agent 团队」从概念推向规模化的一步,目前是 research preview。

### 3. 诚实度与对齐:向「Mythos 级」看齐

VentureBeat 给 4.8 的标题直接点名「**near-Mythos level alignment**」(接近 Mythos 级的对齐水平)。早期测试者的普遍反馈是:

- 4.8 **更敢于暴露不确定性**,更少给出没有依据的断言(less likely to make unsupported claims);
- 对自己「做到哪了、哪里没把握」更**坦诚**;
- 谄媚(sycophancy)和「假装完成」的倾向下降。

对于把模型放进自动化流程的人,「**会说自己不确定**」往往比「永远很自信」更有价值——它让你知道什么时候该接管。

### 4. Fast 模式:2.5× 速度,还更便宜

Opus 4.8 的 **Fast 模式**做了实打实的优化:

- 速度约 **2.5×**;
- 比上一代的 Fast 模式**便宜约 3 倍**;
- 它仍然跑的是 **Opus 本体,不会偷偷降级成小模型**——只是输出更快;
- 在 Claude Code 里用 `/fast` 一键开关,Opus 4.8 / 4.7 / 4.6 都支持。

需要说明的是,Fast 模式相对标准定价仍有溢价(有来源给出约 $10 / $50 每百万 token 的档位),但相比过去「要快就得多掏很多钱」,这一代的性价比改善非常明显——交互式编码、快速问答这类场景体验立竿见影。

另一个容易被忽略但很贴心的默认值变化:**4.8 在所有入口(API、Claude Code)默认 effort = high**。官方说在编码任务上,high effort 花的 token 量和 4.7 的默认档差不多,但效果更好;需要时还能往上调到 `extra` / `max`,用更多 token 换更高质量。

### 5. 长上下文与 API 工程化

- **1M 上下文**自 4.6 起就是 Opus 的标配,4.8 延续。超长输入下的检索准确度和注意力分配从 4.6 的「质变」(MRCR 8-needle 1M 变体 76%)一路打磨到现在,长文档、跨多文件代码理解时「丢细节」更少。
- **Messages API 新增「会话中途插入 system 消息」**:可以在任务进行到一半时更新给 Claude 的指令,而**不破坏 prompt cache**。对做长 Agent 链路、需要动态改系统提示的开发者很实用。

## 四、价格与性价比

| 项 | Opus 4.7 | Opus 4.8 |
| --- | --- | --- |
| 标准定价(input / output) | $5 / $25 每百万 token | **$5 / $25**(不变) |
| Prompt 缓存 | 命中可省最多 90% | 同样最多省 90% |
| 批处理 | 省 50% | 省 50% |
| Fast 模式 | 有,但更贵 | **2.5× 速度,比上代 Fast 便宜约 3×** |

一句话:**同价拿到更强、更快的模型**。对已经在用 4.7 的人,这是教科书级的「无脑升级」场景——除非你的工作流深度依赖某个对 4.7 调过的提示词(见下)。

## 五、迁移注意事项

升级不是完全零成本,几个点提前知道能少踩坑:

1. **effort 默认变 high**:如果你的成本预算是按 4.7 的默认档算的,要留意 token 消耗的变化(官方称编码任务下持平,但其它任务不一定)。
2. **提示词可能需要微调**:从 4.7 开始,模型对指令的解读更「**字面化**」,Anthropic 明确建议重新调一遍既有 prompt。4.8 延续这一风格。
3. **分词器与 token 计数**:4.7 换过分词器,相同内容 token 数约为旧版的 1.0–1.35×(系统提示、尤其高分辨率图像更明显)。从 4.7 升 4.8 这块影响不大,但若你是从 4.6 及更早一步到位,要重新核算预算。
4. **Dynamic Workflows 是预览**:别在生产关键路径上直接依赖,先小范围试。

## 六、社区与博主怎么看

- **官方定调**克制——「modest but tangible」,没有过度营销,这本身赢得了一波好感。
- **Simon Willison**(每代必测的独立博主)照例跑了他的「鹈鹕骑自行车 SVG」梗图测试,并重点关注分词器与定价变化;他对这类「小版本」一贯的态度是「**看实测、别看发布会**」。
- **VentureBeat** 的角度是性价比与对齐:标题就突出「**3× 更便宜的 Fast 模式 + 接近 Mythos 的对齐**」。
- **officechai 等媒体**强调 4.8 在多项基准上**同时压过 Opus 4.7 与 GPT-5.5**,但也承认「是台阶,不是飞跃」。
- **Axios / Gizmodo** 则更关注 Anthropic 借 4.8 **预告 Mythos 级模型**,把它读成「下一代登场前的铺垫」。
- 社区(r/ClaudeAI 等)早期讨论的高频词:**更稳、更敢说不确定、Fast 模式真香**;也有用户提醒**提示词要重调**、Dynamic Workflows 目前更像 demo。

> 国内媒体与 up 主的深度实测在发布初期还在陆续放出,本文会在拿到更多一手中文评测后补充。整体口径与英文社区一致:**渐进、稳健、工程友好**。

## 七、该不该升级?

- **个人日常使用**:直接上 4.8。同价、更快(Fast 模式)、更稳,体验提升立竿见影。
- **Agent / 生产流水线**:**强烈建议**。代码可靠性 4×、长任务完成度、诚实度这三项叠加,会显著降低「自动化跑着跑着翻车」的踩坑成本。升级前按上面的「迁移注意」过一遍提示词和预算即可。
- **成本极度敏感 + 任务简单**:如果只是简单问答,**Sonnet 4.6**(性能接近去年的 Opus 4.5、价格 $3 / $15)往往更划算;Opus 这条线留给真正吃推理和长链路的活。

## 小结

Opus 4.7 → 4.8 不是一次颠覆式换代,而是一次**扎实的工程打磨**:把原本就强的能力做得**更可靠、更快、更省、更诚实**。在「越长、越多步、越像真人协作」的任务上,它的进步最明显——这恰恰是 AI 从「聊天工具」走向「干活的同事」最关键的那部分能力。

再加上同价、Fast 模式的提速降价、以及 Dynamic Workflows 的想象空间,对把 Claude 当生产力工具的人来说,**这次升级几乎没有理由犹豫**。而 Anthropic 已经把 Mythos 摆上了台面——4.8,很可能是这一代架构临别前最成熟的一版。

---

## 参考资料

- Anthropic 官方公告:[Introducing Claude Opus 4.8](https://www.anthropic.com/news/claude-opus-4-8) ·[Introducing Claude Opus 4.7](https://www.anthropic.com/news/claude-opus-4-7)
- 官方文档:[What's new in Claude Opus 4.8](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-8) ·[Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [VentureBeat — Claude Opus 4.8 is here with 3X cheaper fast mode and near-Mythos level alignment](https://venturebeat.com/technology/anthropics-claude-opus-4-8-is-here-with-3x-cheaper-fast-mode-and-near-mythos-level-alignment)
- [TechCrunch — Anthropic releases Opus 4.8 with new 'dynamic workflow' tool](https://techcrunch.com/2026/05/28/anthropic-releases-opus-4-8-with-new-dynamic-workflow-tool/)
- [9to5Mac — Anthropic upgrades Claude with new Opus 4.8 model](https://9to5mac.com/2026/05/28/anthropic-upgrades-claude-with-new-opus-4-8-model-heres-whats-new/)
- [officechai — Claude Opus 4.8 Beats Opus 4.7, GPT-5.5 On Many Benchmarks](https://officechai.com/ai/claude-opus-4-8-benchmarks/)
- [Vellum — Claude Opus 4.7 Benchmarks Explained](https://www.vellum.ai/blog/claude-opus-4-7-benchmarks-explained)
- [Artificial Analysis — Claude Opus 4.7](https://artificialanalysis.ai/models/claude-opus-4-7)
- [Simon Willison's blog — Claude tag](https://simonwillison.net/tags/claude/)
