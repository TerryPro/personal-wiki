// agentStream.ts — 会话流单例 store：SSE 消费与消息缓冲独立于 React 组件生命周期。
// 切换模式（AiMode 卸载）不会中断进行中的流；重新挂载时回放缓冲并接续实时事件。
import { type AgentStreamEvent, type TurnView } from './agent'
import type { Msg } from '@/components/ai/ChatWindow'

export interface StreamState {
  msgs: Msg[]
  busy: boolean
  activeId: string | null
  sessionName: string | null
  usage: {
    cost: number
    tokens: number | null
    contextWindow: number | null
    percent: number | null
  } | null
  lastModelName: string | null
  /** 会话列表脏标记（session 事件 / 流结束时 +1），AiMode 据此刷新侧栏 */
  sessionsVersion: number
}

let state: StreamState = {
  msgs: [],
  busy: false,
  activeId: null,
  sessionName: null,
  usage: null,
  lastModelName: null,
  sessionsVersion: 0,
}
let abortCtl: AbortController | null = null
const diffsListeners = new Set<(sessionId: string, fileCount: number) => void>()
/** 用户主动关闭过审查面板的 sessionId（自动开跳过，手动开不受限） */
const dismissedReviews = new Set<string>()
const listeners = new Set<() => void>()

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
export const getState = (): StreamState => state

function set(patch: Partial<StreamState>) {
  state = { ...state, ...patch }
  listeners.forEach((fn) => fn())
}

/** 注册 diffs 事件监听（多播）；返回取消函数。AiMode 用来自动开审查、App 用来弹 toast */
export function addDiffsListener(fn: (sessionId: string, fileCount: number) => void): () => void {
  diffsListeners.add(fn)
  return () => {
    diffsListeners.delete(fn)
  }
}

export const dismissReview = (id: string) => {
  dismissedReviews.add(id)
}
export const undismissReview = (id: string) => {
  dismissedReviews.delete(id)
}
export const isReviewDismissed = (id: string) => dismissedReviews.has(id)

/* ————— 消息修补 ————— */

function patchAssistant(fn: (m: Extract<Msg, { role: 'assistant' }>) => Msg) {
  const next = [...state.msgs]
  for (let i = next.length - 1; i >= 0; i--)
    if (next[i].role === 'assistant') {
      next[i] = fn(next[i] as Extract<Msg, { role: 'assistant' }>)
      break
    }
  set({ msgs: next })
}

function patchTurn(fn: (t: TurnView) => TurnView) {
  patchAssistant((m) => {
    const turns = [...m.turns]
    if (!turns.length) turns.push({ thinking: '', tools: [], text: '' })
    turns[turns.length - 1] = fn(turns[turns.length - 1])
    return { ...m, turns }
  })
}

export function appendAssistantNote(text: string) {
  set({ msgs: [...state.msgs, { role: 'assistant', turns: [{ thinking: '', tools: [], text }], ts: Date.now() }] })
}
export function clearMsgs() {
  set({ msgs: [] })
}
export function resetForNewSession() {
  set({ msgs: [], activeId: null, sessionName: null, usage: null })
}
export function loadSession(msgs: Msg[], activeId: string, sessionName: string | null) {
  set({ msgs, activeId, sessionName, usage: null })
}
export function setSessionName(name: string | null) {
  set({ sessionName: name })
}
/** 外部（如切换会话时从 server 拉取）直接设置 usage */
export function setUsage(usage: StreamState['usage']) {
  set({ usage })
}
export function patchMsg(i: number, patch: Partial<Extract<Msg, { role: 'assistant' }>>) {
  set({ msgs: state.msgs.map((x, j) => (j === i && x.role === 'assistant' ? { ...x, ...patch } : x)) })
}
export function setDiffsState(sessionId: string, st: 'applied' | 'discarded', note: string) {
  set({ msgs: state.msgs.map((x) => (x.role === 'diffs' && x.sessionId === sessionId ? { ...x, state: st, note } : x)) })
}

/* ————— 流 ————— */

export function stop() {
  abortCtl?.abort()
}

/**
 * 发起一次流式对话/任务。SSE 消费在本单例内进行，与组件挂载状态无关。
 * @param onFinished 流成功结束后的回调（如刷新会话列表之外的 UI 联动）
 */
export async function runStream(
  label: string,
  run: (onEvent: (e: AgentStreamEvent) => void, signal: AbortSignal) => Promise<void>,
  assistantSeed?: Partial<Extract<Msg, { role: 'assistant' }>>,
  onFinished?: () => void,
) {
  set({
    msgs: [
      ...state.msgs,
      { role: 'user', text: label, ts: Date.now() },
      { role: 'assistant', turns: [], ts: Date.now(), ...assistantSeed },
    ],
    busy: true,
  })
  const ctl = new AbortController()
  abortCtl = ctl
  const onEvent = (e: AgentStreamEvent) => {
    if (e.type === 'turnstart') patchAssistant((m) => ({ ...m, turns: [...m.turns, { thinking: '', tools: [], text: '' }] }))
    else if (e.type === 'delta') patchTurn((t) => ({ ...t, text: t.text + e.text }))
    else if (e.type === 'thinking') patchTurn((t) => ({ ...t, thinking: t.thinking + e.text }))
    else if (e.type === 'session') set({ activeId: e.sessionId, sessionName: e.name, sessionsVersion: state.sessionsVersion + 1 })
    else if (e.type === 'usage')
      set({
        usage: {
          cost: e.cost,
          tokens: e.contextUsage && typeof e.contextUsage.tokens === 'number' ? e.contextUsage.tokens : null,
          contextWindow: e.contextUsage && typeof e.contextUsage.contextWindow === 'number' ? e.contextUsage.contextWindow : null,
          percent: e.contextUsage && typeof e.contextUsage.percent === 'number' ? e.contextUsage.percent : null,
        },
      })
    else if (e.type === 'turn') {
      patchTurn((t) => ({ ...t, model: e.model ?? t.model, usage: e.usage, cost: e.cost }))
      if (e.model) set({ lastModelName: e.model })
    } else if (e.type === 'tool') {
      if (e.state === 'start')
        patchTurn((t) => ({ ...t, tools: [...t.tools, { id: e.id ?? null, name: e.name, args: e.args ?? null, running: true }] }))
      else
        patchTurn((t) => {
          const tools = [...t.tools]
          let idx = tools.findIndex((x) => x.id != null && x.id === e.id)
          if (idx < 0) for (let k = tools.length - 1; k >= 0; k--) if (tools[k].running) { idx = k; break }
          if (idx >= 0)
            tools[idx] = { ...tools[idx], running: false, isError: e.isError, durationMs: e.durationMs ?? null, result: e.result ?? null }
          return { ...t, tools }
        })
    } else if (e.type === 'diffs') {
      set({ msgs: [...state.msgs, { role: 'diffs', sessionId: e.sessionId, mode: e.mode, target: e.target, files: e.files, state: 'pending' }] })
      diffsListeners.forEach((fn) => fn(e.sessionId, e.files.length))
    } else if (e.type === 'error') patchAssistant((m) => ({ ...m, error: e.message }))
  }
  try {
    await run(onEvent, ctl.signal)
    set({ sessionsVersion: state.sessionsVersion + 1 })
    onFinished?.()
  } catch (err) {
    if (!ctl.signal.aborted) patchAssistant((m) => ({ ...m, error: String((err as Error)?.message || err) }))
  } finally {
    abortCtl = null
    set({ busy: false })
  }
}
