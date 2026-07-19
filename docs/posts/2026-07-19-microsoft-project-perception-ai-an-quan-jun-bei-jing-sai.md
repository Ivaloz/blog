---
title: '微软 Project Perception 深度解读：一场瞄准 Anthropic Mythos 的 AI 安全军备竞赛'
date: 2026-07-19
slug: 'microsoft-project-perception-ai-an-quan-jun-bei-jing-sai'
description: '2026 年 7 月中旬，多家外媒接连曝出微软正在秘密开发 Project Perception——一个用多模型路由架构、试图以远低于 Anthropic Claude Mythos 的成本实现"自动发现并修复漏洞"的 AI 安全平台。本文结合 TechRepublic、The Information、Windows News、Neowin、Phemex 等外媒报道，以及世界经济论坛、英国 AISI 对 Claude Mythos 的官方评估，拆解这场 AI 原生漏洞挖掘与自动修复的军备竞赛：Mythos 与 Project Glasswing 计划到底做了什么、Project Perception 的多模型路由架构与成本优势、微软 MDASH 工具已经在 Patch Tuesday 里修了多少洞，并给出开发者可以直接上手实践的"低成本多模型漏洞分诊"参考实现与建议。'
author: 范伟彬
tags:
  - Project Perception
  - Microsoft
  - Anthropic
  - Claude Mythos
  - AI 安全
  - 网络安全
  - 多模型路由
  - Agent
  - AI 编程
categories:
  - AI
  - 大模型
---

# 微软 Project Perception 深度解读：一场瞄准 Anthropic Mythos 的 AI 安全军备竞赛

过去这半年，AI 圈的头条大多被"谁的模型跑分更高、参数更大、上下文更长"占据。但 2026 年 7 月中旬开始密集曝光的一则消息，把镜头切到了一个更容易被普通开发者忽略、却可能影响更深远的战场：**AI 能不能自己找到软件里的漏洞，然后自己把它修好**。

TechRepublic、《The Information》、Windows News、Neowin、Phemex 等多家外媒在 7 月 16～18 日接连报道，微软正在秘密开发一个代号为 **Project Perception** 的 AI 安全平台，目标直指 Anthropic 今年上半年发布的 **Claude Mythos**——一个因为"太危险"而被 Anthropic 主动限制发布范围的网络安全专用模型。这不是一次孤立的产品发布，而是"frontier 模型公司"与"云/操作系统厂商"在 AI 安全这个新赛道上正面交锋的第一回合。这篇文章把这场军备竞赛的来龙去脉、技术细节和对开发者的实际影响一次讲清楚。

> 数据来源：TechRepublic《Microsoft's 'Project Perception' Could Challenge Anthropic's Mythos in AI Security》、《The Information》独家报道《Exclusive: Microsoft Preps Mythos-Like AI Bug Finder》、Windows News《Microsoft's Project Perception Aims to Make AI Vulnerability Fixing Cheap Enough to Run Nonstop》、Neowin《Recent patches for Windows 11 could have been created by Microsoft's new Mythos rival》、Phemex News、World Economic Forum《Anthropic's Mythos moment: how frontier AI is redefining cybersecurity》、英国 AI 安全研究院（AISI）《Our evaluation of Claude Mythos Preview's cyber capabilities》。Project Perception 尚未正式发布，部分细节为知情人士向媒体透露的规划信息，可能随实际发布而调整，本文会明确标注信息的确定程度。

## 一分钟速览

