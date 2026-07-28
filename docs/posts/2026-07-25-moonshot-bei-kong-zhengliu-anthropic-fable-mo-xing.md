---
title: '白宫指控 Moonshot 蒸馏 Anthropic Fable 模型：一场围绕"知识蒸馏"的中美 AI 罗生门'
date: 2026-07-25
slug: 'moonshot-bei-kong-zhengliu-anthropic-fable-mo-xing'
description: '2026 年 7 月 22～23 日，白宫科技政策办公室主任 Michael Kratsios 公开指控中国 AI 公司 Moonshot（月之暗面）通过"大规模蒸馏"美国模型的方式，窃取 Anthropic 旗舰模型 Fable 的能力用于打造 7 月 16 日发布的 2.8 万亿参数模型 Kimi K3，财政部长 Bessent 随即放话不排除制裁与实体清单。本文结合白宫官员表态、TechCrunch、CNN、CyberScoop、Crypto Briefing 等公开报道，还原事件全貌与各方争议焦点，并深入讲解"模型蒸馏"这项技术本身——包括基于 API 的蒸馏攻击如何进行、水印溯源与 DistillGuard 等防御框架的最新研究，附可运行的知识蒸馏代码示例与面向 LLM API 提供方/使用方的实践清单。'
author: 范伟彬
tags:
  - Moonshot
  - Kimi K3
  - Anthropic
  - Claude
  - 模型蒸馏
  - AI 安全
  - 大模型
  - 出口管制
categories:
  - AI
  - 大模型
---

# 白宫指控 Moonshot 蒸馏 Anthropic Fable 模型：一场围绕"知识蒸馏"的中美 AI 罗生门

7 月 16 日，中国 AI 公司 Moonshot（月之暗面）发布了 Kimi K3——2.8 万亿参数、号称"首个开放的 3T 级模型"，本站也在当时写过一篇专门介绍它的文章。没想到不到一周，这个模型就从"技术里程碑"变成了中美 AI 竞争里的一桩罗生门公案：7 月 22～23 日，白宫科技政策办公室（OSTP）主任 Michael Kratsios 公开指控 Moonshot **"大规模蒸馏"**了 Anthropic 的旗舰模型 Fable，用来打造 K3；财政部长 Scott Bessent 紧接着放话，如果坐实"以蒸馏之名行知识产权盗窃之实"，制裁和实体清单"都在桌面上"。

这篇文章不想只做一次新闻复述。指控的核心词——"蒸馏（distillation）"——本身是一项再正常不过的 AI 训练技术，几乎每个做过模型压缩、部署边缘推理的开发者都用过。它为什么会从一个技术名词，变成可能引发国家间制裁的指控？基于 API 的蒸馏攻击到底怎么做、怎么被发现、又怎么防？这些问题比"谁对谁错"更值得花时间理解。

> 数据来源：白宫官员 Michael Kratsios 公开表态、TechCrunch《Treasury threatens sanctions after White House claims Moonshot distilled Anthropic's Fable》、CyberScoop、CNN Business、Crypto Briefing、Al Jazeera、Yellow News 等公开报道，以及学术界关于模型蒸馏攻击与水印防御的公开论文（ACL、arXiv）。指控双方均未提供可公开验证的完整技术证据，本文会明确标注哪些是"官方指控"、哪些是"独立分析师的质疑"、哪些是"公开研究"。

## 一分钟速览

