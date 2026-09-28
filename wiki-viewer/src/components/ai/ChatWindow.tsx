import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ExternalLink, Lightbulb, Loader2, MessageSquareText, PackagePlus, Sparkles, Terminal } from 'lucide-react'
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
      /** 产生这批改动的来源（ingest = raw 文件路径，lint = 问题摘要） */
      target?: string
      files: DiffFile[]
      state: 'pending' | 'applied' | 'discarded'
      note?: string
    }

/** 一轮对话 = 一条 user + 其后第一条有文本的 assistant；供索引抽屉与 minimap 使用 */
export interface Exchange {
  idx: number
  user: string
  assistant: string
}
export function buildExchanges(msgs: Msg[]): Exchange[] {
  const out: Exchange[] = []
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]
    if (m.role !== 'user') continue
    let asst = ''
    for (let j = i + 1; j < msgs.length; j++) {
      const n = msgs[j]
      if (n.role === 'user') break
      if (n.role === 'assistant') {
        const t = n.turns.map((t) => t.text).join(' ').trim()
        if (t) { asst = t; break }
      }
    }
    out.push({ idx: i, user: m.text, assistant: asst })
  }
  return out
}

/** 滚动到第 i 条消息 */
export function jumpToMsg(i: number) {
  document.getElementById(`wv-msg-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
  // 严格统一字号：覆盖 prose-chat 的 13.5px 基线，与工具行/思考盒及历史面板回答卡同为 11.5px（标题/代码等内部层级由 prose-chat 保留）
  return <div ref={ref} className="prose-chat text-[11.5px]" dangerouslySetInnerHTML={{ __html: html }} />
}

/** thinking 盒：灯泡图标 + 等宽文本，**默认直接展开**（只有一行时与收起态观感一致），点击可收拢为单行截断 */
function ThinkingBox({ text }: { text: string }) {
  const [open, setOpen] = useState(true)
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

/** 旁白盒：ThinkingBox 的完全镜像——同样的 mono 11.5px 文本直接铺开（不走 markdown 排版）、默认展开、点击收拢为单行截断，仅图标与颜色换为旁白语义（MessageSquareText + cat-raw） */
function NarrationBox({ text }: { text: string }) {
  const [open, setOpen] = useState(true)
  if (!text.trim()) return null
  return (
    <button
      onClick={() => setOpen((v) => !v)}
      title={open ? '收起旁白' : '展开旁白'}
      className="block w-full rounded-md border border-cat-raw/40 bg-cat-raw/5 px-2.5 py-1.5 text-left transition-colors hover:border-cat-raw/60"
    >
      <span className={`flex items-start gap-1.5 font-mono text-[11.5px] leading-5 text-fg-secondary ${open ? '' : 'items-center'}`}>
        <MessageSquareText size={12} className={`shrink-0 text-cat-raw ${open ? 'mt-[3px]' : ''}`} />
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

/** 单个 turn 的过程渲染拆为两段，按真实时序交错：模型名 → thinking →（外层插入该轮文本）→ 工具行 → usage。
 *  pi 的工具执行发生在 assistant 消息生成完毕之后，故叙述文本恒在前、工具行在后 */
function TurnHead({ turn }: { turn: TurnView }) {
  return (
    <>
      {turn.model && <div className="text-[11px] text-fg-muted">{turn.model}</div>}
      {turn.thinking.trim() && <ThinkingBox text={turn.thinking} />}
    </>
  )
}

function TurnTail({ turn }: { turn: TurnView }) {
  return (
    <>
      {turn.tools.map((t, i) => (
        <ToolRow key={t.id ?? i} t={t} />
      ))}
      <UsageLine turn={turn} />
    </>
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
  /** 打开右栏审查面板（diffs 消息只留指针，审核在右栏进行） */
  onOpenReview: (sessionId: string) => void
}

const LONG_TEXT = 160

/** 用户消息：旧版技能 blob 折叠为命令头（可展开全文）；超长文本默认两行截断 + 展开/收起；短斜杠命令用芯片 */
function UserMsg({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const legacySkill = text.match(/^【指令】用户调用了 skill (\/[\w-]+)/)
  const slashCmd = !legacySkill && /^\/(skill:)?[\w-]+(\s|$)/.test(text)
  const long = text.length > LONG_TEXT

  if (legacySkill)
    return (
      <div className="max-w-[85%] overflow-hidden rounded-lg border border-accent/40 bg-accent/10">
        <button
          onClick={() => setOpen((v) => !v)}
          title={open ? '收起技能全文' : '展开技能全文'}
          className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left font-mono text-[12px] text-accent"
        >
          <Terminal size={12} className="shrink-0" />
          {legacySkill[1]}
          <span className="shrink-0 text-fg-muted">(skill)</span>
          <ChevronDown size={11} className={`ml-auto shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-accent/20 px-3 py-2 font-mono text-[11px] leading-[1.6] text-fg-secondary">
            {text}
          </pre>
        )}
      </div>
    )

  if (slashCmd && !long)
    return <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 font-mono text-[12.5px] text-accent">{text}</div>

  return (
    <div className="max-w-[80%] rounded-lg bg-cat-source/15 px-3.5 py-2 text-[13px] leading-6 text-fg">
      <div className={long && !open ? 'line-clamp-2' : ''}>{text}</div>
      {long && (
        <button onClick={() => setOpen((v) => !v)} className="mt-0.5 text-[11px] font-medium text-accent hover:underline">
          {open ? '收起' : '展开'}
        </button>
      )}
    </div>
  )
}

