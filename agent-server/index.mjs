// index.mjs — agent-server（多 vault 版本）：pi coding agent SDK 嵌入，为 wiki-viewer 提供
// 持久化会话问答（chat）、摄取/修复任务（task，经暂存审核门）、会话管理、
// 文件浏览、模型与 Skills 信息、多知识库管理。启动：npm start（默认端口 8787，仅绑 localhost）
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAgentDir, createAgentSession, SessionManager, DefaultResourceLoader } from '@earendil-works/pi-coding-agent'
import { DEFAULT_VAULT, pageContextBlock, buildTaskPrompt, readVaultFile } from './lib/vault.mjs'
import { loadRegistry, getVaultPath, getDefaultVaultId, resolveVaultId, addVault, WORKSPACE } from './lib/registry.mjs'
import {
  applySession,
  applyFiles,
  collectDiffs,
  createSession,
  discardSession,
  discardFiles,
  getSession,
  listSessions as listStaging,
  recoverFromDisk,
  toVaultRel,
  writeVaultFile,
} from './lib/staging.mjs'
import {
  obtainSession,
  disposeEntry,
  cachedEntry,
  listSessions,
  sessionMessages,
  renameSession,
  deleteSession,
  getModelRuntime,
  TOOLS,
  TOOL_CATALOG,
  setModeTools,
  sessionContextOrRestore,
  sessionUsage,
  coldSessionStats,
} from './lib/sessions.mjs'
import { saveUploadedFiles, clipUrl, markIngested } from './lib/inbox.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.AGENT_PORT || 8787)
// 内嵌 SDK 版本运行时读取（随 npm 升级自动更新，不再硬编码）
const PI_VERSION = JSON.parse(
  readFileSync(join(__dirname, 'node_modules', '@earendil-works', 'pi-coding-agent', 'package.json'), 'utf8'),
).version
const SYNC_SCRIPT = join(__dirname, '..', 'wiki-viewer', 'scripts', 'sync-data.mjs')
const NEW_VAULT_SCRIPT = join(__dirname, '..', 'wiki-viewer', 'scripts', 'new-vault.mjs')

/* ————— HTTP 小工具 ————— */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
  res.end(JSON.stringify(obj))
}

function readBody(req) {
  return new Promise((ok, fail) => {
    let buf = ''
    req.on('data', (c) => {
      buf += c
      if (buf.length > 2e6) fail(new Error('body too large'))
    })
    req.on('end', () => {
      try {
        ok(buf ? JSON.parse(buf) : {})
      } catch (e) {
        fail(e)
      }
    })
    req.on('error', fail)
  })
}

function sseHead(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    ...CORS,
  })
}

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

/** 工具结果预览：提取文本内容并截断，供前端展开查看 */
function previewResult(result) {
  try {
    if (result == null) return null
    if (typeof result === 'string') return result.slice(0, 4000)
    const content = result.content ?? result
    if (typeof content === 'string') return content.slice(0, 4000)
    if (Array.isArray(content)) {
      const text = content
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n')
      return text ? text.slice(0, 4000) : null
    }
    return JSON.stringify(result).slice(0, 4000)
  } catch {
    return null
  }
}

/** 订阅 session 事件并转发为 SSE（pi-web 风格：thinking/tool(带耗时与结果)/turn(带每轮 usage)）；返回取消订阅函数 */
function pipeEvents(session, res) {
  const toolStarts = new Map() // toolCallId → start timestamp
  let lastCost = session.state?.cost ?? 0
  return session.subscribe((event) => {
    try {
      if (event.type === 'message_start' && event.message?.role === 'assistant') {
        sse(res, 'turnstart', {})
      } else if (event.type === 'message_update') {
        const ame = event.assistantMessageEvent
        if (ame?.type === 'text_delta') sse(res, 'delta', { text: ame.delta })
        else if (ame?.type === 'thinking_delta') sse(res, 'thinking', { text: ame.delta })
      } else if (event.type === 'tool_execution_start') {
        toolStarts.set(event.toolCallId, Date.now())
        sse(res, 'tool', { id: event.toolCallId, name: event.toolName, state: 'start', args: event.args ?? null })
      } else if (event.type === 'tool_execution_end') {
        const started = toolStarts.get(event.toolCallId)
        toolStarts.delete(event.toolCallId)
        sse(res, 'tool', {
          id: event.toolCallId,
          name: event.toolName,
          state: 'end',
          isError: !!event.isError,
          durationMs: started != null ? Date.now() - started : null,
          result: previewResult(event.result),
        })
      } else if (event.type === 'turn_end') {
        const u = event.message?.usage
        const total = session.state?.cost ?? 0
        const turnCost = Math.max(0, total - lastCost)
        lastCost = total
        sse(res, 'turn', {
          model: session.model?.name ?? session.model?.id ?? null,
          usage: u ? { input: u.input ?? 0, output: u.output ?? 0, cacheRead: u.cacheRead ?? 0 } : null,
          cost: Number(turnCost.toFixed(6)),
        })
      }
    } catch {
      /* 客户端已断开：忽略写出失败 */
    }
  })
}

