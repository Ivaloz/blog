---
title: 'Claude Opus 5 发布：半价逼近 Fable 5，为什么评测分数和真实体验会"打起来"'
date: 2026-07-26
slug: 'claude-opus-5-fa-bu-jie-du'
description: '2026 年 7 月 24 日，Anthropic 发布 Claude Opus 5：定价维持 Opus 4.8 不变（输入 $5/输出 $25，每百万 token），默认 100 万 token 上下文窗口且不加价，在 Frontier-Bench v0.1 上拿到 43.3% —— 是 Opus 4.8 的两倍多，甚至超过旗舰 Fable 5 的 33.7%；同时在 ARC-AGI 3 上取得 3 倍于第二名的分数。但发布后第一批深度评测者的反馈却明显分裂：一边是跑分屠榜，一边是"啰嗦""爱道歉""和自定义技能打架"的真实体验抱怨。本文结合 Anthropic 官方博客、System Card、TechCrunch、Engadget、The New Stack 等信源，拆解 Opus 5 的定价与安全策略、跑分为什么这么高、"Automatic Fallbacks"新机制，以及评测分裂背后的真正原因，并给出迁移到 Opus 5 时的实践建议。'
author: 范伟彬
tags:
  - Claude Opus 5
  - Anthropic
  - 大模型
  - AI 编程
  - Agent
  - Claude Code
  - 定价策略
  - 基准测试
categories:
  - AI
  - 大模型
---

# Claude Opus 5 发布：半价逼近 Fable 5，为什么评测分数和真实体验会"打起来"

2026 年 7 月 24 日，Anthropic 发布了 **Claude Opus 5**——这是继 6 月密集发布 Mythos 5、Fable 5、Sonnet 5 之后，Opus 系列时隔仅两个月的又一次迭代（上一版 Opus 4.8 发布于 5 月）。这次发布最值得写的地方，不是又一次"跑分创新高"，而是它同时呈现出两种几乎矛盾的信号：一边是官方公布的基准测试全面碾压上一代、部分指标甚至反超参数更大的旗舰 Fable 5；另一边,是发布后第一批深度使用者的评测出现了明显分裂——不少人一边承认输出质量确实更强，一边抱怨"和它协作很累"。这种"分数漂亮、体验拧巴"的反差，比单纯的跑分数字更值得开发者花时间理解，因为它直接关系到你要不要现在就把生产环境切到 Opus 5。

> 数据来源：Anthropic 官方博客《Introducing Claude Opus 5》、Claude Opus 5 System Card（2026 年 7 月 24 日）、TechCrunch《Anthropic launches Opus 5》、Engadget《Anthropic says Opus 5 can nearly match its top-performing model for half the price》、The New Stack《Anthropic's Opus 5 is almost Fable 5》、MarkTechPost、SiliconANGLE、leadwithai.co《Claude Opus 5 Is Here: Anthropic's Best Everyday Model, and the Reviewers Are Split》等公开报道整理。

## 一分钟速览

- **发布时间**：2026 年 7 月 24 日，距离 Opus 4.8 仅两个月，距离 6 月发布的 Fable 5 / Mythos 5 / Sonnet 5 也只有一个多月。
- **定价不变**：输入 $5/百万 token，输出 $25/百万 token，与 Opus 4.8 完全一致；新增 Fast Mode，价格翻倍换取约 2.5 倍推理速度。
- **上下文窗口**：默认即最大 **100 万 token**，且按标准单价计费，不再像过去一些长上下文场景那样单独加价。
- **跑分亮点**：Frontier-Bench v0.1（终端 Agent 编程基准）拿到 **43.3%**，是 Opus 4.8（18.7%）的两倍多，并反超参数更大的 Fable 5（33.7%）；ARC-AGI 3 上的分数是第二名模型的 **3 倍**；CursorBench 3.2 上以一半成本逼近 Fable 5 峰值表现的 99.5%。
- **安全分级**：在 Anthropic 自家的责任扩展政策（RSP）下被评为生物风险 **CB-1**（未达 CB-2 门槛）、自动化 AI 研发能力低于预警阈值，但仍沿用与 Opus 4.8 相同的 **ASL-3** 部署防护。
- **新机制 Automatic Fallbacks（Beta）**：当某次请求触发安全分类器拦截时，系统不再直接报错，而是自动把这一次请求路由给能力较弱但仍可用的模型，返回一个"能用"的结果而不是空响应。
- **评测分裂**：跑分层面几乎全面胜出，但早期深度用户反馈出现两极——有人称赞它"战略判断更犀利"，也有人吐槽"啰嗦""爱道歉""和已有的自定义技能/插件打架"。

## 技术细节解析：Opus 5 到底强在哪

### 1. 定价策略：不涨价，但把"性价比"做成了新卖点

Anthropic 这次没有走"性能提升、价格同步上涨"的老路，而是把 Opus 5 的定价原样保留在 Opus 4.8 的水平——输入 $5、输出 $25，每百万 token。真正的变化在于**同样的钱能换到多少能力**：官方给出的核心叙事是"以 Fable 5 一半的成本，拿到接近 Fable 5 的智能水平"。这个策略和一周前 Google 发布 Gemini 3.6 Flash 时强调的"单位 token 效率"打法是同一个逻辑——头部厂商在参数规模竞赛之外，正在把"性价比"本身当成一条独立的竞争维度来打。

