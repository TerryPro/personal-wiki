// registry.mjs — vaults.json 注册表读取与查询
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORKSPACE = resolve(join(__dirname, '..', '..'))
const REGISTRY_PATH = join(WORKSPACE, 'vaults.json')

/** 读取注册表（每次调用都重新读文件，保证新建 vault 后立即可见） */
export function loadRegistry() {
  try {
    const raw = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

/** vaultId → 绝对路径；不存在返回 null */
export function getVaultPath(id) {
  if (!id) return null
  const entry = loadRegistry().find((v) => v.id === id)
  if (!entry) return null
  return resolve(join(WORKSPACE, entry.path))
}

/** 默认 vault（注册表第一条）的 id；空注册表返回 null */
export function getDefaultVaultId() {
  const reg = loadRegistry()
  return reg.length ? reg[0].id : null
}

/** 解析请求中的 vaultId：优先用传入值，否则 fallback 到默认 */
export function resolveVaultId(requested) {
  const id = requested || getDefaultVaultId()
  if (!id) return null
  const p = getVaultPath(id)
  return p ? { id, path: p } : null
}

/** 追加新 vault 到注册表；id 重复时抛异常 */
export function addVault(entry) {
  const reg = loadRegistry()
  if (reg.some((v) => v.id === entry.id)) throw new Error(`vault id already exists: ${entry.id}`)
  reg.push(entry)
  writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2) + '\n', 'utf8')
  return reg
}

export { WORKSPACE, REGISTRY_PATH }
