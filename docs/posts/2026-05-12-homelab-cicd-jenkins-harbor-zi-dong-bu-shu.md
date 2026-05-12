---
title: '家庭实验室 #6 ｜ CI/CD 篇 — Jenkins + Harbor + 三仓库自动部署'
date: 2026-05-12
slug: 'homelab-cicd-jenkins-harbor-zi-dong-bu-shu'
categories:
  - '家庭实验室'
tags:
  - 'Jenkins'
  - 'Harbor'
  - 'Docker'
  - 'CI/CD'
  - 'FastTunnel'
  - 'Spring Boot'
  - 'Vue'
  - 'homelab'
description: '「家庭实验室从零到一」系列第 6 篇。给一套三仓库的项目（Spring Boot 后端 + 两个 Vue 前端）搭一条 Jenkins + Harbor 的 CI/CD 流水线：dev 分支 push 自动构建并部署到内网测试机（走 FastTunnel 反向 SSH），prod 分支 push 只构建镜像 + 企微通知（不部署，留给小程序/App 审核卡时间窗口），人工触发 deploy-prod Job 发布到生产。覆盖 CI 引擎选型（Jenkins / GitLab CI / Drone / Gitea Actions）、镜像仓库选型（Harbor / ACR / Nexus）、Jenkins 容器化 + Shared Library、Jenkinsfile/Dockerfile/nginx.conf、Active Choices 反应式参数、镜像 tag 策略 {env}-{version}-{hash}，以及一长串真实踩坑：宝塔反代 Harbor 的 413、pnpm-lock.yaml 被 gitignore、docker-compose v1 vs v2、docker0 不是 172.17、Redis bind + protected-mode、MySQL 来源授权、空密码导致 AUTH ""、Active Choices 沙箱与凭证读取、Gitee webhook 新建分支不自动触发、改内联 Pipeline 脚本要重新审批。'
series: '家庭实验室从零到一'
seriesIndex: 6
---

# 家庭实验室 #6 ｜ CI/CD 篇 — Jenkins + Harbor + 三仓库自动部署