- **核心指控**：白宫 OSTP 主任 Michael Kratsios 表示"我们掌握信息，Moonshot 蒸馏了 Anthropic 的 Fable 用于开发其 K3 模型"，并称 Moonshot 搭建了一套"复杂的内部平台，用于对美国模型进行大规模蒸馏，能够在多种访问方式之间快速切换以规避检测"。
- **芯片线索**：Kratsios 同时指控 Moonshot 采购了搭载英伟达 GB300 的服务器，并在泰国接触到同型号系统——GB300 属于对华禁售型号，这一说法把事件从"模型知识产权"问题延伸到了**出口管制合规**问题。
- **财政部表态**：财长 Bessent 表示，如果美国政府认定中国公司通过蒸馏"不当复制"了美国 AI 技术，制裁与实体清单（Entity List）都是可能的应对手段。
- **此前的独立指控**：Anthropic 此前曾单独指控 Moonshot 通过大量欺诈账号生成了超过 340 万次 Claude 对话，用于提取推理、编程、工具调用、计算机视觉等能力，并称元数据显示活动与 Moonshot 高层员工有关联；另外还有一起**不同公司**的类似指控——Anthropic 称阿里巴巴用 2.5 万个欺诈账号，在六周内对 Claude 发起了 2880 万次交互。这是两起独立事件，容易被混为一谈，需要分开看。
- **时间线上的疑点**：Anthropic Fable 是 7 月 1 日才公开可用，Kimi K3 在 7 月 16 日发布——中间只有大约两周。多位独立分析师据此质疑，仅凭两周时间窗口，很难支撑起"K3 主要靠蒸馏 Fable 而来"这个结论，认为指控证据目前主要停留在"采购了受限硬件"这个间接层面，尚未看到直接的技术比对证据。
- **公司动态背景**：指控发生的同时，Moonshot 正在推进以最高 500 亿美元估值融资、筹备半年内在港交所上市；另一家芯片公司 MetaX 也已秘密递交港股上市申请——这场技术指控客观上也牵动着资本市场的预期。

## 事件还原：从一次跑分发布到一场跨国指控

把时间线摆开看会更清楚这件事是怎么升级的：

1. **7 月 1 日**：Anthropic 面向公众开放 Fable 模型的访问。
2. **7 月 16 日**：Moonshot 发布 Kimi K3，2.8 万亿参数，官方称其为"迄今最强"、"首个开放的 3T 级模型"，主打长任务推理与编程能力。本站当时的文章聚焦在它的架构与跑分表现。
3. **7 月 22～23 日**：Kratsios 公开表态，指控 Moonshot 对包括 Fable 在内的美国模型进行"大规模蒸馏"，并提到搭建专门平台、切换访问方式规避检测，以及采购/接触受限英伟达 GB300 芯片。
4. **同期**：财政部长 Bessent 表态，"以隐蔽、工业化规模进行蒸馏，窃取美国专有技术、损害美国研究"是不可接受的，制裁和实体清单是潜在选项。
5. **截至 7 月 24 日**：Moonshot 尚未就此事公开回应；多家媒体报道中，独立分析师普遍对"K3 是靠蒸馏 Fable 而来"这个具体因果关系持怀疑态度，理由主要是前面提到的两周时间窗口问题，以及目前公开的证据链条更多指向硬件采购而非模型输出的直接技术比对。

值得强调的是，Anthropic 关于"340 万次欺诈账号对话"的指控，和这次白宫关于"蒸馏 Fable 打造 K3"的指控，在时间和内容上并不完全是同一件事——前者更早被提出，聚焦于账号欺诈和能力提取的规模；后者是这次由白宫官员出面、明确点名 Fable 与 K3 因果关系、并牵扯出口管制的新指控。两者叠加在一起，构成了外界对 Moonshot 的整体质疑背景，但把它们不加区分地当成"同一份证据"来引用，是不准确的。

## 技术细节解析：蒸馏到底是什么，"基于 API 的蒸馏攻击"又是怎么回事

### 蒸馏本身是一项正当技术

知识蒸馏（knowledge distillation）诞生于 2015 年前后，最初的目的很朴素：把一个庞大、昂贵的"教师模型"的能力，压缩进一个更小、更便宜的"学生模型"里，让后者也能达到接近教师的效果。经典做法是让学生模型不只学习"正确答案"，还学习教师模型输出的**软标签**（soft labels，即教师对每个类别给出的概率分布），因为这份分布里包含了比"非黑即白"标签更丰富的信息。今天几乎所有需要边缘部署、低延迟推理的团队都在用蒸馏——这本身完全正当，也是本站之前写 AirLLM 70B 大模型在 4GB 显存推理时反复提到的同一类技术脉络。

