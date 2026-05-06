---
title: '把闲置电脑改造成 All-in-One 家用服务器：Proxmox VE 9.1 + 飞牛 fnOS + Tailscale 完整部署记录'
date: 2026-05-03
slug: 'proxmox-fnos-all-in-one-jia-yong-fu-wu-qi-bu-shu'
categories:
  - '折腾笔记'
tags:
  - 'PVE'
  - 'Proxmox'
  - '飞牛OS'
  - 'fnOS'
  - 'NAS'
  - '虚拟化'
  - 'Tailscale'
  - '内网穿透'
  - 'homelab'
description: '从零开始把一台闲置电脑改造成基于 Proxmox VE 9.1 的虚拟化平台，部署飞牛 fnOS 作为家用 NAS，最后通过 Tailscale 实现安全的远程访问。完整记录踩坑过程、关键决策点、配置参数和验证步骤。'
---

# 把闲置电脑改造成 All-in-One 家用服务器：Proxmox VE 9.1 + 飞牛 fnOS + Tailscale 完整部署记录

## 写在前面

家里有一台闲置多年的旧 PC，跑 Windows 越来越卡，但配置又没差到不能用。一开始想直接装个 Win10 LTSC 给家人当办公机，纠结之后改变了思路：**与其只跑一个用途，不如一机多用**。

最终方案：装 Proxmox VE 9.1 当虚拟化平台，里面跑飞牛 fnOS 作为家用 NAS，通过 Tailscale 实现安全的远程访问，剩余资源后续再扩展其他服务。

整个过程从下载 PVE ISO 到飞牛 + 远程访问能用，**实际耗时约 3-4 小时**（含 Tailscale 配置）。本文记录完整流程、关键决策点、踩过的坑。

## 硬件清单和方案选型

### 硬件配置

这是一台典型的闲置家用 PC，大致参数如下（实际部署请按自己机器调整）：

| 部件 | 说明 |
|------|------|
| CPU | 一颗多年前的桌面级 4 核 CPU |
| 主板 | 入门级消费主板，无 ECC |
| 内存 | 16GB DDR3 |
| 系统盘 | 128GB SATA SSD |
| 数据盘 | 500GB HDD |
| 网卡 | 板载千兆 |

只要 CPU 支持 VT-x（虚拟化扩展），内存 ≥ 8G，有一块 SSD 装系统、一块 HDD 当数据盘，就足够跑这套方案。

### 方案对比

考虑过几种方案：

**方案 A：单装飞牛 fnOS**
- 优点：简单直接，专门做 NAS
- 缺点：浪费闲置 PC 的 CPU 性能，未来扩展受限

**方案 B：装 Ubuntu Server + Docker**
- 优点：灵活
- 缺点：管理复杂，所有服务挤一起，挂一个全挂

**方案 C：Proxmox VE + 多 VM/LXC（最终选择）⭐**
- 优点：虚拟化隔离，每个服务独立，快照备份方便
- 缺点：要学一点 PVE，资源开销略高（约 1.5G 内存）

选 C 的核心理由：**这台机器空闲资源还很多**（16G 内存 + 4C/4T CPU），全给一个用途太可惜。PVE 让我可以在不影响 NAS 的情况下随时加新服务。

### 为什么不上 Win11 / Win10 LTSC

简单说：

- Win10 22H2 已经 EOL（2025 年 10 月停止支持），新装等于裸奔
- Win10 IoT Enterprise LTSC 2021 支持到 2032 年，但只装一个 Win10 太浪费
- Win11 对老平台 CPU 不友好（要 8 代酷睿+）
- 跑 NAS 服务 Linux 远胜 Windows

### 为什么不上 ZFS、群晖

- ZFS 单盘没意义，还吃 4-6G 内存做缓存（这台只有 16G）
- 黑群晖在 PVE 里跑，性能比飞牛差，且法律灰色地带
- 飞牛 fnOS 是国产新秀，免费、中文、对硬件兼容性好

## BIOS 配置（关键的几项）

进 BIOS（开机按 Del 或 F2），重点改这几项：

### 必改项（影响 PVE 安装）

```
Advanced → CPU Configuration
  ├─ Intel Virtualization Technology (VT-x)  → Enabled  [必需]
  └─ Intel VT-d                              → Enabled  [硬盘直通必需]

Peripherals → SATA Configuration
  └─ SATA Mode Selection                     → AHCI

BIOS Features
  ├─ Boot Mode Selection                     → UEFI Only
  ├─ Secure Boot                             → Disabled
  ├─ CSM Support                             → Disabled
  └─ Fast Boot                               → Disabled
```

### 推荐项（提升体验）

```
Power Management
  ├─ AC Back                                 → Always On  [断电恢复自动开机]
  └─ ErP                                     → Disabled   [允许 WOL]
```

部分入门芯片组按官方说明不支持 VT-d，但实际 BIOS 里能开就开。开了能用最好；找不到选项就用 SCSI 透传方式实现硬盘直通，效果一样。

## Proxmox VE 9.1 安装

### 下载 + 启动盘制作

从 Proxmox 官网下载 PVE 9.1 ISO（约 1.83GB），用 Rufus 写入 U 盘时**必须选 DD 镜像模式**（不是 ISO 模式），否则启动盘做不出来。

PVE 9.1 是基于 Debian 13 (Trixie) 构建，支持周期到 2030 年，是当前最佳选择。

### 安装关键参数

进入图形化安装向导，几个关键参数：

**磁盘配置（128G SSD 容量限制下的最佳分配）**

```
Filesystem:   ext4              [单盘别选 ZFS]
Target Disk:  /dev/sda (128G)
hdsize:       110
swapsize:     4
maxroot:      40                [PVE 系统盘 40G]
maxvz:        55                [VM 镜像存储池 55G]
minfree:      8                 [必留空闲，避免磁盘满崩溃]
```

**网络配置**

