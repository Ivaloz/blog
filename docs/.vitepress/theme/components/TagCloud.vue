<script setup lang="ts">
import { data as posts } from '../../../posts/posts.data'
import { computed } from 'vue'
import { withBase } from 'vitepress'

const grouped = computed(() => {
  const m = new Map<string, typeof posts>()
  for (const p of posts) {
    for (const t of p.tags) {
      if (!m.has(t)) m.set(t, [])
      m.get(t)!.push(p)
    }
  }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
})
</script>

<template>
  <div class="tags-page">
    <p class="archive-summary">共 {{ grouped.length }} 个标签</p>
    <div class="tag-cloud big">
      <a v-for="[t, list] in grouped" :key="t" :href="`#${encodeURIComponent(t)}`" class="tag-chip">
        {{ t }} <span class="count">{{ list.length }}</span>
      </a>
    </div>
    <section v-for="[t, list] in grouped" :key="t" class="tag-section">
      <h2 :id="t">#{{ t }} <span class="year-count">· {{ list.length }} 篇</span></h2>
      <ul class="archive-list">
        <li v-for="p in list" :key="p.url">
          <time :datetime="p.date">{{ p.dateDisplay }}</time>
          <a :href="withBase(p.url)">{{ p.title }}</a>
        </li>
      </ul>
    </section>
  </div>
</template>