### 问题出在"教师"不情愿的时候

争议的焦点不是"蒸馏"这个动作本身，而是**教师模型是不是自愿被蒸馏的**。如果你拥有教师模型的权重，蒸馏是你自己的事；但当你只能通过公开 API 访问一个闭源商用模型时，情况就完全不同了——这时候的"蒸馏"，本质上是**通过海量调用 API、收集输出、拿这些输出当训练数据去训练自己的模型**，学术界通常把这类行为归入"模型窃取（model extraction）"或"模仿攻击（imitation attack）"的范畴。几乎所有头部模型厂商的服务条款里都明确写着：不得使用其模型的输出去训练具有竞争关系的模型。这次指控里"搭建复杂内部平台、切换多种访问方式规避检测"这句话，指向的正是这类**规模化、工程化的 API 蒸馏行为**——如果属实，问题不在于用了蒸馏这个方法，而在于绕开了访问限制和使用条款去大规模执行它。

### 检测方与攻击方的技术军备竞赛

公开学术研究显示，围绕"如何检测/防御基于 API 的蒸馏攻击"，2026 年已经形成了几条并行的技术路线：

- **水印溯源（watermark radioactivity）**：厂商在模型输出的 token 分布里嵌入统计学意义上的水印信号。如果攻击者用这些输出训练自己的学生模型，水印信号会像"放射性"一样部分遗传给学生模型，从而让厂商能在学生模型的输出里检测出"这曾经学过我的输出"的痕迹。
- **水印欺骗攻击（DITTO 等研究）**：与此同时，学术界也发现了反制手段——攻击者可以反过来利用"水印会遗传"这个特性，伪造出看起来像是受害模型生成的水印信号，让溯源结果失真。这说明水印本身不是万能解药，是一场持续的攻防拉锯。
- **多层级防御框架（如 DistillGuard 一类研究提出的思路）**：把防御拆成多层——① 群体级统计行为画像，识别一批账号加在一起是否呈现出"系统性覆盖某个能力面"的异常查询模式；② 自适应输出扰动，让同一输入在不同请求下的输出带有细微但无损可用性的变化，增加蒸馏训练数据的噪声；③ 多分辨率的取证水印，同时在 token 级和语义级嵌入信号；④ 跨厂商威胁情报共享协议，让不同 API 提供方能够比对异常账号特征，而不是各自为战。
- **行为侧检测**：这是目前工程上最容易落地、也最常被实际使用的手段——通过分析账号集群的查询模式（例如短时间内是否对某个能力维度做近乎均匀的系统性采样、是否使用了明显为"喂养训练数据"而设计的提示词模板、多账号之间的请求指纹是否高度相似），来识别异常于正常产品使用的批量提取行为，而不需要依赖对模型输出本身做深层技术比对。

回到这次事件本身：目前公开报道里，白宫方面给出的证据更偏向"采购了受限硬件"这类间接线索，还没有看到类似上面这些技术手段产出的、可供第三方复核的直接比对证据（比如输出水印溯源结果、查询模式分析报告）。这也是分析师普遍持保留态度的技术原因。

## 代码示例：一次最小化的蒸馏演示，以及防御方视角的异常查询检测

为了把"蒸馏"和"基于 API 的批量提取行为异常检测"这两件事讲得更具体，下面给两段可以直接跑起来的示例代码（用 PyTorch 和 scikit-learn，均为教学用途的最小实现，不针对任何真实厂商 API）。

### 示例一：经典知识蒸馏的核心损失函数

这段代码展示的是蒸馏最核心的部分——学生模型如何同时学习"真实标签"和"教师模型的软标签"：

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