```
Hostname:    pve-home.lan
IP CIDR:     192.168.x.230/24
Gateway:     192.168.x.1
DNS:         223.5.5.5
```

注意：Hostname 必须是 FQDN 格式（带域名后缀），但 PVE 9 的 Summary 页面只显示主机名部分（隐藏域名），这是显示 bug，不影响实际配置。

500G HDD 不要在这一步选！留着等系统装好后单独配置，方便分区直通给飞牛。

## PVE 初始化（必做的几件事）

PVE 装好后第一次登录浏览器（`https://192.168.x.230:8006`），会弹"No valid subscription"警告——正常，没买企业订阅而已。

接下来在 PVE Shell（左侧节点 → Shell）执行初始化：

### 1. 切换企业源 → 社区免费源

PVE 9 用了新的 DEB822 格式源文件（`.sources` 后缀），跟旧版 `.list` 格式不同。

```bash
# 禁用企业源（PVE 9 新格式）
for src in pve-enterprise.sources ceph.sources; do
  if [ -f /etc/apt/sources.list.d/$src ]; then
    echo "Enabled: false" >> /etc/apt/sources.list.d/$src
  fi
done

# 禁用默认 Debian 源（用清华源代替）
echo "Enabled: false" >> /etc/apt/sources.list.d/debian.sources
```

### 2. 换成清华镜像源

国内访问 Proxmox 官方源很慢，强烈建议换清华源：

```bash
# Debian 主源
cat > /etc/apt/sources.list << 'EOF'
deb https://mirrors.tuna.tsinghua.edu.cn/debian/ trixie main contrib non-free non-free-firmware
deb https://mirrors.tuna.tsinghua.edu.cn/debian/ trixie-updates main contrib non-free non-free-firmware
deb https://mirrors.tuna.tsinghua.edu.cn/debian/ trixie-backports main contrib non-free non-free-firmware
deb https://mirrors.tuna.tsinghua.edu.cn/debian-security/ trixie-security main contrib non-free non-free-firmware
EOF

# PVE 源（DEB822 格式）
cat > /etc/apt/sources.list.d/pve-no-subscription.sources << 'EOF'
Types: deb
URIs: https://mirrors.tuna.tsinghua.edu.cn/proxmox/debian/pve
Suites: trixie
Components: pve-no-subscription
Signed-By: /usr/share/keyrings/proxmox-archive-keyring.gpg
EOF

# 更新
apt update && apt upgrade -y
```

### 3. 关闭无订阅弹窗

每次登录弹"无效订阅"挺烦的，一行命令解决：

```bash
sed -i.bak "s/data\.status\.toLowerCase\(\) !== 'active'/false/g" \
  /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js
systemctl restart pveproxy
```

执行完后强制刷新浏览器（Ctrl+Shift+R）即可生效。

### 4. 安装常用工具

```bash
apt install -y htop iotop iftop net-tools vim curl wget git \
  unzip zstd tmux ncdu smartmontools lm-sensors parted
```

特别注意 `parted` 必须装——PVE 9 默认没带，后面分区要用。

## 解决 local-lvm 默认大小过小的问题

执行 `lvs` 看 LVM 卷状态时发现一个坑：

```
LV    VG  Attr       LSize
data  pve twi-a-tz--  6.00g    ← 只有 6G！
root  pve -wi-ao---- 38.25g
swap  pve -wi-ao----  4.00g
```

PVE 9 默认给 `local-lvm`（VM 存储池）只分了 6GB，剩余 50G+ 没分配。装一个 16G 的飞牛 VM 就爆了。

解决方法很简单：

```bash
lvextend -l +100%FREE /dev/pve/data
lvs
```

执行后 `pve-data` 从 6G 涨到 ~64G，刚好够后续部署。

## 配置 500G HDD：分区 + PVE 数据池 + 直通预留

500G HDD 的规划：**100G 给 PVE 当数据池（备份/缓存），剩下 365G 整个直通给飞牛 VM 当 NAS 主存储**。

### 分区 + 格式化

```bash
# 清除原有分区表
sgdisk --zap-all /dev/sdb
wipefs -a /dev/sdb

# 创建 GPT，分两个区
parted -s /dev/sdb mklabel gpt
parted -s /dev/sdb mkpart primary ext4 1MiB 100GiB
parted -s /dev/sdb mkpart primary 100GiB 100%
partprobe /dev/sdb

# 第一个分区格式化为 ext4 给 PVE 用
mkfs.ext4 -F -L pvedata /dev/sdb1
```

### 挂载 sdb1 到 /mnt/pvedata

```bash
mkdir -p /mnt/pvedata

# 用 UUID 挂载（设备名可能变，UUID 稳定）
SDB1_UUID=$(blkid -s UUID -o value /dev/sdb1)
echo "UUID=$SDB1_UUID /mnt/pvedata ext4 defaults,nofail 0 2" >> /etc/fstab

systemctl daemon-reload
mount -a

df -h /mnt/pvedata
```

### 在 PVE 网页添加为存储

```
数据中心 → 存储 → 添加 → 目录
  ID:    pvedata
  目录:  /mnt/pvedata
  内容:  磁盘映像、ISO 映像、容器模板、备份、容器（全选）
  节点:  所有（无限制）
```

### 拿到 sdb2 的稳定设备 ID

直通磁盘要用稳定的 by-id 路径，不是 `/dev/sdb2`（设备名重启可能变）：

```bash
ls -la /dev/disk/by-id/ | grep sdb2
```

输出类似：

```
ata-XXXXX_xxxxxxxxx-part2 -> ../../sdb2
```

把这个完整 ID 记下来，等会创建飞牛 VM 时用。

## 创建飞牛 VM

### 上传飞牛 ISO

去飞牛官网下载最新 ISO（约 2.7GB），上传到 PVE 的 `pvedata` 存储（不要传 local，128G 系统盘空间紧张）：

```
PVE 网页 → pve-home → pvedata → ISO 镜像 → 上传
```

### VM 配置（关键参数）