export default function ChatWindow({ msgs, busy, onLink, onSave, onOpenReview }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 新消息自动滚到底部
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs, busy])

  return (
    <div className="relative flex min-h-0 flex-1">
      <div
        ref={scrollRef}
        data-chat-scroll
        className="min-h-0 flex-1 overflow-y-auto px-5"
        style={{ paddingTop: 'var(--chat-pad-y, 1rem)', paddingBottom: 'var(--chat-pad-y, 1rem)' }}
      >
      {/* 空会话欢迎页由 AiMode 居中布局接管，这里只渲染有消息的列表 */}
      {msgs.length > 0 && (
        <div className="mx-auto max-w-full space-y-6" style={{ width: 'var(--chat-w, 72%)' }}>
          {msgs.map((m, i) => {
            if (m.role === 'user') {
              return (
                <div key={i} id={`wv-msg-${i}`} className="flex flex-col items-end">
                  <UserMsg text={m.text} />
                  <span className="mt-1 text-[10px] text-fg-muted">{fmtTime(m.ts)}</span>
                </div>
              )
            }
            if (m.role === 'diffs')
              return (
                <div key={i} id={`wv-msg-${i}`} className="rounded-card border border-line bg-surface p-2.5">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-fg">
                    <Check size={12} className={m.state === 'applied' ? 'text-cat-entity' : 'text-accent'} />
                    {m.mode === 'ingest' ? '摄取改动' : m.mode === 'chat' ? '会话改动' : '修复改动'}
                    {m.target && (
                      <span className="min-w-0 truncate font-mono text-[10.5px] font-normal text-fg-muted" title={m.target}>
                        {m.target}
                      </span>
                    )}
                    · {m.files.length} 文件
                    <span className="ml-auto font-normal text-fg-muted">
                      {m.state === 'applied' ? '已应用' : m.state === 'discarded' ? '已丢弃' : '待审核'}
                    </span>
                  </div>
                  {m.state === 'pending' && m.files.length > 0 && (
                    <button
                      onClick={() => onOpenReview(m.sessionId)}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-accent/50 bg-accent/10 py-1.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent/20"
                    >
                      <ExternalLink size={12} />
                      在右栏审查并应用
                    </button>
                  )}
                  {m.note && (
                    <div className={`mt-1.5 px-1 text-[11.5px] ${m.state === 'applied' ? 'text-cat-entity' : m.state === 'discarded' ? 'text-fg-muted' : 'text-cat-concept'}`}>
                      {m.note}
                    </div>
                  )}
                </div>
              )
            // assistant：按真实时序交错铺排——每轮 thinking → 文本卡（旁白/最终）→ 工具行 + usage，
            // 与工具执行晚于文本生成的实际顺序一致
            const isLast = i === msgs.length - 1
            const hasText = m.turns.some((t) => t.text.trim())
            const lastTextIdx = m.turns.reduce((acc, t, idx) => (t.text.trim() ? idx : acc), -1)
            const lastUsage = [...m.turns].reverse().find((t) => t.usage || t.cost != null)
            return (
              <div key={i} id={`wv-msg-${i}`} className="space-y-2.5">
                {m.turns.map((t, k) => {
                  // 带工具调用的轮，其文本必在工具前生成（=旁白）；仅“最后一个有文本且不带工具”的轮才算回答。
                  // 冷回放时服务端把每条 entry 作为单轮消息返回，若只看 lastTextIdx 会把所有中间轮误标成回答
                  const isFinal = k === lastTextIdx && t.tools.length === 0
                  return (
                    <div key={k} className="space-y-1.5">
                      <TurnHead turn={t} />
                      {t.text.trim() &&
                        (isFinal ? (
                          <div className="rounded-card border border-accent/40 bg-accent/5 px-4 py-2.5">
                            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium text-accent">
                              <Sparkles size={11} /> 回答
                            </div>
                            <AssistantBody text={t.text} onLink={onLink} />
                          </div>
                        ) : (
                          /* 旁白：与思考盒同形制的紧凑盒 */
                          <NarrationBox text={t.text} />
                        ))}
                      <TurnTail turn={t} />
                    </div>
                  )
                })}
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
                {busy && isLast && !hasText && !m.error && (
                  <div className="flex items-center gap-1.5 px-1 text-[12px] text-fg-muted">
                    <Loader2 size={12} className="animate-spin" />
                    正在思考…
                  </div>
                )}
                {!busy && m.question && hasText && (
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
    </div>
  )
}
