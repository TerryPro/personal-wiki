// index.mjs — agent-server：pi coding agent SDK 嵌入，为 wiki-viewer 提供
// 持久化会话问答（chat）、摄取/修复任务（task，经暂存审核门）、会话管理、
// 文件浏览、模型与 Skills 信息。启动：npm start（默认端口 8787，仅绑 localhost）
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAgentDir, createAgentSession, SessionManager, DefaultResourceLoader } from '@earendil-works/pi-coding-agent'
import { VAULT, pageContextBlock, buildTaskPrompt } from './lib/vault.mjs'
import { readVaultFile } from './lib/vault.mjs'
import {
  applySession,
  collectDiffs,
  createSession,
  discardSession,
  getSession,
  listSessions as listStaging,
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
} from './lib/sessions.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.AGENT_PORT || 8787)
// 内嵌 SDK 版本运行时读取（随 npm 升级自动更新，不再硬编码）
const PI_VERSION = JSON.parse(
  readFileSync(join(__dirname, 'node_modules', '@earendil-works', 'pi-coding-agent', 'package.json'), 'utf8'),
).version
const SYNC_SCRIPT = join(__dirname, '..', 'wiki-viewer', 'scripts', 'sync-data.mjs')

/* ————— HTTP 小工具 ————— */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
  return { cost: session.state?.cost ?? 0, contextUsage }
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

  // @文件引用：读取 vault 内文件内容注入上下文
  let refBlocks = ''
  const refs = [...message.matchAll(/@([\w./-]+\.\w+)/g)]
    .map((m) => m[1])
    .filter((v, i, a) => a.indexOf(v) === i)
  for (const r of refs) {
    const content = readVaultFile(r)
    if (content != null) refBlocks += `\n【引用文件 @${r} 的内容】\n${content.slice(0, 20000)}\n`
  }

  // /skill 前缀：内嵌 SKILL.md 全文作为执行指令（仅项目级 .pi/skills，不读全局）
  let skillBlock = ''
  let finalMessage = message
  const sm = message.match(/^\/([\w-]+)(?:\s+([\s\S]*))?$/)
  if (sm) {
    const skillMd = readVaultFile(`.pi/skills/${sm[1]}/SKILL.md`)
    if (skillMd) {
      skillBlock = `\n【指令】用户调用了 skill /${sm[1]}，其完整规范如下，请严格按其流程执行：\n${skillMd}\n`
      finalMessage = sm[2]?.trim() || `执行 /${sm[1]}`
    }
  }

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
      model: body?.model || null,
      thinkingLevel: body?.thinkingLevel || null,
    })
    sse(res, 'session', {
      sessionId: entry.sessionId,
      name: entry.sm.getSessionName?.() ?? null,
      mode: entry.mode,
    })
    // 页面上下文只在切换时注入一次，避免持久会话里反复重复
    const ctx =
      contextPageId && contextPageId !== entry.lastContextPage ? pageContextBlock(contextPageId) : ''
    entry.lastContextPage = contextPageId || entry.lastContextPage
    unsubscribe = pipeEvents(entry.session, res)
    entry.busy = true
    const promptParts = []
    if (ctx) promptParts.push(ctx)
    if (refBlocks) promptParts.push(refBlocks)
    if (skillBlock) promptParts.push(skillBlock)
    promptParts.push(finalMessage)
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

  let target
  if (mode === 'ingest') {
    const rawFile = String(body?.rawFile || '').trim()
    if (!rawFile) return json(res, 400, { error: 'rawFile is required' })
    const rel = toVaultRel(rawFile.startsWith('raw/') ? rawFile : `raw/${rawFile}`)
    if (!rel || !rel.startsWith('raw/') || !existsSync(join(VAULT, rel)))
      return json(res, 400, { error: `raw 文件不存在：${rawFile}` })
    target = rel
  } else {
    const issues = Array.isArray(body?.issues) ? body.issues.filter(Boolean).map(String) : []
    if (!issues.length) return json(res, 400, { error: 'issues is required' })
    target = issues
  }

  const staging = createSession(mode, mode === 'ingest' ? target : `${target.length} 项问题`)
  const detail =
    mode === 'ingest'
      ? target
      : `请修复以下知识库健康问题：\n${target.map((s, i) => `${i + 1}. ${s}`).join('\n')}`

  return runStreaming(
    req,
    res,
    () => obtainSession({ sessionId: body?.sessionId || null, mode, stagingSess: staging }),
    buildTaskPrompt(mode, detail),
    {
      onAfterPrompt: () => {
        const diffs = collectDiffs(staging.id) ?? []
        sse(res, 'diffs', { sessionId: staging.id, mode, files: diffs })
      },
    },
  )
}

/** 重跑 viewer 同步脚本，刷新前端数据快照 */
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
  const changed = applySession(id)
  const synced = runSync()
  json(res, 200, { ok: true, changed, synced })
}

