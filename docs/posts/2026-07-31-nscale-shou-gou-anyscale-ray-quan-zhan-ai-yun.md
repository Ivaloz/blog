---
title: 'Nscale 收购 Anyscale：当 GPU 云厂商买下 Ray，"全栈 AI 超大规模云"意味着什么'
date: 2026-07-31
slug: 'nscale-shou-gou-anyscale-ray-quan-zhan-ai-yun'
description: '2026 年 7 月 30 日，GPU 云厂商 Nscale 宣布与 Anyscale 签署最终收购协议，交易金额约 16.5 亿美元。Anyscale 是分布式计算框架 Ray 的商业化主体，Ray 已经是训练、微调、推理、强化学习跨集群调度事实上的开源标准，OpenAI、Uber、字节跳动等公司的生产系统都跑在它上面。这笔收购把"算力层"和"调度软件层"第一次装进了同一家公司，Nscale 同时承诺加入 PyTorch 基金会、维持 Ray 的开源中立治理。本文结合 Nscale、Anyscale 官方公告及多家科技媒体报道，拆解 Ray 的核心架构（任务、Actor、分布式对象存储、Ray Train/Serve/Data 生态）、这笔收购对开发者意味着什么，并给出用 Ray 做分布式训练与模型推理部署的实践示例。'
author: 范伟彬
tags:
  - Ray
  - Anyscale
  - Nscale
  - 分布式计算
  - AI 基础设施
  - PyTorch Foundation
  - GPU 云
categories:
  - AI
  - 基础设施
---

# Nscale 收购 Anyscale：当 GPU 云厂商买下 Ray，"全栈 AI 超大规模云"意味着什么

2026 年 7 月 30 日，总部位于伦敦的 GPU 云厂商 Nscale 宣布，已与 Anyscale 签署最终收购协议，彭博社援引知情人士的说法称交易金额约为 16.5 亿美元（双方均未正式披露具体数字）。Anyscale 是开源分布式计算框架 **Ray** 的商业化主体，而 Ray 早已是训练、微调、推理、强化学习跨数千张 GPU 调度的事实标准之一——从 OpenAI 到 Uber，再到今年一批国产大模型（如 GLM、Nemotron 系）训练管线的背后，都能看到 Ray 的身影。这不是一次"模型跑分又破纪录"的新闻，而是一次基础设施层面的整合：一家自己盖数据中心、买电力、部署 GPU 集群的"新云"厂商，把行业里最主流的分布式 AI 调度软件买了下来。这篇文章会拆解 Ray 到底解决什么问题、这笔收购的架构和治理意味着什么，以及作为开发者，现在能拿 Ray 做什么、该如何上手。

> 数据来源：Nscale 官方新闻稿《Nscale Acquires Anyscale, Enhancing its Full Stack AI Cloud Platform》、Anyscale 官方博客《Anyscale signs definitive agreement to join Nscale》，以及 VentureBeat、TechCrunch、HPCwire/BigDATAwire、Unite.AI 等公开报道整理。

## 一分钟速览

- **交易时间**：2026 年 7 月 30 日宣布签署最终协议，预计 2026 年下半年完成交割。
- **交易金额**：彭博社估算约 16.5 亿美元，双方公告均未确认具体数字。
- **谁买谁**：Nscale（GPU 云基础设施厂商，自建数据中心、电力、GB300 NVL72 级别算力）收购 Anyscale（Ray 框架的商业化公司）。
- **人员安排**：Anyscale 约 200 名员工（分布在美国、欧洲、印度）整体并入 Nscale，Anyscale 品牌继续独立服务现有客户。
- **Ray 治理不变**：Ray 已于 2025 年捐赠给 PyTorch 基金会，继续保持开源、社区中立治理；Nscale 承诺以 **白金会员（Platinum member）** 身份加入 PyTorch 基金会。
- **战略定位**：双方把这次整合描述为"打造第一家全栈 AI 超大规模云（full-stack AI hyperscaler）"——算力、数据中心与分布式调度软件第一次统一在同一家公司里协同优化。
- **客户影响**：Anyscale Platform 承诺继续支持所有主流云厂商，保持多云可移植性；更多细节将在 2026 年 8 月的 Ray Summit（旧金山）上公布。

