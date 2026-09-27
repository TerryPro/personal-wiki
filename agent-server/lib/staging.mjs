// staging.mjs — ingest/lint 审核门暂存区（多 vault 版本）
// 约定：agent 的 write/edit 被 inline extension 重定向到 <vault>/.staging/<sid>/ 下，
// 真实 vault 在用户点击「应用」前不被触碰；「丢弃」直接删除暂存目录。
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { unifiedDiff } from './diff.mjs'

/** 活跃暂存会话：id → { id, dir, vaultPath, files:Set, createdAt, mode, target } */
export const sessions = new Map()

export function createSession(vaultPath, mode, target) {
  const id = `${mode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const dir = join(vaultPath, '.staging', id)
  mkdirSync(dir, { recursive: true })
  sessions.set(id, { id, dir, vaultPath, files: new Set(), createdAt: new Date().toISOString(), mode, target })
  return sessions.get(id)
}

export function getSession(id) {
  return sessions.get(id) || null
}

/** 任意路径（绝对/相对 cwd=vault）→ vault 相对 posix 路径；越界返回 null（空串 = vault 根） */
export function toVaultRel(vaultPath, p) {
  if (p == null || typeof p !== 'string') return null
  const abs = isAbsolute(p) ? resolve(p) : resolve(join(vaultPath, p))
  const root = resolve(vaultPath)
  if (abs !== root && !abs.startsWith(root + '\\') && !abs.startsWith(root + '/')) return null
  return relative(vaultPath, abs).replace(/\\/g, '/')
}

/** 暂存区内对应文件的绝对路径 */
export function stagedPath(sess, rel) {
  return join(sess.dir, rel)
}

/** edit 重定向前：确保暂存区有基础文件（从真实 vault 预拷贝），否则 oldText 匹配不到 */
export function ensureStagedBase(sess, rel) {
  const staged = stagedPath(sess, rel)
  if (existsSync(staged)) return
  const orig = join(sess.vaultPath, rel)
  mkdirSync(dirname(staged), { recursive: true })
  if (existsSync(orig)) copyFileSync(orig, staged)
}

/** 遍历暂存目录收集所有文件（vault 相对 posix 路径） */
function walkStaged(dir, base = dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walkStaged(p, base))
    else out.push(relative(base, p).replace(/\\/g, '/'))
  }
  return out
}

/** 汇总暂存改动为 diff 清单（供前端审核） */
export function collectDiffs(id) {
  const sess = getSession(id)
  if (!sess) return null
  const files = [...new Set([...walkStaged(sess.dir), ...sess.files])].sort()
  return files
    .map((rel) => {
      const staged = join(sess.dir, rel)
      if (!existsSync(staged)) return null
      const orig = join(sess.vaultPath, rel)
      const isNew = !existsSync(orig)
      const oldStr = isNew ? '' : readFileSync(orig, 'utf8')
      const newStr = readFileSync(staged, 'utf8')
      const diff = unifiedDiff(oldStr, newStr, `a/${rel}`, `b/${rel}`)
      if (!diff && !isNew) return null
      return { path: rel, status: isNew ? 'new' : 'modified', diff }
    })
    .filter(Boolean)
}

/** 应用：暂存文件落盘真实 vault，随后清理暂存目录；返回改动文件列表 */
export function applySession(id) {
  const sess = getSession(id)
  if (!sess) return null
  const diffs = collectDiffs(id) || []
  const changed = []
  for (const f of diffs) {
    const dest = join(sess.vaultPath, f.path)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(join(sess.dir, f.path), dest)
    changed.push(f.path)
  }
  rmSync(sess.dir, { recursive: true, force: true })
  sessions.delete(id)
  return changed
}

/** 丢弃：删除暂存目录 */
export function discardSession(id) {
  const sess = getSession(id)
  if (!sess) return false
  rmSync(sess.dir, { recursive: true, force: true })
  sessions.delete(id)
  return true
}

/** 会话剩余待审文件数（walk 磁盘 ∪ 内存 files）；为 0 时清理会话 */
function remainingAndCleanup(sess) {
  const remaining = [...new Set([...walkStaged(sess.dir), ...sess.files])]
  const done = remaining.length === 0
  if (done) {
    rmSync(sess.dir, { recursive: true, force: true })
    sessions.delete(sess.id)
  }
  return { remaining: remaining.length, done }
}

/** 应用指定文件子集（逐文件审核）；返回 {changed, remaining, done} */
export function applyFiles(id, rels) {
  const sess = getSession(id)
  if (!sess) return null
  const changed = []
  for (const rel of rels) {
    const staged = join(sess.dir, rel)
    if (!existsSync(staged)) continue
    const dest = join(sess.vaultPath, rel)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(staged, dest)
    changed.push(rel)
    sess.files.delete(rel)
    rmSync(staged, { force: true })
  }
  return { changed, ...remainingAndCleanup(sess) }
}

/** 丢弃指定文件子集（单文件 revert）；返回 {remaining, done} */
export function discardFiles(id, rels) {
  const sess = getSession(id)
  if (!sess) return null
  for (const rel of rels) {
    const staged = join(sess.dir, rel)
    if (existsSync(staged)) rmSync(staged, { force: true })
    sess.files.delete(rel)
  }
  return remainingAndCleanup(sess)
}

/** 待审核会话清单（前端刷新后恢复用）；可选按 vaultPath 过滤 */
export function listSessions(vaultPath) {
  return [...sessions.values()]
    .filter((s) => !vaultPath || s.vaultPath === vaultPath)
    .map((s) => ({ id: s.id, mode: s.mode, target: s.target, createdAt: s.createdAt, files: collectDiffs(s.id)?.map((f) => ({ path: f.path, status: f.status })) ?? [] }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

/** 写单个文件到 vault（output/ 成品保存等专用接口用） */
export function writeVaultFile(vaultPath, rel, content) {
  const dest = resolve(join(vaultPath, rel))
  if (!dest.startsWith(resolve(vaultPath))) throw new Error('path escapes vault')
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, content, 'utf8')
  return rel
}

/* ————— 启动恢复：把磁盘上的孤儿暂存目录重新登记回内存表 ————— */

/**
 * 扫描 vault 的 .staging 子目录（每个子目录一个暂存会话），把未登记（如 server 重启后丢失）的
 * 暂存会话重建回内存 sessions 表，使「审查」面板/暂存待审在重启后仍能列出并审核。
 * @param {string} vaultPath vault 根绝对路径
 * @returns {string[]} 恢复的会话 id 列表
 */
export function recoverFromDisk(vaultPath) {
  const root = join(vaultPath, '.staging')
  if (!existsSync(root)) return []
  const recovered = []
  for (const id of readdirSync(root)) {
    const dir = join(root, id)
    if (!statSync(dir).isDirectory()) continue
    if (sessions.has(id)) continue // 已在内存中，跳过
    // id 格式：<mode>-<ts36>-<rand>；取首段为 mode
    const mode = id.split('-')[0] || 'chat'
    let createdAt = null
    try {
      createdAt = statSync(dir).mtime.toISOString()
    } catch { /* ignore */ }
    const files = new Set(walkStaged(dir).map((rel) => rel))
    sessions.set(id, {
      id,
      dir,
      vaultPath,
      files,
      createdAt: createdAt || new Date().toISOString(),
      mode,
      target: '(重启恢复)',
    })
    recovered.push(id)
  }
  return recovered
}
