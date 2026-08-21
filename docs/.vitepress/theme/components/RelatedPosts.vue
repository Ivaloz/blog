<script setup lang="ts">
import { useData } from 'vitepress'
import { computed } from 'vue'
import { withBase } from 'vitepress'
import { data as allPosts } from '../../../posts/posts.data'

const props = defineProps<{ limit?: number }>()
const limit = props.limit ?? 5

const { page, frontmatter } = useData()

const current = computed(() => {
  const url = (page.value.relativePath || '').replace(/\.md$/, '').replace(/^/, '/')
  return allPosts.find((p) => p.url === url)
})

const related = computed(() => {
  const cur = current.value
  const fmTags: string[] = Array.isArray(frontmatter.value.tags)
    ? (frontmatter.value.tags as string[]).map((s) => String(s).trim())
    : []
  const fmCats: string[] = Array.isArray(frontmatter.value.categories)
    ? (frontmatter.value.categories as string[]).map((s) => String(s).trim())
    : []
  const tags = new Set(cur?.tags ?? fmTags)
  const cats = new Set(cur?.categories ?? fmCats)
  const curUrl = cur?.url

  return allPosts
    .filter((p) => p.url !== curUrl)
    .map((p) => {
      let score = 0
      for (const t of p.tags) if (tags.has(t)) score += 2
      for (const c of p.categories) if (cats.has(c)) score += 3
      return { post: p, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.post.date < b.post.date ? 1 : -1))
    .slice(0, limit)
    .map((x) => x.post)
})
</script>

<template>
  <section v-if="related.length" class="related-posts">
    <h2 class="rp-title">📚 相关文章</h2>
    <ul class="rp-list">
      <li v-for="p in related" :key="p.url">
        <a :href="withBase(p.url)" class="rp-link">
          <span class="rp-date">{{ p.dateDisplay }}</span>
          <span class="rp-name">{{ p.title }}</span>
          <span v-if="p.readingTime" class="rp-read">· {{ p.readingTime }} 分钟</span>
        </a>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.related-posts {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid var(--vp-c-divider);
}
.rp-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 16px;
}
.rp-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.rp-list li {
  padding: 6px 0;
}
.rp-link {
  display: flex;
  gap: 12px;
  align-items: baseline;
  text-decoration: none;
  color: var(--vp-c-text-1);
  transition: color .2s;
}
.rp-link:hover .rp-name {
  color: var(--vp-c-brand-1);
}
.rp-date, .rp-read {
  color: var(--vp-c-text-3);
  font-size: 13px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.rp-name {
  flex: 1;
  font-size: 15px;
}
</style>
