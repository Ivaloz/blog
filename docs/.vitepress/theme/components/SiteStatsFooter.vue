<script setup lang="ts">
import { useRoute } from 'vitepress'
import { onMounted, nextTick, watch } from 'vue'

// 把"已运行 N"的 span 填成"N 年 M 天"或"N 天"
function fillRuntime() {
  const el = document.getElementById('site-runtime-days')
  if (!el) return
  const start = el.dataset.start
  if (!start) return
  const startMs = new Date(start + 'T00:00:00Z').getTime()
  if (isNaN(startMs)) return
  const days = Math.max(0, Math.floor((Date.now() - startMs) / 86400000))
  el.textContent = days >= 365
    ? `${Math.floor(days / 365)} 年 ${days % 365} 天`
    : `${days} 天`
}

// Vercount 是 IIFE，且 VitePress 走 SPA 路由；每次路由切换重新注入脚本，
// 让它读到当前 URL 并回填 #vercount_value_site_pv / #vercount_value_page_pv。
function refreshVercount() {
  const s = document.createElement('script')
  s.src = 'https://cn.vercount.one/js?_=' + Date.now()
  s.defer = true
  document.head.appendChild(s)
}

const route = useRoute()
onMounted(() => nextTick(() => { fillRuntime(); refreshVercount() }))
watch(() => route.path, () => nextTick(() => { fillRuntime(); refreshVercount() }))
</script>

<template><span class="site-stats-footer-hook" aria-hidden="true" /></template>
