---
title: 'OpenAI Astra 一口气攻克 10 道悬而未决数十年的数学难题：Lean 4 形式化证明意味着什么'
date: 2026-08-03
slug: 'openai-astra-10-da-shu-xue-nan-ti-lean-xing-shi-hua-zheng-ming'
description: '2026 年 8 月 1 日，OpenAI 通过一篇数学博客悄悄"预告"了下一代模型 Astra：其内部版本产出了 10 个开放至少十年的数学与理论计算机科学新结果，包括首个非可闻群（non-sofic group）构造、推翻 Alain Connes 1980 年提出的刚性猜想等重大突破，并且全部给出了 Lean 4 机器可验证的形式化证明，全程 API 成本约 2000 美元。本文基于 OpenAI 官方博客及 SiliconANGLE、The Decoder、Gizmodo 等多家媒体报道，拆解这 10 个结果分别是什么、Lean 形式化验证的原理与局限、数学界的谨慎反应（包括 2025 年 10 月那次"乌龙"的前车之鉴），并给出如何拉取 openai/ten-proofs 仓库亲自验证这些证明的实践指南。'
author: 范伟彬
tags:
  - OpenAI
  - Astra
  - Lean 4
  - 形式化验证
  - 数学
  - AI for Science
  - 大模型
categories:
  - AI
  - 前沿研究
---

# OpenAI Astra 一口气攻克 10 道悬而未决数十年的数学难题：Lean 4 形式化证明意味着什么

2026 年 8 月 1 日，OpenAI 在官网发布了一篇标题朴素的博客《Ten advances in mathematics and theoretical computer science》，内容却不小：公司下一代主力模型 **Astra**（尚未发布，官方称之为"next major model family"）的一个内部版本，针对 10 个在数学与理论计算机科学领域悬置至少十年的开放问题给出了新结果，并且**每一个结果都配上了 Lean 4 语言的机器可验证形式化证明**。整个过程按 GPT-5.6 Sol 的 API 计费口径估算，成本约为 2000 美元。这不是又一次"跑分创新高"的模型发布，而是一次带着完整可复现证据链的科研成果公开——这也是为什么它比过去一年里大多数"AI 又刷新了某某 benchmark"的新闻更值得深入写一写。

> 信息来源：OpenAI 官方博客《Ten advances in mathematics and theoretical computer science》、GitHub 仓库 `openai/ten-proofs`，以及 SiliconANGLE、The Decoder、TechTimes、Gizmodo、BleepingComputer、NextBigFuture 等媒体的公开报道整理，文末附完整链接。

## 一、背景介绍：为什么是"预告一个模型"而不是"发布一个模型"

OpenAI 这次没有直接放出 Astra 的下载或 API 权限，而是选择用一批扎实的数学成果来"预告"它的存在——Astra 目前仍处于内部测试阶段，何时公开发布、定不定名为 GPT-6、走不走美国政府新设立的联邦 AI 安全审查流程，都还没有定论。据报道 Astra 是首个将被纳入这一政府审查试点的模型。

Astra 的设计目标不是单纯堆大参数，而是**协调多个智能体在长时间跨度上共同解决复杂问题**，并将测试时计算（test-time compute）进一步推向极限。OpenAI 研究员 Noam Brown 在相关讨论中提到"test-time compute 还有很大的推进空间"，这与 Astra 处理这批数学问题的方式是一致的：模型生成论证，人类研究者协助把输出整理成可发表的论文，但 OpenAI 强调"数学论证本身来自 Astra"，人类的工作主要是编辑、核对和形式化落地。

10 个问题跨越的领域相当广：

1. **首个非可闻群（non-sofic group）的显式构造**——这是自 Mikhail Gromov 1999 年提出"可闻性（soficity）"概念以来悬置 27 年的开放问题：是否所有可数离散群都是可闻群？Astra 给出了第一个反例。
2. **推翻 Connes 刚性猜想**——菲尔兹奖得主 Alain Connes 在 1980 年提出：由具备 property (T) 的群 G 构造出的冯·诺依曼代数 L(G) 是否能唯一确定 G？Astra 构造出无穷多个互不同构、却共享同一冯·诺依曼代数"指纹"的群，给出了反例。
3. **Ehrhart 体积猜想**的证明。
4. **三个 Erdős 问题**的解决，其中包括著名的 Erdős 183 号问题（多色 Ramsey 数下界）。
5. 另外两项极值图论问题（紧致性与退化性相关）的反例构造。
6. **高维球体堆积（sphere packing）**问题——这是自 1978 年以来首次改进一般维度球堆积密度的上界指数。
7. 二元及球面编码（binary/spherical codes）上界的改进。
8. **算术电路复杂度**下界（Permanent 相关）。
9. **量子并行重复定理**：证明了适用于一般双方纠缠博弈的并行重复定理。
10. **最近向量问题（GapCVP）**的困难性结果——这与格密码学（lattice cryptography）直接相关。

