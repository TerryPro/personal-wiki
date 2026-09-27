import { Boxes, Compass, FileArchive, FileText, Lightbulb, Package, Sparkles, type LucideIcon } from 'lucide-react'
import type { BrokenLink, Category, OutlineItem, VaultEntry, WikiData, WikiPage } from '@/types'

/* ————— 运行时数据加载（fetch public/data/，dev/prod 刷新即最新） ————— */

/** 数据版本：每次 loadVault 成功 +1；订阅者据此重渲染（解决快照不实时） */
let dataVersion = 0
const dataListeners = new Set<() => void>()
export const getDataVersion = () => dataVersion
export function subscribeData(fn: () => void): () => void {
  dataListeners.add(fn)
  return () => {
    dataListeners.delete(fn)
  }
}
function notifyData() {
  dataVersion++
  dataListeners.forEach((fn) => fn())
}

const EMPTY_DATA: WikiData = {
  syncedAt: '',
  vault: '',
  vaultId: '',
  pages: [],
  brokenLinks: [],
  digestion: { total: 0, digested: 0, undigestedFiles: [] },
  outputAttachments: [],
}

/** 当前活跃 vault 的数据（ES module live binding：导入方每次读取都拿最新值） */
export let data: WikiData = EMPTY_DATA
export let pages: WikiPage[] = []
/** 断链清单（构建期计算，已按引用数降序） */
export let brokenLinks: BrokenLink[] = []
/** raw/ 消化进度（构建期计算） */
export let digestion: { total: number; digested: number; undigestedFiles: string[] } = { total: 0, digested: 0, undigestedFiles: [] }

/* ————— 索引（vault 切换时重建） ————— */

/** 参与双链网络解析的分类；raw/output 只可浏览，不可被 [[链接]] 解析命中 */
const RESOLVABLE = new Set<Category>(['source', 'entity', 'concept', 'synthesis', 'meta'])

/** 标题/slug/别名 → 页面 索引 */
const byTitle = new Map<string, WikiPage>()
const bySlug = new Map<string, WikiPage>()
const byAlias = new Map<string, WikiPage>()
const backlinkCache = new Map<string, WikiPage[]>()
const rawToSources = new Map<string, WikiPage[]>()
let tagMap: Map<string, WikiPage[]> | null = null
let healthCache: HealthReport | null = null

function rebuildIndexes() {
  byTitle.clear()
  bySlug.clear()
  byAlias.clear()
  backlinkCache.clear()
  rawToSources.clear()
  tagMap = null
  healthCache = null

  for (const p of pages) {
    if (!RESOLVABLE.has(p.category)) continue
    byTitle.set(p.title, p)
    bySlug.set(p.slug, p)
    for (const a of p.aliases ?? []) if (!byAlias.has(a)) byAlias.set(a, p)
  }
  for (const p of pages) {
    if (p.category === 'source')
      for (const s of p.sources) {
        if (!rawToSources.has(s)) rawToSources.set(s, [])
        rawToSources.get(s)!.push(p)
      }
  }
}

/** 加载指定 vault 的数据快照；成功后 data/pages/brokenLinks/digestion 全部更新并通知订阅者 */
export async function loadVault(id: string): Promise<void> {
  const res = await fetch(`/data/vaults/${encodeURIComponent(id)}.json`)
  if (!res.ok) throw new Error(`vault not found: ${id}`)
  data = (await res.json()) as WikiData
  pages = data.pages
  brokenLinks = data.brokenLinks ?? []
  digestion = data.digestion ?? { total: 0, digested: 0, undigestedFiles: [] }
  rebuildIndexes()
  notifyData()
}

/** 读取 vault 注册表（public/data/vault-index.json，由 sync-data.mjs 生成） */
export async function loadVaultIndex(): Promise<VaultEntry[]> {
  try {
    const res = await fetch('/data/vault-index.json')
    if (!res.ok) return []
    return (await res.json()) as VaultEntry[]
  } catch {
    return []
  }
}

/* ————— 查询 API ————— */

export const resolveTitle = (t: string) =>
  byTitle.get(t.trim()) ?? bySlug.get(t.trim()) ?? byAlias.get(t.trim().toLowerCase()) ?? null

export const getPage = (id: string) => pages.find((p) => p.id === id) ?? null

/** 反链：谁 [[链接]] 了我（标题或 slug 命中均算） */
export function getBacklinks(page: WikiPage): WikiPage[] {
  let r = backlinkCache.get(page.id)
  if (!r) {
    r = pages.filter((p) => p.id !== page.id && (p.links.includes(page.title) || p.links.includes(page.slug)))
    backlinkCache.set(page.id, r)
  }
  return r
}

