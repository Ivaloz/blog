---
title: '家庭实验室 #2 ｜ LXC 容器跑全屋代理 (Mihomo) — 让所有 VM 一键科学上网'
date: 2026-05-09
slug: 'homelab-lxc-mihomo-quan-wu-dai-li'
categories:
  - '家庭实验室'
tags:
  - 'LXC'
  - 'Proxmox'
  - 'Mihomo'
  - 'Clash'
  - '代理'
  - 'homelab'
description: '「家庭实验室从零到一」系列第 2 篇。用一个 LXC 容器搭一个 7×24 的代理网关，所有 VM 通过 http_proxy=http://<容器 IP>:7890 科学上网。覆盖代理客户端横评（Mihomo / sing-box / Xray / naïveproxy）、为什么用 LXC 而不是 Docker、TUN 设备启用、Mihomo 安装与 systemd 服务、Web Dashboard、订阅自动更新带文件大小校验、其他 VM/Docker/apt 接入方式，及 fake-ip 解决 DNS 污染等 5 个真实踩坑。'
series: '家庭实验室从零到一'
seriesIndex: 2
---

# 家庭实验室 #2 ｜ LXC 容器跑全屋代理 (Mihomo) — 让所有 VM 一键科学上网

> 系列第 2 篇 ▏前置：[#0 导览](/posts/homelab-overview-jia-ting-shi-yan-shi-jia-gou) + [#1 PVE 装机](/posts/homelab-pve-zhuang-ji-pian)。本篇用一个 LXC 容器搭一个 7×24 的代理网关，所有 VM 通过 `http_proxy=http://<容器 IP>:7890` 就能科学上网。

## 卷首：为什么需要全屋代理？

家庭实验室必然遇到的几个场景：

- 后端 Maven 拉国外包（Apache、Spring）
- 前端 npm install 几百个 npm 包
- Docker pull 镜像（docker.io）
- AI 工具调 OpenAI / Anthropic API
- Git clone GitHub 大仓库

这些**没有稳定代理基本不能动**。

第一次我在每个 VM 里**单独装代理客户端**，结果：

- 每装一个 VM 就重复一次配置工作
- 订阅链接更新要在 N 个地方同步
- 不同 VM 用不同节点，IP 风控乱七八糟
- VM 重启代理客户端没自启
- 配错防火墙某个 VM 直连泄露 IP

**正确思路**：搞一个**集中代理服务**，所有 VM 通过环境变量指过去。维护成本降到 1 个点。

---

## 一、选型对比（代理客户端横评）

我跑过的客户端：

| 工具 | 协议支持 | UI | 资源占用 | 国内项目活跃度 | 一句话评价 |
|---|---|---|---|---|---|
| **Mihomo (clash.meta)** | 全协议 | API + Dashboard | 低 | ⭐⭐⭐⭐⭐ | 老牌 Clash 内核分支，**首选** |
| Clash Premium | 全协议 | 无 | 低 | ❌ 已停更 | RIP，别用 |
| sing-box | 全协议 | 无内建 UI | 中 | ⭐⭐⭐⭐ | 新锐，配置复杂 |
| v2ray-core | 部分 | 无内建 UI | 中 | ⭐⭐⭐ | 老牌，但配置繁 |
| Xray | 全协议 | 无内建 UI | 中 | ⭐⭐⭐⭐ | v2ray 分支，性能好 |
| naïveproxy | HTTPS only | 无 | 低 | ⭐⭐ | 抗审查强，协议单一 |

**我的选择：Mihomo** 原因：

1. **配置文件兼容 Clash** —— 大多数订阅服务直接给 clash 配置，零改造
2. **TUN 模式** —— 网络层透明代理，连 ICMP/UDP 也能走代理
3. **API 完整** —— 有 RESTful API 控制（重启、切换节点、看流量）
4. **生态成熟** —— Web Dashboard（YACD/MetaCubeX）、安卓客户端（ClashMetaForAndroid）等都基于它的 API

**唯一缺点**：Clash 协议被国内某些云服务商重点关照。如果你重度依赖某些"高敏"协议，可考虑 sing-box。

---

## 二、为什么用 LXC 容器，不用 Docker 也不用 VM？

| 方案 | 优 | 劣 |
|---|---|---|
| **LXC 容器** ⭐ | 启动秒级；资源占用 50MB；TUN 模式原生支持 | 需要 PVE 环境 |
| Docker 容器 | 跨平台；镜像生态 | TUN 模式要 `--privileged` 加 cap_add；网络 NAT 一层；持久化要挂 volume |
| 独立 VM | 完全隔离 | 启动 30 秒+；占内存 1GB+；overkill |
| 直接装 PVE Host | 极简 | **污染 hypervisor**，违反单一职责 |

**我的选择：LXC**。

资源画像：内存 50MB / CPU 闲时 0% / 启动 2 秒，跟"零成本"差不多。

---

## 三、创建 LXC 容器

### 3.1 下载 Debian 模板

PVE Web UI：

```
节点 pve → local 存储 → CT Templates → Templates
搜索: debian
下载: debian-13-standard 模板（最新稳定）
```

或 CLI：

```bash
# 列出所有可下载模板
pveam available | grep debian

# 下载 Debian 13 模板
pveam download local debian-13-standard_13.0-1_amd64.tar.zst
```

### 3.2 创建 LXC 容器

Web UI: 节点 pve → Create CT。

| 字段 | 我的设置 | 说明 |
|---|---|---|
| **Node** | pve | 默认 |
| **CT ID** | 120 | 我把代理类放 120-129 |
| **Hostname** | lxc-proxy | 一眼能看出用途 |
| **Password** | 强密码 | root 密码 |
| **SSH key** | 你的公钥（推荐） | 免密登录 |
| **Template** | debian-13-standard | 上一步下的 |
| **Disk** | 4 GB（local-lvm） | 4G 完全够 |
| **CPU** | 1 核 | 代理不吃 CPU |
| **Memory** | 256 MB | 余量足 |
| **Swap** | 0 | 容器不用 swap |
| **Network** | vmbr0 | 默认桥接 |
| **IPv4** | static `192.168.X.12/24`，gateway `192.168.X.1` | 固定 IP 重要 |
| **DNS** | 留空（继承宿主） | 或填公共 DNS |
| **Features** | ☑ Nesting | 后续装 docker 用得上 |

> 📌 **重要**：网络一定**给固定 IP**，否则 DHCP 续约 IP 变了，所有 VM 都连不上代理。

### 3.3 创建后的关键设置：允许 TUN 设备

LXC 默认**不能用 /dev/net/tun**。需要手动加配置：

```bash
# 在 PVE Host 上
vim /etc/pve/lxc/120.conf

# 末尾加上
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net dev/net none bind,create=dir
```

如果 `/dev/net/tun` 不存在，先创建：

```bash
# 在 LXC 容器内（先启动容器）
pct start 120
pct enter 120

# 容器内
mkdir -p /dev/net
mknod /dev/net/tun c 10 200
chmod 600 /dev/net/tun

exit
pct stop 120 && pct start 120
```

**验证**：

```bash
pct exec 120 -- ls -la /dev/net/tun
# 期望: crw------- 1 root root 10, 200 ... /dev/net/tun
```

---

## 四、容器内安装 Mihomo

### 4.1 进容器

```bash
pct enter 120
# 进入后是 root@lxc-proxy
```

### 4.2 安装基础工具

```bash
# 换清华源（容器是 Debian 13）
cat > /etc/apt/sources.list <<'EOF'
deb https://mirrors.tuna.tsinghua.edu.cn/debian/ trixie main contrib non-free non-free-firmware
deb https://mirrors.tuna.tsinghua.edu.cn/debian/ trixie-updates main contrib non-free non-free-firmware
deb https://mirrors.tuna.tsinghua.edu.cn/debian-security/ trixie-security main contrib non-free non-free-firmware
EOF

apt update
apt install -y curl wget unzip iproute2 vim
```

### 4.3 下载 Mihomo 二进制

去 [Mihomo Releases](https://github.com/MetaCubeX/mihomo/releases) 找最新版。

```bash
mkdir -p /opt/mihomo && cd /opt/mihomo

# 假设最新版是 v1.18.0，amd64
wget https://github.com/MetaCubeX/mihomo/releases/download/v1.18.0/mihomo-linux-amd64-v1.18.0.gz

gunzip mihomo-linux-amd64-v1.18.0.gz
mv mihomo-linux-amd64-v1.18.0 mihomo
chmod +x mihomo

# 验证
./mihomo -v
```

⚠️ **国内访问 GitHub 慢**？这是个鸡生蛋问题（**没代理装不上代理**）。两个 workaround：

1. 用 GitHub 镜像加速：把 URL 里的 `github.com` 换成 `gh-proxy.com` 或类似镜像
2. 在你能访问 GitHub 的电脑上下好，scp 进 LXC

```bash
# 镜像加速示例
wget https://gh-proxy.com/https://github.com/MetaCubeX/mihomo/releases/download/v1.18.0/mihomo-linux-amd64-v1.18.0.gz
```

### 4.4 准备配置文件

Mihomo 主配置文件 `/opt/mihomo/config.yaml`。**99% 的用户从订阅链接获取**：

```bash
# 假设你的订阅链接是 https://your-provider.com/sub/clash?token=YOUR_TOKEN
SUBSCRIPTION_URL='<YOUR_SUBSCRIPTION_URL>'

curl -fsSL "$SUBSCRIPTION_URL" -o /opt/mihomo/config.yaml
ls -la /opt/mihomo/config.yaml
```

**手动检查 / 修改 config.yaml** 几个关键字段：

```yaml
# 顶部
mixed-port: 7890         # HTTP/SOCKS 同端口（代理用这个）
external-controller: 0.0.0.0:9090   # API 监听
secret: '<RANDOM_LONG_STRING>'      # API 密码（强烈建议设）
external-ui: ./ui        # Web Dashboard 文件目录（后面 4.6 装）

# 全局
mode: rule               # rule / global / direct
log-level: info
allow-lan: true          # ⭐ 让局域网设备能用，必须开
bind-address: '*'
```

### 4.5 创建 systemd 服务

```bash
cat > /etc/systemd/system/mihomo.service <<'EOF'
[Unit]
Description=Mihomo Proxy
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/mihomo
ExecStart=/opt/mihomo/mihomo -d /opt/mihomo
Restart=on-failure
RestartSec=5
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mihomo
systemctl start mihomo

# 看日志
journalctl -u mihomo -f --no-pager
# Ctrl+C 退出
```

### 4.6 装 Web Dashboard（YACD 或 MetaCubeX）

可视化看流量、切换节点：

```bash
cd /opt/mihomo

# YACD (老牌 Dashboard)
wget https://github.com/haishanh/yacd/archive/gh-pages.zip
unzip gh-pages.zip
mv yacd-gh-pages ui
rm gh-pages.zip

# 或 MetaCubeX 官方 Dashboard (推荐)
git clone https://github.com/MetaCubeX/metacubexd.git ui
cd ui
# 装 npm + 编译，或直接拉 release 版本

# 重启 mihomo
systemctl restart mihomo
```

浏览器访问：`http://192.168.X.12:9090/ui` → 输入 secret → 完整 Dashboard。

---

## 五、订阅自动更新

订阅服务的节点会变（有些一周更新一次）。**写个 cron 自动拉**：

```bash
# 自动更新脚本
cat > /opt/mihomo/update-sub.sh <<'EOF'
#!/bin/bash
SUBSCRIPTION_URL='<YOUR_SUBSCRIPTION_URL>'
TARGET=/opt/mihomo/config.yaml
TMP=/tmp/mihomo-config-new.yaml

curl -fsSL --connect-timeout 10 "$SUBSCRIPTION_URL" -o "$TMP"

# 简单校验：文件大小 > 10KB（防止 502 写入空文件）
if [ -s "$TMP" ] && [ $(stat -c %s "$TMP") -gt 10240 ]; then
    cp "$TARGET" "${TARGET}.bak"
    mv "$TMP" "$TARGET"
    systemctl reload mihomo 2>/dev/null || systemctl restart mihomo
    echo "[$(date)] Update OK"
else
    echo "[$(date)] Update FAILED, file too small"
    rm -f "$TMP"
    exit 1
fi
EOF

chmod +x /opt/mihomo/update-sub.sh

# 加 cron：每天凌晨 4 点更新
crontab -e
# 添加：
# 0 4 * * * /opt/mihomo/update-sub.sh >> /var/log/mihomo-update.log 2>&1
```

---

## 六、其他 VM/容器接入这个代理

### 6.1 临时使用（环境变量）

```bash
# 在任何需要联网的命令前
export http_proxy=http://192.168.X.12:7890
export https_proxy=http://192.168.X.12:7890
export no_proxy=localhost,127.0.0.1,192.168.X.0/24

# 测试
curl -s https://www.google.com -o /dev/null -w "%{http_code}\n"
# 期望: 200 (代理通)
```

### 6.2 永久使用（系统级）

```bash
# /etc/profile.d/proxy.sh
cat > /etc/profile.d/proxy.sh <<'EOF'
export http_proxy=http://192.168.X.12:7890
export https_proxy=http://192.168.X.12:7890
export HTTP_PROXY=http://192.168.X.12:7890
export HTTPS_PROXY=http://192.168.X.12:7890
export no_proxy=localhost,127.0.0.1,192.168.X.0/24,10.0.0.0/8,172.16.0.0/12
export NO_PROXY="$no_proxy"
EOF

# 立即生效
source /etc/profile.d/proxy.sh
```

### 6.3 Docker daemon 走代理

```bash
mkdir -p /etc/systemd/system/docker.service.d

cat > /etc/systemd/system/docker.service.d/http-proxy.conf <<'EOF'
[Service]
Environment="HTTP_PROXY=http://192.168.X.12:7890"
Environment="HTTPS_PROXY=http://192.168.X.12:7890"
Environment="NO_PROXY=localhost,127.0.0.1,192.168.X.0/24"
EOF

systemctl daemon-reload
systemctl restart docker
```

### 6.4 apt 走代理（Debian/Ubuntu）

```bash
cat > /etc/apt/apt.conf.d/95proxy <<'EOF'
Acquire::http::Proxy "http://192.168.X.12:7890";
Acquire::https::Proxy "http://192.168.X.12:7890";
EOF
```

> ⚠️ 一般国内 apt 走清华镜像够快，**不建议给 apt 走代理**（会反而变慢）。给具体软件单独配。

---

## 七、踩坑时间线

### 坑 1：Day 1 - LXC 不能用 TUN

**症状**：mihomo 启动报 `failed to create tun device: permission denied`。

**原因**：LXC 默认禁止访问 /dev/net/tun。

**解决**：本文 3.3 章节的 lxc.conf 修改 + mknod。

---

### 坑 2：Day 2 - 局域网其他设备连不上 7890

**症状**：在 lxc-proxy 容器内 `curl localhost:7890` 通，但其他 VM `curl 192.168.X.12:7890` 拒绝。

**原因**：mihomo 配置 `bind-address: 127.0.0.1` 或 `allow-lan: false`。

**解决**：

```yaml
# config.yaml 顶部
bind-address: '*'
allow-lan: true
```

---

### 坑 3：Day 3 - 重启 LXC 后 mihomo 没起来

**症状**：`pct stop 120 && pct start 120` 后，mihomo 服务挂了。

**原因**：systemd 服务没设 `enable`。

**解决**：`systemctl enable mihomo`。

---

### 坑 4：Day 5 - 订阅自动更新挂了，半天没人发现

**症状**：订阅服务商挂了几小时，cron 拉到空文件覆盖了原 config.yaml，全屋代理瘫痪。

**解决**：本文 5 章节的"文件大小校验"。

---

### 坑 5：Day 7 - DNS 污染走代理也没用

**症状**：访问某些被污染的域名，**走代理也是 connection refused**。

**原因**：本机 DNS 解析在代理之前发生，污染的 IP 已经返回。

**解决**：mihomo 配置启用 fake-ip：

```yaml
dns:
  enable: true
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  nameserver:
    - 223.5.5.5
    - 119.29.29.29
  fallback:
    - 8.8.8.8
    - 1.1.1.1
  fallback-filter:
    geoip: true
    geoip-code: CN
```

---

## 八、个人反思

### 反思 1：代理客户端的归宿是"消失"

折腾这么多，真正用得最爽的状态是：**忘了它存在**。

每个 VM 系统级配好 http_proxy → 永久绑定 → 之后**所有命令都自动走代理**——这才是终极目标。

如果你还在每次手动 `export http_proxy=...`，说明配置没做到位。

---

### 反思 2：不要在主路由器装代理

我一开始把 mihomo 装在 OpenWrt 主路由器，全屋透明代理。**问题**：

- 路由器挂了 / 重启 / 升级，**全家人断网**（老婆不能刷视频，小孩不能玩游戏）
- 调试代理时家人投诉
- 路由器存储有限，订阅文件、Geo 数据库放不下

**改成 LXC 容器后**：

- 全屋设备**默认不走代理**
- 只有 VM 通过环境变量主动走
- 路由器纯净，老婆不再来质问

---

### 反思 3：订阅服务是单点故障

依赖订阅服务，**对方挂了你也挂**。

我的应对：

- 自建 1 个轻量级国外节点（搬瓦工 / 甲骨文免费机），做 fallback
- mihomo 配置里把自建节点放规则前面
- 订阅服务挂时，自建节点接管

**订阅 + 自建节点双活**，挂一个不影响。

---

## 九、与其他方案的横向对比

### vs OpenWrt 透明代理
- OpenWrt 上整屋代理强大但**风险大**（影响全家人）
- LXC 方案**作用域小**（只覆盖 VM），可控

### vs 每个 VM 装 sing-box
- 维护成本 N 倍
- 订阅链接同步噩梦
- 中心化代理是更优雅的方案

### vs Docker 跑 mihomo
- Docker 也行，但 LXC 在 PVE 上更"原生"
- LXC 启动更快，资源更省
- TUN 模式 LXC 配起来更简单

### vs 公司 VPN
- 公司 VPN 给员工提供，但全屋设备用就违规
- 私人代理 + 公司 VPN 共存最佳

---

## 十、下一步

代理装好后，所有 VM/容器都能科学上网了。下一步建议：

1. 装 Tailscale Subnet Router（异地访问家里）
2. 然后建 NAS VM
3. 最后建 Dev-Server VM

下一篇：**[#3 LXC: Tailscale Subnet Router](/posts/homelab-lxc-tailscale-yi-di-fang-wen)**

---

## 附录：常用命令速查

```bash
# 进入容器
pct enter 120

# 容器内 mihomo 控制
systemctl start/stop/restart/status mihomo
journalctl -u mihomo -f --no-pager

# 看代理状态
curl -s http://192.168.X.12:9090/proxies?secret=<SECRET> | jq

# 切换节点（API）
curl -X PUT http://192.168.X.12:9090/proxies/<GROUP_NAME> \
     -H "Authorization: Bearer <SECRET>" \
     -d '{"name":"<NODE_NAME>"}'

# 测试当前出口 IP
curl -x http://192.168.X.12:7890 https://api.ipify.org

# 容器外操作
pct stop 120
pct start 120
pct exec 120 -- systemctl status mihomo
```

---

> **本文协议**：CC BY-NC-SA 4.0，转载请保留出处
