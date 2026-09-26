// index.mjs — agent-server：pi coding agent SDK 嵌入，为 wiki-viewer 提供知识库问答/摄取/修复（SSE 流式）
// 启动：npm start（默认端口 8787，仅绑定 localhost）
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAgentSession, DefaultResourceLoader, SessionManager, getAgentDir } from '@earendil-works/pi-coding-agent'
import { VAULT, pageContextBlock, QUERY_GUIDE, INGEST_GUIDE, LINT_GUIDE, buildTaskPrompt } from './lib/vault.mjs'
import { applySession, collectDiffs, createSession, discardSession, ensureStagedBase, getSession, listSessions, stagedPath, toVaultRel, writeVaultFile } from './lib/staging.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.AGENT_PORT || 8787)
const PI_VERSION = '0.86.0'
const SYNC_SCRIPT = join(__dirname, '..', 'wiki-viewer', 'scripts', 'sync-data.mjs')

/* ————— HTTP 小工具 ————— */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      if (buf.length > 1e6) fail(new Error('body too large'))
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

/* ————— pi session 构建 ————— */

/** 创建只读问答 session：cwd 锁定 vault，工具白名单物理禁写 */
async function createQuerySession() {
  const loader = new DefaultResourceLoader({
    cwd: VAULT,
    agentDir: getAgentDir(),
    appendSystemPromptOverride: (base) => [...base, QUERY_GUIDE],
  })
  await loader.reload()
  const { session } = await createAgentSession({
    cwd: VAULT,
    resourceLoader: loader,
    tools: ['read', 'grep', 'find', 'ls'],
    sessionManager: SessionManager.inMemory(),
  })
  return session
}

/**
 * 暂存重定向 extension：拦截 write/edit 把目标路径改写到 .staging/<sid>/，
 * 真实 vault 在人工审核通过前不被触碰；read 命中已暂存文件时也重定向，
 * 保证 agent 能看到自己刚写的内容。写 wiki/ 之外一律 block。
 */
function stagingExtension(sess) {
  return (pi) => {
    pi.on('tool_call', (event) => {
      const name = event.toolName
      if (name === 'write' || name === 'edit') {
        const rel = toVaultRel(event.input?.path)
        if (!rel) return { block: true, reason: '审核门：禁止写 vault 之外的路径' }
        if (!rel.startsWith('wiki/'))
          return { block: true, reason: `审核门：只允许写 wiki/ 目录（${rel} 被拒绝）。raw/ 不可变，output/ 请走专用保存接口` }
        ensureStagedBase(sess, rel) // edit 需要基础文件才能匹配 oldText；write 时仅建目录
        sess.files.add(rel)
        event.input.path = stagedPath(sess, rel)
        return undefined
      }
      if (name === 'read') {
        const rel = toVaultRel(event.input?.path)
        if (rel && sess.files.has(rel)) event.input.path = stagedPath(sess, rel)
      }
      return undefined
    })
  }
}

/** 创建写入模式 session（ingest/lint）：开放 write/edit，但经审核门重定向到暂存区 */
async function createWriteSession(mode, sess) {
  const guide = mode === 'ingest' ? INGEST_GUIDE : LINT_GUIDE
  const loader = new DefaultResourceLoader({
    cwd: VAULT,
    agentDir: getAgentDir(),
    appendSystemPromptOverride: (base) => [...base, guide],
    extensionFactories: [stagingExtension(sess)],
  })
  await loader.reload()
  const { session } = await createAgentSession({
    cwd: VAULT,
    resourceLoader: loader,
    tools: ['read', 'grep', 'find', 'ls', 'write', 'edit'],
    sessionManager: SessionManager.inMemory(),
  })
  return session
}

/** 订阅 session 事件并转发为 SSE；返回取消订阅函数 */
function pipeEvents(session, res) {
  return session.subscribe((event) => {
    try {
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
        sse(res, 'delta', { text: event.assistantMessageEvent.delta })
      } else if (event.type === 'tool_execution_start') {
        const args = event.args ?? event.input ?? null
        const detail = args && typeof args === 'object' ? (args.path ?? args.pattern ?? args.file_path ?? null) : null
        sse(res, 'tool', { name: event.toolName, state: 'start', detail })
      } else if (event.type === 'tool_execution_end') {
        sse(res, 'tool', { name: event.toolName, state: 'end', isError: !!event.isError })
      }
    } catch {
      /* 客户端已断开等场景：忽略写出失败 */
    }
  })
}

/* ————— 路由处理 ————— */