export const CATEGORY_META: Record<Category, { label: string; badge: string; dot: string; icon: LucideIcon; order: number }> = {
  source: { label: '来源', badge: 'border-cat-source/40 bg-cat-source/10 text-cat-source', dot: 'hsl(var(--cat-source))', icon: FileText, order: 0 },
  entity: { label: '实体', badge: 'border-cat-entity/40 bg-cat-entity/10 text-cat-entity', dot: 'hsl(var(--cat-entity))', icon: Boxes, order: 1 },
  concept: { label: '概念', badge: 'border-cat-concept/40 bg-cat-concept/10 text-cat-concept', dot: 'hsl(var(--cat-concept))', icon: Lightbulb, order: 2 },
  synthesis: { label: '综合', badge: 'border-cat-synthesis/40 bg-cat-synthesis/10 text-cat-synthesis', dot: 'hsl(var(--cat-synthesis))', icon: Sparkles, order: 3 },
  meta: { label: '导航', badge: 'border-line bg-surface text-fg-secondary', dot: 'hsl(var(--fg-muted))', icon: Compass, order: 4 },
  raw: { label: '原始资料', badge: 'border-cat-raw/40 bg-cat-raw/10 text-cat-raw', dot: 'hsl(var(--cat-raw))', icon: FileArchive, order: 5 },
  output: { label: '成品', badge: 'border-cat-output/40 bg-cat-output/10 text-cat-output', dot: 'hsl(var(--cat-output))', icon: Package, order: 6 },
}

export function groupedByCategory(): { category: Category; label: string; items: WikiPage[] }[] {
  const order: Category[] = ['meta', 'synthesis', 'concept', 'entity', 'source', 'raw', 'output']
  return order
    .map((c) => ({
      category: c,
      label: CATEGORY_META[c].label,
      items: pages
        .filter((p) => p.category === c)
        .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')),
    }))
    .filter((g) => g.items.length > 0)
}

export interface SearchHit {
  page: WikiPage
  snippet: string
}

export function search(q: string): SearchHit[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return []
  const hits: SearchHit[] = []
  for (const p of pages) {
    const hay = p.content.toLowerCase()
    const inTitle = p.title.toLowerCase().includes(needle)
    const idx = hay.indexOf(needle)
    if (inTitle || idx >= 0) {
      const plain = p.content.replace(/^---[\s\S]*?---/, '').replace(/\s+/g, ' ')
      const plainIdx = plain.toLowerCase().indexOf(needle)
      const snippet =
        plainIdx >= 0
          ? (plainIdx > 40 ? '…' : '') + plain.slice(plainIdx - 20, plainIdx + needle.length + 60) + '…'
          : p.excerpt.slice(0, 80) + '…'
      hits.push({ page: p, snippet })
    }
  }
  return hits.sort((a, b) => {
    const ta = a.page.title.toLowerCase().includes(needle) ? 0 : 1
    const tb = b.page.title.toLowerCase().includes(needle) ? 0 : 1
    return ta - tb || a.page.title.localeCompare(b.page.title, 'zh-CN')
  })
}

/** 图谱边：仅限 wiki 知识页（排除 meta 导航页与 raw/output 资产页） */
export function buildEdges(): { from: string; to: string }[] {
  const seen = new Set<string>()
  const edges: { from: string; to: string }[] = []
  for (const p of pages)
    if (p.category !== 'meta' && p.category !== 'raw' && p.category !== 'output')
      for (const l of p.links) {
        const t = resolveTitle(l)
        if (!t || t.category === 'meta') continue
        const key = [p.id, t.id].sort().join('↔')
        if (seen.has(key)) continue
        seen.add(key)
        edges.push({ from: p.id, to: t.id })
      }
  return edges
}

/* ————— 标签视图 ————— */

function tagsMap(): Map<string, WikiPage[]> {
  if (!tagMap) {
    tagMap = new Map()
    for (const p of pages)
      for (const t of p.tags) {
        if (!tagMap.has(t)) tagMap.set(t, [])
        tagMap.get(t)!.push(p)
      }
    for (const arr of tagMap.values()) arr.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  }
  return tagMap
}

/** 全部标签：按引用页数降序、同数按名称排 */
export function listTags(): { tag: string; pages: WikiPage[] }[] {
  return [...tagsMap().entries()]
    .map(([tag, pages]) => ({ tag, pages }))
    .sort((a, b) => b.pages.length - a.pages.length || a.tag.localeCompare(b.tag))
}