点右上角"创建虚拟机"，按这个配置走：

| Tab | 选项 | 值 |
|-----|------|-----|
| 常规 | 名称 | fnos-nas |
| 常规 | VM ID | 100 |
| 操作系统 | 存储 | pvedata |
| 操作系统 | ISO | fnos-x.x.x.iso |
| 操作系统 | 类型/版本 | Linux / 6.x - 2.6 Kernel |
| 系统 | 机型 | **q35**（不是默认的 i440fx） |
| 系统 | BIOS | **OVMF (UEFI)** |
| 系统 | EFI 存储 | local-lvm |
| 系统 | Qemu 代理 | **☑ 启用**（重要） |
| 系统 | 预注册密钥 | ☐ 不勾（避免 Secure Boot 问题） |
| 系统 | SCSI 控制器 | VirtIO SCSI single |
| 磁盘 | 总线 | SCSI |
| 磁盘 | 存储 | local-lvm |
| 磁盘 | 大小 | 16 GB |
| 磁盘 | 缓存 | **Write back**（提升性能） |
| 磁盘 | 丢弃 (Discard) | **☑** |
| 磁盘 | SSD 仿真 | **☑** |
| 磁盘 | IO thread | ☑ |
| CPU | 核心 | 2 |
| CPU | 类型 | **host**（性能最好） |
| 内存 | 内存 | 4096 MiB |
| 内存 | 最小内存 | 2048 MiB |
| 内存 | Ballooning | **☑ 启用** |
| 网络 | 桥接 | vmbr0 |
| 网络 | 模型 | VirtIO（半虚拟化） |
| **确认** | 创建后启动 | **☐ 不勾**（先不启动） |

容易踩的坑：

1. **机型必须 q35**，不是默认的 i440fx，飞牛官方推荐
2. **BIOS 必须 OVMF (UEFI)**，不是 SeaBIOS
3. **CPU 类型必须 host**，不要 kvm64（性能差很多）
4. **预注册密钥不要勾**，否则飞牛可能引导失败
5. **Qemu 代理必须勾**，否则 PVE 看不到 VM 的 IP，备份一致性也会打折

很多默认选项需要点页面底部的"高级 ☑"才能展开看到（比如 SSD 仿真、Ballooning），这是 PVE 9 网页的设计。

### 添加直通磁盘（命令行）

VM 创建完**先别启动**，在 PVE Shell 执行：

```bash
qm set 100 -scsi1 /dev/disk/by-id/ata-XXXXX_xxxxxxxxx-part2

# 验证
qm config 100
```

预期看到 `scsi1` 一行：

```
scsi1: /dev/disk/by-id/ata-XXXXX_xxxxxxxxx-part2,size=374540M
```

374540M ≈ 365GB，跟我们规划的一致。

## 飞牛 fnOS 安装

### 启动 + 进入安装界面

```
PVE 网页 → VM 100 → 启动 → 控制台
```

VM 启动后会从 ISO 引导进入飞牛安装向导。

### 关键步骤

**自定义设置（系统分区 + Swap）**

飞牛对 16GB 系统盘的限制：**系统分区扣除 swap 后必须 ≥ 8GB**。

```
推荐配置：
  系统分区大小: 11 GB
  Swap 大小:    3 GB

理由：
  ✅ 11 - 3 = 8GB，刚好满足飞牛要求
  ✅ Swap 3GB ≥ 飞牛建议值
  ✅ 剩余 16 - 11 = 5GB 给系统数据存储
```

不能填 16GB（系统分区把整盘吃了，没空间放 swap）。

**选择安装磁盘**

会弹出确认框：

```
系统即将安装至硬盘 [sda] QEMU HARDDISK
硬盘将被格式化，硬盘上的全部数据将被抹除。
```

PVE 的 SCSI 控制器映射规则：`scsi0 → sda`、`scsi1 → sdb`，所以飞牛看到的 sda 就是我们配置的 16G 系统盘。可以放心确定。

**网络配置**

飞牛 1.1.x 安装阶段只支持 DHCP，会拿到一个临时 IP。装完后进系统再改静态 IP。

### 首次登录

飞牛装好后控制台显示访问地址：

```
fnOS Web UI can be directly accessed at: http://192.168.x.135:5666
```

浏览器访问，进入"开始使用 fnOS"向导：

```
设备名称：     fnos-home
超级管理员：   admin
密码：        强密码（至少 12 位）
```

## 飞牛初始化（必做）

### 1. 改静态 IP（强烈推荐）

```
路径：系统设置 → 网络 → enp6s18 → 编辑

  IP 模式：    静态
  IP 地址：    192.168.x.231
  子网掩码：   255.255.255.0
  网关：      192.168.x.1
  DNS：       223.5.5.5
```

改完浏览器要换新地址访问：`http://192.168.x.231:5666`

### 2. 创建存储池（365G HDD）

```
路径：存储管理 → 存储池 → 创建存储池

步骤 1: 文件系统    Btrfs（推荐）
步骤 2: 选硬盘     365.76 GB（直通的 HDD）
       存储模式：  Basic
步骤 3: 用户权限    admin / 不限制容量
步骤 4: 确认       
       硬盘读写检测：跳过（全新盘建议跳过）

格式化耗时：HDD 约 10-30 分钟
```

文件系统选 Btrfs 的理由：

- ✅ 支持快照（误删能恢复）
- ✅ 透明压缩（小文件多塞 20-30%）
- ✅ 飞牛 1.1.x 集成度最好
- ❌ 不选 ZFS：低内存机器吃不消（建议每 TB 配 1G 内存）
- ❌ 不选 ext4：没快照功能

### 3. 创建共享文件夹

至少建这几个：

```
photos     手机照片自动备份
videos     影视库（飞牛影视用）
docs       重要文档
backup     电脑备份目标
downloads  下载缓存
```

### 4. 启用 SMB（Windows / Mac 访问）

