// sessions.mjs — 持久化会话缓存（多 vault 版本）：AgentSession 按 sessionId 复用（30 分钟空闲自动 dispose），
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
  loadSkillsFromDir,
  formatSkillsForPrompt,
} from '@earendil-works/pi-coding-agent'
import { QUERY_GUIDE, INGEST_GUIDE, LINT_GUIDE } from './vault.mjs'
import { getVaultPath, getDefaultVaultId } from './registry.mjs'
import { createSession, ensureStagedBase, stagedPath, toVaultRel } from './staging.mjs'

const IDLE_MS = 30 * 60 * 1000

/** sessionId → { sessionId, vaultId, mode, session, sm, stagingSess, modelKey, lastContextPage, busy, lastActive } */
const cache = new Map()

const GUIDES = { query: QUERY_GUIDE, ingest: INGEST_GUIDE, lint: LINT_GUIDE }

/** 斜杠技能调用说明：用户消息以 /skill:<name>（或兼容的 /<name>）开头时，按系统提示技能索引读取 SKILL.md 执行 */
const SKILL_INVOCATION_NOTE = `## 斜杠技能（/skill:name）
当用户消息以 /skill:<name> 开头（兼容裸 /<name>，后面可跟参数）时：该技能已在下方技能索引中列出。请用 read 工具读取其 SKILL.md 全文，并严格按其流程执行；斜杠命令后的文本作为参数。不要中途停下等待确认——写入类技能一次性完成，由审核门在事后交由人工审阅。`

