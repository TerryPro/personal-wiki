// agent.ts — agent-server（pi SDK）客户端
// 持久化会话聊天（chat）、写入任务（task=ingest/lint）、会话管理、文件浏览、模型与 Skills 信息。
// dev 下经 vite proxy /agent → 127.0.0.1:8787；server 未启动时 health 返回 null，UI 优雅降级。

export interface AgentToolCall {
  id?: string | null
  name: string
  args?: unknown
  detail?: string | null
  running: boolean
  isError?: boolean
  durationMs?: number | null
  result?: string | null
}

/** pi-web 风格：一个 assistant turn（模型名 + thinking + 工具调用 + 每轮 usage + 文本） */
export interface TurnView {
  model?: string | null
  thinking: string
  tools: AgentToolCall[]
  usage?: { input: number; output: number; cacheRead: number } | null
  cost?: number | null
  text: string
}

/** 审核门：暂存区单个文件的改动 */
export interface DiffFile {
  path: string
  status: 'new' | 'modified'
  diff: string
}

/** 上下文用量与成本（turn 结束时推送） */
export interface UsageInfo {
  cost: number
  contextUsage: Record<string, number> | null
}

export type AgentStreamEvent =
  | { type: 'status'; text: string }
  | { type: 'session'; sessionId: string; name: string | null; mode: string }
  | { type: 'turnstart' }
  | { type: 'delta'; text: string }
  | { type: 'thinking'; text: string }
  | {
      type: 'tool'
      id?: string
      name: string
      state: 'start' | 'end'
      args?: unknown
      isError?: boolean
      durationMs?: number | null
      result?: string | null
    }
  | { type: 'turn'; model: string | null; usage: { input: number; output: number; cacheRead: number } | null; cost: number }
  | { type: 'usage'; cost: number; contextUsage: Record<string, number> | null }
  | { type: 'diffs'; sessionId: string; mode: string; files: DiffFile[] }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface AgentHealth {
  ok: boolean
  piVersion?: string
  vault?: string
}

/* ————— 数据类型 ————— */

export interface SessionInfo {
  id: string
  name: string | null
  created: string
  modified: string
  messageCount: number
  firstMessage: string
}

export interface RestoredMessage {
  role: 'user' | 'assistant'
  text?: string
  turns?: TurnView[]
  ts?: string | null
}

export interface FileEntry {
  name: string
  dir: boolean
  size: number
  mtime: string
}

export interface ModelInfo {
  provider: string
  id: string
  name: string
}

export interface SkillInfo {
  name: string
  description: string
  source: 'project' | 'global'
}

export interface StagingSessionInfo {
  id: string
  mode: string
  target: string
  createdAt: string
  files: { path: string; status: 'new' | 'modified' }[]
}

/* ————— 基础通道 ————— */

/** 探测 agent-server 是否在线；超时/失败返回 null */
export async function agentHealth(timeoutMs = 2500): Promise<AgentHealth | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch('/agent/health', { signal: ctl.signal })
    return r.ok ? ((await r.json()) as AgentHealth) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 通用：POST + SSE 流式读取（chat/task 共用协议） */
