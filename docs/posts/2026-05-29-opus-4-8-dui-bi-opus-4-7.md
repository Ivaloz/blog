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
- **三大卖点**:① 代码更可靠(放过代码缺陷的概率约为 4.7 的 **1/4**);② **Fast 模式**提速 2.5×、价格比上代 Fast 便宜约 **3 倍**;③ **修好了 4.7 的长上下文回退**——长任务更稳。
- **彩蛋**:新增 **Dynamic Workflows**(数百子 Agent 并行,研究预览,可做代码库级迁移)、会话中途插入 system 消息、effort 默认 high。
- **一句话提醒**:它**不是「全面碾压」**。诚实度的提升带来了「过度谨慎、有点冷」的副作用;也有博主表示**数据/战略类任务仍更愿意用 4.7**。
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
3. **不是全面碾压**:在 Terminal-Bench 2.1 上,GPT-5.5(78.2%)仍小幅领先 Opus 4.8(74.6%);GPQA Diamond 甚至有来源显示 4.8(约 93.6%)比 4.7(94.2%)**略降**(单一来源、未必是真实回退,也可能是评测口径变化,**仅供参考**)。officechai 的结论很中肯——「a step up rather than a leap」(是台阶,不是飞跃)。

纵向看,SWE-bench Verified 一年内的爬升是:Opus 4.5 **80.9%** → 4.7 **87.6%** → 4.8 **88.6%**。而 Anthropic 已在公告里预告下一代 **Mythos 级模型**,其预览版在该基准上已摸到 **93.9%**——4.8 更像是 Mythos 登场前的「最后一块拼图」。

## 三、五个真正影响体感的升级

### 1. 代码可靠性:更少「悄悄放过」的坑

这是 4.8 最被反复强调的点。官方说法:Opus 4.8「**比前代放过自己写的代码缺陷的概率低约 4 倍**」(four times less likely to allow flaws in code it has written to pass unremarked)。

有意思的是**它是怎么做到的**——Simon Willison 引用系统卡指出,4.8 主要靠「**对没把握的问题选择不答(abstaining)**」来实现这一点。也就是说,可靠性的提升不是凭空变聪明,而是**学会了「不确定就别硬上」**。对天天用 Claude 写代码、做 review 的人,这条比任何跑分都实在:

- 它更**愿意指出**自己改动里的可疑点,而不是一路「看起来没问题」糊过去;
- review 别人代码时漏检率下降;
- **减少了那种自信满满但其实跑不通的提交**。

桥水基金(Bridgewater,VentureBeat / 网易科技援引)的反馈很具体:4.8 会**主动指出输入和输出里的问题**,而不是把这些坑留给用户自己去发现;那种「我已经实现并测试通过了」、结果一到 PR review 就翻车的情况明显变少。

> 但要注意:这种「诚实」是把双刃剑——见下文第六节的「**代码更诚实了,人类却有点不舒服**」。

### 2. Agentic 与工具使用:能独立干更久的活

4.8 主打「**sharper judgement, more honesty about its progress, and the ability to work independently for longer**」(判断更准、对进度更诚实、能独立工作更久)。落到指标上就是上表里 Terminal-Bench、SWE-bench Pro 的集体上扬;落到体感上:

- **工具触发更准**:官方明确 4.7 有用户反馈「该调工具时漏调」,4.8 修了这个;
- 长任务中途「跑偏 / 忘目标」的概率更低;
- 在 Super-Agent 这类端到端基准上,4.8 是**唯一能把每个 case 都跑完**的模型。

配套放出了重磅预览功能 **Dynamic Workflows**:在 Claude Code 里 Claude 会**动态写出编排脚本**,先做规划,再在一次会话里拉起**数十到数百个并行子 Agent** 协同完成大任务。TechCrunch 给的例子很有冲击力——它能「**对数十万行代码做代码库级迁移,从启动到合并全程自动,以现有测试套件作为达标线**」。据 computingforgeeks,它通过 `ultracode` 设置触发。这是把「Agent 团队」从概念推向规模化的一步,目前是 research preview(企业 / Team / Max 可用)——**别急着上生产关键路径**。

### 3. 长上下文:把 4.7 的回退修回来

