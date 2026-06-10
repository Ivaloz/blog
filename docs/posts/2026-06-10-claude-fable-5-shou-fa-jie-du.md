---
title: 'Claude Fable 5 首发解读：Anthropic 把「不敢公开的模型」做成了公开版'
date: 2026-06-10
slug: 'claude-fable-5-shou-fa-jie-du'
description: '2026 年 6 月 9 日，Anthropic 发布 Claude Fable 5——首个面向公众开放的 Mythos 级模型，定位在 Opus 之上的全新档位，定价 $10/$50 每百万 token。本文结合 Anthropic 官方公告与开发者文档、Simon Willison 与 Ethan Mollick 两位头部博主的第一时间实测，以及 TechCrunch 等外媒报道，拆解 Fable 5 与 Mythos 5 的双模型架构、「回退到 Opus 4.8」的安全路由机制、长程自主任务上的能力跃迁（9.5 小时自主开发、Slay the Spire 三倍于 Opus 4.8）、API 层面的破坏性变更与迁移注意事项，并给出价格与选型建议。'
author: 范伟彬
tags:
  - Claude
  - Fable 5
  - Mythos
  - Anthropic
  - 大模型
  - AI 编程
  - Agent
  - 模型安全
source: AI
categories:
  - AI
  - 大模型
---

# Claude Fable 5 首发解读：Anthropic 把「不敢公开的模型」做成了公开版

2026 年 6 月 9 日，Anthropic 发布了 **Claude Fable 5**。这不是又一次「Opus 4.x → 4.x+1」的常规迭代——Fable 5 是 Anthropic 历史上第一个向公众开放的 **Mythos 级（Mythos-class）模型**，在产品线上是 Opus 之上的**全新档位**。

这次发布的叙事也很特别：就在几天前，Anthropic 还在公开警告「AI 进展太快、各家实验室应该协调刹车（coordinated brake pedal）」，转头就把自家最强的模型放了出来。TechCrunch 的标题直接点破了这种张力——「Anthropic 在警告 AI 变得太危险的几天后，公开发布了它最强的模型」。Anthropic 给出的答案是一套颇有争议也颇有意思的方案：**同一个底座模型，做两个版本**——带安全护栏的 Fable 5 给所有人，护栏部分解除的 Mythos 5 只给受信任的少数机构。

这篇文章结合**官方公告与开发者文档、Simon Willison 与 Ethan Mollick 两位头部博主的第一时间实测、以及 TechCrunch 等外媒报道**，把 Fable 5 是什么、强在哪、护栏怎么工作、API 有什么坑、值不值得用，一次讲清楚。

> 数据来源：Anthropic 官方公告《Claude Fable 5 and Claude Mythos 5》与平台文档、Simon Willison 博客《Initial impressions of Claude Fable 5》、Ethan Mollick 的 One Useful Thing 专栏《What it feels like to work with Mythos》、TechCrunch、CNBC 等（文末附链接）。所有关键数字均标注出处；个别来自厂商客户证言的数字（如 Hex、Rakuten）属于宣传口径，请自行打折。

## 一分钟速览

- **定位**：Opus 之上的新档位。官方说法：「Fable 5 的能力超过 Anthropic 有史以来公开提供过的任何模型」，且**任务越长越复杂，领先幅度越大**。
- **本质**：Fable 5 = Mythos 5 + 安全护栏。两者是**同一个底座模型**，区别只在防护层。
- **规格**：1M 上下文窗口、128K 最大输出、知识截止 2026 年 1 月（Simon Willison 实测口径，与官方文档一致）。
- **价格**：**$10 / $50 每百万 input / output token**——是 Opus 4.8（$5/$25）的两倍，但比此前的 Mythos Preview 便宜一半以上；1M 长上下文**不额外加价**。
- **安全机制**：分类器检测到网络攻击、生物/化学、模型蒸馏三类请求时，**自动回退由 Opus 4.8 作答**（不是拒答）；约 95% 的会话全程不触发回退。
- **博主口碑**：Simon Willison 称它是「a beast」，可能是迄今发布的**最大参数量模型**；Ethan Mollick 称其为「比我用过的所有模型都有一次真实的跃迁」，实测可**连续自主工作 9.5～12 小时**。
- **上手窗口**：6 月 9 日～22 日，Pro / Max / Team / 按席位 Enterprise 订阅**免费包含**；6 月 23 日起订阅内使用要消耗用量额度。API 即日全量开放，模型 ID `claude-fable-5`。
- **一句话提醒**：很强，但有两个代价——**贵**（Willison 高强度测一天烧了 $110），以及**护栏偶尔误伤**（Mollick：「沾一点安全话题的边就触发回退」）。