export const pagesByTag = (tag: string) => tagsMap().get(tag) ?? []

/** 命令面板里可执行的动作（非页面类条目，由 App 注入） */
export interface PaletteAction {
  id: string
  label: string
  run: () => void
}

/* ————— 大纲（h2–h4）————— */

/** 从渲染后的 HTML 提取 h2–h4；同文本标题自动去重（dup2/dup3…） */
export function outlineFromHtml(html: string): OutlineItem[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const used = new Set<string>()
  const out: OutlineItem[] = []
  for (const h of Array.from(doc.body.querySelectorAll('h2,h3,h4'))) {
    const text = (h.textContent || '').trim()
    if (!text) continue
    let id = `sec-${encodeURIComponent(text).replace(/%/g, '-')}`
    if (used.has(id)) {
      let n = 2
      while (used.has(`${id}-${n}`)) n++
      id = `${id}-${n}`
    }
    used.add(id)
    out.push({ id, text, level: Number(h.tagName.slice(1)) })
  }
  return out
}

/** 把 [[a|b]] / [[a]] 展开为显示文本，用于大纲文本与水合后 DOM 文本的对齐 */
const expandWikilabel = (s: string) =>
  s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1')

/** 给正文容器里的对应标题补上 id，供大纲点击滚动定位（在水合之后调用，按显示文本匹配） */
export function applyOutlineIds(root: HTMLElement, outline: OutlineItem[]) {
  for (const h of Array.from(root.querySelectorAll('h2,h3,h4'))) {
    const text = (h.textContent || '').trim()
    const hit = outline.find((o) => o.text === text || expandWikilabel(o.text) === text)
    if (hit) h.id = hit.id
  }
}

/* ————— 来源追溯：raw 文件 → 哪些 source 页引用了它 ————— */

/** raw/ 文件名 → 消化它的 source 页列表 */
export const sourcePagesForRaw = (file: string) => rawToSources.get(file) ?? []

/** 当前页引用的 source 页（出链中 category=source 的那些） */
export function citedSourcePages(page: WikiPage): WikiPage[] {
  const out: WikiPage[] = []
  for (const l of page.links) {
    const t = resolveTitle(l)
    if (t && t.category === 'source' && !out.includes(t)) out.push(t)
  }
  return out
}

/** 拼接带引用头的 Markdown，供直接粘贴进 LLM 对话 */
export function buildLlmContext(page: WikiPage): string {
  const srcPages = page.sources.flatMap((s) => sourcePagesForRaw(s).map((p) => p.title))
  const head = [
    `【知识库页面】${page.title}（${page.categoryLabel}：${page.slug}）`,
    `收录：${page.created || '未知'} · 最后更新：${page.updated || '未知'}`,
    page.sources.length ? `原始来源：${page.sources.map((s) => `raw/${s}`).join('、')}` : '',
    srcPages.length ? `对应来源摘要页：${[...new Set(srcPages)].join('、')}` : '',
    page.links.length ? `页内互链：${page.links.join('、')}（如需深入可继续询问）` : '',
  ]
    .filter(Boolean)
    .join('\n')
  return `${head}\n\n---\n\n${page.content.trim()}\n`
}

/* ————— 健康报告 ————— */
export interface HealthReport {
  orphans: WikiPage[] // 零反链：网络中的孤岛
  noOutlinks: WikiPage[] // 出链全部未解析/为空：尚未缝合进网络
  stale: { page: WikiPage; newerSource: WikiPage }[] // 引用的 source 页比本页更新
  avgDegree: number
}

export function healthReport(): HealthReport {
  if (healthCache) return healthCache
  const knowables = pages.filter((p) => p.category !== 'meta' && p.category !== 'raw' && p.category !== 'output')
  const orphans = knowables.filter((p) => getBacklinks(p).length === 0)
  const noOutlinks = knowables.filter((p) => p.links.every((l) => !resolveTitle(l)))
  const stale: HealthReport['stale'] = []
  for (const p of knowables) {
    if (!p.updated) continue
    for (const s of citedSourcePages(p))
      if (s.updated && s.updated > p.updated) { stale.push({ page: p, newerSource: s }); break }
  }
  const degree = knowables.reduce((a, p) => a + getBacklinks(p).length + p.links.filter((l) => resolveTitle(l)).length, 0)
  healthCache = { orphans, noOutlinks, stale, avgDegree: knowables.length ? degree / knowables.length : 0 }
  return healthCache
}

/** 供展示：断链按引用数降序（构建期已排） */
export const topBroken = (n = 8): BrokenLink[] => brokenLinks.slice(0, n)