- **背景**：Anthropic 今年发布的 Claude Mythos 具备自主发现未知漏洞、生成可用漏洞利用（exploit）、串联多个小漏洞形成致命攻击链、拿到网络访问权限后自动横向渗透的能力，测试中曾在所有主流操作系统和浏览器里挖出大量此前数十年未被发现的漏洞。因为能力过强，Anthropic 没有公开发布，而是通过限定合作伙伴计划 **Project Glasswing**（联合 AWS、Apple、Google、Microsoft、NVIDIA、CrowdStrike、Linux Foundation 等，配套 1 亿美元额度）小范围提供访问。
- **微软的动作**：据爆料，微软正在开发 **Project Perception**，由今年 2 月上任的微软安全负责人 **Hayete Gallot** 主导，预计**本月内（2026 年 7 月）发布**，目标是用远低于 Mythos 的成本实现类似的漏洞发现与修复能力。
- **架构关键词**：**多模型路由（model routing）**——不是单一大模型包打天下，而是把简单任务（资产清点、日志解析、常见漏洞初筛）分给低成本模型，只把复杂漏洞链分析、鉴权流程解释、修复方案生成这类真正需要"高智商"的步骤交给顶级模型（微软自家模型、OpenAI 模型、以及按 token 付费接入的 Claude Mythos 5）。
- **成本对比**：Mythos 5 定价约为输入 **10 美元/百万 token**、输出 **50 美元/百万 token**（此前受限访问阶段一度高达 25/125 美元），据称比 Opus 贵一倍、比 GPT 系列贵约 82%。Project Perception 尚未公布正式定价，但多家媒体一致认为其核心卖点就是"用路由省钱"。
- **已经在发生的事**：微软内置于 Defender 生态的 AI 漏洞扫描工具 **MDASH** 已经先行一步——最近一次 Patch Tuesday 中，微软借助 MDASH 修补了约 **570 个安全漏洞**，外媒推测这可能是 Project Perception 的"预演"或底层能力之一。
- **定位差异**：Mythos 是"研究向"的强能力模型，主打通过受限渗透测试合作把最危险的能力用在防御一方；Project Perception 更像是一款**面向企业日常运营的安全产品**，卷入微软 Defender XDR、Azure 等既有安全生态，走的是"可持续跑、审计留痕、成本可控"的产品化路线。

## 为什么这次要单独写一篇

过去两周本站已经写过 Kimi K3、Inkling 这类"新模型跑分又破纪录"的新闻，但 Project Perception 值得单独拎出来，原因不是它的模型更强，而是它代表了一条完全不同的产业逻辑：**当一家实验室做出一个能力强到"不敢公开发布"的模型时，市场留出的空白会被谁填上、怎么填**。这个问题对普通开发者、企业安全团队的现实影响，可能比又一个跑分数字更直接——因为几乎所有公司迟早都要面对"要不要把 AI 接入漏洞扫描和补丁流程"这个决定，而这决定又直接牵涉预算、审计合规和攻防两端的能力对等问题。

## Claude Mythos：为什么 Anthropic 不敢直接发布

要理解 Project Perception 想解决什么问题，先要理解 Mythos 到底强在哪、又危险在哪。根据世界经济论坛与英国 AISI（AI Security Institute）的公开评估，Claude Mythos 在受控测试中展现出几项让安全研究者印象深刻（也警觉）的能力：

1. **理解代码意图并挖掘隐藏缺陷**——只需一句简单指令，就能定位人工审计多年未发现的逻辑漏洞。
2. **漏洞链式利用**——能把多个看似无害的小漏洞组合成一次完整的攻击链。
3. **从部署产物反推源码**——即使拿不到源代码，也能通过分析部署后的二进制/服务反向重建出可分析的代码结构，进而找出可利用的弱点。
4. **拿到网络访问权限后自动化整个攻击后期流程**——自动绘制网络拓扑、横向移动、按需构建定制工具窃取数据，AISI 的评估显示这类原本需要人类专业团队数天完成的工作，Mythos 能在数小时内完成。

正因为这种能力的"双刃剑"属性——防御者能用它提前修补漏洞，攻击者一旦拿到同等能力后果同样可怕——Anthropic 选择不公开发售 Mythos，而是发起 **Project Glasswing**：一个联合云厂商、终端安全公司、操作系统厂商、开源基金会的防御性合作计划,用 1 亿美元的模型使用额度换取"让 Mythos 先给全球最重要的代码库打补丁"这件事优先发生。这个策略本质上是一种"以受控供给换取安全窗口期"的思路——但代价是，绝大多数没有资格进入 Glasswing 名单的企业和开发者，短期内根本用不上这套能力。

## Project Perception 的技术路径：不追更强，追更便宜、更能跑得久

微软显然看到了 Glasswing 计划留下的市场空白：如果顶级安全能力被锁在少数巨头手里，那么"把差不多的能力做到大多数企业都能负担、能天天用"就是一个巨大的产品机会。

根据 Windows News 的爆料细节，Project Perception 的核心设计不是训练一个比 Mythos 更强的单体模型，而是构建一个**多模型编排层（orchestration layer）**：