## 一、Fable 5 是什么：先把 Mythos 谱系捋清楚

理解 Fable 5，得先理解 **Mythos**。

Mythos 是 Anthropic 内部能力最强的模型线。按 TechCrunch 梳理的时间线：

| 时间 | 事件 |
| --- | --- |
| 2026 年 4 月 | **Mythos Preview** 以预览形式上线，但出于安全顾虑，只开放给极少数合作伙伴 |
| 2026 年 6 月初 | 扩展到数百家关键基础设施机构（Project Glasswing 项目） |
| **2026 年 6 月 9 日** | **Claude Fable 5 公开发布**——第一个所有人都能用的 Mythos 级模型；同日发布受限版 **Claude Mythos 5** |

也就是说，Anthropic 手里这个模型其实已经存在几个月了，迟迟不公开的原因是**安全评估认为它在网络攻击、生物等领域的能力越过了红线**。这次能公开，靠的不是把模型砍弱，而是在外面加了一套新的防护体系（下文第三节细讲）。

两个版本的关系一句话说清：

- **Claude Fable 5**：完整能力 + 完整护栏，面向所有付费用户和 API。
- **Claude Mythos 5**：同一个底座，**在特定领域解除护栏**，初期只通过 **Project Glasswing**（Anthropic 与美国政府合作的项目）提供给网络防御方与关键基础设施机构，正在扩展到约 150 家新机构、覆盖 15 个以上国家；下一步会向生物医药研究者开放（生物护栏解除、网络护栏保留），未来再扩大为更广泛的「受信任访问计划」。

这套「**一个模型、分级放行**」的做法，是 Fable 5 发布真正的范式意义——能力不再对所有人一视同仁，而是按资质分发。BenchLM 等行业博客把它概括为「**Gated Intelligence（门控智能）**」时代的开端。

## 二、能力：官方口径下的「越长越强」

官方公告的核心论点不是某个单点跑分，而是一条曲线：**任务越长、越复杂，Fable 5 对自家其他模型的领先越大**。官方列举的证据（均出自 Anthropic 公告，含客户证言）：

**软件工程**

- Stripe 反馈 Fable 5 把「数月的工程工作压缩到数天」。
- 在 Cognition（Devin 团队）的 **FrontierCode** 评测上，Fable 5 在 medium effort 档就拿到前沿模型最高分。
- Cursor CEO Michael Truell：它解锁了「一类此前模型够不着的长程问题（long-horizon problems）」。
- GitHub 的 Mario Rodriguez：在复杂长程编码任务上「超过了以往全部基准」。

**知识工作**

- 在 Hebbia 的金融基准（Finance Benchmark）上拿到受测模型最高分。
- 数据分析公司 Hex 称 Fable 是「第一个在其核心分析基准上拿到 90% 的模型」。
- Scale AI 的 Sean Ward 评价其推理「达到资深研究科学家（senior research scientist）水准」，能给出「从第一性原理出发的新颖输出」。

**视觉**

- 官方称 Fable 5 是视觉任务新 SOTA，演示包括**从截图重建 Web 应用源码**、**纯靠视觉通关《宝可梦 火红》**。

**长上下文与持久记忆**

- 在带持久记忆玩《杀戮尖塔》（Slay the Spire）的测试中，表现是 **Opus 4.8 的三倍**，到达最终章的频率也是三倍。

**科研**

- 内部蛋白质设计专家用它把药物设计流程加速约 **10 倍**，14 个蛋白靶点中 9 个产出了强候选。
- 分子生物学假设生成的盲测中，科学家约 **80%** 的情况下更偏好 Mythos 5 的假设而非 Opus 级模型。

> 注意：以上客户证言类数字（Stripe、Hex、Rakuten 等）都来自官方公告引用，属于发布会口径，没有独立复现。相对可信的是下一节两位独立博主的实测。

## 三、安全机制：不拒答，而是「降级作答」

这是 Fable 5 在工程上最有意思的设计。传统做法是模型检测到危险请求就拒答；Fable 5 的做法是**路由回退（fallback routing）**：

