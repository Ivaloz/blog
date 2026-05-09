---
title: '家庭实验室 #5 ｜ Dev-Server VM 篇 — Ubuntu + 面板 + 完整开发栈'
date: 2026-05-09
slug: 'homelab-dev-server-vm-kai-fa-zhan'
categories:
  - '家庭实验室'
tags:
  - 'Ubuntu'
  - '宝塔'
  - '1Panel'
  - 'JDK'
  - 'Node.js'
  - 'MySQL'
  - 'Redis'
  - 'Docker'
  - 'homelab'
description: '「家庭实验室从零到一」系列第 5 篇（完结）。用一个 PVE VM 跑 Ubuntu 24.04 LTS，搭一台真正能干活的开发服务器：运维面板（宝塔 / 1Panel）+ JDK17 + Maven + Node + pnpm + MySQL + Redis + Docker + Nginx 一应俱全。覆盖 OS 横评、面板选型、80/20 分工原则（标准件用面板、开发工具链 CLI 装）、清华源 + 阿里 Maven 镜像、Docker 国内镜像加速、UFW + fail2ban 安全加固，及 cloud-init 网络、宝塔改 sshd、Docker 镜像源、JDK 双栈冲突、MySQL 内存暴吃 5 个真实踩坑。系列完结。'
series: '家庭实验室从零到一'
seriesIndex: 5
---

# 家庭实验室 #5 ｜ Dev-Server VM 篇 — Ubuntu + 面板 + 完整开发栈

