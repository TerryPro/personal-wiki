// sessions.mjs — 持久化会话缓存：AgentSession 按 sessionId 复用（30 分钟空闲自动 dispose），
// 会话文件由 SessionManager 持久化到 ~/.pi/agent/sessions/（与 pi CLI 的 pi -c / pi -r 互通）。
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  getAgentDir,
} from '@earendil-works/pi-coding-agent'
import { VAULT, QUERY_GUIDE, INGEST_GUIDE, LINT_GUIDE } from './vault.mjs'
import { createSession, ensureStagedBase, stagedPath, toVaultRel } from './staging.mjs'

const IDLE_MS = 30 * 60 * 1000

/** sessionId → { sessionId, mode, session, sm, stagingSess, modelKey, lastContextPage, busy, lastActive } */
const cache = new Map()

const GUIDES = { query: QUERY_GUIDE, ingest: INGEST_GUIDE, lint: LINT_GUIDE }

/** SDK 基础工具目录（设置面板可开关的全集） */
export const TOOL_CATALOG = [
  { name: 'read', description: '读取文件内容' },
  { name: 'bash', description: '执行 shell 命令（可绕过审核门，谨慎启用）' },
  { name: 'edit', description: '精确替换式编辑文件（写入经审核门）' },
  { name: 'write', description: '新建 / 覆写文件（写入经审核门）' },
  { name: 'grep', description: '按模式搜索文件内容' },
  { name: 'find', description: '按 glob 模式查找文件' },
  { name: 'ls', description: '列目录内容' },
]
const VALID_TOOLS = new Set(TOOL_CATALOG.map((t) => t.name))

const DEFAULT_TOOLS = {
  query: ['read', 'grep', 'find', 'ls', 'write', 'edit'],
  ingest: ['read', 'grep', 'find', 'ls', 'write', 'edit'],
  lint: ['read', 'grep', 'find', 'ls', 'write', 'edit'],
}

const TOOLS_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'tools.json')

/** 加载持久化的按模式工具白名单（缺失/非法时回落默认） */
function loadTools() {
  let raw = null
  try {
    raw = JSON.parse(readFileSync(TOOLS_FILE, 'utf8'))
  } catch {
    raw = null
  }
  const out = {}
  for (const [mode, def] of Object.entries(DEFAULT_TOOLS)) {
    const list = Array.isArray(raw?.[mode]) ? raw[mode].filter((t) => VALID_TOOLS.has(t)) : def
    out[mode] = list.length ? list : [...def]
  }
  return out
}

export const TOOLS = loadTools()

/** 设置面板开关工具：校验 + 内存生效 + 落盘 tools.json（已缓存会话重建后生效） */
export function setModeTools(mode, tools) {
  if (!DEFAULT_TOOLS[mode]) throw new Error(`未知模式：${mode}`)
  const list = [...new Set(Array.isArray(tools) ? tools.filter((t) => VALID_TOOLS.has(t)) : [])]
  if (!list.length) throw new Error('至少保留一个工具')
  TOOLS[mode] = list
  writeFileSync(TOOLS_FILE, JSON.stringify(TOOLS, null, 2))
  return list
}

let modelRuntimePromise = null
export function getModelRuntime() {
  if (!modelRuntimePromise) {
    const dir = getAgentDir()
    modelRuntimePromise = ModelRuntime.create({
      authPath: join(dir, 'auth.json'),
      modelsPath: join(dir, 'models.json'),
    })
  }
  return modelRuntimePromise
}

/**
 * 暂存重定向 extension：拦截 write/edit 把目标路径改写到 .staging/<sid>/，
 * 真实 vault 在人工审核通过前不被触碰；read 命中已暂存文件时也重定向。
 * holder: { current, get() } —— 任务模式预建暂存会话；query 模式首次写入时才懒创建。
 */
function stagingExtension(holder) {
  return (pi) => {
    pi.on('tool_call', (event) => {
      const name = event.toolName
      if (name === 'write' || name === 'edit') {
        const rel = toVaultRel(event.input?.path)
        if (!rel) return { block: true, reason: '审核门：禁止写 vault 之外的路径' }
        if (!rel.startsWith('wiki/'))
          return { block: true, reason: `审核门：只允许写 wiki/ 目录（${rel} 被拒绝）。raw/ 不可变，output/ 请走专用保存接口` }
        const sess = holder.get()
        ensureStagedBase(sess, rel)
        sess.files.add(rel)
        event.input.path = stagedPath(sess, rel)
        return undefined
      }
      if (name === 'read') {
        const rel = toVaultRel(event.input?.path)
        const sess = holder.current
        if (rel && sess?.files.has(rel)) event.input.path = stagedPath(sess, rel)
      }
      return undefined
    })
  }
}

