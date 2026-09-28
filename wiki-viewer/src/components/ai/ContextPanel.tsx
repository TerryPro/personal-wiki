import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, ScrollText } from 'lucide-react'
import { getSessionContext, type SessionContextInfo } from '@/lib/agent'
import PanelFrame from './PanelFrame'

interface Props {
  /** 当前活动会话 id；为 null 时显示引导空态 */
  sessionId: string | null
}

/**
 * 右栏「上下文」tab：pi agent 上下文检视——完整系统提示词（运行时拼装）+ 工具集 + 用量。
 * 冷会话由 server 按磁盘转录懒恢复后返回，首次加载略慢属正常。套 PanelFrame 统一 chrome。
 */
export default function ContextPanel({ sessionId }: Props) {
  const [data, setData] = useState<SessionContextInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  // 会话切换 / 手动刷新（tick）时重新拉取
  useEffect(() => {
    setData(null)
    setError(null)
    if (!sessionId) return
    let alive = true
    setLoading(true)
    getSessionContext(sessionId)
      .then((r) => alive && setData(r))
      .catch((e) => {
        if (!alive) return
        setData(null)
        setError(String((e as Error)?.message || e))
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [sessionId, tick])

  const cu = data?.contextUsage
  const meta = [
    data ? `模式 ${data.mode}` : '',
    data?.model ? `模型 ${data.model}` : '',
    cu
      ? `上下文 ${cu.tokens != null ? cu.tokens.toLocaleString('en-US') : '—'} / ${(cu.contextWindow ?? 0).toLocaleString('en-US')}${cu.percent != null ? `（${cu.percent.toFixed(1)}%）` : ''}`
      : '',
    data ? `成本 $${data.cost.toFixed(4)}` : '',
  ].filter(Boolean)

  return (
    <PanelFrame
      icon={ScrollText}
      title="上下文检视"
      meta={sessionId ? sessionId.slice(0, 8) : undefined}
      actions={
        sessionId ? (
          <button
            onClick={() => setTick((t) => t + 1)}
            disabled={loading}
            aria-label="刷新"
            title="重新拉取（会话进行中内容会增长）"
            className="shrink-0 rounded-md p-1 text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        ) : undefined
      }
    >
      {!sessionId ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[11.5px] leading-5 text-fg-muted">
          <ScrollText size={20} className="opacity-40" />
          当前没有活动会话 — 发起对话或在左栏「会话」中打开一个后可检视
        </div>
      ) : loading && !data ? (
        <div className="flex items-center gap-2 p-4 text-[12px] text-fg-muted">
          <Loader2 size={13} className="animate-spin" />
          正在恢复会话并拼装上下文…
        </div>
      ) : error ? (
        <div className="p-4 text-[12px] leading-6 text-cat-concept">{error}</div>
      ) : data ? (
        <div className="h-full overflow-y-auto">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/60 px-3 py-1.5 font-mono text-[10.5px] text-fg-muted">
            {meta.map((m) => (
              <span key={m}>{m}</span>
            ))}
            {data.tools?.length ? (
              <span className="flex items-center gap-1">
                工具：
                {data.tools.map((t) => (
                  <span key={t} className="rounded border border-line bg-ink-soft px-1 py-px text-fg-secondary">
                    {t}
                  </span>
                ))}
              </span>
            ) : (
              ''
            )}
          </div>
          <div className="px-3 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
            系统提示词（运行时拼装，实际发送给模型的内容）
          </div>
          <pre className="whitespace-pre-wrap px-3 py-2 pb-4 font-mono text-[11px] leading-[1.7] text-fg-secondary">
            {data.systemPrompt ?? '（server 未返回系统提示词）'}
          </pre>
        </div>
      ) : (
        <div className="p-4 text-[12px] text-fg-muted">无数据</div>
      )}
    </PanelFrame>
  )
}
