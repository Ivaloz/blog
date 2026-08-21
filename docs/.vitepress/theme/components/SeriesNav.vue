<script setup lang="ts">
import { useData } from 'vitepress'
import { computed } from 'vue'
import { withBase } from 'vitepress'
import { data as allPosts } from '../../../posts/posts.data'

const { frontmatter, page } = useData()

const seriesName = computed<string>(() => String(frontmatter.value.series || ''))

const seriesPosts = computed(() => {
  if (!seriesName.value) return []
  return allPosts
    .filter((p) => p.series === seriesName.value)
    .sort((a, b) => {
      const ai = a.seriesIndex ?? 9999
      const bi = b.seriesIndex ?? 9999
      if (ai !== bi) return ai - bi
      return a.date < b.date ? -1 : 1
    })
})

const currentIndex = computed(() => {
  const rp = (page.value.relativePath || '').replace(/\.md$/, '')
  return seriesPosts.value.findIndex(
    (p) => p.url.endsWith('/' + rp.replace(/^posts\//, '')) || p.url === '/' + rp
  )
})

const prev = computed(() =>
  currentIndex.value > 0 ? seriesPosts.value[currentIndex.value - 1] : null
)
const next = computed(() =>
  currentIndex.value >= 0 && currentIndex.value < seriesPosts.value.length - 1
    ? seriesPosts.value[currentIndex.value + 1]
    : null
)
</script>

<template>
  <aside v-if="seriesName && seriesPosts.length > 1" class="series-nav custom-block info">
    <p class="custom-block-title">📖 本文属于系列：{{ seriesName }}（共 {{ seriesPosts.length }} 篇）</p>
    <ol class="series-list">
      <li v-for="(p, i) in seriesPosts" :key="p.url" :class="{ current: i === currentIndex }">
        <template v-if="i === currentIndex">
          <strong>{{ p.title }}</strong>
        </template>
        <template v-else>
          <a :href="withBase(p.url)">{{ p.title }}</a>
        </template>
      </li>
    </ol>
    <div v-if="prev || next" class="series-adj">
      <a v-if="prev" :href="withBase(prev.url)" class="adj prev">← {{ prev.title }}</a>
      <span v-else></span>
      <a v-if="next" :href="withBase(next.url)" class="adj next">{{ next.title }} →</a>
    </div>
  </aside>
</template>

<style scoped>
.series-nav {
  margin: 20px 0 24px;
}
.series-list {
  margin: 8px 0 0;
  padding-left: 24px;
}
.series-list li {
  margin: 4px 0;
}
.series-list li.current {
  color: var(--vp-c-brand-1);
}
.series-adj {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--vp-c-divider);
  font-size: 13px;
  gap: 12px;
}
.adj {
  text-decoration: none;
  color: var(--vp-c-text-2);
}
.adj:hover {
  color: var(--vp-c-brand-1);
}
.adj.prev {
  text-align: left;
}
.adj.next {
  text-align: right;
  margin-left: auto;
}
</style>
