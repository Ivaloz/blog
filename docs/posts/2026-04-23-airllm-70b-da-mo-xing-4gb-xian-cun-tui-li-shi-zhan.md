---
title: 'AirLLM：4GB 显存跑 70B 大模型的工程化方案'
date: 2026-04-23
slug: 'airllm-70b-da-mo-xing-4gb-xian-cun-tui-li-shi-zhan'
categories:
  - 'AI 与工作流'
tags:
  - 'AirLLM'
  - 'LLM'
  - 'Llama'
  - '推理优化'
  - 'Python'
description: 'AirLLM 通过分层加载与块级量化，让消费级显卡跑得动 70B / 405B 大模型。本文记录仓库功能、使用流程以及 Windows 下的上手步骤。'
---

# AirLLM：4GB 显存跑 70B 大模型的工程化方案

> 仓库地址：<https://github.com/lyogavin/airllm>  
> 许可证：Apache 2.0  
> 一句话定位：在 4GB 单卡 / 8GB 单卡上推理 70B、405B 级别大模型，不依赖量化蒸馏也能跑。

---

## 一、AirLLM 是什么

大模型权重动辄几十上百 GB，显存不够就只能换卡或上云。AirLLM 给出的思路是——**把模型按层切片，需要算哪一层就把哪一层搬进显存，算完立刻释放**。配合预取、块级量化，消费级硬件也能跑得动 70B。

官方给出的能力指标：

- **4GB 单卡** 推理 **70B 模型**
- **8GB 显存** 推理 **Llama 3.1 405B**
- **无需** 量化 / 蒸馏 / 剪枝即可运行原始权重
- 开启 4bit / 8bit 块级压缩后，推理速度约 **3× 提升**

## 二、核心特性

| 特性 | 说明 |
| --- | --- |
| 分层加载（Layer-wise） | 把 Transformer 按层拆分，按需 load / unload |
| 块级量化 | 支持 `4bit`、`8bit` 压缩，兼顾体积与精度 |
| Prefetching | 加载下一层与当前层计算并行，隐藏 IO 开销 |
| CPU 推理 | 没有 GPU 也能跑，只是慢一些 |
| 跨平台 | Linux / macOS（Apple Silicon），Windows 通过 WSL 或 CPU 模式 |
| 多模型支持 | Llama 2/3/3.1、Qwen/Qwen2.5、ChatGLM、Mistral、Baichuan、InternLM、Platypus |

## 三、使用流程总览

```
1. 准备环境（venv / conda）  →  2. pip install airllm
            ↓
3. AutoModel.from_pretrained(模型名)
            ↓
4. tokenizer 把 prompt 编码成 input_ids
            ↓
5. model.generate(...) 分层推理
            ↓
6. tokenizer.decode(...) 输出结果
```

整个 API 对齐 Hugging Face 风格，已经熟悉 `transformers` 的同学几乎零学习成本。

## 四、Windows 上手步骤（已验证）

我在本地 `D:\tool\llm` 目录下做了如下准备：

```powershell
PS D:\tool\llm> python -m venv .venv
PS D:\tool\llm> .\.venv\Scripts\activate
(.venv) PS D:\tool\llm> pip install requests
```

接下来继续补齐 AirLLM 所需依赖：

```powershell
# PyTorch：根据显卡情况选择 CUDA 版本
(.venv) PS D:\tool\llm> pip install torch --index-url https://download.pytorch.org/whl/cu121

# AirLLM 本体
(.venv) PS D:\tool\llm> pip install airllm

# 量化压缩（可选，开启 4bit/8bit 时需要）
(.venv) PS D:\tool\llm> pip install bitsandbytes accelerate

# Hugging Face 下载工具（可选，方便预下载权重）
(.venv) PS D:\tool\llm> pip install huggingface_hub
```

> 提示：Windows 原生对 `bitsandbytes` 的支持偶尔不完整，如果遇到编译问题，推荐切到 **WSL2 + Ubuntu** 继续，或直接用 CPU 模式先跑通流程。

## 五、最小可运行示例

### 1) 跑一个 70B Llama 衍生模型

```python
from airllm import AutoModel

model = AutoModel.from_pretrained("garage-bAInd/Platypus2-70B-instruct")

input_tokens = model.tokenizer(
    ['What is the capital of United States?'],
    return_tensors="pt",
    truncation=True,
    max_length=128,
    padding=False,
)

output = model.generate(
    input_tokens['input_ids'].cuda(),
    max_new_tokens=20,
)

print(model.tokenizer.decode(output[0]))
```

### 2) 开启 4bit 量化（速度约 3×）

```python
model = AutoModel.from_pretrained(
    "garage-bAInd/Platypus2-70B-instruct",
    compression='4bit',   # 或 '8bit'
)
```

### 3) ChatGLM / Mistral 一样的写法

```python
# ChatGLM
model = AutoModel.from_pretrained("THUDM/chatglm3-6b-base")

# Mistral
model = AutoModel.from_pretrained("mistralai/Mistral-7B-Instruct-v0.1")
```

## 六、常用参数速查

| 参数 | 作用 |
| --- | --- |
| `compression` | `'4bit'` / `'8bit'` / `None`，控制是否块级量化 |
| `layer_shards_saving_path` | 自定义分层权重的落盘路径，避免 C 盘爆满 |
| `hf_token` | 访问受限模型（如 Llama 官方仓库）时传入 |
| `prefetching` | 是否启用加载—计算并行，默认开启 |
| `delete_original` | 分层完成后是否删除原始权重，省磁盘空间 |

## 七、适用与不适用场景

**适合**

- 手头只有 4GB / 8GB / 12GB 的消费级显卡，想试 70B 级模型
- 离线环境、需要自建推理服务，又不想上 8×A100
- 学习 LLM 推理内部机制（分层、IO 重叠、量化）

**不太适合**

- 追求极致吞吐量的线上高并发服务（还是上 vLLM / TensorRT-LLM 更合适）
- 长上下文 + 大 batch：分层加载对 IO 压力很大，SSD 性能会直接决定体验

## 八、小结

AirLLM 的价值不在"新模型"，而在于**把 70B+ 模型从"云上特权"拉回到单卡 PC**。对个人开发者、研究者、做本地 Agent 的同学，它是一张性价比极高的入场券。

下一步我会在本机把 Llama 3.1 70B 跑起来，记录磁盘占用、首 token 延迟、tokens/s，更新在后续的对比测评文章里。