function usageSnapshot(session) {
  let contextUsage = null
  try {
    contextUsage = session.getContextUsage?.() ?? null
  } catch { /* ignore */ }
  return { cost: session.state?.cost ?? 0, contextUsage, stats: statsSnapshot(session) }
}

/** 会话累计细分（tokens in/out/cache/cost）：优先 SDK getSessionStats，失败时回落磁盘条目重算 */
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
  return null
}

/* ————— 流式会话执行（chat/task 共用骨架） ————— */
async function runStreaming(req, res, obtain, promptText, { onAfterPrompt, onSessionReady } = {}) {
  sseHead(res)
  let entry = null
  let closed = false
  let unsubscribe = null
  req.on('close', () => {
    closed = true
    // 持久会话不 dispose，只中断当前 turn
    if (entry?.busy) entry.session.abort().catch(() => {})
  })
  try {
    entry = await obtain()
    sse(res, 'session', {
      sessionId: entry.sessionId,
      name: entry.sm.getSessionName?.() ?? null,
      mode: entry.mode,
    })
    onSessionReady?.(entry)
    // 流开始即推一次实时用量（上下文/成本），不必等轮结束
    sse(res, 'usage', usageSnapshot(entry.session))
    unsubscribe = pipeEvents(entry.session, res)
    entry.busy = true
    await entry.session.prompt(promptText)
    if (!closed) {
      if (onAfterPrompt) await onAfterPrompt(entry)
      sse(res, 'usage', usageSnapshot(entry.session))
      sse(res, 'done', {})
    }
  } catch (e) {
    console.error('[agent-server]', e)
    if (!closed) sse(res, 'error', { message: String(e?.message || e) })
  } finally {
    if (entry) {
      entry.busy = false
      entry.lastActive = Date.now()
    }
    unsubscribe?.()
    if (!closed) res.end()
  }
}

/* ————— 路由处理 ————— */