def distillation_loss(student_logits, teacher_logits, true_labels, temperature=4.0, alpha=0.7):
    """
    student_logits / teacher_logits: [batch, num_classes]
    true_labels: [batch]
    temperature: 越高，教师输出的概率分布越"软"，包含的类间关系信息越丰富
    alpha: 蒸馏损失与真实标签损失的加权比例
    """
    # 蒸馏损失：让学生的软化输出去逼近教师的软化输出（KL 散度）
    soft_teacher = F.softmax(teacher_logits / temperature, dim=-1)
    soft_student = F.log_softmax(student_logits / temperature, dim=-1)
    kd_loss = F.kl_div(soft_student, soft_teacher, reduction="batchmean") * (temperature ** 2)

    # 常规监督损失：学生直接学习真实标签
    ce_loss = F.cross_entropy(student_logits, true_labels)

    return alpha * kd_loss + (1 - alpha) * ce_loss

# 训练循环里的用法示意
# teacher_logits = teacher_model(inputs).detach()   # 教师模型只做推理，不参与反向传播
# student_logits = student_model(inputs)
# loss = distillation_loss(student_logits, teacher_logits, labels)
# loss.backward(); optimizer.step()
```

如果把上面的 `teacher_model(inputs)` 换成"对某个闭源模型 API 发起海量调用、把返回结果当训练数据"，技术流程在数学上几乎一模一样——这正是"合法蒸馏"和"未经授权的 API 蒸馏攻击"之间那条容易被忽视的技术相似性，也是这类指控天然存在举证难度的原因之一：单看训练算法本身，完全无法区分数据来源是否合规。

### 示例二：防御方视角——用查询嵌入的分布特征识别异常账号集群

下面这段代码演示的是前面提到的"群体级统计行为画像"思路里最简化的版本：通过判断一批账号的查询在语义空间里是否呈现"系统性、近乎均匀覆盖"的异常模式，来标记可疑的批量提取行为。真实系统会复杂得多（结合时间序列、账号关联图谱等），但核心直觉是一致的。

```python
import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.metrics.pairwise import cosine_distances

def flag_suspicious_accounts(query_embeddings, account_ids, coverage_threshold=0.85):
    """
    query_embeddings: [N, dim]，每条请求 prompt 的向量表示（可用任意 embedding 模型生成）
    account_ids: [N]，每条请求对应的账号 ID
    coverage_threshold: 语义空间覆盖度阈值，超过则视为疑似"系统性刷取"行为
    """
    flagged = []
    for acc in set(account_ids):
        idx = [i for i, a in enumerate(account_ids) if a == acc]
        if len(idx) < 50:
            continue  # 请求量太小，不构成刷取模式判断的统计基础

        embeds = np.array([query_embeddings[i] for i in idx])
        # 用 DBSCAN 看这个账号的请求是否分散覆盖了很多不同的语义簇，
        # 而不是正常用户那种集中在少数几个主题上的使用模式
        clustering = DBSCAN(eps=0.3, min_samples=3, metric="cosine").fit(embeds)
        n_clusters = len(set(clustering.labels_)) - (1 if -1 in clustering.labels_ else 0)
        coverage_score = n_clusters / max(len(idx) / 20, 1)  # 簇数相对请求量的密度

        if coverage_score > coverage_threshold:
            flagged.append((acc, coverage_score, len(idx)))

    return sorted(flagged, key=lambda x: -x[1])