## 二、技术细节解析：Lean 4 形式化证明到底验证了什么

这次发布最核心的"含金量"不在于结果本身多惊艳，而在于验证方式。OpenAI 同时放出了一份 249 页的完整手稿(包含模型推理过程的逐步走查),以及托管在 GitHub 上、以 **Apache 2.0** 协议开源的仓库 `openai/ten-proofs`，其中每一个结果都有对应的 Lean 4 证明文件：

- `NonSoficGroup.lean` —— 非可闻群构造
- `ConnesRigidity.lean` —— Connes 刚性猜想反例
- `EhrhartVolumeInequality.lean` —— Ehrhart 体积不等式
- `MulticolorTriangleRamsey.lean` —— 多色 Ramsey 数下界
- `CompactnessAndDegeneracy.lean` —— 极值图论反例
- `SpherePacking.lean` —— 高维球堆积
- `MetricCodes.lean` —— 二元/球面编码上界
- `Permanent.lean` —— 算术电路复杂度下界
- `QuantumParallelRepetition.lean` —— 量子并行重复
- `GapCVP.lean` —— 最近向量问题困难性

关键点在于，仓库中的"sorry 计数"为零——在 Lean 生态里，`sorry` 是一个占位关键字，代表"此处证明步骤尚未完成，先跳过"。一份形式化证明如果还留有 `sorry`，就意味着它并未真正被证明完毕。OpenAI 强调这 10 份证明中**没有任何一步遗留 `sorry`**，也就是说 Lean 的类型检查器已经把整条推理链从公理一路验证到底，不再需要"相信模型"，而是可以直接相信编译器。仓库里还附带一个叫 `ComparatorChallenges` 的独立验证框架，方便第三方研究者用不同工具链交叉核验这些证明。

不过，形式化验证解决的只是"这些证明步骤在逻辑上是否自洽"，并不能自动保证"形式化陈述本身是否准确翻译了原始数学问题"——这一步仍然需要人类数学家逐条核对定义是否对齐。这也是为什么尽管代码层面无懈可击，10 个结果目前都还没有经过正式的同行评审。

## 三、代码示例／实践指南：如何亲自验证这些证明

