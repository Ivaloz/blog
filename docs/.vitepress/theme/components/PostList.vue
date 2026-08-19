<script setup lang="ts">
import { data as posts } from '../../../posts/posts.data'
import { computed } from 'vue'
import { withBase } from 'vitepress'

const props = defineProps<{
  limit?: number
  tag?: string
  category?: string
  showExcerpt?: boolean
}>()

const list = computed(() => {
  let items = posts
  if (props.tag) items = items.filter((p) => p.tags.includes(props.tag!))
  if (props.category) items = items.filter((p) => p.categories.includes(props.category!))
  if (props.limit) items = items.slice(0, props.limit)
  return items
})
</script>

<template>
  <ul class="post-list">
    <li v-for="p in list" :key="p.url" class="post-item">
      <a :href="withBase(p.url)" class="post-link">
        <div class="post-title">{{ p.title }}</div>
        <div v-if="showExcerpt !== false && p.excerpt" class="post-excerpt">{{ p.excerpt }}</div>
        <div class="post-meta">
          <time :datetime="p.date">{{ p.dateDisplay }}</time>
          <span v-if="p.categories.length" class="post-cat">
            <span v-for="c in p.categories" :key="c" class="tag">{{ c }}</span>
          </span>
          <span v-if="p.tags.length" class="post-tags">
            <span v-for="t in p.tags.slice(0, 4)" :key="t" class="tag tag-soft"># {{ t }}</span>
          </span>
        </div>
      </a>
    </li>
  </ul>
</template>
