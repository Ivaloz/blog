// VitePress site config.
// Docs: https://vitepress.dev/reference/site-config
import { defineConfig } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'

const SITE_URL = 'https://fanweibin.cn'
const SITE_TITLE = '范伟彬 · 写作空间'
const SITE_DESC = '技术、投资、AI 工作流的记录与思考 — 范伟彬的个人博客'
const AUTHOR = '范伟彬'
const OG_IMAGE = '/logo.svg'

// --------------------------- frontmatter reader ---------------------------
function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const out = {}
  const lines = m[1].split('\n')
  let key = null
  let list = null
  for (const line of lines) {
    if (list !== null) {
      const li = line.match(/^\s+-\s+(.*)$/)
      if (li) {
        let v = li[1].trim()
        if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
          v = v.slice(1, -1).replace(/''/g, "'")
        }
        list.push(v)
        continue
      }
      out[key] = list
      list = null
      key = null
    }
    const scalar = line.match(/^(title|date|slug|description|source):\s*(.*)$/)
    if (scalar) {
      let v = scalar[2].trim()
      if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
        v = v.slice(1, -1).replace(/''/g, "'")
      }
      out[scalar[1]] = v
      continue
    }
    const arr = line.match(/^(tags|categories):\s*$/)
    if (arr) {
      key = arr[1]
      list = []
    }
  }
  if (list !== null && key) out[key] = list
  return out
}