> 系列第 5 篇 ▏前置：[#0 导览](/posts/homelab-overview-jia-ting-shi-yan-shi-jia-gou) + [#1 PVE](/posts/homelab-pve-zhuang-ji-pian)。本篇用一个 PVE VM 跑 Ubuntu 24.04 LTS，搭一台**真正能干活**的开发服务器：运维面板 + JDK17 + Node + Maven + MySQL + Redis + Docker，一应俱全。

## 卷首：开发服务器到底要装什么？

每次新开一台服务器，思考"装什么"都会让人头疼：

```
- 数据库（MySQL）跑在哪？
- 缓存（Redis）独立服务还是嵌入应用？
- Java 多版本怎么管？
- 前端 Node 多版本怎么管？
- Docker 装宿主还是 Rootless？
- Web 服务靠 Nginx 还是 Caddy？
- 反向代理证书谁给签？
- 数据库要不要主从演练？
- 日志怎么集中？
- 监控？
- 备份？
```

我的策略：**80% 用面板（运维标准件），20% 用纯 CLI（开发专属）**。

- **运维标准件**（MySQL / Redis / Nginx / 证书 / 防火墙 / 用户管理）→ 用面板
- **开发专属**（JDK / Maven / Node / pnpm / Docker / 各种 SDK）→ CLI 装

这样：

- 运维标准件有 UI 后台，**不用每次 SSH**
- 开发专属可控，版本灵活，**不被面板锁死**

---

## 一、为什么独立 VM 而不是直接装在 PVE Host 上？

| 维度 | Dev-Server VM | 直接装 PVE Host |
|---|---|---|
| **隔离性** | VM 挂了 PVE 还在 | 装错东西 PVE 也挂 |
| **重建难度** | 删 VM 重建 | 重装 PVE = 全家停摆 |
| **资源限制** | CPU/内存配额隔离 | 吃光宿主资源 |
| **快照/备份** | vzdump 全 VM 一键备份 | PVE 自身没办法整机备份 |
| **多版本共存** | 不同 VM 可装不同 OS | 单一 OS 限制 |

**结论**：dev 类东西**永远独立 VM**。PVE Host 应该极简（只有 hypervisor + 必要管理工具）。

---

## 二、操作系统选型对比

| OS | 包管理 | 社区 | LTS 周期 | 我的评分 |
|---|---|---|---|---|
| **Ubuntu 24.04 LTS** ⭐ | apt | ⭐⭐⭐⭐⭐ | 5 年 + 5 年扩展 | 推荐 |
| Debian 12 | apt | ⭐⭐⭐⭐ | 3-5 年 | 稳定但软件版本老 |
| Rocky Linux 9 | dnf | ⭐⭐⭐ | 10 年 | RHEL 兼容，企业派 |
| AlmaLinux 9 | dnf | ⭐⭐⭐ | 10 年 | 同 Rocky，CentOS 替代 |
| openSUSE Leap | zypper | ⭐⭐ | 18 个月 | 小众但精致 |
| Arch Linux | pacman | ⭐⭐⭐⭐ | rolling | 太激进，不适合服务器 |

**我选 Ubuntu 24.04 LTS** 理由：

1. **生态最广**：99% 的开发工具有 .deb 包或第一方支持
2. **中文资料最多**：踩坑搜索引擎能秒解
3. **5+5 年支持**：装一次用 10 年
4. **PPA 丰富**：第三方软件源补齐主仓库不足

---

## 三、运维面板选型

| 面板 | 是否开源 | 中文 | 国内热度 | 一句话 |
|---|---|---|---|---|
| **宝塔 Linux 面板** ⭐ | 闭源（免费版可用） | 极佳 | ⭐⭐⭐⭐⭐ | 国内最普及，建议选这个 |
| 1Panel | ✅ 开源 (MIT) | 极佳 | ⭐⭐⭐⭐ | 飞致云出品，UI 现代 |
| aaPanel | 闭源（宝塔国际版） | 中文+英文 | ⭐⭐⭐ | 适合海外服务器 |
| Webmin | ✅ 开源 | 一般 | ⭐⭐ | 老牌，UI 古老 |
| CWP / VestaCP | 部分开源 | 一般 | ⭐ | 海外用得多 |

**宝塔 vs 1Panel 选择**：

- 宝塔：传统派，Web 服务、PHP、数据库、面板都覆盖。但闭源 + 数据上报争议。
- 1Panel：开源，UI 现代，更适合 Docker 时代。但生态较新，部分场景不如宝塔成熟。

**建议**：

- 如果你**只跑 Java/Node 应用 + Docker**，1Panel 更合适（更"原生 Docker"）
- 如果你**还要跑 PHP / 老牌 Web 应用**，宝塔生态更全
- **对开源洁癖严重**，1Panel

我两个都用过，本文以**通用 Linux 命令 + 面板辅助**的方式写，**避免锁定到具体面板**。

---

## 四、创建 Dev-Server VM

### 4.1 PVE Web UI 创建 VM

| 字段 | 设置 | 备注 |
|---|---|---|
| **VM ID** | 300 | 我把 dev 类放 300-309 |
| **Name** | vm-dev | |
| **OS** | Linux 6.x | |
| **ISO** | Ubuntu 24.04.x Server LTS | 桌面版没必要 |
| **System** | BIOS: SeaBIOS, QEMU Agent: ☑ | |
| **Disk** | 320 GB（local-lvm） | 给开发栈足够余量 |
| **CPU** | 22 核（Type: host） | 编译大型项目要多核 |
| **Memory** | 96 GB | 跑多 Docker 容器 |
| **Network** | vmbr0, VirtIO | |
| **Start at boot** | ☑ | |

> 📌 **CPU 类型选 host**：性能最好，能用宿主 CPU 所有指令集（AVX2、AES-NI 等）。

### 4.2 安装 Ubuntu 24.04

启动 VM，进入 Ubuntu 安装向导：

1. **Language** → English（系统层面，安装中文反而 locale 容易出问题）
2. **Keyboard** → Default
3. **Network** → 配静态 IP
   - 选你的网卡 → Edit
   - **Subnet**: `192.168.X.0/24`
   - **Address**: `192.168.X.30`
   - **Gateway**: `192.168.X.1`
   - **DNS**: `223.5.5.5,1.1.1.1`
4. **Proxy** → 留空（除非你强制要走代理）
5. **Mirror** → 替换成清华镜像 `https://mirrors.tuna.tsinghua.edu.cn/ubuntu/`
6. **Storage** → Use entire disk + LVM
7. **Profile** → 创建你的管理员账号
   - Server name: `dev`
   - User: `<your_username>`
   - Password: 强密码
8. **SSH Setup** → ☑ Install OpenSSH server
   - ☑ Import SSH identity from GitHub（如果你 GH 上有公钥）
9. **Featured Server Snaps** → 全不勾
10. 等装完，重启，**拔掉 ISO**

### 4.3 首次登录

```bash
ssh <your_username>@192.168.X.30

# 提升到 root
sudo -i

# 看系统状态
neofetch || lsb_release -a
free -h
df -h
```

---

## 五、系统初始化（第一波操作）

### 5.1 替换 apt 源（清华镜像）

```bash
# 备份
cp /etc/apt/sources.list /etc/apt/sources.list.bak

# Ubuntu 24.04 用 DEB822 格式，源在 /etc/apt/sources.list.d/ubuntu.sources
# 改成清华源
sed -i 's@//.*archive.ubuntu.com@//mirrors.tuna.tsinghua.edu.cn@g; s@//.*security.ubuntu.com@//mirrors.tuna.tsinghua.edu.cn@g' /etc/apt/sources.list.d/ubuntu.sources

apt update
apt upgrade -y
```

### 5.2 装常用工具

```bash
apt install -y \
  curl wget git vim nano htop iotop iftop \
  net-tools dnsutils \
  tmux zsh \
  unzip zip p7zip-full \
  build-essential \
  python3 python3-pip python3-venv \
  jq tree \
  software-properties-common
```

### 5.3 配置时区与时间同步

```bash
timedatectl set-timezone Asia/Shanghai

# Ubuntu 默认有 systemd-timesyncd，启用即可
timedatectl set-ntp true
timedatectl status
```

### 5.4 配置 SSH 安全

```bash
# /etc/ssh/sshd_config 关键设置
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config  # 暂保留密码登录，等你确认 SSH key 通了再关
sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config

systemctl restart sshd
```

### 5.5 给开发用户加 sudo 免密（可选）

```bash
echo "<your_username> ALL=(ALL) NOPASSWD:ALL" | tee /etc/sudoers.d/<your_username>
chmod 440 /etc/sudoers.d/<your_username>
```

⚠️ **dev 环境用方便，prod 千万别开**。

### 5.6 配置 swap

VM 不一定开了 swap：

```bash
free -h
# 如果 Swap 是 0，加 swap 文件
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## 六、装运维面板

### 6.1 装宝塔（如果选这个）

```bash
# 官方一键脚本（Ubuntu 24.04）
url=https://download.bt.cn/install/install_panel.sh
curl -sSO $url && bash install_panel.sh ed8484bec
```

装完后会输出：

```
==================================================================
                    Bt-Panel: http://192.168.X.30:8888/random_path
                    username: <random>
                    password: <random>
==================================================================
```

记下 URL、用户名、密码。**这个 URL 含安全入口（随机路径），别丢**。

进面板后：

1. 点拒绝"绑定云端账号"（看你需求）
2. **不要在弹出的"推荐套件"里全勾**，只装你要的（见下文）

### 6.2 装 1Panel（如果选这个）

```bash
curl -sSL https://resource.fit2cloud.com/1panel/package/quick_start.sh -o quick_start.sh && bash quick_start.sh
```

按向导走，记下 URL/账号密码。

---

## 七、装开发栈（CLI 方式，避免被面板锁版本）

### 7.1 JDK 17（Spring Boot / 各种 Java 应用）

```bash
# 用宝塔的 Java 项目管理也行，但建议直接装 OpenJDK 干净
apt install -y openjdk-17-jdk

# 验证
java -version
javac -version

# 设环境变量（让其他工具能找到）
cat > /etc/profile.d/java.sh <<'EOF'
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH
EOF

source /etc/profile.d/java.sh
echo $JAVA_HOME
```

### 7.2 Maven

```bash
# 装最新版（apt 仓库版本可能旧）
MAVEN_VERSION=3.9.9
cd /opt
wget https://mirrors.tuna.tsinghua.edu.cn/apache/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz
tar -xzf apache-maven-${MAVEN_VERSION}-bin.tar.gz
mv apache-maven-${MAVEN_VERSION} maven
rm apache-maven-${MAVEN_VERSION}-bin.tar.gz

cat > /etc/profile.d/maven.sh <<'EOF'
export MAVEN_HOME=/opt/maven
export PATH=$MAVEN_HOME/bin:$PATH
EOF

source /etc/profile.d/maven.sh
mvn -version
```

#### Maven 国内镜像加速

```bash
# /opt/maven/conf/settings.xml 找到 <mirrors> 段，加阿里云
mkdir -p /root/.m2
cat > /root/.m2/settings.xml <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<settings>
    <mirrors>
        <mirror>
            <id>aliyun-public</id>
            <name>Aliyun Public</name>
            <url>https://maven.aliyun.com/repository/public</url>
            <mirrorOf>*</mirrorOf>
        </mirror>
    </mirrors>
    <localRepository>/root/.m2/repository</localRepository>
</settings>
EOF
```

### 7.3 Node.js + pnpm

```bash
# 装 nvm（Node 版本管理器，可装多版本切换）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc

# 装 Node 22 LTS
nvm install 22
nvm use 22
nvm alias default 22

# 装 pnpm
npm install -g pnpm@latest

# 国内镜像
pnpm config set registry https://registry.npmmirror.com

# 验证
node --version
pnpm --version
```

### 7.4 Docker

```bash
# 卸载旧版（如果有）
apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null

# 装 docker-ce（用清华镜像源）
curl -fsSL https://mirrors.tuna.tsinghua.edu.cn/docker-ce/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.tuna.tsinghua.edu.cn/docker-ce/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 验证
docker --version
docker compose version

# 配国内镜像加速
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
    "registry-mirrors": [
        "https://docker.m.daocloud.io",
        "https://docker.imgdb.de",
        "https://docker-0.unsee.tech"
    ],
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "100m",
        "max-file": "3"
    }
}
EOF

