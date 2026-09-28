/* ————— 右栏「文档」tab：多文档同时打开（按 vault 隔离，持久化，切模式不丢） ————— */

export interface OpenDocs {
  docs: string[]
  active: string | null
}

/** 打开上限：超出按 FIFO 挤退最早的 tab */
const MAX_DOCS = 10

let openDocsVersion = 0
const openDocsListeners = new Set<() => void>()
export const getOpenDocsVersion = () => openDocsVersion
export function subscribeOpenDocs(fn: () => void): () => void {
  openDocsListeners.add(fn)
  return () => {
    openDocsListeners.delete(fn)
  }
}
function notifyOpenDocs() {
  openDocsVersion++
  openDocsListeners.forEach((fn) => fn())
}

type ByVault = Record<string, OpenDocs>

function readMap(): ByVault {
  try {
    return JSON.parse(localStorage.getItem('wv-open-docs') ?? '{}') as ByVault
  } catch {
    return {}
  }
}
function writeMap(map: ByVault) {
  localStorage.setItem('wv-open-docs', JSON.stringify(map))
}

export const getOpenDocs = (vaultId: string): OpenDocs => readMap()[vaultId] ?? { docs: [], active: null }

export const getActiveDoc = (vaultId: string) => getOpenDocs(vaultId).active

/** 打开文档：已有 tab 直接置活跃；新文档追加至末尾（封顶 MAX_DOCS） */
export function openDoc(vaultId: string, path: string) {
  const map = readMap()
  const cur = map[vaultId] ?? { docs: [], active: null }
  const docs = cur.docs.includes(path) ? cur.docs : [...cur.docs, path].slice(-MAX_DOCS)
  if (cur.active === path && docs === cur.docs) return
  map[vaultId] = { docs, active: path }
  writeMap(map)
  notifyOpenDocs()
}

/** 切换活跃文档（tab 点击） */
export function setActiveDoc(vaultId: string, path: string) {
  const map = readMap()
  const cur = map[vaultId]
  if (!cur?.docs.includes(path) || cur.active === path) return
  map[vaultId] = { ...cur, active: path }
  writeMap(map)
  notifyOpenDocs()
}

/** 关闭一个文档：活跃项落到相邻 tab（优先右侧） */
export function closeDoc(vaultId: string, path: string) {
  const map = readMap()
  const cur = map[vaultId]
  const idx = cur?.docs.indexOf(path) ?? -1
  if (!cur || idx < 0) return
  const docs = cur.docs.filter((d) => d !== path)
  const active = cur.active === path ? (docs[idx] ?? docs[idx - 1] ?? null) : cur.active
  map[vaultId] = { docs, active }
  writeMap(map)
  notifyOpenDocs()
}

export function closeAllDocs(vaultId: string) {
  const map = readMap()
  if (!map[vaultId]?.docs.length) return
  map[vaultId] = { docs: [], active: null }
  writeMap(map)
  notifyOpenDocs()
}