/** 读取项目级技能索引并格式化为系统提示片段（pi 原生 Agent-Skills 方式，不内联全文） */
function buildSkillsPrompt(vaultPath) {
  try {
    const dir = join(vaultPath, '.pi', 'skills')
    if (!existsSync(dir)) return ''
    const { skills } = loadSkillsFromDir({ dir, source: 'project' })
    if (!skills.length) return ''
    return formatSkillsForPrompt(skills, 'read')
  } catch {
    return ''
  }
}

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
function stagingExtension(holder, vaultPath) {
  return (pi) => {
    pi.on('tool_call', (event) => {
      const name = event.toolName
      if (name === 'write' || name === 'edit') {
        const rel = toVaultRel(vaultPath, event.input?.path)
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
        const rel = toVaultRel(vaultPath, event.input?.path)
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
export async function obtainSession({ sessionId = null, mode = 'query', stagingSess = null, stagingTarget = null, model = null, thinkingLevel = null, vaultId = null }) {
  const resolvedVaultId = vaultId || getDefaultVaultId()
  const vaultPath = getVaultPath(resolvedVaultId)
  if (!vaultPath) throw new Error(`vault not found: ${resolvedVaultId}`)

  const hit = sessionId ? cache.get(sessionId) : null
  if (hit && !hit.busy && hit.mode === mode && hit.vaultId === resolvedVaultId) {
    hit.lastActive = Date.now()
    await applyModel(hit, model)
    applyThinking(hit, thinkingLevel)
    return hit
  }
  if (hit) await disposeEntry(sessionId)

  let sm
  let resolvedId = sessionId
  if (sessionId) {
    const infos = await SessionManager.list(vaultPath)
    const info = infos.find((s) => s.id === sessionId || s.id.startsWith(sessionId))
    if (!info) throw new Error(`会话不存在：${sessionId}`)
    sm = await SessionManager.open(info.path)
    resolvedId = info.id
  } else {
    sm = await SessionManager.create(vaultPath)
    resolvedId = sm.getSessionId()
  }

  const projectExtDir = join(vaultPath, '.pi', 'extensions')
  const skillsPrompt = buildSkillsPrompt(vaultPath)
  const loaderOptions = {
    cwd: vaultPath,
    agentDir: getAgentDir(),
    // 仅加载项目级 extensions（<vault>/.pi/extensions），不加载 ~/.pi/agent 全局插件
    noExtensions: true,
    additionalExtensionPaths: existsSync(projectExtDir) ? [projectExtDir] : [],
    // 技能索引改由下方手动注入（仅项目级），关闭 loader 默认技能加载以避免全局技能混入/重复
    noSkills: true,
    appendSystemPromptOverride: (base) =>
      [...base, GUIDES[mode], SKILL_INVOCATION_NOTE, skillsPrompt].filter(Boolean),
  }
  // 审核门：ingest/lint 用外部传入的暂存会话；query 按会话懒创建（首次写入才实际建），target 取触发消息摘要便于溯源
  const stagingHolder = { current: stagingSess ?? null }
  stagingHolder.get = () => (stagingHolder.current ??= createSession(vaultPath, 'chat', stagingTarget || '会话改动'))
  loaderOptions.extensionFactories = [stagingExtension(stagingHolder, vaultPath)]
  const loader = new DefaultResourceLoader(loaderOptions)
  await loader.reload()

  const opts = { cwd: vaultPath, resourceLoader: loader, tools: TOOLS[mode], sessionManager: sm }
  if (thinkingLevel) opts.thinkingLevel = thinkingLevel
  if (model?.provider && model?.id) {
    const rt = await getModelRuntime()
    const m = rt.getModel(model.provider, model.id)
    if (m) opts.model = m
  }
  const { session } = await createAgentSession(opts)
  const entry = {
    sessionId: resolvedId,
    vaultId: resolvedVaultId,
    vaultPath,
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

/**
 * 累计用量细分（pi-web session-stats 同款口径）：对会话全部条目聚合，除 assistant/toolResult 消息外，
 * 还计入 compaction / branch_summary / usage（如缓存预热，计费但不进上下文）条目携带的 usage，
 * 因此总量随会话生命周期单调增长，compaction 摘要掉旧历史也不会回退计数。
 */
function sumEntriesStats(entries) {
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  let cost = 0
  const add = (u) => {
    if (!u) return
    tokens.input += u.input ?? 0
    tokens.output += u.output ?? 0
    tokens.cacheRead += u.cacheRead ?? 0
    tokens.cacheWrite += u.cacheWrite ?? 0
    cost += u.cost?.total ?? 0
  }
  for (const e of entries ?? []) {
    if (e.type === 'usage' || e.type === 'compaction' || e.type === 'branch_summary') {
      add(e.usage)
      continue
    }
    if (e.type === 'message' && (e.message?.role === 'assistant' || e.message?.role === 'toolResult')) add(e.message.usage)
  }
  tokens.total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite
  return { tokens, cost: Number(cost.toFixed(6)) }
}

/** 活跃缓存会话的累计细分：优先 SDK getSessionStats()（口径与本文件 sumEntriesStats 一致），异常时回落磁盘条目重算 */
function statsSnapshot(session) {
  try {
    const s = session.getSessionStats?.()
    if (s?.tokens) {
      const t = s.tokens
      return {
        tokens: {
          input: t.input ?? 0,
          output: t.output ?? 0,
          cacheRead: t.cacheRead ?? 0,
          cacheWrite: t.cacheWrite ?? 0,
          total: t.total ?? (t.input ?? 0) + (t.output ?? 0) + (t.cacheRead ?? 0) + (t.cacheWrite ?? 0),
        },
        cost: Number((s.cost ?? 0).toFixed(6)),
      }
    }
  } catch { /* ignore */ }
  try {
    return sumEntriesStats(session.sessionManager?.getEntries?.())
  } catch {
    return null
  }
}

/** 活跃缓存会话的实时用量（cost + SDK 上下文占用 + 累计细分）；非活跃会话返回 null */
export function sessionUsage(sessionId) {
  const e = cache.get(sessionId)
  if (!e) return null
  let contextUsage = null
  try {
    contextUsage = e.session.getContextUsage?.() ?? null
  } catch { /* ignore */ }
  return { cost: e.session.state?.cost ?? 0, contextUsage, stats: statsSnapshot(e.session) }
}

/** 冷会话（不在活跃缓存）累计细分：只读磁盘转录重算，不懒恢复会话；找不到会话返回 null */
export async function coldSessionStats(sessionId, vaultId) {
  const vaultPath = getVaultPath(vaultId || getDefaultVaultId())
  if (!vaultPath) return null
  const infos = await SessionManager.list(vaultPath)
  const info = infos.find((s) => s.id === sessionId || s.id.startsWith(sessionId))
  if (!info) return null
  const sm = SessionManager.open(info.path)
  return sumEntriesStats(sm.getBranch())
}

/**
 * 上下文检视：完整系统提示词 + 模式化工具集 + 用量。
 * 系统提示由运行时拼装（AGENTS.md + 技能索引 + 模式 GUIDE）；会话不在活跃缓存时先按磁盘转录懒恢复（与下一条消息同路径），任意历史会话均可检视。
 */
export function sessionContext(sessionId) {
  const e = cache.get(sessionId)
  if (!e) return null
  let contextUsage = null
  let systemPrompt = null
  try {
    contextUsage = e.session.getContextUsage?.() ?? null
    systemPrompt = e.session.systemPrompt ?? null
  } catch { /* ignore */ }
  return {
    active: true,
    mode: e.mode,
    vaultId: e.vaultId,
    model: e.modelKey,
    systemPrompt,
    tools: TOOLS[e.mode] ?? null,
    contextUsage,
    cost: e.session.state?.cost ?? 0,
  }
}

/** 检视入口：缓存未命中时从磁盘恢复会话（mode=query）后再取上下文；恢复失败（会话不存在/损坏）返回 null */
export async function sessionContextOrRestore(sessionId, vaultId = null) {
  if (!cache.has(sessionId)) {
    try {
      await obtainSession({ sessionId, mode: 'query', vaultId })
    } catch {
      return null
    }
  }
  return sessionContext(sessionId)
}

// 空闲清理（server 生命周期内定时扫描；busy 会话不清）
setInterval(() => {
  const now = Date.now()
  for (const [id, e] of cache) if (!e.busy && now - e.lastActive > IDLE_MS) disposeEntry(id)
}, 5 * 60 * 1000).unref()

/* ————— 会话列表 / 消息恢复 / 重命名 / 删除 ————— */

export async function listSessions(vaultId) {
  const vaultPath = getVaultPath(vaultId || getDefaultVaultId())
  if (!vaultPath) return []
  const infos = await SessionManager.list(vaultPath)
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

/** 只读取会话的 SessionManager：优先复用热缓存实例（同一 JSONL 不可双实例打开），冷会话从磁盘 open 恢复 */
async function openSmForRead(sessionId, vaultId) {
  const cached = cache.get(sessionId)
  if (cached?.sm) return cached.sm
  const vaultPath = cached?.vaultPath || getVaultPath(vaultId || getDefaultVaultId())
  if (!vaultPath) return null
  const infos = await SessionManager.list(vaultPath)
  const info = infos.find((s) => s.id === sessionId || s.id.startsWith(sessionId))
  if (!info) return null
  return SessionManager.open(info.path)
}

/** 回放指定分支（leafId 省略时跟随当前 leaf），把 JSONL entries 转成前端 turns 消息格式（pi-web 风格） */
export async function sessionMessages(sessionId, vaultId, leafId) {
  const cached = cache.get(sessionId)
  const sm = await openSmForRead(sessionId, vaultId)
  if (!sm) return null
  const out = []
  for (const e of sm.getBranch(leafId)) {
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

/** 按 content blocks 原始顺序生成 parts（真实时序：thinking/叙述文本/工具调用交错）；thinking 合并为一项，tool 引用 tools 数组下标 */
function blocksParts(blocks, toolIndexById) {
  const parts = []
  let thinkingUsed = false
  for (const b of blocks) {
    if (!b) continue
    if (b.type === 'thinking' && typeof b.thinking === 'string' && b.thinking.trim()) {
      if (!thinkingUsed) { parts.push({ kind: 'thinking' }); thinkingUsed = true }
    } else if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
      parts.push({ kind: 'text', text: b.text })
    } else if (b.type === 'toolCall' || b.type === 'tool_call' || b.type === 'toolUse') {
      const id = b.id ?? b.toolCallId ?? null
      const idx = id != null && toolIndexById.has(id) ? toolIndexById.get(id) : parts.filter((p) => p.kind === 'tool').length
      parts.push({ kind: 'tool', toolIndex: idx })
    }
  }
  return parts
}

/** 单条 entry 详情（供历史面板“只看选中这一条”）：工具结果按 toolCallId 全局匹配回填 */
export async function sessionEntryDetail(sessionId, vaultId, entryId) {
  const sm = await openSmForRead(sessionId, vaultId)
  if (!sm) return null
  const all = sm.getEntries()
  const entry = all.find((e) => e.id === entryId)
  if (!entry) return null
  // toolResult 是独立于 assistant 的条目，按 toolCallId 建立全局映射
  const results = new Map()
  for (const e of all) {
    if (e.type === 'message' && (e.message?.role === 'toolResult' || e.message?.role === 'tool')) {
      const m = e.message
      const id = m.toolCallId ?? m.toolCall?.id ?? null
      if (id) results.set(id, { text: blocksText(m.content), isError: !!m.isError })
    }
  }
  const base = { sessionId, entryId, type: entry.type, ts: entry.timestamp ?? null }
  if (entry.type === 'message' && entry.message) {
    const m = entry.message
    if (m.role === 'user') return { ...base, role: 'user', text: blocksText(m.content) }
    if (m.role === 'assistant') {
      const blocks = Array.isArray(m.content) ? m.content : []
      const tools = blocks
        .filter((b) => b && (b.type === 'toolCall' || b.type === 'tool_call' || b.type === 'toolUse'))
        .map((b) => {
          const id = b.id ?? b.toolCallId ?? null
          const r = id ? results.get(id) : null
          return { id, name: b.name || b.toolName || 'tool', args: b.arguments ?? b.input ?? b.args ?? null, result: r?.text ?? null, isError: !!r?.isError }
        })
      const toolIndexById = new Map()
      tools.forEach((t, i) => { if (t.id != null && !toolIndexById.has(t.id)) toolIndexById.set(t.id, i) })
      return {
        ...base,
        role: 'assistant',
        model: m.model ?? m.provider ?? null,
        thinking: blocks.filter((b) => b && b.type === 'thinking' && typeof b.thinking === 'string').map((b) => b.thinking).join('\n'),
        text: blocksText(m.content),
        tools,
        parts: blocksParts(blocks, toolIndexById),
        usage: m.usage ? { input: m.usage.input ?? 0, output: m.usage.output ?? 0, cacheRead: m.usage.cacheRead ?? 0 } : null,
        cost: m.usage?.cost?.total ?? null,
      }
    }
    return { ...base, role: String(m.role || 'message'), text: blocksText(m.content) }
  }
  if (entry.type === 'compaction') return { ...base, role: 'compaction', summary: entry.summary ?? '', tokensBefore: entry.tokensBefore ?? null }
  if (entry.type === 'branch_summary') return { ...base, role: 'branch', summary: entry.summary ?? '' }
  return { ...base, role: entry.type, text: entryPreview(entry).preview }
}

export async function renameSession(sessionId, name, vaultId) {
  const cached = cache.get(sessionId)
  if (cached) {
    cached.sm.appendSessionInfo(name)
    return true
  }
  const vaultPath = getVaultPath(vaultId || getDefaultVaultId())
  if (!vaultPath) return false
  const infos = await SessionManager.list(vaultPath)
  const info = infos.find((s) => s.id === sessionId || s.id.startsWith(sessionId))
  if (!info) return false
  const sm = await SessionManager.open(info.path)
  sm.appendSessionInfo(name)
  return true
}

export async function deleteSession(sessionId, vaultId) {
  await disposeEntry(sessionId)
  const cached = cache.get(sessionId)
  const vaultPath = cached?.vaultPath || getVaultPath(vaultId || getDefaultVaultId())
  if (!vaultPath) return false
  const infos = await SessionManager.list(vaultPath)
  const info = infos.find((s) => s.id === sessionId || s.id.startsWith(sessionId))
  if (!info) return false
  if (existsSync(info.path)) rmSync(info.path)
  return true
}

/* ————— 会话完整历史：分支树 + 只读回放 + 分支切换 ————— */

const MAX_TREE_NODES = 3000

/** 从单个 session entry 提取角色与瘦身预览（供前端分支树展示） */
function entryPreview(entry) {
  if (entry.type === 'message' && entry.message) {
    const m = entry.message
    if (m.role === 'user') return { role: 'user', preview: blocksText(m.content).slice(0, 140) }
    if (m.role === 'assistant') return { role: 'assistant', preview: blocksText(m.content).slice(0, 140) }
    if (m.role === 'toolResult' || m.role === 'tool') return { role: 'tool', preview: '' }
    if (m.role === 'system') return { role: 'system', preview: blocksText(m.content).slice(0, 140) }
    return { role: String(m.role || 'message'), preview: '' }
  }
  if (entry.type === 'compaction') return { role: 'compaction', preview: String(entry.summary || '').slice(0, 140) }
  if (entry.type === 'branch_summary') return { role: 'branch', preview: String(entry.summary || '').slice(0, 140) }
  if (entry.type === 'model_change') return { role: 'model', preview: `${entry.provider}/${entry.modelId}` }
  if (entry.type === 'thinking_level_change') return { role: 'thinking', preview: String(entry.thinkingLevel ?? '') }
  if (entry.type === 'usage') return { role: 'usage', preview: String(entry.kind ?? '') }
  return { role: entry.type, preview: '' }
}

/** 序列化分支树（带节点预算保护，防止超长转录拖慢）；budget 耗尽时提前截断子树 */
function serializeTree(nodes, state) {
  const out = []
  for (const node of nodes) {
    if (state.budget <= 0) break
    state.budget--
    const { role, preview } = entryPreview(node.entry)
    const children = state.budget > 0 ? serializeTree(node.children, state) : []
    out.push({
      id: node.entry.id,
      parentId: node.entry.parentId ?? null,
      type: node.entry.type,
      timestamp: node.entry.timestamp ?? null,
      label: node.label ?? null,
      role,
      preview,
      children,
    })
  }
  return out
}

/** 返回会话的完整分支树 + 当前 leaf（只读，冷会话从磁盘恢复） */
export async function sessionTree(sessionId, vaultId) {
  const sm = await openSmForRead(sessionId, vaultId)
  if (!sm) return null
  const state = { budget: MAX_TREE_NODES }
  const tree = serializeTree(sm.getTree(), state)
  return {
    sessionId,
    name: sm.getSessionName?.() ?? null,
    leafId: sm.getLeafId?.() ?? null,
    entryCount: sm.getEntries().length,
    truncated: state.budget <= 0,
    tree,
  }
}

/** 切换活动会话的 leaf 到指定 entry（同文件内 branch，不新建会话文件）；仅限已打开且空闲的会话 */
export async function branchSession(sessionId, entryId) {
  const cached = cache.get(sessionId)
  if (!cached) return { ok: false, error: '会话未打开，请先在左栏「会话」中打开该会话后再切换分支' }
  if (cached.busy) return { ok: false, error: '会话正在进行中，请等待本轮结束后再切换分支' }
  // 收集需同步 leaf 的实例：读路径用 cached.sm；若 session 持有另一实例则一并移动
  const managers = []
  if (cached.sm) managers.push(cached.sm)
  const live = cached.session?.sessionManager
  if (live && live !== cached.sm) managers.push(live)
  if (!managers.length) return { ok: false, error: '会话未就绪' }
  if (!managers[0].getEntry?.(entryId)) return { ok: false, error: '目标节点不存在' }
  // 用 SessionManager.branch 纯移动 leaf 指针（append-only、不改历史）；
  // 下一轮 prompt 会作为该节点子代追写 → 从该分支继续。不用 navigateTree（它有 TUI 专属语义，会落到产物节点）
  for (const sm of managers) sm.branch(entryId)
  cached.lastActive = Date.now()
  return { ok: true, leafId: entryId }
}
