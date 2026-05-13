<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { data as news, type NewsItem } from '../../../news/news.data'

const props = defineProps<{
  slug: string
}>()

const category = computed(() => news.bySlug[props.slug])

// 各 slug 的平台 / 来源过滤器(可扩展)。
// 一个过滤器 = 一个 chip,匹配规则作用于 NewsItem.source。
// '其他' 是兜底:命中"非任何已知平台"的条目。
type PlatformFilter = { label: string; test: (source: string) => boolean }
const PLATFORM_FILTERS: Record<string, PlatformFilter[]> = {
  trade: [
    { label: 'Amazon',     test: (s) => /amazon|亚马逊/i.test(s) },
    { label: 'TikTok Shop',test: (s) => /tiktok/i.test(s) },
    { label: '阿里国际站', test: (s) => /阿里巴巴国际站|alibaba|aliexpress|速卖通|okki/i.test(s) },
    { label: 'Shopify',    test: (s) => /shopify/i.test(s) },
    { label: 'Temu',       test: (s) => /temu/i.test(s) },
    { label: 'Shein',      test: (s) => /shein/i.test(s) },
    { label: 'eBay',       test: (s) => /ebay/i.test(s) },
    { label: 'Walmart',    test: (s) => /walmart/i.test(s) },
    { label: 'Shopee',     test: (s) => /shopee/i.test(s) },
    { label: 'Lazada',     test: (s) => /lazada/i.test(s) },
    { label: '海关/政府',  test: (s) => /海关|商务部|外汇局|出口信保|customs|cbp|ustr|ccpit|mofcom/i.test(s) },
    { label: '其他',       test: () => false }
  ]
}

const platformFilters = computed(() => PLATFORM_FILTERS[props.slug] || [])
const hasPlatformFilters = computed(() => platformFilters.value.length > 0)
const selected = ref<Set<string>>(new Set())

watch(() => props.slug, () => { selected.value = new Set() })

function matchesFilter(source: string, label: string): boolean {
  if (label === '其他') {
    return !platformFilters.value
      .filter((f) => f.label !== '其他')
      .some((f) => f.test(source))
  }
  const f = platformFilters.value.find((x) => x.label === label)
  return f ? f.test(source) : false
}

function toggle(label: string) {
  const next = new Set(selected.value)
  if (next.has(label)) next.delete(label)
  else next.add(label)
  selected.value = next
}

function clear() {
  selected.value = new Set()
}

const filterCounts = computed(() => {
  const cat = category.value
  const result: Record<string, number> = {}
  if (!cat) return result
  for (const f of platformFilters.value) {
    let count = 0
    for (const item of cat.items) {
      if (matchesFilter(item.source || '', f.label)) count++
    }
    result[f.label] = count
  }
  return result
})

const filteredItems = computed(() => {
  const cat = category.value
  if (!cat) return []
  if (selected.value.size === 0) return cat.items
  return cat.items.filter((item) => {
    const src = item.source || ''
    for (const label of selected.value) {
      if (matchesFilter(src, label)) return true
    }
    return false
  })
})

const groups = computed(() => {
  if (!category.value) return []
  const map = new Map<string, NewsItem[]>()
  for (const item of filteredItems.value) {
    const key = (item.subCategory && item.subCategory.trim()) || '其他'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  return [...map.entries()]
    .map(([name, items]) => ({ name, items }))
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name, 'zh-CN'))
})

const totalCount = computed(() => category.value?.items.length || 0)
const filteredCount = computed(() => filteredItems.value.length)

const updatedDisplay = computed(() => {
  const u = category.value?.updatedAt
  if (!u) return ''
  const d = new Date(u)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  })
})

function dateDisplay(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function hasTimeComponent(iso?: string): boolean {
  return !!iso && /T\d{2}:\d{2}/.test(iso)
}

function timeDisplay(iso?: string) {
  if (!hasTimeComponent(iso)) return ''
  const d = new Date(iso!)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return ''
  }
}
</script>

