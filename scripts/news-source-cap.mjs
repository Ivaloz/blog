#!/usr/bin/env node
// 资讯来源集中度检查 —— 防止「最近一天的某一类资讯全是同一个来源(如 IT之家)」。
//
// 背景:routine 抓资讯时,易抓的二手转载站(IT之家)会形成生存者偏差 —— 难抓的
// 一手信源被筛掉,某一天整类只剩转载站。本脚本对「最近 RECENT_DAYS 个有数据的
// 日期」做硬性来源占比检查:同一 (大类, 日期) 下条目数 ≥ MIN_GROUP 时,单一来源
// 占比不得超过 MAX_SHARE。违反 → 退出码 1,供 CI / routine 提交前自检拦截。
//
// 注意:更老的归档数据被豁免(只看最近窗口),避免历史数据被迫删除;多样性只能
// 靠「多抓一手信源」获得,本脚本不会、也无法通过删条目来制造多样性。
//
// 用法:
//   node scripts/news-source-cap.mjs          # 检查最近 RECENT_DAYS 天,违规则退出 1
//   node scripts/news-source-cap.mjs --all     # 检查全部日期(审计用)
//   node scripts/news-source-cap.mjs --json     # 机器可读输出
// 退出码:0 = 通过, 1 = 有硬性违规, 2 = 读取/解析错误
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../docs/.vitepress/data/news')
const SLUGS = ['policy', 'tech', 'industry', 'trade', 'ai', 'finance']

// —— 可调阈值 ——
const RECENT_DAYS = 2 // 只硬性检查最近这么多个「有数据的日期」;更老的归档豁免
const MIN_GROUP = 3 // (大类,日期) 条目数 ≥ 此值才检查多样性(太少无法要求多源)
const MAX_SHARE = 0.6 // 单一来源在该 (大类,日期) 内占比上限

const argv = new Set(process.argv.slice(2))
const CHECK_ALL = argv.has('--all')
const AS_JSON = argv.has('--json')

function dateOf(p) {
  if (typeof p !== 'string') return null
  const m = p.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function load(slug) {
  const file = path.join(DATA_DIR, `${slug}.json`)
  const obj = JSON.parse(fs.readFileSync(file, 'utf-8'))
  const items = Array.isArray(obj.items) ? obj.items : []
  return items.map((it) => ({
    source: ((it.source || '').trim()) || '(无来源)',
    date: dateOf(it.publishedAt)
  }))
}

const all = {}
try {
  for (const slug of SLUGS) all[slug] = load(slug)
} catch (err) {
  console.error(`[news-source-cap] 读取/解析失败: ${err.message}`)
  process.exit(2)
}

// 「最近 RECENT_DAYS 个有数据的日期」= 跨所有大类的日期并集里最新的几个
const allDates = new Set()
for (const slug of SLUGS) for (const it of all[slug]) if (it.date) allDates.add(it.date)
const sortedDates = [...allDates].sort().reverse()
const windowDates = new Set(CHECK_ALL ? sortedDates : sortedDates.slice(0, RECENT_DAYS))

const report = []
const violations = []

for (const slug of SLUGS) {
  const byDate = new Map()
  for (const it of all[slug]) {
    if (!it.date || !windowDates.has(it.date)) continue
    if (!byDate.has(it.date)) byDate.set(it.date, [])
    byDate.get(it.date).push(it)
  }
  for (const date of [...byDate.keys()].sort().reverse()) {
    const group = byDate.get(date)
    const counts = new Map()
    for (const it of group) counts.set(it.source, (counts.get(it.source) || 0) + 1)
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const [topSource, topCount] = ranked[0]
    const total = group.length
    const cap = Math.ceil(MAX_SHARE * total)
    const checked = total >= MIN_GROUP
    const ok = !checked || topCount <= cap
    report.push({ slug, date, total, topSource, topCount, cap, sources: ranked.length, checked, ok })
    if (checked && !ok) {
      violations.push({ slug, date, total, topSource, topCount, cap, share: topCount / total })
    }
  }
}

// 全量来源分布(仅供参考,不影响通过与否)
const distribution = {}
for (const slug of SLUGS) {
  const counts = new Map()
  for (const it of all[slug]) counts.set(it.source, (counts.get(it.source) || 0) + 1)
  distribution[slug] = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
}

if (AS_JSON) {
  console.log(JSON.stringify({ windowDates: [...windowDates], report, violations, distribution }, null, 2))
  process.exit(violations.length > 0 ? 1 : 0)
}

const scope = CHECK_ALL
  ? '全部日期'
  : `最近 ${RECENT_DAYS} 个有数据的日期 [${[...windowDates].sort().reverse().join(', ')}]`
console.log(
  `资讯来源集中度检查 — 范围:${scope}  (规则:同一来源 ≤ ${Math.round(MAX_SHARE * 100)}%,仅当该类该日 ≥ ${MIN_GROUP} 条时生效)`
)
for (const r of report) {
  const flag = !r.checked ? '·' : r.ok ? '✓' : '✗'
  console.log(
    `  ${flag} ${r.slug}/${r.date}:共 ${r.total} 条,${r.sources} 个来源,最多「${r.topSource}」${r.topCount} 条(上限 ${r.cap})`
  )
}
console.log('\n来源分布(全量 Top3,仅供参考):')
for (const slug of SLUGS) {
  const top = distribution[slug].map(([s, n]) => `${s}×${n}`).join('  ')
  console.log(`  ${slug}: ${top || '(空)'}`)
}
if (violations.length === 0) {
  console.log('\n通过:窗口内无单一来源超过占比上限。')
} else {
  console.log(`\n发现 ${violations.length} 处来源过度集中:`)
  for (const v of violations) {
    console.log(
      `::error::${v.slug}/${v.date} 来源过度集中 —「${v.topSource}」${v.topCount}/${v.total} 条(${Math.round(
        v.share * 100
      )}%),超过 ${Math.round(MAX_SHARE * 100)}% 上限。需回溯一手信源或补充其它来源。`
    )
  }
}
process.exit(violations.length > 0 ? 1 : 0)
