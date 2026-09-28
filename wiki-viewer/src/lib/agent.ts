// agent.ts — agent-server（pi SDK）客户端
// 持久化会话聊天（chat）、写入任务（task=ingest/lint）、会话管理、文件浏览、模型与 Skills 信息。
// dev 下经 vite proxy /agent → 127.0.0.1:8787；server 未启动时 health 返回 null，UI 优雅降级。

import type { VaultEntry } from '@/types'

/* ————— 多知识库：当前活跃 vault（所有请求自动携带） ————— */
let _vaultId = 'llmwiki'
export function setAgentVault(id: string) { _vaultId = id }
export function getAgentVault() { return _vaultId }

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

/** 会话累计 token 细分（服务端全量聚合：含 compaction/usage 条目，单调增长不因压缩回退） */
export interface SessionTokens {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}

/** 上下文用量与成本（SSE usage 事件 / 会话恢复接口的 usage 字段同形状） */
export interface UsageInfo {
  cost: number
  contextUsage: Record<string, number> | null
  /** 会话累计细分；冷会话无实时值时由服务端从磁盘转录重算 */
  stats?: { tokens: SessionTokens; cost: number } | null
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
  | { type: 'usage'; cost: number; contextUsage: Record<string, number> | null; stats?: UsageInfo['stats'] }
  | { type: 'diffs'; sessionId: string; mode: string; target?: string; files: DiffFile[] }
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

/** 会话完整历史的分支树节点（对应 agent-server sessionTree 序列化） */
export interface SessionTreeNode {
  id: string
  parentId: string | null
  type: string
  timestamp: string | null
  label: string | null
  /** user | assistant | tool | system | compaction | branch | model | thinking | usage | <type> */
  role: string
  preview: string
  children: SessionTreeNode[]
}

export interface SessionTree {
  sessionId: string
  name: string | null
  leafId: string | null
  entryCount: number
  truncated: boolean
  tree: SessionTreeNode[]
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
  return streamAgent('/agent/chat', { ...req, vaultId: _vaultId }, onEvent, signal)
}

/** 写入任务（ingest/lint）：改动经审核门暂存，结束推送 diffs 事件 */
export async function runTask(
  req: { mode: 'ingest' | 'lint'; rawFile?: string; issues?: string[]; sessionId?: string | null },
  onEvent: (e: AgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamAgent('/agent/task', { ...req, vaultId: _vaultId }, onEvent, signal)
}

/* ————— 会话管理 ————— */

export const listSessions = () => getJson<{ sessions: SessionInfo[] }>(`/agent/sessions?vaultId=${encodeURIComponent(_vaultId)}`).then((r) => r.sessions)

export const getSessionMessages = (id: string, leafId?: string) =>
  getJson<{
    sessionId: string
    name: string | null
    messages: RestoredMessage[]
    /** 活跃缓存会话的实时用量（cost + 上下文 + 累计细分）；冷会话仅细分（无实时上下文）；非活跃/无会话为 null */
    usage?: UsageInfo | null
  }>(
    `/agent/sessions/${encodeURIComponent(id)}/messages?vaultId=${encodeURIComponent(_vaultId)}${
      leafId ? `&leafId=${encodeURIComponent(leafId)}` : ''
    }`,
  )

/** 会话完整历史分支树（只读；冷会话由 server 从磁盘懒恢复，首次略慢） */
export const getSessionTree = (id: string) =>
  getJson<SessionTree>(`/agent/sessions/${encodeURIComponent(id)}/tree?vaultId=${encodeURIComponent(_vaultId)}`)

export interface EntryTool {
  id: string | null
  name: string
  args: unknown
  result: string | null
  isError: boolean
}

/** 单条 entry 详情（历史面板“只看选中这一条”） */
export interface EntryDetail {
  sessionId: string
  entryId: string
  type: string
  ts: string | null
  /** user | assistant | compaction | branch | <type> */
  role: string
  text?: string
  model?: string | null
  thinking?: string
  tools?: EntryTool[]
  usage?: { input: number; output: number; cacheRead: number } | null
  cost?: number | null
  summary?: string
  tokensBefore?: number | null
}
export const getSessionEntryDetail = (id: string, entryId: string) =>
  getJson<EntryDetail>(
    `/agent/sessions/${encodeURIComponent(id)}/entry?vaultId=${encodeURIComponent(_vaultId)}&entryId=${encodeURIComponent(entryId)}`,
  )

/** 切换活动会话的 leaf 到指定节点（同文件内 branch）；冷会话/忙时服务端返回错误（不抛异常，交 UI 处理） */
export async function branchSession(id: string, entryId: string): Promise<{ ok: boolean; leafId?: string; error?: string }> {
  const res = await fetch(`/agent/sessions/${encodeURIComponent(id)}/branch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryId, vaultId: _vaultId }),
  })
  const data = (await res.json().catch(() => null)) as { ok?: boolean; leafId?: string; error?: string } | null
  if (!res.ok || !data?.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` }
  return { ok: true, leafId: data.leafId }
}


export const renameSession = (id: string, name: string) =>
  postJson<{ ok: boolean }>(`/agent/sessions/${encodeURIComponent(id)}/rename`, { name, vaultId: _vaultId })

export async function deleteSession(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/agent/sessions/${encodeURIComponent(id)}?vaultId=${encodeURIComponent(_vaultId)}`, { method: 'DELETE' })
  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return { ok: true }
}

/* ————— 审核门 ————— */

export const listStagingSessions = () =>
  getJson<{ sessions: StagingSessionInfo[] }>(`/agent/staging?vaultId=${encodeURIComponent(_vaultId)}`).then((r) => r.sessions)

/** 暂存会话完整 diff（前端刷新后恢复审核卡用） */
export const getStagingDetail = (id: string) =>
  getJson<{ sessionId: string; files: DiffFile[] }>(`/agent/staging/${encodeURIComponent(id)}`)

export const applyStaging = (sessionId: string, files?: string[]) =>
  postJson<{ ok: boolean; changed: string[]; synced: boolean; done: boolean; remaining: number }>('/agent/apply', {
    sessionId,
    vaultId: _vaultId,
    ...(files?.length ? { files } : {}),
  })

export const discardStaging = (sessionId: string, files?: string[]) =>
  postJson<{ ok: boolean; done: boolean; remaining: number }>('/agent/discard', {
    sessionId,
    vaultId: _vaultId,
    ...(files?.length ? { files } : {}),
  })

/** 把问答结果保存为 output/ 成品页 */
export const saveOutput = (req: { title: string; content: string; question?: string }) =>
  postJson<{ ok: boolean; path: string; synced: boolean }>('/agent/save-output', { ...req, vaultId: _vaultId })

/* ————— 文件浏览 ————— */

export const listFiles = (path = '') =>
  getJson<{ path: string; entries: FileEntry[] }>(`/agent/files?vaultId=${encodeURIComponent(_vaultId)}&path=${encodeURIComponent(path)}`)

export const readFile = (path: string) =>
  getJson<{ path: string; size: number; truncated: boolean; content: string }>(
    `/agent/file?vaultId=${encodeURIComponent(_vaultId)}&path=${encodeURIComponent(path)}`,
  )

/** @ 引用菜单：vault 内文件模糊搜索 */
export const searchFiles = (q: string) =>
  getJson<{ results: { path: string; size: number }[] }>(`/agent/search?vaultId=${encodeURIComponent(_vaultId)}&q=${encodeURIComponent(q)}`).then(
    (r) => r.results,
  )

/** /compact 命令：压缩会话上下文 */
export const compactSession = (sessionId: string) =>
  postJson<{ ok: boolean; tokensBefore: number | null }>('/agent/compact', { sessionId })

/** 上下文检视：会话的完整系统提示词 + 工具集 + 用量（冷会话由 server 懒恢复，首次略慢；会话不存在时 404） */
export interface SessionContextInfo {
  active: boolean
  mode: string
  vaultId: string
  model: string | null
  systemPrompt: string | null
  tools: string[] | null
  contextUsage: { tokens: number | null; contextWindow: number; percent: number | null } | null
  cost: number
}
export const getSessionContext = (sessionId: string) =>
  getJson<SessionContextInfo>(`/agent/sessions/${encodeURIComponent(sessionId)}/context?vaultId=${encodeURIComponent(_vaultId)}`)

/* ————— 模型与 Skills ————— */

/** 模型目录 + SDK 解析出的默认模型（空会话输入区状态行展示） */
export const getModels = () =>
  getJson<{ models: ModelInfo[]; defaultModel?: ModelInfo | null }>('/agent/models')

export const getSkills = () => getJson<{ skills: SkillInfo[] }>(`/agent/skills?vaultId=${encodeURIComponent(_vaultId)}`).then((r) => r.skills)

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

export const getExtensions = () => getJson<ExtensionsPayload>(`/agent/extensions?vaultId=${encodeURIComponent(_vaultId)}`)

/** 工具目录 + 各模式白名单（设置面板展示与开关） */
export interface ToolCatalogItem {
  name: string
  description: string
}
export const getTools = () =>
  getJson<{ catalog: ToolCatalogItem[]; modes: Record<string, string[]> }>('/agent/tools')
export const setModeTools = (mode: string, tools: string[]) =>
  putJson<{ ok: boolean; modes: Record<string, string[]> }>('/agent/tools', { mode, tools })

/* ————— 多知识库管理 ————— */

/** 获取 vault 注册表 */
export const listVaults = () => getJson<{ vaults: VaultEntry[] }>('/agent/vaults').then((r) => r.vaults)

/** 新建知识库（server 端创建目录结构 + 更新注册表 + 重跑 sync） */
export const createVault = (params: { id: string; name: string; path?: string; description?: string }) =>
  postJson<{ ok: boolean; vaults: VaultEntry[] }>('/agent/vaults/new', params)

/* ————— raw/ 收件箱：本地上传 + URL 剪藏 ————— */

export interface UploadedFile {
  path: string
  bytes: number
}

/** 读取 File 为 base64（去掉 data:...;base64, 前缀） */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** 上传本地文件到 vault 的 raw/（图片自动进 raw/assets/） */
export async function uploadRawFiles(files: File[]): Promise<{ ok: boolean; written: UploadedFile[]; synced: boolean }> {
  const payload = await Promise.all(
    files.map(async (f) => ({ name: f.name, contentBase64: await fileToBase64(f) })),
  )
  return postJson('/agent/raw/upload', { vaultId: _vaultId, files: payload })
}

/** 剪藏网址：server 抓取网页转 Markdown 存入 raw/ */
export const clipUrl = (url: string) =>
  postJson<{ ok: boolean; path: string; title: string; bytes: number; synced: boolean }>('/agent/raw/clip', {
    vaultId: _vaultId,
    url,
  })

/** 人工消化标记：置位/复位 raw 文件 frontmatter 的 ingested 字段（server 端同步重跑 sync） */
export const markRawIngested = (file: string, ingested: boolean) =>
  postJson<{ ok: boolean; path: string; ingested: boolean; synced: boolean }>('/agent/raw/mark', {
    vaultId: _vaultId,
    file,
    ingested,
  })
