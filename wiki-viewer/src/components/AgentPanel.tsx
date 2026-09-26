import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Bot, Check, Loader2, PackagePlus, Send, Terminal } from 'lucide-react'
import { marked } from 'marked'
import {
  askAgent,
  agentHealth,
  applyStaging,
  discardStaging,
  runIngest,
  runLint,
  saveOutput,
  type AgentHealth,
  type AgentStreamEvent,
  type AgentToolCall,
  type DiffFile,
} from '@/lib/agent'
import { hydrateWikiLinks } from '@/components/PageView'
import { resolveTitle } from '@/lib/wiki'
import { hidePreview } from '@/lib/preview'
import type { WikiPage } from '@/types'

interface Props {
  open: boolean
  page: WikiPage | null
  onNavigate: (p: WikiPage) => void
  /** 从 raw 页「启动摄取」进入时非空；面板消费后回调清空 */
  ingestTarget?: WikiPage | null
  onIngestConsumed?: () => void
  /** 从健康仪表盘「用 LLM 修复」进入时非空 */
  lintIssues?: string[] | null
  onLintConsumed?: () => void
}

/** 面板宽度钳制范围与默认值（px） */
const W_MIN = 300
const W_MAX = 860
const W_DEFAULT = 380

type Msg =
  | { role: 'user'; text: string }
  | {
      role: 'assistant'
      text: string
      tools: AgentToolCall[]
      error?: string
      question?: string // query 模式的原问题（保存到 output 用）
      savedAs?: string
      saveError?: string
    }
  | {
      role: 'diffs'
      sessionId: string
      mode: string
      files: DiffFile[]
      state: 'pending' | 'applied' | 'discarded'
      note?: string
    }

/** assistant 回答正文：Markdown 渲染 + 双链水合（点击跳转并关闭面板由上层 onNavigate 决定） */
function AssistantBody({ text, onLink }: { text: string; onLink: (p: WikiPage) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(
    () => (text.trim() ? (marked.parse(text, { async: false, gfm: true }) as string) : ''),
    [text],
  )
  useEffect(() => {
    if (!ref.current) return
    hydrateWikiLinks(ref.current, (target) => {
      const hit = resolveTitle(target)
      if (hit) {
        hidePreview()
        onLink(hit)
      }
    })
  }, [html, onLink])
  if (!html) return null
  return <div ref={ref} className="prose-wiki" dangerouslySetInnerHTML={{ __html: html }} />
}

function ToolChips({ tools }: { tools: AgentToolCall[] }) {
  if (!tools.length) return null
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {tools.map((t, i) => (
        <span
          key={i}
          className={`flex items-center gap-1 rounded border px-1.5 py-[2px] font-mono text-[10.5px] ${
            t.isError
              ? 'border-cat-concept/50 bg-cat-concept/10 text-cat-concept'
              : 'border-line bg-ink-soft text-fg-muted'
          }`}
          title={t.detail || t.name}
        >
          {t.running ? <Loader2 size={9} className="animate-spin" /> : <Terminal size={9} />}
          {t.name}
          {t.detail && <span className="max-w-[160px] truncate opacity-70">{t.detail}</span>}
        </span>
      ))}
    </div>
  )
}