/** 通用 SSE 会话执行：建 session → 转发事件 → prompt → 收尾 */
async function runStreamingSession(req, res, createSession_, promptText, onAfterPrompt) {
  sseHead(res)
  let session = null
  let closed = false
  req.on('close', () => {
    closed = true
    if (session) {
      try {
        session.dispose()
      } catch { /* ignore */ }
    }
  })
  try {
    sse(res, 'status', { text: '正在创建会话…' })
    session = await createSession_()
    pipeEvents(session, res)
    await session.prompt(promptText)
    if (!closed && onAfterPrompt) await onAfterPrompt()
    if (!closed) sse(res, 'done', {})
  } catch (e) {
    console.error('[agent-server]', e)
    if (!closed) sse(res, 'error', { message: String(e?.message || e) })
  } finally {
    if (session) {
      try {
        session.dispose()
      } catch { /* ignore */ }
    }
    if (!closed) res.end()
  }
}

async function handleQuery(req, res) {
  let body
  try {
    body = await readBody(req)
  } catch {
    return json(res, 400, { error: 'invalid JSON body' })
  }
  const question = String(body.question || '').trim()
  if (!question) return json(res, 400, { error: 'question is required' })
  const contextPageId = body.contextPageId || null
  const prompt = `${pageContextBlock(contextPageId)}\n【用户问题】${question}`
  return runStreamingSession(req, res, createQuerySession, prompt)
}

/** 写入模式（ingest/lint）：结束后把暂存 diff 清单通过 SSE 推给前端审核 */
async function handleWriteTask(req, res, mode) {
  let body
  try {
    body = await readBody(req)
  } catch {
    return json(res, 400, { error: 'invalid JSON body' })
  }

  let target // vault 相对路径或任务描述
  if (mode === 'ingest') {
    const rawFile = String(body.rawFile || '').trim()
    if (!rawFile) return json(res, 400, { error: 'rawFile is required' })
    const rel = toVaultRel(rawFile.startsWith('raw/') ? rawFile : `raw/${rawFile}`)
    if (!rel || !rel.startsWith('raw/') || !existsSync(join(VAULT, rel)))
      return json(res, 400, { error: `raw 文件不存在：${rawFile}` })
    target = rel
  } else {
    const issues = Array.isArray(body.issues) ? body.issues.filter(Boolean).map(String) : []
    if (!issues.length) return json(res, 400, { error: 'issues is required' })
    target = issues
  }

  const sess = createSession(mode, mode === 'ingest' ? target : `${target.length} 项问题`)
  const detail = mode === 'ingest' ? target : `请修复以下知识库健康问题：\n${target.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
  const prompt = buildTaskPrompt(mode, detail)

  return runStreamingSession(
    req,
    res,
    () => createWriteSession(mode, sess),
    prompt,
    () => {
      // 无论 agent 是否汇报完整，都把暂存区的真实改动推给前端审核
      const diffs = collectDiffs(sess.id) ?? []
      sse(res, 'diffs', { sessionId: sess.id, mode, files: diffs })
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

/** 保存问答结果到 output/（成品出口：不走 agent，直接由 server 写入并重新同步） */
async function handleSaveOutput(req, res) {
  const body = await readBody(req).catch(() => null)
  const title = String(body?.title || '').trim()
  const content = String(body?.content || '')
  const question = String(body?.question || '').trim()
  if (!title || !content.trim()) return json(res, 400, { error: 'title 与 content 必填' })
  const slug = title
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    return res.end()
  }
  try {
    if (req.method === 'GET' && url.pathname === '/agent/health') {
      return json(res, 200, { ok: true, piVersion: PI_VERSION, vault: VAULT.replace(/\\/g, '/') })
    }
    if (req.method === 'GET' && url.pathname === '/agent/staging') {
      return json(res, 200, { sessions: listSessions() })
    }
    if (req.method === 'POST' && url.pathname === '/agent/query') {
      return await handleQuery(req, res)
    }
    if (req.method === 'POST' && url.pathname === '/agent/ingest') {
      return await handleWriteTask(req, res, 'ingest')
    }
    if (req.method === 'POST' && url.pathname === '/agent/lint') {
      return await handleWriteTask(req, res, 'lint')
    }
    if (req.method === 'POST' && url.pathname === '/agent/apply') {
      return await handleApply(req, res)
    }
    if (req.method === 'POST' && url.pathname === '/agent/discard') {
      return await handleDiscard(req, res)
    }
    if (req.method === 'POST' && url.pathname === '/agent/save-output') {
      return await handleSaveOutput(req, res)
    }
    json(res, 404, { error: `unknown route: ${req.method} ${url.pathname}` })
  } catch (e) {
    console.error('[agent-server]', e)
    if (!res.headersSent) json(res, 500, { error: String(e?.message || e) })
    else res.end()
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[agent-server] listening on http://127.0.0.1:${PORT}`)
  console.log(`[agent-server] vault: ${VAULT}`)
})
