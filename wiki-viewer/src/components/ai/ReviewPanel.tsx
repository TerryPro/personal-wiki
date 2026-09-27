import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, FileDiff, Loader2, X } from 'lucide-react'
import { applyStaging, discardStaging, getStagingDetail, type DiffFile, type StagingSessionInfo } from '@/lib/agent'
import PanelFrame from './PanelFrame'

interface Props {
  sessionId: string | null
  sessions: StagingSessionInfo[]
  onSelectSession: (id: string) => void
  onClose: () => void
  onApplied: (sessionId: string) => void
  onDiscarded: (sessionId: string) => void
  /** 部分应用/撤销后刷新外层待审列表 */
  onPartial?: () => void
}

/** 着色 unified diff 行（与聊天 DiffBlock 同款配色，始终展开） */
function DiffLines({ diff }: { diff: string }) {
  const lines = useMemo(() => diff.split('\n').filter(Boolean), [diff])
  return (
    <pre className="min-h-0 flex-1 overflow-auto bg-surface px-2.5 py-2 font-mono text-[11px] leading-[1.7]">
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
  )
}

const MODE_LABEL: Record<string, string> = { ingest: '摄取', lint: '修复', chat: '会话', edit: '编辑' }

/**
 * 右栏「审查」tab：暂存 diff 审批。套 PanelFrame 统一 chrome。
 * 左文件清单 + 右选中文件 diff；多待审会话时头部提供选择器；footer 应用/丢弃。
 */
