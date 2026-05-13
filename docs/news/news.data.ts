// Build-time loader for routines-fetched news feeds.
// See: https://vitepress.dev/guide/data-loading
//
// Data source contract (each JSON file at docs/.vitepress/data/news/<slug>.json):
//
//   {
//     "slug": "tech",                 // 与文件名一致,作为该大类的 key
//     "title": "科技新闻",            // 顶部展示用的大类标题
//     "description": "...",           // 副标题/说明,可选
//     "updatedAt": "ISO8601 时间串",   // routines 最近一次写入时间
//     "items": [
//       {
//         "id": "unique-id",          // 稳定的唯一 ID,routines 用于去重
//         "title": "...",             // 标题
//         "summary": "...",           // 1-2 句话的摘要
//         "publishedAt": "ISO8601",   // 原文发布时间
//         "source": "36氪",           // 来源名称
//         "url": "https://...",       // 原文链接
//         "subCategory": "大模型"     // 在大类下用于分组的子分类
//       }
//     ]
//   }
//
// Routines 直接覆盖写入对应 JSON 即可,构建时自动生效;
// dev server 模式下文件变更会触发热更新。
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
export const CATEGORY_SLUGS = ['policy', 'tech', 'industry', 'ai', 'finance'] as const
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

function buildData(): NewsData {
  const categories: NewsCategory[] = []
  const bySlug: Record<string, NewsCategory> = {}
  for (const slug of CATEGORY_SLUGS) {
    const cat = readCategory(slug)
    if (cat) {
      // 类内条目按发布时间倒序
      cat.items = [...cat.items].sort((a, b) => {
        const ta = a.publishedAt || ''
        const tb = b.publishedAt || ''
        return ta < tb ? 1 : ta > tb ? -1 : 0
      })
      categories.push(cat)
      bySlug[cat.slug] = cat
    }
  }
  const latest = categories
    .flatMap((c) =>
      c.items.map((it) => ({ ...it, categorySlug: c.slug, categoryTitle: c.title }))
    )
    .sort((a, b) => {
      const ta = a.publishedAt || ''
      const tb = b.publishedAt || ''
      return ta < tb ? 1 : ta > tb ? -1 : 0
    })
  return { categories, bySlug, latest }
}

export default defineLoader({
  watch: [path.join(DATA_DIR, '*.json')],
  load(): NewsData {
    return buildData()
  }
})