- **任务路由器**先对进来的工作做分类：资产清点、日志解析、已知 CVE 模式匹配这类"苦活累活"，路由给成本低廉的模型（微软自研的小模型或开源模型）处理；
- 只有当路由器判断任务涉及**复杂漏洞链分析、身份验证/授权流程语义理解、生成具体可执行的修复方案**这类真正需要强推理能力的环节时，才会调用高端模型——包括微软自家模型、OpenAI 的模型，以及按需通过 API 付费接入的 Claude Mythos 5。
- 系统承诺提供**审计线索（audit trail）和模型选择透明度**——即企业可以看到"这一步是哪个模型做的判断"，这对需要满足合规要求的安全团队而言是刚需，而不是锦上添花。

这套架构的核心商业逻辑很直白：Mythos 单独使用的 API 成本（输入 10 美元/输出 50 美元每百万 token，据称比 GPT 系列贵约 82%、比 Opus 贵一倍）如果用在企业每天产生的海量日志和资产扫描上，账单会迅速失控。而把 90% 以上"体力活"分给便宜模型、只在少数真正有价值的判断节点上调用贵模型，理论上可以把平均每份漏洞报告的成本压低一个量级——这也是标题里"cheap enough to run nonstop"（便宜到可以不间断跑）的含义：目标不是偶尔跑一次全面渗透测试，而是让 AI 漏洞扫描变成像 CI/CD 一样常态化运行的基础设施。

值得注意的是，这套"多模型路由做安全"的思路并非纯粹的空中楼阁——Neowin 报道提到，微软内置在 Defender 体系里的 AI 工具 **MDASH** 已经先行落地：在近期一次 Patch Tuesday 中，MDASH 协助微软修补了约 **570 个安全漏洞**。这个数字本身没有直接证实与 Project Perception 的架构关联，但足以说明微软在"用 AI 规模化处理漏洞"这件事上已经有实际生产数据，而不只是概念验证。Project Perception 由今年 2 月新上任的安全负责人 Hayete Gallot 主导，预计将在 7 月内正式对外亮相，但截至发稿仍未公布测试版注册渠道或正式定价。

## 给开发者的实践指南：现在就能做的"平民版"漏洞分诊路由

Project Perception 和 Mythos 目前都不对普通开发者开放，但它们验证的架构思路——**用便宜模型做初筛、只在真正需要的节点调用贵模型**——是任何团队今天就可以在自己的安全工作流里复刻的模式。下面是一个简化的参考实现，展示如何用现有的 Claude API 搭建一个成本可控的"漏洞报告分诊路由器"：

```python
import anthropic

client = anthropic.Anthropic()

# 第一层：用便宜、快速的模型做初筛和分类
def triage(finding: dict) -> dict:
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        messages=[{
            "role": "user",
            "content": (
                "以下是一条静态扫描/依赖扫描产生的原始发现，"
                "请判断其严重等级（low/medium/high/critical）"
                "以及是否需要人工或更强模型进一步分析鉴权链路和利用路径。\n\n"
                f"{finding}"
            ),
        }],
    )
    return parse_triage(resp.content[0].text)


# 第二层：只有初筛判定为 high/critical 的条目，才升级给更强的推理模型
def deep_analyze(finding: dict) -> dict:
    resp = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=2048,
        messages=[{
            "role": "user",
            "content": (
                "请分析以下高风险发现的完整利用路径、"
                "是否可与其它已知发现串联形成攻击链，"
                "并给出具体可执行的修复代码建议。\n\n"
                f"{finding}"
            ),
        }],
    )
    return parse_deep_report(resp.content[0].text)


def process_scan_results(findings: list[dict]) -> list[dict]:
    reports = []
    for f in findings:
        result = triage(f)
        if result["severity"] in ("high", "critical") or result["needs_deep_analysis"]:
            reports.append(deep_analyze(f))
        else:
            reports.append(result)  # 低风险条目，初筛结果直接归档
    return reports
```

几个可以直接落地的实践建议：