export default function ReviewPanel({ sessionId, sessions, onSelectSession, onClose, onApplied, onDiscarded, onPartial }: Props) {
  const [files, setFiles] = useState<DiffFile[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const session = sessions.find((s) => s.id === sessionId) ?? null

  const load = useCallback(async () => {
    if (!sessionId) {
      setFiles([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const detail = await getStagingDetail(sessionId)
      setFiles(detail.files)
      setSelected((cur) => (cur && detail.files.some((f) => f.path === cur) ? cur : detail.files[0]?.path ?? null))
    } catch (e) {
      setError(String((e as Error)?.message || e))
      setFiles([])
    }
    setLoading(false)
  }, [sessionId])

  useEffect(() => {
    load()
  }, [load])

  const act = async (action: 'apply' | 'discard') => {
    if (!sessionId) return
    setBusy(action)
    setError(null)
    try {
      if (action === 'apply') await applyStaging(sessionId)
      else await discardStaging(sessionId)
      if (action === 'apply') onApplied(sessionId)
      else onDiscarded(sessionId)
    } catch (e) {
      setError(String((e as Error)?.message || e))
    }
    setBusy(null)
  }

  /** 逐文件应用/撤销：子集操作后会话保留剩余文件；全部处理完回调 onApplied/onDiscarded */
  const actFile = async (rel: string, action: 'apply' | 'discard') => {
    if (!sessionId) return
    setBusy(`${rel}:${action}`)
    setError(null)
    try {
      const r =
        action === 'apply' ? await applyStaging(sessionId, [rel]) : await discardStaging(sessionId, [rel])
      if (r.done) {
        if (action === 'apply') onApplied(sessionId)
        else onDiscarded(sessionId)
      } else {
        await load()
        onPartial?.()
      }
    } catch (e) {
      setError(String((e as Error)?.message || e))
    }
    setBusy(null)
  }

  const sel = files.find((f) => f.path === selected) ?? null
  const modeLabel = session ? MODE_LABEL[session.mode] ?? session.mode : '改动'
  const hasPending = sessions.length > 0

  return (
    <PanelFrame
      icon={FileDiff}
      title="改动审查"
      meta={session ? `${modeLabel} · ${files.length} 文件` : undefined}
      onClose={onClose}
      actions={
        sessions.length > 1 ? (
          <select
            value={sessionId ?? ''}
            onChange={(e) => onSelectSession(e.target.value)}
            title="切换待审会话"
            className="max-w-[92px] shrink-0 rounded-md border border-line bg-surface px-1 py-0.5 font-mono text-[10px] text-fg-secondary focus:border-accent/60 focus:outline-none"
          >
            {sessions.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}/{sessions.length} {MODE_LABEL[s.mode] ?? s.mode}
              </option>
            ))}
          </select>
        ) : undefined
      }
      footer={
        session && files.length > 0 ? (
          <>
            {error && <div className="mb-1.5 text-[11px] text-cat-concept">{error}</div>}
            <div className="flex gap-2">
              <button
                onClick={() => act('apply')}
                disabled={busy !== null}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-cat-entity/50 bg-cat-entity/10 py-1.5 text-[12px] font-medium text-cat-entity transition-colors hover:bg-cat-entity/20 disabled:opacity-50"
              >
                {busy === 'apply' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                应用全部
              </button>
              <button
                onClick={() => act('discard')}
                disabled={busy !== null}
                className="flex-1 rounded-md border border-line bg-surface py-1.5 text-[12px] text-fg-muted transition-colors hover:border-cat-concept/50 hover:text-cat-concept disabled:opacity-50"
              >
                丢弃
              </button>
            </div>
          </>
        ) : undefined
      }
    >
      {!hasPending || !session ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[11.5px] leading-5 text-fg-muted">
          <FileDiff size={20} className="opacity-40" />
          没有待审改动
          <span className="text-[10.5px] opacity-70">agent 或编辑产生的暂存改动会出现在这里</span>
        </div>
      ) : loading ? (
        <div className="flex h-full items-center justify-center gap-2 text-[12px] text-fg-muted">
          <Loader2 size={13} className="animate-spin" /> 加载暂存改动…
        </div>
      ) : files.length === 0 ? (
        <div className="flex h-full items-center justify-center px-6 text-center text-[11.5px] text-fg-muted">该会话没有文件改动。</div>
      ) : (
        <div className="flex h-full min-h-0">
          {/* 文件清单 */}
          <div className="w-[38%] shrink-0 overflow-y-auto border-r border-line">
            {files.map((f) => (
              <div
                key={f.path}
                role="button"
                onClick={() => setSelected(f.path)}
                className={`group flex w-full cursor-pointer items-center gap-1.5 px-2 py-1.5 text-left transition-colors ${
                  selected === f.path ? 'bg-accent/10 text-accent' : 'text-fg-secondary hover:bg-surface-raised'
                }`}
              >
                <span
                  className={`shrink-0 rounded border px-1 py-px font-mono text-[9.5px] ${
                    f.status === 'new'
                      ? 'border-cat-entity/50 bg-cat-entity/10 text-cat-entity'
                      : 'border-cat-concept/50 bg-cat-concept/10 text-cat-concept'
                  }`}
                >
                  {f.status === 'new' ? '新' : '改'}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[10.5px]">{f.path}</span>
                {/* 逐文件操作：悬停显现 */}
                <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation()
                      actFile(f.path, 'apply')
                    }}
                    title="应用此文件"
                    disabled={busy !== null}
                    className="rounded p-0.5 text-cat-entity hover:bg-cat-entity/15 disabled:opacity-40"
                  >
                    <Check size={11} />
                  </button>
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation()
                      actFile(f.path, 'discard')
                    }}
                    title="撤销此文件（不应用）"
                    disabled={busy !== null}
                    className="rounded p-0.5 text-fg-muted hover:bg-cat-concept/15 hover:text-cat-concept disabled:opacity-40"
                  >
                    <X size={11} />
                  </button>
                </span>
              </div>
            ))}
          </div>
          {/* 选中文件 diff */}
          <div className="flex min-w-0 flex-1 flex-col">
            {sel ? (
              <>
                <div className="shrink-0 truncate border-b border-line bg-ink-soft px-2.5 py-1 font-mono text-[10.5px] text-fg-secondary">{sel.path}</div>
                <DiffLines diff={sel.diff} />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-[11.5px] text-fg-muted">选择左侧文件查看差异</div>
            )}
          </div>
        </div>
      )}
    </PanelFrame>
  )
}