systemctl daemon-reload
systemctl restart docker
systemctl enable docker

# 把开发用户加到 docker 组（免 sudo）
usermod -aG docker <your_username>
```

> ⚠️ **Docker 国内镜像源经常变动**。如果上面的源失效，搜"Docker 国内镜像 2026"找最新可用的。

### 7.5 MySQL（用面板装）

去面板 → 软件商店 → MySQL → 安装 8.0：

- 端口默认 3306（改成非默认更安全）
- 设置 root 密码（强密码）
- 装 phpMyAdmin（可选 Web 管理）

或 CLI：

```bash
apt install -y mysql-server
mysql_secure_installation   # 跑安装向导，设密码 + 关远程 root
```

### 7.6 Redis（用面板装）

面板 → 软件商店 → Redis → 安装 7.0+：

- 端口 6379（改非默认）
- **必须设密码**（被扫到无密码 Redis 就是肉鸡）
- 绑定 IP 改成 `0.0.0.0` 时**必须设密码**

或 CLI：

```bash
apt install -y redis-server
sed -i 's/^# requirepass .*/requirepass <YOUR_STRONG_PASSWORD>/' /etc/redis/redis.conf
systemctl restart redis-server
```

### 7.7 Nginx（用面板装）

面板 → 软件商店 → Nginx → 1.24+

或 CLI：

```bash
apt install -y nginx
systemctl enable nginx
systemctl start nginx