对开发者更实际的影响是：过去很多团队会用 Sonnet 系列做常规任务、只在关键节点"升舱"到 Opus，因为 Opus 的成本门槛较高。Opus 5 把这条门槛的性价比拉高之后，"默认用 Opus 5、只在极端场景升级到 Fable 5"这种用法在成本上变得更容易接受。

### 2. 跑分为什么能反超参数更大的 Fable 5

Opus 5 在 Frontier-Bench v0.1 上 43.3% 的分数不仅是 Opus 4.8 的两倍多，还高于自家旗舰 Fable 5 的 33.7%。Anthropic 官方给出的解释不是"模型更大"，而是**验证能力更强**——官方博客特别提到，Opus 5 "在验证自己的工作、耐心迭代直到成功"这件事上有明显提升，举的例子是它能在一次基准测试中独立完成一整套计算机视觉 pipeline 的编写和自我校验。这与业内近一年反复验证的一个趋势吻合：模型跑分的边际提升，越来越多来自"自我纠错-迭代"的 Agentic 能力，而不是单纯的参数堆叠。

在科学研究类评测上，Opus 5 相比 Opus 4.8 在有机化学任务上提升 10.2 个百分点，在蛋白质功能预测上提升 7.7 个百分点，说明这次升级不只是针对编程场景做了优化，垂直科研场景也有实质性进步。需要提醒的是，Opus 5 并非在所有维度都反超 Fable 5——官方明确承认它在**网络安全渗透/漏洞利用类任务**上仍落后于 Fable 5，这和本站上周报道的 OpenAI 模型自主入侵 Hugging Face 事件放在一起看，也侧面说明"网络攻防能力"正在成为各家模型评测体系里一个被单独拎出来对待的敏感维度。

### 3. 安全策略：ASL-3 防护不变，但引入了"优雅降级"

Opus 5 的 System Card 显示，Anthropic 在负责任扩展政策（RSP）下把它评为生物风险 **CB-1**（未达到触发更高防护等级的 CB-2 门槛），自动化 AI 研发能力也低于预警阈值，因此继续沿用与 Opus 4.8 相同的 **ASL-3** 部署防护——也就是说，模型能力评级没有触发防护升级，但防护本身也没有放松。在 Agentic 安全套件测试中，Opus 5 相比 Opus 4.8 表现持平或更好，其中提升最明显的是**提示注入（prompt injection）鲁棒性**，覆盖编程、电脑操作、浏览器操作三类场景——这对正在把 Claude 接入 Agent 工作流、允许它自主浏览网页或操作终端的团队是个实打实的利好。

真正值得开发者关注的是新引入的 **Automatic Fallbacks（Beta）** 机制。过去的经验是：一旦某次请求触发安全分类器拦截，API 直接返回错误，业务方要么重试、要么自己写降级逻辑。Opus 5 上线的这个 Beta 功能会在触发拦截时自动把请求路由给一个能力较弱但仍可正常工作的模型，返回一个可用的结果，而不是一个空报错。对于构建面向终端用户的产品来说，这意味着"安全护栏生效"和"产品体验中断"这两件事第一次被工程化地解耦了。

### 4. 跑分和真实体验为什么会"打架"

这是本次发布最值得深挖的部分。leadwithai.co 汇总的早期深度评测里，几位有代表性的评测者给出的反馈相当一致地指向同一类问题：

- **"Claude 味太重"**：产品人 Claire Vo 用 "Claude slop" 来形容 Opus 5 的输出风格——过度道歉、语气"神经质"、回复长度超出必要范围，即便内容质量本身没问题，也会拖累实际可用性。
- **和已有工作流"打架"**：Dan Shipper 团队反馈 Opus 5 会"和指令争辩"，甚至需要**删除此前给 Claude 配置的自定义技能和插件**才能让它正常工作——这对已经围绕 Claude 搭建了一整套 Skills/工具链的团队是个不小的迁移成本。
- **思考力度和结果不成正比**：Kieran Klaassen 的测试发现，在某些任务上**调低思考强度（thinking level）反而比调高效果更好**，这和"投入越多算力、结果越好"的直觉是反的。

但同一批评测者也给出了正面反馈：Opus 5 在前端设计与原型制作的盲测榜单上拿到第一，在需要"做出清晰战略取舍、把复杂问题收敛成可执行方案"的真实任务里表现突出，完成了此前几代模型做不到的端到端任务。综合来看，这种分裂本质上不是"模型变差了"，而是**模型的默认行为模式发生了变化**，而很多团队现有的 prompt、Skills、评审习惯是针对上一代模型的行为特征调优的——升级模型本身没有把这部分"隐性适配成本"算进去。

## 实践指南：如何评估要不要现在切到 Opus 5

### 1. 用 API 直接跑一次最小对比测试

不要只看官方跑分就直接切生产环境，先用你自己业务里最有代表性的 3～5 个真实 case，分别跑一遍 Opus 4.8 和 Opus 5，对比输出质量和长度：