// chat：基于 entry 状态拼 prompt（上下文页去重，持久会话不重复注入）
async function handleChat(req, res) {
  const body = await readBody(req).catch(() => null)
  const message = String(body?.message || '').trim()
  if (!message) return json(res, 400, { error: 'message is required' })
  const contextPageId = body?.contextPageId || null
  const vault = resolveVaultId(body?.vaultId)
  if (!vault) return json(res, 400, { error: `vault not found: ${body?.vaultId}` })

  // @文件引用：读取 vault 内文件内容注入上下文
  let refBlocks = ''
  const refs = [...message.matchAll(/@([\w./-]+\.\w+)/g)]
    .map((m) => m[1])
    .filter((v, i, a) => a.indexOf(v) === i)
  for (const r of refs) {
    const content = readVaultFile(vault.path, r)
    if (content != null) refBlocks += `\n【引用文件 @${r} 的内容】\n${content.slice(0, 20000)}\n`
  }

  // /skill 斜杠命令不再内联 SKILL.md 全文：技能索引已在系统提示（formatSkillsForPrompt），
  // 用户消息保持干净的斜杠原文，由模型按系统提示读取对应 SKILL.md 执行（pi 原生技能模型）。

  sseHead(res)
  let entry = null
  let closed = false
  let unsubscribe = null
  req.on('close', () => {
    closed = true
    if (entry?.busy) entry.session.abort().catch(() => {})
  })
  try {
    entry = await obtainSession({
      sessionId: body?.sessionId || null,
      mode: 'query',
      // 聊天懒建暂存会话的 target 取触发消息摘要（如 /skill:second-brain-ingest 003-005），批量摄取后可溯源
      stagingTarget: String(body?.message || '').slice(0, 60) || null,
      model: body?.model || null,
      thinkingLevel: body?.thinkingLevel || null,
      vaultId: vault.id,
    })
    sse(res, 'session', {
      sessionId: entry.sessionId,
      name: entry.sm.getSessionName?.() ?? null,
      mode: entry.mode,
    })
    // 流开始即推一次实时用量（上下文/成本），不必等轮结束
    sse(res, 'usage', usageSnapshot(entry.session))
    // 页面上下文只在切换时注入一次，避免持久会话里反复重复
    const ctx =
      contextPageId && contextPageId !== entry.lastContextPage ? pageContextBlock(vault.path, contextPageId) : ''
    entry.lastContextPage = contextPageId || entry.lastContextPage
    unsubscribe = pipeEvents(entry.session, res)
    entry.busy = true
    const promptParts = []
    if (ctx) promptParts.push(ctx)
    if (refBlocks) promptParts.push(refBlocks)
    promptParts.push(message)
    await entry.session.prompt(promptParts.join('\n'))
    if (!closed) {
      // 审核门：本轮若产生暂存改动（write/edit 被重定向），推送 diff 审核卡
      const st = entry.stagingHolder?.current
      const diffs = st ? collectDiffs(st.id) ?? [] : []
      if (diffs.length) sse(res, 'diffs', { sessionId: st.id, mode: 'chat', files: diffs })
      sse(res, 'usage', usageSnapshot(entry.session))
      sse(res, 'done', {})
    }
  } catch (e) {
    console.error('[agent-server]', e)
    if (!closed) sse(res, 'error', { message: String(e?.message || e) })
  } finally {
    if (entry) {
      entry.busy = false
      entry.lastActive = Date.now()
    }
    unsubscribe?.()
    if (!closed) res.end()
  }
}

/** 写入任务（ingest/lint）：独立暂存会话 + 审核门；结束后推送 diffs */
async function handleTask(req, res) {
  const body = await readBody(req).catch(() => null)
  const mode = body?.mode === 'lint' ? 'lint' : 'ingest'
  const vault = resolveVaultId(body?.vaultId)
  if (!vault) return json(res, 400, { error: `vault not found: ${body?.vaultId}` })

  let target
  if (mode === 'ingest') {
    const rawFile = String(body?.rawFile || '').trim()
    if (!rawFile) return json(res, 400, { error: 'rawFile is required' })
    const rel = toVaultRel(vault.path, rawFile.startsWith('raw/') ? rawFile : `raw/${rawFile}`)
    if (!rel || !rel.startsWith('raw/') || !existsSync(join(vault.path, rel)))
      return json(res, 400, { error: `raw 文件不存在：${rawFile}` })
    target = rel
  } else {
    const issues = Array.isArray(body?.issues) ? body.issues.filter(Boolean).map(String) : []
    if (!issues.length) return json(res, 400, { error: 'issues is required' })
    target = issues
  }

  const staging = createSession(vault.path, mode, mode === 'ingest' ? target : `${target.length} 项问题`)
  const detail =
    mode === 'ingest'
      ? target
      : `请修复以下知识库健康问题：\n${target.map((s, i) => `${i + 1}. ${s}`).join('\n')}`

  return runStreaming(
    req,
    res,
    () => obtainSession({ sessionId: body?.sessionId || null, mode, stagingSess: staging, vaultId: vault.id }),
    buildTaskPrompt(mode, detail),
    {
      onAfterPrompt: () => {
        const diffs = collectDiffs(staging.id) ?? []
        sse(res, 'diffs', { sessionId: staging.id, mode, target: staging.target, files: diffs })
      },
    },
  )
}

/** 重跑 viewer 同步脚本，刷新前端数据快照（同步所有 vault） */
function runSync() {
  try {
    execFileSync(process.execPath, [SYNC_SCRIPT], { stdio: 'pipe', timeout: 60000 })
    return true
  } catch (e) {
    console.error('[agent-server] sync failed:', e?.message)
    return false
  }
}