1. 独立于主模型的**分类器系统**实时检测请求是否落入受保护领域；
2. 命中后，这条请求**改由 Claude Opus 4.8 生成回答**——用户得到的不是一句「我不能帮你」，而是一个能力低一档但完整的回答；
3. 官方数据：约 **95% 的会话全程不触发任何回退**，即护栏平均影响不到 5% 的会话。

三个受保护领域：

| 领域 | 策略 |
| --- | --- |
| **网络安全** | 拦截漏洞利用与进攻性网络任务。官方测试中 Fable 5 在网络攻击规划任务上「零进展」 |
| **生物与化学** | 大部分生物/化学请求回退到 Opus 4.8。官方坦承双重用途风险：Mythos 5 在评估腺相关病毒（AAV）组装能力时**超过了专用蛋白质预测模型** |
| **模型蒸馏** | 检测到「想把 Fable 的能力萃取出来训练竞品模型」的请求，同样回退到 Opus 4.8 |

红队测试方面，官方披露：外部红队累计 **1000+ 小时未找到通用越狱**（universal jailbreak）；用 30 种公开越狱手法做单轮有害请求测试，**零成功**。唯一的坦诚保留：英国 AISI（AI 安全研究所）在短期测试中「朝一个通用越狱取得了进展」——这句写进官方公告本身，算是 Anthropic 一贯的风格。

配套还有一条新的数据政策，值得所有打算在生产环境用 Fable 5 的人注意：**Mythos 级及未来高能力模型的全部流量强制保留 30 天**（用于检测跨请求的复杂攻击），不用于训练、人工访问全程留痕、30 天后基本全部删除。对数据合规敏感的团队，评估时要把这条算进去。

## 四、头部博主实测：「野兽」与「从巫师到金主」

官方口径再漂亮，也要看独立实测。首日影响力最大的两篇分别来自 **Simon Willison**（Datasette 作者，LLM 工具圈最高产的独立评测者）和 **Ethan Mollick**（沃顿商学院教授，One Useful Thing 专栏作者）。

### 4.1 Simon Willison：「这是头野兽」

Willison 首日测了 5.5 小时，结论是 Fable 5 「something of a *beast*」。几个有信息量的观察：

- **可能是迄今最大的模型**。他的判断方法很巧：让 Fable 5 和 Opus 4.8 分别列举「Simon Willison 的开源项目」。Opus 4.8 答得谨慎、不敢保证全；Fable 5 不仅顺手纠正了他 prompt 里的一个错别字，还自信地列出了**数百个仓库**。他的原话：「这类知识量是模型规模相当好的代理指标」。
- **真实工程任务**：让 Fable 5 把一个 MicroPython 沙箱升级为跑完整 CPython 的 WebAssembly 方案，多轮迭代后产出了一个 13.9MB 的可用 wheel 包。
- **最让他惊讶的**：在给 Datasette 写 Agent 功能时，Fable 5 不仅完成了他设的「附加题」，还**自主识别出他的 LLM 库底层的 4 个问题，并把它们实现成了正式特性而不是绕过去的 workaround**——直接催生了 LLM 0.32a3 版本。
- **effort 档位实测**（他保留节目「画鹈鹕 SVG」）：从 low 到 max 五档，输出 token 从 1,929（$0.097）到 14,430（$0.722），但 effort 档位和输出量**没有稳定的单调关系**。
- **成本**：高强度测试一整天，烧掉 **$110.42** API 额度。他评价：好在 $100/月 的订阅计划覆盖了大部分。

### 4.2 Ethan Mollick：「我不再掌舵，我只是下单」

Mollick 的文章标题就是态度——《与 Mythos 一起工作是什么感觉》。他的结论：「**这是比我用过的所有模型都真实的一次跃迁**」。但这篇文章真正的价值在于他描述了**工作方式的质变**：

- **一句话生成可玩的游戏**：在 Claude Code 里用一个模糊的初始 prompt（如「Balatro，但玩的是抛硬币」），Fable 就能产出可玩的游戏，所有图形都是数学生成、不依赖外部素材。
- **等时圈地图（isochrone map）**：一个详细 prompt，Fable 自己**启动了多个下属 AI（主要是更便宜的 Sonnet 实例）并行研究了 2,200+ 个航班**、抓取 TGV 和新干线时刻表、从学术论文里取道路速度，甚至组织了**互相对抗、互相验证的研究小组**去解决边角案例——比如「去皮特凯恩岛的船多久一班」「从渥太华怎么到格里斯峡湾」。
- **9.5 小时自主开发**：他让 Fable 做一个科研软件（校准人类与 AI 在分类数据集上的判断一致性），Fable 先产出**19 页设计文档**，然后**连续自主执行 9 个多小时**，交付了他评价为「研究者需要了很多年」的生产级工具。他另提到这个模型「会照着多页规格说明连续干上 12 个小时」。