```
路径：系统设置 → 文件共享协议 → SMB
  ☑ 启用 SMB 服务
  
然后给每个共享文件夹启用 SMB 共享。

测试访问：
  Windows：Win+R → \\192.168.x.231
  Mac：    Finder → 前往 → 连接服务器 → smb://192.168.x.231
```

### 5. 安装核心应用

通过欢迎引导一键安装：

```
☑ 飞牛相册   手机照片备份必备
☑ 飞牛影视   私人影院 + 自动刮削海报
☐ 绑定飞牛账号        不勾（隐私考虑）
☐ FN Connect 远程访问  不勾（用 Tailscale 代替）
```

## PVE 自动备份配置

最后一步：让 PVE 每周自动备份飞牛 VM，万一系统挂了能快速恢复。

```
路径：PVE 网页 → 数据中心 → 备份 → 添加

  存储:       pvedata（备份到 100G HDD 池）
  计划:       sun 03:00（每周日凌晨 3 点）
  所选 VM:    100 (fnos-nas)
  模式:       快照
  压缩:       ZSTD
  邮件通知:   失败时
```

100G 的备份池能保留 8-10 份历史备份（每份压缩后 5-8GB），足够应付意外。

## 最终架构

```
┌─────────────────────────────────────────────────────────┐
│  闲置 PC + 16G 内存 + 128G SSD + 500G HDD                │
│  └─ Proxmox VE 9.1.9 (192.168.x.230)                     │
│     │                                                    │
│     ├─ 存储池                                              │
│     │  ├─ local         38G    PVE 系统 + ISO            │
│     │  ├─ local-lvm     ~64G   VM/LXC 系统盘 (SSD)       │
│     │  └─ pvedata       ~98G   备份 + 缓存 (HDD)         │
│     │                                                    │
│     └─ VM 100: fnos-nas (192.168.x.231)                  │
│        ├─ fnOS v1.1.x                                    │
│        ├─ 系统盘 16G (在 SSD)                              │
│        ├─ 数据盘 365G (直通 HDD, Btrfs)                    │
│        ├─ 飞牛相册 + 飞牛影视                                │
│        └─ SMB 共享：5 个文件夹                              │
│                                                          │
│  剩余资源：~10G 内存 / ~48G SSD / 0G HDD                  │
│  可用于扩展更多 LXC/VM                                      │
└─────────────────────────────────────────────────────────┘
```

## 几个值得记下的踩坑点

### 坑 1：parted 默认没装

PVE 9 精简安装连分区工具都没带，第一次执行 `parted` 会报 `command not found`。先 `apt install -y parted` 再分区。

### 坑 2：fstab 里写了空 UUID

如果分区还没创建就写 fstab，会导致 UUID 为空。下次重启 systemd 挂载会失败。处理：

```bash
sed -i '/UUID= \/mnt\/pvedata/d' /etc/fstab  # 删掉错误行
```

### 坑 3：PVE 9 的源文件格式变了

旧的 `.list` 格式还能用，但默认的源是 `.sources` 格式（DEB822）。用 `sed` 注释掉 `.list` 是无效的，要往 `.sources` 文件加 `Enabled: false`。

### 坑 4：local-lvm 默认 6G 太小

PVE 9 安装时如果不手动设 maxvz，默认给 VM 存储池分配的空间很小。装机后立刻执行 `lvextend -l +100%FREE /dev/pve/data` 把剩余空间全分给它。

### 坑 5：q35 + UEFI + host CPU 都不是默认值

创建 VM 时这三个关键选项都要手动改。i440fx + SeaBIOS + kvm64 的默认组合在飞牛上有兼容性问题且性能差。

### 坑 6：飞牛系统分区计算逻辑

"系统分区"是包含 swap 的，不是分区之外加 swap。所以系统分区 8GB + Swap 4GB = 系统分区扣 swap 后 4GB，飞牛会拒绝。正确算法是 `系统分区 - Swap ≥ 8GB`。

## 资源占用情况（运行 1 天观察）

```
PVE 本体：
  CPU:   2-5%
  内存:  ~1.5G

飞牛 VM（4G 分配）：
  CPU:   1-3%（空闲），10-20%（备份/刮削）
  内存:  ~1.5G 实际占用（Ballooning 已归还）

总占用：~3G / 16G
余量：   ~13G 给后续扩展
```

闲置 PC + 16G 内存跑 PVE + 飞牛非常轻松，**完全有空间再加 3-5 个 LXC 容器**。

## 后续计划

家用 NAS + 远程访问搞定后，下一步打算：

1. **观察一周**，确认稳定性
2. **按需扩展 LXC**：
   - Vaultwarden（密码管理）
   - AdGuard Home（全屋去广告）
   - Uptime Kuma（服务监控）

不打算一次性把所有服务都装上，**家用基础设施稳定 > 功能齐全**。

## 远程访问：Tailscale 内网穿透部署

家用 NAS 装好只能在家访问意义不大。装好飞牛第二天我就开始研究怎么"在外面也能用"。

### 方案对比：为什么选 Tailscale

考察了几种方案：

| 方案 | 原理 | 优劣 |
|------|------|------|
| **IPv4 公网 + 端口转发** | 路由器映射端口到内网 | ❌ 我家是 CGNAT（IPv4=100.x.x.x），无公网 IPv4 |
| **IPv6 直连** | 飞牛用公网 IPv6 暴露 | ⚠️ 安全风险大、IPv6 地址会变、公司网络不一定支持 IPv6 |
| **DDNS + 端口转发** | 域名指向动态公网 IP | ❌ 同样依赖公网 IPv4 |
| **FastTunnel/frp 自建** | 自己公网服务器中转 | ⚠️ 流量过中转、占带宽、SMB 支持差 |
| **向日葵/ToDesk** | 远程桌面控制 | ❌ 不是 NAS 访问方式 |
| **Tailscale** ⭐ | WireGuard 虚拟内网 | ✅ 加密直连、不暴露端口、跨网络通用 |

