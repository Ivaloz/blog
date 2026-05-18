# fanweibin.cn

范伟彬的个人博客 —— 技术、投资、AI 工作流的记录与思考。

基于 [VitePress](https://vitepress.dev/) 构建，通过 GitHub Actions 自动部署到 GitHub Pages，自定义域名 [fanweibin.cn](https://fanweibin.cn)。

## 技术栈

- **VitePress 2.0 (alpha)** — 静态站点生成器
- **pnpm** — 包管理器（锁定 `pnpm@10.33.0`）
- **Vue 单文件组件** — 主题自定义组件（首页、文章列表、分类、标签云、评论等）
- **GitHub Actions + GitHub Pages** — 自动构建与部署

## 本地开发

```bash
pnpm install          # 安装依赖
pnpm docs:dev         # 启动开发服务器（热更新）
pnpm docs:build       # 生产构建（输出至 docs/.vitepress/dist）
pnpm docs:preview     # 本地预览生产构建
```

## 目录结构

```
docs/
  index.md                  # 首页
  posts/                    # 博客文章（Markdown，按日期命名）
  pages/                    # 独立页面（如「关于」）
  categories.md / tags.md   # 分类与标签索引页
  public/                   # 静态资源（含 CNAME、logo、favicon）
  .vitepress/
    config.mts              # 站点配置：导航、侧边栏、SEO、RSS
    theme/                  # 自定义主题与 Vue 组件
    data/news/              # 自动抓取的资讯数据（JSON）
scripts/
  new-post.mjs              # 新建文章骨架
  localize_images.py        # 远程图片本地化
  migrate_halo.py           # 从 Halo 迁移文章
.github/workflows/
  deploy.yml                # 推送 main 时构建并部署
  validate-news.yml         # 校验资讯数据
```

## 写作流程

新建一篇文章：

```bash
node scripts/new-post.mjs <slug> "文章标题"
```

会在 `docs/posts/` 下生成 `YYYY-MM-DD-<slug>.md` 骨架，包含 frontmatter 模板。常用 frontmatter 字段：

- `title` / `date` / `slug` / `description`
- `categories` / `tags`
- `draft: true` — 草稿，不会出现在生产构建
- `featured: true` — 置顶到首页「精选」区
- `series` / `seriesIndex` — 系列文章
- `evergreen: true` — 长青文，抑制时效性提示

正文第一段（2-3 句）会作为默认摘要。

## 功能特性

- 文章按分类 / 标签 / 归档浏览，本地全文搜索
- 自动生成 RSS：文章订阅 `feed.xml`，资讯订阅 `news.xml`
- 每页 SEO：Open Graph / Twitter Card / JSON-LD 结构化数据
- 资讯聚合：按主题（政策、科技、行业、外贸、AI、财经）归档的多源资讯
- Giscus 评论、相关文章推荐、系列导航、站点访问统计

## 部署

推送到 `main` 分支即触发 `.github/workflows/deploy.yml`：

1. 安装 pnpm + Node 20
2. 执行 `pnpm docs:build`
3. 将 `docs/.vitepress/dist` 部署到 GitHub Pages

自定义域名通过 `docs/public/CNAME` 配置为 `fanweibin.cn`。
