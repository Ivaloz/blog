<script setup lang="ts">
import { useData, useRoute } from 'vitepress'
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { giscus } from '../giscus.config'
import { commentCount } from '../useCommentCount'

const { isDark, frontmatter } = useData()
const route = useRoute()
const container = ref<HTMLElement | null>(null)

function loadGiscus() {
  if (!container.value) return
  if (!giscus.repo || !giscus.repoId || !giscus.categoryId) return
  if (frontmatter.value.comments === false) return
  // Clean previous
  container.value.innerHTML = ''
  const s = document.createElement('script')
  s.src = 'https://giscus.app/client.js'
  s.crossOrigin = 'anonymous'
  s.async = true
  s.setAttribute('data-repo', giscus.repo)
  s.setAttribute('data-repo-id', giscus.repoId)
  s.setAttribute('data-category', giscus.category)
  s.setAttribute('data-category-id', giscus.categoryId)
  s.setAttribute('data-mapping', 'pathname')
  s.setAttribute('data-strict', '1')
  s.setAttribute('data-reactions-enabled', '1')
  s.setAttribute('data-emit-metadata', '1')
  s.setAttribute('data-input-position', 'top')
  s.setAttribute('data-theme', isDark.value ? 'dark_dimmed' : 'light')
  s.setAttribute('data-lang', 'zh-CN')
  s.setAttribute('data-loading', 'lazy')
  container.value.appendChild(s)
}

// 监听 giscus 回传的 metadata，提取评论数
function onMessage(evt: MessageEvent) {
  if (evt.origin !== 'https://giscus.app') return
  const data = evt.data as { giscus?: { discussion?: { totalCommentCount?: number; totalReplyCount?: number } } }
  const d = data?.giscus?.discussion
  if (!d) return
  const total = (d.totalCommentCount ?? 0) + (d.totalReplyCount ?? 0)
  commentCount.value = total
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  nextTick(loadGiscus)
})
onUnmounted(() => window.removeEventListener('message', onMessage))
watch(() => route.path, () => {
  commentCount.value = null
  nextTick(loadGiscus)
})
watch(isDark, (v) => {
  const iframe = container.value?.querySelector<HTMLIFrameElement>('iframe.giscus-frame')
  if (iframe) {
    iframe.contentWindow?.postMessage(
      { giscus: { setConfig: { theme: v ? 'dark_dimmed' : 'light' } } },
      'https://giscus.app'
    )
  }
})

const enabled = Boolean(giscus.repo && giscus.repoId && giscus.categoryId)
</script>

<template>
  <div v-if="enabled && frontmatter.comments !== false" class="post-comments">
    <h2 class="comments-title">💬 评论</h2>
    <div ref="container" class="giscus-wrapper" />
  </div>
</template>

<style scoped>
.post-comments {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid var(--vp-c-divider);
}
.comments-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 16px;
}
.giscus-wrapper {
  min-height: 160px;
}
</style>