async function handleApply(req, res) {
  const body = await readBody(req).catch(() => null)
  const id = String(body?.sessionId || '')
  if (!getSession(id)) return json(res, 404, { error: `暂存会话不存在或已处理：${id}` })
  // 支持子集（逐文件应用）：body.files 为非空数组时只应用这些文件
  const subset = Array.isArray(body?.files) ? body.files.filter((f) => typeof f === 'string') : []
  if (subset.length) {
    const r = applyFiles(id, subset)
    if (!r) return json(res, 404, { error: `暂存会话不存在：${id}` })
    const synced = runSync()
    return json(res, 200, { ok: true, changed: r.changed, synced, done: r.done, remaining: r.remaining })
  }
  const changed = applySession(id)
  const synced = runSync()
  json(res, 200, { ok: true, changed, synced, done: true, remaining: 0 })
}

async function handleDiscard(req, res) {
  const body = await readBody(req).catch(() => null)
  const id = String(body?.sessionId || '')
  const subset = Array.isArray(body?.files) ? body.files.filter((f) => typeof f === 'string') : []
  if (subset.length) {
    const r = discardFiles(id, subset)
    if (!r) return json(res, 404, { error: `暂存会话不存在：${id}` })
    return json(res, 200, { ok: true, done: r.done, remaining: r.remaining })
  }
  const ok = discardSession(id)
  json(res, ok ? 200 : 404, ok ? { ok: true, done: true, remaining: 0 } : { error: `暂存会话不存在：${id}` })
}

/** 保存问答结果到 output/（成品出口：不走 agent，直接写入并重新同步） */
async function handleSaveOutput(req, res) {
  const body = await readBody(req).catch(() => null)
  const title = String(body?.title || '').trim()
  const content = String(body?.content || '')
  const question = String(body?.question || '').trim()
  if (!title || !content.trim()) return json(res, 400, { error: 'title 与 content 必填' })
  const vault = resolveVaultId(body?.vaultId)
  if (!vault) return json(res, 400, { error: `vault not found: ${body?.vaultId}` })
  const slug =
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'answer'
  const date = new Date().toISOString().slice(0, 10)
  const rel = `output/${slug}-${date.replace(/-/g, '')}.md`
  const md = `---\ntags: [output]\ncreated: ${date}\nupdated: ${date}\n---\n\n# ${title}\n\n${question ? `> 来源问题：${question}\n\n` : ''}${content.trim()}\n`
  try {
    writeVaultFile(vault.path, rel, md)
  } catch (e) {
    return json(res, 400, { error: String(e?.message || e) })
  }
  const synced = runSync()
  json(res, 200, { ok: true, path: rel, synced })
}

/* ————— 文件浏览（只读，限 vault 内） ————— */
const HIDDEN_DIRS = new Set(['.staging', '.git', 'node_modules', '.trash', '.obsidian', '.ok', '.cursor'])

function handleFiles(url, res) {
  const vault = resolveVaultId(url.searchParams.get('vaultId'))
  if (!vault) return json(res, 400, { error: 'vault not found' })
  const rel = toVaultRel(vault.path, url.searchParams.get('path') || '')
  if (rel === null) return json(res, 403, { error: 'path escapes vault' })
  const dir = join(vault.path, rel)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return json(res, 404, { error: `目录不存在：${rel || '/'}` })
  const entries = readdirSync(dir)
    .filter((n) => !HIDDEN_DIRS.has(n))
    .map((name) => {
      const st = statSync(join(dir, name))
      return { name, dir: st.isDirectory(), size: st.size, mtime: st.mtime.toISOString() }
    })
    .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1))
  json(res, 200, { path: rel, entries })
}

const MAX_FILE_BYTES = 2 * 1024 * 1024
function handleFile(url, res) {
  const vault = resolveVaultId(url.searchParams.get('vaultId'))
  if (!vault) return json(res, 400, { error: 'vault not found' })
  const rel = toVaultRel(vault.path, url.searchParams.get('path') || '')
  if (!rel) return json(res, 403, { error: 'path escapes vault' })
  const file = join(vault.path, rel)
  if (!existsSync(file) || !statSync(file).isFile()) return json(res, 404, { error: `文件不存在：${rel}` })
  const size = statSync(file).size
  const truncated = size > MAX_FILE_BYTES
  const content = truncated
    ? readFileSync(file, { encoding: 'utf8' }).slice(0, MAX_FILE_BYTES)
    : readFileSync(file, 'utf8')
  json(res, 200, { path: rel, size, truncated, content })
}

/* ————— 模型与 Skills ————— */

