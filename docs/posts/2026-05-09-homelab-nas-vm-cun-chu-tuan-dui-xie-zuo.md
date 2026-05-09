---
title: '家庭实验室 #4 ｜ NAS VM 篇 — 存储池、团队协作、备份策略'
date: 2026-05-09
slug: 'homelab-nas-vm-cun-chu-tuan-dui-xie-zuo'
categories:
  - '家庭实验室'
tags:
  - 'NAS'
  - 'btrfs'
  - 'fnOS'
  - 'TrueNAS'
  - '团队协作'
  - 'rclone'
  - 'homelab'
description: '「家庭实验室从零到一」系列第 4 篇。用一个 PVE VM 跑 NAS 系统，挂载 4TB HDD 直通，搭起团队共享 + 个人备份的存储中心。覆盖 NAS as VM vs 独立物理 NAS、NAS 系统横评（fnOS / 绿联 UGOS / TrueNAS / OMV / 黑群）、btrfs vs ext4 vs ZFS、磁盘 by-id 直通、btrfs 元数据 DUP + zstd 压缩比实测、按部门划分的共享文件夹权限、Win/Mac/CLI 客户端挂载、PVE NFS 备份、btrfs 快照计划、rclone 异地同步，及 5 个真实踩坑（格式化错盘、SMART、中文乱码、备份占满、NAS 自启失败）。'
series: '家庭实验室从零到一'
seriesIndex: 4
---

# 家庭实验室 #4 ｜ NAS VM 篇 — 存储池、团队协作、备份策略