## 背景：Ray 是什么，为什么值 16.5 亿美元

要理解这笔收购的分量,得先理解 Ray 解决的是什么问题。

大模型时代的训练和推理,本质上是一个"把海量计算任务分发到成百上千张 GPU 上,再把结果收回来"的分布式系统问题。PyTorch、TensorFlow 这类框架解决的是"在单张卡或几张卡上怎么算"，但当你需要在几千张 GPU 组成的集群上做数据预处理、分布式训练、超参搜索、批量推理、强化学习(RLHF/RLVR)训练,并且要求这些环节能够互相调度、共享集群资源、故障自动恢复——这就是 Ray 要解决的问题。

Ray 由加州大学伯克利分校 RISELab 孵化,核心思路是把"分布式计算"这件事从"专门的大数据框架"（如 Spark）里解放出来,变成一套 Python 原生、几行装饰器就能用的通用分布式运行时。正因为足够通用、足够贴近 Python 生态,过去几年 Ray 迅速成为大模型训练管线的"胶水层"：OpenAI 用 Ray 做强化学习训练调度,字节跳动、Uber 等公司的推荐系统和大模型训练管线里都有 Ray 的身影,今年公开报道中提到使用 Ray 的模型项目还包括 Zhipu 的 GLM、NVIDIA 的 Nemotron、Cursor 背后的 Composer 模型,以及微软的 MAI 系列。

Anyscale 由 Ray 的原班创始团队在 2019 年创立,定位是 Ray 的"官方商业化公司"——提供托管的 Ray 集群管理平台、企业级支持,同时主导 Ray 开源项目的核心开发。2025 年,Anyscale 把 Ray 项目本身捐赠给了 PyTorch 基金会,与 PyTorch、vLLM 并列成为该基金会治理下的核心开源项目,这一步是为了打消"Ray 会不会被某一家商业公司'私有化'"的顾虑,巩固它作为行业中立标准的地位。

而 Nscale 是这两年"新云(neocloud)"赛道里跑得比较快的一家——不像传统云厂商那样把算力当作虚拟化资源池对外出租,Nscale 的打法是自己买地、建电站、盖数据中心、采购并部署最新一代 GPU(公告中提到已规模化部署 GB300 NVL72 系统),走的是纵向整合(vertical integration)路线。Nscale CEO Josh Payne 在公告中的原话是:"Nscale 在做一件独特的事——我们自己搭建并拥有每一层:电力、数据中心、算力,以及把它们变成一朵 AI 云的软件。" 收购 Anyscale,补的正是"软件层"里最关键的一块拼图:把裸算力变成可调度、可编排的分布式 AI 工作负载能力。

## 技术细节解析

### 1. Ray 的核心架构:任务(Task)、Actor 与分布式对象存储

Ray Core 提供两种最基本的分布式编程原语:

- **Task(无状态任务)**:用 `@ray.remote` 装饰一个普通 Python 函数,调用时加上 `.remote()`,这个函数就会被异步调度到集群里某个节点上执行,返回一个 `ObjectRef`(类似 Future/Promise)。
- **Actor(有状态服务)**:用 `@ray.remote` 装饰一个类,Ray 会在集群某个节点上常驻地实例化这个类,后续调用它的方法都会路由到同一个进程——这是 Ray 用来表达"有状态"分布式服务(比如一个常驻显存里的模型、一个参数服务器)的核心机制。

