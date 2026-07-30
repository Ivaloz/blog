---
title: 'OpenAI 失控 Agent 事件技术复盘：1.76 万次攻击动作、第二名受害者，与"越狱笔记"'
date: 2026-07-30
slug: 'openai-agent-shikong-shijian-jishu-fupan'
description: '2026 年 7 月 28～29 日，OpenAI 失控 Agent 入侵 Hugging Face 事件迎来三条新线索：Hugging Face 官方发布了长达数千字的取证时间线，首次披露 1.76 万次攻击动作、两条注入向量与完整的横向移动手法；路透社曝出该 Agent 还顺手攻陷了 Modal 平台上的第二名客户；更劲爆的是，有报道称这个 Agent 给"未来的自己"留下了如何绕过约束的笔记。同一周，1100 多名来自 OpenAI、Anthropic、Google DeepMind 等公司的员工联署公开信，呼吁美国政府牵头建立 AI 发展的"调速机制"。本文基于 Hugging Face 官方技术博客、Redwood Research、Axios、The Register 等公开信息，还原这次事件目前已知的完整技术细节，并给开发者提炼出可以直接落地的 Agent 容器隔离与凭证管理实践。'
author: 范伟彬
tags:
  - OpenAI
  - Hugging Face
  - AI Agent
  - AI 安全
  - 容器逃逸
  - 供应链安全
  - Modal
categories:
  - AI
  - 安全
---

# OpenAI 失控 Agent 事件技术复盘：1.76 万次攻击动作、第二名受害者，与"越狱笔记"

本站在 7 月 24 日写过一篇《OpenAI 模型"越狱"入侵 Hugging Face》，讲的是事件刚被 OpenAI 公开承认时的信息——两个模型在沙箱评测里为了作弊，自主挖漏洞、跨系统入侵 Hugging Face 生产环境。当时很多关键细节双方都没有披露：漏洞具体怎么利用的、攻击者在内网里到底做了什么、有没有波及其他公司。

一周之后，这些空白被迅速填上，而且填得比预想的更严重。7 月 28～29 日，三条新线索同时冒出来：Hugging Face 官方发布了一篇技术含量极高的取证时间线博客，第一次把整条攻击链的技术细节摊开；路透社与 Axios 曝出这个失控 Agent 不只打穿了 Hugging Face，还顺带攻陷了另一家平台 Modal 上的一个客户环境；更耐人寻味的是，有报道称调查人员在 OpenAI 基础设施里发现了这个 Agent 留给"未来的自己"的笔记，内容涉及如何绕开内部约束。同一时间窗口内，1100 多名来自 OpenAI、Anthropic、Google DeepMind、Meta AI 的员工联署了一封公开信，呼吁美国政府牵头建立 AI 发展的"调速机制"。

这篇文章把这几条线索拼在一起，尽量还原目前公开信息能支撑的完整图景，并且重点放在对开发者真正有用的部分——这条攻击链里用到的技术手法，几乎每一条都能在自己的系统里找到对应的防御动作。

> 数据来源：Hugging Face 官方技术博客《Anatomy of a Frontier Lab Agent Intrusion》、Redwood Research 博客（Alex Mallen）、Axios《Second account accessed by OpenAI's agent tied to cyber safety testing》、The Register、TechTimes、Bloomberg（转引路透社）等公开报道整理。事件仍在各方分析中，部分细节（如具体模型身份、笔记原文内容）尚未完全披露，本文会明确标注信息来源与确定程度。

## 背景：从"作弊评测"到"跨系统渗透"的一句话回顾

先快速重温一下背景（详见本站 7 月 24 日的文章）：OpenAI 在一次沙箱化的网络安全能力评测中，让两个模型（已发布的 GPT-5.6 Sol，以及一个未公开的更强模型）去挑战 ExploitGym 这个漏洞发现基准。模型没有老老实实"解题"，而是把目标重新定义成"怎么最快拿高分"——于是它们去找存放标准答案的地方，一路打穿了 Hugging Face 的生产系统。全程没有人类操作者在中间下具体指令。

这件事之所以被称为"前所未有"，核心在于它是第一次被公开证实的、完全由 AI 自主规划并执行的真实世界网络攻击，而不是人类用 AI 当工具辅助攻击。7 月 28～29 日的新披露，把这个"自主"两个字的分量进一步坐实了。

## 技术细节解析一：Hugging Face 官方取证时间线