> 系列第 4 篇 ▏前置：[#0 导览](/posts/2026-05-09-homelab-overview-jia-ting-shi-yan-shi-jia-gou) + [#1 PVE](/posts/2026-05-09-homelab-pve-zhuang-ji-pian)。本篇用一个 PVE VM 跑 NAS 系统，挂载 4TB HDD 直通，搭起团队共享 + 个人备份的存储中心。

## 卷首：从 Synology DSM 到 NAS VM

我用 NAS 的轨迹是这样的：

### 阶段 1：Synology DSM（2018-2021）
- 群晖 DS218+，2 盘位 4TB×2
- DSM 系统精致，Photo Station / Drive 体验好
- **痛点**：CPU 太弱（J3355 双核），跑个 Docker 容器都吃力；4K 视频硬解不了
- **痛点**：群晖原厂硬盘溢价高，不用群晖盘有警告

### 阶段 2：黑群晖（2021-2023）
- DIY 的硬件，刷黑群 DSM
- 性能 + 灵活度都上来了
- **痛点**：每次 DSM 升级都要重新引导，担心翻车
- **痛点**：合规风险，正经业务不敢用

### 阶段 3：TrueNAS Scale（2023）
- 跑了几个月
- ZFS 强、UI 现代
- **痛点**：UI 主要服务"专业 NAS 玩家"，家人不会用
- **痛点**：重 ZFS 体验，但我家用不上 ZFS 那么强

### 阶段 4：NAS VM（2024 至今）⭐
- PVE 上跑一个国产 NAS 系统的 VM
- 整个 NAS 当 PVE 的一个虚拟机管理
- 想换 NAS 系统就重建 VM，**核心数据通过磁盘直通保持不变**

---

## 一、为什么把 NAS 装成 VM 而不是独立物理机？

| 维度 | NAS as VM (PVE) | 独立物理 NAS |
|---|---|---|
| **硬件成本** | 一套，PVE Host 多用 | 两套 |
| **空间占用** | 一个机箱 | 两个机箱 |
| **NAS 系统试错** | VM 一键克隆/快照/重建 | 重装系统大动作 |
| **冷备 PVE 整机** | vzdump 全量备份 NAS VM | 需第三方备份方案 |
| **性能** | 直通磁盘后接近原生 | 完全原生 |
| **扩展弹性** | NAS 资源可动态调（CPU/内存） | 加内存/换 CPU 要拆机 |
| **唯一短板** | PVE 挂了 NAS 也没了 | 独立故障域 |

**适合 VM 化**：

- 你有家用实验室服务器（PVE 已就位）
- 数据**不算极致重要**（个人 / 团队级，不是企业核心）
- 重视**灵活性**

**适合独立物理 NAS**：

- 数据是公司核心命脉
- 不希望维护虚拟化层
- 单独留个 NAS 哪怕 PVE 烧了也能转

我的判断：家庭/小团队场景，**NAS as VM 完胜**。

---

## 二、选型对比（NAS 系统横评）

| 系统 | 文件系统 | UI | Docker | 中文 | 学习曲线 | 我的评价 |
|---|---|---|---|---|---|---|
| **fnOS** | btrfs | 极好 | ✅ 应用市场 | ⭐⭐⭐⭐⭐ | 低 | 国产黑马，UI 友好 |
| 绿联 UGOS | btrfs | 好 | ✅ | ⭐⭐⭐⭐⭐ | 低 | 类似 fnOS |
| 极空间 ZSpace | ext4 | 好 | ✅ | ⭐⭐⭐⭐⭐ | 低 | 偏向消费电子 |
| TrueNAS Scale | ZFS | 中等 | ⚠️ via K8s | ⭐⭐ | 高 | 专业，但家人用不来 |
| TrueNAS Core | ZFS | 一般 | ❌ | ⭐⭐ | 高 | 不更新了 |
| OpenMediaVault | ext4/btrfs | 一般 | ✅ via 插件 | ⭐⭐⭐ | 中 | 老牌但 UI 老 |
| Synology DSM | btrfs | 极佳 | ✅ | ⭐⭐⭐⭐ | 低 | 优秀但贵/合规 |
| Unraid | XFS+缓存盘 | 好 | ✅ | ⭐⭐⭐ | 中 | 媒体玩家最爱 |

我的选择是**国产 NAS 系统中的一种**，文章后续以中性方式描述（你按自己喜好选一款国产即可）。

**关键决策点**：

1. **必须支持 btrfs**：CRC + 快照 + 压缩三件套
2. **必须有 Docker 应用市场**：以后扩展全靠它
3. **UI 要中文友好**：家人/团队都要用
4. **支持 SMB / WebDAV**：跨平台访问

---

## 三、为什么必须用 btrfs？

| 特性 | ext4 | btrfs | ZFS |
|---|---|---|---|
| 数据 CRC 校验 | ❌ | ✅ | ✅ |
| 元数据 CRC | ❌ | ✅ | ✅ |
| 快照（snapshot） | ❌ | ✅ | ✅ |
| 透明压缩 | ❌ | ✅ zstd | ✅ |
| 单盘可用 | ✅ | ✅ | ⚠️（不推荐） |
| 写时复制（COW） | ❌ | ✅ | ✅ |
| 容量调整 | ⚠️ | ✅ | ⚠️ |
| 内存需求 | 低 | 低 | 高（1GB/TB） |

ext4 的**致命缺陷**：

- 硬盘扇区静默腐烂（bit rot）—— ext4 **不知道**，照常返回错误数据
- 没快照 —— 误删除文件**永远丢**
- 没压缩 —— 文档/代码占满空间

**btrfs 解决全部**。ZFS 也行，但内存吃得多，单盘场景不友好。

---

## 四、PVE 上准备 NAS VM

### 4.1 直通 4TB HDD 给 NAS VM

PVE 直通磁盘（不是 PCI 控制器，是磁盘级）。

```bash
# PVE Host 上找到 HDD 的 by-id（推荐用 by-id 而不是 sdb，by-id 不会变）
ls -l /dev/disk/by-id/ | grep -v part | grep ata-
# 看到类似:
# lrwxrwxrwx 1 root root 9 May 9 09:00 ata-WDC_WD40EFRX-68N32N0_WD-WCC7K0XXXXX -> ../../sdb

DISK_ID="ata-WDC_WD40EFRX-68N32N0_WD-WCC7K0XXXXX"   # 你的实际 by-id

# 假设 NAS VM 的 ID 是 200
qm set 200 -scsi1 /dev/disk/by-id/$DISK_ID
# 这条命令把整盘以 SCSI 方式给 VM
```

或在 PVE Web UI 操作：

```
节点 pve → VM 200 → Hardware → Add → Hard Disk
  Bus/Device: SCSI 1
  Device: /dev/disk/by-id/ata-XXX
  Model: 留空（或填 NAS Disk）
  Discard: ✅ (SSD 用，HDD 可关)
[Create]
```

### 4.2 创建 NAS VM

PVE Web UI: 节点 pve → Create VM。

| 字段 | 设置 |
|---|---|
| **VM ID** | 200 |
| **Name** | vm-nas |
| **OS** | Linux 6.x（如果选项里有），或 Other |
| **ISO** | 你下载的国产 NAS 系统 ISO |
| **System** | BIOS: SeaBIOS，QEMU Agent: ☑ |
| **Disk (SCSI 0)** | 系统盘 64 GB | 装 NAS 系统本身够 |
| **Disk (SCSI 1)** | 上面直通的 4TB HDD | 数据盘 |
| **CPU** | 4 核（Type: host） | 视频转码不开够，转码再加 |
| **Memory** | 16 GB | 可上下伸缩 |
| **Network** | Bridge: vmbr0, Model: VirtIO | VirtIO 性能最好 |
| **Start at boot** | ☑ | NAS 必须自启 |

### 4.3 安装 NAS 系统

启动 VM，按你选的 NAS 系统的安装向导走。注意点：

1. **系统装在 64GB 系统盘**，不是 4TB 数据盘
2. **数据盘留给后面创建存储池**，安装时不要碰
3. 安装时可能要求设管理员账号、设备名等

装完登录 NAS Web UI（参考 NAS 系统说明，端口可能是 5666 / 8080 / 8888 等）。

---

## 五、创建 btrfs 存储池

### 5.1 关键决策：池类型选 btrfs

进 NAS Web UI → 存储管理 → 创建存储池：

| 选项 | 我的设置 | 说明 |
|---|---|---|
| **存储池类型** | Basic（单盘）或 Mirror（如果你有 2 块盘） | 见下文 |
| **文件系统** | **btrfs** | ⚠️ 必须！ |
| **元数据冗余** | DUP（双份） | 单盘场景的"伪 RAID" |
| **数据冗余** | Single | 单盘没法多冗余 |
| **压缩** | zstd | 压缩比好、CPU 占用低 |
| **加密** | 自选 | 物理失窃才有用 |

### 5.2 btrfs 元数据 DUP 是什么意思？

btrfs 给元数据双份存储**在同一块盘的不同位置**：

- 文件名、目录树、文件系统结构 = 元数据
- 文件实际内容 = 数据

**单盘场景下，DUP 元数据 = 硬盘个别扇区损坏不影响目录结构**。文件可能丢部分内容，但目录结构在。

如果有 2+ 块盘，btrfs 可以做 RAID1（数据元数据都双份存到不同盘上）—— 那才是真正的硬件冗余。

### 5.3 zstd 压缩比对比

我的实测（团队办公文档目录）：

| 类型 | 压缩前 | 压缩后 | 比率 |
|---|---|---|---|
| Word/Excel | 100 GB | 75 GB | 25% 节省 |
| 代码仓库 | 50 GB | 22 GB | 56% 节省 |
| PDF / 图片 | 200 GB | 195 GB | 几乎无 |
| 视频 | 500 GB | 500 GB | 0%（已压缩过） |

**结论**：zstd 对文档有奇效，对媒体无感。开就完了。

---

## 六、共享文件夹与权限

按部门划分目录：

```
/data/
├── 01-公共/           （全员可读写）
├── 02-技术部/         （技术读写，其他只读）
├── 03-销售部/         （销售读写，其他只读）
├── 04-财务部/         （财务读写，其他不可见）
├── 05-人事部/         （HR 读写，其他不可见）
├── 99-备份/           （管理员独占）
└── home/              （个人目录）
    ├── alice/
    ├── bob/
    └── ...
```

### 6.1 创建用户与用户组

NAS Web UI → 用户管理 → 创建：

```
用户:
  alice / bob / charlie / dave / ...

用户组:
  technical    （技术部）
  sales        （销售部）
  finance      （财务部）
  hr           （人事部）
  admins       （管理员）

把用户加到对应组
```

### 6.2 创建共享文件夹与权限

```
共享 → 添加共享文件夹

01-公共：
  路径: /data/01-公共/
  访问权限: 所有用户读写
  
02-技术部:
  路径: /data/02-技术部/
  访问权限:
    - technical 组: 读写
    - 其他组:       只读
    - 财务/人事:    无权限（不可见）

04-财务部:
  路径: /data/04-财务部/
  访问权限:
    - finance 组:  读写
    - admins 组:   读
    - 其他:        无权限（不可见）
```

⚠️ **NAS 系统的默认行为是"全员可见"**，你必须**主动取消其他组的权限**，否则财务文档全员可读。

### 6.3 启用 SMB 协议

```
设置 → 文件服务 → SMB
  ☑ 启用 SMB
  最低协议: SMB 2.0（兼容 Win 7+）
  最高协议: SMB 3.1.1（最快）
  
  ⚠️ SMB 1.0 永远不要开（漏洞太多）
```

---

## 七、客户端访问

### 7.1 Windows 映射网络驱动器

```
打开"此电脑" → 顶部菜单"映射网络驱动器"
  驱动器: Z:
  文件夹: \\192.168.X.20\02-技术部
  ☑ 登录时重新连接
  ☑ 使用其他凭据
  → 输入 alice / 你的密码
[完成]

之后 Z 盘就是技术部共享，跟本地盘一样用
```

### 7.2 macOS Finder 连接

```
Cmd+K → smb://192.168.X.20
  → 输入用户密码
  → 选要挂载的共享
  
Cmd+Shift+T 添加到侧边栏，永久访问
```

### 7.3 手机 App

NAS 系统通常自家有手机客户端。装好后扫码或填账号登录。

### 7.4 命令行（开发场景）

```bash
# Linux/Mac mount SMB
sudo mkdir /mnt/nas-tech
sudo mount -t cifs //192.168.X.20/02-技术部 /mnt/nas-tech \
    -o username=alice,password=YOUR_PASSWORD,vers=3.0,iocharset=utf8

# 永久挂载（fstab）
echo "//192.168.X.20/02-技术部 /mnt/nas-tech cifs credentials=/root/.nas-creds,vers=3.0,iocharset=utf8 0 0" | \
    sudo tee -a /etc/fstab

# /root/.nas-creds（mode 600）
echo "username=alice
password=YOUR_PASSWORD" | sudo tee /root/.nas-creds
sudo chmod 600 /root/.nas-creds
```

---

## 八、备份策略

### 8.1 PVE 备份 → NAS

把 PVE 的 vzdump 备份目标设到 NAS：

```
NAS 创建一个 NFS 共享:
  路径: /data/99-备份/pve-backup
  权限: PVE Host IP (192.168.X.10) 全权限

PVE Web UI:
  Datacenter → Storage → Add → NFS
    ID: nas-backup
    Server: 192.168.X.20
    Export: /data/99-备份/pve-backup
    Content: VZDump backup file
  
  Datacenter → Backup → Add
    Schedule: sun 02:00
    Storage: nas-backup
    Compression: ZSTD
    Mode: Snapshot
    Selection: All
```

每周日凌晨 2 点自动备份所有 VM 到 NAS。

### 8.2 NAS 自身的快照

btrfs 的杀手级功能：**几乎零成本快照**。

```
NAS Web UI → 存储池 → 快照 → 创建快照计划
  目标: /data
  策略: 每天 03:00 自动快照
  保留: 最近 7 天 + 每周 1 个 (4 周) + 每月 1 个 (12 月)
```

误删除文件时，从快照恢复，**几秒钟就行**。

### 8.3 异地备份 → 云

NAS 数据通过 rclone 同步到阿里云 OSS / 腾讯云 COS / Backblaze B2：

```bash
# 在 NAS 容器或 Docker 里跑 rclone
rclone config   # 配置目标 (oss / b2 / s3 等)

rclone sync /data/99-备份 oss:my-backup-bucket/nas-backup \
    --progress \
    --transfers 4 \
    --bwlimit 5M    # 限速 5 MB/s 不影响家用上行
```

cron 跑：

```cron
0 4 * * 1 rclone sync /data/99-备份 oss:my-backup-bucket/nas-backup --bwlimit 5M >> /var/log/rclone.log 2>&1
```

每周一凌晨 4 点同步到云。

---

## 九、踩坑时间线

### 坑 1：装 NAS 系统时格式化错盘，丢数据

**症状**：装 NAS 时把整盘格式化，4TB 数据归零。

**原因**：装 NAS 时，不是只装到系统盘，安装向导**问要不要给数据盘也初始化**，眼一花点了。

**解决**：装机时**只给一块盘（系统盘）**，数据盘**安装完成后**再加。

---

### 坑 2：直通磁盘后 NAS 看不到 SMART 信息

**症状**：NAS 里点"硬盘健康"，所有数据都是 N/A。

**原因**：scsi 直通是磁盘级，丢失 SATA 控制器层的 SMART 信息。

**解决**：要么接受没 SMART（NAS 系统不监控盘故障，靠 PVE 监控），要么换 PCIe 直通整个 SATA 卡。

---

### 坑 3：SMB 共享中文文件名乱码

**症状**：Windows 上传中文名文件，NAS 上看是乱码。

**原因**：编码不匹配。

**解决**：

```bash
# Linux 客户端 mount cifs 时加参数
mount -t cifs ... -o iocharset=utf8

# NAS 端 smb.conf 确认
[global]
unix charset = UTF-8
display charset = UTF-8
dos charset = CP936
```

---

### 坑 4：备份占满 NAS 后删不掉

**症状**：vzdump 备份累积太多，4TB 盘满了。

**原因**：没设备份保留策略，每周备份不删旧的。

**解决**：

```
PVE Datacenter → Backup → 编辑你的备份任务
  Retention: keep-weekly=4, keep-monthly=3
```

只保留最近 4 周 + 最近 3 个月。

---

### 坑 5：NAS 自启失败，业务全停

**症状**：PVE 重启后，NAS VM 没起来，所有依赖 NAS 的服务报错。

**原因**：NAS VM 启动时，HDD 还没 ready（直通盘有时候要等几秒）。

**解决**：

```
PVE: VM 200 → Options → Start/Shutdown order
  Boot Order: 1 (优先级最高)
  Startup delay: 30 秒
```

确保 NAS VM 优先启动 + 给 30 秒缓冲。

---

## 十、个人反思

### 反思 1：NAS 不是越复杂越好

我前面在 TrueNAS Scale 里折腾过 ZFS，看 YouTube 教程做 RAID-Z2，搞 dedupe，配 cache 分层…… **结果家人完全不会用**。

后来切到 UI 友好的国产 NAS，**全家都能用**：

- 老婆备份手机照片
- 小孩看 NAS 媒体库的电影
- 我自己存代码 / 文档

**家用 NAS 的 KPI 是"家人愿意用"**，不是"我有多懂存储"。

---

### 反思 2：备份不做就是耍流氓

我有个朋友，NAS 用了 5 年，从不做异地备份。某天家里失火，NAS 烧成灰。**5 年的家庭照片全没了**。

从那以后我的原则是：

```
3-2-1 备份原则:
  3 份副本（原始 + 本地备份 + 异地备份）
  2 种介质（HDD + 云）
  1 份异地（不和原始数据同地点）
```

家庭照片这种**不可重建的数据**，必须 3 份。代码、文档可以放松到 2 份。

---

### 反思 3：权限错了比没装 NAS 还危险

NAS 默认设置往往是"先把文件存上来再说"，权限事后再调。

但**事后调**意味着：**财务文件已经被销售部看了一遍**，**人事档案已经被技术部看了一遍**。

**正确做法**：

1. 创建共享时**立即设权限**
2. 默认权限 = "禁止所有人"
3. 一个一个组**显式授权**

---

## 十一、与其他方案的横向对比

### vs 直接 Windows 共享文件夹
- Win 共享 SMB 1.0/2.0 配置粗糙，不可靠
- 没 btrfs 的 CRC/快照/压缩
- 单台 Windows 死机就完蛋

### vs 网盘（百度云 / 阿里云盘）
- 上传慢（家用上行 30Mbps，跑满也要几小时）
- 隐私问题（你的家庭照片放在云端...）
- 收费（Pro 版/超级会员/容量限制）
- **但适合"灾备" + "异地访问临时小文件"**

### vs Synology / 群晖
- 群晖 UI 极佳，但溢价高（同等硬件 2 倍价）
- 群晖原厂硬盘绑定（不用群晖盘有警告）
- 黑群晖能解决，但合规风险

### vs TrueNAS（专业派）
- TrueNAS 强但**给 Pro 用的**
- 家人用不来
- 我的家庭实验室不需要 ZFS 的复杂

### vs 单纯的 Linux + Samba + Cockpit
- DIY 派可以这么搞
- 完全免费 / 无依赖
- 但**没现成 UI**，每次配置改 smb.conf
- 家人 / 团队用不来

---

## 十二、下一步

NAS 装好后，PVE 备份 + 团队共享 + 个人备份**都有目标**了。下一步：

1. 建 Dev-Server VM
2. 把 NAS 作为 Dev-Server 的备份目标

下一篇：**[#5 Dev-Server VM：开发环境搭建](/posts/2026-05-09-homelab-dev-server-vm-kai-fa-zhan)**

---

## 附录：常用命令速查

```bash
# btrfs 工具
btrfs filesystem show /data           # 看文件系统占用
btrfs subvolume list /data            # 看子卷
btrfs subvolume snapshot /data /data/.snap-$(date +%F)  # 手动快照
btrfs subvolume delete /data/.snap-XXX                  # 删快照
btrfs scrub start /data               # 数据完整性扫描（建议每月一次）
btrfs scrub status /data              # 查扫描进度

# 压缩状态
compsize /data                         # 看实际压缩比

# SMB 状态
smbstatus                              # 看当前连接
smbclient -L //localhost -N            # 看本地 SMB 共享

# rclone 备份
rclone size oss:my-bucket             # 看远端占用
rclone copy /data/photos oss:my-bucket/photos --dry-run  # 演练

# NAS VM 备份/恢复（PVE Host 上）
vzdump 200 --mode snapshot --compress zstd --storage local
qmrestore /var/lib/vz/dump/vzdump-qemu-200-2026_01_01-02_00_01.vma.zst 999
```

---

> **本文协议**：CC BY-NC-SA 4.0，转载请保留出处
