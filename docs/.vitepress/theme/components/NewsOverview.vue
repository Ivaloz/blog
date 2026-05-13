<script setup lang="ts">
import { computed } from 'vue'
import { data as news } from '../../../news/news.data'

const categories = computed(() => news.categories)

const latest = computed(() => news.latest.slice(0, 12))

const totalItems = computed(() =>
  news.categories.reduce((acc, c) => acc + c.items.length, 0)
)

const newestUpdate = computed(() => {
  const all = news.categories.map((c) => c.updatedAt || '').filter(Boolean)
  if (!all.length) return ''
  const max = all.sort().slice(-1)[0]
  const d = new Date(max)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  })
})

function categoryHref(slug: string) {
  return `/news/${slug}`
}

function dateDisplay(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function timeDisplay(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}
</script>

<template>
  <div class="news-overview">
    <header class="no-header">
      <div class="no-title-row">
        <h1 class="no-title">信息与资讯</h1>
        <span class="no-count">{{ totalItems }} 条</span>
      </div>
      <p class="no-desc">每日由 routines 自动抓取的多源资讯,按主题与子分类归档。</p>
      <p v-if="newestUpdate" class="no-updated">
        <span class="no-updated-label">最近更新</span>
        <time>{{ newestUpdate }}</time>
      </p>
    </header>

    <section class="no-cats">
      <a v-for="c in categories" :key="c.slug" :href="categoryHref(c.slug)" class="no-cat">
        <div class="no-cat-head">
          <h3 class="no-cat-name">{{ c.title }}</h3>
          <span class="no-cat-count">{{ c.items.length }}</span>
        </div>
        <p v-if="c.description" class="no-cat-desc">{{ c.description }}</p>
        <ul v-if="c.items.length" class="no-cat-recent">
          <li v-for="it in c.items.slice(0, 3)" :key="it.id || it.url" class="no-cat-recent-item">
            <span class="no-cat-recent-title">{{ it.title }}</span>
          </li>
        </ul>
        <span class="no-cat-more">查看全部 →</span>
      </a>
    </section>

    <section v-if="latest.length" class="no-latest">
      <div class="no-section-head">
        <div class="no-section-title">
          <span class="no-section-en">LATEST</span>
          <h2>最新动态</h2>
        </div>
      </div>
      <ul class="no-latest-list">
        <li v-for="item in latest" :key="item.id || item.url" class="no-latest-item">
          <a :href="item.url" target="_blank" rel="noopener">
            <div class="no-latest-title">{{ item.title }}</div>
            <div class="no-latest-meta">
              <time v-if="item.publishedAt" :datetime="item.publishedAt">
                {{ dateDisplay(item.publishedAt) }}
                <span class="no-latest-hour">{{ timeDisplay(item.publishedAt) }}</span>
              </time>
              <span v-if="item.source" class="no-latest-source">{{ item.source }}</span>
              <a :href="categoryHref(item.categorySlug)" class="no-latest-cat" @click.stop>
                {{ item.categoryTitle }}
              </a>
              <span v-if="item.subCategory" class="no-latest-sub">#{{ item.subCategory }}</span>
            </div>
          </a>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.news-overview {
  max-width: 960px;
  margin: 0 auto;
  padding: 8px 0 64px;
}

/* ---------- Header ---------- */
.no-header {
  padding-bottom: 20px;
  margin-bottom: 32px;
  border-bottom: 1px solid var(--vp-c-divider);
}
.no-title-row {
  display: flex;
  align-items: baseline;
  gap: 14px;
  margin-bottom: 6px;
}
.no-title {
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.no-count {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--vp-c-text-3);
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
}
.no-desc {
  margin: 4px 0 8px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.65;
}
.no-updated {
  margin: 0;
  font-size: 12px;
  color: var(--vp-c-text-3);
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
}
.no-updated-label {
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-right: 8px;
}

/* ---------- Category cards ---------- */
.no-cats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
  margin-bottom: 48px;
}
.no-cat {
  display: flex;
  flex-direction: column;
  padding: 18px 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  text-decoration: none !important;
  color: inherit !important;
  transition: border-color .2s, transform .1s, box-shadow .2s;
}
.no-cat:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-2px);
  box-shadow: 0 6px 24px -10px var(--vp-c-brand-soft);
}
.no-cat-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--vp-c-divider);
}
.no-cat-name {
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  font-size: 17px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.no-cat:hover .no-cat-name {
  color: var(--vp-c-brand-1);
}
.no-cat-count {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--vp-c-text-3);
}
.no-cat-desc {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--vp-c-text-3);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.no-cat-recent {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
}
.no-cat-recent-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 0;
  overflow: hidden;
}
.no-cat-recent-item::before {
  content: '·';
  flex: 0 0 auto;
  color: var(--vp-c-text-3);
  line-height: 1.5;
}
.no-cat-recent-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.no-cat-more {
  margin-top: auto;
  font-size: 12px;
  color: var(--vp-c-brand-1);
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
}

/* ---------- Latest section ---------- */
.no-section-head {
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--vp-c-divider);
}
.no-section-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.no-section-en {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
  font-weight: 600;
}
.no-section-head h2 {
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  font-size: 20px;
  font-weight: 700;
}
.no-latest-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 4px;
}
.no-latest-item a {
  display: block;
  padding: 12px 14px;
  border-radius: 8px;
  text-decoration: none !important;
  color: inherit !important;
  transition: background .15s;
}
.no-latest-item a:hover {
  background: var(--vp-c-bg-soft);
}
.no-latest-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-1);
  line-height: 1.5;
  margin-bottom: 4px;
}
.no-latest-item a:hover .no-latest-title {
  color: var(--vp-c-brand-1);
}
.no-latest-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  font-size: 12px;
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
}
.no-latest-meta time {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
}
.no-latest-hour {
  margin-left: 4px;
  opacity: 0.7;
}
.no-latest-source {
  color: var(--vp-c-text-2);
}
.no-latest-source::before {
  content: '· ';
  color: var(--vp-c-text-3);
}
.no-latest-cat {
  padding: 1px 8px;
  border-radius: 4px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1) !important;
  font-size: 11px;
  text-decoration: none !important;
}
.no-latest-cat:hover {
  filter: brightness(1.1);
}
.no-latest-sub {
  margin-left: auto;
  font-size: 11px;
  color: var(--vp-c-text-3);
}

/* ---------- Responsive ---------- */
@media (max-width: 640px) {
  .no-title {
    font-size: 26px;
  }
  .no-cats {
    grid-template-columns: 1fr;
  }
  .no-latest-sub {
    margin-left: 0;
  }
}
</style>