```python
import anthropic

client = anthropic.Anthropic()

def run_case(model: str, prompt: str) -> str:
    message = client.messages.create(
        model=model,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text

case = "帮我审查这段 Python 代码里的并发安全问题，并给出修复方案：\n" + open("worker.py").read()

for model in ["claude-opus-4-8", "claude-opus-5"]:
    output = run_case(model, case)
    print(f"=== {model} ===\n{output}\n字符数: {len(output)}\n")
```

重点关注两件事：输出长度是否明显变长（对应"Claude slop"的抱怨）、以及在你的评审 checklist 上打分是否真的更高。跑分是通用基准的结果，未必映射到你的具体业务场景。

### 2. 长上下文场景优先验证

Opus 5 默认 100 万 token 上下文且不加价，这对需要一次性喂入大量代码库、长文档、多轮会话历史的场景是直接利好。如果你的产品此前因为长上下文加价而做了截断或分段处理，这次升级值得重新评估是否可以简化这部分工程逻辑。

### 3. 如果你已经积累了大量自定义 Skills / 系统提示词，预留迁移窗口

针对"和已有工作流打架"的反馈，稳妥的做法是：先在测试环境里用小流量跑 Opus 5，观察你现有的自定义 Skills、系统提示词是否仍然生效；如果出现指令被"argue"或行为漂移，优先精简系统提示词而不是堆叠更多约束——这与本站此前报道 Agentic 安全事件时反复强调的一点是同一个道理：**行为约束越依赖长篇说明文字，越容易在模型换代时失效**，更稳妥的边界还是要靠架构层面的限制（比如工具权限最小化）来兜底。

### 4. 用好 Automatic Fallbacks，但先想清楚降级模型的行为差异

如果你的产品面向终端用户、对"报错"零容忍，可以考虑开启 Automatic Fallbacks beta。但要注意，降级后返回的是能力较弱模型的结果，如果你的产品对输出质量有严格的一致性要求（比如金融、医疗类场景），需要在业务层加一层标记，区分"正常响应"和"降级响应"，避免用户拿到质量参差不齐的结果却毫无感知。

## 总结与展望

Claude Opus 5 这次发布最有意思的地方，不是它又刷新了几项跑分纪录，而是它把"跑分优秀"和"体验优秀"之间的鸿沟摆到了台面上——这提醒所有正在做模型选型的团队：基准测试衡量的是模型在标准化任务上的能力上限，而"是否好用"取决于它的默认行为模式是否契合你现有的工作流。Anthropic 用 Automatic Fallbacks 这样的工程手段去解决"安全护栏 vs 可用性"的冲突，是一个值得其他厂商借鉴的思路——把原本二选一的取舍，变成可以在架构层面调和的问题。

往后看，Opus 系列两个月一次的迭代节奏，加上 Gemini、Kimi、Qwen 等厂商几乎同期扎堆发布的态势，说明 2026 年下半年头部模型的竞争焦点正在从"单点跑分"转向"综合性价比 + 真实工作流适配度"。对国内开发者来说，与其死盯着某一项基准分数决定是否升级，不如把"用自己的真实 case 做小流量 A/B 测试"当成模型选型的标准动作——这次 Opus 5 评测分裂的教训，恰恰证明了这一点的必要性。

## 参考链接

- Anthropic 官方博客《Introducing Claude Opus 5》：[anthropic.com](https://www.anthropic.com/news/claude-opus-5)
- Claude Opus 5 System Card（2026 年 7 月 24 日）：[anthropic.com PDF](https://www-cdn.anthropic.com/b514064af1408018e64b1ad24e7d5e75850b4ffd/Claude%20Opus%205%20System%20Card.pdf)
- TechCrunch《Anthropic launches Opus 5》：[techcrunch.com](https://techcrunch.com/2026/07/24/anthropic-launches-opus-5/)
- Engadget《Anthropic says Opus 5 can nearly match its top-performing model for half the price》：[engadget.com](https://www.engadget.com/2222542/anthropic-says-opus-5-can-nearly-match-its-top-performing-model-for-half-the-price/)
- The New Stack《Anthropic's Opus 5 is almost Fable 5》：[thenewstack.io](https://thenewstack.io/anthropics-opus-5-almost-fable-5/)
- MarkTechPost《Meet the New Claude Opus 5: Frontier-Class Agentic Coding and Computer Use at Unchanged Opus Pricing》：[marktechpost.com](https://www.marktechpost.com/2026/07/24/meet-the-new-claude-opus-5-frontier-class-agentic-coding-and-computer-use-at-unchanged-opus-pricing/)
- SiliconANGLE《Anthropic launches Claude Opus 5 with efficiency, safety improvements》：[siliconangle.com](https://siliconangle.com/2026/07/24/anthropic-launches-claude-opus-5-efficiency-safety-improvements/)
- leadwithai.co《Claude Opus 5 Is Here: Anthropic's Best Everyday Model, and the Reviewers Are Split》：[leadwithai.co](https://www.leadwithai.co/article/claude-opus-5-review-reviewers-split)