# 测试
curl http://localhost
# 应返回 Welcome to nginx
```

---

## 八、开发用户的 zsh + oh-my-zsh（生产力升级）

```bash
su - <your_username>

# 装 zsh
sudo apt install -y zsh

# 装 oh-my-zsh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# 装常用插件
git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions
git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting

# 编辑 ~/.zshrc
vim ~/.zshrc
# 找到 plugins=(git) 改成
# plugins=(git docker zsh-autosuggestions zsh-syntax-highlighting)

# 切换默认 shell
chsh -s $(which zsh)

# 重新登录生效
```

---

## 九、关键安全加固

### 9.1 防火墙（UFW）

```bash
# 装 ufw
apt install -y ufw

# 默认拒绝入站
ufw default deny incoming
ufw default allow outgoing

# 放行 SSH（重要！否则你自己被锁外面）
ufw allow ssh

# 放行面板端口（你的实际端口替换）
ufw allow 8888    # 宝塔面板默认
ufw allow 80
ufw allow 443

# 开发服务端口（按需）
ufw allow 8080
ufw allow 3306    # MySQL（如果允许外网，否则不开）

# 启用
ufw enable
ufw status verbose
```

### 9.2 fail2ban（防 SSH 爆破）

```bash
apt install -y fail2ban

cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 3

[sshd]
enabled = true
EOF

systemctl restart fail2ban
fail2ban-client status sshd
```

### 9.3 禁用密码 SSH 登录（确认 SSH key 已生效后）

```bash
# 先确认能用 SSH key 登录！
# 然后:
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd
```

---

## 十、踩坑时间线

### 坑 1：Ubuntu 24.04 默认 cloud-init 网络配错

**症状**：装完重启，VM 拿不到 IP（DHCP 失败 / 静态 IP 没生效）。

**原因**：Ubuntu 24.04 用 cloud-init，会盖你装机时设的 netplan 配置。

**解决**：

```bash
# 禁用 cloud-init 网络管理
echo 'network: {config: disabled}' > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg

# 自己写 netplan
cat > /etc/netplan/00-static.yaml <<'EOF'
network:
  version: 2
  renderer: networkd
  ethernets:
    ens18:           # 你的网卡名，ip a 看
      addresses:
        - 192.168.X.30/24
      routes:
        - to: default
          via: 192.168.X.1
      nameservers:
        addresses: [223.5.5.5, 1.1.1.1]
EOF

netplan apply
```

---

### 坑 2：宝塔装完，原 SSH key 莫名失效

**症状**：装完宝塔后，原本能 SSH key 免密登录，突然要密码。

**原因**：宝塔安全模块可能改了 SSH 配置。

**解决**：

```bash
# 看 sshd_config 是否被改
grep -E "^(PasswordAuthentication|PermitRootLogin|PubkeyAuthentication)" /etc/ssh/sshd_config

# 应有
# PubkeyAuthentication yes

