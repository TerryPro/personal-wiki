import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, ChevronRight, CircleDashed, FileArchive, Link2, Loader2, RefreshCw, Sparkles, Upload, UserX } from 'lucide-react'
import { brokenLinks, digestion, getPage, getDataVersion, healthReport, loadVault, pages, subscribeData, data } from '@/lib/wiki'
import { clipUrl, listStagingSessions, markRawIngested, uploadRawFiles, type StagingSessionInfo } from '@/lib/agent'
import type { AgentTask, WikiPage } from '@/types'

interface Props {
  onStartTask: (task: AgentTask) => void
  /** 查看暂存待审会话（在聊天区恢复 diff 审核卡） */
  onShowStaging: (id: string, mode: string) => void
  /** 跳转阅读模式打开页面（已消化清单的文件名/来源页） */
  onOpenPage?: (p: WikiPage) => void
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

/** 收件箱：拖拽/选择本地文件上传 + URL 剪藏，写入 vault 的 raw/（不经审核门） */
function RawInbox({ disabled, onAdded }: { disabled: boolean; onAdded: () => void }) {
  const [url, setUrl] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'busy'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (list: FileList | File[]) => {
    const arr = [...list]
    if (!arr.length || disabled) return
    setStatus({ kind: 'busy', text: `正在上传 ${arr.length} 个文件…` })
    try {
      const r = await uploadRawFiles(arr)
      setStatus({ kind: 'ok', text: `已添加 ${r.written.length} 个文件到 raw/` })
      onAdded()
    } catch (e) {
      setStatus({ kind: 'err', text: String((e as Error)?.message || e) })
    }
  }

  const handleClip = async () => {
    const u = url.trim()
    if (!u || disabled) return
    setStatus({ kind: 'busy', text: '正在抓取网页…' })
    try {
      const r = await clipUrl(u)
      setUrl('')
      setStatus({ kind: 'ok', text: `已剪藏「${r.title}」到 raw/` })
      onAdded()
    } catch (e) {
      setStatus({ kind: 'err', text: String((e as Error)?.message || e) })
    }
  }

  return (
    <div className="space-y-2">
      {/* 拖拽上传区 */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!disabled) handleFiles(e.dataTransfer.files) }}
        onClick={() => !disabled && fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-3 py-4 text-center transition-colors ${
          dragOver ? 'border-accent bg-accent/10' : 'border-line bg-ink-soft hover:border-accent/50'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <Upload size={16} className="text-fg-muted" />
        <span className="text-[11.5px] text-fg-secondary">拖拽文件到此处，或点击选择</span>
        <span className="text-[10.5px] text-fg-muted">.md / .txt 存入 raw/，图片存入 raw/assets/</span>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {/* URL 剪藏 */}
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Link2 size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleClip() }}
            placeholder="粘贴网址剪藏为 Markdown…"
            disabled={disabled}
            className="w-full rounded-md border border-line bg-ink-soft py-1 pl-6 pr-2 text-[11.5px] text-fg placeholder:text-fg-muted/60 focus:border-accent/60 focus:outline-none disabled:opacity-50"
          />
        </div>
        <button
          onClick={handleClip}
          disabled={disabled || !url.trim()}
          className="shrink-0 rounded-md border border-accent/50 bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
        >
          剪藏
        </button>
      </div>

      {/* 状态反馈 */}
      {status && (
        <div
          className={`flex items-start gap-1.5 rounded-md px-2 py-1.5 text-[11px] leading-4 ${
            status.kind === 'ok'
              ? 'bg-cat-entity/10 text-cat-entity'
              : status.kind === 'err'
                ? 'bg-cat-concept/10 text-cat-concept'
                : 'bg-surface-raised text-fg-muted'
          }`}
        >
          {status.kind === 'busy' && <Loader2 size={11} className="mt-px shrink-0 animate-spin" />}
          <span className="min-w-0 break-words">{status.text}</span>
        </div>
      )}
    </div>
  )
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