async function applyModel(entry, model) {
  if (!model?.provider || !model?.id) return
  const key = `${model.provider}/${model.id}`
  if (entry.modelKey === key) return
  const rt = await getModelRuntime()
  const m = rt.getModel(model.provider, model.id)
  if (!m) throw new Error(`模型不存在：${key}`)
  await entry.session.setModel(m)
  entry.modelKey = key
}

/** 会话级 thinking level 切换（off/minimal/low/medium/high/xhigh/max） */
function applyThinking(entry, level) {
  if (!level) return
  try {
    entry.session.setThinkingLevel(level)
  } catch { /* 模型不支持时静默忽略 */ }
}

/** 取得（或创建/恢复）指定模式的会话；mode 不匹配时重建（同一 JSONL 文件不可双实例打开） */
export async function obtainSession({ sessionId = null, mode = 'query', stagingSess = null, model = null, thinkingLevel = null }) {
  const hit = sessionId ? cache.get(sessionId) : null
  if (hit && !hit.busy && hit.mode === mode) {
    hit.lastActive = Date.now()
    await applyModel(hit, model)
    applyThinking(hit, thinkingLevel)
    return hit
  }
  if (hit) await disposeEntry(sessionId)

  let sm
  let resolvedId = sessionId
  if (sessionId) {
    const infos = await SessionManager.list(VAULT)
    const info = infos.find((s) => s.id === sessionId || s.id.startsWith(sessionId))
    if (!info) throw new Error(`会话不存在：${sessionId}`)
    sm = await SessionManager.open(info.path)
    resolvedId = info.id
  } else {
    sm = await SessionManager.create(VAULT)
    resolvedId = sm.getSessionId()
  }

  const projectExtDir = join(VAULT, '.pi', 'extensions')
  const loaderOptions = {
    cwd: VAULT,
    agentDir: getAgentDir(),
    // 仅加载项目级 extensions（llmwiki/.pi/extensions），不加载 ~/.pi/agent 全局插件（与 skills 同策略）
    noExtensions: true,
    additionalExtensionPaths: existsSync(projectExtDir) ? [projectExtDir] : [],
    appendSystemPromptOverride: (base) => [...base, GUIDES[mode]],
  }
  // 审核门：ingest/lint 用外部传入的暂存会话；query 按会话懒创建（首次写入才实际建）
  const stagingHolder = { current: stagingSess ?? null }
  stagingHolder.get = () => (stagingHolder.current ??= createSession('chat', '会话改动'))
  loaderOptions.extensionFactories = [stagingExtension(stagingHolder)]
  const loader = new DefaultResourceLoader(loaderOptions)
  await loader.reload()

  const opts = { cwd: VAULT, resourceLoader: loader, tools: TOOLS[mode], sessionManager: sm }
  if (thinkingLevel) opts.thinkingLevel = thinkingLevel
  if (model?.provider && model?.id) {
    const rt = await getModelRuntime()
    const m = rt.getModel(model.provider, model.id)
    if (m) opts.model = m
  }
  const { session } = await createAgentSession(opts)
  const entry = {
    sessionId: resolvedId,
    mode,
    session,
    sm,
    stagingSess,
    stagingHolder,
    modelKey: model?.provider && model?.id ? `${model.provider}/${model.id}` : (session.model ? `${session.model.provider?.id ?? session.model.provider}/${session.model.id}` : null),
    lastContextPage: null,
    busy: false,
    lastActive: Date.now(),
  }
  cache.set(resolvedId, entry)
  return entry
}

export async function disposeEntry(sessionId) {
  const e = cache.get(sessionId)
  if (!e) return
  try {
    e.session.dispose()
  } catch { /* ignore */ }
  cache.delete(sessionId)
}

export const cachedEntry = (sessionId) => cache.get(sessionId) || null