他用了一个会被反复引用的比喻来总结人机关系的变化：

> 「以前我把这叫『与巫师共事』：你念出咒语，事情就发生了。现在我更像一个**金主（patron）**：我描述我要什么，我付钱，我评判结果。」「工作从过程转向了结果。我不再掌舵；**我只是委托（I no longer steer; I commission）**。」

但他同样给出了首日最尖锐的三条批评：

1. **终极黑箱**：模型自主做了「成百上千个小决定」，他完全无法观察决策过程——「用这个工具的感觉介于愉悦和不安之间」。
2. **护栏误伤**：「Fable 的护栏沾一点安全话题的边就会触发」，过于频繁地回退到更弱的 Opus 4.8。
3. **Claude 味儿还在**：文风和代码里仍有挥之不去的「Claudisms」。

## 五、开发者视角：API 变化与迁移注意

这部分综合 Anthropic 开发者文档整理，给打算第一时间接入的人。

**基本规格**：模型 ID **`claude-fable-5`**（直接用这个字符串，不要加日期后缀），1M 上下文、128K 最大输出，1M 长上下文**无加价**。API 表面与 Opus 4.7 / 4.8 一致，从 4.7/4.8 迁移基本就是换模型 ID，但有**一处新增的破坏性变更**要注意：

| 变更点 | Opus 4.8 | Fable 5 |
| --- | --- | --- |
| `thinking: {type: "adaptive"}`（自适应思考） | ✅ 推荐 | ✅ 推荐 |
| `thinking: {type: "enabled", budget_tokens: N}` | ❌ 400 | ❌ 400 |
| **显式 `thinking: {type: "disabled"}`** | ✅ 接受 | ❌ **返回 400**——想关思考请直接**省略** `thinking` 参数 |
| `temperature` / `top_p` / `top_k` | ❌ 400 | ❌ 400 |
| 最后一条 assistant 预填充（prefill） | ❌ 400 | ❌ 400 |
| effort 档位（`output_config.effort`） | low → max（含 xhigh） | low → max（含 xhigh） |

最小可用示例（Python）：

```python
from anthropic import Anthropic

client = Anthropic()

with client.messages.stream(
    model="claude-fable-5",
    max_tokens=64000,
    thinking={"type": "adaptive"},
    output_config={"effort": "high"},  # 编码/Agent 任务可上 xhigh
    messages=[{"role": "user", "content": "……"}],
) as stream:
    message = stream.get_final_message()
```

几条实践建议（来自官方文档与迁移指南）：

- **长程任务把完整任务说明书放进第一轮**。Fable 5 的强项是拿着清晰目标自主跑长程；挤牙膏式的多轮补充说明反而拉低 token 效率。
- **effort 是要扫参的维度，不是定死的开关**。编码与 Agent 场景推荐 `high` / `xhigh`；不要反射性地拉满 `max`——更高的 effort 前期思考更多，但在长程任务上常常**减少**总轮数和总成本。
- **提示词缓存**：Fable 5 的最小可缓存前缀是 2,048 token（Opus 4.8 是 4,096），长系统提示词务必加 `cache_control`，缓存读取约为原价的 1/10——在 $10/MTok 的输入单价下，这条直接决定账单数量级。
- **API 新增回退相关字段**：按 Willison 的说法，API 提供了新的拒答通知机制，以及「内容被拦截时自动回退到指定模型」的可选项——生产环境建议显式处理回退分支，至少打日志，否则你不知道哪些请求实际是 Opus 4.8 答的。

## 六、价格与选型建议

**价格**：$10 / $50 每百万 input / output token。坐标系：Opus 4.8 是 $5/$25（一半），Sonnet 4.6 是 $3/$15，Haiku 4.5 是 $1/$5。官方强调这已经「不到 Mythos Preview 的一半」。