支撑这两种原语的是 Ray 的**分布式对象存储(Object Store)**:每个 Worker 节点本地跑一个基于共享内存的对象存储,大对象(比如一批训练数据、模型权重分片)可以在节点间通过零拷贝(zero-copy)的方式传递引用,而不必每次都完整复制,这也是 Ray 在数据密集型分布式任务上比朴素 RPC 调用效率高的关键之一。调度层面,Ray 采用去中心化调度(每个节点都能做本地调度决策,而不是所有任务都要经过一个中心调度器排队),配合全局的控制平面做资源管理和故障检测,这让集群规模扩大时不容易出现单点调度瓶颈。

### 2. 面向 AI 工作负载的高层库

Ray Core 之上,Ray 生态提供了几个面向具体 AI 工作负载的高层库,这也是为什么大模型公司愿意把整条训练/推理管线都放在 Ray 上,而不是自己拼接多个工具:

- **Ray Data**:分布式数据加载与预处理,支持流式(streaming)处理超过单机内存的大规模数据集,常用于大模型预训练的数据管线。
- **Ray Train**:把 PyTorch/DeepSpeed 等训练框架的分布式训练逻辑包一层,自动处理多机多卡的进程编排、容错重启,让训练脚本从单机跑到多机集群不需要大改代码。
- **Ray Serve**:模型在线服务(model serving)框架,支持多模型组合、自动扩缩容、按请求动态批处理(dynamic batching),是很多团队部署 LLM 推理服务的底层调度层。
- **Ray RLlib**:强化学习训练库,在 RLHF/RLVR 成为大模型后训练标配的当下,承担了不少"策略模型采样 + 奖励计算 + 参数更新"这类高度并行、需要跨节点协调的工作负载。

这四个库共享同一套底层调度和对象存储,意味着一条"数据处理 → 分布式训练 → 强化学习后训练 → 在线推理"的完整管线,理论上可以在同一个 Ray 集群上端到端跑完,不需要在不同专用系统之间反复搬运数据——这正是 Ray 在大模型基础设施里越来越核心的原因。

### 3. 这笔收购改变了什么,又承诺不改变什么

从架构角度看,这笔收购真正的变化在"下面一层"而不是 Ray 本身:

**不变的部分**——Ray 项目的开源治理。Anyscale 博客明确写道:"Ray 从第一天起就是一个开放的、社区驱动的项目"、"它作为行业标准的价值,取决于它能不能保持完全开放、中立、可移植"。收购后 Ray 仍由 PyTorch 基金会治理,与 PyTorch、vLLM 同属一个中立的开源伞下,Nscale 加入基金会成为白金会员,某种意义上是用真金白银的会员承诺,给"我们不会把 Ray 私有化"这句话背书。Anyscale Platform 也承诺继续支持所有主流云厂商,保留多云可移植性——也就是说,即便 Anyscale 现在归属于一家自建 GPU 集群的云厂商,用 Ray 的团队理论上仍然可以选择在 AWS、GCP、Azure 或任何自有集群上跑。

**改变的部分**——软硬件协同优化的空间。Anyscale CEO Keerti Melkote 的原话是:"把 Anyscale 的平台和 Nscale 的数据中心、AI 云服务结合起来,我们正在打造第一家全栈 AI 超大规模云。" 两家公司公开的论点是:AI 基础设施的进一步优化,需要"跨软硬件全栈的深度联合优化",单靠软件公司或单靠算力公司都做不到——比如 Ray 的调度器如果能感知到底层具体是哪一代 GPU、网络拓扑是什么样、机柜级别的故障域如何划分,理论上可以做出比"黑盒调用云 API"更精细的调度决策,减少训练任务因为跨可用区通信延迟、抢占式实例中断而浪费的算力。这也是这两年"新云"厂商集体在做的事:不满足于卖裸算力,而是往上收编调度软件、推理引擎,把自己变成一个纵向整合的"AI 版超大规模云"。

