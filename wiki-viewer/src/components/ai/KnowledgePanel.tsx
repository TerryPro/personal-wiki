import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CircleDashed, FileArchive, RefreshCw, Sparkles, UserX } from 'lucide-react'
import { brokenLinks, digestion, healthReport } from '@/lib/wiki'
import { listStagingSessions, type StagingSessionInfo } from '@/lib/agent'
import type { AgentTask } from '@/types'

interface Props {
  onStartTask: (task: AgentTask) => void
  /** 查看暂存待审会话（在聊天区恢复 diff 审核卡） */
  onShowStaging: (id: string, mode: string) => void
  busy: boolean
  online: boolean | null
}

/** 把健康指标组装成 lint 任务的问题描述（与阅读模式仪表盘同一套文案） */
function lintIssuesFor(kind: 'orphans' | 'broken' | 'stale'): string[] {
  const health = healthReport()
  if (kind === 'orphans')
    return health.orphans.map((p) => `孤立页（零反链）：「${p.title}」（${p.slug}）——请在内容相关的页面中自然地补上指向它的 [[双链]]`)
  if (kind === 'broken')
    return brokenLinks.map((b) => `断链：[[${b.target}]] 被 ${b.from.map((f) => f.title).join('、')} 引用——请修正链接写法或创建缺失页面`)
  return health.stale.map((s) => `陈旧页：「${s.page.title}」滞后于来源页「${s.newerSource.title}」（${s.newerSource.updated} > ${s.page.updated}）——请用新来源信息刷新并更新 updated 日期`)
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line px-3 py-3">
      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{title}</div>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="px-1 py-2 text-[11.5px] text-fg-muted">{text}</div>
}

function FixButton({ n, onClick, disabled }: { n: number; onClick: () => void; disabled: boolean }) {
  if (n === 0) return null
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md border border-accent/50 bg-accent/10 py-1 text-[11.5px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
    >
      <Sparkles size={11} />
      用 LLM 修复这 {n} 项
    </button>
  )
}

export default function KnowledgePanel({ onStartTask, onShowStaging, busy, online }: Props) {
  const health = healthReport()
  const [staging, setStaging] = useState<StagingSessionInfo[]>([])

  const refreshStaging = useCallback(async () => {
    try {
      setStaging(await listStagingSessions())
    } catch {
      setStaging([])
    }
  }, [])

  useEffect(() => {
    if (online) refreshStaging()
  }, [online, refreshStaging])

  const disabled = busy || online !== true

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* 待消化原料 */}
      <Section title={`待消化原料 · ${digestion.digested}/${digestion.total}`}>
        {digestion.undigestedFiles.length === 0 ? (
          <Empty text="全部原料已消化 ✓" />
        ) : (
          <ul className="space-y-1">
            {digestion.undigestedFiles.map((f) => (
              <li key={f} className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-surface-raised">
                <FileArchive size={12} className="shrink-0" style={{ color: 'hsl(var(--cat-raw))' }} />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-secondary" title={f}>
                  {f}
                </span>
                <button
                  onClick={() => onStartTask({ type: 'ingest', rawFile: f, title: f })}
                  disabled={disabled}
                  className="shrink-0 rounded border border-accent/50 bg-accent/10 px-1.5 py-px text-[10.5px] font-medium text-accent hover:bg-accent/20 disabled:opacity-40"
                >
                  摄取
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 健康问题 */}
      <Section title="健康问题">
        <ul className="space-y-2 text-[12px]">
          <li>
            <span className="flex items-center gap-1.5 text-fg-secondary">
              <UserX size={12} className={health.orphans.length ? 'text-cat-concept' : 'text-fg-muted'} />
              孤立页
              <span className="ml-auto font-mono tabular-nums text-fg-muted">{health.orphans.length}</span>
            </span>
            {health.orphans.length > 0 && (
              <div className="mt-1 space-y-px pl-[18px] text-[11px] text-fg-muted">
                {health.orphans.slice(0, 5).map((p) => (
                  <div key={p.id} className="truncate">{p.title}</div>
                ))}
                {health.orphans.length > 5 && <div>…等 {health.orphans.length} 页</div>}
              </div>
            )}
            <FixButton n={health.orphans.length} disabled={disabled} onClick={() => onStartTask({ type: 'lint', issues: lintIssuesFor('orphans') })} />
          </li>
          <li>
            <span className="flex items-center gap-1.5 text-fg-secondary">
              <CircleDashed size={12} className={brokenLinks.length ? 'text-cat-concept' : 'text-fg-muted'} />
              断链
              <span className="ml-auto font-mono tabular-nums text-fg-muted">{brokenLinks.length}</span>
            </span>
            <FixButton n={brokenLinks.length} disabled={disabled} onClick={() => onStartTask({ type: 'lint', issues: lintIssuesFor('broken') })} />
          </li>
          <li>
            <span className="flex items-center gap-1.5 text-fg-secondary">
              <AlertTriangle size={12} className={health.stale.length ? 'text-cat-concept' : 'text-fg-muted'} />
              陈旧页
              <span className="ml-auto font-mono tabular-nums text-fg-muted">{health.stale.length}</span>
            </span>
            <FixButton n={health.stale.length} disabled={disabled} onClick={() => onStartTask({ type: 'lint', issues: lintIssuesFor('stale') })} />
          </li>
        </ul>
        <p className="mt-2 text-[10.5px] leading-4 text-fg-muted">
          数据来自构建期快照；摄取/修复应用后自动重新同步。
        </p>
      </Section>

      {/* 暂存待审 */}
      <Section title="暂存待审">
        <button onClick={refreshStaging} className="mb-1.5 flex items-center gap-1 text-[10.5px] text-fg-muted hover:text-accent" title="刷新暂存列表">
          <RefreshCw size={10} />
          刷新
        </button>
        {staging.length === 0 ? (
          <Empty text="没有待审核的改动" />
        ) : (
          <ul className="space-y-1">
            {staging.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => onShowStaging(s.id, s.mode)}
                  className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-surface-raised"
                  title={`查看 ${s.files.length} 个文件的 diff 并审核`}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cat-concept" />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-secondary">
                    {s.mode === 'ingest' ? '摄取' : s.mode === 'chat' ? '会话' : '修复'} · {s.target}
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] text-fg-muted">{s.files.length} 文件</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
