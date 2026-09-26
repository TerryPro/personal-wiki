// staging.mjs — ingest/lint 审核门暂存区
// 约定：agent 的 write/edit 被 inline extension 重定向到 <vault>/.staging/<sid>/ 下，
// 真实 vault 在用户点击「应用」前不被触碰；「丢弃」直接删除暂存目录。
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { VAULT } from './vault.mjs'
import { unifiedDiff } from './diff.mjs'

const STAGING_ROOT = join(VAULT, '.staging')

/** 活跃暂存会话：id → { dir, files:Set<string>(vault 相对 posix 路径), createdAt, mode, target } */
export const sessions = new Map()

export function createSession(mode, target) {
  const id = `${mode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const dir = join(STAGING_ROOT, id)
  mkdirSync(dir, { recursive: true })
  sessions.set(id, { id, dir, files: new Set(), createdAt: new Date().toISOString(), mode, target })
  return sessions.get(id)
}

export function getSession(id) {
  return sessions.get(id) || null
}

/** 任意路径（绝对/相对 cwd=vault）→ vault 相对 posix 路径；越界返回 null（空串 = vault 根） */
export function toVaultRel(p) {
  if (p == null || typeof p !== 'string') return null
  const abs = isAbsolute(p) ? resolve(p) : resolve(join(VAULT, p))
  const root = resolve(VAULT)
  if (abs !== root && !abs.startsWith(root + '\\') && !abs.startsWith(root + '/')) return null
  return relative(VAULT, abs).replace(/\\/g, '/')
}

/** 暂存区内对应文件的绝对路径 */
export function stagedPath(sess, rel) {
  return join(sess.dir, rel)
}

/** edit 重定向前：确保暂存区有基础文件（从真实 vault 预拷贝），否则 oldText 匹配不到 */
export function ensureStagedBase(sess, rel) {
  const staged = stagedPath(sess, rel)
  if (existsSync(staged)) return
  const orig = join(VAULT, rel)
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
      const orig = join(VAULT, rel)
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
    const dest = join(VAULT, f.path)
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

/** 待审核会话清单（前端刷新后恢复用） */
export function listSessions() {
  return [...sessions.values()]
    .map((s) => ({ id: s.id, mode: s.mode, target: s.target, createdAt: s.createdAt, files: collectDiffs(s.id)?.map((f) => ({ path: f.path, status: f.status })) ?? [] }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

/** 写单个文件到 vault（output/ 成品保存等专用接口用） */
export function writeVaultFile(rel, content) {
  const dest = resolve(join(VAULT, rel))
  if (!dest.startsWith(resolve(VAULT))) throw new Error('path escapes vault')
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, content, 'utf8')
  return rel
}