针对前面说的 4.7 长上下文翻车,官方文档明确 4.8 的改进方向是「**更好的长上下文处理、更少 compaction(上下文压缩)、compaction 之后恢复更好**」,长 Agent 轨迹「在压缩后仍能保持在任务上,更少跑偏」。

- **1M 上下文**自 4.6 起是 Opus 标配,4.8 在 API / Bedrock / Vertex 上**默认开启 1M**(Microsoft Foundry 为 200k),最大输出 128k token,知识截止约 **2026 年 1 月**。
- 对被 4.7 长文档 / 跨多文件代码理解坑过的人,这是 4.8 **最该升级的理由之一**。

不过这里要泼一盆冷水:**官方这次没有公布可直接对比的长上下文指标**。有中文开发者社区(linux.do / 80aj 等)发现,Anthropic 在 4.8 上**撤掉了往代用的 MRCR 长上下文基准,只报了 GraphWalks**,导致「修没修好、修了多少」**无法跨版本直接量化比较**。他们提醒:4.7 在 150k–200k token 区间就出现过注意力衰减,**别只信官方说辞,自己拿真实长文档跑一遍最稳**。

### 4. Fast 模式:2.5× 速度,价格大降

Opus 4.8 的 **Fast 模式**做了实打实的优化:

- 速度约 **2.5×**(同一个模型,只是吐字更快,**不会降级成小模型**);
- **价格大幅下降**:上一代 Fast 约 **$30 / $150**(每百万 input / output token),官方口径是 4.8 的 Fast「**比上代便宜约 3 倍**」——折算约 $10 / $50;不过 Simon Willison 的实测文里写的是降到 **$15 / $75**。**各来源口径略有出入**,但「Fast 模式明显变便宜」是一致结论,以官方文档与你账单的实际档位为准;
- 目前在 Claude API 上是 **research preview**,设 `speed: "fast"` 开启;Claude Code 里可用 `/fast` 一键开关(Opus 4.8 / 4.7 / 4.6 都支持)。

注意 Fast 仍是相对标准价($5/$25)的**溢价档**,但相比过去「要快就得多掏很多钱」,这代性价比改善非常明显。

另一个贴心的默认值变化:**4.8 在所有入口(API、Claude Code)默认 effort = high**。官方说编码任务下 high effort 花的 token 量和 4.7 默认档差不多,但效果更好;需要时还能往上调 `xhigh` / `max`,用更多 token 换质量。配合 **adaptive thinking**(只在判断需要时才思考),4.8 在简单任务上比 4.7「同 effort 档少浪费思考 token」。

### 5. API 工程化:几个让开发者省心的小改动

- **会话中途插入 system 消息**:可以在长会话进行到一半时更新系统指令,而**不破坏 prompt cache**、不必重述整段提示词——对长 Agent 链路特别实用。
- **Prompt 缓存门槛下调**:最小可缓存提示长度从 4.7 的 **4,096** 降到 **1,024 token**,以前太短缓存不了的提示现在也能缓存,零改动省钱。
- **Refusal stop details**:拒答响应带上「拒绝类别」,方便应用分流处理。
- **继承自 4.7 的约束**:不支持 `temperature` / `top_p` / `top_k`(设了报 400);只支持 adaptive thinking,不支持显式 thinking budget——从 4.7 升 4.8 这些**无需改代码**。

## 四、价格与性价比

| 项 | Opus 4.7 | Opus 4.8 |
| --- | --- | --- |
| 标准定价(input / output) | $5 / $25 每百万 token | **$5 / $25**(不变) |
| Fast 模式 | 约 $30 / $150 | **比上代便宜约 3 倍**(约 $10–15 / $50–75,2.5× 速度) |
| Prompt 缓存 | 命中省最多 90%;门槛 4,096 token | 同样省 90%;**门槛降到 1,024 token** |
| 批处理 | 省 50% | 省 50% |

一句话:**标准价不变、Fast 模式大幅降价、缓存更易命中**——综合用下来,4.8 反而可能更省。

## 五、迁移注意事项

升级不是完全零成本,几个点提前知道能少踩坑:

1. **effort 默认变 high**:若你的成本预算按 4.7 默认档算,留意 token 消耗变化(官方称编码任务持平,其它任务不一定)。
2. **提示词可能要微调**:自 4.7 起模型对指令解读更**字面化**,Anthropic 建议重新调一遍既有 prompt;4.8 延续这一风格,并提供了官方迁移指南。
3. **分词器与 token 计数**:4.7 换过分词器,相同内容 token 数约为旧版 1.0–1.35×(系统提示、尤其高分辨率图像更明显)。4.7→4.8 这块影响不大;若从 4.6 及更早一步到位,要重新核算预算。
4. **Dynamic Workflows / Fast 模式都是预览**:先小范围试,别直接压到生产关键路径。

## 六、社区与博主怎么看(以及一个没人提的副作用)

这部分我特意多花了笔墨,因为**跑分只是故事的一半**,真实口碑往往藏着官方公告不会写的东西。

### 6.1 博主 / 媒体:一致的「渐进、克制」

- **Simon Willison**(每代必测的独立博主)照例跑了招牌的「**鹈鹕骑自行车 SVG**」测试:用五个思考档各画一张,`max` 档效果最好,但单张花了 **43 美分**(25 input + 17,167 output token)——直观展示了「拉满 effort」的性价比代价。他最欣赏的反而是官方那句「modest but tangible」的坦诚,以及会话中途 system 消息、缓存门槛下调这些**工程改进**。
- **VentureBeat** 主打性价比与对齐,标题直接是「**3× 更便宜的 Fast 模式 + 接近 Mythos 的对齐**」;Anthropic 称 4.8 在「欺骗 / 配合滥用」这类失配指标上已**与 Mythos 预览版相当**,亲社会指标创新高。
- **The New Stack / 9to5Mac / officechai** 聚焦「effort 控制、Dynamic Workflows、更便宜的 Fast、更诚实更少欺骗」,但都强调「是台阶不是飞跃」。
- **中文媒体**:新浪 / 网易科技以「**提升 AI 编程可靠性、减少无依据结论**」为题报道;量子位标题更燃——「**Claude 4.8 炸场!部分能力超过 Mythos,支持数百子智能体并行**」;36 氪则关注 Anthropic 借 4.8「**预告 Mythos 级模型**」。

### 6.2 一个值得泼冷水的实测:不是「全面升级」

**Lenny's Newsletter** 的上手评测给了最有价值的反向视角。她的结论是:4.8「**擅长从零搭原型、一把梭实现单个功能、执行速度快,但在「最后 10%」、既有代码库里的边缘 case、以及幻觉上仍然吃力**」。最关键的一句:她**在数据密集型的战略 / 路线图工作上,仍然会退回去用 Opus 4.7**。

换句话说:**4.8 不是对 4.7 的无差别碾压**,而是「**长任务、Agent、可靠性**」更强,某些「**重思辨、重数据判断**」的场景 4.7 反而更顺手。别因为版本号高就无脑全切。

### 6.3 论坛真实情绪:从「释放疲劳」到「过度诚实」

Hacker News 的发布讨论帖(1200+ 赞、近千评论)有意思的是:**大家讨论的不是 4.8 多强,而是「又升级了?」的疲劳感**。几条代表性原话:

- 「我说不清它比记忆里的 4.5 强在哪,一切都太『模糊』了,真的很难分辨。」
- 「老实说,Claude 已经没有我搞不定的任务了……我连 Opus 4.7 都还没榨干。」
- 「今天,**一个能把现有 LLM 用好的脚手架(harness),比一个更强的 LLM 更有价值。**」
- 还有人直接调侃:「Opus 4.7、4.8 八成是从 Claude Mythos **蒸馏**出来的。」

**这恰恰印证了文章开头的判断**:当模型强到一定程度,代际提升对终端用户越来越「不可感知」,价值重心正从「模型本身」转向「怎么把它编排进工作流」——这也是 Dynamic Workflows 为什么是这次发布的重点。

### 6.4 副作用:「代码更诚实了,人类却有点不舒服」

这是官方公告绝口不提、但社区(尤其中文)讨论最热的一点。网易科技一篇热文标题就是——**「代码更诚实了,人类却有点不舒服」**。

前面说 4.8 靠「**不确定就弃答 / 主动指出问题**」换来了可靠性。这套行为在**编码、企业场景是优点**;但放到**聊天、陪伴、头脑风暴**场景,同一种「克制」就被不少用户读成:

- **过度谨慎**、动不动「我不确定」;
- **打太极、回避**,不肯像以前那样顺着你往下接;
- **冷冰冰**,甚至有人觉得有点「刻薄」。

这其实是对齐调优的经典 trade-off:**让模型少说大话,代价是它也少了点「热情」**。如果你主要拿 Claude 写代码做 Agent,这是净收益;如果你重度依赖它做创意 / 情感陪伴,**升级前最好先试试手感**。

### 6.5 别忘了 4.7 当初摔过的跤

把 4.8 放回上下文:**Opus 4.7 的社区首发口碑相当差**。Reddit 上「Opus 4.7 不是升级,而是严重倒退」的帖子两天内冲到约 2300 赞,集中吐槽三点——① **分词器膨胀**(相同内容多 20–35% token,变相涨价);② **安全 RLHF 外溢**,Claude Code 把一些常规操作误报成「恶意 / malware」;③ **变得不爱坚持己见**,你一纠正它就立刻「认错」。

4.8 的发布说明里,「**工具触发更准**」「**长上下文 / compaction 改善**」基本就是逐条回应 4.7 的这些投诉。**所以与其说 4.8 是飞跃,不如说它是 4.7 该有的样子。**

### 6.6 一句话的商业背景

顺带一提发布当天的另一条大新闻:据路透 / 雅虎等报道,Anthropic 同日宣布完成 **650 亿美元 H 轮融资、投后估值约 9650 亿美元**,反超 OpenAI,并预告「未来几周」推出 **Mythos 级模型**。把 4.8 读成「**Mythos 登场、IPO 竞赛白热化前的一次稳健卡位**」,也说得通。

---

整体口径中英文一致:**渐进、稳健、工程友好,是一次「修 4.7 的坑 + 打磨」式的升级**;但「**诚实带来的冷感**」和「**并非全场景都强过 4.7**」这两个副作用,值得在升级前心里有数。

## 七、该不该升级?

- **Agent / 生产流水线 / 长任务编码**:**强烈建议升**。代码可靠性 4×、长任务完成度、长上下文修复、工具触发更准,这几项叠加会显著降低「自动化跑着跑着翻车」的成本。这是 4.8 的主场。
- **被 4.7 长上下文坑过、甚至退回 4.6 的人**:**这就是你等的版本**,可以放心回到 Opus 主线(但建议自己拿真实长文档复测一遍,别只信官方)。
- **个人日常 / 编码助手**:直接上 4.8,同价、更快(Fast 模式)、更稳。
- **重思辨、重数据判断的战略类工作**:**不一定**。参考 Lenny 的反馈,这类场景 4.7 可能更顺手,值得 A/B 对比后再定。
- **创意写作 / 情感陪伴 / 头脑风暴**:**先试手感再切**。4.8 的「诚实克制」在这里可能变成「冷淡、爱打太极」。
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

**博主 / 社区**
- [Simon Willison's blog — Claude Opus 4.8](https://simonwillison.net/2026/May/28/claude-opus-4-8/) ·[Claude tag](https://simonwillison.net/tags/claude/)
- [Lenny's Newsletter — Claude Opus 4.8 上手评测](https://www.lennysnewsletter.com/p/claude-opus-48-is-here-is-it-as-good)
- [Hacker News — Claude Opus 4.8 发布讨论](https://news.ycombinator.com/item?id=48311647)

**中文社区**
- [36 氪 — Claude Opus 4.7,全网差评,刚升级就翻车](https://36kr.com/p/3770733959496194) ·[Anthropic 三张底牌全翻了,Mythos 1 首次现身](https://36kr.com/p/3823864623992965)
- [新浪科技 — Claude Opus 4.8 上线:提升 AI 编程可靠性,减少无依据结论](https://finance.sina.com.cn/tech/digi/2026-05-29/doc-inhzpfxw8091201.shtml)
- [网易科技 — 代码更诚实了,人类却有点不舒服](https://www.163.com/tech/article/KU37HP0400097U7T.html)
- [80aj — Claude Opus 长上下文注意力实测](https://www.80aj.com/2026/05/29/claude-opus-attention-test/)
- [LINUX DO — Claude Opus 4.8 出了,欢迎分享使用体验](https://linux.do/t/topic/2264692)
