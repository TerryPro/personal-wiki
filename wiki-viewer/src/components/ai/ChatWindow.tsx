import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Lightbulb, Loader2, PackagePlus } from 'lucide-react'
import { marked } from 'marked'
import type { AgentToolCall, DiffFile, TurnView } from '@/lib/agent'
import { hydrateWikiLinks } from '@/components/PageView'
import { resolveTitle } from '@/lib/wiki'
import { hidePreview } from '@/lib/preview'
import type { WikiPage } from '@/types'

/** AI 模式聊天消息（pi-web 风格：assistant = 多个 turn） */
export type Msg =
  | { role: 'user'; text: string; ts: number }
  | {
      role: 'assistant'
      turns: TurnView[]
      ts: number
      error?: string
      question?: string
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

const fmtNum = (n: number) => n.toLocaleString('en-US')
const fmtDur = (ms: number | null | undefined) =>
  ms == null ? '' : ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`
const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

/** 工具参数摘要（单行截断展示） */
function argsSummary(args: unknown): string {
  if (args == null) return ''
  if (typeof args === 'string') return args
  const a = args as Record<string, unknown>
  for (const k of ['path', 'file_path', 'pattern', 'command', 'query', 'rawFile'])
    if (typeof a[k] === 'string') return a[k] as string
  try {
    return JSON.stringify(args)
  } catch {
    return ''
  }
}

/** assistant 正文：Markdown 渲染 + 双链水合（点击 → 切回 wiki 模式打开页面） */
export function AssistantBody({ text, onLink }: { text: string; onLink: (p: WikiPage) => void }) {
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
  return <div ref={ref} className="prose-chat" dangerouslySetInnerHTML={{ __html: html }} />
}

/** thinking 盒：灯泡图标 + 等宽单行截断，点击展开全文 */
function ThinkingBox({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  if (!text.trim()) return null
  return (
    <button
      onClick={() => setOpen((v) => !v)}
      title={open ? '收起思考过程' : '展开思考过程'}
      className="block w-full rounded-md border border-line bg-surface/60 px-2.5 py-1.5 text-left transition-colors hover:border-accent/40"
    >
      <span className={`flex items-start gap-1.5 font-mono text-[11.5px] leading-5 text-fg-secondary ${open ? '' : 'items-center'}`}>
        <Lightbulb size={12} className="mt-[3px] shrink-0 text-fg-muted" />
        <span className={open ? 'whitespace-pre-wrap' : 'truncate'}>{text}</span>
      </span>
    </button>
  )
}

/** 工具调用行（pi-web 同款）：绿色 mono 名称 + 参数摘要 + 耗时 + 展开；
 *  展开区两段式：参数 JSON 块（深一档绿底）+ 结果原文块（等宽可滚动） */
function ToolRow({ t }: { t: AgentToolCall }) {
  const [open, setOpen] = useState(false)
  const summary = argsSummary(t.args)
  const argsJson = useMemo(() => {
    if (t.args == null) return ''
    try {
      const s = JSON.stringify(t.args, null, 2)
      return s === '{}' ? '' : s
    } catch {
      return ''
    }
  }, [t.args])
  const hasDetail = argsJson !== '' || t.result != null
  return (
    <div className="overflow-hidden rounded-md border border-cat-entity/30 bg-cat-entity/5">
      <button
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${hasDetail ? 'hover:bg-cat-entity/10' : 'cursor-default'}`}
      >
        <span className={`shrink-0 font-mono text-[11.5px] font-semibold ${t.isError ? 'text-cat-concept' : 'text-cat-entity'}`}>
          {t.name}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-secondary">{summary}</span>
        {t.running ? (
          <Loader2 size={11} className="shrink-0 animate-spin text-fg-muted" />
        ) : (
          <span className="shrink-0 font-mono text-[10.5px] text-fg-muted">{fmtDur(t.durationMs)}</span>
        )}
        {hasDetail && (
          <ChevronDown size={11} className={`shrink-0 text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {open && hasDetail && (
        <div className="border-t border-cat-entity/20">
          {/* 参数 JSON 块 */}
          {argsJson && (
            <pre className="overflow-x-auto whitespace-pre bg-cat-entity/10 px-3 py-2 font-mono text-[11px] leading-[1.6] text-fg-secondary">
              {argsJson}
            </pre>
          )}
          {/* 结果原文块 */}
          {t.result != null && (
            <pre
              className={`max-h-[380px] overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11.5px] leading-[1.7] text-fg-secondary ${argsJson ? 'border-t border-cat-entity/15' : ''}`}
            >
              {t.result}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

/** 每轮 usage 行：3,124 in · 213 out · 2,048 cache R · $0.0012 */
function UsageLine({ turn }: { turn: TurnView }) {
  if (!turn.usage && turn.cost == null) return null
  const u = turn.usage
  return (
    <div className="font-mono text-[10.5px] text-fg-muted">
      {u && (
        <>
          {fmtNum(u.input)} in · {fmtNum(u.output)} out
          {u.cacheRead > 0 && <> · {fmtNum(u.cacheRead)} cache R</>}
          {' · '}
        </>
      )}
      ${(turn.cost ?? 0).toFixed(4)}
    </div>
  )
}

/** 单个 turn 的过程渲染：模型名 → thinking → 工具行 → usage（回答文本在外层独立渲染） */
function TurnBlock({ turn }: { turn: TurnView }) {
  return (
    <div className="space-y-1.5">
      {turn.model && <div className="text-[11px] text-fg-muted">{turn.model}</div>}
      {turn.thinking.trim() && <ThinkingBox text={turn.thinking} />}
      {turn.tools.map((t, i) => (
        <ToolRow key={t.id ?? i} t={t} />
      ))}
      <UsageLine turn={turn} />
    </div>
  )
}

/** 单文件 diff：折叠头（状态徽标 + 路径 + 增删行数）+ 展开的着色 unified diff */
export function DiffBlock({ f }: { f: DiffFile }) {
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
          <span className="text-cat-entity">+{adds}</span> <span className="text-cat-concept">-{dels}</span>
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

interface Props {
  msgs: Msg[]
  busy: boolean
  onLink: (p: WikiPage) => void
  onSave: (i: number) => void
  onApply: (i: number) => void
  onDiscard: (i: number) => void
}

export default function ChatWindow({ msgs, busy, onLink, onSave, onApply, onDiscard }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 新消息自动滚到底部
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs, busy])

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto px-5"
      style={{ paddingTop: 'var(--chat-pad-y, 1rem)', paddingBottom: 'var(--chat-pad-y, 1rem)' }}
    >
      {/* 空会话欢迎页由 AiMode 居中布局接管，这里只渲染有消息的列表 */}
      {msgs.length > 0 && (
        <div className="mx-auto max-w-full space-y-6" style={{ width: 'var(--chat-w, 72%)' }}>
          {msgs.map((m, i) => {
            if (m.role === 'user')
              return (
                <div key={i} className="flex flex-col items-end">
                  <div className="max-w-[80%] rounded-lg bg-cat-source/15 px-3.5 py-2 text-[13px] leading-6 text-fg">
                    {m.text}
                  </div>
                  <span className="mt-1 text-[10px] text-fg-muted">{fmtTime(m.ts)}</span>
                </div>
              )
            if (m.role === 'diffs')
              return (
                <div key={i} className="rounded-card border border-line bg-surface p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-fg">
                    <Check size={12} className={m.state === 'applied' ? 'text-cat-entity' : 'text-accent'} />
                    {m.mode === 'ingest' ? '摄取改动审核' : m.mode === 'chat' ? '会话改动审核' : '修复改动审核'} · {m.files.length} 个文件
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
                        onClick={() => onApply(i)}
                        className="flex-1 rounded-md border border-cat-entity/50 bg-cat-entity/10 py-1.5 text-[12px] font-medium text-cat-entity transition-colors hover:bg-cat-entity/20"
                      >
                        应用全部
                      </button>
                      <button
                        onClick={() => onDiscard(i)}
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
            // assistant：处理详情折叠（仅过程）+ 回答文本直接铺排（pi-web 无卡片包裹）+ usage/时间页脚
            const toolCount = m.turns.reduce((a, t) => a + t.tools.length, 0)
            const hasProcess = m.turns.some((t) => t.thinking.trim() || t.tools.length > 0)
            const isLast = i === msgs.length - 1
            const textTurns = m.turns.filter((t) => t.text.trim())
            const lastUsage = [...m.turns].reverse().find((t) => t.usage || t.cost != null)
            return (
              <div key={i} className="space-y-2.5">
                {hasProcess && <ProcessDetails turns={m.turns} toolCount={toolCount} />}
                {textTurns.length > 0 && <ResultBlock turns={textTurns} onLink={onLink} />}
                {/* 消息页脚：最终轮 usage + 时间戳（pi-web 同款底行） */}
                {(lastUsage || !busy) && (
                  <div className="flex items-center gap-2 pt-0.5 font-mono text-[10.5px] text-fg-muted">
                    {lastUsage?.usage && (
                      <span>
                        {fmtNum(lastUsage.usage.input)} in · {fmtNum(lastUsage.usage.output)} out
                        {lastUsage.usage.cacheRead > 0 && <> · {fmtNum(lastUsage.usage.cacheRead)} cache R</>}
                        {(lastUsage.cost ?? 0) > 0 && <> · ${(lastUsage.cost ?? 0).toFixed(4)}</>}
                      </span>
                    )}
                    <span className="ml-auto">{fmtTime(m.ts)}</span>
                  </div>
                )}
                {m.error && (
                  <div className="rounded-card border border-cat-concept/40 bg-cat-concept/10 px-3 py-2 text-[12px] text-cat-concept">
                    {m.error}
                  </div>
                )}
                {busy && isLast && !textTurns.length && !m.error && (
                  <div className="flex items-center gap-1.5 px-1 text-[12px] text-fg-muted">
                    <Loader2 size={12} className="animate-spin" />
                    正在思考…
                  </div>
                )}
                {!busy && m.question && textTurns.length > 0 && (
                  <div className="flex items-center gap-2">
                    {m.savedAs ? (
                      <span className="flex items-center gap-1 text-[11px] text-cat-entity">
                        <Check size={11} /> 已保存为成品：{m.savedAs}
                      </span>
                    ) : (
                      <button
                        onClick={() => onSave(i)}
                        className="flex items-center gap-1 rounded border border-line bg-ink-soft px-2 py-0.5 text-[11px] text-fg-muted transition-colors hover:border-accent/50 hover:text-accent"
                      >
                        <PackagePlus size={11} /> 保存到 output/
                      </button>
                    )}
                    {m.saveError && <span className="text-[11px] text-cat-concept">{m.saveError}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** 「最终结果 · N 条消息」折叠块（与处理详情对称）：默认展开，内含各 turn 回答卡片 */
function ResultBlock({ turns, onLink }: { turns: TurnView[]; onLink: (p: WikiPage) => void }) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[12px] font-medium text-fg-secondary transition-colors hover:text-fg"
      >
        <ChevronDown size={13} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
        最终结果 · {turns.length} 条消息
      </button>
      {open && (
        <div className="mt-2 space-y-2.5">
          {turns.map((t, k) => (
            <div key={k} className="rounded-card border border-line/70 bg-surface/50 px-4 py-2.5">
              <AssistantBody text={t.text} onLink={onLink} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 「处理详情 · N 条消息 · M 次工具调用」折叠块（pi-web 同款）：默认展开，可手动收起 */
function ProcessDetails({ turns, toolCount }: { turns: TurnView[]; toolCount: number }) {
  const [open, setOpen] = useState(true)
  const expanded = open
  return (
    <div>
      <button
        onClick={() => setOpen(!expanded)}
        className="flex items-center gap-1.5 text-[12px] font-medium text-fg-secondary transition-colors hover:text-fg"
      >
        <ChevronDown size={13} className={`transition-transform ${expanded ? '' : '-rotate-90'}`} />
        处理详情 · {turns.length} 条消息 · {toolCount} 次工具调用
      </button>
      {expanded && (
        <div className="mt-2 space-y-3">
          {turns.map((t, i) => (
            <TurnBlock key={i} turn={t} />
          ))}
        </div>
      )}
    </div>
  )
}
