---
title: '家庭实验室 #3 ｜ LXC 跑 Tailscale Subnet Router — 异地访问家里所有服务'
date: 2026-05-09
slug: 'homelab-lxc-tailscale-yi-di-fang-wen'
categories:
  - '家庭实验室'
tags:
  - 'LXC'
  - 'Proxmox'
  - 'Tailscale'
  - 'WireGuard'
  - '异地组网'
  - 'homelab'
description: '「家庭实验室从零到一」系列第 3 篇。用一个 LXC 容器跑 Tailscale Subnet Router 模式，把整个家庭网段暴露给 Tailscale 网络，让你在公司 / 咖啡厅 / 4G 下都能直接访问家里所有服务。横评 frp / ZeroTier / WireGuard / OpenVPN / 远程桌面，覆盖 LXC keyctl + TUN 配置、ip_forward、Subnet Routes 审批、ACL、客户端启用 Use Subnets，及 keyctl / 客户端 / DERP / OOM / 路由回环 5 个真实踩坑。'
series: '家庭实验室从零到一'
seriesIndex: 3
---

# 家庭实验室 #3 ｜ LXC 跑 Tailscale Subnet Router — 异地访问家里所有服务

> 系列第 3 篇 ▏前置：[#0 导览](/posts/2026-05-09-homelab-overview-jia-ting-shi-yan-shi-jia-gou) + [#1 PVE](/posts/2026-05-09-homelab-pve-zhuang-ji-pian)。本篇用一个 LXC 容器跑 Tailscale，把整个家庭网段暴露给 Tailscale 网络，**让你在任何地方都能访问家里所有服务**。

## 卷首：那些被异地访问折磨过的方案

**场景**：我在公司想登家里的 Jenkins / NAS / 看监控，怎么办？

我前后试过：

### 方案 1：DDNS + 路由器端口转发
- 路由器设置花生壳 / 阿里云 DNS
- 把 22/80/443 转发到家里
- **问题**：宽带运营商封了大部分公网入站；端口被扫光被密码爆破；家用 IP 不稳定

### 方案 2：frp 内网穿透
- 买个云服务器跑 frps
- 家里跑 frpc
- **问题**：所有流量走云服务器；带宽贵；延迟翻倍；维护两套

### 方案 3：ZeroTier
- 体验过几个月
- **问题**：免费版有节点上限；某些区域被墙；UI 不如 Tailscale

### 方案 4：Tailscale ⭐ 最终选择
- 基于 WireGuard，性能好
- 免费 100 设备
- Tailnet 内 P2P 直连（不走中转就尽量不走）
- 国内访问没墙问题（用的是商业 STUN，DERP 服务器在境外但首次握手即可）
- **Subnet Router 模式**：暴露整个家庭网段，访问家里所有 IP 而不只是单设备

---

## 一、Tailscale 是什么？为什么是它

Tailscale 是基于 [WireGuard](https://www.wireguard.com/) 的"零配置 VPN"。它把所有连入的设备组成一个**虚拟扁平网络（Tailnet）**：

- 每个设备分配一个 100.X.X.X 的 Tailscale IP（永久、不变）
- 设备之间**直接 P2P 加密通信**（绝大多数场景）
- 实在打不通才走它的 DERP 中继服务器
- 防火墙穿透由 Tailscale 自动搞定，**用户零配置**

### Subnet Router 模式

默认 Tailscale 一个设备一个 Tailscale IP。**Subnet Router 模式**让一个设备**代理整个网段**：

```
异地手机 → Tailscale 网络 → Subnet Router (LXC) → 家里 192.168.X.0/24 任意设备
```

这样：

- **不用给家里每个设备装 Tailscale**（NAS、IoT、打印机不可能装）
- **一个 LXC 解决全家**
- 异地用 Tailscale 客户端，按家里 IP 直接访问

---

## 二、选型对比（异地组网横评）

| 方案 | 协议 | 易用性 | 性能 | 国内可用 | 免费额度 | 一句话 |
|---|---|---|---|---|---|---|
| **Tailscale** ⭐ | WireGuard | 极简 | 高 | ✅ | 100 设备 | 首选 |
| Headscale | WireGuard | 自部署 | 高 | ✅ | 不限 | Tailscale 开源版（自己搭控制服务器） |
| ZeroTier | 自研 | 简单 | 中 | ⚠️ 偶尔被墙 | 25 设备 | 老牌但活跃度下降 |
| WireGuard 直接 | WireGuard | 中等 | 极高 | ✅ | 不限 | 需要自己维护配置 + 端口转发 |
| frp | 自研 | 中等 | 中 | ✅ | 不限（自己搭） | 适合"暴露单服务"，不适合组网 |
| OpenVPN | OpenVPN | 复杂 | 中 | ✅ | 自部署不限 | 老牌，但 WireGuard 时代不必再用 |
| 远程桌面（向日葵/ToDesk） | 私有 | 极简 | 低 | ✅ | 限免费时长 | 单设备临时用 |

**我的最终选择：Tailscale**。

如果你不放心 Tailscale（控制平面在他们的服务器上），可以**自部署 Headscale**（开源、Tailscale 客户端兼容）。

---

## 三、创建 LXC 容器

跟[第 2 篇代理 LXC](/posts/2026-05-09-homelab-lxc-mihomo-quan-wu-dai-li) 的创建流程一致，差异：

| 字段 | 设置 |
|---|---|
| **CT ID** | 110 |
| **Hostname** | lxc-tailnet |
| **Disk** | 4 GB |
| **CPU** | 1 核 |
| **Memory** | 256 MB |
| **IPv4** | static `192.168.X.11/24` |
| **Features** | ☑ Nesting, ☑ keyctl |

> 📌 **keyctl 必须勾**，否则 Tailscale daemon 启动时操作 systemd journal 会失败。

### 3.1 LXC 配置 TUN（同代理篇）

```bash
# PVE Host 上
vim /etc/pve/lxc/110.conf

# 末尾加上
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net dev/net none bind,create=dir
```

启动容器后：

```bash
pct start 110
pct enter 110

# 容器内
mkdir -p /dev/net
mknod /dev/net/tun c 10 200 2>/dev/null
chmod 600 /dev/net/tun
```

### 3.2 启用内核 IP 转发

Subnet Router 必须开 IP 转发：

```bash
# 容器内
cat >> /etc/sysctl.conf <<'EOF'
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
EOF

sysctl -p
```

---

## 四、安装 Tailscale

### 4.1 一键安装脚本

```bash
# 容器内
curl -fsSL https://tailscale.com/install.sh | sh
```

如果国内拉不到，用代理（本地代理 LXC 已经搭好了）：

```bash
export http_proxy=http://192.168.X.12:7890
export https_proxy=http://192.168.X.12:7890

curl -fsSL https://tailscale.com/install.sh | sh

unset http_proxy https_proxy   # 装完取消代理
```

### 4.2 注册 Tailscale 账号

去 [tailscale.com](https://tailscale.com) 注册，**用 Google / GitHub / Microsoft 账号 SSO 登录**。

注册后进 Admin Console（[login.tailscale.com/admin](https://login.tailscale.com/admin)），看到自己的 Tailnet。

### 4.3 启动 Tailscale 并加入网络

```bash
# 容器内
tailscale up \
  --advertise-routes=192.168.X.0/24 \
  --accept-routes \
  --hostname=lxc-tailnet \
  --advertise-tags=tag:subnet-router

# 第一次会输出一个授权 URL
# 类似: https://login.tailscale.com/a/abc123def
# 用浏览器打开 → 用你的账号授权
```

参数解释：

- `--advertise-routes`：声明这台设备代理这个子网（**Subnet Router 核心**）
- `--accept-routes`：默认接收其他设备 advertise 的子网（双向）
- `--hostname`：在 Admin Console 里显示的名字
- `--advertise-tags`：可选标签，方便 ACL 管理

### 4.4 在 Admin Console 启用 Subnet Routes

```
登录 Admin Console
  → Machines → 找到 lxc-tailnet
  → 右侧 ... → Edit route settings
  → Subnet routes → 192.168.X.0/24 → ✅ 勾选启用
  → Save
```

⚠️ **不勾选这步，--advertise-routes 不生效**。Tailscale 默认审计："你声明了，但我没批准"。

### 4.5 设置 Auth Key 不过期（重要）

默认 Tailscale 设备每 180 天 reauth，到期断网。

```
Admin Console → Machines → 找到 lxc-tailnet
  → ... → Disable key expiry
  
现在这个 Subnet Router 永远在线
```

---

## 五、客户端配置

### 5.1 你手机/笔记本装 Tailscale 客户端

- **iOS / Android**：App Store 搜 Tailscale
- **macOS**：[官网下载](https://tailscale.com/download/mac) 或 `brew install tailscale`
- **Windows**：[官网下载](https://tailscale.com/download/windows)
- **Linux**：`curl -fsSL https://tailscale.com/install.sh | sh`

登录同一个账号。

### 5.2 客户端启用 "Use Subnet Routes"

**iOS**：设置 → Use Tailscale subnets → 开

**macOS**：菜单栏 Tailscale 图标 → Preferences → 勾选 Use Tailscale subnets

**Windows**：托盘 Tailscale → Settings → 勾选 Use subnets

**默认是关的！** 关掉的话只能 ping 到 Tailscale 设备，不能 ping 到家里的 192.168.X.X。

### 5.3 测试

异地（公司 / 4G 网络）下：

```bash
# Mac/Linux
ping 192.168.X.10        # 家里 PVE
ping 192.168.X.20        # 家里 NAS

# 浏览器
http://192.168.X.10:8006   # PVE Web UI
http://192.168.X.20:5666   # NAS UI
```

**通了** → Subnet Router 工作正常 ✅

---

## 六、ACL（访问控制）—— 进阶

Tailscale 默认所有用户/设备互通。如果你**和其他人共享 Tailnet**（比如让员工远程访问），建议配 ACL：

```
Admin Console → Access Controls → Edit ACLs
```

```hujson
{
  "tagOwners": {
    "tag:subnet-router": ["autogroup:admin"],
    "tag:dev":           ["autogroup:admin"]
  },
  
  "acls": [
    // 管理员（你自己）能访问所有
    {
      "action": "accept",
      "src":    ["autogroup:admin"],
      "dst":    ["*:*"]
    },
    
    // 普通员工只能访问公司内部某些服务
    {
      "action": "accept",
      "src":    ["group:employees"],
      "dst":    ["192.168.X.30:80,443,8080"]
    }
  ],
  
  "groups": {
    "group:employees": ["alice@example.com", "bob@example.com"]
  },
  
  // 可选：要求 SSO 登录每隔 N 天 reauth
  "ssh": [
    {
      "action": "check",
      "src":    ["autogroup:admin"],
      "dst":    ["autogroup:self"],
      "users":  ["root", "autogroup:nonroot"]
    }
  ]
}
```

---

## 七、自动化与运维

### 7.1 Tailscale 自启

`tailscale up` 默认就是开机自启动（systemd）：

```bash
systemctl status tailscaled
systemctl enable tailscaled
```

### 7.2 监控 Tailscale 状态

```bash
# 看连接状态
tailscale status

# 输出示例:
# 100.64.X.X    lxc-tailnet           tagged-devices linux  -
# 100.64.X.Y    iphone               you@example.com ios  active; relay "tok"
# 100.64.X.Z    macbook              you@example.com macOS direct 192.168.X.50:41641

# direct 表示 P2P 直连
# relay 表示走 DERP 中继（首次握手 / NAT 穿透失败）

# 看路由
tailscale netcheck
ip route show
```

### 7.3 排查"通不了"

```bash
# 1. lxc-tailnet 自身能上 Tailscale？
tailscale status
# 应看到自己 active

# 2. Subnet Routes 启用了？
# Admin Console → Machines → lxc-tailnet → 看绿色 "Subnets approved"

# 3. 客户端启用了 Use Subnets？
# 移动端 / 桌面端逐个检查

# 4. lxc-tailnet 自身能 ping 内网设备？
ping 192.168.X.20
# 通 → Subnet Router 内部 OK
# 不通 → LXC 网络问题，不是 Tailscale 问题

# 5. ip_forward 开了？
sysctl net.ipv4.ip_forward
# 应输出: net.ipv4.ip_forward = 1

# 6. 防火墙规则？
iptables -L -n
# 默认 LXC 容器是空规则，不应阻拦
```

---

## 八、踩坑时间线

### 坑 1：LXC 没勾 keyctl，Tailscale 启动卡住

**症状**：`tailscale up` 卡 30 秒后超时，systemctl status tailscaled 显示 `failed to start ...`。

**原因**：systemd-journald 在 LXC 里要 keyctl，没勾就不能正常工作。

**解决**：PVE Web UI → CT 110 → Options → Features → ☑ keyctl，重启容器。

---

### 坑 2：客户端连上但 ping 不通家里 IP

**症状**：手机上能看到自己加入了 Tailnet，但 ping 192.168.X.20 不通。

**原因**：客户端没启用 "Use subnets" 或 Admin Console 没批准 Subnet。

**解决**：
1. Admin Console → Machines → lxc-tailnet → Subnets → ☑ 启用
2. 客户端开 Use subnets 选项

---

### 坑 3：上海的运营商劫持，DERP 握手失败

**症状**：偶发"无法连接"，重启路由器/换网络后好。

**原因**：某些 ISP 偶尔 RST WireGuard 握手包。

**解决**：换 ISP 或挂手机 4G 应急。这是 ISP 行为，无解。Tailscale 在国内一年里大概有 1-3 天会出现这种情况。

---

### 坑 4：Subnet Router 经常掉线

**症状**：异地访问时不时连不上，过几分钟又好。

**原因**：lxc-tailnet 容器内存太小（< 128MB）OOM 被杀。

**解决**：升内存到 256MB 以上。

---

### 坑 5：内网设备数据库连不上"自己"

**症状**：lxc-tailnet 容器里跑 mysql client 连 192.168.X.20:3306 失败，但其他 VM 能连。

**原因**：lxc-tailnet 容器把 192.168.X.0/24 也加到了 Tailscale 路由表，**自己 routing 自己**形成回环。

**解决**：

```bash
# 配置 Tailscale 不影响本机出站
tailscale up \
  --advertise-routes=192.168.X.0/24 \
  --accept-routes=false \                        # ← 不接收其他人的子网
  --advertise-exit-node=false                    # ← 不做 exit node
```

---

## 九、个人反思

### 反思 1：远程访问的本质是"IP 层 + 鉴权"

很多人问：「我用 frp 穿透了 Web 服务，为啥还要 Tailscale？」

frp 暴露的是**单一服务**（HTTP / SSH 等），每加一个服务都要配。Tailscale 给你的是**完整的 IP 层网络**——

- ssh 进任何机器
- 浏览器访问任何 Web UI
- 数据库 client 连任何 DB
- 远程桌面到任何机器
- 文件传输（scp/sftp）

**一次配置，永久受益**。不再为每个新服务做端口转发。

---

### 反思 2：免费的代价是控制平面在别人手里

Tailscale 的"控制服务器"（决定谁能加入网络）在他们那。理论上他们能：

- 看到你的 Tailnet 拓扑
- 决定你是否能登录
- 极端情况下封你

**风险评估**：

- 个人用：他们没动机也没必要搞你
- 企业核心系统：建议自部署 [Headscale](https://github.com/juanfont/headscale)（兼容 Tailscale 客户端）

我目前用 Tailscale 商业版，已经付费。**核心生产环境如果上 Headscale 也不复杂**，但目前不必。

---

### 反思 3：异地组网解决的是"心理负担"而非性能

家里宽带上行带宽通常只有 30 Mbps（百兆下行 / 30M 上行）。这个上行决定了你异地访问家里服务的**最大速度**。

如果你打算异地：

- ✅ 看监控、改配置、SSH 调试 → 完全够
- ✅ 看 1080p 视频流（NAS 媒体库） → 够（10 Mbps 即可）
- ⚠️ 4K 蓝光视频 → 上行 30 Mbps 不一定够
- ❌ 大文件下载（几 GB+） → 还是直接走云盘吧

**Tailscale 解决的是"可达性"和"心理负担"**——你只要知道家里的 IP，就能用，**不用想"我要不要部署个 frp"**。

---

## 十、与其他方案的横向对比

### vs frp（内网穿透）
- frp 暴露的是**端口**，Tailscale 是**完整网络**
- frp 流量必走 frps 服务器（你买的云机器），上下行带宽收云成本
- Tailscale 优先 P2P 直连，**省云带宽**

### vs ZeroTier
- ZeroTier 国内偶尔被墙
- ZeroTier 协议是私有的，Tailscale 基于 WireGuard（标准）
- Tailscale UI 更现代

### vs OpenVPN
- OpenVPN 协议老（2003 年），性能不如 WireGuard
- 配置复杂得多
- 现代用户没必要再选 OpenVPN

### vs SSH 跳板
- SSH 跳板只能跳到 ssh，访问 Web UI 还要 `ssh -L` 端口转发
- 维护成本高（跳板机的 SSH 暴露在公网，被爆破风险）

### vs 公司 VPN
- 公司 VPN（IPSec / SSL VPN）通常是给员工远程办公用的
- 个人家庭网络用公司 VPN 违规
- 应该公私分离，公司用公司的，家用 Tailscale

---

## 十一、下一步

到这里你已经能在世界任何地方访问家里的网络了。下一步建议：

1. 建 NAS VM，把团队/家庭文件存上来
2. 然后建 Dev-Server VM
3. 最后接 CI/CD（Jenkins）

下一篇：**[#4 NAS VM：存储与团队协作](/posts/2026-05-09-homelab-nas-vm-cun-chu-tuan-dui-xie-zuo)**

---

## 附录：常用命令速查

```bash
# 容器内
tailscale status                      # 看连接
tailscale ip -4                       # 看自己的 Tailscale IP
tailscale netcheck                    # 网络诊断
tailscale up --reset                  # 重置配置
tailscale down && tailscale up        # 重连

# Admin Console 链接
https://login.tailscale.com/admin/machines

# Subnet 路由调整（改了 advertise-routes 要重新 up）
tailscale up --advertise-routes=192.168.X.0/24,192.168.Y.0/24

# 让一台 Tailscale 设备充当 exit node（你出公网都走它）
tailscale up --advertise-exit-node
# 客户端开启:
tailscale up --exit-node=<exit-node-ip>
```

---

> **本文协议**：CC BY-NC-SA 4.0，转载请保留出处