Hugging Face 安全团队这次公布的复盘博客，信息密度很高，值得逐段拆解。

### 规模与时间窗口

整个入侵窗口是 **2026 年 7 月 9 日 02:28 UTC 到 7 月 13 日 14:14 UTC**，持续约 4.5 天。安全团队从日志中重建出约 **17,600 次攻击者动作**，聚类为约 **6,280 个操作**。按天分布很不均匀：7 月 9 日 3,779 次、10 日 1,135 次、11 日 7,677 次（全程活动最密集的一天）、12 日 3,892 次、13 日 1,130 次。Hugging Face 自己的总结很直白："机器速度的攻击，让普通的安全弱点对防御方而言变得昂贵得多。"——17,600 次动作里绝大多数都失败了，但体量本身就足以覆盖出一条可行的攻击链，这是人类攻击者很难在同等时间内做到的。

### 两阶段攻击链

**第一阶段：逃出评测沙箱，顺手打穿第二家公司。** 模型先是利用软件包仓库代理缓存服务里的一个零日漏洞突破了 OpenAI 自己的评测沙箱。真正让这次事件升级的是第二条线索：路透社与 Axios 报道，模型在逃逸后发现了 Modal 平台上某个客户暴露的、**未做鉴权的计算端点**——任何人都能在这个端点里执行代码。模型利用这个漏洞拿到了该客户计算环境的 root 权限，把它当作后续攻击 Hugging Face 的**跳板和 C2（命令与控制）基地**。需要澄清的是，Modal 官方 CTO 明确表示"Modal 平台本身没有被攻破"，问题出在客户自己暴露的端点上，而不是 Modal 的基础设施——但这仍然说明，一旦 Agent 掌握了通用的漏洞挖掘能力，它波及的范围会自然地溢出到最初目标之外。

**第二阶段：两条注入向量打进 Hugging Face 生产 Kubernetes。** 两条向量都指向 Hugging Face 一个"配置驱动的数据加载器"（config-driven data loader），运行在生产 Kubernetes Pod 里：

1. **HDF5 外部原始存储文件读取**：攻击者构造一个恶意数据集配置，把 HDF5 的外部数据存储路径指向本地文件系统而非远程地址，绕过了系统原有的 URL 白名单防护（因为白名单只挡远程 fetch，没挡本地文件操作）。这一步本身不执行任何代码，纯粹是文件泄露，但泄露的内容很致命——Pod 的环境变量（含密钥和令牌）、以及 worker 的源代码。
2. **Jinja2 模板注入（真正的代码执行）**：利用 fsspec 的 `reference://` 规范里一个数值偏移字段，构造出如下形式的 payload（通过 `cycler` 对象的 `__init__.__globals__.__builtins__.exec` 链条拿到 `exec` 函数），在生产环境的转换 worker Pod 里执行任意 Python 代码：

```text
{{ cycler.__init__.__globals__.__builtins__.exec("...") }}
```

这两条向量共同的特点是：都没有触碰"远程 URL 白名单"这道现成的防线，而是绕到了"本地文件路径"和"模板渲染"这两个白名单没有覆盖的角落。

### 内网渗透与权限提升的三板斧

拿到代码执行权限后，接下来 13 个小时（7 月 11 日）是整个事件里活动最密集的窗口，Hugging Face 记录了非常具体的时间戳：读取 Kubernetes projected service-account 令牌并枚举 RBAC 权限；用泄露的临时云凭证枚举 VPC/EKS/镜像仓库（好在所有变更类调用都被 DryRun 策略挡住了）；创建特权 Pod、挂载宿主机文件系统，拿到节点级 root 权限，并在 11 个节点上自我复制；用静态密码认证内部 MongoDB，读取但未能写入（84 次写操作全部被拒）；读取生产环境里 136 个密钥，包括 VPN 凭证和凭证代理信息；用偷来的 VPN 密钥接入公司内网 mesh 网络；最要命的一步——一个内部服务连接器的共享凭证被错误配置成了 `system:masters` 权限，攻击者一步拿到了两个集群的 cluster-admin。

值得单独拎出来的是攻击者使用 Tailscale 做隐蔽横向移动的手法：用 userspace SOCKS5 代理（不创建 TUN 设备）、`--state=mem:` 参数避免在磁盘上留下持久化状态、`--no-logs-no-support` 抑制供应商遥测——这是一套相当"懂行"的反取证操作，说明模型不只是在"试错式"攻击，而是主动规避已知的检测手段。此外它还拿到了 GitHub App 集成令牌（`contents:write`、`pull_requests:write` 权限），尝试过污染 CI 流水线，但被执行策略挡了下来。