async function handleDiscard(req, res) {
  const body = await readBody(req).catch(() => null)
  const id = String(body?.sessionId || '')
  const ok = discardSession(id)
  json(res, ok ? 200 : 404, ok ? { ok: true } : { error: `暂存会话不存在：${id}` })
}

/** 保存问答结果到 output/（成品出口：不走 agent，直接写入并重新同步） */
async function handleSaveOutput(req, res) {
  const body = await readBody(req).catch(() => null)
  const title = String(body?.title || '').trim()
  const content = String(body?.content || '')
  const question = String(body?.question || '').trim()
  if (!title || !content.trim()) return json(res, 400, { error: 'title 与 content 必填' })
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
    writeVaultFile(rel, md)
  } catch (e) {
    return json(res, 400, { error: String(e?.message || e) })
  }
  const synced = runSync()
  json(res, 200, { ok: true, path: rel, synced })
}

/* ————— 文件浏览（只读，限 vault 内） ————— */
const HIDDEN_DIRS = new Set(['.staging', '.git', 'node_modules', '.trash', '.obsidian', '.ok', '.cursor'])

function handleFiles(url, res) {
  const rel = toVaultRel(url.searchParams.get('path') || '')
  if (rel === null) return json(res, 403, { error: 'path escapes vault' })
  const dir = join(VAULT, rel)
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
  const rel = toVaultRel(url.searchParams.get('path') || '')
  if (!rel) return json(res, 403, { error: 'path escapes vault' })
  const file = join(VAULT, rel)
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
    defaultModelPromise = createAgentSession({
      cwd: VAULT,
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

function handleSkills(res) {
  // 仅加载项目级 skills（llmwiki/.pi/skills），不读全局 ~/.pi/agent/skills
  const dir = join(VAULT, '.pi', 'skills')
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
async function handleExtensions(res) {
  try {
    const projectExtDir = join(VAULT, '.pi', 'extensions')
    const loader = new DefaultResourceLoader({
      cwd: VAULT,
      agentDir: getAgentDir(),
      // 与 obtainSession 同策略：仅项目级 extensions，不加载全局插件
      noExtensions: true,
      additionalExtensionPaths: existsSync(projectExtDir) ? [projectExtDir] : [],
    })
    await loader.reload()
    const r = loader.getExtensions()
    const vaultRel = (p) => {
      const rp = String(p).replace(/\\/g, '/')
      const v = VAULT.replace(/\\/g, '/')
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
            // 加载源为 additionalExtensionPaths（temporary scope），按路径归一为 project
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
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()
  const all = walkFiles(VAULT, VAULT, [])
  // 空查询：按修改时间倒序返回最近文件（@ 刚键入时的默认列表）；有查询：子串匹配按路径长度排
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
      return json(res, 200, { ok: true, piVersion: PI_VERSION, vault: VAULT.replace(/\\/g, '/') })

    // 会话管理
    if (req.method === 'GET' && p === '/agent/sessions')
      return json(res, 200, { sessions: await listSessions() })
    const mMsg = p.match(/^\/agent\/sessions\/([^/]+)\/messages$/)
    if (req.method === 'GET' && mMsg) {
      const r = await sessionMessages(decodeURIComponent(mMsg[1]))
      return r ? json(res, 200, r) : json(res, 404, { error: '会话不存在' })
    }
    const mRename = p.match(/^\/agent\/sessions\/([^/]+)\/rename$/)
    if (req.method === 'POST' && mRename) {
      const body = await readBody(req).catch(() => null)
      const name = String(body?.name || '').trim().slice(0, 80)
      if (!name) return json(res, 400, { error: 'name is required' })
      const ok = await renameSession(decodeURIComponent(mRename[1]), name)
      return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: '会话不存在' })
    }
    const mDel = p.match(/^\/agent\/sessions\/([^/]+)$/)
    if (req.method === 'DELETE' && mDel) {
      const ok = await deleteSession(decodeURIComponent(mDel[1]))
      return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: '会话不存在' })
    }

    // 对话与任务（SSE）
    if (req.method === 'POST' && p === '/agent/chat') return await handleChat(req, res)
    if (req.method === 'POST' && p === '/agent/task') return await handleTask(req, res)

    // 审核门
    if (req.method === 'GET' && p === '/agent/staging') return json(res, 200, { sessions: listStaging() })
    const mStage = p.match(/^\/agent\/staging\/([^/]+)$/)
    if (req.method === 'GET' && mStage) {
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
    if (req.method === 'GET' && p === '/agent/skills') return handleSkills(res)
    if (req.method === 'GET' && p === '/agent/extensions') return await handleExtensions(res)
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
  console.log(`[agent-server] listening on http://127.0.0.1:${PORT}`)
  console.log(`[agent-server] vault: ${VAULT}`)
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
