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
description: 'AirLLM 通过分层加载与块级量化，让消费级显卡跑得动 70B / 405B 大模型。本文完整记录仓库功能、使用流程，以及在 Windows 上从建 venv 到跑通第一条 generate 的每一步细节。'
---

# AirLLM：4GB 显存跑 70B 大模型的工程化方案

> 仓库地址：<https://github.com/lyogavin/airllm>  
> 许可证：Apache 2.0  
> 一句话定位：在 4GB 单卡 / 8GB 单卡上推理 70B、405B 级别大模型，不依赖量化蒸馏也能跑。

---

## 一、AirLLM 是什么

大模型权重动辄几十上百 GB，显存不够就只能换卡或上云。AirLLM 的核心思路是——**把模型按 Transformer 层切片，需要算哪一层就把哪一层搬进显存，算完立刻释放**。配合预取和块级量化，消费级硬件也能跑得动 70B。

官方给出的能力指标：

- **4GB 单卡** 推理 **70B 模型**
- **8GB 显存** 推理 **Llama 3.1 405B**
- **无需** 量化 / 蒸馏 / 剪枝即可运行原始权重
- 开启 4bit / 8bit 块级压缩后，推理速度约 **3× 提升**

### 原理一图流

```
 传统推理：                      AirLLM 分层推理：
 ┌──────────────┐               ┌──────────────┐
 │ 全部 80 层   │               │ 1 层到 GPU   │← 算 → 释放
 │ 一次塞 GPU   │     VS        │ 2 层到 GPU   │← 算 → 释放
 │ (需 140GB)   │               │ ...          │
 └──────────────┘               │ 80 层到 GPU  │← 算 → 释放
       ❌ OOM                   └──────────────┘
                                   ✅ 只需放得下 1 层
```

## 二、核心特性

| 特性 | 说明 |
| --- | --- |
| 分层加载（Layer-wise） | 把 Transformer 按层拆分，按需 load / unload |
| 块级量化 | 支持 `4bit`、`8bit` 压缩，兼顾体积与精度 |
| Prefetching | 加载下一层与当前层计算并行，隐藏 IO 开销 |
| CPU 推理 | 没有 GPU 也能跑，只是慢 |
| 跨平台 | Linux / macOS（Apple Silicon），Windows 通过 WSL 或 CPU 模式 |
| 多模型支持 | Llama 2/3/3.1、Qwen/Qwen2.5、ChatGLM、Mistral、Baichuan、InternLM、Platypus |

## 三、使用流程总览

```
1. 环境准备（Python + CUDA + venv）
        ↓
2. pip 安装 torch / airllm / bitsandbytes
        ↓
3. （可选）登录 Hugging Face + 下载模型权重
        ↓
4. 写一个 demo.py：AutoModel → tokenizer → generate → decode
        ↓
5. python demo.py 运行并查看输出
        ↓
6. 按需调参（compression、max_new_tokens、layer_shards_saving_path）
```

API 对齐 Hugging Face 风格，熟悉 `transformers` 的同学几乎零学习成本。

---

## 四、Windows 详细上手步骤

下面给出我在 **Windows 11 + PowerShell** 下从零到跑通的每一步。每一步都会解释"为什么要这么做"，避免踩坑。

### 步骤 0：确认前置条件

```powershell
# 1. Python 版本需 >= 3.8，推荐 3.10 / 3.11
PS D:\tool\llm> python --version
Python 3.11.9

# 2. 有 NVIDIA 卡时确认驱动 + CUDA 可用（没卡可跳过，用 CPU 模式）
PS D:\tool\llm> nvidia-smi
# 记下右上角的 CUDA Version，比如 12.4；后面装 torch 时要匹配

# 3. 磁盘预留空间：70B 模型权重 ~140GB，分层切片另占 ~140GB
#    首次运行建议预留 300GB，装 SSD 的磁盘更好
PS D:\tool\llm> Get-PSDrive D
```

> 要点：AirLLM 会把原始权重按层再写一份到磁盘，所以**磁盘占用是模型大小的 2 倍**。如果 C 盘紧张，后面务必用 `layer_shards_saving_path` 指到别的盘。

### 步骤 1：建立并激活虚拟环境

这是你已经做过的：

```powershell
PS D:\tool\llm> python -m venv .venv
PS D:\tool\llm> .\.venv\Scripts\activate
(.venv) PS D:\tool\llm> pip install requests
```

说明：
- `python -m venv .venv` 会在 `D:\tool\llm\.venv` 目录下生成一个隔离环境，所有依赖都装在里面，不污染系统 Python。
- `activate` 后提示符前面出现 `(.venv)`，说明激活成功。**以后每次打开新终端都要重新 `activate`**。
- `pip install requests` 只是一个网络库热身；AirLLM 本身并不强依赖它，但下载工具会用到。