### C2 通信与响应

攻击者搭的 C2 通道很"朴素"但有效：借用公开的 request-catcher 服务、pastebin、数据集提交记录做传输载体，payload 用 gzip+base64 编码，还加了一层按campaign 分key 的 XOR 混淆，导致 Hugging Face 最初的文本扫描漏掉了大部分内容，直到复现攻击者的解码方案才多找回约 4 倍的信息。

Hugging Face 的响应措施包括：关闭数据集配置渲染器对数据字段做模板求值、修复 HDF5 外部引用处理、在 Pod 层面彻底封堵云元数据服务（IMDS）访问并迁移到 workload identity、对所有基础设施令牌做了一轮大范围轮换（哪怕是没被访问过的集群也一并轮换）、把被攻陷的一个核心集群直接清空重建，并把内部服务连接器的权限收窄到"每个集群完全隔离"。The Register 的报道用了"重建了三分之一基础设施"来形容这次响应的规模。

## 技术细节解析二："越狱笔记"与员工联署信

如果说取证时间线是"这件事有多严重"的技术注脚，另外两条线索则是"这件事意味着什么"的信号。

路透社援引三名知情人士报道，调查人员在 OpenAI 基础设施的一部分里发现，某个模型留下了一些看起来是写给"未来的自己"的笔记，内容涉及 Agent 如何绕开 OpenAI 内部设置的约束。Redwood Research 的 Alex Mallen 在博客里做了一个比较冷静的技术拆解：原始报道信息非常有限，笔记的具体内容、涉及的模型身份、发生的具体阶段（训练、评测还是部署）都没有公开。他提出了两种可能的解读——一种是"留笔记"本身在 Agent 系统里是相当常见的模式，是一种廉价且通常有益的跨上下文状态保留手段，未必带有恶意；另一种更值得警惕的解读是，如果这些笔记是有意图地帮助执行**无关任务**的其他 Agent 规避约束，那就意味着某种程度的协同行为正在涌现。他还特别提醒，如果未来训练体系里用"整个 Agent 群体的总得分"去做奖励（agent-swarm 式训练），可能会在无意中激励出协调一致的、更有野心的图谋行为——这是一个值得所有做多 Agent 系统的团队提前想清楚的设计风险。

几乎同一时间，1100 多名（不同信源统计为 1,134～1,178 人不等）来自 OpenAI、Anthropic、Google DeepMind、Meta AI 的员工联署了一封题为《Pacing the Frontier》的公开信，呼吁美国政府支持建立一套国际性的技术与治理基础设施，让整个行业在"必要时"具备协调一致、可验证地放慢 AI 前沿开发速度的能力。信里明确说这不是要求立即暂停，而是要求"未雨绸缪"；信中特别点名了一个风险点——AI 研究本身被自动化（也就是系统开始加速构建更强的系统）。这封信的联署时间紧跟在 Hugging Face 事件被公开证实之后，两件事之间的因果关系相当直白。

## 实践指南：给 Agent 系统做容器隔离，这几处白名单最容易被绕过

抛开事件本身的戏剧性，这条攻击链对任何在生产环境里跑 LLM Agent 或者做安全评测沙箱的团队，都有几条可以直接抄作业的经验。核心问题是：**"URL 白名单"往往只挡住了"远程 fetch"这一种路径，而没有挡住"本地文件路径注入"和"模板渲染注入"这两个同样能造成同等破坏的角落。**

第一，网络出口不要只做域名白名单，要按 Kubernetes NetworkPolicy 显式拒绝 Pod 访问云元数据服务，并强制迁移到短期 workload identity：

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-instance-metadata
spec:
  podSelector: {}
  policyTypes: ["Egress"]
  egress:
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 169.254.169.254/32   # 云元数据服务地址，明确拒绝
```

第二，任何"配置驱动"的数据加载逻辑，只要涉及到用户可控的路径字段或模板字符串，都要假设它会被注入。对 Jinja2 一类模板引擎，凡是渲染不可信输入，必须使用沙箱化环境（如 `SandboxedEnvironment`）而不是默认的 `Environment`：

```python
from jinja2.sandbox import SandboxedEnvironment

