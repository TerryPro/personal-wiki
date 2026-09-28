import type { WikiPage } from '@/types'

/* ————— 书签 / 最近打开：按 vault 隔离持久化到 localStorage ————— */

/** 库状态版本：书签/最近变化 +1；订阅者据此重渲染（与 dataVersion 同构） */
let libVersion = 0
const libListeners = new Set<() => void>()
export const getLibraryVersion = () => libVersion
export function subscribeLibrary(fn: () => void): () => void {
  libListeners.add(fn)
  return () => {
    libListeners.delete(fn)
  }
}
function notifyLibrary() {
  libVersion++
  libListeners.forEach((fn) => fn())
}

type ByVault = Record<string, string[]>

function readMap(key: string): ByVault {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as ByVault
  } catch {
    return {}
  }
}

const RECENT_MAX = 12

/** 当前 vault 的书签页面 id（新收藏排最前） */
export const listStarred = (vaultId: string): string[] => readMap('wv-starred')[vaultId] ?? []

export const isStarred = (vaultId: string, id: string) => listStarred(vaultId).includes(id)

/** 切换收藏，返回切换后是否收藏 */
export function toggleStar(vaultId: string, id: string): boolean {
  const map = readMap('wv-starred')
  const cur = map[vaultId] ?? []
  const starred = !cur.includes(id)
  map[vaultId] = starred ? [id, ...cur] : cur.filter((x) => x !== id)
  localStorage.setItem('wv-starred', JSON.stringify(map))
  notifyLibrary()
  return starred
}

/** 当前 vault 的最近打开（新访问排最前，最多 RECENT_MAX 条） */
export const listRecent = (vaultId: string): string[] => readMap('wv-recent')[vaultId] ?? []

/** 记录一次访问；顺序无变化时静默（避免浏览时反复触发重渲染） */
export function pushRecent(vaultId: string, id: string) {
  const map = readMap('wv-recent')
  const cur = map[vaultId] ?? []
  const next = [id, ...cur.filter((x) => x !== id)].slice(0, RECENT_MAX)
  if (next.length === cur.length && next.every((x, i) => x === cur[i])) return
  map[vaultId] = next
  localStorage.setItem('wv-recent', JSON.stringify(map))
  notifyLibrary()
}

export function clearRecent(vaultId: string) {
  const map = readMap('wv-recent')
  if (!map[vaultId]?.length) return
  delete map[vaultId]
  localStorage.setItem('wv-recent', JSON.stringify(map))
  notifyLibrary()
}

/* ————— 导出整页 Markdown ————— */

/** 页面的忠实 Markdown：优先 sync 保留的 frontmatter 原文，旧快照缺 fmRaw 时回退重建 */
export function pageToMarkdown(page: WikiPage): string {
  if (page.fmRaw) return (page.fmRaw.endsWith('\n') ? page.fmRaw : page.fmRaw + '\n') + page.content
  const lines = ['---']
  if (page.tags.length) lines.push(`tags: [${page.tags.join(', ')}]`)
  if (page.sources.length) lines.push(`sources: [${page.sources.join(', ')}]`)
  if (page.aliases.length) lines.push(`aliases: [${page.aliases.map((a) => `"${a}"`).join(', ')}]`)
  if (page.created) lines.push(`created: ${page.created}`)
  if (page.updated) lines.push(`updated: ${page.updated}`)
  lines.push('---', '')
  return lines.join('\n') + page.content
}

/** 触发浏览器下载当前页 Markdown 源文件 */
export function downloadMarkdown(page: WikiPage) {
  const blob = new Blob([pageToMarkdown(page)], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${page.slug || page.title}.md`
  a.click()
  URL.revokeObjectURL(url)
}