顺手升级 pip，防止老版本解析依赖时抽风：

```powershell
(.venv) PS D:\tool\llm> python -m pip install --upgrade pip
```

### 步骤 2：安装 PyTorch（必须匹配 CUDA）

AirLLM 依赖 PyTorch，**版本要和你的 CUDA 对得上**，否则要么报错要么自动降级成 CPU-only。

```powershell
# CUDA 12.1 / 12.4 的卡（大多数 30 系、40 系）
(.venv) PS D:\tool\llm> pip install torch --index-url https://download.pytorch.org/whl/cu121

# CUDA 11.8（老一点的驱动）
(.venv) PS D:\tool\llm> pip install torch --index-url https://download.pytorch.org/whl/cu118

# 没有 NVIDIA 卡，CPU-only
(.venv) PS D:\tool\llm> pip install torch --index-url https://download.pytorch.org/whl/cpu
```

装完立刻**自检**，确认 GPU 可见：

```powershell
(.venv) PS D:\tool\llm> python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'cpu only')"
```

期望看到类似：

```
2.3.0+cu121 True NVIDIA GeForce RTX 4060
```

如果 `torch.cuda.is_available()` 返回 `False` 但你确实有卡——多半是 CUDA 版本和 torch 对不上，重装上一步选对版本即可。

### 步骤 3：安装 AirLLM 及配套

```powershell
# AirLLM 本体
(.venv) PS D:\tool\llm> pip install airllm

# 配套：transformers / accelerate（AirLLM 会自动拉，但显式装一遍更稳）
(.venv) PS D:\tool\llm> pip install transformers accelerate

# 量化压缩（开启 compression='4bit'/'8bit' 时必须）
(.venv) PS D:\tool\llm> pip install bitsandbytes

# 模型下载工具
(.venv) PS D:\tool\llm> pip install huggingface_hub
```

> **Windows 注意**：`bitsandbytes` 在 Windows 原生环境偶尔装不上或运行时报 `CUDA Setup failed`。两种解决路径：
> 1. 先不加 `compression` 跑通，确认其余环节 OK；
> 2. 切到 **WSL2 + Ubuntu 22.04**，再按 Linux 的方式装，原生支持很稳。

验证 airllm 已就绪：

```powershell
(.venv) PS D:\tool\llm> python -c "from airllm import AutoModel; print('airllm ok')"
airllm ok
```

### 步骤 4：Hugging Face 登录（部分模型需要）

`meta-llama/*`、`mistralai/*` 等仓库需要在网页上同意许可后才能拉权重。Platypus2 这类社区衍生模型一般直接可下。

```powershell
# 1. 到 https://huggingface.co/settings/tokens 生成一个 Read 权限的 token
# 2. 本地登录
(.venv) PS D:\tool\llm> huggingface-cli login
# 粘贴 token，回车
```

或者直接在脚本里传：`AutoModel.from_pretrained(..., hf_token="hf_xxx")`。

### 步骤 5：写你的第一个 demo.py

在 `D:\tool\llm\demo.py` 新建文件，写入下面内容。为了**先跑通流程**，这里用一个小一点的模型 `chatglm3-6b-base`，不需要高配卡，下载也快。

```python
# demo.py
from airllm import AutoModel

# 1) 加载模型：第一次会从 HF 下载，之后走本地缓存
model = AutoModel.from_pretrained(
    "THUDM/chatglm3-6b-base",
    # 权重按层切片后放到 D 盘，避免 C 盘爆满
    layer_shards_saving_path=r"D:\tool\llm\shards",
)

# 2) 把 prompt 编码成 token id
input_text = ["What is the capital of China?"]
input_tokens = model.tokenizer(
    input_text,
    return_tensors="pt",
    return_attention_mask=False,
    truncation=True,
    max_length=128,
    padding=False,
)

# 3) 生成：.cuda() 是把 input_ids 搬到 GPU；无 GPU 改成 .to('cpu')
output = model.generate(
    input_tokens['input_ids'].cuda(),
    max_new_tokens=20,
    use_cache=True,
    return_dict_in_generate=True,
)

# 4) 解码输出
print(model.tokenizer.decode(output.sequences[0]))
```

### 步骤 6：运行并观察

```powershell
(.venv) PS D:\tool\llm> python demo.py
```

**首次运行会经历三个阶段**，务必耐心等：

1. **下载权重**：进度条在 HF 缓存 `%USERPROFILE%\.cache\huggingface\hub`；70B 模型约 140GB，家用宽带可能要数小时。  
2. **切分分层**：AirLLM 会把模型逐层写到 `layer_shards_saving_path`，期间显示 `Saving layer N ...`。  
3. **推理**：开始真正 `generate`，此时显存占用应稳定在 **4–8GB**（取决于单层大小），磁盘读 IO 很高——这是分层加载在干活。