<template>
  <div class="news-feed">
    <header v-if="category" class="nf-header">
      <div class="nf-title-row">
        <h1 class="nf-title">{{ category.title }}</h1>
        <span class="nf-count">{{ totalCount }} 条</span>
      </div>
      <p v-if="category.description" class="nf-desc">{{ category.description }}</p>
      <p v-if="updatedDisplay" class="nf-updated">
        <span class="nf-updated-label">最近更新</span>
        <time>{{ updatedDisplay }}</time>
      </p>
    </header>

    <p v-else class="nf-empty">未找到 <code>{{ slug }}</code> 类别的数据,等待 routines 写入。</p>

    <div v-if="category && hasPlatformFilters" class="nf-filters">
      <span class="nf-filters-label">平台筛选</span>
      <button
        v-for="f in platformFilters"
        :key="f.label"
        type="button"
        :class="['nf-filter-chip', { 'is-active': selected.has(f.label), 'is-empty': !filterCounts[f.label] }]"
        :disabled="!filterCounts[f.label] && !selected.has(f.label)"
        :aria-pressed="selected.has(f.label)"
        @click="toggle(f.label)"
      >
        {{ f.label }}
        <span class="nf-filter-count">{{ filterCounts[f.label] || 0 }}</span>
      </button>
      <span v-if="selected.size" class="nf-filters-summary">
        命中 {{ filteredCount }} / {{ totalCount }}
      </span>
      <button v-if="selected.size" type="button" class="nf-filter-clear" @click="clear">
        清空 ×
      </button>
    </div>

    <p v-if="category && hasPlatformFilters && selected.size && !filteredCount" class="nf-empty">
      所选平台下暂无条目。<button type="button" class="nf-filter-clear inline" @click="clear">清空筛选</button>
    </p>

    <section v-for="g in groups" :key="g.name" class="nf-group">
      <header class="nf-group-head">
        <h2 class="nf-group-name">{{ g.name }}</h2>
        <span class="nf-group-count">{{ g.items.length }}</span>
      </header>
      <ul class="nf-list">
        <li v-for="item in g.items" :key="item.id || item.url" class="nf-card">
          <a :href="item.url" target="_blank" rel="noopener" class="nf-card-link">
            <div class="nf-card-title">{{ item.title }}</div>
            <p v-if="item.summary" class="nf-card-summary">{{ item.summary }}</p>
            <div class="nf-card-meta">
              <time v-if="item.publishedAt" :datetime="item.publishedAt" class="nf-meta-time">
                {{ dateDisplay(item.publishedAt) }}
                <span v-if="hasTimeComponent(item.publishedAt)" class="nf-meta-hour">{{ timeDisplay(item.publishedAt) }}</span>
              </time>
              <span v-if="item.source" class="nf-meta-source">{{ item.source }}</span>
              <span v-else-if="hostOf(item.url)" class="nf-meta-source">{{ hostOf(item.url) }}</span>
              <span v-if="item.subCategory" class="nf-meta-sub">#{{ item.subCategory }}</span>
            </div>
          </a>
        </li>
      </ul>
    </section>

    <p v-if="category && !groups.length" class="nf-empty">暂无条目。</p>
  </div>
</template>

<style scoped>
.news-feed {
  max-width: 920px;
  margin: 0 auto;
  padding: 8px 0 64px;
}

/* ---------- Header ---------- */
.nf-header {
  padding-bottom: 18px;
  margin-bottom: 28px;
  border-bottom: 1px solid var(--vp-c-divider);
}
.nf-title-row {
  display: flex;
  align-items: baseline;
  gap: 14px;
  margin-bottom: 6px;
}
.nf-title {
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--vp-c-text-1);
}
.nf-count {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--vp-c-text-3);
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
}
.nf-desc {
  margin: 4px 0 8px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.65;
}
.nf-updated {
  margin: 0;
  font-size: 12px;
  color: var(--vp-c-text-3);
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
}
.nf-updated-label {
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-right: 8px;
}
.nf-empty {
  color: var(--vp-c-text-3);
  font-size: 14px;
  padding: 24px 0;
}
.nf-empty code {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
  font-size: 12px;
}

/* ---------- Filters (platform chips) ---------- */
.nf-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 24px;
  padding: 12px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}
.nf-filters-label {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
  margin-right: 4px;
}
.nf-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 14px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  transition: all .15s;
  font-family: inherit;
}
.nf-filter-chip:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
.nf-filter-chip.is-active {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: #fff;
}
.nf-filter-chip.is-active .nf-filter-count {
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
}
.nf-filter-chip.is-empty {
  opacity: 0.4;
  cursor: not-allowed;
}
.nf-filter-count {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-3);
  line-height: 1.4;
}
.nf-filter-clear {
  padding: 4px 10px;
  border-radius: 14px;
  border: 1px dashed var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-3);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.nf-filter-clear:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}
.nf-filter-clear.inline {
  margin-left: 8px;
  vertical-align: baseline;
}
.nf-filters-summary {
  margin-left: auto;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--vp-c-text-3);
}

/* ---------- Group ---------- */
.nf-group {
  margin-bottom: 40px;
}
.nf-group-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 14px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--vp-c-divider);
}
.nf-group-name {
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  font-size: 16px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
}
.nf-group-count {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--vp-c-text-3);
}

/* ---------- Cards ---------- */
.nf-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 10px;
}
.nf-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
  transition: border-color .2s, transform .1s, box-shadow .2s;
}
.nf-card:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px -8px var(--vp-c-brand-soft);
}
.nf-card-link {
  display: block;
  padding: 14px 18px;
  text-decoration: none !important;
  color: inherit !important;
}
.nf-card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  line-height: 1.45;
  margin-bottom: 6px;
}
.nf-card:hover .nf-card-title {
  color: var(--vp-c-brand-1);
}
.nf-card-summary {
  margin: 0 0 8px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.nf-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  font-size: 12px;
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
}
.nf-meta-time {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
}
.nf-meta-hour {
  margin-left: 4px;
  color: var(--vp-c-text-3);
  opacity: 0.7;
}
.nf-meta-source {
  color: var(--vp-c-text-2);
}
.nf-meta-source::before {
  content: '· ';
  margin-right: 2px;
  color: var(--vp-c-text-3);
}
.nf-meta-sub {
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 4px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-size: 11px;
}

/* ---------- Responsive ---------- */
@media (max-width: 640px) {
  .nf-title {
    font-size: 24px;
  }
  .nf-card-link {
    padding: 12px 14px;
  }
  .nf-meta-sub {
    margin-left: 0;
  }
}
</style>
