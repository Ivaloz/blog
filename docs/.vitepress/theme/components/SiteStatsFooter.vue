<script setup lang="ts">
import { useRoute } from 'vitepress'
import { onMounted, onUnmounted, nextTick, watch } from 'vue'

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

// 预估基线：自 2018-01-01 起按日均 ~30 次访问累加，叠加 Vercount 的真实 PV 展示。
// 例：~3000 天 × 30 ≈ 90,000，随时间自然增长，不会固定。
const ESTIMATE_START = '2018-01-01'
const ESTIMATE_DAILY = 30

function estimateBaseline(): number {
  const startMs = new Date(ESTIMATE_START + 'T00:00:00Z').getTime()
  const days = Math.max(0, Math.floor((Date.now() - startMs) / 86400000))
  return days * ESTIMATE_DAILY
}

// Vercount 把真实值写入隐藏的 #vercount_value_site_pv，我们用 MutationObserver 监听它的
// 文本变化，叠加 baseline 后写入可见的 #site-pv-display。
let pvObserver: MutationObserver | null = null
function wireSitePv() {
  const tracker = document.getElementById('vercount_value_site_pv')
  const display = document.getElementById('site-pv-display')
  if (!tracker || !display) return
  const base = estimateBaseline()
  const render = () => {
    const real = parseInt((tracker.textContent || '0').replace(/[^\d]/g, ''), 10) || 0
    display.textContent = (real + base).toLocaleString('zh-CN')
  }
  render()
  pvObserver?.disconnect()
  pvObserver = new MutationObserver(render)
  pvObserver.observe(tracker, { childList: true, characterData: true, subtree: true })
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
onMounted(() => nextTick(() => { fillRuntime(); wireSitePv(); refreshVercount() }))
watch(() => route.path, () => nextTick(() => { fillRuntime(); wireSitePv(); refreshVercount() }))
onUnmounted(() => pvObserver?.disconnect())
</script>

<template><span class="site-stats-footer-hook" aria-hidden="true" /></template>