# 没的话加上，重启 sshd
```

---

### 坑 3：Docker 装完，跑容器超慢（拉镜像超时）

**症状**：`docker pull nginx` 慢得像爬。

**原因**：Docker Hub 在国内基本不可达。

**解决**：本文 7.4 章节的 daemon.json 镜像源。如果失效，找新的可用镜像。

---

### 坑 4：JDK + 宝塔 Java 项目管理一起用，版本冲突

**症状**：宝塔的 Java 项目管理用了它自己装的 JDK，跟我自己 apt 装的 OpenJDK 17 冲突。

**原因**：两套 JDK 共存，PATH 优先级混乱。

**解决**：

- 决定用一套：要么宝塔的，要么 apt 的
- 我推荐 apt 的（标准、稳定、好升级）
- 卸载宝塔自带的 JDK

---

### 坑 5：MySQL 占用 4G 内存，开发用不了

**症状**：MySQL 8 默认配置吃 4-8GB 内存。

**原因**：默认 `innodb_buffer_pool_size` 太大。

**解决**：

```ini
# /etc/mysql/mysql.conf.d/mysqld.cnf
[mysqld]
innodb_buffer_pool_size = 1G    # 开发用 1G 够
max_connections = 100
```

```bash
systemctl restart mysql
```

---

## 十一、个人反思

### 反思 1：面板是双刃剑

我前后用过宝塔、aaPanel、1Panel、Webmin、Cockpit……

**好处**：

- 90% 运维工作有 UI，**不用记命令**
- MySQL 备份、SSL 续签、Nginx 配置 — 三两下点出来
- 团队多人用时，**不必每个人都精通 Linux**

**陷阱**：

- 面板的"自动配置"有时候很激进（改 sshd_config / iptables / 系统服务）
- 卸载面板**可能留下残骸服务**
- 升级面板偶尔会**覆盖你手动修改**的配置

**我的折衷**：

- 用面板装"标准件"（DB / 缓存 / Web 服务器 / 证书）
- **不要在面板里装语言运行时**（JDK / Node / Python）—— 这些 CLI 装才稳
- 关键配置文件**手动备份**一份，免得面板覆盖找不回

---

### 反思 2：开发服务器的"性格"——污染易，恢复难

dev 服务器跟生产不一样：

- 你会装 50+ 个工具试用
- 你会 `pip install`、`npm install -g`、`apt install` 一通
- 你会改 / etc 下的各种配置
- 你会跑各种 Docker 容器留下数据卷

**3 个月后**，你的 dev 服务器**自己也不知道安装了啥**。

**我的应对**：

- **每月做一次 PVE 整机快照**，挂掉直接回滚
- **不要把唯一的"项目数据"放在 dev 服务器本地**，放 NAS 或云
- 重要配置**放 git 仓库**（dotfiles repo）

---

### 反思 3：80/20 原则

最有效率的开发服务器配置：

- **80% 标准化**：Ubuntu LTS + 标准包管理 + 标准工具链
- **20% 个人化**：你的 dotfiles、你的 alias、你的 SDK 版本偏好

不要去定制成"我的专属环境"——**反而难维护**。**少即是多**。

---

## 十二、与其他方案的横向对比

### vs 容器化开发环境（Dev Container / Codespaces）
- VS Code Dev Container 适合**单项目**
- 我这里是**多项目共用**的服务器，VM 更合适

### vs 云开发机（GitHub Codespaces / Aliyun DevOps）
- 云开发机按时计费，长跑很贵
- 隐私 / 数据本地化考虑
- 网速：自家千兆内网 vs 云 SSH（出差时反而 Tailscale + 自家最快）

### vs 各装到自己 Mac/Win 笔记本
- 笔记本性能不够（24/7 跑 Docker 风扇飞起）
- 笔记本关机就停（晚上跑批任务受影响）
- 多人协作时，每个人重复装一遍 dev 栈成本高

### vs Kubernetes 集群
- k8s 适合**多机集群**
- 单台开发服务器 + Docker compose 是更简单的选择
- 等你扩展到 3 台以上服务器再考虑 k8s

---

## 十三、最后总结

到这里，整个家庭实验室基础设施搭完：

```
✅ PVE 9.x 装机          (#1)
✅ LXC 全屋代理          (#2)
✅ LXC Tailscale 异地     (#3)
✅ NAS VM 团队存储        (#4)
✅ Dev-Server VM 开发栈   (#5)  ← 你在这
```

**架构图回顾**：

```
家用路由器 (192.168.X.1)
   ↓
PVE Host (192.168.X.10)
  ├── LXC 全屋代理       (192.168.X.12)  ← 全屋通过它科学上网
  ├── LXC Tailscale     (192.168.X.11)  ← 异地访问家里
  ├── VM NAS            (192.168.X.20)  ← 共享文件 + 备份
  └── VM Dev-Server     (192.168.X.30)  ← 开发与服务
```

**接下来你可以**：

- 用 dev-server 跑你的项目（Java/Node/Python）
- 在 NAS 上存代码备份、文档资料
- 出差时通过 Tailscale 远程访问
- 写一篇博客分享你的家庭实验室经验

**后续系列计划**（不属于本系列，单独成系列）：

- CI/CD 篇：Jenkins + Docker 蓝绿
- 监控篇：Prometheus + Grafana
- LLM 篇：跑 Ollama / vLLM / 自托管 ChatGPT
- 数据备份篇：3-2-1 完整实践

---

## 附录：常用命令速查

```bash
# 系统
htop                       # 看 CPU/内存
iotop                      # 看磁盘 IO
df -h                      # 看磁盘占用
du -sh /*                  # 看根目录各文件夹大小
journalctl -u <service>    # 看服务日志

# 包管理
apt list --installed | grep <name>
apt show <package>
apt autoremove             # 清理无用依赖

# Docker
docker ps -a               # 所有容器
docker images              # 所有镜像
docker compose ps          # 当前目录的 compose 状态
docker system df           # docker 占用磁盘
docker system prune -af    # 清理无用资源

# Java/Maven
java -version
mvn dependency:tree        # 看依赖树

# Node
nvm list                   # 安装的 Node 版本
nvm use 22                 # 切换版本
pnpm store path            # 查 pnpm 缓存目录
pnpm store prune           # 清理无用缓存

# MySQL
mysql -u root -p
SHOW PROCESSLIST;          # 看连接
SHOW VARIABLES LIKE 'innodb_buffer_pool_size';

# Redis
redis-cli
INFO memory                # 看内存
DBSIZE                     # 看 key 数量
```

---

> **本系列完结**。如果你按这个系列搭出了自己的家庭实验室，欢迎交流。
> 
> **本文协议**：CC BY-NC-SA 4.0，转载请保留出处
