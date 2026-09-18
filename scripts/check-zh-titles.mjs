#!/usr/bin/env node
// 资讯标题中文化检查 —— 防止英文原文标题直接进入 title 字段。
//
// 背景:本站是中文平台(见 scripts/routine-news-feed.md 的「中文成品检查」)。早期字段
// 规约把 title 描述成「原文标题」,「标题校验」一节也明确承认「英文标题」是合法类别,
// 结果英文来源的条目长期直接抄录英文标题 —— 2026-09-18 审计发现 436 条里有 43 条
// (10%)是纯英文标题,policy 类占 16 条。那条描述已于同日修正。
//
// 规则:每条 title 必须含至少一个汉字。专有名词、英文缩写、数字混排在中文句子里属
// 正常(如「三星与 Mistral AI 达成战略合作」),但整句英文 = 翻译未完成 → 违规。
//
// 用法:
//   node scripts/check-zh-titles.mjs           # 列出违规条目,有违规则退出 1
//   node scripts/check-zh-titles.mjs --json    # 机器可读输出
//   node scripts/check-zh-titles.mjs --quiet   # 只打印汇总
// 退出码:0 = 全部含中文, 1 = 存在不含中文的标题, 2 = 读取/解析错误
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../docs/.vitepress/data/news')
const SLUGS = ['policy', 'tech', 'industry', 'trade', 'ai', 'finance']

// 汉字:CJK 基本区 + 扩展 A(生僻字)
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/

const argv = new Set(process.argv.slice(2))
const AS_JSON = argv.has('--json')
const QUIET = argv.has('--quiet')

const offenders = []
const perFile = []
let total = 0

for (const slug of SLUGS) {
  const file = path.join(DATA_DIR, `${slug}.json`)
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    console.error(`无法读取或解析 ${file}: ${err.message}`)
    process.exit(2)
  }

  const items = Array.isArray(parsed.items) ? parsed.items : []
  const bad = items.filter((it) => !CJK.test(String(it.title ?? '')))

  total += items.length
  perFile.push({ slug, total: items.length, offending: bad.length })
  for (const it of bad) {
    offenders.push({
      slug,
      id: it.id ?? '',
      title: it.title ?? '',
      source: it.source ?? '',
      url: it.url ?? '',
    })
  }
}

if (AS_JSON) {
  console.log(JSON.stringify({ total, offending: offenders.length, perFile, offenders }, null, 2))
} else {
  if (!QUIET && offenders.length) {
    console.log('不含中文的标题:')
    for (const o of offenders) {
      console.log(`  ${o.slug} | ${o.id} | 来源: ${o.source}`)
      console.log(`      ${o.title}`)
    }
    console.log('')
  }
  console.log('分类        条目    不含中文')
  for (const p of perFile) {
    console.log(
      `${p.slug.padEnd(10)}  ${String(p.total).padStart(4)}    ${String(p.offending).padStart(4)}`,
    )
  }
  console.log(`合计 ${total} 条,不含中文标题 ${offenders.length} 条`)
  if (offenders.length) {
    console.log('')
    console.log('违规:title 必须是简体中文成品。请依据条目的中文 summary 逐条翻译后重跑本脚本。')
    console.log('参考 scripts/routine-news-feed.md 的「中文成品检查」与「步骤 1 —— 标题校验」。')
  }
}

process.exit(offenders.length ? 1 : 0)