// 空闲清理（server 生命周期内定时扫描；busy 会话不清）
setInterval(() => {
  const now = Date.now()
  for (const [id, e] of cache) if (!e.busy && now - e.lastActive > IDLE_MS) disposeEntry(id)
}, 5 * 60 * 1000).unref()

/* ————— 会话列表 / 消息恢复 / 重命名 / 删除 ————— */

export async function listSessions() {
  const infos = await SessionManager.list(VAULT)
  return infos
    .sort((a, b) => new Date(b.modified) - new Date(a.modified))
    .map((s) => ({
      id: s.id,
      name: s.name || null,
      created: s.created,
      modified: s.modified,
      messageCount: s.messageCount,
      firstMessage: (s.firstMessage || '').slice(0, 140),
    }))
}

const blocksText = (content) => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
}

const toolDetail = (args) => {
  if (!args || typeof args !== 'object') return null
  return args.path ?? args.pattern ?? args.file_path ?? null
}

/** 线性回放主分支，把 JSONL entries 转成前端 turns 消息格式（pi-web 风格） */
export async function sessionMessages(sessionId) {
  const cached = cache.get(sessionId)
  let sm = cached?.sm
  if (!sm) {
    const infos = await SessionManager.list(VAULT)
    const info = infos.find((s) => s.id === sessionId || s.id.startsWith(sessionId))
    if (!info) return null
    sm = await SessionManager.open(info.path)
  }
  const out = []
  for (const e of sm.getBranch()) {
    if (e.type !== 'message' || !e.message) continue
    const m = e.message
    if (m.role === 'user') {
      const text = blocksText(m.content)
      if (text.trim()) out.push({ role: 'user', text, ts: e.timestamp ?? null })
    } else if (m.role === 'assistant') {
      const blocks = Array.isArray(m.content) ? m.content : []
      const turn = {
        model: m.model ?? m.provider ?? null,
        thinking: blocks.filter((b) => b && b.type === 'thinking' && typeof b.thinking === 'string').map((b) => b.thinking).join('\n'),
        tools: blocks
          .filter((b) => b && (b.type === 'toolCall' || b.type === 'tool_call' || b.type === 'toolUse'))
          .map((b) => ({
            id: b.id ?? b.toolCallId ?? null,
            name: b.name || b.toolName || 'tool',
            args: b.arguments ?? b.input ?? b.args ?? null,
            running: false,
            isError: false,
            durationMs: null,
            result: null,
          })),
        usage: m.usage
          ? { input: m.usage.input ?? 0, output: m.usage.output ?? 0, cacheRead: m.usage.cacheRead ?? 0 }
          : null,
        cost: m.usage?.cost?.total ?? null,
        text: blocksText(m.content),
      }
      if (turn.text.trim() || turn.tools.length || turn.thinking.trim())
        out.push({ role: 'assistant', turns: [turn], ts: e.timestamp ?? null })
    } else if (m.role === 'toolResult' || m.role === 'tool') {
      // 把工具结果回填到上一条 assistant 消息的对应 tool
      const prev = out[out.length - 1]
      if (prev?.role === 'assistant' && prev.turns?.length) {
        const turn = prev.turns[prev.turns.length - 1]
        const id = m.toolCallId ?? m.toolCall?.id ?? null
        const t = turn.tools.find((x) => x.id === id) ?? turn.tools.find((x) => x.result == null)
        if (t) {
          t.result = blocksText(m.content) || null
          t.isError = !!m.isError
        }
      }
    }
  }
  return { sessionId: cached?.sessionId ?? sessionId, name: sm.getSessionName?.() ?? null, messages: out }
}

export async function renameSession(sessionId, name) {
  const cached = cache.get(sessionId)
  if (cached) {
    cached.sm.appendSessionInfo(name)
    return true
  }
  const infos = await SessionManager.list(VAULT)
  const info = infos.find((s) => s.id === sessionId || s.id.startsWith(sessionId))
  if (!info) return false
  const sm = await SessionManager.open(info.path)
  sm.appendSessionInfo(name)
  return true
}

export async function deleteSession(sessionId) {
  await disposeEntry(sessionId)
  const infos = await SessionManager.list(VAULT)
  const info = infos.find((s) => s.id === sessionId || s.id.startsWith(sessionId))
  if (!info) return false
  if (existsSync(info.path)) rmSync(info.path)
  return true
}
