<script setup lang="ts">
import { data as posts } from '../../../posts/posts.data'
import { computed } from 'vue'
import PostList from './PostList.vue'

const SITE_TAGLINE = '不定期更新的长期思考 — 工程、投资、AI。'

const featured = computed(() => posts.filter((p) => p.featured).slice(0, 5))
const latest = computed(() => {
  const pinnedUrls = new Set(featured.value.map((p) => p.url))
  return posts.filter((p) => !pinnedUrls.has(p.url)).slice(0, 12)
})

const stats = computed(() => {
  const tags = new Set<string>()
  const cats = new Set<string>()
  let totalWords = 0
  for (const p of posts) {
    p.tags.forEach((t) => tags.add(t))
    p.categories.forEach((c) => cats.add(c))
    totalWords += p.wordCount || 0
  }
  return {
    posts: posts.length,
    tags: tags.size,
    cats: cats.size,
    words: totalWords
  }
})
</script>

<template>
  <div class="blog-home">
    <header class="hero">
      <div class="wordmark">
        <h1 class="wordmark-cn">范伟彬</h1>
        <div class="wordmark-en">FANWEIBIN · fanweibin.cn</div>
      </div>
      <p class="tagline">{{ SITE_TAGLINE }}</p>
      <dl class="stats">
        <div class="stat">
          <dt>Posts</dt>
          <dd>{{ stats.posts }}</dd>
        </div>
        <div class="stat">
          <dt>Categories</dt>
          <dd>{{ stats.cats }}</dd>
        </div>
        <div class="stat">
          <dt>Tags</dt>
          <dd>{{ stats.tags }}</dd>
        </div>
        <div class="stat">
          <dt>Words</dt>
          <dd>{{ (stats.words / 10000).toFixed(1) }}<span class="unit">w</span></dd>
        </div>
      </dl>
    </header>

    <section v-if="featured.length" class="home-section featured">
      <div class="section-head">
        <div class="section-title">
          <span class="section-en">FEATURED</span>
          <h2>精选</h2>
        </div>
        <a href="/posts/" class="more">全部 →</a>
      </div>
      <ul class="featured-list">
        <li v-for="p in featured" :key="p.url" class="featured-item">
          <a :href="p.url">
            <div class="f-title">{{ p.title }}</div>
            <div v-if="p.excerpt" class="f-excerpt">{{ p.excerpt }}</div>
            <div class="f-meta">
              <time :datetime="p.date">{{ p.dateDisplay }}</time>
              <span v-if="p.readingTime">· {{ p.readingTime }} 分钟</span>
              <span v-for="c in p.categories.slice(0, 1)" :key="c" class="f-cat">· {{ c }}</span>
            </div>
          </a>
        </li>
      </ul>
    </section>

    <section class="home-section">
      <div class="section-head">
        <div class="section-title">
          <span class="section-en">LATEST</span>
          <h2>最新</h2>
        </div>
        <a href="/posts/" class="more">全部 →</a>
      </div>
      <PostList :posts="latest" />
    </section>
  </div>
</template>

<style scoped>
.blog-home {
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 24px 80px;
}

/* ---------- Hero: wordmark 刊物风 ---------- */
.hero {
  text-align: left;
  padding: 56px 0 40px;
  border-bottom: 1px solid var(--vp-c-divider);
  margin-bottom: 48px;
}
.wordmark {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}
.wordmark-cn {
  font-size: clamp(56px, 9vw, 96px);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  margin: 0;
  padding: 0;
  border: 0;
  background: linear-gradient(120deg, var(--vp-c-brand-1) 0%, var(--vp-c-brand-3) 60%, #8b5cf6 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}
.wordmark-en {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 13px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}
.tagline {
  color: var(--vp-c-text-2);
  font-size: 16px;
  line-height: 1.6;
  margin: 0 0 32px;
  max-width: 44ch;
}

/* ---------- Stats: 左对齐大数字 + small caps 英文标签 ---------- */
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 36px 48px;
  margin: 0;
  padding: 20px 0 0;
  border-top: 1px dashed var(--vp-c-divider);
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
}
.stat dt {
  order: 2;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
  margin: 0;
  font-weight: 500;
}
.stat dd {
  order: 1;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 34px;
  font-weight: 700;
  line-height: 1;
  color: var(--vp-c-text-1);
  font-variant-numeric: tabular-nums;
  margin: 0;
}
.stat dd .unit {
  font-size: 16px;
  color: var(--vp-c-text-3);
  margin-left: 2px;
  font-weight: 500;
}

/* ---------- Section head: 类刊物报头 ---------- */
.home-section {
  margin-bottom: 56px;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--vp-c-divider);
}
.section-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.section-en {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
  font-weight: 600;
}
.section-head h2 {
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--vp-c-text-1);
}
.more {
  font-size: 13px;
  color: var(--vp-c-text-3);
  text-decoration: none;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
}
.more:hover {
  color: var(--vp-c-brand-1);
}

/* ---------- Featured list ---------- */
.featured-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 12px;
}
.featured-item a {
  display: block;
  padding: 14px 18px;
  border-radius: 10px;
  border: 1px solid var(--vp-c-divider);
  text-decoration: none;
  color: inherit;
  transition: border-color .2s, transform .1s;
  background: var(--vp-c-bg-soft);
}
.featured-item a:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-1px);
}
.f-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin-bottom: 4px;
}
.f-excerpt {
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.55;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.f-meta {
  color: var(--vp-c-text-3);
  font-size: 12px;
  display: flex;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}

/* ---------- Responsive ---------- */
@media (max-width: 640px) {
  .blog-home {
    padding: 24px 16px 56px;
  }
  .hero {
    padding: 32px 0 28px;
    margin-bottom: 36px;
  }
  .tagline {
    font-size: 15px;
    margin-bottom: 24px;
  }
  .stats {
    gap: 24px 32px;
    padding-top: 16px;
  }
  .stat dd {
    font-size: 26px;
  }
  .stat dd .unit {
    font-size: 13px;
  }
}
</style>