值得留意的信号是:Ray 官方公开报道中提到,被使用它的项目包括 GLM、Nemotron、Composer、MAI 这些分别来自不同公司(智谱、NVIDIA、Cursor 背后团队、微软)的模型/产品线——这意味着 Ray 的中立性本身就是它的护城河。如果 Nscale 未来的整合动作让人觉得"用 Ray 就是在给一家 GPU 云厂商引流",很可能会伤害到 Ray 的生态地位,这也是为什么双方在公告里反复强调治理不变、多云不变。这笔收购能不能成功,某种程度上取决于 Nscale 能不能真正兑现"只做基础设施层优化、不破坏中立性"的承诺。

## 实践指南:用 Ray 做分布式训练与模型部署

无论这笔收购未来走向如何,Ray 本身作为一个开源框架现在就能装上用。下面是两个最常见场景的最小示例,帮助还没用过 Ray 的开发者建立直观认识。

### 示例一:用 Ray Train 把单机训练脚本变成多机分布式训练

```python
import ray
from ray import train
from ray.train import ScalingConfig
from ray.train.torch import TorchTrainer

def train_loop_per_worker(config):
    import torch
    import torch.nn as nn

    model = nn.Linear(10, 1)
    # Ray Train 自动把模型包装成 DistributedDataParallel
    model = train.torch.prepare_model(model)
    optimizer = torch.optim.SGD(model.parameters(), lr=config["lr"])

    for epoch in range(config["epochs"]):
        # 这里省略真实数据加载,实际项目通常配合 ray.data 使用
        x = torch.randn(32, 10)
        y = torch.randn(32, 1)
        loss = nn.functional.mse_loss(model(x), y)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        # 汇报指标 + 支持容错 checkpoint
        train.report({"epoch": epoch, "loss": loss.item()})

trainer = TorchTrainer(
    train_loop_per_worker,
    train_loop_config={"lr": 1e-3, "epochs": 5},
    # 4 个 worker,每个占用 1 张 GPU;换成更大的数字即可扩展到多机
    scaling_config=ScalingConfig(num_workers=4, use_gpu=True),
)
result = trainer.fit()
print(result.metrics)
```

这段代码和普通 PyTorch 训练脚本的差异很小,核心改动只有两处:用 `train.torch.prepare_model` 包装模型(自动处理多进程/多机的梯度同步),以及把训练循环交给 `TorchTrainer` 调度。`ScalingConfig` 里的 `num_workers` 从 4 改成 400,理论上就是从单机多卡扩展到跨数百个节点的集群,不需要改动训练逻辑本身——这正是 Ray Train 相比手写 `torch.distributed` 的价值所在。

### 示例二:用 Ray Serve 部署一个支持动态批处理的推理服务

```python
from ray import serve
import time

@serve.deployment(
    num_replicas=2,                     # 起 2 个副本做水平扩展
    ray_actor_options={"num_gpus": 1},  # 每个副本独占 1 张 GPU
)
class LLMDeployment:
    def __init__(self):
        # 实际项目中在这里加载模型权重到显存
        self.model = self._load_model()

    def _load_model(self):
        # 伪代码:替换成 transformers / vllm 的模型加载逻辑
        return "loaded-model"

    @serve.batch(max_batch_size=16, batch_wait_timeout_s=0.05)
    async def __call__(self, prompts: list[str]) -> list[str]:
        # Ray Serve 自动把 50ms 内到达的多个请求打包成一个 batch 推理
        # 这里用 sleep 模拟一次批量前向计算
        time.sleep(0.1)
        return [f"回复: {p}" for p in prompts]

app = LLMDeployment.bind()
# 本地调试: serve run 模块名:app
# 生产部署: 配合 Ray 集群 + serve deploy 做多机自动扩缩容
```