最终选 **Tailscale**，核心理由：

```
✅ 不依赖公网 IP（CGNAT 也能用）
✅ 不暴露任何端口在公网（极高安全性）
✅ 全协议支持（HTTP/SMB/SSH/NFS 全通）
✅ P2P 直连优先，不消耗中转流量
✅ 跨任何网络（公司、4G、咖啡店 WiFi 都行）
✅ 免费版 100 设备 + 3 用户，家用绰绰有余
✅ 一次配置，所有 VM 自动可访问
```

### Tailscale 工作原理简述

```
家里设备 + 外面设备 → 都装 Tailscale 客户端 → 加入同一个虚拟内网（Tailnet）
                            ↓
                  每台设备分配 100.x.x.x 的虚拟 IP
                            ↓
                  设备之间走 WireGuard 加密通道直连
                            ↓
              效果：从外面访问家里 NAS 跟在家 WiFi 一样
```

关键概念：

- **子网路由（Subnet Routing）**：在 PVE 上跑 Tailscale，把整个 192.168.x.0/24 网段广播给 Tailnet。其他设备就能通过 PVE 访问家里所有内网设备（飞牛、路由器、其他 VM 等），**不需要每台都装 Tailscale**。
- **MagicDNS**：用主机名访问而不是 IP。

### 为什么装在 PVE 而不是飞牛 VM

```
装在 PVE 主机（推荐）：
  ✅ 一次部署，整个 192.168.x.0/24 都能从外网访问
  ✅ 飞牛、未来加的所有 LXC/VM 都不用单独装
  ✅ 不增加飞牛 VM 的复杂度

装在飞牛 VM：
  ⚠️ 只能访问飞牛
  ⚠️ 每加一个新服务都要装一遍
  ⚠️ 飞牛系统升级可能要重装
```

### 安装 Tailscale（国内访问方案）

直接用官方安装脚本会卡在 SSL 错误：

```bash
root@pve-home:~# curl -fsSL https://tailscale.com/install.sh | sh
curl: (35) TLS connect error: error:0A000126:SSL routines::unexpected eof while reading
```

国内常用的清华源**没有**镜像 Tailscale，中科大有但 GPG key 文件 404，最终能用的是 12306 镜像（`mirrors.china.12306.work`）：

```bash
# 1. 清理之前可能的失败配置
rm -f /etc/apt/sources.list.d/tailscale.list
rm -f /usr/share/keyrings/tailscale-archive-keyring.gpg

# 2. 用 12306 镜像（国内可访问 + Tailscale 包齐全）
curl -fsSL https://mirrors.china.12306.work/repository/tailscale/debian/bookworm.noarmor.gpg \
  -o /usr/share/keyrings/tailscale-archive-keyring.gpg

# 3. 添加源（用 bookworm 包，向下兼容到 trixie）
echo "deb [signed-by=/usr/share/keyrings/tailscale-archive-keyring.gpg] https://mirrors.china.12306.work/repository/tailscale/debian bookworm main" \
  > /etc/apt/sources.list.d/tailscale.list

# 4. 更新 + 安装
apt update
apt install -y tailscale

# 5. 验证
tailscale version
```

**几个关键点**：

- PVE 9 是 Debian 13 (trixie)，但 Tailscale 官方对 trixie 支持滞后，**用 bookworm 包向下兼容**（Tailscale 是 Go 静态编译，不依赖系统库版本，跨发行版兼容性极好）
- 12306 镜像（`mirrors.china.12306.work`）是民间维护的国内镜像，速度还行
- 清华源（tuna）目前不镜像 Tailscale，不要踩坑

**备选镜像**（如果 12306 不可用）：

```bash
# 中科大镜像（注意 GPG key 路径可能要调整）
https://mirrors.ustc.edu.cn/tailscale/

# xEdge 国内一键脚本
curl -fsSL https://ts-mirror.xedge.cc/install.sh | sh
```

### 启用 IP 转发（关键的一步，很容易漏）

PVE 默认关闭 IP 转发，导致子网路由功能用不了。**必须手动开启**：

```bash
# 添加配置（持久化）
cat >> /etc/sysctl.d/99-tailscale.conf << 'EOF'
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
EOF

# 立即生效
sysctl -p /etc/sysctl.d/99-tailscale.conf

# 验证（应该都返回 1）
sysctl net.ipv4.ip_forward
sysctl net.ipv6.conf.all.forwarding
```

第一次装时漏了这一步，结果在 Tailscale 后台勾选子网路由后看到一行橙色警告：

```
⚠️ Unable to relay traffic
This machine has IP forwarding disabled and cannot relay traffic.
```

开了 IP 转发并重启 Tailscale 后警告才消失。

### 启动 Tailscale + 加入 Tailnet

```bash
# 启用并启动服务
systemctl enable --now tailscaled

# 启动 Tailscale，同时启用子网路由
tailscale up --advertise-routes=192.168.x.0/24 --accept-routes

# 输出会显示一个登录 URL：
# To authenticate, visit:
#     https://login.tailscale.com/a/abc123def456...
```

参数说明：

- `--advertise-routes=192.168.x.0/24`：把整个家里网段广播给 Tailnet
- `--accept-routes`：接受其他节点广播的路由（多节点场景有用）

### 登录 Tailscale 账号

登录 URL 必须在能访问 `login.tailscale.com` 的设备上打开（国内大部分要梯子），打开后：

1. 注册/登录账号（推荐 GitHub 或 Email）
2. 授权 pve-home 设备加入 Tailnet
3. PVE Shell 那边自动检测到登录成功

完成后查看状态：

```bash
tailscale status
```

应该看到类似：

```
100.x.x.1   pve-home    user@github   linux   active
```

### Tailscale 后台关键配置（3 项必做）

登录 https://login.tailscale.com/admin/machines

#### 配置 1：批准子网路由

```
机器列表 → pve-home → "..." → Edit route settings
  ☑ 192.168.x.0/24
  → Save
```

