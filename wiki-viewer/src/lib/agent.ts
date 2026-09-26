// agent.ts — agent-server（pi SDK）客户端：健康探测 + 问答 SSE 流式调用
// dev 下经 vite proxy /agent → 127.0.0.1:8787；server 未启动时 health 返回 null，UI 优雅降级

export interface AgentToolCall {
  name: string
  detail?: string | null
  running: boolean
  isError?: boolean
}

/** 审核门：暂存区单个文件的改动 */
export interface DiffFile {
  path: string
  status: 'new' | 'modified'
  diff: string
}

export type AgentStreamEvent =
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string; state: 'start' | 'end'; detail?: string | null; isError?: boolean }
  | { type: 'diffs'; sessionId: string; mode: string; files: DiffFile[] }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface AgentHealth {
  ok: boolean
  piVersion?: string
  vault?: string
}

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

/** 通用：POST + SSE 流式读取（query/ingest/lint 共用协议） */
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

/** 只读问答 */
export async function askAgent(
  req: { question: string; contextPageId?: string | null },
  onEvent: (e: AgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamAgent('/agent/query', req, onEvent, signal)
}

/** 摄取 raw 文件（写入经审核门暂存，结束后推送 diffs 事件） */
export async function runIngest(
  req: { rawFile: string },
  onEvent: (e: AgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamAgent('/agent/ingest', req, onEvent, signal)
}

/** lint 修复（同上，写入经审核门暂存） */
export async function runLint(
  req: { issues: string[] },
  onEvent: (e: AgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return streamAgent('/agent/lint', req, onEvent, signal)
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

/** 审核通过：暂存改动落盘 vault 并自动重跑 sync */
export const applyStaging = (sessionId: string) =>
  postJson<{ ok: boolean; changed: string[]; synced: boolean }>('/agent/apply', { sessionId })

/** 丢弃暂存改动 */
export const discardStaging = (sessionId: string) =>
  postJson<{ ok: boolean }>('/agent/discard', { sessionId })

/** 把问答结果保存为 output/ 成品页 */
export const saveOutput = (req: { title: string; content: string; question?: string }) =>
  postJson<{ ok: boolean; path: string; synced: boolean }>('/agent/save-output', req)