/** 单文件 diff：折叠头（状态徽标 + 路径 + 增删行数）+ 展开的着色 unified diff */
function DiffBlock({ f }: { f: DiffFile }) {
  const [open, setOpen] = useState(false)
  const lines = f.diff.split('\n').filter(Boolean)
  const adds = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length
  const dels = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 bg-ink-soft px-2.5 py-1.5 text-left text-[11.5px] transition-colors hover:bg-surface-raised"
      >
        <span
          className={`shrink-0 rounded border px-1 py-px font-mono text-[10px] ${
            f.status === 'new'
              ? 'border-cat-entity/50 bg-cat-entity/10 text-cat-entity'
              : 'border-cat-concept/50 bg-cat-concept/10 text-cat-concept'
          }`}
        >
          {f.status === 'new' ? '新增' : '修改'}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-fg-secondary">{f.path}</span>
        <span className="shrink-0 font-mono text-[10.5px]">
          <span className="text-cat-entity">+{adds}</span>{' '}
          <span className="text-cat-concept">-{dels}</span>
        </span>
      </button>
      {open && (
        <pre className="max-h-72 overflow-auto border-t border-line bg-surface px-2.5 py-2 font-mono text-[11px] leading-[1.7]">
          {lines.map((l, i) => (
            <div
              key={i}
              className={
                l.startsWith('+++') || l.startsWith('---')
                  ? 'text-fg-muted'
                  : l.startsWith('@@')
                    ? 'text-accent'
                    : l.startsWith('+')
                      ? 'bg-cat-entity/10 text-cat-entity'
                      : l.startsWith('-')
                        ? 'bg-cat-concept/10 text-cat-concept'
                        : 'whitespace-pre-wrap text-fg-muted'
              }
            >
              {l}
            </div>
          ))}
        </pre>
      )}
    </div>
  )
}