如果状态是 "Awaiting approval"，再点一次 Approve。

#### 配置 2：禁用 Key Expiry（家用必做）

PVE 这种长期运行的"基础设施"机器，默认 180 天过期会很烦：

```
pve-home → "..." → Disable key expiry
```

否则到时候断线，你在外面就连不回家了。

#### 配置 3：启用 MagicDNS（可选但推荐）

```
DNS 标签页 → ☑ Enable MagicDNS
```

启用后可以用主机名访问：

```
http://pve-home:8006   ← PVE 管理（替代 IP 访问）
```

### 客户端安装

PVE 这边搞定后，常用设备装上 Tailscale：

| 平台 | 安装方式 |
|------|---------|
| **iOS** | App Store 搜 "Tailscale" |
| **Android** | Play Store / 国内应用市场（部分要 APK 直装） |
| **Windows** | https://tailscale.com/download/windows |
| **macOS** | App Store 或 https://tailscale.com/download/macos |
| **Linux** | 同 PVE 部署方式（用 12306 镜像） |

**所有客户端登录同一个 Tailscale 账号**，就自动加入同一个 Tailnet。

### iOS/Mac 客户端的"隐藏开关"

iOS、Android、Mac 客户端**默认不接受子网路由**，必须手动开启：

```
iOS Tailscale App：
  设置 → "Use Tailscale Subnets" → 开启 ☑

Android Tailscale：
  Settings → Use Tailscale Subnets → 开启 ☑

Mac Tailscale：
  菜单栏图标 → Preferences → Network → Use Tailscale Subnets ☑

Windows Tailscale：
  右下角图标 → Preferences → Use Tailscale Subnets ☑
```

**这一步不开，子网路由就白配了**。第一次装时漏掉这步，怎么试都连不上飞牛，排查半小时才发现是这里。

### 多用户共享 Tailnet（让家人也能用）

家里多个人要访问 NAS，比如家人的设备。Tailscale 免费版支持 3 个用户共享同一个 Tailnet。

**关键流程**：

```
1. 家人在自己设备上装 Tailscale
2. 用她自己的账号登录（GitHub/Email/Apple ID 等）
3. 加入你的 Tailnet（通过 invitation 或共享链接）
4. ⚠️ 此时她设备状态是 "Owner needs approval"
5. Tailnet Owner（你）后台批准
   机器列表 → 找到她的设备 → "..." → Approve
6. 批准后她才能正常访问家里资源
```

**ACL 配置**（确保家人能访问子网路由）：

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["*"],
      "dst": ["*:*"]
    }
  ]
}
```

Personal 版默认就是这个全通配置，家人批准后就能访问。

**Apple ID 隐藏邮箱的坑**：

如果家人用 Apple ID 登录，Tailscale 会拿到 `xxx@privaterelay.appleid.com` 这种隐藏邮箱。这是个一次性中转邮箱：

```
⚠️ 如果家人在 Apple ID 设置里删除了 hide my email
⚠️ Tailscale 那边邮箱失效，设备会掉线
⚠️ 重新登录会创建新的"用户身份"，又要重新批准

建议：
  - 让家人保留这个 hide my email 不删
  - 或者直接用 GitHub / 普通 Email 注册 Tailscale
```

### 实际访问体验

部署完成后的访问方式：

```
[场景 1] 家里 WiFi 下（验证 Tailscale 工作正常）
   浏览器：http://192.168.x.231:5666 → 飞牛
   浏览器：https://192.168.x.230:8006 → PVE
   能打开 → Tailscale 子网路由正常

[场景 2] 公司/咖啡店/4G 网络
   开启手机/笔记本的 Tailscale
   浏览器输入同样的家里 IP
   依然能打开 → 远程访问搞定

[场景 3] 手机飞牛 App
   ⚠️ 飞牛 App 默认走局域网扫描，外网扫不到
   解决：App 里手动添加设备，地址填 192.168.x.231:5666
   注意：手机 Tailscale 必须开着
```

### 速度实测

家里宽带：1000 Mbps 下行 / 100 Mbps 上行（联通家庭宽带）

外面访问家里飞牛实测：

| 场景 | 速度 | 体验 |
|------|------|------|
| 公司 WiFi 下载家里文件 | ~50-80 Mbps | 流畅 |
| 4G 下载家里文件 | ~20-30 Mbps | 流畅 |
| 公司 WiFi 看 1080P 视频 | 流畅 | 接近本地 |
| SMB 文件夹浏览 | 快 | 跟内网无差异 |
| 家里上传文件到飞牛（远程） | 受外面上行限制 | 4G 下约 5-10 MB/s |

**结论**：90% 家用场景跟在家 WiFi 体验一致，只有大文件上传受外面网络上行限制。

### Tailscale 部署踩坑总结

整个 Tailscale 部署过程踩了几个坑：

#### 坑 1：清华源没有 Tailscale 镜像

国内最常用的清华源（mirrors.tuna.tsinghua.edu.cn）**没有镜像 Tailscale**，但很多老教程引用了，导致 404。**用 12306 镜像或中科大替代**。

#### 坑 2：trixie 包暂时不可用

PVE 9 是 Debian 13 (trixie)，但 Tailscale 官方对 trixie 的镜像同步滞后。**直接用 bookworm 包**，向下兼容（Go 静态二进制 + 不依赖系统库）。

#### 坑 3：IP 转发默认关闭

子网路由功能要求 PVE 主机开启 IP 转发，但 Linux 默认是关的。**装完 Tailscale 必须手动开启 net.ipv4.ip_forward**。Tailscale 后台会显示橙色警告提醒。

#### 坑 4：客户端默认不接受子网路由

iOS/Android/Mac/Windows 的 Tailscale 客户端默认**不**启用 "Use Tailscale Subnets"。必须手动开启，否则子网路由白配。

#### 坑 5：Key Expiry 默认开启

新加入 Tailnet 的设备默认 180 天密钥过期。家用基础设施要**手动 Disable key expiry**，否则到时候自动断线。

#### 坑 6：飞牛 App 不支持自动发现外网设备

飞牛 App 默认扫描局域网找设备，外网下扫不到。**必须手动添加设备**，输入家里飞牛的 IP（即使你已经在 Tailscale 网络里了）。或者直接用浏览器 + Web 版。

### 完整命令清单（一键部署参考）

```bash
# === Tailscale 部署完整脚本 ===
# 在 PVE Shell 执行