// -------------------------- post collection --------------------------
function loadPosts() {
  const dir = path.resolve(__dirname, '../posts')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'index.md' && !f.endsWith('.data.ts'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8')
      const fm = parseFrontmatter(raw)
      return {
        file,
        slug: file.replace(/\.md$/, ''),
        title: fm.title || file.replace(/\.md$/, ''),
        date: fm.date || '',
        description: fm.description || '',
        tags: fm.tags || [],
        categories: fm.categories || []
      }
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

// --------------------------- RSS feed (buildEnd) ---------------------------
function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildFeedXml(posts) {
  const now = new Date().toUTCString()
  const items = posts
    .slice(0, 30)
    .map((p) => {
      const url = `${SITE_URL}/posts/${p.slug}`
      const pub = p.date ? new Date(p.date).toUTCString() : now
      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${pub}</pubDate>
      <description>${escapeXml(p.description)}</description>
${p.categories.map((c) => `      <category>${escapeXml(c)}</category>`).join('\n')}
${p.tags.map((t) => `      <category>${escapeXml(t)}</category>`).join('\n')}
    </item>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(SITE_DESC)}</description>
    <language>zh-cn</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`
}

const posts = loadPosts()

export default defineConfig({
  title: SITE_TITLE,
  description: SITE_DESC,
  lang: 'zh-CN',
  lastUpdated: true,
  cleanUrls: true,
  metaChunk: true,
  sitemap: { hostname: SITE_URL },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['link', { rel: 'alternate', type: 'application/rss+xml', title: SITE_TITLE, href: '/feed.xml' }],
    ['meta', { name: 'author', content: AUTHOR }],
    ['meta', { name: 'theme-color', content: '#3e7bff' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: SITE_TITLE }],
    ['meta', { property: 'og:title', content: SITE_TITLE }],
    ['meta', { property: 'og:description', content: SITE_DESC }],
    ['meta', { property: 'og:url', content: SITE_URL }],
    ['meta', { property: 'og:image', content: SITE_URL + OG_IMAGE }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: SITE_TITLE }],
    ['meta', { name: 'twitter:description', content: SITE_DESC }],
    ['meta', { name: 'twitter:image', content: SITE_URL + OG_IMAGE }]
  ],

  markdown: {
    lineNumbers: true,
    image: { lazyLoading: true }
  },

  // ---------- Per-page SEO: OG / Twitter / JSON-LD ----------
  transformPageData(pageData) {
    const fm = pageData.frontmatter || {}
    const relPath = pageData.relativePath || ''
    const isPost = relPath.startsWith('posts/') && relPath !== 'posts/index.md'
    const isPage = relPath.startsWith('pages/')
    const url = SITE_URL + '/' + relPath.replace(/\.md$/, '').replace(/\/index$/, '/')

    const title = fm.title || SITE_TITLE
    const desc = (fm.description || SITE_DESC).toString().slice(0, 300)
    const image = SITE_URL + (fm.image || OG_IMAGE)

    const head = pageData.frontmatter.head || []

    // 覆盖站点级的 og:title / og:description / og:url（后出现覆盖先出现）
    head.push(['meta', { property: 'og:title', content: title }])
    head.push(['meta', { property: 'og:description', content: desc }])
    head.push(['meta', { property: 'og:url', content: url }])
    head.push(['meta', { property: 'og:image', content: image }])
    head.push(['meta', { name: 'twitter:title', content: title }])
    head.push(['meta', { name: 'twitter:description', content: desc }])
    head.push(['meta', { name: 'twitter:image', content: image }])
    head.push(['link', { rel: 'canonical', href: url }])

    if (isPost) {
      head.push(['meta', { property: 'og:type', content: 'article' }])
      if (fm.date) {
        const iso = fm.date instanceof Date
          ? fm.date.toISOString()
          : String(fm.date).slice(0, 10) + 'T00:00:00Z'
        head.push(['meta', { property: 'article:published_time', content: iso }])
      }
      if (Array.isArray(fm.tags)) {
        for (const t of fm.tags) head.push(['meta', { property: 'article:tag', content: String(t) }])
      }
      if (Array.isArray(fm.categories) && fm.categories.length) {
        head.push(['meta', { property: 'article:section', content: String(fm.categories[0]) }])
      }

      // JSON-LD BlogPosting 结构化数据
      const ld = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: title,
        description: desc,
        author: { '@type': 'Person', name: AUTHOR, url: SITE_URL },
        publisher: {
          '@type': 'Organization',
          name: SITE_TITLE,
          logo: { '@type': 'ImageObject', url: SITE_URL + '/logo.svg' }
        },
        datePublished: fm.date
          ? (fm.date instanceof Date ? fm.date.toISOString() : String(fm.date).slice(0, 10))
          : undefined,
        image: [image],
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        url,
        keywords: Array.isArray(fm.tags) ? fm.tags.join(', ') : undefined,
        articleSection: Array.isArray(fm.categories) ? fm.categories[0] : undefined
      }
      head.push(['script', { type: 'application/ld+json' }, JSON.stringify(ld)])
    } else if (isPage || relPath === 'index.md') {
      head.push(['meta', { property: 'og:type', content: 'website' }])
    }

    pageData.frontmatter.head = head
  },

  themeConfig: {
    siteTitle: 'fanweibin.cn',
    logo: { src: '/logo.svg', width: 24, height: 24, alt: 'FF' },

    nav: [
      { text: '首页', link: '/' },
      { text: '文章', link: '/posts/' },
      {
        text: '索引',
        items: [
          { text: '按分类', link: '/categories' },
          { text: '按标签', link: '/tags' },
          { text: '按年份', link: '/posts/' }
        ]
      },
      { text: '关于', link: '/pages/about' },
      { text: 'RSS', link: '/feed.xml', target: '_blank' }
    ],

    sidebar: {
      '/posts/': [
        {
          text: `全部文章 (${posts.length})`,
          items: posts.map((p) => ({ text: p.title, link: '/posts/' + p.slug }))
        }
      ]
    },

    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: {
      text: '最后更新',
      formatOptions: { dateStyle: 'medium', timeStyle: undefined }
    },
    darkModeSwitchLabel: '主题',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
    externalLinkIcon: true,

    notFound: {
      code: '404',
      title: '页面走丢了',
      quote: '你访问的页面可能已被移动、重命名或从未存在过。',
      linkLabel: '返回首页',
      linkText: '回到首页'
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/fanweibin2018' }],

    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                displayDetails: '显示详情',
                resetButtonTitle: '清除查询条件',
                backButtonTitle: '关闭搜索',
                noResultsText: '无法找到相关结果',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭'
                }
              }
            }
          }
        }
      }
    },

    footer: {
      message: '以 <a href="https://vitepress.dev/" target="_blank">VitePress</a> 驱动，部署于 GitHub Pages',
      copyright: `© 2020-${new Date().getFullYear()} ${AUTHOR}`
    }
  },

  // Emit RSS feed after build finishes.
  async buildEnd(siteConfig) {
    const outDir = siteConfig.outDir
    const xml = buildFeedXml(posts)
    await fs.promises.writeFile(path.join(outDir, 'feed.xml'), xml, 'utf-8')
    console.log(`[rss] wrote feed.xml (${posts.length} items)`)
  }
})