如果你对形式化验证感兴趣，完全可以在本地把这 10 份证明跑一遍编译，而不是只相信媒体的转述。步骤如下（需要 Lean 官方工具链管理器 [elan](https://github.com/leanprover/elan)）：

```bash
# 1. 克隆仓库
git clone https://github.com/openai/ten-proofs.git
cd ten-proofs

# 2. 安装 elan（如果尚未安装），它会根据
#    lean-toolchain 文件自动拉取匹配版本的 Lean 4
curl https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -sSf | sh

# 3. 拉取预编译的 mathlib 依赖缓存，避免本地从零编译
lake exe cache get

# 4. 编译全部 10 份证明（对应 All.lean 主文件）
lake build All

# 5. 也可以只编译单个结果，例如球堆积那一篇
lake build SpherePacking
```

如果 `lake build` 全部通过且没有报错，就说明 Lean 的类型检查器认可了从公理到最终定理陈述之间的每一步推导——这与"运行一遍单元测试全绿"是类似的确定性保证，而不是对模型输出的"感觉良好"式信任。

这套思路对日常工程也有借鉴意义：当你用大模型生成一段涉及关键路径的代码或算法证明时，与其单纯靠人工 review 或让另一个模型"审阅"，不如像 Astra 这样，把可形式化的部分丢给类型检查器、定理证明器或强类型语言的编译器去把关——机器验证的意义正在于把"这个结果是否正确"从主观判断变成客观的可复现检查。

## 四、争议与前车之鉴：数学界为何谨慎叫好

erdosproblems.com 的维护者 Thomas Bloom 将这次结果称为"big news"，并认为其分量超过今年 5 月的一次单位距离反例结果。但学界的反应总体是"谨慎乐观"而非"欢呼雀跃"，原因有二：

第一，**历史包袱**。2025 年 10 月，OpenAI 的 Kevin Weil 曾宣称 GPT-5 解决了 10 个 Erdős 问题，但 Thomas Bloom 随后指出，模型实际上只是"找到了已经发表过的解法"，并称这是一次"严重的错误表述"（dramatic misrepresentation）。Weil 事后删除了相关帖子，DeepMind 的 Demis Hassabis 也公开评价那次事件"令人尴尬"。这次 Astra 的发布特意强调"每个结果都开放至少十年"且附带完整形式化证明，某种程度上正是为了避免重蹈覆辙。

第二，**行业信任危机**。2026 年 6 月，国际数学联盟（International Mathematical Union）通过了《莱顿宣言》（Leiden Declaration），警告 AI 公司在未经许可的情况下使用已发表研究成果、绕开同行评审、威胁着证明与署名体系的完整性。软件工程师 Fernando Borretti 在自己的博客中表达了更深层的担忧："学科的前沿将退到没有人能跟上的地方"，我们将生活在"一个被恶魔附身的世界，到处是我们无法理解其运作原理的奇妙装置"。

这些声音提醒我们：形式化证明解决的是"逻辑自洽性"这一个维度的信任问题，但数学共同体真正在意的，还包括归属权、可解释性、以及人类是否还能跟得上研究的节奏——这些不是靠一个 Lean 编译通过就能一并解决的。

## 五、总结与展望

OpenAI Astra 这次"用数学论文预告模型"的做法，释放了几个值得开发者关注的信号：

- **AI + 形式化验证正在从实验室玩具走向可复现的工程实践**。当模型的输出可以被类型检查器、定理证明器机械地验证时，"AI 是否在胡说八道"这个问题第一次有了客观答案，而不再只能靠人工背书。
- **测试时计算（test-time compute）仍是当前提升模型能力的主战场**。Astra 的核心卖点不是参数量，而是多智能体协同 + 长程推理，这与过去一年 OpenAI、Anthropic 等公司在推理侧持续加码的方向一致。
- **技术能力的领先不代表信任问题的自动解决**。10 月的"Erdős 乌龙"和这次的谨慎接受形成鲜明对比，说明社区已经学会了"先验证，再欢呼"，这对所有 AI 公司发布类似成果都是一种健康的约束。

对于普通开发者而言，即便不研究纯数学，Astra 展示的"生成 + 形式化验证"工作流也值得关注：如果你的项目中有算法正确性、协议安全性、并发无死锁等可以被形式化描述的关键属性，用 Lean、Coq、TLA+ 这类工具去机械验证 AI 生成的方案，可能会成为未来一段时间内提升 AI 辅助开发可信度的重要手段。Astra 本身何时正式发布、是否叫 GPT-6，值得持续关注。

## 参考来源

- [OpenAI 官方博客：Ten advances in mathematics and theoretical computer science](https://openai.com/index/ten-advances-in-mathematics/)
- [GitHub 仓库：openai/ten-proofs](https://github.com/openai/ten-proofs)
- [SiliconANGLE：OpenAI's Astra solves 10 long-open math problems and publishes the proofs](https://siliconangle.com/2026/08/02/openais-astra-solves-10-long-open-math-problems-publishes-proofs/)
- [The Decoder：OpenAI announces its "next major model" Astra by dropping ten previously unsolved math solutions](https://the-decoder.com/openai-announces-its-next-major-model-astra-by-dropping-ten-previously-unsolved-math-solutions/)
- [TechTimes：OpenAI's Astra Solves Ten Decade-Old Math Problems With Machine-Checkable Lean Proofs](https://www.techtimes.com/articles/322710/20260802/openais-astra-solves-ten-decade-old-math-problems-machine-checkable-lean-proofs.htm)
- [Gizmodo：OpenAI Smuggled the Announcement of Astra, Its Next AI Model, Into a Blog Post About Math](https://gizmodo.com/openai-smuggled-the-announcement-of-astra-its-next-ai-model-into-a-blog-post-about-math-2000793689)
- [BleepingComputer：OpenAI teases Astra, its next major AI model, after it solves 10 long-standing math problems](https://www.bleepingcomputer.com/news/artificial-intelligence/openai-teases-astra-its-next-major-ai-model-after-it-solves-10-long-standing-math-problems/)