# 1. 安装（用 12306 镜像）
curl -fsSL https://mirrors.china.12306.work/repository/tailscale/debian/bookworm.noarmor.gpg \
  -o /usr/share/keyrings/tailscale-archive-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/tailscale-archive-keyring.gpg] https://mirrors.china.12306.work/repository/tailscale/debian bookworm main" \
  > /etc/apt/sources.list.d/tailscale.list

apt update && apt install -y tailscale

# 2. 开启 IP 转发
cat >> /etc/sysctl.d/99-tailscale.conf << 'EOF'
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
EOF
sysctl -p /etc/sysctl.d/99-tailscale.conf

# 3. 启动 + 子网路由
systemctl enable --now tailscaled
tailscale up --advertise-routes=192.168.x.0/24 --accept-routes

# 4. 复制输出的登录 URL，浏览器（梯子）打开授权

# 5. 登录后验证
tailscale status
tailscale ip -4

# 6. 后台手动操作（必做）：
#    - 批准子网路由
#    - Disable key expiry
#    - 启用 MagicDNS（可选）
#    - 客户端启用 "Use Tailscale Subnets"
```

## 让 NAS 真正"无人值守"：开机自启动配置

家用服务器的最高境界：**断电恢复后所有服务自动起来，根本不需要人工干预**。

家里时不时会有意外停电（跳闸、电工施工、夏天空调跳闸等），如果每次都要手动开机 → 进 PVE → 启动 VM → 重新登录 Tailscale，那这台 NAS 就废了。配好自启动后**断电恢复 90 秒内一切如常**。

整套自启动有 3 层需要配置：

```
[Layer 1] PVE 主机自启动     ← BIOS 层（断电恢复自动开机）
[Layer 2] 飞牛 VM 自启动     ← PVE 层（VM 跟随主机启动）
[Layer 3] Tailscale 自启动   ← 系统服务层（保持远程访问）
```

### Layer 1：PVE 主机自启动（BIOS）

这一步在最初装机时已经在 BIOS 里配好了：

```
Power Management
  ├─ AC Back        → Always On    ✅ 已配置
  └─ ErP            → Disabled     ✅ 已配置
```

`AC Back = Always On` 表示**通电即自动开机**，不需要按物理电源键。这是家用 7×24 服务器的硬性要求。

验证方法很直接：拔掉电源线，再插上，看机器是否自己启动。

### Layer 2：飞牛 VM 自启动

PVE 默认不会自动启动 VM（因为企业场景可能多 VM 有依赖关系，需要手动控制）。家用场景要让飞牛 VM 跟随 PVE 一起启动。

**方式 A：PVE 网页操作**

```
PVE 网页 → VM 100 (fnos-nas) → 选项
  开机自启动            → 是
  启动/关机顺序          → 1
  开机延迟（秒）         → 30
  关机超时（秒）         → 60
```

**方式 B：命令行（推荐，更精确）**

```bash
# 启用开机自启动
qm set 100 --onboot 1

# 配置启动顺序、延迟、关机超时
qm set 100 --startup order=1,up=30,down=60

# 验证配置
qm config 100 | grep -E '(onboot|startup)'
```

应该看到：

```
onboot: 1
startup: order=1,up=30,down=60
```

**参数解释**：

| 参数 | 含义 | 推荐值 |
|------|------|--------|
| `onboot` | 是否开机自启动 | `1`（启用） |
| `order` | 启动顺序（数字小的先启） | `1`（飞牛是最重要服务） |
| `up` | 本 VM 启动后延迟多少秒再启下一个 | `30`（家用够用） |
| `down` | 关机超时（秒） | `60`（飞牛优雅关机） |

**为什么要配 `up=30` 启动延迟**：

```
未来可能加更多 VM/LXC 时，启动顺序很重要：
  order=1, up=30  飞牛 NAS（基础存储，先起来）
  order=2, up=20  AdGuard（依赖网络）
  order=3, up=20  Vaultwarden（依赖网络）

这样保证依赖关系正确，避免抢资源
```

### Layer 3：Tailscale 自启动确认

Tailscale 安装时 `systemctl enable --now tailscaled` 已经把服务设置成开机自启了。验证一下：

```bash
# 验证服务已启用
systemctl is-enabled tailscaled
# 应该输出：enabled

# 验证服务正在运行
systemctl is-active tailscaled
# 应该输出：active

# 查看详细状态
systemctl status tailscaled
# 应该看到 active (running) since ...
```

如果发现没启用：

```bash
systemctl enable --now tailscaled
```

**Tailscale 的认证状态保存机制**（重要）：

```
认证 token 存储位置：/var/lib/tailscale/tailscaled.state

机器重启后：
  ✅ tailscaled 服务自动启动
  ✅ 自动读取保存的 token
  ✅ 自动重新连接 Tailnet
  ✅ 子网路由自动恢复（之前的 --advertise-routes 配置已持久化）
  ✅ 不需要重新登录、不需要重新扫码
```

这就是为什么之前要在后台 **Disable key expiry** —— 否则 180 天后 token 失效，自动重连就会失败。

### 重启测试：完整验证

配完三层后，做一次完整测试：

```bash
# 在 PVE Shell 执行
reboot
```

**理想的恢复时间线**：

```
T+0s    断电 / reboot 触发
T+5s    主板自检 → BIOS POST
T+15s   GRUB 引导 → Linux 内核启动
T+30s   PVE 服务全部启动
T+30s   Tailscale 服务自启动，自动重连 Tailnet
T+30s   PVE 调度 VM 100（按 order=1 启动）
T+60s   ⏳ up=30 延迟（确保系统稳定）
T+90s   飞牛 VM 系统启动完成
T+95s   ✅ 飞牛 Web、SMB 全部可用
T+95s   ✅ 远程（Tailscale）也能访问