**订阅侧**：6 月 9 日～22 日，Pro / Max / Team / 按席位 Enterprise **免费试用**；23 日起消耗用量额度。**这两周是零成本评估窗口，建议抓住。**

成本方面两个真实数据点：Willison 重度测试一天 $110；Mollick 说它「烧 token 的速度」明显，但也观察到 Fable 会**主动把子任务委派给便宜的 Sonnet 实例**，实际账单未必线性翻倍。Rakuten 的官方证言是「自我反思带来的额外思考物有所值」——这话出自发布会，参考即可。

我的选型建议（综合各方信息）：

- **该上 Fable 5**：跨小时级的自主 Agent 任务、复杂代码库迁移/重构、深度研究与分析、需要「拿着 19 页设计文档自己跑完」的活。它的溢价买的是**长程自主性**，不是单条回答的质量差。
- **继续用 Opus 4.8**：常规编码、日常推理。多数单轮/短程任务上两者差距撑不起两倍价差——这也正是 Fable 5 护栏回退敢用 Opus 4.8 兜底的原因。
- **继续用 Sonnet 4.6 / Haiku 4.5**：高吞吐、成本敏感的管道任务；以及作为 Fable 5 编排下的子 Agent（Fable 自己也是这么干的）。
- **安全/生物相关业务**：先小流量验证回退触发率。你的领域如果天然贴着受保护边界（安全研究、生物信息），实际拿到的可能经常是 Opus 4.8 的回答，体验和预期会有落差——Mollick 的抱怨就在这。

## 小结

把这次发布放远一点看，有三层意义：

1. **能力上**，「模型越大越没用」的论调又被打了一次脸。Fable 5 的领先集中在**长程自主**——9.5 小时不间断交付生产级软件、自组多 Agent 研究网络，这是从「更好的回答」到「更完整的工作」的代差。Mollick 的「巫师→金主」比喻大概率会成为今年被引用最多的一段话。
2. **安全上**，「**门控智能**」正式落地：同一个底座，公众拿到带护栏的 Fable 5，受信机构拿到解除部分护栏的 Mythos 5，中间用「回退降级作答」代替生硬拒答。这套机制是否扛得住时间（UK AISI 已经摸到通用越狱的边了），以及 5% 的误伤率会不会劝退专业用户，是接下来最值得盯的两件事。
3. **格局上**，在 Anthropic 筹备 IPO、OpenAI 同步递表的节点放出这张牌，竞争意味不言自明。$10/$50 的定价配合「订阅免费两周」，明显是想让尽可能多的人先尝到长程自主的甜头。

两周免费窗口还有十几天，建议直接找一个你手头「需要连续干几个小时」的真实任务扔给它——这才是 Fable 5 与以往所有模型拉开差距的地方。

## 参考链接

**官方**

- Anthropic 官方公告：[Claude Fable 5 and Claude Mythos 5](https://www.anthropic.com/news/claude-fable-5-mythos-5)
- [Claude 平台开发者文档](https://platform.claude.com/docs/)（模型规格、迁移指南）

**头部博主实测**

- Simon Willison: [Initial impressions of Claude Fable 5](https://simonwillison.net/2026/Jun/9/claude-fable-5/)
- Ethan Mollick (One Useful Thing): [What it feels like to work with Mythos](https://www.oneusefulthing.org/p/what-it-feels-like-to-work-with-mythos)

**媒体报道**

- TechCrunch: [Anthropic's Claude Fable 5 is a version of Mythos the public can access today](https://techcrunch.com/2026/06/09/anthropic-released-claude-fable-5-its-most-powerful-model-publicly-days-after-warning-ai-is-getting-too-dangerous/)
- TechCrunch: [Anthropic's Fable 5 can make weirdly fun video games](https://techcrunch.com/2026/06/09/anthropics-fable-5-can-make-weirdly-fun-video-games-with-the-click-of-a-button/)
- CNBC: [Anthropic releases Mythos-like AI model to the public](https://www.cnbc.com/2026/06/09/anthropic-mythos-claude-fable-5.html)
- Tom's Hardware: [Claude Fable 5 brings Mythos to the masses](https://www.tomshardware.com/tech-industry/artificial-intelligence/claude-fable-5-brings-mythos-to-the-masses-anthropics-next-frontier-model-is-state-of-the-art-on-nearly-all-tested-benchmarks)
- 社区讨论：[Hacker News](https://news.ycombinator.com/item?id=48463808)
