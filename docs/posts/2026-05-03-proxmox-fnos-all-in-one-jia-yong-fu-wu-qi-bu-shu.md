---
title: '把闲置电脑改造成 All-in-One 家用服务器：Proxmox VE 9.1 + 飞牛 fnOS 完整部署记录'
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
  - 'homelab'
description: '从零开始把一台闲置电脑改造成基于 Proxmox VE 9.1 的虚拟化平台，并在其上部署飞牛 fnOS 作为家用 NAS。完整记录踩坑过程、关键决策点、配置参数和验证步骤。'
---

# 把闲置电脑改造成 All-in-One 家用服务器：Proxmox VE 9.1 + 飞牛 fnOS 完整部署记录

## 写在前面

家里有一台闲置多年的旧 PC，跑 Windows 越来越卡，但配置又没差到不能用。一开始想直接装个 Win10 LTSC 给家人当办公机，纠结之后改变了思路：**与其只跑一个用途，不如一机多用**。

最终方案：装 Proxmox VE 9.1 当虚拟化平台，里面跑飞牛 fnOS 作为家用 NAS，剩余资源后续再扩展其他服务。

整个过程从下载 PVE ISO 到飞牛能用，**实际耗时约 2.5 小时**。本文记录完整流程、关键决策点、踩过的坑。

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

家用 NAS 落地后，下一步打算：

1. **观察一周**，确认稳定性
2. **装 Tailscale**：在 PVE 上 5 分钟搞定，公司也能访问家里
3. **按需扩展 LXC**：
   - Vaultwarden（密码管理）
   - AdGuard Home（全屋去广告）
   - Uptime Kuma（服务监控）

不打算一次性把所有服务都装上，**家用基础设施稳定 > 功能齐全**。

## 一些感想

闲置电脑改造成 All-in-One 服务器是个挺值的折腾：

- **省钱**：商业 NAS 设备贵且功能受限，自建用旧硬件几乎零成本
- **学习**：PVE 是企业级方案，掌握后工作上也能用
- **灵活**：想加什么服务建个 LXC 就行，不用买新硬件

但要清醒认识到：

- **稳定性 < 商业 NAS**：消费主板没 ECC、HDD 也不是 NAS 专用盘
- **维护成本**：要懂一些 Linux 和虚拟化基础
- **重要数据必须有第二份备份**：单盘没冗余，HDD 故障 = 数据全丢

家用 NAS 适合放家庭照片、影视、文档备份，**真正不能丢的资料一定要同步到云盘**（阿里云盘、百度云、iCloud 等）形成 3-2-1 备份策略。

---

整套部署下来，最大的体会是：**先把基础打牢，再考虑扩展**。装好飞牛先用一周再加新东西，比一口气装一堆服务靠谱得多。

家用基础设施这件事，**装好后半年想不起来它的存在，才是真正的成功**。

> 本文内容包含的 IP、UUID、密码等信息均为虚构示例，请按实际环境调整。
