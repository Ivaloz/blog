# 树洞广场

匿名公开留言板。前端是一份**零依赖静态单页**；后端有**两套实现，接口完全一致**：
**本地开发用 Node**（`server.js`，零依赖），**线上用 Cloudflare Workers + D1**（`worker/`）。
两者可随时互换，前端零改动。

- 双主题：**卡片风**（默认）/ **极简风**，一键切换，选择存在 `localStorage`
- 匿名身份：浏览器首次访问生成一个随机 `visitorId`，服务端据此派生小动物头像与等级
- 无密码门、无鉴权：所发即公开（`plaza_mode: true`）
- 分区：`生活 / 学习 / 情感 / 吐槽 / 求助`
- 等级：由「发帖数 ×3 + 收到赞 ×1 + 给出赞 ×0.5」实时算出，不落库

## 目录结构

```
treehole/
  server.js        # 本地开发后端（Node 内置模块，零依赖）
  data.json        # 本地 Node 版数据（已 gitignore，不进仓库）
  worker/          # 线上后端（Cloudflare Workers + D1）
    src/index.js     # Worker 入口，8 个 /api/* 端点
    schema.sql       # D1 建表语句（幂等，可重复执行）
    wrangler.toml    # 部署配置（database_id 待填）
    部署手册-*.md    # 逐步上线手册
  README.md

docs/public/treehole/
  index.html       # 前端唯一源；VitePress 构建时原样拷进产物根目录
docs/treehole.md   # 站点页面（layout: false，全屏挂载）
docs/.vitepress/theme/components/TreeHole.vue
                   # 全屏 iframe 包装器，负责把 API 基址传给静态页
```

> 前端只有一份，就在 `docs/public/treehole/index.html`。`server.js` 通过 `PUBLIC_DIR` 直接读它，
> 所以改前端不需要在两边同步。

## 本地运行

**方式一 · Node 版**（改后端逻辑时最方便，数据是 `data.json`）

```bash
node treehole/server.js                                            # 后端 :8788
node node_modules/vitepress/bin/vitepress.js dev docs --port 5173   # 站点 :5173
```

打开 <http://localhost:5173/treehole>。开发模式下 `TreeHole.vue` 默认把前端指向
`http://localhost:8788`，开箱即用。

**方式二 · Worker 版**（本地 D1，不需要 Cloudflare 账号、不联网）

```bash
cd treehole/worker
npx wrangler d1 execute treehole --local --file=schema.sql   # 建本地库（仅首次）
npx wrangler dev --local --port 8789                        # 后端 :8789
```

打开 <http://localhost:5173/treehole/index.html?api=http://127.0.0.1:8789>。
本地数据在 `treehole/worker/.wrangler/`（已 gitignore），删掉该目录即回空库。

> 两套后端的接口契约完全一致，可以同时起、分别用 `?api=` 切换对照。

### 环境变量

| 变量 | 作用 | 默认 |
|---|---|---|
| `PORT` | Node 版后端端口 | `8788` |
| `TREEHOLE_PUBLIC_DIR` | Node 版静态目录 | `../docs/public/treehole` |
| `TREEHOLE_ALLOWED_ORIGINS` | Node 版 CORS 白名单，逗号分隔 | `*` |
| `ALLOWED_ORIGINS` | Worker 版 CORS 白名单，逗号分隔（在 `wrangler.toml`） | `*` |

站点侧用 `VITE_TREEHOLE_API` 覆盖接口地址（构建时注入）；静态页自身也接受
`?api=https://...` 查询参数，便于一份产物适配不同环境。

## HTTP 接口

```
GET  /api/config                        站点配置、分区、字数上限
POST /api/visitor  {visitorId?}         领取/续用匿名身份
GET  /api/messages?viewer&category&sort=new|hot&limit
GET  /api/messages/:id/replies
POST /api/message  {visitorId,content,category,imageUrl,_hp}
POST /api/reply    {visitorId,messageId,content,_hp}
POST /api/like     {visitorId,messageId}
POST /api/me       {visitorId,nickname?,bio?,avatarUrl?}
```

限流：60 秒内最多 10 次写操作，两次写操作间隔 ≥ 1.5 秒（自动化测试请留出 1.9 秒以上）。
表单里有一个隐藏的 `_hp` 蜜罐字段，被填写时请求会被静默丢弃。

## 数据

| 后端 | 存储 | 位置 |
|---|---|---|
| Node 版 | JSON 文件（内存为主，写操作后 120ms 防抖落盘） | `treehole/data.json` |
| Worker 版（本地） | 本地 D1（SQLite） | `treehole/worker/.wrangler/` |
| Worker 版（线上） | 远端 D1 | Cloudflare，由 `wrangler` 管理 |

四个集合：`visitors` / `messages` / `replies` / `likes`。两套后端的表结构一一对应。

## 部署状态

**Worker 版代码已完成，本地全链路验证通过**（26 项接口测试 + 浏览器实测发帖/点赞/回复 + D1 落盘核验）。
**尚未部署到线上** —— 部署动作由账号主人执行，步骤见 [`worker/部署手册-2026-09-18.md`](worker/部署手册-2026-09-18.md)。

选型结论（2026-09）：**Cloudflare Workers + D1**。理由是 Workers Free + D1 Free + Pages **都不需要绑信用卡**，
而同类方案（Twikoo 等）强制依赖 R2、R2 必须绑卡，故排除。

两套后端的差异：

| | Node 版（`server.js`） | Worker 版（`worker/src/index.js`） |
|---|---|---|
| 用途 | 本地开发、逻辑对照 | 线上部署 |
| 静态文件 | 自带（`PUBLIC_DIR`） | **不管**，前端由站点托管 |
| 身份派生哈希 | `crypto.createHash('sha256')` | FNV-1a 32 位（Workers 无 `createHash`） |
| 统计查询 | 逐帖 `filter` 全量扫描 | `db.batch()` 两条 GROUP BY 批量聚合（无 N+1） |
| 落盘 | 120ms 防抖写 `data.json` | D1 即时持久 |
| 限流 | 进程内存 Map | isolate 内存 Map（**挡连点，挡不住分布式刷量**） |

> ⚠️ 因为哈希算法不同，**同一个 `visitorId` 在两套后端下会映射到不同的小动物**（如 🦉 vs 🐼）。
> 这只是显示层差异，不影响任何数据。线上只会跑一套，所以不会有割裂感。