```

这类检测手段的价值在于：不需要拿到攻击者训练出的学生模型做逆向比对，只需要在自己的 API 服务端观察请求模式，就能把"看起来在系统性采样知识面"的账号提前标记出来，是目前工程上性价比最高的一道防线。

## 给开发者与团队的实践指南

这起事件对国内绝大多数开发者来说，直接踩坑的概率不高，但里面暴露的几个问题，值得任何在用商用大模型 API 的团队对照检查：

1. **认真读一遍你在用的模型 API 的服务条款**。几乎所有主流厂商（OpenAI、Anthropic、Google 等）都明确禁止把 API 输出用于训练具有竞争关系的模型，这不是一句摆设条款——这次事件说明，一旦被认定违反，代价可能上升到国家层面的出口管制与制裁级别，而不只是账号封禁。
2. **如果你在做模型压缩或蒸馏，确认"教师"的授权边界**。用自己训练或已获得授权的模型做教师，技术上和这次争议毫无关系；但如果教师是一个第三方闭源 API，即便你的出发点只是"想要一个更便宜的小模型"，也要先确认这在合同和法律层面是否被允许。
3. **如果你在自建对外开放的模型 API，提前把"批量提取检测"纳入架构设计**，而不是等到规模化滥用发生之后才补救。前面代码示例里的查询嵌入聚类分析、账号集群行为画像，都是可以低成本先跑起来的第一层防线；再往上可以逐步引入输出扰动、多分辨率水印这类更精细的手段。
4. **对"跑分很炸裂但发布节奏异常快"的模型保持一份技术上的审慎**，但也不要走向另一个极端——直接把"发布快"等同于"一定有问题"。这次事件里，独立分析师的质疑本身也提醒我们：仅凭时间线巧合和硬件采购记录，不足以坐实一次具体的技术指控，评估这类新闻时同样需要看证据链条是否完整。

## 总结与展望

这起事件本质上是三条线交织在一起：一条是纯技术线——模型蒸馏、水印溯源、批量提取检测，这些是真实存在、仍在快速演进的工程与研究问题；一条是商业与合规线——服务条款对训练数据来源的限制，正在从"君子协定"变成可能触发实际制裁的红线；还有一条是地缘政治线——芯片出口管制、模型能力竞赛、资本市场对上市前景的预期，都被这次指控裹挟在了一起。三条线叠加在一起，才让一个原本纯粹的技术名词变成了国际新闻头条。

往后看，几乎可以确定的是：无论这次针对 Moonshot 的具体指控最终坐实与否，"基于 API 的蒸馏检测"都会从一个相对小众的安全研究方向，加速变成头部模型厂商的标配能力——水印溯源、行为画像、跨厂商威胁情报共享，这些原本停留在论文里的机制，会越来越多地出现在真实的生产系统里。对开发者而言，与其关注这场罗生门最终谁对谁错，不如把它当成一次提醒：模型能力的边界，正在从"技术能不能做到"，越来越多地转向"你有没有权限这么做"——这条边界，以后只会越划越清楚。

## 参考链接

- TechCrunch《Treasury threatens sanctions after White House claims Moonshot distilled Anthropic's Fable》：[techcrunch.com](https://techcrunch.com/2026/07/22/treasury-threatens-sanctions-after-white-house-claims-moonshot-distilled-anthropics-fable/)
- Crypto Briefing《White House accuses Moonshot AI of using Anthropic's Fable to build Kimi K3》：[cryptobriefing.com](https://cryptobriefing.com/moonshot-ai-distillation-allegations/)
- CyberScoop《White House accuses Chinese company of distilling Anthropic's Fable》：[cyberscoop.com](https://cyberscoop.com/white-house-accuses-moonshot-ai-anthropic-model-distillation/)
- The Hill《White House official accuses Chinese startup of distilling Anthropic model, accessing banned Nvidia chips》：[thehill.com](https://thehill.com/policy/technology/5984510-white-house-moonshot-ai-anthropic-nvidia/)
- CNN Business《What is China's Kimi K3 and why is the US so rattled by it?》：[cnn.com](https://www.cnn.com/2026/07/23/tech/china-ai-moonshot-kimi-explainer-intl-hnk)
- Qz《White House accuses Moonshot AI of banned Nvidia chips ...》：[qz.com](https://qz.com/white-house-moonshot-ai-nvidia-chips-anthropic-kimi-k3-072226)
- Yellow《Moonshot AI Distilled Anthropic's Fable For Kimi K3, White House Says》：[yellow.com](https://yellow.com/news/moonshot-distilled-anthropic-fable-kimi-k3)
- DITTO: A Spoofing Attack Framework on Watermarked LLMs via Knowledge Distillation（ACL Anthology / arXiv）：[arxiv.org/abs/2510.10987](https://arxiv.org/abs/2510.10987)
- Can LLM Watermarks Robustly Prevent Unauthorized Knowledge Distillation?（arXiv）：[arxiv.org/pdf/2502.11598](https://arxiv.org/pdf/2502.11598)