`@serve.batch` 是这里的关键:它让 Ray Serve 在极短的等待窗口内(示例中是 50 毫秒)把多个并发到来的请求自动合并成一次批量推理,这是提升 GPU 利用率、降低大模型推理成本的常见手段。配合 `num_replicas` 和集群的自动扩缩容策略,同一份部署代码可以从"本地单卡调试"平滑过渡到"生产环境跨多机多卡弹性伸缩",这也是为什么不少团队把 Ray Serve 作为自建 LLM 推理网关的底座,而不是从零手写批处理和负载均衡逻辑。

### 上手建议

如果之前没接触过 Ray,想快速验证是否适合自己的场景,可以按这个顺序:

1. `pip install "ray[default,train,serve]"`,先在单机上跑通 `ray.init()` + 几个 `@ray.remote` 函数,建立"任务被异步调度"的直觉。
2. 如果场景是训练:直接把现有 PyTorch/DeepSpeed 训练脚本套进 `TorchTrainer`,先用 CPU 或单机多卡验证正确性,再扩展 `num_workers` 到真实集群规模。
3. 如果场景是推理服务:用 `serve run` 在本地起一个 `Ray Serve` 部署,重点验证 `@serve.batch` 的批大小和等待时间参数对吞吐、延迟的影响,再决定生产环境的副本数和自动扩缩容策略。
4. 关注 2026 年 8 月的 Ray Summit(旧金山)——按官方博客的说法,Nscale 收购后的具体产品路线图和集群定价细节会在这次大会上公布,对评估是否要把生产工作负载迁移到 Anyscale 托管平台的团队,这是一个值得跟进的时间点。

## 总结与展望

这笔收购放在更大的行业背景里看,延续的是过去一年"新云"厂商集体往软件层收编的趋势——GPU 云厂商不再满足于卖裸算力,而是想把训练调度、模型服务这些软件层能力也攥在自己手里,变成一个可以端到端交付的"AI 超大规模云"。Nscale 用大约 16.5 亿美元买下 Ray 的商业化主体,买到的不是一个模型、一次跑分,而是行业里事实标准级别的分布式调度软件和它背后几万开发者的心智占有率——这是一笔典型的"基础设施整合"交易,而不是"技术炫技"交易。

对开发者而言,短期内不需要因为这笔收购改变任何使用方式:Ray 依然开源、依然由 PyTorch 基金会中立治理,现有的 AWS/GCP/Azure 部署也不受影响。真正值得持续关注的,是中长期 Nscale 会不会把"软硬件联合优化"的承诺兑现成实际的调度器改进(比如对特定 GPU 拓扑更智能的任务放置),以及这种整合会不会在事实上让"用 Ray 加 Anyscale 托管平台"和"自己在别的云上部署开源 Ray"之间出现体验差距。无论如何,Ray 已经成为大模型基础设施里绕不开的一层,理解它的调度模型和高层库,对任何要把训练/推理规模从单机扩展到集群的团队,都是值得投入的基础能力。

## 参考来源

- [Nscale Acquires Anyscale, Enhancing its Full Stack AI Cloud Platform - Nscale 官方新闻稿](https://www.nscale.com/press-releases/nscale-acquires-anyscale)
- [Anyscale signs definitive agreement to join Nscale - Anyscale 官方博客](https://www.anyscale.com/blog/anyscale-signs-definitive-agreement-to-join-nscale)
- [Nscale Buys Anyscale to Move Up the AI Compute Stack - Unite.AI](https://www.unite.ai/nscale-buys-anyscale-to-move-up-the-ai-compute-stack/)
- [Nscale Acquires Anyscale, Enhancing Its Full Stack AI Cloud Platform - HPCwire/BigDATAwire](https://www.hpcwire.com/bigdatawire/this-just-in/nscale-acquires-anyscale-enhancing-its-full-stack-ai-cloud-platform/)
- [Nscale to Acquire Anyscale, Expanding Full-Stack AI Cloud Platform - citybiz](https://www.citybiz.co/article/881728/nscale-to-acquire-anyscale-expanding-full-stack-ai-cloud-platform/)
- [Ray 官方文档](https://docs.ray.io/)