async function streamAgent(
  path: string,
  body: unknown,
  onEvent: (e: AgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(err?.error || `agent-server HTTP ${res.status}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let sep: number
    // SSE 帧以空行分隔；逐帧解析 event:/data: 字段
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, sep)
      buf = buf.slice(sep + 2)
      let event = 'message'
      let data = ''
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim()
        else if (line.startsWith('data: ')) data += line.slice(6)
      }
      if (!data) continue
      try {
        onEvent({ type: event, ...JSON.parse(data) } as AgentStreamEvent)
      } catch {
        /* 跳过无法解析的帧 */
      }
    }
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok || !data) throw new Error(data?.error || `agent-server HTTP ${res.status}`)
  return data
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok || !data) throw new Error(data?.error || `agent-server HTTP ${res.status}`)
  return data
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok || !data) throw new Error(data?.error || `agent-server HTTP ${res.status}`)
  return data
}

/* ————— 对话与任务 ————— */

/** 只读问答 */
export async function chat(
  req: {
    sessionId?: string | null
    message: string
    model?: { provider: string; id: string } | null
    thinkingLevel?: string | null
  },
  onEvent: (e: AgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamAgent('/agent/chat', req, onEvent, signal)
}

/** 写入任务（ingest/lint）：改动经审核门暂存，结束推送 diffs 事件 */
export async function runTask(
  req: { mode: 'ingest' | 'lint'; rawFile?: string; issues?: string[]; sessionId?: string | null },
  onEvent: (e: AgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamAgent('/agent/task', req, onEvent, signal)
}

/* ————— 会话管理 ————— */

export const listSessions = () => getJson<{ sessions: SessionInfo[] }>('/agent/sessions').then((r) => r.sessions)

export const getSessionMessages = (id: string) =>
  getJson<{ sessionId: string; name: string | null; messages: RestoredMessage[] }>(
    `/agent/sessions/${encodeURIComponent(id)}/messages`,
  )

export const renameSession = (id: string, name: string) =>
  postJson<{ ok: boolean }>(`/agent/sessions/${encodeURIComponent(id)}/rename`, { name })

export async function deleteSession(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/agent/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return { ok: true }
}

/* ————— 审核门 ————— */

export const listStagingSessions = () =>
  getJson<{ sessions: StagingSessionInfo[] }>('/agent/staging').then((r) => r.sessions)

/** 暂存会话完整 diff（前端刷新后恢复审核卡用） */
export const getStagingDetail = (id: string) =>
  getJson<{ sessionId: string; files: DiffFile[] }>(`/agent/staging/${encodeURIComponent(id)}`)

export const applyStaging = (sessionId: string) =>
  postJson<{ ok: boolean; changed: string[]; synced: boolean }>('/agent/apply', { sessionId })

export const discardStaging = (sessionId: string) =>
  postJson<{ ok: boolean }>('/agent/discard', { sessionId })

/** 把问答结果保存为 output/ 成品页 */
export const saveOutput = (req: { title: string; content: string; question?: string }) =>
  postJson<{ ok: boolean; path: string; synced: boolean }>('/agent/save-output', req)

/* ————— 文件浏览 ————— */

export const listFiles = (path = '') =>
  getJson<{ path: string; entries: FileEntry[] }>(`/agent/files?path=${encodeURIComponent(path)}`)

export const readFile = (path: string) =>
  getJson<{ path: string; size: number; truncated: boolean; content: string }>(
    `/agent/file?path=${encodeURIComponent(path)}`,
  )

/** @ 引用菜单：vault 内文件模糊搜索 */
export const searchFiles = (q: string) =>
  getJson<{ results: { path: string; size: number }[] }>(`/agent/search?q=${encodeURIComponent(q)}`).then(
    (r) => r.results,
  )

/** /compact 命令：压缩会话上下文 */
export const compactSession = (sessionId: string) =>
  postJson<{ ok: boolean; tokensBefore: number | null }>('/agent/compact', { sessionId })

/* ————— 模型与 Skills ————— */

/** 模型目录 + SDK 解析出的默认模型（空会话输入区状态行展示） */
export const getModels = () =>
  getJson<{ models: ModelInfo[]; defaultModel?: ModelInfo | null }>('/agent/models')

export const getSkills = () => getJson<{ skills: SkillInfo[] }>('/agent/skills').then((r) => r.skills)

/* ————— 插件（extensions） ————— */

export interface ExtInfo {
  path: string
  scope: string
  tools: string[]
  commands: string[]
}

export interface ExtensionsPayload {
  builtin: { name: string; description: string }[]
  extensions: ExtInfo[]
  errors: { path: string; error: string }[]
}

export const getExtensions = () => getJson<ExtensionsPayload>('/agent/extensions')

/** 工具目录 + 各模式白名单（设置面板展示与开关） */
export interface ToolCatalogItem {
  name: string
  description: string
}
export const getTools = () =>
  getJson<{ catalog: ToolCatalogItem[]; modes: Record<string, string[]> }>('/agent/tools')
export const setModeTools = (mode: string, tools: string[]) =>
  putJson<{ ok: boolean; modes: Record<string, string[]> }>('/agent/tools', { mode, tools })