1. **先量化你的"苦活/巧活"比例**。多数安全扫描的原始输出里，80% 以上是重复的低风险噪音（比如过期依赖版本提示），真正需要复杂推理的往往不到 10%。先做这个统计，才知道路由这套架构能省多少钱。
2. **把审计线索当作一等公民设计，而不是事后补充**。Project Perception 的经验表明，企业安全团队最在意的往往不是"AI 判断得多准"，而是"能不能证明每一步是谁判断的、依据是什么"——这直接决定了这类工具能不能通过合规审查落地生产环境。
3. **不要迷信"用最贵的模型就最安全"**。Mythos 的高成本恰恰是它难以规模化落地的原因之一；把预算花在"路由策略设计"上，往往比无差别调用顶级模型更划算，也更可持续。
4. **关注 Project Glasswing 之外的替代路径**。如果你的公司够不上 Glasswing 门槛，Project Perception 这类产品化路线（以及未来大概率跟进的其他厂商方案）会是更现实的接入点，值得提前评估其审计能力和数据驻留策略是否满足自己的合规要求。

## 总结与展望

Claude Mythos 和 Project Perception 这两件事放在一起看，勾勒出 AI 安全领域正在成型的一个新格局：**能力最强的模型不再一定是"能公开买到"的模型**，围绕如何在保证安全的前提下把这类能力规模化下沉，正在成为云厂商、操作系统厂商与模型公司之间新的竞争维度。对 Anthropic 而言，Project Glasswing 是一种"先把能力用在防御自己人身上"的谨慎打法；对微软而言，Project Perception 押注的是"我不需要造出最强的模型，但我可以用工程和路由把差距做到大多数企业无法拒绝的性价比"。

对普通开发者和中小团队来说，短期内两者都还摸不到——Mythos 锁在 Glasswing 名单里，Perception 连测试版都还没开放注册。但这场竞赛验证的架构思路（多模型路由、分层调用、审计留痕）已经足够清晰，也完全可以用今天就能拿到的 API 自己搭一套简化版。随着 7 月下旬 Perception 大概率正式亮相，以及 Anthropic、OpenAI 在安全垂类模型上的进一步动作，"AI 原生的漏洞发现与自动修复"很可能会在未来一年内，从少数巨头的专属能力，逐步变成中大型企业安全团队的标配工具链——这个变化值得每一个维护线上服务的团队提前关注。

## 参考链接

**核心报道**

- TechRepublic《Microsoft's 'Project Perception' Could Challenge Anthropic's Mythos in AI Security》：[techrepublic.com](https://www.techrepublic.com/article/news-microsoft-project-perception-ai-security-tool/)
- The Information《Exclusive: Microsoft Preps Mythos-Like AI Bug Finder》：[theinformation.com](https://www.theinformation.com/briefings/exclusive-microsoft-preps-mythos-like-ai-bug-finder)
- Windows News《Microsoft's Project Perception Aims to Make AI Vulnerability Fixing Cheap Enough to Run Nonstop》：[windowsnews.ai](https://windowsnews.ai/article/microsofts-project-perception-aims-to-make-ai-vulnerability-fixing-cheap-enough-to-run-nonstop.439207)
- Neowin《Recent patches for Windows 11 could have been created by Microsoft's new Mythos rival》：[neowin.net](https://www.neowin.net/news/recent-patches-for-windows-11-could-have-been-created-by-microsofts-new-mythos-rival/)
- Phemex News《Microsoft to Launch AI Vulnerability Detection Tool in July》：[phemex.com](https://phemex.com/news/article/microsoft-to-launch-ai-vulnerability-detection-tool-this-month-93543)
- Inshorts 摘要《Microsoft to launch AI cyber defence tool to rival Anthropic's Mythos》：[inshorts.com](https://inshorts.com/en/news/microsoft-to-launch-ai-cyber-defence-tool-to-rival-anthropic-s-mythos--report-1784312069097)

**Mythos 与 Project Glasswing 背景**

- World Economic Forum《Anthropic's Mythos moment: how frontier AI is redefining cybersecurity》：[weforum.org](https://www.weforum.org/stories/2026/04/anthropic-mythos-ai-cybersecurity/)
- 英国 AI 安全研究院（AISI）《Our evaluation of Claude Mythos Preview's cyber capabilities》：[aisi.gov.uk](https://www.aisi.gov.uk/blog/our-evaluation-of-claude-mythos-previews-cyber-capabilities)