/** 默认模型探测：建一次性 in-memory 会话读 SDK 解析出的模型，结果缓存（/agent/models 与启动自检共用） */
let defaultModelPromise = null
function resolveDefaultModel() {
  if (!defaultModelPromise) {
    const vaultPath = getVaultPath(getDefaultVaultId()) || DEFAULT_VAULT
    defaultModelPromise = createAgentSession({
      cwd: vaultPath,
      tools: ['read'],
      sessionManager: SessionManager.inMemory(),
    })
      .then(({ session }) => {
        const m = session.model
        const out = m ? { provider: m.provider, id: m.id, name: m.name || m.id } : null
        session.dispose()
        return out
      })
      .catch(() => null)
  }
  return defaultModelPromise
}

async function handleModels(res) {
  try {
    const rt = await getModelRuntime()
    const models = rt
      .getAvailableSnapshot()
      .map((m) => ({
        provider: typeof m.provider === 'string' ? m.provider : (m.provider?.id ?? 'unknown'),
        id: m.id,
        name: m.name || m.id,
      }))
      .filter((m) => m.id)
    json(res, 200, { models, defaultModel: await resolveDefaultModel() })
  } catch (e) {
    json(res, 500, { error: String(e?.message || e) })
  }
}

/** 解析 SKILL.md frontmatter（name/description，description 支持 > 折叠块） */
function parseSkillFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return null
  const out = { name: '', description: '' }
  const lines = m[1].split(/\r?\n/)
  let curKey = null
  for (const line of lines) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (kv) {
      curKey = kv[1]
      const v = kv[2].trim()
      if (v && v !== '>' && v !== '|') out[curKey] = v
    } else if (curKey && line.match(/^\s+/)) {
      out[curKey] = ((out[curKey] || '') + ' ' + line.trim()).trim()
    }
  }
  return out.name ? out : null
}

function handleSkills(url, res) {
  const vault = resolveVaultId(url.searchParams.get('vaultId'))
  if (!vault) return json(res, 400, { error: 'vault not found' })
  // 仅加载项目级 skills（<vault>/.pi/skills），不读全局 ~/.pi/agent/skills
  const dir = join(vault.path, '.pi', 'skills')
  const skills = []
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      const f = join(dir, name, 'SKILL.md')
      if (!existsSync(f)) continue
      const fm = parseSkillFrontmatter(readFileSync(f, 'utf8'))
      if (fm) skills.push({ name: fm.name, description: fm.description || '', source: 'project' })
    }
  }
  json(res, 200, { skills })
}

/** 插件清单：会话实际加载的 extensions（仅项目级 .pi/extensions）+ server 内置插件 */
async function handleExtensions(url, res) {
  const vault = resolveVaultId(url.searchParams.get('vaultId'))
  if (!vault) return json(res, 400, { error: 'vault not found' })
  try {
    const projectExtDir = join(vault.path, '.pi', 'extensions')
    const loader = new DefaultResourceLoader({
      cwd: vault.path,
      agentDir: getAgentDir(),
      noExtensions: true,
      additionalExtensionPaths: existsSync(projectExtDir) ? [projectExtDir] : [],
    })
    await loader.reload()
    const r = loader.getExtensions()
    const vaultRel = (p) => {
      const rp = String(p).replace(/\\/g, '/')
      const v = vault.path.replace(/\\/g, '/')
      if (rp.startsWith(`${v}/`)) return rp.slice(v.length + 1)
      const a = getAgentDir().replace(/\\/g, '/')
      if (rp.startsWith(`${a}/`)) return `~/${rp.slice(a.length + 1)}`
      return rp
    }
    json(res, 200, {
      builtin: [
        {
          name: 'staging-gate',
          description: 'write/edit 重定向到 .staging/ 暂存审核门（ingest/lint 任务自动启用），审核通过前真实 vault 不被触碰',
        },
      ],
      extensions: r.extensions
        .filter((e) => !e.hidden)
        .map((e) => {
          const path = vaultRel(e.resolvedPath || e.path)
          return {
            path,
            scope: path.startsWith('~/') ? 'user' : 'project',
            tools: [...e.tools.keys()],
            commands: [...e.commands.keys()],
          }
        }),
      errors: r.errors.map((x) => ({ path: vaultRel(x.path), error: x.error })),
    })
  } catch (e) {
    json(res, 500, { error: String(e?.message || e) })
  }
}

