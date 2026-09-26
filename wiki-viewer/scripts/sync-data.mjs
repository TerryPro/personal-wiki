// sync-data.mjs — 从 ../llmwiki/wiki 只读同步知识库到 src/generated/wiki-data.json
// 用法：npm run sync（dev/build 前置钩子已接好）。摄取/修改 wiki 后重跑即可。
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync, cpSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const VAULT = process.env.WIKI_VAULT || join(ROOT, '..', 'llmwiki', 'wiki')

const CATEGORIES = [
  { dir: 'sources', key: 'source', label: '来源' },
  { dir: 'entities', key: 'entity', label: '实体' },
  { dir: 'concepts', key: 'concept', label: '概念' },
  { dir: 'synthesis', key: 'synthesis', label: '综合' },
]

function unquote(s) {
  const v = s.trim()
  return /^(["']).*\1$/.test(v) && v.length > 1 ? v.slice(1, -1) : v
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { fm: {}, body: raw }
  const fm = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (!kv) continue
    const [, key, valRaw] = kv
    const val = valRaw.trim()
    if (val.startsWith('[') && val.endsWith(']')) {
      fm[key] = val.slice(1, -1).split(',').map((s) => unquote(s)).filter(Boolean)
    } else {
      fm[key] = unquote(val)
    }
  }
  return { fm, body: raw.slice(m[0].length) }
}

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (name.endsWith('.md')) out.push(p)
  }
  return out
}

const pages = []

function toPage(file, catKey, catLabel, slugDir) {
  const raw = readFileSync(file, 'utf8')
  const { fm, body } = parseFrontmatter(raw)
  const titleMatch = body.match(/^# (.+)$/m)
  const title = (titleMatch ? titleMatch[1] : basename(file, '.md')).trim()
  // 先整体匹配 [[...]] 再拆分，兼容表格单元格里转义写的 \|（与 Obsidian 渲染前归一化一致）
  const links = [...body.matchAll(/\[\[([^\]]+)\]\]/g)]
    .map((m) => {
      const [target, label] = m[1].split(/\|(?![\]])/) // 只按首个未转义管道拆分；若残留反斜杠交给 unquote
      return target ? target.trim().replace(/^\\|\\$/g, '') : m[1].trim()
    })
    .filter((t) => t && !['wikilink', 'wikilinks', 'Page Name', 'Entity Name', 'Concept Name'].includes(t))
  const plain = body
    .replace(/^---[\s\S]*?---/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#>*`\[\]()|_-]/g, ' ')
  return {
    id: `${catKey}/${basename(file)}`,
    slug: slugDir ? `${slugDir}/${basename(file, '.md')}` : basename(file, '.md'),
    file: file.replace(/\\/g, '/'),
    title,
    category: catKey,
    categoryLabel: catLabel,
    aliases: Array.isArray(fm.aliases) ? fm.aliases : fm.aliases ? [fm.aliases] : [],
    tags: Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : [],
    sources: Array.isArray(fm.sources) ? fm.sources : fm.sources ? [fm.sources] : [],
    created: fm.created || '',
    updated: fm.updated || '',
    links: [...new Set(links)],
    excerpt: plain.replace(/\s+/g, ' ').trim().slice(0, 160),
    content: body,
  }
}

for (const cat of CATEGORIES) {
  for (const file of walk(join(VAULT, cat.dir))) pages.push(toPage(file, cat.key, cat.label, cat.dir))
}

// 两个特殊导航文件：wiki/index.md 与 wiki/log.md（category=meta，不入图谱）
for (const name of ['index.md', 'log.md']) {
  const file = join(VAULT, name)
  if (existsSync(file)) pages.push(toPage(file, 'meta', '导航', ''))
}

// 一致性告警与前端数据：断链（target 既不是标题也不是 slug）
const known = new Set()
for (const p of pages) {
  known.add(p.title)
  known.add(p.slug)
  for (const a of p.aliases) known.add(a)
}
const broken = new Map()
for (const p of pages)
  for (const l of p.links)
    if (!known.has(l)) broken.set(l, [...(broken.get(l) || []), p])

// 断链目标智能候选：补 .md / 去目录前缀 / 同名兄弟目录，能解析到真页面的不算断链
const suggest = (t) => {
  const cands = t.endsWith('.md') ? [t.slice(0, -3)] : [`${t}.md`, t.replace(/\.md$/, '')]
  const seg = t.split('/')
  if (seg.length > 1) {
    const f = seg[seg.length - 1]
    for (const c of CATEGORIES) cands.push(`${c.dir}/${f}`)
  }
  const hit = new Set()
  for (const c of cands) if (known.has(c)) hit.add(c)
  return [...hit]
}
const brokenLinks = [...broken.entries()]
  .map(([t, from]) => {
    const s = suggest(t)
    if (s.length) return null
    return { target: t, from: from.map((p) => ({ id: p.id, title: p.title })) }
  })
  .filter(Boolean)
  .sort((a, b) => b.from.length - a.from.length || a.target.localeCompare(b.target))

const outDir = join(ROOT, 'src', 'generated')
mkdirSync(outDir, { recursive: true })

// 图片附件：raw/assets → public/assets，供正文 ![[图片]] 与相对路径引用渲染
const assetsSrc = join(VAULT, '..', 'raw', 'assets')
const assetsDest = join(ROOT, 'public', 'assets')
if (existsSync(assetsSrc)) {
  mkdirSync(assetsDest, { recursive: true })
  cpSync(assetsSrc, assetsDest, { recursive: true })
}
writeFileSync(
  join(outDir, 'wiki-data.json'),
  JSON.stringify({ syncedAt: new Date().toISOString(), vault: VAULT.replace(/\\/g, '/'), pages, brokenLinks }, null, 0),
  'utf8',
)

console.log(`[sync] ${pages.length} pages from ${VAULT}`)
if (brokenLinks.length) {
  console.log(`[sync] ⚠ ${brokenLinks.length} unresolved link target(s):`)
  for (const b of brokenLinks) console.log(`   - [[${b.target}]] ← ${b.from.map((p) => p.title).join(', ')}`)
}
