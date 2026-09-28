import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import { GitBranch, History, Loader2, Minimize2, RefreshCw, Sparkles, User, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import {
  getSessionEntryDetail,
  getSessionTree,
  type EntryDetail,
  type SessionTree,
  type SessionTreeNode,
} from '@/lib/agent'
import PanelFrame from './PanelFrame'

interface Props {
  /** 当前活动会话 id；为 null 时显示引导空态 */
  sessionId: string | null
}

/** 一行分支树记录：node + 折叠后的显示深度（线性链不缩进，仅在分叉处 +1） */
interface Row {
  node: SessionTreeNode
  depth: number
}

/** 面板实宽超过此值就改用左右模式（分支树在左、详情在右）；典型命中场景是顶栏选「面板」独占态 */
const WIDE_PX = 720
/** 左右模式下分支树列的固定宽 */
const TREE_COL_W = 'w-72'

/** 只有这些角色在分支树中占据可见行；其余（tool/system/usage/model…）作为线性穿越 */
function isRow(n: SessionTreeNode): boolean {
  return n.role === 'user' || n.role === 'assistant' || n.role === 'compaction' || n.role === 'branch'
}

const ROLE_META: Record<string, { tag: string; icon: typeof User | null; cls: string; chip: string }> = {
  user: { tag: '问', icon: User, cls: 'text-cat-entity', chip: 'bg-cat-entity/15 text-cat-entity' },
  assistant: { tag: '答', icon: Sparkles, cls: 'text-accent', chip: 'bg-accent/15 text-accent' },
  compaction: { tag: '压缩', icon: Minimize2, cls: 'text-fg-muted', chip: 'bg-surface-raised text-fg-muted' },
  branch: { tag: '分支', icon: GitBranch, cls: 'text-cat-synthesis', chip: 'bg-cat-synthesis/15 text-cat-synthesis' },
}

/** 折叠线性链后展开成分支树行序列（对齐 pi-web BranchNavigator 的链压缩思路） */
function flattenTree(nodes: SessionTreeNode[]): Row[] {
  const acc: Row[] = []
  const walk = (list: SessionTreeNode[], depth: number) => {
    for (const root of list) {
      if (isRow(root)) acc.push({ node: root, depth })
      let cur = root
      // 单子链：同一深度线性下探
      while ((cur.children?.length ?? 0) === 1) {
        cur = cur.children[0]
        if (isRow(cur)) acc.push({ node: cur, depth })
      }
      // 分叉（≥2 子）：各子分支降一级缩进递归
      if ((cur.children?.length ?? 0) > 1) walk(cur.children, depth + 1)
    }
  }
  walk(nodes, 0)
  return acc
}

/** 一轮问答：user 行为分组头，其后的回答/过程行为子节点；首个问题前的孤儿行归入无头分组 */
interface Exchange {
  header: Row | null
  children: Row[]
}

/** 一问一答为一个循环：以 user 行为界把扁平行序列分组成轮次 */
function groupExchanges(rows: Row[]): Exchange[] {
  const list: Exchange[] = []
  for (const row of rows) {
    if (row.node.role === 'user') list.push({ header: row, children: [] })
    else if (list.length) list[list.length - 1].children.push(row)
    else list.push({ header: null, children: [row] })
  }
  return list
}

/** 收集 leafId 到根的祖先 id 集（用于高亮当前活动分支；含被折叠隐藏的中间节点） */
function collectActivePath(tree: SessionTreeNode[], leafId: string | null): Set<string> {
  const byId = new Map<string, string | null>()
  const collect = (n: SessionTreeNode) => {
    byId.set(n.id, n.parentId)
    n.children.forEach(collect)
  }
  tree.forEach(collect)
  const set = new Set<string>()
  let cur = leafId
  while (cur && byId.has(cur)) {
    set.add(cur)
    cur = byId.get(cur) ?? null
  }
  return set
}

/**
 * 右栏「历史」tab：会话完整历史——分支树（轮次分组 + 分叉缩进）+ 选中节点的只读详情。
 * 纯分析用途：只读浏览任意分支，不提供分支切换等写操作。
 * 套 PanelFrame 统一 chrome，冷会话由 server 从磁盘懒恢复（首次略慢）。
 */
export default function HistoryPanel({ sessionId }: Props) {
  const [tree, setTree] = useState<SessionTree | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<EntryDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const previewRef = useRef<HTMLDivElement>(null)
  // 宽态探测：按容器实宽（而非布局态）决定上下/左右，拖宽右栏时同样生效
  // 注意：根节点只在 tree 就绪后才渲染，必须用回调 ref 在节点出现时才建立观察（挂载时拿 ref.current 会永远是 null）
  const roRef = useRef<ResizeObserver | null>(null)
  const [wide, setWide] = useState(false)
  const observeRoot = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!el || typeof ResizeObserver === 'undefined') {
      if (el) setWide(el.getBoundingClientRect().width >= WIDE_PX) // 降级：无 RO 时仅在挂载时量一次
      return
    }
    const ro = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= WIDE_PX))
    ro.observe(el)
    roRef.current = ro
  }, [])
  useEffect(() => () => roRef.current?.disconnect(), [])

  // 会话切换 / 刷新：拉取分支树，默认选中当前 leaf
  useEffect(() => {
    setTree(null)
    setError(null)
    setSelectedId(null)
    setDetail(null)
    if (!sessionId) return
    let alive = true
    setLoading(true)
    getSessionTree(sessionId)
      .then((t) => {
        if (!alive) return
        setTree(t)
        // 默认选中最后一条“可见行”（user/assistant/compaction/branch）；leafId 可能落在 custom/usage 等非行节点
        const rws = flattenTree(t.tree)
        setSelectedId(rws.length ? rws[rws.length - 1].node.id : t.leafId)
      })
      .catch((e) => alive && setError(String((e as Error)?.message || e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [sessionId, tick])

  // 选中节点变化：只拉取该节点自身详情（不重复展示之前的消息）
  useEffect(() => {
    if (!sessionId || !selectedId) {
      setDetail(null)
      return
    }
    let alive = true
    setDetailLoading(true)
    getSessionEntryDetail(sessionId, selectedId)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setDetail(null))
      .finally(() => alive && setDetailLoading(false))
    return () => {
      alive = false
    }
  }, [sessionId, selectedId])

  const rows = useMemo(() => (tree ? flattenTree(tree.tree) : []), [tree])
  const exchanges = useMemo(() => groupExchanges(rows), [rows])
  const activePath = useMemo(() => (tree ? collectActivePath(tree.tree, tree.leafId) : new Set<string>()), [tree])

  // 轮次折叠：树重建时只展开最后一轮（当前问答），其余收起，长会话一眼可读
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ids = exchanges.map((ex) => ex.header?.node.id).filter((x): x is string => !!x)
    setCollapsed(new Set(ids.slice(0, -1)))
  }, [tree])
  const toggleExchange = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const expandAll = () => setCollapsed(new Set())
  /** 全部收起，但保留选中节点所在轮（不让详情失去对应行） */
  const collapseAll = () => {
    const keep = exchanges.find(
      (ex) => ex.header?.node.id === selectedId || ex.children.some((c) => c.node.id === selectedId),
    )?.header?.node.id
    const ids = exchanges.map((ex) => ex.header?.node.id).filter((x): x is string => !!x)
    setCollapsed(new Set(ids.filter((id) => id !== keep)))
  }

  /** 分支树单行；isHeader 时前置展开/收起招箭头，extraDepth 为轮内额外缩进一级 */
  const renderNodeRow = (row: Row, extraDepth: number, childCount: number, isHeader: boolean) => {
    const { node, depth } = row
    const meta = ROLE_META[node.role] ?? { tag: node.role, icon: null, cls: 'text-fg-muted', chip: 'bg-surface-raised text-fg-muted' }
    const Icon = meta.icon
    const onPath = activePath.has(node.id)
    const selected = node.id === selectedId
    const forks = node.children.length > 1
    const open = !collapsed.has(node.id)
    return (
      <button
        key={node.id}
        onClick={() => {
          setSelectedId(node.id)
          // 收起态下点问题行：选中并自动展开该轮
          if (isHeader && collapsed.has(node.id)) toggleExchange(node.id)
        }}
        title={node.preview || node.type}
        className={`flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11.5px] transition-colors ${
          selected ? 'bg-accent/10 text-fg' : onPath ? 'text-fg-secondary hover:bg-surface-raised' : 'text-fg-muted hover:bg-surface-raised/60'
        } ${isHeader ? 'mt-1' : ''}`}
        style={{ paddingLeft: 8 + (depth + extraDepth) * 14 }}
      >
        {isHeader ? (
          <span
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              toggleExchange(node.id)
            }}
            className="-ml-1 flex w-4 shrink-0 cursor-pointer justify-center rounded p-px hover:bg-surface-raised"
            title={open ? '收起本轮' : '展开本轮'}
          >
            {open ? <ChevronDown size={11} strokeWidth={2} className="text-fg-muted" /> : <ChevronRight size={11} strokeWidth={2} className="text-fg-muted" />}
          </span>
        ) : (
          /* 子行占位同宽箭头列，使上下图标严格对齐成一列 */
          <span className="-ml-1 w-4 shrink-0" />
        )}
        {Icon ? (
          <Icon size={11} className={`shrink-0 ${meta.cls}`} strokeWidth={2} />
        ) : (
          <span className={`shrink-0 font-mono text-[9px] ${meta.cls}`}>{meta.tag.slice(0, 2)}</span>
        )}
        {/* 角色芯片：染色代替原先的 opacity-60 灰字，问答一眼可分 */}
        <span className={`shrink-0 rounded px-1 py-px font-mono text-[9.5px] ${meta.chip}`}>{meta.tag}</span>
        <span className="min-w-0 flex-1 truncate">{node.preview || <span className="opacity-40">（无文本）</span>}</span>
        {isHeader && !open && childCount > 0 && (
          <span className="shrink-0 font-mono text-[9px] opacity-60" title="本轮收起的回合数">{childCount} 项</span>
        )}
        {forks && (
          <span className="shrink-0 rounded-full bg-cat-synthesis/20 px-1.5 font-mono text-[9.5px] text-cat-synthesis" title={`${node.children.length} 个分支`}>
            ×{node.children.length}
          </span>
        )}
        {onPath && !selected && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/50" />}
      </button>
    )
  }

  return (
    <PanelFrame
      icon={History}
      title="会话历史"
      meta={sessionId ? sessionId.slice(0, 8) : undefined}
      actions={
        sessionId ? (
          <button
            onClick={() => setTick((t) => t + 1)}
            disabled={loading}
            aria-label="刷新"
            title="重新拉取分支树"
            className="shrink-0 rounded-md p-1 text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        ) : undefined
      }
    >
      {!sessionId ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[11.5px] leading-5 text-fg-muted">
          <History size={20} className="opacity-40" />
          当前没有活动会话 — 发起对话或在左栏「会话」中打开一个后可浏览完整历史
        </div>
      ) : loading && !tree ? (
        <div className="flex items-center gap-2 p-4 text-[12px] text-fg-muted">
          <Loader2 size={13} className="animate-spin" />
          正在恢复会话并构建分支树…
        </div>
      ) : error ? (
        <div className="p-4 text-[12px] leading-6 text-cat-concept">{error}</div>
      ) : tree ? (
        <div ref={observeRoot} className={`flex h-full min-h-0 ${wide ? 'flex-row' : 'flex-col'}`}>
          {/* 分支树：窄态在上（限高 46%）/ 宽态在左（固定列宽） */}
          <div
            className={`flex min-h-0 shrink-0 flex-col ${
              wide ? `${TREE_COL_W} min-w-0 border-r border-line/60` : 'max-h-[46%]'
            }`}
          >
            <div className="flex items-center justify-between border-b border-line/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-muted">
              <span>分支树 · {tree.entryCount} 条记录{tree.truncated ? '（已截断）' : ''}</span>
              <span className="flex shrink-0 items-center gap-0.5 normal-case tracking-normal">
                <button onClick={expandAll} title="展开全部轮次" className="rounded p-0.5 transition-colors hover:bg-surface-raised hover:text-fg">
                  <ChevronsUpDown size={11} strokeWidth={2} />
                </button>
                <button onClick={collapseAll} title="收起全部轮次（保留选中所在轮）" className="rounded p-0.5 transition-colors hover:bg-surface-raised hover:text-fg">
                  <ChevronsDownUp size={11} strokeWidth={2} />
                </button>
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {exchanges.map((ex, gi) => {
              const exId = ex.header?.node.id ?? `orphan-${gi}`
              const open = !ex.header || !collapsed.has(ex.header.node.id)
              return (
                <div key={exId}>
                  {ex.header && renderNodeRow(ex.header, 0, ex.children.length, true)}
                  {open && ex.children.map((row) => renderNodeRow(row, 0, 0, false))}
                </div>
              )
            })}
            </div>
          </div>
          {/* 详情：窄态在下 / 宽态在右 */}
          <div
            ref={previewRef}
            className={`min-h-0 min-w-0 flex-1 overflow-y-auto border-line/60 px-3 py-2 ${wide ? 'border-l' : 'border-t'}`}
          >
            {detailLoading ? (
              <div className="flex items-center gap-2 text-[12px] text-fg-muted">
                <Loader2 size={13} className="animate-spin" />
                加载该条详情…
              </div>
            ) : detail ? (
              <DetailBody detail={detail} />
            ) : (
              <div className="text-[12px] text-fg-muted">选择{wide ? '左侧' : '上方'}节点以查看该条详情</div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 text-[12px] text-fg-muted">无数据</div>
      )}
    </PanelFrame>
  )
}

/** 单条详情：角色/时间页脚 + （助手）thinking、工具折叠、prose-chat 正文 */
function DetailBody({ detail }: { detail: EntryDetail }) {
  // 只有出现在最后一个 tool 之后的 text 段才是该 entry 对用户的答复（danger 回答卡）；
  // 工具之前的 text 是旁白（叙述），不能标成“结果”
  const lastToolIdx = detail.parts ? detail.parts.reduce((a, p, i) => (p.kind === 'tool' ? i : a), -1) : -1
  const time = detail.ts ? new Date(detail.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
  const foot = [
    detail.role === 'assistant' && detail.model ? `模型 ${detail.model}` : '',
    detail.usage ? `in ${detail.usage.input} / out ${detail.usage.output} / cache ${detail.usage.cacheRead}` : '',
    detail.cost != null ? `$${detail.cost.toFixed(4)}` : '',
    detail.tokensBefore != null ? `压缩前 ${detail.tokensBefore.toLocaleString('en-US')} tokens` : '',
    time,
  ].filter(Boolean)
  return (
    <div className="pb-2">
      <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line/50 pb-1.5 font-mono text-[10px] text-fg-muted">
        <span className="rounded bg-surface-raised px-1.5 py-px text-fg-secondary">{ROLE_LABEL[detail.role] ?? detail.role}</span>
        {foot.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>

      {detail.role === 'compaction' || detail.role === 'branch' ? (
        <div className="text-[12px] leading-6 text-fg-secondary">{detail.summary || '（无摘要）'}</div>
      ) : detail.role === 'user' ? (
        <div className="rounded-md border border-line/60 bg-surface/40 px-3 py-1.5 text-[12.5px] leading-6 whitespace-pre-wrap text-fg-secondary">
          {detail.text || '（空）'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {detail.parts?.length ? (
            /* 真实时序：thinking / 叙述文本 / 工具调用按 content blocks 原始顺序交错展示，不再分组 */
            detail.parts.map((p, i) => {
              if (p.kind === 'thinking') return detail.thinking ? <ThinkingCard key={i} text={detail.thinking} /> : null
              if (p.kind === 'tool') {
                const tc = detail.tools?.[p.toolIndex]
                return tc ? <ToolCard key={i} tc={tc} /> : null
              }
              return i > lastToolIdx ? <AnswerCard key={i} text={p.text} /> : <NarrationCard key={i} text={p.text} />
            })
          ) : (
            <>
              {/* 旧数据降级（无 parts）：处理详情分组 + 末尾结果卡 */}
              {(detail.thinking || detail.tools?.length) && (
                <details open>
                  <summary className="cursor-pointer select-none font-mono text-[10.5px] text-fg-muted">
                    处理详情{detail.tools?.length ? ` · ${detail.tools.length} 工具` : ''}
                  </summary>
                  {detail.thinking && <div className="mt-1"><ThinkingCard text={detail.thinking} /></div>}
                  <div className="mt-1 space-y-1.5">
                    {detail.tools?.map((tc, k) => (
                      <ToolCard key={k} tc={tc} />
                    ))}
                  </div>
                </details>
              )}
              {detail.text ? (
                <AnswerCard text={detail.text} />
              ) : (
                !detail.tools?.length && !detail.thinking ? <div className="text-[11.5px] text-fg-secondary">（无文本内容）</div> : null
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** 思考卡（source 紫）：默认收起为一行标题，展开后限高滚动 */
function ThinkingCard({ text }: { text: string }) {
  return (
    <details className="rounded border border-cat-source/40 bg-cat-source/5">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 px-2 py-1 font-mono text-[10.5px] text-cat-source">
        思考 · {text.length.toLocaleString('en-US')} 字符
      </summary>
      <p className="max-h-60 overflow-auto border-t border-line/50 px-2 py-1 text-[11.5px] leading-5 whitespace-pre-wrap text-fg-secondary">{text}</p>
    </details>
  )
}

/** 工具卡（entity 绿，✗ 标 concept）：行尾附入参/出参字符数，单击整行展开 */
function ToolCard({ tc }: { tc: NonNullable<EntryDetail['tools']>[number] }) {
  return (
    <details className="rounded border border-cat-entity/40 bg-cat-entity/5">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 px-2 py-1 font-mono text-[10.5px] text-cat-entity">
        <span className={tc.isError ? 'text-cat-concept' : 'text-cat-entity'}>{tc.isError ? '✗' : '✓'}</span>
        {tc.name}
        <span className="ml-auto shrink-0 opacity-70">
          {tc.args != null ? `入参 ${JSON.stringify(tc.args).length.toLocaleString('en-US')}` : '无入参'}
          {' · '}
          {tc.result ? `出参 ${tc.result.length.toLocaleString('en-US')} 字符` : '无出参'}
        </span>
      </summary>
      {tc.args != null ? (
        <pre className="max-h-40 overflow-auto border-t border-line/50 px-2 py-1 font-mono text-[11.5px] whitespace-pre-wrap text-fg-secondary">
          {JSON.stringify(tc.args, null, 2)}
        </pre>
      ) : (
        <div className="border-t border-line/50 px-2 py-1 font-mono text-[11.5px] text-fg-secondary/70">（无参数）</div>
      )}
      {tc.result && (
        <pre className="max-h-60 overflow-auto border-t border-line/50 px-2 py-1 font-mono text-[11.5px] whitespace-pre-wrap text-fg-secondary">
          {tc.result}
        </pre>
      )}
    </details>
  )
}

/** 叙述文本卡（工具前的旁白）：与思考/回答卡同形制；色用 cat-raw 浅蓝，与聊天列旁白卡对齐 */
function NarrationCard({ text }: { text: string }) {
  return (
    <details className="rounded border border-cat-raw/40 bg-cat-raw/5">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 px-2 py-1 font-mono text-[10.5px] text-cat-raw">
        旁白 · {text.length.toLocaleString('en-US')} 字符
      </summary>
      <div className="prose-chat max-h-[28rem] overflow-auto border-t border-line/50 px-3 py-2 text-[11.5px]" dangerouslySetInnerHTML={{ __html: marked.parse(text, { async: false }) as string }} />
    </details>
  )
}

/** 回答卡（danger 浅红）：entry 末尾对用户的答复文本，默认收起限高滚动；叫「回答」与工具出参的“结果”区分 */
function AnswerCard({ text }: { text: string }) {
  return (
    <details className="rounded border border-danger/40 bg-danger/5">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 px-2 py-1 font-mono text-[10.5px] text-danger">
        回答 · {text.length.toLocaleString('en-US')} 字符
      </summary>
      <div className="prose-chat max-h-[28rem] overflow-auto border-t border-line/50 px-3 py-2 text-[11.5px]" dangerouslySetInnerHTML={{ __html: marked.parse(text, { async: false }) as string }} />
    </details>
  )
}

const ROLE_LABEL: Record<string, string> = {
  user: '用户',
  assistant: '助手',
  compaction: '上下文压缩',
  branch: '分支摘要',
}
