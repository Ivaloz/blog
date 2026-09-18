<script setup lang="ts">
import { computed } from 'vue'
import { withBase } from 'vitepress'

// 树洞后端地址：开发时默认指向本地 server.js，生产用 VITE_TREEHOLE_API 注入。
// 传空串则 SPA 走同域相对路径（适合后端与站点同域部署的情况）。
const apiBase = computed(() => {
  const fromEnv = import.meta.env.VITE_TREEHOLE_API as string | undefined
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return import.meta.env.DEV ? 'http://localhost:8788' : ''
})

const src = computed(() => {
  const page = withBase('/treehole/index.html')
  return apiBase.value ? `${page}?api=${encodeURIComponent(apiBase.value)}` : page
})
</script>

<template>
  <div class="treehole-stage">
    <iframe class="treehole-frame" :src="src" title="树洞广场" />
  </div>
</template>

<style scoped>
.treehole-stage {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--vp-c-bg);
}
.treehole-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
</style>