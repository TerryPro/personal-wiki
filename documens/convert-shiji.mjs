// convert-shiji.mjs — 把 documens/shiji_txt/ 的章节 txt 转成带 frontmatter 的 raw Markdown
// 用法: node documens/convert-shiji.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, 'shiji_txt')
const OUT = join(__dirname, 'shiji_md')

/** 卷次 → 体裁（史记五体） */
function genreOf(num) {
  if (num >= 1 && num <= 12) return '本纪'
  if (num >= 13 && num <= 22) return '表'
  if (num >= 23 && num <= 30) return '书'
  if (num >= 31 && num <= 60) return '世家'
  return '列传'
}

mkdirSync(OUT, { recursive: true })

const files = readdirSync(SRC).filter((f) => f.endsWith('.txt')).sort()
let ok = 0
const problems = []

for (const f of files) {
  const m = f.match(/^(\d{3})_(.+)\.txt$/)
  if (!m) { problems.push(`文件名不符合 NNN_篇名.txt: ${f}`); continue }
  const num = Number(m[1])
  const title = m[2]
  const genre = genreOf(num)

  // 读取正文（UTF-8），统一换行符
  let body = readFileSync(join(SRC, f), 'utf8').replace(/\r\n?/g, '\n')

  // 去掉开头的纯文本标题行（正文里已由 H1 承担）
  const lines = body.split('\n')
  while (lines.length && lines[0].trim() === '') lines.shift()
  if (lines.length && lines[0].trim() === title) {
    lines.shift()
    while (lines.length && lines[0].trim() === '') lines.shift()
  }
  body = lines.join('\n').trim()

  if (!body) { problems.push(`正文为空: ${f}`); continue }

  const today = new Date().toISOString().slice(0, 10)
  const md = `---
tags: [shiji, ${genre}, raw-book]
source: shiji_txt/${f}
book: 史记
author: 司马迁
chapter: ${title}
volume: ${num}
genre: ${genre}
ingested: false
created: ${today}
---

# 史记 · ${title}

> **《史记》卷${num} · ${genre}** ｜ 作者：司马迁（西汉）｜ 原始文件：\`shiji_txt/${f}\`

${body}
`
  const outName = f.replace(/\.txt$/, '.md')
  writeFileSync(join(OUT, outName), md, 'utf8')
  ok++
}

console.log(`[convert] 完成: ${ok}/${files.length} 个文件 → ${OUT}`)
if (problems.length) {
  console.log('[convert] 问题:')
  for (const p of problems) console.log('  -', p)
}
