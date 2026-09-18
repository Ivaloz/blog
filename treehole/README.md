# 树洞广场

匿名公开留言板。前端是一份**零依赖静态单页**，后端是一个**零依赖 Node HTTP 服务**，全部跑在本机即可使用。

- 双主题：**卡片风**（默认）/ **极简风**，一键切换，选择存在 `localStorage`
- 匿名身份：浏览器首次访问生成一个随机 `visitorId`，服务端据此派生小动物头像与等级
- 无密码门、无鉴权：所发即公开（`plaza_mode: true`）
- 分区：`生活 / 学习 / 情感 / 吐槽 / 求助`
- 等级：由「发帖数 ×3 + 收到赞 ×1 + 给出赞 ×0.5」实时算出，不落库

## 目录结构

```
treehole/
  server.js        # 本地开发后端（零依赖，仅用 Node 内置模块）
  data.json        # 本地数据（已 gitignore，不进仓库）
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

```bash
# 1) 起后端（默认端口 8788）
node treehole/server.js

# 2) 另开一个终端起站点
node node_modules/vitepress/bin/vitepress.js dev docs --port 5173
```

然后打开 <http://localhost:5173/treehole>。开发模式下 `TreeHole.vue` 会自动把前端指向
`http://localhost:8788`，开箱即用。

### 环境变量

| 变量 | 作用 | 默认 |
|---|---|---|
| `PORT` | 后端端口 | `8788` |
| `TREEHOLE_PUBLIC_DIR` | 静态目录 | `../docs/public/treehole` |
| `TREEHOLE_ALLOWED_ORIGINS` | CORS 白名单，逗号分隔 | `*` |

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

全部落在 `data.json`（内存为主，写操作后 120ms 防抖落盘）。四个集合：
`visitors` / `messages` / `replies` / `likes`。删除该文件即可回到空库。

## 部署状态

**尚未部署。** 目前只在本地跑通（`localhost`）。

后端若要上线，需要先确定落点：Cloudflare Workers + D1、自建服务器、或与站点同域。
`server.js` 是标准 Node `http` 服务，**不能直接搬到 Workers**（Workers 不是 Node 运行时），
届时需要按目标平台的形态改写路由层；数据层与业务逻辑可以照搬。

上线前还需要收尾：把 `TREEHOLE_ALLOWED_ORIGINS` 从 `*` 收紧到实际站点域名。