export default function AgentPanel({
  open,
  page,
  onNavigate,
  ingestTarget,
  onIngestConsumed,
  lintIssues,
  onLintConsumed,
}: Props) {
  const [health, setHealth] = useState<AgentHealth | null>(null)
  const [checked, setChecked] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [withContext, setWithContext] = useState(true)
  // 面板宽度：左缘拖拽可调，双击复位；持久化到 localStorage 并写入 --agent-w 供全局避让
  const [width, setWidth] = useState(() => {
    const n = Number(localStorage.getItem('wv-agent-w'))
    return n >= W_MIN && n <= W_MAX ? n : W_DEFAULT
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  busyRef.current = busy
  const startedIngest = useRef<string | null>(null)
  const startedLint = useRef<string | null>(null)

  useEffect(() => {
    document.documentElement.style.setProperty('--agent-w', `${width}px`)
    localStorage.setItem('wv-agent-w', String(width))
  }, [width])

  const onDragStart = (e: ReactMouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const move = (ev: MouseEvent) => {
      // 向左拖变宽（面板靠右）
      setWidth(Math.min(W_MAX, Math.max(W_MIN, startW + (startX - ev.clientX))))
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  // 每次打开面板时探测 agent-server 是否在线
  useEffect(() => {
    if (!open) return
    setChecked(false)
    agentHealth().then((h) => {
      setHealth(h)
      setChecked(true)
    })
  }, [open])

  // 新消息自动滚到底部
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs, busy])

  /** 更新最后一条 assistant 消息 */
  const patchAssistant = (fn: (m: Extract<Msg, { role: 'assistant' }>) => Msg) =>
    setMsgs((all) => {
      const next = [...all]
      for (let i = next.length - 1; i >= 0; i--)
        if (next[i].role === 'assistant') {
          next[i] = fn(next[i] as Extract<Msg, { role: 'assistant' }>)
          break
        }
      return next
    })

  /** 通用流式任务执行：推送 user 标签 + assistant 占位，接管全部 SSE 事件 */
  const runStream = async (
    label: string,
    run: (onEvent: (e: AgentStreamEvent) => void, signal: AbortSignal) => Promise<void>,
    assistantSeed?: Partial<Extract<Msg, { role: 'assistant' }>>,
  ) => {
    setMsgs((m) => [
      ...m,
      { role: 'user', text: label },
      { role: 'assistant', text: '', tools: [], ...assistantSeed },
    ])
    setBusy(true)
    const ctl = new AbortController()
    abortRef.current = ctl
    const onEvent = (e: AgentStreamEvent) => {
      if (e.type === 'delta') patchAssistant((m) => ({ ...m, text: m.text + e.text }))
      else if (e.type === 'tool') {
        if (e.state === 'start')
          patchAssistant((m) => ({ ...m, tools: [...m.tools, { name: e.name, detail: e.detail, running: true }] }))
        else
          patchAssistant((m) => {
            const tools = [...m.tools]
            for (let i = tools.length - 1; i >= 0; i--)
              if (tools[i].name === e.name && tools[i].running) {
                tools[i] = { ...tools[i], running: false, isError: e.isError }
                break
              }
            return { ...m, tools }
          })
      } else if (e.type === 'diffs')
        setMsgs((m) => [
          ...m,
          { role: 'diffs', sessionId: e.sessionId, mode: e.mode, files: e.files, state: 'pending' },
        ])
      else if (e.type === 'error') patchAssistant((m) => ({ ...m, error: e.message }))
    }
    try {
      await run(onEvent, ctl.signal)
    } catch (err) {
      if (!ctl.signal.aborted) patchAssistant((m) => ({ ...m, error: String((err as Error)?.message || err) }))
    } finally {
      abortRef.current = null
      setBusy(false)
    }
  }

  const send = () => {
    const q = input.trim()
    if (!q || busy) return
    setInput('')
    void runStream(
      q,
      (onEvent, signal) => askAgent({ question: q, contextPageId: withContext ? (page?.id ?? null) : null }, onEvent, signal),
      { question: q },
    )
  }

  const startIngest = (p: WikiPage) => {
    const file = p.file.split('/').slice(-1)[0]
    void runStream(`摄取原始资料：raw/${file}`, (onEvent, signal) => runIngest({ rawFile: file }, onEvent, signal))
  }

  const startLint = (issues: string[]) => {
    void runStream(`修复 ${issues.length} 项健康问题`, (onEvent, signal) => runLint({ issues }, onEvent, signal))
  }

  // 外部入口自动触发：raw 页「启动摄取」/ 健康仪表盘「用 LLM 修复」
  useEffect(() => {
    if (!open || busyRef.current) return
    if (ingestTarget && startedIngest.current !== ingestTarget.id) {
      startedIngest.current = ingestTarget.id
      onIngestConsumed?.()
      startIngest(ingestTarget)
    }
  }, [open, ingestTarget])
  useEffect(() => {
    if (!open || busyRef.current || !lintIssues?.length) return
    const key = lintIssues.join('\u0000')
    if (startedLint.current === key) return
    startedLint.current = key
    onLintConsumed?.()
    startLint(lintIssues)
  }, [open, lintIssues])

  const actOnDiffs = async (i: number, action: 'apply' | 'discard') => {
    const m = msgs[i]
    if (m.role !== 'diffs' || m.state !== 'pending') return
    setMsgs((all) => all.map((x, j) => (j === i && x.role === 'diffs' ? { ...x, note: action === 'apply' ? '正在应用到知识库…' : '正在丢弃…' } : x)))
    try {
      if (action === 'apply') {
        const r = await applyStaging(m.sessionId)
        setMsgs((all) =>
          all.map((x, j) =>
            j === i && x.role === 'diffs'
              ? { ...x, state: 'applied', note: `已应用 ${r.changed.length} 个文件${r.synced ? ' · 快照已同步，浏览器即将刷新数据' : ' · ⚠ 快照同步失败，请手动 npm run sync'}` }
              : x,
          ),
        )
      } else {
        await discardStaging(m.sessionId)
        setMsgs((all) => all.map((x, j) => (j === i && x.role === 'diffs' ? { ...x, state: 'discarded', note: '已丢弃，知识库未发生任何变化' } : x)))
      }
    } catch (e) {
      setMsgs((all) => all.map((x, j) => (j === i && x.role === 'diffs' ? { ...x, note: `操作失败：${String((e as Error)?.message || e)}` } : x)))
    }
  }

  const saveAnswer = async (i: number) => {
    const m = msgs[i]
    if (m.role !== 'assistant' || !m.text.trim() || m.savedAs) return
    const title = (m.question || '知识库问答').slice(0, 40)
    try {
      const r = await saveOutput({ title, content: m.text, question: m.question })
      setMsgs((all) => all.map((x, j) => (j === i && x.role === 'assistant' ? { ...x, savedAs: r.path } : x)))
    } catch (e) {
      setMsgs((all) =>
        all.map((x, j) => (j === i && x.role === 'assistant' ? { ...x, saveError: String((e as Error)?.message || e) } : x)),
      )
    }
  }

  if (!open) return null

  const offline = checked && !health

  return (
    <aside
      className="relative flex shrink-0 flex-col border-l border-line bg-ink"
      style={{ width }}
    >
      {/* 左缘拖拽手柄：调宽，双击复位 */}
      <div
        onMouseDown={onDragStart}
        onDoubleClick={() => setWidth(W_DEFAULT)}
        title="拖拽调整面板宽度（双击复位）"
        className="absolute left-[-3px] top-0 z-10 h-full w-[7px] cursor-col-resize transition-colors hover:bg-accent/30 active:bg-accent/50"
      />
      {/* header */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3.5">
        <Bot size={15} className="text-accent" />
        <span className="text-[13px] font-semibold text-fg">知识库智能体</span>
        <span
          className={`h-1.5 w-1.5 rounded-full ${health ? 'bg-cat-entity' : checked ? 'bg-cat-concept' : 'bg-fg-muted/40'}`}
          title={health ? `pi ${health.piVersion} · ${health.vault}` : checked ? 'agent-server 离线' : '探测中…'}
        />
        {busy && (
          <button
            onClick={() => abortRef.current?.abort()}
            className="ml-auto rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] text-fg-muted hover:border-cat-concept/50 hover:text-cat-concept"
          >
            停止
          </button>
        )}
      </div>

      {/* messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        {offline ? (
          <div className="mt-6 rounded-card border border-line bg-surface p-4 text-[12.5px] leading-6 text-fg-secondary">
            <div className="mb-1.5 font-semibold text-fg">agent-server 未启动</div>
            <p className="text-fg-muted">问答/摄取功能需要本地运行 pi 智能体服务（查询只读、写入经 diff 审核门）。在项目根目录执行：</p>
            <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-ink-soft p-2.5 font-mono text-[11.5px] text-accent-glow">
              {'cd agent-server\nnpm install   # 首次\nnpm start'}
            </pre>
            <p className="mt-2 text-fg-muted">启动后重新打开本面板即可（需 pi 0.86+ 且已完成 pi login）。</p>
          </div>
        ) : msgs.length === 0 ? (
          <div className="mt-8 text-center text-[12.5px] leading-6 text-fg-muted">
            <Bot size={26} className="mx-auto mb-3 opacity-40" />
            问答 · 摄取 · 健康修复
            <br />
            <span className="text-[11.5px] opacity-70">
              {page ? `提问将携带当前页「${page.title}」作为上下文` : '打开任意页面后可携带其上下文提问'}
            </span>
            <div className="mt-5 flex flex-wrap justify-center gap-1.5">
              {['LLM Wiki 的四原则是什么？', '知识复利是如何实现的？', '综合本页要点，给出延伸阅读'].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-[11.5px] text-fg-secondary hover:border-accent/50 hover:text-fg"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {msgs.map((m, i) => {
              if (m.role === 'user')
                return (
                  <div key={i} className="ml-8 rounded-card border border-accent/30 bg-accent/10 px-3 py-2 text-[12.5px] leading-6 text-fg">
                    {m.text}
                  </div>
                )
              if (m.role === 'diffs')
                return (
                  <div key={i} className="rounded-card border border-line bg-surface p-2.5">
                    <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-fg">
                      <Check size={12} className={m.state === 'applied' ? 'text-cat-entity' : 'text-accent'} />
                      {m.mode === 'ingest' ? '摄取改动审核' : '修复改动审核'} · {m.files.length} 个文件
                      <span className="ml-auto font-normal text-fg-muted">
                        {m.state === 'applied' ? '已应用' : m.state === 'discarded' ? '已丢弃' : '待审核'}
                      </span>
                    </div>
                    {m.files.length === 0 ? (
                      <div className="px-1 py-2 text-[12px] text-fg-muted">agent 没有产生任何文件改动。</div>
                    ) : (
                      <div className="space-y-1.5">
                        {m.files.map((f) => <DiffBlock key={f.path} f={f} />)}
                      </div>
                    )}
                    {m.state === 'pending' && m.files.length > 0 && (
                      <div className="mt-2.5 flex gap-2">
                        <button
                          onClick={() => actOnDiffs(i, 'apply')}
                          className="flex-1 rounded-md border border-cat-entity/50 bg-cat-entity/10 py-1.5 text-[12px] font-medium text-cat-entity transition-colors hover:bg-cat-entity/20"
                        >
                          应用全部
                        </button>
                        <button
                          onClick={() => actOnDiffs(i, 'discard')}
                          className="flex-1 rounded-md border border-line bg-surface py-1.5 text-[12px] text-fg-muted transition-colors hover:border-cat-concept/50 hover:text-cat-concept"
                        >
                          丢弃
                        </button>
                      </div>
                    )}
                    {m.note && (
                      <div className={`mt-2 px-1 text-[11.5px] ${m.state === 'applied' ? 'text-cat-entity' : m.state === 'discarded' ? 'text-fg-muted' : 'text-cat-concept'}`}>
                        {m.note}
                      </div>
                    )}
                  </div>
                )
              // assistant
              return (
                <div key={i} className="mr-2">
                  <ToolChips tools={m.tools} />
                  {m.text && (
                    <div className="rounded-card border border-line bg-surface px-3.5 py-2.5 text-[13px] text-fg-secondary">
                      <AssistantBody text={m.text} onLink={onNavigate} />
                      {!busy && m.question && (
                        <div className="mt-2 border-t border-line/60 pt-2">
                          {m.savedAs ? (
                            <span className="flex items-center gap-1 text-[11px] text-cat-entity">
                              <Check size={11} /> 已保存为成品：{m.savedAs}
                            </span>
                          ) : (
                            <button
                              onClick={() => saveAnswer(i)}
                              className="flex items-center gap-1 rounded border border-line bg-ink-soft px-2 py-0.5 text-[11px] text-fg-muted transition-colors hover:border-accent/50 hover:text-accent"
                            >
                              <PackagePlus size={11} /> 保存到 output/
                            </button>
                          )}
                          {m.saveError && <span className="ml-2 text-[11px] text-cat-concept">{m.saveError}</span>}
                        </div>
                      )}
                    </div>
                  )}
                  {m.error && (
                    <div className="mt-1.5 rounded-card border border-cat-concept/40 bg-cat-concept/10 px-3 py-2 text-[12px] text-cat-concept">
                      {m.error}
                    </div>
                  )}
                  {busy && i === msgs.length - 1 && !m.text && !m.error && (
                    <div className="flex items-center gap-1.5 px-1 py-2 text-[12px] text-fg-muted">
                      <Loader2 size={12} className="animate-spin" />
                      正在查阅知识库…
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* composer */}
      <div className="shrink-0 border-t border-line px-3.5 py-2.5">
        <label className="mb-1.5 flex cursor-pointer items-center gap-1.5 text-[11px] text-fg-muted">
          <input
            type="checkbox"
            checked={withContext}
            onChange={(e) => setWithContext(e.target.checked)}
            className="h-3 w-3 accent-[hsl(var(--accent))]"
          />
          携带当前页作为上下文{page ? `（${page.title}）` : ''}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={2}
            placeholder={offline ? 'agent-server 离线，无法提问' : '提问知识库…（Enter 发送，Shift+Enter 换行）'}
            disabled={offline}
            className="min-w-0 flex-1 resize-none rounded-md border border-line bg-surface px-2.5 py-2 text-[12.5px] leading-5 text-fg placeholder:text-fg-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={busy || offline || !input.trim()}
            aria-label="发送"
            className="rounded-md border border-accent/60 bg-accent/15 p-2 text-accent transition-colors hover:bg-accent/25 disabled:cursor-default disabled:opacity-30"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </aside>
  )
}
