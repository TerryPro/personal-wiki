// sync-data.mjs — 从 vaults.json 注册表同步所有知识库到 src/generated/vaults/<id>.json
// 用法：npm run sync（dev/build 前置钩子已接好）。摄取/修改 wiki 后重跑即可。
// 单 vault 覆盖（CI/调试）：WIKI_VAULT=<vault-root> npm run sync
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync, cpSync } from 'node:fs'
import { join, dirname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')           // wiki-viewer/
const WORKSPACE = join(ROOT, '..')           // workspace 根（含 vaults.json）
const REGISTRY_PATH = join(WORKSPACE, 'vaults.json')

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
  if (!m) return { fm: {}, body: raw, fmRaw: '' }
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
  // fmRaw = frontmatter 原文块（含起止 ---），供源码视图忠实展示白名单之外的自定义字段
  return { fm, body: raw.slice(m[0].length), fmRaw: m[0] }
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

function toPage(file, catKey, catLabel, slugDir) {
  const raw = readFileSync(file, 'utf8')
  const { fm, body, fmRaw } = parseFrontmatter(raw)
  const titleMatch = body.match(/^# (.+)$/m)
  const title = (titleMatch ? titleMatch[1] : basename(file, '.md')).trim()
  // 先整体匹配 [[...]] 再拆分，兼容表格单元格里转义写的 \|（与 Obsidian 渲染前归一化一致）
  const links = [...body.matchAll(/\[\[([^\]]+)\]\]/g)]
    .map((m) => {
      const [target] = m[1].split(/\|(?![\]])/) // 只按首个未转义管道拆分
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
    fmRaw,
  }
}

const WIKI_CATS = new Set(['source', 'entity', 'concept', 'synthesis', 'meta'])

/** raw/output 页：在 toPage 基础上补充文件元信息，并剪掉双链（不参与 wiki 网络） */
function toAssetPage(file, catKey, catLabel, slugDir) {
  const st = statSync(file)
  const p = toPage(file, catKey, catLabel, slugDir)
  p.links = []
  p.size = st.size
  p.mtime = st.mtime.toISOString()
  // raw 页：带出人工消化标记 ingested（由 /agent/raw/mark 写入，sources 反查落空时兜底）
  if (catKey === 'raw') p.ingested = parseFrontmatter(readFileSync(file, 'utf8')).fm.ingested === 'true'
  return p
}

/** 只扫顶层 .md（raw/assets 等子目录不当页面处理） */
function topMarkdownFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => n.endsWith('.md'))
    .map((n) => join(dir, n))
}

/**
 * 同步单个 vault，返回 WikiData 对象。
 * @param {string} vaultRoot  vault 根目录绝对路径（含 wiki/ raw/ output/）
 * @param {string} vaultId    注册表中的 id
 */
function syncOneVault(vaultRoot, vaultId) {
  const WIKI_DIR = join(vaultRoot, 'wiki')
  const pages = []

  for (const cat of CATEGORIES) {
    for (const file of walk(join(WIKI_DIR, cat.dir))) pages.push(toPage(file, cat.key, cat.label, cat.dir))
  }

  // 两个特殊导航文件：wiki/index.md 与 wiki/log.md（category=meta，不入图谱）
  for (const name of ['index.md', 'log.md']) {
    const file = join(WIKI_DIR, name)
    if (existsSync(file)) pages.push(toPage(file, 'meta', '导航', ''))
  }

  /* ————— 全库浏览：raw/ 原始资料与 output/ 成品（不入图谱、不参与断链） ————— */
  const RAW_DIR = join(vaultRoot, 'raw')
  const OUT_DIR = join(vaultRoot, 'output')

  for (const file of topMarkdownFiles(RAW_DIR)) pages.push(toAssetPage(file, 'raw', '原始资料', 'raw'))

  // output/：.md 当页面，其余文件只记为附件条目
  const outputAttachments = []
  if (existsSync(OUT_DIR)) {
    for (const name of readdirSync(OUT_DIR)) {
      const file = join(OUT_DIR, name)
      if (!statSync(file).isFile()) continue
      if (name.endsWith('.md')) pages.push(toAssetPage(file, 'output', '成品', 'output'))
      else {
        const st = statSync(file)
        outputAttachments.push({ name, size: st.size, mtime: st.mtime.toISOString() })
      }
    }
  }

  // 消化状态：自动 = raw 文件名 ←→ source 页 frontmatter sources 反查；人工 = raw 页 ingested: true 兜底
  for (const rp of pages) {
    if (rp.category !== 'raw') continue
    const fname = rp.file.split('/').pop()
    rp.digestedBy = pages
      .filter((p) => p.category === 'source' && p.sources.includes(fname))
      .map((p) => p.id)
  }
  const rawPages = pages.filter((p) => p.category === 'raw')
  const autoDigested = (p) => !!(p.digestedBy && p.digestedBy.length > 0)
  const digestion = {
    total: rawPages.length,
    digested: rawPages.filter((p) => autoDigested(p) || p.ingested).length,
    manual: rawPages.filter((p) => !autoDigested(p) && p.ingested).length,
    undigestedFiles: rawPages.filter((p) => !autoDigested(p) && !p.ingested).map((p) => p.file.split('/').pop()),
  }

  // 断链（target 既不是标题也不是 slug）——仅限 wiki 页面
  const known = new Set()
  for (const p of pages) {
    if (!WIKI_CATS.has(p.category)) continue
    known.add(p.title)
    known.add(p.slug)
    for (const a of p.aliases) known.add(a)
  }
  const broken = new Map()
  for (const p of pages) {
    if (!WIKI_CATS.has(p.category)) continue
    for (const l of p.links)
      if (!known.has(l)) broken.set(l, [...(broken.get(l) || []), p])
  }

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

  // 图片附件：raw/assets → public/assets/<vaultId>/，供正文 ![[图片]] 渲染
  const assetsSrc = join(vaultRoot, 'raw', 'assets')
  const assetsDest = join(ROOT, 'public', 'assets', vaultId)
  if (existsSync(assetsSrc)) {
    mkdirSync(assetsDest, { recursive: true })
    cpSync(assetsSrc, assetsDest, { recursive: true })
  }

  return {
    syncedAt: new Date().toISOString(),
    vault: vaultRoot.replace(/\\/g, '/'),
    vaultId,
    pages,
    brokenLinks,
    digestion,
    outputAttachments,
  }
}