/* ————— 文件搜索（@ 引用菜单用） ————— */
function walkFiles(dir, base, out) {
  for (const name of readdirSync(dir)) {
    if (HIDDEN_DIRS.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walkFiles(p, base, out)
    else out.push({ path: relative(base, p).replace(/\\/g, '/'), size: st.size, mtime: st.mtimeMs })
  }
  return out
}

function handleSearch(url, res) {
  const vault = resolveVaultId(url.searchParams.get('vaultId'))
  if (!vault) return json(res, 400, { error: 'vault not found' })
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()
  const all = walkFiles(vault.path, vault.path, [])
  const results = q
    ? all.filter((f) => f.path.toLowerCase().includes(q)).sort((a, b) => a.path.length - b.path.length)
    : all.sort((a, b) => b.mtime - a.mtime)
  json(res, 200, { results: results.slice(0, 30) })
}

/* ————— 会话压缩（/compact 命令） ————— */
async function handleCompact(req, res) {
  const body = await readBody(req).catch(() => null)
  const id = String(body?.sessionId || '')
  const entry = cachedEntry(id)
  if (!entry) return json(res, 404, { error: '会话不在活跃缓存中（先发送一条消息再压缩）' })
  try {
    const r = await entry.session.compact()
    json(res, 200, { ok: true, tokensBefore: r?.tokensBefore ?? null })
  } catch (e) {
    json(res, 500, { error: String(e?.message || e) })
  }
}

/* ————— 多知识库管理 ————— */

function handleVaults(res) {
  json(res, 200, { vaults: loadRegistry() })
}

async function handleNewVault(req, res) {
  const body = await readBody(req).catch(() => null)
  const id = String(body?.id || '').trim()
  const name = String(body?.name || '').trim()
  const path = String(body?.path || '').trim() || id
  const description = String(body?.description || '').trim()
  if (!id || !name) return json(res, 400, { error: 'id 与 name 必填' })
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return json(res, 400, { error: 'id 只允许小写字母、数字和连字符' })
  try {
    execFileSync(
      process.execPath,
      [NEW_VAULT_SCRIPT, '--id', id, '--name', name, '--path', path, ...(description ? ['--description', description] : [])],
      { stdio: 'pipe', timeout: 60000 },
    )
    json(res, 200, { ok: true, vaults: loadRegistry() })
  } catch (e) {
    const stderr = e?.stderr ? String(e.stderr) : ''
    json(res, 500, { error: stderr || String(e?.message || e) })
  }
}

/* ————— raw/ 收件箱：本地上传 + URL 剪藏 + 人工消化标记（不走审核门，server 直接落盘） ————— */

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024 // 单文件 20MB 上限

async function handleRawUpload(req, res) {
  const body = await readBody(req).catch(() => null)
  const vault = resolveVaultId(body?.vaultId)
  if (!vault) return json(res, 400, { error: `vault not found: ${body?.vaultId}` })
  const files = Array.isArray(body?.files) ? body.files : []
  if (!files.length) return json(res, 400, { error: 'files is required' })
  for (const f of files) {
    if (!f?.name || typeof f.contentBase64 !== 'string') return json(res, 400, { error: '每个文件需含 name 与 contentBase64' })
    if (f.contentBase64.length > MAX_UPLOAD_BYTES * 1.4) return json(res, 400, { error: `文件过大（>20MB）：${f.name}` })
  }
  try {
    const { written } = saveUploadedFiles(vault.path, files)
    const synced = runSync()
    json(res, 200, { ok: true, written, synced })
  } catch (e) {
    json(res, 500, { error: String(e?.message || e) })
  }
}

async function handleRawClip(req, res) {
  const body = await readBody(req).catch(() => null)
  const vault = resolveVaultId(body?.vaultId)
  if (!vault) return json(res, 400, { error: `vault not found: ${body?.vaultId}` })
  const urlToClip = String(body?.url || '').trim()
  if (!urlToClip) return json(res, 400, { error: 'url is required' })
  try {
    const result = await clipUrl(vault.path, urlToClip)
    const synced = runSync()
    json(res, 200, { ok: true, ...result, synced })
  } catch (e) {
    json(res, 500, { error: String(e?.message || e) })
  }
}

/** 人工消化标记：只改 raw 文件 frontmatter 的 ingested 字段（raw/ 唯一人工写入例外） */
async function handleRawMark(req, res) {
  const body = await readBody(req).catch(() => null)
  const vault = resolveVaultId(body?.vaultId)
  if (!vault) return json(res, 400, { error: `vault not found: ${body?.vaultId}` })
  // 与 ingest 同样兼容裸文件名：自动补 raw/ 前缀
  const fname = String(body?.file || '').trim()
  const rel = toVaultRel(vault.path, fname.startsWith('raw/') ? fname : `raw/${fname}`)
  if (!rel) return json(res, 403, { error: '路径越出 vault 根' })
  if (!rel.startsWith('raw/') || !rel.endsWith('.md')) return json(res, 400, { error: `仅支持 raw/ 下的 .md 文件：${rel}` })
  if (!existsSync(join(vault.path, rel))) return json(res, 404, { error: `文件不存在：${rel}` })
  try {
    const r = markIngested(vault.path, rel, body?.ingested === true || body?.ingested === 'true')
    const synced = runSync()
    json(res, 200, { ok: true, ...r, synced })
  } catch (e) {
    json(res, 400, { error: String(e?.message || e) })
  }
}

/* ————— HTTP server ————— */
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    return res.end()
  }
  const p = url.pathname
  try {
    // 基础
    if (req.method === 'GET' && p === '/agent/health')
      return json(res, 200, { ok: true, piVersion: PI_VERSION, vault: DEFAULT_VAULT.replace(/\\/g, '/'), vaults: loadRegistry().length })

    // 多知识库管理
    if (req.method === 'GET' && p === '/agent/vaults') return handleVaults(res)
    if (req.method === 'POST' && p === '/agent/vaults/new') return await handleNewVault(req, res)

    // raw/ 收件箱：本地上传 + URL 剪藏 + 人工消化标记
    if (req.method === 'POST' && p === '/agent/raw/upload') return await handleRawUpload(req, res)
    if (req.method === 'POST' && p === '/agent/raw/clip') return await handleRawClip(req, res)
    if (req.method === 'POST' && p === '/agent/raw/mark') return await handleRawMark(req, res)

    // 会话管理
    if (req.method === 'GET' && p === '/agent/sessions')
      return json(res, 200, { sessions: await listSessions(url.searchParams.get('vaultId')) })
    const mMsg = p.match(/^\/agent\/sessions\/([^/]+)\/messages$/)
    if (req.method === 'GET' && mMsg) {
      const sid = decodeURIComponent(mMsg[1])
      const vid = url.searchParams.get('vaultId')
      const r = await sessionMessages(sid, vid)
      if (!r) return json(res, 404, { error: '会话不存在' })
      // 活跃缓存会话：实时用量（含上下文占用）；冷会话：从磁盘转录重算累计细分（contextUsage 无实时值→前端占位）
      const usage = sessionUsage(sid) ?? { cost: 0, contextUsage: null, stats: await coldSessionStats(sid, vid) }
      return json(res, 200, { ...r, usage })
    }
    const mCtx = p.match(/^\/agent\/sessions\/([^/]+)\/context$/)
    if (req.method === 'GET' && mCtx) {
      // 冷会话懒恢复（从磁盘转录重建 + 拼装系统提示），首次检视略慢属正常
      const ctx = await sessionContextOrRestore(decodeURIComponent(mCtx[1]), url.searchParams.get('vaultId'))
      return ctx ? json(res, 200, ctx) : json(res, 404, { error: '会话不存在或无法从磁盘恢复' })
    }
    const mRename = p.match(/^\/agent\/sessions\/([^/]+)\/rename$/)
    if (req.method === 'POST' && mRename) {
      const body = await readBody(req).catch(() => null)
      const name = String(body?.name || '').trim().slice(0, 80)
      if (!name) return json(res, 400, { error: 'name is required' })
      const ok = await renameSession(decodeURIComponent(mRename[1]), name, body?.vaultId)
      return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: '会话不存在' })
    }
    const mDel = p.match(/^\/agent\/sessions\/([^/]+)$/)
    if (req.method === 'DELETE' && mDel) {
      const ok = await deleteSession(decodeURIComponent(mDel[1]), url.searchParams.get('vaultId'))
      return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: '会话不存在' })
    }

    // 对话与任务（SSE）
    if (req.method === 'POST' && p === '/agent/chat') return await handleChat(req, res)
    if (req.method === 'POST' && p === '/agent/task') return await handleTask(req, res)

    // 审核门（查询时按需恢复磁盘孤儿暂存，保证「刷新」总能反映 .staging 真相）
    if (req.method === 'GET' && p === '/agent/staging') {
      const vault = resolveVaultId(url.searchParams.get('vaultId'))
      if (vault) recoverFromDisk(vault.path)
      return json(res, 200, { sessions: listStaging(vault?.path) })
    }
    const mStage = p.match(/^\/agent\/staging\/([^/]+)$/)
    if (req.method === 'GET' && mStage) {
      for (const e of loadRegistry()) {
        const vp = getVaultPath(e.id)
        if (vp) recoverFromDisk(vp)
      }
      const files = collectDiffs(decodeURIComponent(mStage[1]))
      return files ? json(res, 200, { sessionId: decodeURIComponent(mStage[1]), files }) : json(res, 404, { error: '暂存会话不存在' })
    }
    if (req.method === 'POST' && p === '/agent/apply') return await handleApply(req, res)
    if (req.method === 'POST' && p === '/agent/discard') return await handleDiscard(req, res)
    if (req.method === 'POST' && p === '/agent/save-output') return await handleSaveOutput(req, res)

    // 文件浏览
    if (req.method === 'GET' && p === '/agent/files') return handleFiles(url, res)
    if (req.method === 'GET' && p === '/agent/file') return handleFile(url, res)
    if (req.method === 'GET' && p === '/agent/search') return handleSearch(url, res)
    if (req.method === 'POST' && p === '/agent/compact') return await handleCompact(req, res)

    // 模型与 Skills
    if (req.method === 'GET' && p === '/agent/models') return await handleModels(res)
    if (req.method === 'GET' && p === '/agent/skills') return handleSkills(url, res)
    if (req.method === 'GET' && p === '/agent/extensions') return await handleExtensions(url, res)
    if (req.method === 'GET' && p === '/agent/tools') return json(res, 200, { catalog: TOOL_CATALOG, modes: TOOLS })
    if (req.method === 'PUT' && p === '/agent/tools') {
      const body = await readBody(req).catch(() => null)
      try {
        setModeTools(String(body?.mode || ''), body?.tools)
        return json(res, 200, { ok: true, modes: TOOLS })
      } catch (e) {
        return json(res, 400, { error: String(e?.message || e) })
      }
    }

    json(res, 404, { error: `unknown route: ${req.method} ${p}` })
  } catch (e) {
    console.error('[agent-server]', e)
    if (!res.headersSent) json(res, 500, { error: String(e?.message || e) })
    else res.end()
  }
})

