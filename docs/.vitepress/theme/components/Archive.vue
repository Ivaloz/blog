<script setup lang="ts">
import { data as posts } from '../../../posts/posts.data'
import { computed } from 'vue'
import { withBase } from 'vitepress'

const groups = computed(() => {
  const m = new Map<string, typeof posts>()
  for (const p of posts) {
    const y = (p.date || '').slice(0, 4) || '未分类'
    if (!m.has(y)) m.set(y, [])
    m.get(y)!.push(p)
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
})
</script>

<template>
  <div class="archive">
    <p class="archive-summary">共 {{ posts.length }} 篇文章</p>
    <section v-for="[year, list] in groups" :key="year" class="archive-year">
      <h2>{{ year }} <span class="year-count">· {{ list.length }} 篇</span></h2>
      <ul class="archive-list">
        <li v-for="p in list" :key="p.url">
          <time :datetime="p.date">{{ p.date ? p.date.slice(5) : '' }}</time>
          <a :href="withBase(p.url)">{{ p.title }}</a>
        </li>
      </ul>
    </section>
  </div>
</template>