> 系列第 6 篇 ▏前置：[#0 导览](/posts/2026-05-09-homelab-overview-jia-ting-shi-yan-shi-jia-gou) + [#5 Dev-Server VM](/posts/2026-05-09-homelab-dev-server-vm-kai-fa-zhan)。前 5 篇把家用实验室的基础设施搭完了；这一篇给一套**真实在跑的业务项目**接上自动部署：三个 Git 仓库（一个 Spring Boot 后端 + 两个 Vue 前端），走 Jenkins + Harbor 的流水线。本文把整个过程 + 真实踩坑都记下来，私人信息和域名都做了脱敏（用 `example.com`、`your-org` 之类占位）。

## 卷首：为什么要自建 CI/CD

业务项目以前的"发布"流程是这样的：本地 `mvn package` → 打个 jar → SSH 上去 `scp` → 在面板里点重启；前端 `pnpm build` → `scp` dist → 覆盖静态目录。**问题**：

- 手工步骤多，容易漏（漏拷一个文件、忘了改配置）
- 没有可复现的构建产物，回滚靠"再拷一遍上一版的 jar"（如果你还留着的话）
- 多人协作时 dev 环境状态全凭口头同步

考虑过的方案：

- **云原生 CI**（阿里云效 / GitHub Actions）：构建分钟数收费，私有仓库的并发额度有限；而且我有现成的服务器算力闲着
- **GitLab CI**：得先有 GitLab，太重
- **Drone / Gitea Actions**：轻量，但生态不如 Jenkins，插件少

最后选了**最经典的组合：Jenkins + Harbor**——单实例就够、插件丰富、Harbor 自带 UI 能列 tag + 漏洞扫描。

**核心目标**：

| 触发 | 我想要的行为 |
|------|------|
| 任一仓库 push `dev` 分支 | 自动构建镜像 → push 私有仓库 → SSH 内网测试机拉起 → 健康检查 → 企微通知 ✅/❌ |
| 任一仓库 push `prod` 分支 | 构建镜像 → push 私有仓库 → 企微通知「镜像就绪」（**不自动部署**——小程序/App 审核要等，发版必须卡时间窗口）|
| 人工触发 `deploy-prod` | 选服务 + 镜像 tag + 二次确认 → SSH 生产机拉起 → 健康检查 → 企微通知 |

---

## 一、整体架构

```
┌─────────── Git 仓库（自建/Gitee/GitHub 都行） ────────────┐
│  app（后端）   app-ui-admin（前端）   app-ui-stair（前端） │
│   ├─ dev 分支    ├─ dev 分支            ├─ dev 分支         │
│   └─ prod 分支   └─ prod 分支           └─ prod 分支        │
└────────────────────────┬───────────────────────────────────┘
                         │ Webhook (push)
                         ▼
┌──────── 一台云服务器（生产 ECS，公网） ──────────────────────┐
│  ┌──────────────────────────────┐                            │
│  │ Jenkins  (容器, 限 4C/8G)    │  jenkins.example.com       │
│  │  ├─ build-app                │                            │
│  │  ├─ build-app-ui-admin       │                            │
│  │  ├─ build-app-ui-stair       │                            │
│  │  └─ deploy-prod              │                            │
│  └────────┬─────────────────────┘                            │
│           │ docker push localhost                             │
│           ▼                                                    │
│  ┌──────────────────────────────┐                            │
│  │ Harbor  (容器, 限 2C/4G)     │  harbor.example.com        │
│  │  app:{dev,prod}-{ver}-{hash} │                            │
│  └────────┬─────────────────────┘                            │
│           │ docker pull (同机 localhost)                      │
│           ▼                                                    │
│  ┌──────────────────────────────────────────────┐           │
│  │ 生产 docker 栈（与线上旧服务并行跑）           │           │
│  │  app          : 127.0.0.1:48082 → 48080       │           │
│  │  app-ui-admin : 127.0.0.1:8081  → 80          │           │
│  │  app-ui-stair : 127.0.0.1:8082  → 80          │           │
│  └──────────────────────────────────────────────┘           │
│           ▲                                                    │
│  ┌────────┴─────────┐  线上旧服务（暂不动）：                  │
│  │ 旧 java-jar:48080│  面板域名反代仍指向它，docker 栈先并行   │
│  └──────────────────┘  观察，确认稳了再切                      │
│           ▲                                                    │
│           │ SSH (cicd@host.docker.internal)                   │
│           │ Jenkins → 宿主机 docker-compose                    │
└───────────┼────────────────────────────────────────────────────┘
            │ docker pull（公网 → 面板 nginx → Harbor）
            ▼
┌────── 内网测试机（Ubuntu） ──────────────────────────────────┐
│  ┌──────────────────────────────┐  ▲                        │
│  │ FastTunnel client (systemd)  │  │ SSH (12022)            │
│  │  反向暴露 22 → ft.example.com │  │ Jenkins ↘              │
│  └──────────────────────────────┘  │                        │
│  ┌──────────────────────────────┐                            │
│  │ 测试 docker 栈（同上 3 个）  │  48080 / 8081 / 8082      │
│  └──────────────────────────────┘                            │
└──────────────────────────────────────────────────────────────┘
```

> 这里的「生产 ECS」就是公司业务真正跑着的那台机器，不是家里那台 PVE。家里那台 PVE（[#0 导览](/posts/2026-05-09-homelab-overview-jia-ting-shi-yan-shi-jia-gou)）此处充当**内网测试机**——开发栈装在它的 Dev-Server VM（[#5](/posts/2026-05-09-homelab-dev-server-vm-kai-fa-zhan)）里，靠 FastTunnel 把 SSH 反向暴露给公网，Jenkins 才够得着它。

关键决策：

| 决策项 | 选择 | 理由 |
|-------|-----|------|
| CI 引擎 | Jenkins | 经典稳定、插件丰富，单实例即可 |
| Jenkins 部署位置 | 与生产应用同一台 ECS | 资源充裕、无额外成本、Webhook 直连、生产机同机部署不用走公网 |
| 镜像仓库 | 自建 Harbor | 商业云仓库收费；Harbor 自带 UI 列 tag、漏洞扫描，与 Jenkins 同机 |
| 前端部署形态 | 打 nginx 静态镜像 | 与后端统一走 docker；回滚切 image tag 即可 |
| 内网测试机接入 | FastTunnel 反向暴露 SSH | Jenkins 走 SSH Plugin 统一接入两套环境 |
| 生产手动发布 | 独立 deploy-prod Job + 参数化构建 | 选服务 + tag，能一键回滚 |
| 镜像 tag | `{env}-{version}-{hash}` + `{env}-latest` | 唯一性（hash）+ 语义（version + env），自动部署用 latest |
| 容器编排 | docker-compose | 多服务编排清晰、面板 Docker UI 可视化备援 |
| 基础设施（MySQL/Redis 等）| 不容器化，继续用宿主机已有实例 | 自动部署不动数据，风险最低 |
| 通知 | 企微机器人 webhook | 实时、免费、手机即收 |

> 蓝绿 / 金丝雀 / 灰度都没做（YAGNI；单实例直接替换够用，`docker-compose up -d` 是 recreate，配合 healthcheck + `restart: always` 只有几秒抖动）。要零停机那是另一个话题，本文范围外。

---

## 二、为什么 Jenkins + Harbor 同机部署在生产 ECS 上

| 维度 | 同机（Jenkins+Harbor+应用同 ECS）| 单独一台 CI 机 | 云原生 CI |
|---|---|---|---|
| 成本 | 0（复用现有 ECS）| 多一台机器 | 按构建分钟数/并发收费 |
| Webhook 可达 | 直连（ECS 有公网）| 要么有公网要么走隧道 | 平台托管 |
| 生产机部署路径 | 同机 `host.docker.internal` 回环，不走公网 | 要走公网 SSH | 平台 → 你的机器要打通 |
| 资源隔离 | **要做**（CI 构建会拉高 CPU/IO）| 天然隔离 | 平台隔离 |
| 风险 | ECS 宕机 = CI + 应用一起停 | CI 挂不影响应用 | 平台挂不影响应用 |

我这台 ECS 资源充裕（8C/32G），所以选了同机，但**必须做资源隔离**：

```yaml
# Jenkins compose 片段——最容易抢资源的一个
services:
  jenkins:
    image: jenkins/jenkins:lts-jdk21
    deploy:
      resources:
        limits:
          cpus: '4'      # 8C 中只给 4C，剩下给应用
          memory: 8G
        reservations:
          memory: 2G
    extra_hosts:
      - "host.docker.internal:host-gateway"   # deploy-prod 要用
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock   # docker.build / docker.push 要用
      - ./home:/var/jenkins_home
```

Jenkins 全局 `# of executors = 2`（只允许同时跑 2 个构建），每个 Multibranch Pipeline `disableConcurrentBuilds()`（同仓库新 push 杀掉旧 build）。应用容器**不**加 limits，让它正常用资源；Jenkins/Harbor 上限确保即使 CI 跑满也不会饿死生产应用。

---

## 三、CI 引擎选型对比

| 引擎 | 类型 | UI | 插件生态 | 上手难度 | 一句话 |
|---|---|---|---|---|---|
| **Jenkins** ⭐ | 独立 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 中等 | 老牌、单实例够用、Pipeline 灵活；首选 |
| GitLab CI | 内置于 GitLab | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 中等 | 要先有 GitLab，整套太重 |
| Drone CI | 独立（容器原生）| ⭐⭐⭐ | ⭐⭐ | 低 | 轻量、`.drone.yml` 简单，但生态小 |
| Gitea Actions | 内置于 Gitea | ⭐⭐⭐ | 复用 GH Actions | 低 | 兼容 GitHub Actions 语法，新但发展快 |
| GitHub Actions (self-hosted runner) | 平台 + 自托管 runner | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 低 | 仓库在 GitHub 才顺；Gitee/自建仓库不适用 |
| Argo CD / Flux（GitOps）| K8s 原生 | ⭐⭐⭐⭐ | — | 高 | 要有 K8s，小规模 overkill |

选 Jenkins 的现实理由：仓库在 Gitee（不是 GitHub），单台机器就能跑，Pipeline 脚本（`Jenkinsfile`）放仓库里走 Multibranch 自动识别分支，Shared Library 共享通知函数——这些 Jenkins 都成熟。

---

## 四、镜像仓库选型对比

| 仓库 | 开源 | UI | 漏洞扫描 | 多租户/权限 | 一句话 |
|---|---|---|---|---|---|
| **Harbor** ⭐ | ✅ (Apache) | ⭐⭐⭐⭐⭐ | ✅ Trivy | ✅ | CNCF 毕业项目，功能全；首选自建 |
| 阿里云 ACR / 腾讯云 TCR | 商业 | ⭐⭐⭐⭐ | ✅ | ✅ | 企业版收费，个人版有限制；省事但绑云 |
| Docker Registry (官方 registry:2) | ✅ | ❌ 无 UI | ❌ | ⭐ | 最轻，但啥都得自己加 |
| Nexus / Artifactory | 部分开源 | ⭐⭐⭐ | ⭐⭐ | ✅ | 一站式制品库（Maven/npm/docker 都管），重 |
| Gitea Container Registry | ✅ | ⭐⭐ | ❌ | ⭐⭐ | 如果你已经用 Gitea，顺手 |

Harbor 的杀手锏：**Web UI 能直接列每个仓库的 tag 列表**（回滚选 tag 的时候肉眼可见）+ retention policy（自动清旧 tag）+ 漏洞扫描。和 Jenkins 同机部署，`docker push localhost` 不走公网。

> ⚠️ Harbor 自带一个内部 nginx，如果你前面再套一层反代（我用面板的 nginx），反代那层必须配 `client_max_body_size 0;`，否则推大镜像会 `413 Request Entity Too Large`（详见踩坑 #1）。

---

## 五、整体流程：三种触发

```
① push dev 分支:
   Jenkins 多分支扫描 → 检出 → 构建 jar/dist → docker build → push Harbor
   → SSH 测试机: sed .env 改 tag → docker compose pull → docker compose up -d
   → 健康检查（curl localhost actuator/health 或 / 期望 200，重试 N 次）
   → 企微 ✅ 部署成功 / ❌ 失败（带失败日志链接）

② push prod 分支:
   同上前半段（构建 + push Harbor），但部署 stage `when { branch 'dev' }` 不匹配 → 跳过
   → 企微 🟡 「镜像就绪，到 Jenkins deploy-prod 手动发布」

③ Jenkins deploy-prod Job（Build with Parameters）:
   选 SERVICE（下拉）+ IMAGE_TAG（下拉，调 Harbor API 列最近 prod-* tag）+ CONFIRM（必勾）
   → 校验 CONFIRM → SSH 生产机: sed .env 改 tag → docker-compose pull/up
   → 健康检查 → 企微 ✅
```

---

## 六、各组件安装与配置

> 下面命令里的占位：`example.com` = 你的域名；`your-org` = Git 组织名；`<...>` = 自己填的密码/token；端口号（48080/48081/48082/8081/8082/8083/8084）按你的情况调。

### 6.1 ECS 装 Jenkins（容器）

```bash
mkdir -p /www/dk_project/dk_app/jenkins/{home,init.d}
chown -R 1000:1000 /www/dk_project/dk_app/jenkins   # 容器内 jenkins 用户 UID=1000
```

`docker-compose.yml`（关键片段见第二节），`docker compose up -d`，首次进容器拿初始密码：

```bash
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

浏览器开 `http://ECS:8083` → 装推荐插件 + 额外装：**Gitee Plugin、Docker Pipeline、SSH Agent、Active Choices(uno-choice)**。Manage Jenkins → Tools 里配 Maven 安装（命名 `maven-3.9`）+ JDK 安装（命名 `jdk21`）——后端 Jenkinsfile 的 `tools{}` 会引用这俩名字。

面板加反代站点 `jenkins.example.com → http://127.0.0.1:8083`，自动申请证书。

### 6.2 ECS 装 Harbor

下 Harbor 离线安装包 → 改 `harbor.yml`：`hostname: harbor.example.com`，`http.port: 8084`（内部端口，让面板反代），关掉 https（外层反代管证书），`harbor_admin_password: <强密码>`（**别用默认 `Harbor12345`**）。`./install.sh`。

面板加反代站点 `harbor.example.com → http://127.0.0.1:8084`，并且在站点配置文件里加：

```nginx
client_max_body_size 0;                          # ⚠️ 必须！否则推大镜像 413
proxy_set_header Host $host;
proxy_set_header Authorization $http_authorization;
proxy_pass_request_headers on;
```

Harbor UI 里：建 private 项目 `app`；建 robot account（push 用，给 Jenkins 的 `docker login`）；retention policy：`dev-*` 留 5、`prod-*` 留 10、永久留 `*-latest`，其余 14 天清，周日凌晨 GC。

测一下：本地随便 `docker pull hello-world && docker tag hello-world harbor.example.com/app/hello:test && docker login harbor.example.com && docker push harbor.example.com/app/hello:test` 能成功。

### 6.3 Jenkins 凭证 + Shared Library

凭证清单（Manage Jenkins → Credentials）：

| ID | 类型 | 用途 |
|----|------|------|
| `git-token` | Username + Password | 拉 3 个仓库（Gitee 用 user=`oauth2`/pass=私人令牌，权限只勾仓库读）|
| `harbor-credentials` | Username + Password | `docker login` Harbor（robot account）|
| `fasttunnel-test-ssh` | SSH Username with Private Key | Jenkins → 测试机（FastTunnel 12022, 用户 `deploy`）|
| `prod-host-ssh` | SSH Username with Private Key | Jenkins → 宿主机回环（`cicd@host.docker.internal:22`）|
| `wechat-bot-webhook` | Secret Text | 企微机器人 URL（`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=<YOUR_WECHAT_BOT_KEY>`）|
| `harbor-api-token` | Secret Text | deploy-prod 的 IMAGE_TAG 下拉调 Harbor REST API 用，值 = `base64("用户名:密码")` |

Jenkins SSH key 对：在 Jenkins 容器里 `ssh-keygen -t ed25519 -f /var/jenkins_home/.ssh/id_ed25519`，私钥录进上面 `fasttunnel-test-ssh` 和 `prod-host-ssh` 两个凭证，公钥稍后放到目标机的 `authorized_keys`。

Shared Library：建一个仓库 `app-jenkins-shared-library`，`vars/sendWeChatNotify.groovy`（构建/部署成功失败通知）+ `vars/sendProdReadyNotify.groovy`（prod 镜像就绪通知）。Manage Jenkins → System → Global Pipeline Libraries 注册名 `app-shared`，默认版本 `master`，Jenkinsfile 顶部 `@Library('app-shared') _` 引用。通知函数骨架：

```groovy
// vars/sendWeChatNotify.groovy
def call(String jobName, String buildNum, String status, String hash, String envPrefix) {
  withCredentials([string(credentialsId: 'wechat-bot-webhook', variable: 'WX_URL')]) {
    def emoji = status == 'success' ? '✅' : '❌'
    // 若 Jenkinsfile 在 environment{} 里设了 APP_VERSION，就用 {env}-{version}-{hash}，否则回落 {env}-{hash}
    def imageTag = env.APP_VERSION ? "${envPrefix}-${env.APP_VERSION}-${hash}" : "${envPrefix}-${hash}"
    def imageLine = (env.HARBOR_HOST && env.HARBOR_PROJ && env.IMAGE_NAME) ?
      "\n> 镜像: \\`${env.HARBOR_HOST}/${env.HARBOR_PROJ}/${env.IMAGE_NAME}:${imageTag}\\`" : ''
    def payload = [msgtype:'markdown', markdown:[content:"""${emoji} **${jobName}** ${envPrefix} #${buildNum} ${status=='success'?'部署成功':'失败'}
> 分支: ${env.BRANCH_NAME ?: '-'} | commit: \\`${hash}\\`${imageLine}
> [日志](${env.JENKINS_URL}job/${jobName}/${buildNum}/)"""]]
    httpRequest httpMode:'POST', url:WX_URL, contentType:'APPLICATION_JSON',
                requestBody: groovy.json.JsonOutput.toJson(payload), validResponseCodes:'200'
  }
}
```

> 注意参数名用 `envPrefix` 而非 `env` —— 否则会遮蔽 Jenkins pipeline 内置的 `env` 全局对象，`env.JENKINS_URL` 取不到。

### 6.4 仓库内的 Jenkinsfile + Dockerfile + nginx.conf

每个仓库根目录加 `Jenkinsfile`；前端两个仓库另加 `Dockerfile` + `docker/nginx.conf`（后端如果已有 Dockerfile 就复用）。

**后端 `app/Jenkinsfile`**：

```groovy
@Library('app-shared') _
pipeline {
  agent any
  environment {
    HARBOR_HOST = 'harbor.example.com'
    HARBOR_PROJ = 'app'
    IMAGE_NAME  = 'app-server'
    DEPLOY_DIR  = '/www/dk_project/dk_app/app'
    GIT_HASH    = sh(returnStdout:true, script:'git rev-parse --short HEAD').trim()
    APP_VERSION = sh(returnStdout:true, script:"sed -n 's:.*<revision>\\(.*\\)</revision>.*:\\1:p' pom.xml | head -1").trim()
    ENV_PREFIX  = "${env.BRANCH_NAME == 'prod' ? 'prod' : 'dev'}"
    FT_HOST = 'ft.example.com'; FT_PORT = '12022'; FT_USER = 'deploy'
  }
  options { timeout(time:30, unit:'MINUTES'); buildDiscarder(logRotator(numToKeepStr:'30')); disableConcurrentBuilds() }
  tools { maven 'maven-3.9'; jdk 'jdk21' }
  stages {
    stage('1. 检出代码') { steps { checkout scm } }
    stage('2. 构建 jar') { when { anyOf { branch 'dev'; branch 'prod' } } steps { sh 'mvn clean package -DskipTests -pl app-server -am' } }
    stage('3. 构建并推送镜像') {
      steps { script {
        docker.withRegistry("https://${HARBOR_HOST}", 'harbor-credentials') {
          def img = docker.build("${HARBOR_HOST}/${HARBOR_PROJ}/${IMAGE_NAME}:${ENV_PREFIX}-${APP_VERSION}-${GIT_HASH}", "-f app-server/Dockerfile app-server")
          img.push(); img.push("${ENV_PREFIX}-latest")
        }
      }}
    }
    stage('4. 部署到测试机') { when { branch 'dev' } steps { sshagent(['fasttunnel-test-ssh']) { sh """
      ssh -o StrictHostKeyChecking=no -p \${FT_PORT} \${FT_USER}@\${FT_HOST} '
        cd ${DEPLOY_DIR} &&
        sed -i "s|^APP_SERVER_TAG=.*|APP_SERVER_TAG=${ENV_PREFIX}-${APP_VERSION}-${GIT_HASH}|" .env &&
        docker compose pull app-server && docker compose up -d app-server'
    """ }}}
    stage('5. 健康检查（仅 dev）') { when { branch 'dev' } steps { sshagent(['fasttunnel-test-ssh']) { sh """
      ssh -o StrictHostKeyChecking=no -p \${FT_PORT} \${FT_USER}@\${FT_HOST} '
        for i in \$(seq 1 30); do curl -fs http://127.0.0.1:48080/actuator/health | grep -q UP && echo OK && exit 0; sleep 5; done; echo TIMEOUT; exit 1'
    """ }}}
  }
  post {
    success { script { if (env.BRANCH_NAME == 'prod') sendProdReadyNotify(env.JOB_NAME, env.BUILD_NUMBER, GIT_HASH, IMAGE_NAME)
                       else sendWeChatNotify(env.JOB_NAME, env.BUILD_NUMBER, 'success', GIT_HASH, ENV_PREFIX) } }
    failure { sendWeChatNotify(env.JOB_NAME, env.BUILD_NUMBER, 'failure', GIT_HASH, ENV_PREFIX) }
    cleanup { cleanWs() }
  }
}
```

**前端 `app-ui-admin/Jenkinsfile`** 差异：没有 `tools{}`（pnpm 在 Docker build 里跑），`APP_VERSION` 从 `package.json` 读：`sh "grep -m1 '\"version\"' package.json | sed -E 's/.*\"version\"[^\"]*\"([^\"]+)\".*/\\1/'"`；stage 2 改成「构建并推送镜像」一步——`docker build --build-arg BUILD_MODE=${env.BRANCH_NAME=='prod'?'prod':'test'} -f Dockerfile .`；健康检查 `curl http://127.0.0.1:8081/` 期望 200。

**前端 `Dockerfile`**（多阶段）：

```dockerfile
FROM node:20-alpine AS builder
ARG BUILD_MODE=prod
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile          # ⚠️ pnpm-lock.yaml 必须入库！见踩坑 #2
COPY . .
RUN pnpm build:${BUILD_MODE}
FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist-${BUILD_MODE} /usr/share/nginx/html   # vite outDir 按 mode 区分；若不区分就写 /app/dist
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost/ || exit 1
```

> 别忘了配 `.dockerignore`（`.git`、`node_modules`、`dist*` 等），否则 `COPY . .` 会把 `.git` 灌进构建上下文。

`docker/nginx.conf`：SPA fallback `try_files $uri $uri/ /index.html;` + 可选的 `/api/` 反代到 `app-server:48080`（如果前端用相对路径调 API 的话；如果前端配的是绝对域名就不需要这个 location）。

### 6.5 deploy-prod Job（参数化 + Active Choices）

New Item → Pipeline → 勾 `This project is parameterized`，加 3 个参数：

- **SERVICE**（Choice）：`app-server` / `app-ui-admin` / `app-ui-stair`
- **IMAGE_TAG**（Active Choices Reactive Parameter，依赖 SERVICE）：Groovy 脚本调 Harbor REST API 列最近的 `prod-*` tag。⚠️ 两个大坑：① `Use Groovy Sandbox` 必须**取消勾选**（不然 `new URL().openConnection()` 被沙箱拦），取消后去 Manage Jenkins → In-process Script Approval **Approve** 一次；② 不能用 `System.getenv()` 读「Global properties → Environment variables」（那个不进 JVM 环境），要从 Credential 读：

```groovy
import groovy.json.JsonSlurper
import com.cloudbees.plugins.credentials.CredentialsProvider
import org.jenkinsci.plugins.plaincredentials.StringCredentials
import hudson.security.ACL
try {
  def c = CredentialsProvider.lookupCredentials(StringCredentials.class, jenkins.model.Jenkins.get(), ACL.SYSTEM, new ArrayList()).find { it.id == 'harbor-api-token' }
  if (!c) return ['[error: credential not found]']
  def token = c.getSecret().getPlainText()   // base64("用户名:密码")
  def conn = new URL("https://harbor.example.com/api/v2.0/projects/app/repositories/${SERVICE}/artifacts?with_tag=true&page_size=50&sort=-push_time").openConnection()
  conn.setRequestProperty('Authorization', "Basic ${token}")     // ⚠️ Harbor v2 API 用 Basic，不是 Bearer
  conn.setRequestProperty('Accept', 'application/json')
  if (conn.responseCode != 200) return ["[HTTP ${conn.responseCode}] ${conn.errorStream?.getText('UTF-8')?.take(160)}"]
  def names = []
  new JsonSlurper().parse(conn.inputStream).each { a -> (a.tags ?: []).each { t -> names << (t instanceof Map ? t.name : t?.toString()) } }
  return ['prod-latest'] + names.findAll { it && it.startsWith('prod-') && it != 'prod-latest' }.unique()
} catch (e) { return ["[error: ${e.getClass().simpleName}: ${e.message}]"] }
```

- **CONFIRM**（Boolean，默认不勾）：「我确认已通过审核，可以发布到生产环境」

Pipeline → Definition: `Pipeline script`，内联粘贴：

```groovy
@Library('app-shared') _
pipeline {
  agent any
  environment { HARBOR_HOST='harbor.example.com'; DEPLOY_DIR='/www/dk_project/dk_app/app'; PROD_HOST='host.docker.internal'; PROD_USER='cicd' }
  options { timeout(time:20, unit:'MINUTES'); disableConcurrentBuilds() }
  stages {
    stage('1. 校验确认') { steps { script {
      if (params.CONFIRM != true) error('未勾选 CONFIRM，发布取消')
      if (params.IMAGE_TAG == null || params.IMAGE_TAG.toString().startsWith('[error')) error("无法获取 tag 列表: ${params.IMAGE_TAG}")
    }}}
    stage('2. SSH 生产机更新 .env 并拉起') { steps { sshagent(['prod-host-ssh']) { script {
      def envKey = ['app-server':'APP_SERVER_TAG','app-ui-admin':'APP_UI_ADMIN_TAG','app-ui-stair':'APP_UI_STAIR_TAG'][params.SERVICE]
      sh """ssh -o StrictHostKeyChecking=no \${PROD_USER}@\${PROD_HOST} '
        cd ${DEPLOY_DIR} && sed -i "s|^${envKey}=.*|${envKey}=${params.IMAGE_TAG}|" .env && grep "^${envKey}=" .env &&
        docker-compose pull ${params.SERVICE} && docker-compose up -d ${params.SERVICE}'"""   # ⚠️ 这台机器是 docker-compose v1
    }}}}
    stage('3. 健康检查') { steps { sshagent(['prod-host-ssh']) { script {
      def hc = ['app-server':"for i in \$(seq 1 30); do curl -fs http://127.0.0.1:48082/actuator/health | grep -q UP && exit 0; sleep 5; done; exit 1",   // ⚠️ 生产容器映射 48082
                'app-ui-admin':"for i in \$(seq 1 6); do [ \"\$(curl -fs -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/)\" = \"200\" ] && exit 0; sleep 5; done; exit 1",
                'app-ui-stair':"for i in \$(seq 1 6); do [ \"\$(curl -fs -o /dev/null -w '%{http_code}' http://127.0.0.1:8082/)\" = \"200\" ] && exit 0; sleep 5; done; exit 1"][params.SERVICE]
      sh "ssh -o StrictHostKeyChecking=no \${PROD_USER}@\${PROD_HOST} '${hc}'"
    }}}}
  }
  post {
    success { sendWeChatNotify("deploy-prod[${params.SERVICE}]", env.BUILD_NUMBER, 'success', params.IMAGE_TAG.toString(), 'prod') }
    failure { sendWeChatNotify("deploy-prod[${params.SERVICE}]", env.BUILD_NUMBER, 'failure', params.IMAGE_TAG.toString(), 'prod') }
  }
}
```

> ⚠️ 改了内联 Pipeline script 之后，也要去 In-process Script Approval 重新 Approve（或以完整管理员身份重新 Save Job）。

### 6.6 目标机配置（测试机 + 生产 ECS）

两台机器目录结构一致：`/www/dk_project/dk_app/app/` 下放 `docker-compose.yml`（手工维护，git 不动）、`.env`（镜像 tag + 环境标识，Jenkins 部署时改）、`.env.app`（业务环境变量 DB/Redis/MQ，人工维护，权限 600）。

`docker-compose.yml` 关键点：容器只听 `127.0.0.1`（`ports: ["127.0.0.1:48082:48080"]`，不暴露公网，HTTPS 由面板反代接管）；`env_file: [.env.app]`；`environment: [SPRING_PROFILES_ACTIVE=${SPRING_PROFILE}]`；healthcheck。

`.env`：

```bash
SPRING_PROFILE=dev               # 测试机=dev，生产机=prod
APP_SERVER_TAG=dev-latest
APP_UI_ADMIN_TAG=dev-latest
APP_UI_STAIR_TAG=dev-latest
```

`.env.app`（指向宿主机的 MySQL/Redis）：⚠️ host 用 **docker0 网关 IP**，但**不一定是 `172.17.0.1`**——`ip -4 addr show docker0` 看你实际的（我这台是 `172.18.0.1`）：

```bash
SPRING_DATASOURCE_DYNAMIC_DATASOURCE_MASTER_URL=jdbc:mysql://172.18.0.1:3306/app?...
SPRING_DATASOURCE_DYNAMIC_DATASOURCE_MASTER_USERNAME=app_user
SPRING_DATASOURCE_DYNAMIC_DATASOURCE_MASTER_PASSWORD=<...>
SPRING_DATA_REDIS_HOST=172.18.0.1
SPRING_DATA_REDIS_PORT=6379
# Redis 没密码就别写 SPRING_DATA_REDIS_PASSWORD 这行！留空 `=` 会让客户端发 AUTH "" 报错（见踩坑 #8）
```

宿主机 MySQL/Redis 要让 docker 网段连得上（见踩坑 #5/#7）；建 `cicd`（生产机）/ `deploy`（测试机）用户：加 `docker` 组、sudo 免密、`~/.ssh/authorized_keys` 放 Jenkins 公钥；`docker login harbor.example.com`。

测试机额外：装 FastTunnel client（systemd 托管，开机自启、断线自动重连），把本地 22 反向暴露到 `ft.example.com:12022`。

> 这台测试机就是 [#5 Dev-Server VM](/posts/2026-05-09-homelab-dev-server-vm-kai-fa-zhan) 那台——JDK/Maven/Node/MySQL/Redis/Docker 全在它身上，正好直接当测试环境用；FastTunnel 解决"内网机器没公网 IP，Jenkins 怎么 SSH 进去"的问题（也可以用 frp / Tailscale SSH，见 [#3](/posts/2026-05-09-homelab-lxc-tailscale-yi-di-fang-wen)，我这里选 FastTunnel 是因为它够轻、只暴露一个端口）。

宿主机面板加反代站点（生产机）：`api.example.com → 127.0.0.1:48082`（**切到 docker 时才改 upstream，平时仍指向旧服务的 48080**）、`dashboard.example.com → 127.0.0.1:8081`、`stair.example.com → 127.0.0.1:8082`、`jenkins.example.com → 127.0.0.1:8083`、`harbor.example.com → 127.0.0.1:8084`。

### 6.7 Git Webhook

每个仓库 → 管理 → WebHooks → 添加：URL `https://jenkins.example.com/gitee-project/<job-name>`（Gitee Plugin 的端点），事件勾「推送代码」（Push）。Jenkins 必须装 Gitee Plugin（GitHub 仓库用 GitHub Plugin）。

> ⚠️ **新建分支不会自动触发** Jenkins 扫描——第一次推 `dev`/`prod` 这种新分支时，去对应 Job 点 `Scan Multibranch Pipeline Now` 手动扫一次；已存在分支的后续 push 会自动触发。

---

## 七、镜像 tag 策略：为什么 `{env}-{version}-{hash}`

镜像 tagging 的核心规范两条：

1. **每次构建产出一个唯一、不可变的 tag**（永不覆盖）—— 这是回滚和可复现的基础。`{git_hash}` 满足"唯一"；`v{version}` 带版本但**不唯一**（同版本多次构建会互相覆盖），所以 `v{version}` 不能当主 tag。
2. **主 tag 应自带语义信息** —— `{env}-{version}-{hash}`（如 `prod-5.4.0-a1b2c3d`）一眼知道"哪个环境、什么版本、哪个 commit"，既唯一又信息完整。

所以最终方案：每次构建 → `{env}-{version}-{hash}`（精确/回滚用）+ `{env}-latest`（dev 自动部署用）。版本号来自后端 `pom.xml` 的 `<revision>` / 前端 `package.json` 的 `version`，用一个 `update-version.ps1`（或任何脚本）一键改所有仓库的版本号。

deploy-prod 的下拉自动列出 `prod-5.4.0-a1b2c3d`、`prod-5.4.1-e4f5g6h`、`prod-latest`……回滚就选上一个稳定的那个，3 分钟内切回（只改 `.env` 的 tag → `docker-compose pull/up`，不改代码、不改业务配置）。

---

## 八、踩坑时间线

这一节是精华。按踩到的顺序排：

### 坑 1：宝塔/nginx 反代 Harbor → 推镜像 `413 Request Entity Too Large`

**症状**：第一个后端镜像 build 成功、push 时 6 个小层都 `Pushed`，但 JRE base 层和 app jar 层一直 `Retrying`，最后 `413 Request Entity Too Large` from nginx。

**原因**：Harbor 自带的内部 nginx 已经把 `client_max_body_size` 设成 0（无限制），但**外层反代（我用面板的 nginx）默认 1M**，大 blob 上传被它挡了。

**解决**：外层反代站点配置加 `client_max_body_size 0;`（registry 推荐）。改完 reload nginx，不用动 Harbor。

### 坑 2：前端 `pnpm-lock.yaml` 被 `.gitignore` 忽略 → Docker build `COPY pnpm-lock.yaml` 失败

**症状**：前端镜像 build 到 `COPY package.json pnpm-lock.yaml ./` 报 `file not found in build context: pnpm-lock.yaml`。

**原因**：仓库 `.gitignore` 里有 `pnpm-lock.yaml` 这行——本地有这文件，但没提交，Jenkins 检出的代码里就没有。

**解决**：**lockfile 本来就该入库**（CI 才能可复现构建）——从 `.gitignore` 删掉那行，`git add pnpm-lock.yaml` 提交。本地先跑一次 `pnpm install --frozen-lockfile` 确认 lockfile 和 `package.json` 同步（不同步 CI 里 `--frozen-lockfile` 会报 "lockfile is not up to date"）。

### 坑 3：生产 ECS 没有 `docker compose` v2 插件，只有 `docker-compose` v1

**症状**：deploy-prod 在生产机跑 `docker compose pull` → `docker: 'compose' is not a docker command`。

**原因**：这台机器的 Docker 是通过面板装的，只带了老的 `docker-compose`（独立二进制，带横杠），没有 v2 的 `docker compose` 子命令插件。而测试机的 Docker 是从官方 repo 装的，有 v2。

**解决**：deploy-prod pipeline 用 `docker-compose`（v1）；测试机的 build Jenkinsfile 那边保持 `docker compose`（v2）。两台机器命令名不一样，pipeline 里写对应的就行。（或者给生产机也装 v2 插件，`dnf install docker-compose-plugin` 或下 `docker-compose` 二进制丢 `/usr/local/lib/docker/cli-plugins/`——但既然 v1 能用，单独处理也行。）

### 坑 4：deploy-prod 的 IMAGE_TAG 下拉报 `Scripts not permitted to use method java.net.URL openConnection`

**原因**：Active Choices 的 Groovy 脚本默认在沙箱里跑，`new URL(...).openConnection()` 被拦。

**解决**：那个参数脚本框下面有 `Use Groovy Sandbox` 复选框，**取消勾选**；Save 后去 Manage Jenkins → In-process Script Approval，会有一条待批准脚本，**Approve**。（保留沙箱也行，但要逐个批准 `method java.net.URL openConnection`、`method java.net.URLConnection getInputStream` 等好几个签名，烦。）

### 坑 5：容器连不上宿主机 MySQL，`Connection timed out`，且 `.env.app` 里写的 `172.17.0.1` 根本不存在

**症状**：容器启动报 `init datasource error, url: jdbc:mysql://172.17.0.1:3306/...` `java.net.ConnectException: Connection timed out`。

**原因**：① 这台机器的 `docker0` 是 `172.18.0.1`（不是 docker 默认的 `172.17.0.1`，可能 `172.17` 被别的占了）；容器自己在 compose 自建网络 `172.22.0.0/16` 上。`172.17.0.1` 在这台机器上压根不存在。② 即使 IP 对了，MySQL 用户的授权来源也得对——线上旧服务走 `127.0.0.1` 连，用的是 `'localhost'` 授权；容器走 `172.x` 进来匹配不上。

**解决**：
1. `.env.app` 的 host 改成 `172.18.0.1`（`ip -4 addr show docker0` 看你实际的）。MySQL 监听 `*:3306`（所有网卡）的话就能连。
2. MySQL 里给那个用户加一条来源 `'172.%'` 的授权：`CREATE USER 'app_user'@'172.%' IDENTIFIED BY '...'; GRANT ... ON app.* TO 'app_user'@'172.%'; FLUSH PRIVILEGES;`（如果它已经是 `'%'` 就不用动）。**不要**为了图省事新建一个 `root` / 弱密码用户。

> 这一坑跟 [#5 里的「Docker 容器连宿主机 MySQL」](/posts/2026-05-09-homelab-dev-server-vm-kai-fa-zhan) 是同一类问题——容器化最容易卡的从来不是容器本身，是它跟宿主机已有服务怎么对接。

### 坑 6：（坑 5 的延伸）`Connection timed out` 是网络层问题，不是认证问题

提一句方法论：`Connection timed out`（TCP 握手都没成）= 网络/防火墙/bind 问题；`Access denied for user...` 才是认证问题。别一上来就改 MySQL 用户授权——先 `ss -ltnp | grep 3306` 看 MySQL 监听在哪、`ip addr show docker0` 看网关 IP、从一个临时容器 `docker run --rm --network <compose-net> busybox nc -zv 172.18.0.1 3306` 测可达性，定位清楚再动手。

### 坑 7：Redis 默认只 `bind 127.0.0.1` + `protected-mode yes` + 无密码 → 容器连不上

**症状**：先是 `Connection refused`（Redis 只在 `127.0.0.1` 监听，容器连 `172.18.0.1:6379` 端口没人）；加上 `bind 172.18.0.1` 后变成临时容器连进去返回 `DENIED Redis is running in protected mode ... connections are only accepted from the loopback interface`；客户端那边表现为 `Command execution timeout for command: (AUTH/SELECT)`。

**原因**：Redis 的 `bind` 控制"监听哪些网卡"，`protected-mode` 控制"允许哪些来源 IP 发命令"——`protected-mode yes` + 无密码 = 只允许 loopback 来源，跟 bind 没关系。容器从 `172.22.0.x`（非 loopback）连进来就被拒。

**解决**：
```bash
redis-cli config set bind "127.0.0.1 172.18.0.1"   # 不要 0.0.0.0（公网 ECS + 无密码 = 高危）
redis-cli config set protected-mode no
redis-cli config rewrite
```
`bind 127.0.0.1 172.18.0.1` 意味着 Redis 只在回环和 docker0 网桥上监听，公网网卡上不监听，所以即使关 protected-mode + 无密码外网也碰不到。关 protected-mode 不影响走 `127.0.0.1` 连的旧服务（loopback 本来就允许）。更彻底是给 Redis 设 `requirepass`——但那会让旧服务也得带密码连（它现在不带），所以暂时靠"不绑公网"保护，后续再统一上密码。

### 坑 8：`.env.app` 里 `SPRING_DATA_REDIS_PASSWORD=`（空赋值）→ Redisson 发 `AUTH ""` → 报错

**症状**：Redis 无密码，`.env.app` 里 `SPRING_DATA_REDIS_PASSWORD=` 看着也是空，但客户端还在发 AUTH（`Command execution timeout for command: (AUTH), params: (password masked)`）。

**原因**：空环境变量 `""` 不等于 `null`。`application-prod.yaml` 里 Redis 密码是注释掉的（=null，本来不该发 AUTH），但 `.env.app` 的 `SPRING_DATA_REDIS_PASSWORD=` 把它覆盖成了空字符串 `""`，Redisson 拿到 `password=""` 会发 `AUTH ""`，无密码的 Redis 收到这个要么报错要么不回 → 超时。

**解决**：把 `.env.app` 里 `SPRING_DATA_REDIS_PASSWORD=` 这行**整行删掉**（让属性 unset 而不是空字符串），回落到 yaml 的注释状态 = null，客户端就不发 AUTH 了。

### 坑 9：`System.getenv()` 读不到 Jenkins「Global properties → Environment variables」

**症状**：deploy-prod 的 IMAGE_TAG 下拉报 401（Harbor），改 Global properties 里的 `HARBOR_API_TOKEN` 不管用。

**原因**：「Global properties → Environment variables」设的 env var 只注入到「构建」的环境里，**不进 Jenkins JVM 的 `System.getenv()`**。Active Choices 脚本跑在 master JVM 上，`System.getenv()` 只能看 OS 级环境变量。

**解决**：Active Choices 脚本改成从 Jenkins Credential 读（见 6.5 的脚本——`CredentialsProvider.lookupCredentials(...)` 找 `harbor-api-token`）。或者把 token 设成 Jenkins 容器的真·环境变量（compose `environment:` 里），重启 Jenkins。

### 坑 10：Harbor v2 REST API 用 Basic auth，不是 Bearer

**症状**：IMAGE_TAG 下拉显示 `[object Object]`（Harbor 返回了个错误 JSON 对象而不是 artifacts 数组）。

**原因**：脚本里 `Authorization: Bearer ${token}`，但 Harbor v2 的 `/api/v2.0/...` REST API 用的是 `Basic base64("用户名:密码")`，不是 Bearer token。而且**项目级 robot account 在 UI 里只勾了 push/pull 的话，是不能调这个 REST API 的**（会 401）——要么给 robot account 加 `Repository:List` + `Artifact:Read/List` 权限，要么用一个有读权限的普通账号。

**解决**：header 改成 `Basic`，token 用 `base64("用户名:密码")`，账号确保对项目有读权限。先用 `curl -H "Authorization: Basic $(printf '%s' '用户名:密码' | base64 -w0)' 'https://harbor.example.com/api/v2.0/...'` 在命令行验证能拿到数组，再填进 Jenkins。

### 坑 11：Webhook 测试能触发，但新建分支不出现在 Jenkins

**症状**：push `dev`/`prod` 新分支后，Jenkins 的 Multibranch Pipeline 里不出现这个分支。

**原因**：Gitee Plugin 的 webhook 对"新建分支"这种事件的自动重扫有时不灵；webhook 事件配置（勾「推送代码」）本身没问题。

**解决**：去对应 Job 点 `Scan Multibranch Pipeline Now` 手动扫一次。已存在分支的后续 push 会自动触发，只有第一次新建分支需要手动扫。

---

## 九、个人反思

### 反思 1：80/20 同样适用——"基础设施"用面板/已有实例，"流水线"用代码

跟 [#5 Dev-Server VM](/posts/2026-05-09-homelab-dev-server-vm-kai-fa-zhan) 一样的原则：MySQL/Redis/Nginx/证书这些"基础设施"继续用宿主机已有的（自动部署**不动数据**，风险最低）；流水线本身（Jenkinsfile、Dockerfile、deploy 脚本）全是代码、进 git。我没有把 MySQL/Redis 容器化，因为那是另一个工程，而且会把"自动部署"和"数据迁移"两件事绑在一起——出问题不好定位。

### 反思 2：并行跑，不要直接切

新搭的 docker 栈跑在 `48082/8081/8082`，**和线上旧服务（旧 java-jar 的 48080 + 旧静态前端）并行**，面板的域名反代**暂不切换**。这样：dev 自动部署、prod 镜像构建、deploy-prod 手动部署全链路都验证通了，新 docker 栈也在生产 ECS 上跑起来了——但线上对外服务一点没受影响。等观察几天确认稳了，再改面板 nginx 的 upstream 把流量切过去（`server 127.0.0.1:48082;` ↔ `server 127.0.0.1:48080;`，秒切秒回），最后才停旧服务。"先并行、后切换、留回滚"——比"直接 cutover 然后祈祷"踏实太多。这跟 [#0 导览](/posts/2026-05-09-homelab-overview-jia-ting-shi-yan-shi-jia-gou) 里"能直通就直通、出问题能回退"的设计原则一脉相承。

### 反思 3：一半的坑在"宿主机网络"和"配置文件里的隐藏字符"

回头看踩的 11 个坑，跟 CI/CD 工具本身（Jenkins/Harbor）关系不大——`client_max_body_size`、docker0 网段、Redis bind/protected-mode、MySQL 授权来源、`.env.app` 里空赋值、`System.getenv()` 拿不到、Harbor API 用 Basic……都是"容器要连宿主机的东西"和"配置细节"。**容器化的难点从来不是容器，是容器和外面那个真实世界（宿主机的网络、防火墙、已有服务）怎么对接。** 所以排查的时候，先分清是网络层（`Connection timed out`/`refused`）还是应用层（`Access denied`/`AUTH error`），别一上来就改业务配置。

### 反思 4：dev 不回滚是个特性，不是 bug

dev 分支部署失败（健康检查超时）**不会自动回滚**——`docker compose up -d` 是 recreate，旧容器已经被新的（崩的）替换了。听起来吓人，但 dev 是测试环境，正确的应对是"再 push 一个修复 commit"，不是"加一套自动回滚机制"（那是给 prod 用的，prod 走 deploy-prod 手动选 tag 回滚）。给测试环境加复杂的回滚逻辑是过度工程。

---

## 十、与其他方案的横向对比

### vs 直接 `scp + 重启`（项目原来的做法）
- 没有可复现的构建产物，回滚靠"再拷一遍上一版 jar"（如果你还留着）
- 手工步骤多容易漏
- CI/CD 方案：构建产物是不可变镜像，回滚 = 切 tag，全程有记录 + 通知

### vs 蓝绿 / 金丝雀部署
- 蓝绿需要双实例 + 流量切换编排；金丝雀还要按比例分流
- 单实例 `docker-compose up -d` recreate + healthcheck + `restart: always` 只有几秒抖动，对绝大多数小项目够了
- 真要零停机再上蓝绿——但那是"按压力上"，不是"一开始就上"

### vs K8s + Argo CD（GitOps）
- K8s 适合多机集群；单台 ECS + docker-compose 是更简单的选择
- 等你扩展到 3 台以上服务器再考虑 K8s
- GitOps（声明式、git 即真相）思路很好，但 K8s 这套对单机 overkill

### vs 云原生 CI（GitHub Actions / 阿里云效）
- 按构建分钟数/并发收费，私有仓库额度有限
- 有现成的服务器算力闲着，自建 Jenkins 边际成本接近 0
- 仓库不在 GitHub 的话（Gitee/自建），GitHub Actions 也接不上

### vs Drone / Gitea Actions（轻量 CI）
- 比 Jenkins 轻、`.drone.yml` 简单
- 但插件生态小，遇到冷门需求（比如 Active Choices 这种反应式参数下拉）不好办
- Jenkins 的"重"换来的是"什么都能查到怎么配"

---

## 十一、下一步

CI/CD 环搭完了，业务项目的"提交代码 → 自动部署测试环境"、"准备发版 → 生成生产镜像"、"人工发布生产 + 一键回滚"都打通了。下一步：

1. **监控环**：Prometheus + Grafana + Node Exporter + cAdvisor，给 ECS 和容器加监控告警（现在只有面板的磁盘告警 + cron 检查容器异常退出）
2. **安全加固收尾**：FastTunnel 12022 加 IP 白名单、Harbor 换专用 robot account、Redis 上密码、Webhook IP 白名单
3. **可观测性**：日志聚合（Loki / ELK）——现在看日志靠 `docker compose logs -f`
4. **把面板的域名反代切到 docker 栈**（确认稳定后），停掉旧服务

CI/CD 之后的"监控环"会单独成文。

---

## 附录：常用命令速查

```bash
# ── 容器 ──
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | grep app
docker logs -f app-server --tail 200
docker-compose -f /www/dk_project/dk_app/app/docker-compose.yml logs --tail 200 app-server   # v1
docker compose -f /www/dk_project/dk_app/app/docker-compose.yml logs --tail 200 app-server   # v2

# ── 健康检查 ──
curl -s http://127.0.0.1:48082/actuator/health   # 生产 docker 后端
curl -s http://127.0.0.1:48080/actuator/health   # 测试机 / 旧服务

# ── 应急：手动改 tag 并拉起（绕过 deploy-prod）──
cd /www/dk_project/dk_app/app && \
  sed -i 's|^APP_SERVER_TAG=.*|APP_SERVER_TAG=prod-5.4.0-a1b2c3d|' .env && \
  docker-compose pull app-server && docker-compose up -d app-server

# ── 看 Harbor 某仓库的 tag ──
TOK=$(printf '%s' '用户名:密码' | base64 -w0)
curl -s -H "Authorization: Basic $TOK" \
  'https://harbor.example.com/api/v2.0/projects/app/repositories/app-server/artifacts?with_tag=true&page_size=20&sort=-push_time' | python3 -m json.tool

# ── 排查"容器连不上宿主机服务"──
ip -4 addr show docker0                                   # 看 docker0 网关 IP（不一定是 172.17.0.1）
ss -ltnp | grep -E '3306|6379'                            # 看 MySQL/Redis 监听在哪
NET=$(docker inspect app-server --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
docker run --rm --network "$NET" busybox nc -zv 172.18.0.1 3306   # 从同网络临时容器测可达性
redis-cli config get bind; redis-cli config get protected-mode; redis-cli config get requirepass

# ── FastTunnel（测试机）──
systemctl restart fasttunnel-client
systemctl status fasttunnel-client

# ── Jenkins 容器内拿初始密码 ──
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword

# ── git 日常 ──
git push origin dev                                       # → 自动构建 + 部署测试机
git checkout prod && git merge dev && git push origin prod # → 生成生产镜像 + 企微通知（不部署）
```

---

> **本系列完结**（#0–#5 基础设施 + #6 CI/CD 这篇）。后续"监控环"单独成文。如果你照这个系列搭出了自己的家庭实验室，欢迎交流踩坑经验。
>
> **本文协议**：CC BY-NC-SA 4.0，转载请保留出处