server.listen(PORT, '127.0.0.1', async () => {
  const reg = loadRegistry()
  console.log(`[agent-server] listening on http://127.0.0.1:${PORT}`)
  console.log(`[agent-server] vaults: ${reg.length} (${reg.map((v) => v.id).join(', ') || 'none'})`)
  console.log(`[agent-server] default vault: ${getDefaultVaultId() || 'NONE'} → ${DEFAULT_VAULT}`)
  // 启动恢复：把磁盘上的孤儿暂存会话重新登记，避免重启后审核入口丢失
  for (const entry of reg) {
    const vp = getVaultPath(entry.id)
    if (!vp) continue
    const recovered = recoverFromDisk(vp)
    if (recovered.length) console.log(`[agent-server] recovered staging for ${entry.id}: ${recovered.join(', ')}`)
  }
  // 启动自检：模型目录与默认模型解析（失败时立即可见，避免聊天时才报 unknown/unknown）
  try {
    const rt = await getModelRuntime()
    const avail = rt.getAvailableSnapshot()
    console.log(
      `[agent-server] models available: ${avail.length}` +
        (avail.length ? ` (${avail.map((m) => `${m.provider}/${m.id}`).join(', ')})` : '  ← 异常：检查 pi login 与 models 配置'),
    )
    const dm = await resolveDefaultModel()
    console.log(
      `[agent-server] default model: ${dm ? `${dm.provider}/${dm.id} (${dm.name})` : 'UNRESOLVED ← 异常'}`,
    )
  } catch (e) {
    console.error('[agent-server] model self-check failed:', e?.message)
  }
})