总恢复时间：约 90-120 秒
```

**验证步骤**：

```bash
# reboot 后等 2 分钟，PVE Shell 执行：

# 1. 验证 PVE 启动正常
uptime

# 2. 验证 Tailscale 自动连接
tailscale status
# 应该看到 pve-home 是 active

# 3. 验证飞牛 VM 自动启动
qm list
# VM 100 (fnos-nas) 状态应该是 running

# 4. 验证从外网（手机 4G）能访问
# 用手机浏览器试 http://192.168.x.231:5666
# 能打开 → ✅ 全套自启动成功
```

### 一键自启动配置脚本

```bash
# === 开机自启动完整配置 ===
# 在 PVE Shell 执行

# Layer 2: 飞牛 VM 自启动
qm set 100 --onboot 1
qm set 100 --startup order=1,up=30,down=60

# Layer 3: Tailscale 服务自启动（保险起见再 enable 一次）
systemctl enable tailscaled

# 验证全部配置
echo "=== VM 自启动配置 ==="
qm config 100 | grep -E '(onboot|startup)'
echo ""
echo "=== Tailscale 服务状态 ==="
systemctl is-enabled tailscaled
systemctl is-active tailscaled
echo ""
echo "=== 完成 ✅ 现在可以 reboot 测试 ==="
```

### 一个值得知道的小坑：飞牛系统盘损坏怎么办

```
如果飞牛 VM 系统盘损坏（升级失败、磁盘异常）：
  - 自启动仍然会"尝试启动" VM
  - 但 VM 内部启动失败
  - 飞牛 Web 不可用
  - 但你的数据仍在直通的 365G HDD 上（安全）

处理：
  1. PVE Shell：qm stop 100
  2. 从备份恢复：qmrestore /mnt/pvedata/dump/vzdump-qemu-100-xxx.zst 100
  3. 直通的 HDD 数据池自动重新挂载
  
这就是为什么前面要配 PVE 自动备份 —— 给飞牛 VM 留后路
```

## 最终的网络架构

```
┌─────────────────────────────────────────────────────────────┐
│  联通家庭宽带（CGNAT IPv4 + 真公网 IPv6）                     │
└──────────────┬──────────────────────────────────────────────┘
               ↓ PPPoE
       ┌───────────────────┐
       │ 家用路由器          │
       │ 192.168.x.1       │
       └───────────────────┘
               ↓ 千兆 LAN
┌──────────────────────────────────────────────────────────────┐
│ 闲置 PC + 16G 内存 + 128G SSD + 500G HDD                      │
│ └─ Proxmox VE 9.1.9                                           │
│    │ 192.168.x.230  内网 IP                                   │
│    │ 100.x.x.x      Tailscale IP                              │
│    │                                                          │
│    ├─ Tailscale（子网路由 192.168.x.0/24）                     │
│    │  └─ 让外网设备能访问整个家庭网络                            │
│    │                                                          │
│    └─ VM 100: fnos-nas                                        │
│       │ 192.168.x.231                                         │
│       ├─ fnOS v1.1.x（家用 NAS）                                │
│       ├─ 直通 365G HDD（Btrfs 存储池）                           │
│       ├─ 飞牛相册 + 飞牛影视                                    │
│       └─ SMB 共享                                              │
└──────────────────────────────────────────────────────────────┘
                    ↑ Tailscale 加密通道
                    │
        ┌───────────┴────────────┬──────────────────┐
        │                        │                  │
   你的笔记本               你的手机             家人手机
   （任何网络）             （4G/WiFi）         （Apple ID 登录）
   Tailscale 客户端         Tailscale App      Tailscale App
```

## 一些感想

闲置电脑改造成 All-in-One 服务器是个挺值的折腾：

- **省钱**：商业 NAS 设备贵且功能受限，自建用旧硬件几乎零成本
- **学习**：PVE 是企业级方案，掌握后工作上也能用
- **灵活**：想加什么服务建个 LXC 就行，不用买新硬件
- **远程访问**：Tailscale 让"家"成为随身携带的网络
- **完全自动化**：配好开机自启后，断电恢复 90 秒内一切如常，**真正做到无人值守**

但要清醒认识到：

- **稳定性 < 商业 NAS**：消费主板没 ECC、HDD 也不是 NAS 专用盘
- **维护成本**：要懂一些 Linux 和虚拟化基础
- **重要数据必须有第二份备份**：单盘没冗余，HDD 故障 = 数据全丢

家用 NAS 适合放家庭照片、影视、文档备份，**真正不能丢的资料一定要同步到云盘**（阿里云盘、百度云、iCloud 等）形成 3-2-1 备份策略。

关于远程访问，**Tailscale 是我目前找到的最优家用方案**：

```
✅ 不需要公网 IP（CGNAT 友好）
✅ 不暴露任何端口（极高安全性）
✅ 配置简单（一次完事）
✅ 全平台 + 全协议
✅ 家人也能共享访问

如果你也在做家用 NAS，强烈推荐配套上 Tailscale
比折腾 IPv6 直连、frp、各种内网穿透稳定 10 倍
```

---

整套部署下来，最大的体会是：**先把基础打牢，再考虑扩展**。装好飞牛先用一周再加新东西，比一口气装一堆服务靠谱得多。

家用基础设施这件事，**装好后半年想不起来它的存在，才是真正的成功**。

> 本文内容包含的 IP、UUID、密码等信息均为虚构示例，请按实际环境调整。  
> Tailscale 登录环节需要能访问 login.tailscale.com（国内多数情况需要梯子），但日常使用走的是 P2P 直连，不依赖境外服务器。
