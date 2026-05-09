---
title: '家庭实验室 #1 ｜ PVE 9.x 装机篇 — 选型、安装、初始化全流程'
date: 2026-05-09
slug: 'homelab-pve-zhuang-ji-pian'
categories:
  - '家庭实验室'
tags:
  - 'PVE'
  - 'Proxmox'
  - '虚拟化'
  - 'IOMMU'
  - 'homelab'
description: '「家庭实验室从零到一」系列第 1 篇。Proxmox VE 9.x 从硬件就位到第一台 VM 创建之前的完整流程：Hypervisor 横评（PVE / ESXi / Hyper-V / Unraid / TrueNAS）、BIOS 必开项、ISO 安装步骤、订阅弹窗清理、清华镜像源切换、IOMMU + VFIO 直通配置、备份策略，以及 5 个真实踩坑（U 盘 GPT/Legacy、apt 401、CPU host 选项、GPU 直通整机卡死、备份压缩慢）。'
series: '家庭实验室从零到一'
seriesIndex: 1
---

# 家庭实验室 #1 ｜ PVE 9.x 装机篇 — 选型、安装、初始化全流程

> 系列第 1 篇 ▏前置阅读：[#0 系列导览](/posts/2026-05-09-homelab-overview-jia-ting-shi-yan-shi-jia-gou)。本篇记录 Proxmox VE 9.x 从硬件就位到第一台 VM 创建之前的完整流程，含选型对比、踩坑、个人反思。

## 卷首：从 ESXi 到 PVE 的迁移

我最早接触虚拟化是 2019 年，公司机房有几台 Dell R730 跑 VMware ESXi。当时觉得 ESXi 简直是完美——稳定、UI 漂亮、生态成熟。

但 Broadcom 收购 VMware 后，授权策略一夜之间变天，免费版 ESXi 直接砍掉，订阅起步价飙到几千美元/年。这是一个**信号**：**不要把基础设施押在闭源商业产品上**。

后来我陆续试过：

- **Hyper-V**：捆绑 Windows Server，授权费另算，**Linux Guest 体验差**
- **Unraid**：友好但是按 USB 停用，**许可证模式不舒服**
- **TrueNAS Scale**：本质是 NAS 系统兼带虚拟化，**不能反过来**
- **KVM + 命令行**：原生方案，**没 UI 不适合多人协作**

最后落到 **Proxmox VE**：

- 完全开源（GPL）
- 基于 Debian + KVM + LXC，技术栈成熟
- Web UI 完整，但**不强迫用 UI**（CLI 也强大）
- 集群、HA、备份、快照全免费
- 商用订阅可选（不付钱不影响功能，只少了"企业仓库"）
- 中文社区活跃，国内镜像齐全

**结论**：PVE 是当下家庭实验室 / 中小企业虚拟化的最优解。

---

## 一、选型对比表（Hypervisor 横评）

| 维度 | PVE | ESXi | Hyper-V | Unraid | TrueNAS Scale |
|---|---|---|---|---|---|
| **协议/许可** | 开源 GPL | 商业（已停免费版） | 商业捆绑 Win | 商业按设备 | 开源 |
| **UI 体验** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **CLI 友好度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **VM 性能** | 接近原生 | 接近原生 | 接近原生 | 中等 | 中等 |
| **LXC 容器支持** | ✅ 一等公民 | ❌ | ❌ | ❌ | ❌（用 K8s） |
| **直通支持** | ✅ 全套 | ✅ | ⚠️ 复杂 | ✅ | ✅ |
| **备份方案** | ✅ vzdump 内建 | ⚠️ 需 vCenter | ⚠️ 需第三方 | ✅ | ✅ ZFS 快照 |
| **集群/HA** | ✅ 免费 | 收费 vCenter | 收费 SCVMM | ⚠️ 受限 | ❌ |
| **国内更新源** | ✅ 多家镜像 | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| **学习曲线** | 中等 | 低 | 中 | 低 | 中 |
| **适合场景** | 家庭/中小企业 | 大企业 | Win 重度依赖 | 媒体玩家 | NAS 优先 |

**结论**：如果你的核心诉求是「**虚拟化为主，能跑 LXC，UI 和 CLI 都够强**」，PVE 是闭眼选。

---

## 二、硬件前置准备

### 2.1 必须满足的硬件条件

| 项 | 要求 | 备注 |
|---|---|---|
| CPU | 支持 VT-x / AMD-V | 无虚拟化扩展无法跑 VM |
| CPU | 支持 VT-d / AMD-Vi | 直通磁盘/GPU 需要 |
| 内存 | 最少 8GB | 建议 32GB+，跑多 VM 至少 64GB |
| 系统盘 | SSD（推荐 NVMe） | HDD 也能跑但 IO 会很疼 |
| 网卡 | 千兆有线 | 建议双网口（管理 + 业务分离，可选） |

### 2.2 BIOS 必须开的选项

进 BIOS（开机按 Del / F2）：

```
☑ Intel Virtualization Technology (VT-x)
☑ VT-d / Intel VT for Directed I/O
☑ SR-IOV (有些主板叫 VT for Direct I/O)

# AMD 平台:
☑ SVM Mode
☑ AMD IOMMU / AMD-Vi
☑ Above 4G Decoding (PCIe 设备多用得上)

⚠️ Secure Boot: 关闭 (PVE 不需要，关掉省麻烦)
⚠️ CSM: 选 UEFI Only (现代系统都该这样)
```

**忘记开这些**，后续 VM 装系统、直通设备会全部失败。

---

## 三、安装 PVE

### 3.1 下载 ISO

去官网 [proxmox.com/downloads](https://www.proxmox.com/en/downloads) 下载最新 PVE 9.x ISO。

如果国内网慢，用清华镜像加速：

```
https://mirrors.tuna.tsinghua.edu.cn/proxmox/iso/
```

下载约 1.5 GB。

### 3.2 制作启动 U 盘

**Windows**：用 [Rufus](https://rufus.ie/)，分区方案选 GPT，目标系统选 UEFI（非 CSM）。

**macOS**：

```bash
# 找到 U 盘设备号
diskutil list

# 卸载（不弹出）
diskutil unmountDisk /dev/diskN

# 写入（替换 N 为你的 U 盘号）
sudo dd if=~/Downloads/proxmox-ve_9.x.iso of=/dev/rdiskN bs=4m status=progress
```

**Linux**：

```bash
sudo dd if=proxmox-ve_9.x.iso of=/dev/sdX bs=4M status=progress oflag=sync
```

⚠️ **`/dev/sdX` 别写错**，写错就是给硬盘灌空。`lsblk` 确认。

### 3.3 安装过程

插 U 盘开机，按主板 Boot Menu 键（F11/F12/Esc 等）选 U 盘启动。

PVE 安装界面：

1. `Install Proxmox VE` → Enter
2. License → I agree
3. **Target Harddisk** → 选 NVMe/SSD（不要选数据盘 HDD）
   - 点 `Options` 可调整高级参数
   - 默认 ext4 即可（btrfs 在 PVE 上还不算稳定）
   - `Hdsize` 可以缩小（不用占满整盘，留空间给本地存储池）
4. **Country** → China
5. **Time zone** → Asia/Shanghai
6. **Keyboard layout** → U.S. English
7. **Password** → 设强密码（root 密码）
8. **Email** → 你的邮箱（系统通知用）
9. **Management Interface** → 选有线网卡
   - **Hostname (FQDN)**：建议 `pve.local` 或 `pve.home`
   - **IP Address**：你想给 PVE 的固定 IP（比如 `192.168.X.10/24`）
   - **Gateway**：你家路由器 IP（比如 `192.168.X.1`）
   - **DNS Server**：填路由器或公共 DNS（如 `223.5.5.5` 或 `1.1.1.1`）
10. 确认 → Install
11. 等约 5 分钟 → Reboot，**拔 U 盘**

### 3.4 首次登录

浏览器访问 `https://192.168.X.10:8006`（替换成你的 IP），证书警告点高级 → 继续。

```
Username: root
Password: 你刚设的
Realm: Linux PAM standard authentication
```

进入 Web UI → 看到节点 `pve` 在线 → 安装成功。

---

## 四、初始化（重要！）

刚装完的 PVE **直接用不顺手**。必须做以下初始化。

### 4.1 关闭"无效订阅"弹窗

每次登录会弹「No valid subscription」。这不影响功能，但烦人。SSH 进 PVE：

```bash
ssh root@192.168.X.10
```

**PVE 8 / 9 通用脚本**（去掉订阅校验弹窗）：

```bash
sed -Ezi.bak "s/(Ext\.Msg\.show\(\{\s+title: gettext\('No valid sub)/void\(\{ \1/g" \
    /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js

# 重启 web 服务
systemctl restart pveproxy.service
```

刷新浏览器（强刷 Ctrl+Shift+R），弹窗消失。

> 📌 **每次 PVE 升级后，proxmoxlib.js 会被覆盖，弹窗回归**。再跑一次脚本即可。我把这条做成了 alias：`alias pve-no-sub='sed -Ezi.bak ...'`

### 4.2 切换软件源（关键）

默认 PVE 用企业仓库（`https://enterprise.proxmox.com/...`），**没订阅会 401 报错，更新失败**。

#### 步骤 1：禁用企业仓库

```bash
# 注释掉企业仓库
sed -i 's/^deb/#deb/' /etc/apt/sources.list.d/pve-enterprise.list
sed -i 's/^deb/#deb/' /etc/apt/sources.list.d/ceph.list 2>/dev/null
```

#### 步骤 2：添加 No-Subscription 仓库 + 国内镜像

```bash
# /etc/apt/sources.list 改成清华镜像（PVE 9 基于 Debian 13 Trixie）
cat > /etc/apt/sources.list <<'EOF'
deb https://mirrors.tuna.tsinghua.edu.cn/debian/ trixie main contrib non-free non-free-firmware
deb https://mirrors.tuna.tsinghua.edu.cn/debian/ trixie-updates main contrib non-free non-free-firmware
deb https://mirrors.tuna.tsinghua.edu.cn/debian-security/ trixie-security main contrib non-free non-free-firmware
EOF

# 清华 PVE 镜像
cat > /etc/apt/sources.list.d/pve-no-subscription.list <<'EOF'
deb https://mirrors.tuna.tsinghua.edu.cn/proxmox/debian/pve trixie pve-no-subscription
EOF

# 更新 apt
apt update
```

⚠️ **注意 PVE 9 → Debian 13 Trixie**。如果你装的是 PVE 8，把 `trixie` 替换成 `bookworm`。

### 4.3 安装常用工具

```bash
apt install -y \
  curl wget git vim htop iotop iftop \
  net-tools dnsutils \
  tmux zsh \
  unzip zip \
  build-essential
```

### 4.4 启用 IOMMU（直通必需）

```bash
# 编辑 GRUB
vim /etc/default/grub

# 修改这一行（Intel CPU）
GRUB_CMDLINE_LINUX_DEFAULT="quiet intel_iommu=on iommu=pt"

# AMD CPU 用
GRUB_CMDLINE_LINUX_DEFAULT="quiet amd_iommu=on iommu=pt"

# 应用
update-grub

# 加载内核模块
cat >> /etc/modules <<'EOF'
vfio
vfio_iommu_type1
vfio_pci
vfio_virqfd
EOF

# 重启
reboot
```

重启后验证：

```bash
dmesg | grep -i iommu
# 应看到: DMAR: IOMMU enabled 或 AMD-Vi: AMD IOMMUv2 driver

# 看 IOMMU 分组（直通时需要参考）
for d in /sys/kernel/iommu_groups/*/devices/*; do
    n=${d#*/iommu_groups/*}; n=${n%%/*}
    printf 'IOMMU Group %s: ' "$n"
    lspci -nns "${d##*/}"
done
```

**没看到 IOMMU 分组**：BIOS 没开 VT-d/AMD-Vi，或主板/CPU 不支持。

### 4.5 配置网络（建议加 vmbr 桥接）

PVE 默认创建 `vmbr0` 桥接，VM 走这个就能上网。**不用动**。

如果你有第二块网卡想做"管理 + 业务分离"，去 Web UI：

```
PVE Web UI → 节点 pve → System → Network → Create → Linux Bridge
  Name: vmbr1
  Bridge ports: enp2s0  (你的第二块网卡名)
  IPv4: 配独立的管理 IP（可选）
```

**家用单网卡场景**：默认 vmbr0 完全够用，跳过这步。

### 4.6 启用 PCIe 直通时的 VFIO 配置（如果你打算直通 GPU）

把要直通的设备从主机驱动里"抢出来"给 vfio：

```bash
# 先找到设备 ID（vendor:device）
lspci -nn | grep -i nvidia    # 或 amd / intel

# 假设输出: 01:00.0 ... [10de:1c03]
# 那就把这个 ID 加到 vfio 列表

echo "options vfio-pci ids=10de:1c03 disable_vga=1" > /etc/modprobe.d/vfio.conf

# 加黑名单，禁用主机的 nvidia 驱动
cat >> /etc/modprobe.d/blacklist-gpu.conf <<'EOF'
blacklist nouveau
blacklist nvidia
blacklist nvidiafb
EOF

update-initramfs -u
reboot
```

> 📌 **GPU 直通是个深坑**，本篇只覆盖最基本的步骤。NVIDIA 消费卡（GTX 系列）有时候要打 OVMF + ROM 补丁，详见后续 NAS 篇里关于 GPU 直通的章节。

---

## 五、存储池配置

PVE 默认创建：

- `local`：放 ISO、备份、模板
- `local-lvm`：放 VM 磁盘（LVM-Thin）

如果你的系统盘很大（>500GB），`local-lvm` 占了大头，**默认配置足够**。

如果你想加额外存储池（比如把 4TB HDD 给某个 VM 当数据盘），**不要在 PVE 装机时格式化**，留给后续 NAS VM 直通用。

### 5.1 查看当前存储

```bash
pvesm status
```

### 5.2 添加 NFS 远端备份目标（可选，建议有 NAS 后做）

后续 NAS 装好再回来加，目前跳过。

---

## 六、备份策略（提前规划）

虚拟化最大的好处之一是**整机一键备份**。PVE 自带 vzdump：

### 6.1 手动备份某个 VM

```bash
# 先创建一个 VM 看看（可跳过）
vzdump 100 --mode snapshot --compress zstd --storage local
```

### 6.2 定时全量备份（每周日凌晨 2 点）

Web UI 操作：

```
Datacenter → Backup → Add
  Schedule: sun 02:00
  Storage: local（或后续配的 NAS NFS）
  Mode: Snapshot
  Compression: ZSTD（速度快、压缩率好）
  Selection: All
[Create]
```

⚠️ **本地备份只防"误删除"，防不了"硬盘坏"**。后续 NAS VM 配好后，把备份目标改成 NAS NFS，实现异地备份。

---

## 七、踩坑时间线（按发生顺序）

### 坑 1：Day 1 - U 盘启动找不到 PVE

**症状**：BIOS 看到 U 盘，引导 U 盘后**黑屏卡 GRUB**。

**原因**：BIOS 用了 Legacy/CSM 模式，但 U 盘是 GPT 分区表（UEFI 启动）。

**解决**：BIOS 改成 UEFI Only。

### 坑 2：Day 2 - 装完 PVE，apt update 全报 401

**症状**：`401 Unauthorized` 在 `pve-enterprise.list`。

**原因**：默认企业仓库需要订阅。

**解决**：本文 4.2 章节的镜像源切换。

### 坑 3：Day 3 - 创建 VM 时 CPU 选项找不到 host

**症状**：创建 VM 时，CPU 类型下拉只有 `kvm64` 之类的，**没有 `host`**。

**原因**：浏览器缓存。

**解决**：强刷（Ctrl+Shift+R）或换浏览器。

### 坑 4：Day 5 - 给 VM 直通 GPU，启动后整机卡死

**症状**：VM 启动瞬间，PVE 主机网络断、SSH 断、整机失去响应。

**原因**：GPU 没加 vfio-pci 抢驱动，VM 启动时和主机的 nouveau 驱动冲突。

**解决**：本文 4.6 章节的 vfio 配置。

### 坑 5：Day 7 - 备份慢得像蜗牛

**症状**：vzdump 一个 50GB 的 VM 跑 40 分钟。

**原因**：用的 LZO 压缩，CPU 单核占满。

**解决**：改 ZSTD（多线程友好），同样 50GB 跑 8 分钟。

---

## 八、个人反思

### 反思 1：UI 不是万能的

PVE Web UI 80% 的功能都能 cover。但**剩下的 20% 必须靠 CLI**——比如批量操作、写脚本、奇葩故障排查。

很多人来自 ESXi 习惯，期待 UI 解决一切。**调整心态**：UI 是日常运维，CLI 是高级运维。**不抗拒 SSH，PVE 就好用一倍**。

### 反思 2：装机时不要一次性追求"完美架构"

我第一次装时，纠结：

- 系统盘要不要 ZFS Mirror？
- 数据盘要不要 RAID？
- 网卡要不要做 bond？
- 要不要装个 Ceph 集群？

折腾两周最后**没装出来**，挫败感拉满。

**第二次重装**：默认配置 + 单盘 + 单网卡，2 小时装完，先用着。一年后再按需升级 Mirror / 网卡聚合。

> **教训：先跑起来，再优化**。完美主义在家庭实验室是慢性毒药。

### 反思 3：备份比啥都重要

我有一次升级 PVE 大版本（7→8），**升级前没备份关键 VM**。升级中断电，整个 NAS VM 启动不了，数据库表也是损坏。最后从一个月前的旧备份恢复，**丢了一周数据**。

从那天起：

- 关键 VM 每周自动备份到 NAS
- NAS 的关键数据每月备份到云端
- 大版本升级前**手动多备份一份**

> **备份策略 3-2-1 原则**：3 份副本，2 种介质，1 份异地。

---

## 九、与其他方案的横向对比

### vs ESXi
- ESXi UI 更精致，但**许可证天花板**让它 game over
- ESXi 集群（vSphere）功能强但要钱
- PVE 集群免费

### vs Hyper-V
- 适合纯 Windows 环境
- Linux Guest 性能略弱（用 SCSI 不如 KVM virtio）
- 不能跑 LXC

### vs Unraid
- Unraid 适合「以 NAS 为主，虚拟化为辅」的家庭场景
- PVE 适合「以虚拟化为主，NAS 是其中一个 VM」
- 我的策略：**PVE 跑虚拟化，NAS 跑 fnOS（VM 内）**，各取所长

### vs TrueNAS Scale
- TrueNAS Scale 也支持 KVM，但**首选用途是 NAS**
- 跑业务 VM 不如 PVE 顺手
- 适合 NAS-first 玩家

### vs 直接 KVM + libvirt
- 全功能 + 全 CLI = 可以，但学习成本高
- 没有现成 UI = 协作难（家人/同事用不来）
- PVE 是「KVM + LXC + Web UI」的封装，开箱即用

---

## 十、下一步

PVE 装好后，下一步建议：

1. **先创建一个测试 LXC 容器**，熟悉 PVE 的容器/VM 工作流
2. 然后建第一个有用的 LXC：**全屋代理网关**（解决科学上网问题）
3. 再建 Tailscale Subnet Router（异地访问）
4. 最后建 NAS VM 和 Dev-Server VM

下一篇：**[#2 LXC：全屋代理 (Mihomo)](/posts/2026-05-09-homelab-lxc-mihomo-quan-wu-dai-li)**

---

## 附录：常用命令速查

```bash
# 节点状态
pveversion -v               # 查 PVE 版本
pvesm status                # 存储状态
pvecm status                # 集群状态（单机会报错，正常）

# VM 管理
qm list                     # 列出所有 VM
qm start <vmid>             # 启动
qm stop <vmid>              # 强制关
qm shutdown <vmid>          # 优雅关
qm destroy <vmid>           # 销毁（数据丢失）
qm config <vmid>            # 看配置

# LXC 管理
pct list
pct start <ctid>
pct enter <ctid>            # 进入容器（替代 docker exec -it）
pct destroy <ctid>

# 备份
vzdump <vmid> --mode snapshot --compress zstd --storage local
qmrestore /var/lib/vz/dump/vzdump-qemu-100-2026_01_01-02_00_01.vma.zst <new-vmid>

# 资源监控
pvesh get /nodes/pve/status   # 节点状态 JSON
top / htop                    # CPU/MEM
iotop                         # 磁盘 IO
```

---

> **本文协议**：CC BY-NC-SA 4.0，转载请保留出处
