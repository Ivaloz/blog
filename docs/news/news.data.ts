// Build-time loader for routines-fetched news feeds.
// See: https://vitepress.dev/guide/data-loading
//
// 数据契约见 docs/.vitepress/data/news/schema.json (JSON Schema 2020-12)。
// routines 直接覆盖写入 docs/.vitepress/data/news/<slug>.json 即可,构建
// 时自动生效;dev server 文件变更会触发热更新。
//
// 本地/CI 校验:
//   pnpm dlx --package=ajv-cli --package=ajv-formats ajv validate \
//     -s docs/.vitepress/data/news/schema.json \
//     -d 'docs/.vitepress/data/news/{policy,tech,industry,ai,finance}.json' \
//     --strict=false --spec=draft2020 -c ajv-formats
import { defineLoader } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'

export interface NewsItem {
  id?: string
  title: string
  summary?: string
  publishedAt?: string
  source?: string
  url: string
  subCategory?: string
}

export interface NewsCategory {
  slug: string
  title: string
  description?: string
  updatedAt?: string
  items: NewsItem[]
}

// 大类清单 —— 顺序即顶部导航顺序。
// 新增一个大类:1) 在此追加;2) 在 docs/.vitepress/data/news/ 放对应 JSON;
//             3) 在 docs/news/ 新增对应 markdown 页面与导航。
export const CATEGORY_SLUGS = ['policy', 'tech', 'industry', 'trade', 'ai', 'finance'] as const
export type CategorySlug = (typeof CATEGORY_SLUGS)[number]

export interface NewsData {
  categories: NewsCategory[]
  bySlug: Record<string, NewsCategory>
  latest: Array<NewsItem & { categorySlug: string; categoryTitle: string }>
}

declare const data: NewsData
export { data }

const DATA_DIR = path.resolve(__dirname, '../.vitepress/data/news')

function readCategory(slug: string): NewsCategory | null {
  const file = path.join(DATA_DIR, `${slug}.json`)
  if (!fs.existsSync(file)) return null
  try {
    const raw = fs.readFileSync(file, 'utf-8')
    const obj = JSON.parse(raw) as NewsCategory
    if (!obj || typeof obj !== 'object') return null
    return {
      slug: obj.slug || slug,
      title: obj.title || slug,
      description: obj.description || '',
      updatedAt: obj.updatedAt || '',
      items: Array.isArray(obj.items) ? obj.items.filter((it) => it && it.title && it.url) : []
    }
  } catch (err) {
    console.warn(`[news] failed to parse ${file}:`, (err as Error).message)
    return null
  }
}

// 把 publishedAt 解析为可数值比较的时间戳。
// - 完整 ISO(带时区)→ Date.parse 直接拿到毫秒
// - 仅日期 YYYY-MM-DD → 视为当日 23:59:59 +08:00,避免「时间未知」条目被同日带时间的条目挤到末尾,
//   反而让用户错过当天最新的(routine 没拿到精确时间的)资讯
// - 解析失败/缺省 → 返回 -Infinity,排到最末
function publishedAtToMs(p?: string): number {
  if (!p) return Number.NEGATIVE_INFINITY
  if (/^\d{4}-\d{2}-\d{2}$/.test(p)) {
    const t = Date.parse(`${p}T23:59:59+08:00`)
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
  }
  const t = Date.parse(p)
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
}

function buildData(): NewsData {
  const categories: NewsCategory[] = []
  const bySlug: Record<string, NewsCategory> = {}
  for (const slug of CATEGORY_SLUGS) {
    const cat = readCategory(slug)
    if (cat) {
      // 类内条目按发布时间倒序
      cat.items = [...cat.items].sort(
        (a, b) => publishedAtToMs(b.publishedAt) - publishedAtToMs(a.publishedAt)
      )
      categories.push(cat)
      bySlug[cat.slug] = cat
    }
  }
  const latest = categories
    .flatMap((c) =>
      c.items.map((it) => ({ ...it, categorySlug: c.slug, categoryTitle: c.title }))
    )
    .sort((a, b) => publishedAtToMs(b.publishedAt) - publishedAtToMs(a.publishedAt))
  return { categories, bySlug, latest }
}

export default defineLoader({
  watch: [path.join(DATA_DIR, '*.json')],
  load(): NewsData {
    return buildData()
  }
})