/* ————— 主流程 ————— */
// 输出到 public/data/（运行时 fetch，dev/prod 刷新即最新，不依赖重新 build）
const outDir = join(ROOT, 'public', 'data')
const vaultsOutDir = join(outDir, 'vaults')
mkdirSync(vaultsOutDir, { recursive: true })

if (process.env.WIKI_VAULT) {
  // 单 vault 覆盖模式（CI/调试）：WIKI_VAULT 指向 vault 根目录
  let vaultRoot = resolve(process.env.WIKI_VAULT)
  // 向后兼容：若路径以 /wiki 结尾，自动取父目录为 vault 根
  if (basename(vaultRoot) === 'wiki') vaultRoot = dirname(vaultRoot)
  const id = process.env.WIKI_VAULT_ID || 'default'
  const data = syncOneVault(vaultRoot, id)
  writeFileSync(join(vaultsOutDir, `${id}.json`), JSON.stringify(data, null, 0), 'utf8')
  writeFileSync(join(outDir, 'vault-index.json'), JSON.stringify([{ id, name: id, path: vaultRoot }], null, 2), 'utf8')
  console.log(`[sync] ${data.pages.length} pages from ${vaultRoot} (single-vault override, id=${id})`)
  if (data.brokenLinks.length) {
    console.log(`[sync] ⚠ ${data.brokenLinks.length} unresolved link target(s):`)
    for (const b of data.brokenLinks) console.log(`   - [[${b.target}]] ← ${b.from.map((p) => p.title).join(', ')}`)
  }
} else {
  // 多 vault 模式：读注册表遍历
  let registry = []
  try {
    registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
  } catch (e) {
    console.error(`[sync] 无法读取 vaults.json：${e.message}`)
    console.error(`[sync] 请在 ${WORKSPACE} 创建 vaults.json，格式：[{ "id": "...", "name": "...", "path": "..." }]`)
    process.exit(1)
  }
  if (!Array.isArray(registry) || !registry.length) {
    console.error('[sync] vaults.json 为空或格式错误')
    process.exit(1)
  }

  const index = []
  for (const entry of registry) {
    const vaultRoot = resolve(join(WORKSPACE, entry.path))
    if (!existsSync(vaultRoot)) {
      console.warn(`[sync] ⚠ vault 目录不存在，跳过：${entry.id} (${vaultRoot})`)
      continue
    }
    const data = syncOneVault(vaultRoot, entry.id)
    writeFileSync(join(vaultsOutDir, `${entry.id}.json`), JSON.stringify(data, null, 0), 'utf8')
    index.push(entry)
    const rawPages = data.pages.filter((p) => p.category === 'raw')
    console.log(
      `[sync] ${entry.id}: ${data.pages.length} pages (raw: ${rawPages.length}, 消化 ${data.digestion.digested}/${data.digestion.total}; output 附件: ${data.outputAttachments.length})`,
    )
    if (data.brokenLinks.length) {
      console.log(`[sync] ⚠ ${data.brokenLinks.length} unresolved link target(s) in ${entry.id}:`)
      for (const b of data.brokenLinks) console.log(`   - [[${b.target}]] ← ${b.from.map((p) => p.title).join(', ')}`)
    }
  }
  writeFileSync(join(outDir, 'vault-index.json'), JSON.stringify(index, null, 2), 'utf8')
  console.log(`[sync] vault-index.json: ${index.length} vault(s)`)
}