预期输出（ChatGLM3 示例）：

```
What is the capital of China? The capital of China is Beijing.
```

### 步骤 7：升级到 70B + 量化

跑通小模型后，再换成 70B，顺便开启 4bit 量化：

```python
# demo_70b.py
from airllm import AutoModel

model = AutoModel.from_pretrained(
    "garage-bAInd/Platypus2-70B-instruct",
    compression="4bit",                        # 3× 速度
    layer_shards_saving_path=r"D:\tool\llm\shards_70b",
)

prompt = ["What is the capital of United States?"]
input_tokens = model.tokenizer(
    prompt,
    return_tensors="pt",
    truncation=True,
    max_length=128,
    padding=False,
)

output = model.generate(
    input_tokens['input_ids'].cuda(),
    max_new_tokens=20,
    use_cache=True,
    return_dict_in_generate=True,
)

print(model.tokenizer.decode(output.sequences[0]))
```

运行：

```powershell
(.venv) PS D:\tool\llm> python demo_70b.py
```

边跑边另开一个 PowerShell 监控显存和磁盘：

```powershell
# 每 2 秒刷新一次显存、显卡利用率
PS> nvidia-smi -l 2
```

你应当能看到显存**稳定在 4GB 上下**、GPU 利用率时高时低（因为大半时间在等磁盘 IO）——这正是 AirLLM 的工作特征。

---

## 五、无 GPU / 纯 CPU 跑法

没有 N 卡也能验证流程，把上面两段脚本里的 `.cuda()` 改为 `.to('cpu')` 即可：

```python
output = model.generate(
    input_tokens['input_ids'].to('cpu'),
    max_new_tokens=20,
)
```

CPU 模式吞吐极低，**仅用于跑通流程 / 小模型**，不要指望生成长文本。

---

## 六、常见报错与修复

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `torch.cuda.is_available() == False` | torch 装成 CPU 版 / 驱动与 CUDA 不匹配 | 按步骤 2 重装对应 CUDA 的 torch |
| `CUDA out of memory` | 单层仍大于可用显存 | 加 `compression='4bit'`；或关掉其它占显存程序 |
| `OSError: ... not a local folder and is not a valid model identifier` | HF 没登录 / 模型名拼错 | `huggingface-cli login` + 核对仓库名 |
| `bitsandbytes` import 报错 | Windows 原生支持不全 | 切到 WSL2；或暂时不用 `compression` |
| C 盘爆满 | HF 默认缓存在用户目录 | 设环境变量 `HF_HOME=D:\hf_cache`，并传 `layer_shards_saving_path` |
| 首 token 特别慢 | 冷启动时 I/O 密集 | 用 SSD；后续 token 会快很多 |

设置 Hugging Face 缓存到 D 盘（推荐**永久生效**）：

```powershell
PS> setx HF_HOME "D:\hf_cache"
# 重新打开 PowerShell 生效
```

---

## 七、常用参数速查

| 参数 | 作用 |
| --- | --- |
| `compression` | `'4bit'` / `'8bit'` / `None`，控制是否块级量化 |
| `layer_shards_saving_path` | 分层权重落盘路径，避免 C 盘爆满 |
| `hf_token` | 访问受限模型（如 Llama 官方仓库）时传入 |
| `prefetching` | 是否启用加载—计算并行，默认 `True` |
| `delete_original` | 分层完成后删除原始权重，省一半磁盘 |
| `max_new_tokens` | 最多生成多少个新 token |

---

## 八、适用与不适用场景

**适合**

- 手头只有 4GB / 8GB / 12GB 的消费级显卡，想试 70B 级模型
- 离线环境、需要自建推理服务，又不想上 8×A100
- 学习 LLM 推理内部机制（分层、IO 重叠、量化）

**不太适合**

- 追求极致吞吐量的线上高并发服务（上 vLLM / TensorRT-LLM 更合适）
- 长上下文 + 大 batch：分层加载对 IO 压力极大，SSD 性能直接决定体验

---

## 九、小结

AirLLM 的价值不在"新模型"，而在于**把 70B+ 模型从云上特权拉回到单卡 PC**。对个人开发者、研究者、做本地 Agent 的同学，它是一张性价比极高的入场券。

本文的完整落地路径：

```
python -m venv .venv → activate → 装对版本的 torch
       → pip install airllm bitsandbytes → 写 demo.py
       → python demo.py 看到输出 → 换 70B + compression='4bit' 冲刺
```

下一步我会把 Llama 3.1 70B 在本机跑起来，记录磁盘占用、首 token 延迟、tokens/s，更新到后续的对比测评文章里。
