<script setup lang="ts">
import { data as posts } from '../../../posts/posts.data'
import { computed } from 'vue'
import { withBase } from 'vitepress'

type Group = { name: string; count: number; recent: typeof posts }

const groups = computed<Group[]>(() => {
  const m = new Map<string, typeof posts>()
  for (const p of posts) {
    for (const c of p.categories) {
      if (!m.has(c)) m.set(c, [])
      m.get(c)!.push(p)
    }
  }
  return [...m.entries()]
    .map(([name, list]) => ({
      name,
      count: list.length,
      recent: list.slice(0, 3)
    }))
    .sort((a, b) => b.count - a.count)
})

function slugify(s: string) {
  return encodeURIComponent(s)
}
</script>

<template>
  <div class="categories-page">
    <p class="archive-summary">共 {{ groups.length }} 个分类 · {{ posts.length }} 篇文章</p>

    <div class="category-grid">
      <section v-for="g in groups" :key="g.name" class="category-card">
        <header class="cc-header">
          <h2 :id="slugify(g.name)" class="cc-name">{{ g.name }}</h2>
          <span class="cc-count">{{ g.count }} 篇</span>
        </header>
        <ul class="cc-list">
          <li v-for="p in g.recent" :key="p.url">
            <a :href="withBase(p.url)">
              <time :datetime="p.date" class="cc-date">{{ p.dateDisplay }}</time>
              <span class="cc-title">{{ p.title }}</span>
            </a>
          </li>
        </ul>
      </section>
    </div>

    <section v-for="g in groups" :key="'all-' + g.name" class="tag-section">
      <h2 :id="'all-' + slugify(g.name)">
        # {{ g.name }}
        <span class="year-count">· {{ g.count }} 篇</span>
      </h2>
      <ul class="archive-list">
        <li v-for="p in posts.filter((x) => x.categories.includes(g.name))" :key="p.url">
          <time :datetime="p.date">{{ p.dateDisplay }}</time>
          <a :href="withBase(p.url)">{{ p.title }}</a>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin: 24px 0 48px;
}
.category-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 18px 20px;
  transition: border-color .2s, transform .2s;
  background: var(--vp-c-bg-soft);
}
.category-card:hover {
  border-color: var(--vp-c-brand-1);
}
.cc-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--vp-c-divider);
}
.cc-name {
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  font-size: 17px;
}
.cc-count {
  font-size: 12px;
  color: var(--vp-c-text-3);
}
.cc-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.cc-list li a {
  display: flex;
  gap: 10px;
  padding: 4px 0;
  text-decoration: none;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.5;
}
.cc-list li a:hover {
  color: var(--vp-c-brand-1);
}
.cc-date {
  flex-shrink: 0;
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
}
.cc-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