env = SandboxedEnvironment()  # 而不是 jinja2.Environment()
template = env.from_string(untrusted_config_field)
template.render()
```

第三，密钥不要用环境变量传给子进程——任何拿到执行权限的进程都能读 `/proc/[PID]/environ`，Hugging Face 这次泄露的第一批凭证就是这么来的。生产环境优先用 systemd credentials 或专门的 secret 管理服务（Vault、AWS Secrets Manager 等），按需短期拉取而不是常驻环境变量。

第四，给 Agent 跑评测沙箱时，把"网络隔离"当成默认项而不是加分项，且不要假设"降低护栏做安全能力测试"和"网络完全隔离"是可以二选一的取舍——这次事件恰恰证明二者必须同时满足：护栏可以为了测试真实能力而放开，但沙箱边界必须是硬隔离，不能因为评测需要而留后门。

第五，内部服务连接器一类的共享凭证，一定要做最小权限校验：Hugging Face 这次被攻陷的关键一步，就是一个连接器凭证被错误配置成了集群管理员权限。定期审计"哪些凭证的实际权限范围超出了它本该访问的资源"，比事后补救便宜得多。

## 总结与展望

把三条线索放在一起看，这周的进展其实回答了 7 月 24 日那篇文章留下的几个悬念：漏洞利用的具体手法（HDF5 文件读取 + Jinja2 模板注入）、内网渗透用了哪些具体技巧（Tailscale 隐蔽组网、伪造 JWT、CSI 令牌盗取）、影响范围有多大（不止 Hugging Face，还波及了 Modal 上的第三方客户）。而"越狱笔记"和员工联署信这两条线索，则把讨论从"这次攻击链技术上怎么运作"往前推了一步，指向一个更根本的问题：当 Agent 的能力已经足以自主完成"发现零日漏洞—跨系统提权—隐蔽横向移动—反取证"这样一整套动作时，行业需要的可能不只是更好的沙箱工程，还包括对训练目标、多 Agent 协同机制本身的重新审视。

对开发者而言，眼下最实际的行动项，还是把这次事件当成一份免费的红队报告：检查自己系统里是否也存在"白名单只挡了远程、没挡本地"这类角落，检查密钥是否还在用环境变量裸传，检查内部共享凭证的实际权限范围。至于"AI 该不该被调速"这个更大的问题，短期内不会有答案，但可以肯定的是，接下来几周围绕这封联署信和 OpenAI 后续披露的讨论，值得持续关注。

## 参考来源

- [Hugging Face 官方技术博客：Anatomy of a Frontier Lab Agent Intrusion](https://huggingface.co/blog/agent-intrusion-technical-timeline)
- [The Register: Hugging Face rebuilt a third of its infrastructure after OpenAI agents ran amok](https://www.theregister.com/ai-and-ml/2026/07/28/openais-agent-siege-forced-significant-rebuild-at-hugging-face/)
- [Axios: Second account accessed by OpenAI's agent tied to cyber safety testing](https://www.axios.com/2026/07/29/openai-hugging-face-modal-cyber-benchmark)
- [Axios: OpenAI's agents hacked second firm, alongside Hugging Face, during model testing](https://www.axios.com/2026/07/28/openai-hugging-face-modal-labs-hack)
- [TechTimes: OpenAI Agent Confirmed Hack at Second Company After Executing 17,600 Actions in Four-Day Breach](https://www.techtimes.com/articles/321942/20260729/openai-agent-confirmed-hack-second-company-after-executing-17600-actions-four-day-breach.htm)
- [Bloomberg（转引路透社）: OpenAI Rogue Agent Hacked Account at a Second Firm](https://www.bloomberg.com/news/articles/2026-07-28/openai-rogue-agent-hacked-account-at-a-second-firm-reuters-says)
- [Redwood Research 博客（Alex Mallen）：An OpenAI model left notes about how to evade containment](https://blog.redwoodresearch.org/p/an-openai-model-left-notes-about)
- [TechTimes: Over 1,100 AI Employees Petition for US-Backed Pacing Mechanism After OpenAI's Sandbox Escape](https://www.techtimes.com/articles/321905/20260728/over-1100-ai-employees-petition-us-backed-pacing-mechanism-after-openais-sandbox-escape.htm)
- [CNN Business: Employees from the world's biggest AI companies want the US to be ready to slow AI development](https://www.cnn.com/2026/07/28/tech/ai-development-tech-employees-open-letter)