export default function KnowledgePanel({ onStartTask, onShowStaging, onOpenPage, busy, online }: Props) {
  // 订阅快照版本：apply/标记等写入重跑 sync 后 loadVault 更新单例，本面板据此重渲染（队列/已消化清单实时）
  const dataVersion = useSyncExternalStore(subscribeData, getDataVersion)
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

  /** 收件箱写入 / 人工标记成功：server 已在响应前重跑 sync，重拉快照刷新队列与已消化清单（不整页 reload，保住对话视图） */
  const handleAdded = useCallback(() => {
    void loadVault(data.vaultId)
  }, [])

  // 人工标记进行中的文件（防双击）
  const [marking, setMarking] = useState<string | null>(null)
  const handleMark = async (f: string) => {
    if (marking) return
    setMarking(f)
    try {
      await markRawIngested(f, true)
      handleAdded()
    } catch {
      setMarking(null)
    }
  }

  // 批量摄取勾选：apply/标记后快照刷新，剔除已不在待消化队列的项
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    setSelected((s) => {
      if (!s.size) return s
      const alive = new Set(digestion.undigestedFiles)
      const next = new Set([...s].filter((f) => alive.has(f)))
      return next.size === s.size ? s : next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion])
  const toggleSel = (f: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(f)) n.delete(f)
      else n.add(f)
      return n
    })

  // 已消化清单（折叠）：自动 = sources 反查命中（标注来源页），人工 = ingested: true 兜底；行内可跳转
  const [showDigested, setShowDigested] = useState(false)
  const digestedItems = useMemo(
    () =>
      pages
        .filter((p) => p.category === 'raw' && ((p.digestedBy?.length ?? 0) > 0 || p.ingested === true))
        .map((p) => {
          const by = p.digestedBy ?? []
          return {
            page: p,
            name: p.file.split('/').pop() ?? p.title,
            sources: by.map((id) => getPage(id)).filter((x): x is WikiPage => !!x),
            manual: by.length === 0,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataVersion],
  )
  const manualCount = digestedItems.filter((d) => d.manual).length

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* 收件箱：添加新原料 */}
      <Section title="收件箱 · 添加原料">
        <RawInbox disabled={disabled} onAdded={handleAdded} />
      </Section>

      {/* 待消化原料 */}
      <Section title={`待消化原料 · ${digestion.digested}/${digestion.total}${digestion.manual ? `（含人工标记 ${digestion.manual}）` : ''}`}>
        {digestion.undigestedFiles.length === 0 ? (
          <Empty text="全部原料已消化 ✓" />
        ) : (
          <>
            {/* 批量操作栏：全选 + 勾选计数 + 批量摄取按钮 */}
            <div className="mb-1 flex items-center gap-1.5 px-1.5">
              <input
                type="checkbox"
                checked={selected.size > 0 && selected.size === digestion.undigestedFiles.length}
                onChange={(e) => setSelected(e.target.checked ? new Set(digestion.undigestedFiles) : new Set())}
                disabled={disabled}
                title="全选 / 取消全选"
                className="h-3 w-3 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                style={{ accentColor: 'hsl(var(--accent))' }}
              />
              <span className="min-w-0 truncate text-[10.5px] text-fg-muted">
                {selected.size
                  ? `已选 ${selected.size} 篇${selected.size > 10 ? '（建议每批 ≤ 8–10 篇）' : ''}`
                  : '勾选文件可批量摄取'}
              </span>
              <button
                onClick={() => {
                  const files = digestion.undigestedFiles.filter((f) => selected.has(f))
                  if (!files.length) return
                  setSelected(new Set())
                  onStartTask({ type: 'batch-ingest', rawFiles: files })
                }}
                disabled={disabled || selected.size === 0}
                title="发起批量摄取：新建会话单会话顺序处理多文件，写入同经审核门"
                className="ml-auto shrink-0 rounded border border-accent/50 bg-accent/10 px-1.5 py-px text-[10.5px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
              >
                批量摄取{selected.size ? ` (${selected.size})` : ''}
              </button>
            </div>
            <ul className="space-y-1">
              {digestion.undigestedFiles.map((f) => (
                <li key={f} className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-surface-raised">
                  <input
                    type="checkbox"
                    checked={selected.has(f)}
                    onChange={() => toggleSel(f)}
                    disabled={disabled}
                    title="勾选加入批量摄取"
                    className="h-3 w-3 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                    style={{ accentColor: 'hsl(var(--accent))' }}
                  />
                  <FileArchive size={12} className="shrink-0" style={{ color: 'hsl(var(--cat-raw))' }} />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-secondary" title={f}>
                    {f}
                  </span>
                  <button
                    onClick={() => handleMark(f)}
                    disabled={disabled || marking !== null}
                    title="人工标记已消化（置 ingested: true）——适用于 sources 元数据写错或无需摄取的文件"
                    className="shrink-0 rounded border border-line bg-surface px-1.5 py-px text-[10.5px] text-fg-muted transition-colors hover:border-cat-entity/50 hover:text-cat-entity disabled:opacity-40"
                  >
                    {marking === f ? '标记中…' : '标记已消化'}
                  </button>
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
          </>
        )}
        {/* 批量入口提示：面板勾选或聊天 skill 命令 */}
        <p className="mt-2 text-[10.5px] leading-4 text-fg-muted">
          批量摄取：勾选上方文件后点「批量摄取」，或聊天发送{' '}
          <span className="font-mono text-fg-secondary">/skill:second-brain-ingest 文件名或范围</span>，单会话顺序处理多文件。
        </p>
        {/* 已消化清单（默认折叠）：自动消化标注来源页，人工标记带徽标 */}
        {digestedItems.length > 0 && (
          <div className="mt-2.5 border-t border-line pt-2">
            <button
              onClick={() => setShowDigested((v) => !v)}
              className="flex w-full items-center gap-1 text-left text-[10.5px] text-fg-muted transition-colors hover:text-accent"
              title="展开/收起已消化清单"
            >
              <ChevronRight size={11} className={`shrink-0 transition-transform ${showDigested ? 'rotate-90' : ''}`} />
              已消化 {digestedItems.length}
              <span className="opacity-70">（自动 {digestedItems.length - manualCount}{manualCount > 0 && ` · 人工 ${manualCount}`}）</span>
            </button>
            {showDigested && (
              <ul className="mt-1 space-y-1">
                {digestedItems.map((d) => (
                  <li key={d.name} className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-surface-raised">
                    <FileArchive size={12} className="shrink-0 opacity-70" style={{ color: 'hsl(var(--cat-raw))' }} />
                    <button
                      onClick={() => onOpenPage?.(d.page)}
                      className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-fg-secondary transition-colors hover:text-accent"
                      title={`打开 raw 页：${d.name}`}
                    >
                      {d.name}
                    </button>
                    {d.manual ? (
                      <span
                        className="shrink-0 rounded border border-line bg-ink-soft px-1 py-px text-[9.5px] text-fg-muted"
                        title="人工标记 ingested: true；打开该 raw 页可撤销"
                      >
                        人工标记
                      </span>
                    ) : (
                      <button
                        onClick={() => d.sources[0] && onOpenPage?.(d.sources[0])}
                        className="min-w-0 shrink-0 truncate text-[10px] text-fg-muted transition-colors hover:text-accent"
                        title={`消化为来源页：${d.sources.map((s) => s.title).join('、')}`}
                      >
                        → {d.sources[0]?.title}
                        {d.sources.length > 1 && ` +${d.sources.length - 1}`}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
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
