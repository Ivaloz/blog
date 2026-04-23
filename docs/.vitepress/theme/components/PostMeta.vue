<script setup lang="ts">
import { useData } from 'vitepress'
import { computed } from 'vue'
import { data as allPosts } from '../../../posts/posts.data'
import { commentCount } from '../useCommentCount'

const { frontmatter, page } = useData()

const isoDate = computed(() => {
  const d: unknown = frontmatter.value.date
  if (!d) return ''
  if (d instanceof Date) return d.toISOString().slice(0, 10)
  if (typeof d === 'string') return d.slice(0, 10)
  return ''
})

const dateDisplay = computed(() => {
  if (!isoDate.value) return ''
  const dt = new Date(isoDate.value + 'T00:00:00Z')
  if (isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
  })
})

// 从 posts.data 里取同篇文章的阅读时间 / 字数
const matched = computed(() => {
  const rp = (page.value.relativePath || '').replace(/\.md$/, '')
  return allPosts.find((p) => p.url.endsWith('/' + rp.replace(/^posts\//, '')) || p.url === '/' + rp)
})
const readingTime = computed(() => matched.value?.readingTime ?? 0)
const wordCount = computed(() => matched.value?.wordCount ?? 0)

// 文章超过 24 个月视为"时效性待验证"
const monthsOld = computed(() => {
  if (!isoDate.value) return 0
  const now = new Date()
  const pub = new Date(isoDate.value + 'T00:00:00Z')
  return (now.getTime() - pub.getTime()) / (1000 * 60 * 60 * 24 * 30)
})
const isStale = computed(() => monthsOld.value > 24 && frontmatter.value.evergreen !== true)
const staleYears = computed(() => Math.floor(monthsOld.value / 12))

const tags = computed<string[]>(() =>
  Array.isArray(frontmatter.value.tags) ? frontmatter.value.tags : []
)
const categories = computed<string[]>(() =>
  Array.isArray(frontmatter.value.categories) ? frontmatter.value.categories : []
)
</script>

<template>
  <div v-if="dateDisplay || tags.length || categories.length" class="post-meta-line">
    <time v-if="dateDisplay" :datetime="isoDate">📅 {{ dateDisplay }}</time>
    <span v-if="readingTime" class="meta-chip">⏱ {{ readingTime }} 分钟阅读</span>
    <span v-if="wordCount" class="meta-chip">✍️ {{ wordCount.toLocaleString() }} 字</span>
    <span class="meta-chip" title="本页浏览数">👁 <span id="vercount_value_page_pv">...</span></span>
    <span v-if="commentCount !== null" class="meta-chip" title="评论数">💬 {{ commentCount }}</span>
    <span v-if="categories.length" class="post-cat">
      <span v-for="c in categories" :key="c" class="tag">{{ c }}</span>
    </span>
    <span v-if="tags.length" class="post-tags">
      <span v-for="t in tags" :key="t" class="tag tag-soft"># {{ t }}</span>
    </span>
  </div>

  <div v-if="isStale" class="stale-warning custom-block warning">
    <p class="custom-block-title">⚠️ 内容时效性提示</p>
    <p>本文发布于 {{ staleYears }} 年前，其中涉及的命令、API、版本号可能已过时。若用于生产环境，请先交叉验证官方最新文档。</p>
  </div>
</template>

<style scoped>
.meta-chip {
  color: var(--vp-c-text-2);
  font-size: 13px;
}
.stale-warning {
  margin: 16px 0 24px;
}
</style>
