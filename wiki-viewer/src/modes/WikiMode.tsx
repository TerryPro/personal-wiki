import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ClipboardCopy, Focus, List, Moon, PanelLeft, PanelRight, Sparkles, Sun } from 'lucide-react'
import ModeSwitch from '@/components/ModeSwitch'
import Sidebar from '@/components/Sidebar'
import PageView, { NEXT_VIEW, type View } from '@/components/PageView'
import RightRail from '@/components/RightRail'
import GraphView from '@/components/GraphView'
import CommandPalette from '@/components/CommandPalette'
import HelpOverlay from '@/components/HelpOverlay'
import ReaderSettings, { type ReaderCfg } from '@/components/ReaderSettings'
import { data, getPage, healthReport, pages, resolveTitle, brokenLinks, buildLlmContext, digestion, type PaletteAction } from '@/lib/wiki'
import { CATEGORY_META } from '@/lib/wiki'
import type { AgentTask, OutlineItem, WikiPage } from '@/types'

type Mode = 'read' | 'graph'

/** wiki 模式页内 hash：#/wiki/<category>/<file>.md（欢迎页为 #/wiki） */
const hashOf = (id: string) => `#/wiki/${id}`

/** 解析 #/wiki/<category>/<file> 形式的深链，非法/未知页面返回 null */
function parseHash(): WikiPage | null {
  const m = location.hash.match(/^#\/wiki\/([a-z]+)\/(.+\.md)$/)
  return m ? getPage(`${m[1]}/${m[2]}`) : null
}

const CAT_ORDER = [
  { key: 'meta', label: '导航' },
  { key: 'synthesis', label: '综合' },
  { key: 'concept', label: '概念' },
  { key: 'entity', label: '实体' },
  { key: 'source', label: '来源' },
  { key: 'raw', label: '原料' },
  { key: 'output', label: '成品' },
] as const

interface Props {
  theme: 'dark' | 'light'
  setTheme: (fn: (t: 'dark' | 'light') => 'dark' | 'light') => void
  /** 发起跨模式任务（raw 摄取 / 健康修复）→ App 切到 AI 管理模式执行 */
  onTask: (task: AgentTask) => void
  /** 切换到 AI 管理模式（工具栏按钮 / Ctrl+J / 命令面板） */
  onSwitchToAi: () => void
}

function Welcome({ onOpen, onLint }: { onOpen: (p: WikiPage) => void; onLint: (issues: string[]) => void }) {
  const stats = useMemo(() => {
    const by = Object.fromEntries(CAT_ORDER.map((c) => [c.key, 0]))
    for (const p of pages) by[p.category as keyof typeof by]++
    return by
  }, [])
  const quick = ['LLM Wiki 模式', 'Wiki 模式的优势（综合评估）', 'LLM Wiki 典型案例对照']
    .map(resolveTitle)
    .filter(Boolean) as WikiPage[]
  const health = useMemo(healthReport, [])
  const [openMetric, setOpenMetric] = useState<string | null>(null)

  const metrics = [
    { key: 'orphans', n: health.orphans.length, label: '孤立页', hint: '零反链 — 等待下一次摄取连接它', ok: '所有页面都有入链 ✓' },
    { key: 'broken', n: brokenLinks.length, label: '断链', hint: '被引用但未创建的页面', ok: '没有断链 — 引用全部可跳转 ✓' },
    { key: 'stale', n: health.stale.length, label: '陈旧页', hint: '引用的来源页比本页更新', ok: '没有滞后于来源的页面 ✓' },
    { key: 'undigested', n: digestion.undigestedFiles.length, label: '未消化原料', hint: `raw/ 消化率 ${digestion.digested}/${digestion.total} — 尚未生成来源摘要页的文件`, ok: '全部原料已消化 ✓' },
    { key: 'degree', n: Number(health.avgDegree.toFixed(1)), label: '平均连接度', hint: '每页入链 + 出链（含双向）', ok: '' },
  ]

  const metricItems = (key: string): { page?: WikiPage; text: string; sub: string; open?: WikiPage }[] => {
    if (key === 'orphans') return health.orphans.map((p) => ({ page: p, text: p.title, sub: p.categoryLabel }))
    if (key === 'broken') return brokenLinks.map((b) => ({ text: b.target, sub: `${b.from.length} 处引用：${b.from.map((f) => f.title).join('、')}` }))
    if (key === 'stale') return health.stale.map((s) => ({ page: s.page, text: s.page.title, sub: `来源页更新：${s.newerSource.title}（${s.newerSource.updated} > ${s.page.updated}）` }))
    if (key === 'undigested')
      return digestion.undigestedFiles.map((f) => {
        const p = getPage(`raw/${f}`)
        return p ? { page: p, text: f, sub: '等待 ingest 消化' } : { text: f, sub: '等待 ingest 消化' }
      })
    return []
  }

  /** 把当前展开指标的问题清单交给 pi 智能体修复（走 diff 审核门） */
  const lintIssuesFor = (key: string): string[] => {
    if (key === 'orphans')
      return health.orphans.map((p) => `孤立页（零反链）：「${p.title}」（${p.slug}）——请在内容相关的页面中自然地补上指向它的 [[双链]]`)
    if (key === 'broken')
      return brokenLinks.map((b) => `断链：[[${b.target}]] 被 ${b.from.map((f) => f.title).join('、')} 引用——请修正链接写法或创建缺失页面`)
    if (key === 'stale')
      return health.stale.map((s) => `陈旧页：「${s.page.title}」滞后于来源页「${s.newerSource.title}」（${s.newerSource.updated} > ${s.page.updated}）——请用新来源信息刷新并更新 updated 日期`)
    return []
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[46rem] flex-col justify-center px-10 pb-16">
      <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.14em] text-accent">second-brain · LLM librarian</p>
      <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-fg">
        一张由 LLM 维护的
        <br />
        互链知识网络
      </h1>
      <p className="mt-4 text-[15px] leading-7 text-fg-secondary">
        这里展示的是 <span className="font-mono text-[13.5px] text-accent-glow">llmwiki/wiki/</span> 的编译产物：来源摘要、实体、概念与综合页面，由双链织成。从左侧目录、搜索或图谱进入任意一页。
      </p>

      <div className="mt-8 grid grid-cols-7 gap-2.5">
        {CAT_ORDER.map((c) => (
          <div key={c.key} className="rounded-card border border-line bg-surface p-4">
            <div className="text-[24px] font-semibold tabular-nums text-fg">{stats[c.key]}</div>
            <div className="mt-1 text-[12px] text-fg-muted">{c.label}页</div>
          </div>
        ))}
      </div>

      {/* 健康仪表盘 */}
      <div className="mt-7">
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">知识健康</div>
        <div className="grid grid-cols-5 gap-2.5">
          {metrics.map((m) => (
            <button
              key={m.key}
              onClick={() => m.ok === '' || setOpenMetric(openMetric === m.key ? null : m.key)}
              disabled={m.ok === ''}
              className={`rounded-card border bg-surface p-4 text-left transition-colors ${
                openMetric === m.key ? 'border-accent/60' : 'border-line'
              } ${m.ok === '' ? 'cursor-default' : m.n === 0 ? '' : 'hover:border-accent/50'}`}
            >
              <div className={`text-[24px] font-semibold tabular-nums ${m.ok !== '' && m.n > 0 ? 'text-cat-concept' : 'text-fg'}`}>{m.n}</div>
              <div className="mt-1 text-[12px] text-fg-muted">{m.label}</div>
            </button>
          ))}
        </div>
        {openMetric && (
          <div className="mt-3 animate-fade-up rounded-card border border-line bg-surface p-3">
            <div className="mb-2 px-1 text-[11.5px] text-fg-muted">
              {metrics.find((m) => m.key === openMetric)?.hint}
            </div>
            <ul className="space-y-[2px]">
              {metricItems(openMetric).slice(0, 12).map((it, i) =>
                it.page ? (
                  <li key={i}>
                    <button onClick={() => onOpen(it.page!)} className="nav-item">
                      <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: CATEGORY_META[it.page.category].dot }} />
                      <span className="truncate">{it.text}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-fg-muted">{it.sub}</span>
                    </button>
                  </li>
                ) : (
                  <li key={i} className="flex items-baseline gap-2 px-2.5 py-[5px] text-[13px]">
                    <span className="shrink-0 font-mono text-[12px] text-cat-concept">[[{it.text}]]</span>
                    <span className="truncate text-[11.5px] text-fg-muted">{it.sub}</span>
                  </li>
                ),
              )}
            </ul>
            {metricItems(openMetric).length === 0 && <div className="px-1 py-3 text-center text-[12px] text-fg-muted">没有问题 — 这一项很健康 ✓</div>}
            {lintIssuesFor(openMetric).length > 0 && (
              <button
                onClick={() => onLint(lintIssuesFor(openMetric))}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-accent/50 bg-accent/10 py-1.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent/20"
                title="启动 pi 智能体修复这批问题（改动经 diff 审核后才会落盘）"
              >
                <Sparkles size={12} />
                用 LLM 修复这 {lintIssuesFor(openMetric).length} 项问题
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-7">
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">推荐阅读起点</div>
        <div className="flex flex-wrap gap-2">
          {quick.map((p) => (
            <button
              key={p.id}
              onClick={() => onOpen(p)}
              className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] text-fg-secondary transition-colors hover:border-accent/50 hover:text-fg"
            >
              {p.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function WikiMode({ theme, setTheme, onTask, onSwitchToAi }: Props) {
  const [hist, setHist] = useState<{ stack: string[]; pos: number }>(() => {
    // 优先 URL 深链，其次恢复上次会话标签页，否则显示欢迎页
    const id = parseHash()?.id ?? localStorage.getItem('wv-last')
    return id && getPage(id) ? { stack: [id], pos: 0 } : { stack: [], pos: -1 }
  })
  const [mode, setMode] = useState<Mode>('read')
  const [query, setQuery] = useState('')
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [hl, setHl] = useState('') // 从搜索进入页面时的页内高亮词
  const [palette, setPalette] = useState(false)
  const [help, setHelp] = useState(false)
  const [zen, setZen] = useState(false) // 免打扰：隐藏左右栏
  const [zenToc, setZenToc] = useState(false)
  const [view, setView] = useState<View>('read') // 阅读 / 源码 / 分栏，提升到工具栏控制
  const [copyOk, setCopyOk] = useState(false)
  const [leftOpen, setLeftOpen] = useState(() => localStorage.getItem('wv-panel-l') !== '0')
  const [rightOpen, setRightOpen] = useState(() => localStorage.getItem('wv-panel-r') !== '0')
  const mainRef = useRef<HTMLElement>(null)
  const queryRef = useRef(query)
  queryRef.current = query
  const scrollMemo = useRef(new Map<string, number>()) // 页面 → 离开时的阅读位置
  const navRef = useRef({ pos: -1, len: 0 })
  const [reader, setReader] = useState<ReaderCfg>(() => {
    try {
      const s = JSON.parse(localStorage.getItem('wv-reader') ?? '')
      // 旧存档迁移：rem 档位 width(0-3) / 更早的 wide(bool) → 百分比 pct
      const pctRem = [58, 72, 85, 100]
      return {
        size: s.size ?? 1,
        serif: !!s.serif,
        pct: s.pct ?? (typeof s.width === 'number' ? pctRem[s.width] ?? 72 : s.wide ? 100 : 72),
        padY: s.padY ?? s.pad ?? 1,
      }
    } catch {
      return { size: 1, serif: false, pct: 72, padY: 1 }
    }
  })

  useEffect(() => {
    const el = document.documentElement
    const d = el.dataset
    d.rsize = String(reader.size)
    d.rserif = reader.serif ? '1' : '0'
    d.rpad = String(reader.padY)
    el.style.setProperty('--read-pct', `${Math.min(100, Math.max(50, reader.pct))}%`)
    localStorage.setItem('wv-reader', JSON.stringify(reader))
  }, [reader])

  // 侧栏折叠状态持久化（刷新/下次打开保留）
  useEffect(() => localStorage.setItem('wv-panel-l', leftOpen ? '1' : '0'), [leftOpen])
  useEffect(() => localStorage.setItem('wv-panel-r', rightOpen ? '1' : '0'), [rightOpen])

  const activeId = hist.pos >= 0 ? hist.stack[hist.pos] : null
  const page = activeId ? getPage(activeId) : null

  // 状态 → URL：活跃页变化时写入 hash（同值不重复 push）并持久化会话
  useEffect(() => {
    const target = activeId ? hashOf(activeId) : '#/wiki'
    if (location.hash !== target) location.hash = target
    if (activeId) localStorage.setItem('wv-last', activeId)
  }, [activeId])

  // 浏览器前进/后退、手动改地址栏 → 同步到历史栈（仅处理 #/wiki 前缀，模式级切换由 App 负责）
  useEffect(() => {
    const onHash = () => {
      if (!location.hash.startsWith('#/wiki')) return
      const p = parseHash()
      if (!p) return
      setHist((h) => {
        if (h.stack[h.pos] === p.id) return h
        const at = h.stack.indexOf(p.id)
        if (at >= 0) return { ...h, pos: at }
        const stack = [...h.stack.slice(0, h.pos + 1), p.id]
        return { stack, pos: stack.length - 1 }
      })
      setQuery('')
      setMode('read')
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  const open = useCallback((p: WikiPage) => {
    setHl(queryRef.current.trim()) // 搜索态下打开页面：携带高亮词
    setHist((h) => {
      if (h.stack[h.pos] === p.id) return h
      const stack = [...h.stack.slice(0, h.pos + 1), p.id]
      return { stack, pos: stack.length - 1 }
    })
    setQuery('')
    setMode('read')
  }, [])

  const goTo = (pos: number) => {
    setHist((h) => {
      const next = Math.min(Math.max(pos, 0), h.stack.length - 1)
      if (next === h.pos) return h
      location.hash = hashOf(h.stack[next])
      return { ...h, pos: next }
    })
  }
  const back = () => goTo(hist.pos - 1)
  const fwd = () => goTo(hist.pos + 1)

  // 切页时：视图回阅读、复制反馈复位
  useEffect(() => {
    setView('read')
    setCopyOk(false)
  }, [activeId])

  const copyPage = async () => {
    if (!page) return
    try {
      await navigator.clipboard.writeText(buildLlmContext(page))
      setCopyOk(true)
      setTimeout(() => setCopyOk(false), 2200)
    } catch {
      /* 剪贴板不可用时静默失败 */
    }
  }

  // 阅读位置：新开页面（栈增长）→ 顶部；回退/前进到读过的页 → 恢复上次位置
  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    if (activeId) {
      const isNew = hist.stack.length > navRef.current.len
      main.scrollTop = isNew ? 0 : scrollMemo.current.get(activeId) ?? 0
    }
    navRef.current = { pos: hist.pos, len: hist.stack.length }
  }, [activeId, hist])

  // 页面切换时清空大纲；同一页内保持引用稳定（依赖键为条目文本签名）
  const outlineKey = outline.map((o) => o.id).join('\u0000')
  const onOutline = useCallback(
    (items: OutlineItem[]) => setOutline((prev) => (prev === items ? prev : items)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, outlineKey],
  )

  // 全局快捷键：Ctrl/Cmd+K 或 Ctrl+O 命令面板；Ctrl+J 切 AI 模式；Alt+←/→ 前后导航；Ctrl+F 聚焦搜索；? 帮助；Esc 关闭浮层
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = /input|textarea/i.test((e.target as HTMLElement)?.tagName)
      const mod = e.ctrlKey || e.metaKey
      if (mod && (e.key === 'k' || e.key === 'o')) {
        e.preventDefault()
        setPalette((v) => !v)
      } else if (mod && e.key === 'j') {
        e.preventDefault()
        onSwitchToAi()
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        goTo(hist.pos - 1)
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        goTo(hist.pos + 1)
      } else if (mod && e.key === 'f' && !inField) {
        e.preventDefault()
        document.getElementById('wv-search')?.focus()
      } else if (e.key === 'Escape') {
        setPalette(false)
        setHelp(false)
        setZen(false)
      } else if (e.key === '?' && !inField && !mod && !e.altKey) {
        e.preventDefault()
        setHelp((v) => !v)
      } else if (e.key === '.' && !inField && !mod && !e.altKey) {
        e.preventDefault()
        setZen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist.pos, hist.stack.length, onSwitchToAi])

  // 命令面板中的非页面动作
  const paletteActions = useMemo<PaletteAction[]>(
    () => [
      { id: 'theme', label: theme === 'dark' ? '切换到浅色主题（宣纸书斋）' : '切换到深色主题（墨绿书斋）', run: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) },
      { id: 'graph', label: '打开全库图谱', run: () => setMode('graph') },
      { id: 'read', label: '回到阅读视图', run: () => setMode('read') },
      { id: 'help', label: '查看快捷键帮助', run: () => setHelp(true) },
      { id: 'ai', label: '进入工作台（pi 智能体）', run: onSwitchToAi },
      { id: 'home', label: '回到首页（欢迎页）', run: () => setHist((h) => ({ ...h, pos: -1 })) },
    ],
    [theme, setTheme, onSwitchToAi],
  )

  const synced = new Date(data.syncedAt)
  const syncedText = `${synced.toLocaleDateString('zh-CN')} ${synced.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`

  return (
    <div className="flex h-full">
      {!zen && leftOpen && <Sidebar activeId={activeId} query={query} onQuery={setQuery} onOpen={open} />}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* toolbar */}
        <header className="flex h-[46px] shrink-0 items-center gap-2 border-b border-line bg-ink-soft px-3">
          <ModeSwitch mode="wiki" onSwitch={onSwitchToAi} />

          <button
            onClick={() => setLeftOpen((v) => !v)}
            aria-label={leftOpen ? '收起侧栏' : '展开侧栏'}
            title={leftOpen ? '收起侧栏' : '展开侧栏'}
            className={`rounded-md border p-1.5 transition-colors ${
              !zen && leftOpen
                ? 'border-accent/60 bg-accent/10 text-accent'
                : 'border-line bg-surface text-fg-secondary hover:border-accent/50 hover:text-accent'
            }`}
          >
            <PanelLeft size={14} strokeWidth={1.9} />
          </button>

          <button onClick={back} disabled={hist.pos <= 0} aria-label="后退" title="后退 (Alt+←)"
            className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button onClick={fwd} disabled={hist.pos >= hist.stack.length - 1} aria-label="前进" title="前进 (Alt+→)"
            className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m9 18 6-6-6-6" /></svg>
          </button>

          <div className="mx-1 h-4 w-px bg-line" />

          {/* mode switch */}
          <div className="flex rounded-lg border border-line bg-surface p-[2px]">
            {(
              [
                ['read', '阅读'],
                ['graph', '图谱'],
              ] as [Mode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1 text-[12.5px] font-medium transition-all duration-150 ${
                  mode === m ? 'bg-surface-raised text-fg shadow-panel' : 'text-fg-muted hover:text-fg-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {page && mode === 'read' && (
            <div className="ml-2 min-w-0 truncate text-[12.5px] text-fg-muted">
              <span className="opacity-60">{page.categoryLabel} / </span>
              <span className="text-fg-secondary">{page.title}</span>
            </div>
          )}

          {page && mode === 'read' && (
            <div className="ml-2 flex items-center gap-1">
              <button
                onClick={() => setView(NEXT_VIEW[view][0])}
                aria-label="切换视图"
                title={NEXT_VIEW[view][1]}
                className={`rounded-md border p-1.5 transition-colors ${
                  view !== 'read'
                    ? 'border-accent/60 bg-accent/10 text-accent'
                    : 'border-line bg-surface text-fg-secondary hover:border-accent/50 hover:text-accent'
                }`}
              >
                {(() => {
                  const VIcon = NEXT_VIEW[view][2]
                  return <VIcon size={13} strokeWidth={1.9} />
                })()}
              </button>
              <button
                onClick={copyPage}
                aria-label="复制为 LLM 上下文"
                title={copyOk ? '已复制，去粘贴给 LLM' : '复制本页（含来源引用头），可直接粘贴进 LLM 对话'}
                className={`rounded-md border p-1.5 transition-colors ${
                  copyOk
                    ? 'border-cat-entity/60 bg-cat-entity/10 text-cat-entity'
                    : 'border-line bg-surface text-fg-secondary hover:border-accent/50 hover:text-accent'
                }`}
              >
                {copyOk ? <Check size={13} strokeWidth={1.9} /> : <ClipboardCopy size={13} strokeWidth={1.9} />}
              </button>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2.5 text-[11px] text-fg-muted">
            <button
              onClick={() => setRightOpen((v) => !v)}
              disabled={!page}
              aria-label={rightOpen ? '收起信息栏' : '展开信息栏'}
              title={!page ? '打开页面后可用' : rightOpen ? '收起信息栏（大纲/反链/追溯）' : '展开信息栏（大纲/反链/追溯）'}
              className={`rounded-md border p-1.5 transition-colors disabled:cursor-default disabled:opacity-30 ${
                !zen && rightOpen && page
                  ? 'border-accent/60 bg-accent/10 text-accent'
                  : 'border-line bg-surface text-fg-secondary hover:border-accent/50 hover:text-accent'
              }`}
            >
              <PanelRight size={14} strokeWidth={1.9} />
            </button>
            <button
              onClick={() => setZen((v) => !v)}
              aria-label="免打扰模式"
              title={zen ? '退出免打扰 (.)' : '免打扰模式：隐藏侧栏与右栏 (.)'}
              className={`rounded-md border p-1.5 transition-colors ${
                zen ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line bg-surface text-fg-secondary hover:border-accent/50 hover:text-accent'
              }`}
            >
              <Focus size={14} strokeWidth={1.9} />
            </button>
            <ReaderSettings value={reader} onChange={setReader} />
            <button
              onClick={() => setPalette(true)}
              aria-label="命令面板"
              title="命令面板 (Ctrl+K)"
              className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-fg-secondary transition-colors hover:border-accent/50 hover:text-accent"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 3v12a3 3 0 0 0 3 3h7" /><path d="m13 15 3 3-3 3" /><path d="M18 3v12" /></svg>
              <kbd className="font-mono text-[10px] opacity-70">Ctrl K</kbd>
            </button>
            <button
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
              title={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
              className="rounded-md border border-line bg-surface p-1.5 text-fg-secondary transition-colors hover:border-accent/50 hover:text-accent"
            >
              {theme === 'dark' ? <Sun size={14} strokeWidth={1.9} /> : <Moon size={14} strokeWidth={1.9} />}
            </button>
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cat-entity" />
              {pages.length} 页 · 同步于 {syncedText}
            </span>
          </div>
        </header>

        {/* body */}
        <div className="flex min-h-0 flex-1">
          {mode === 'graph' ? (
            <GraphView activeId={activeId} onOpen={open} />
          ) : (
            <>
              <main
                ref={mainRef}
                data-wv-scroll
                className="min-w-0 flex-1 overflow-y-auto"
                onScroll={() => {
                  if (activeId && mainRef.current) scrollMemo.current.set(activeId, mainRef.current.scrollTop)
                }}
              >
                {page ? (
                  <PageView
                    page={page}
                    onNavigate={open}
                    onOutline={onOutline}
                    hl={hl}
                    view={view}
                    onIngest={(p) =>
                      onTask({ type: 'ingest', rawFile: p.file.split('/').pop()!, title: p.title })
                    }
                  />
                ) : (
                  <Welcome
                    onOpen={open}
                    onLint={(issues) => onTask({ type: 'lint', issues })}
                  />
                )}
              </main>
              {page && !zen && rightOpen && <RightRail page={page} onNavigate={open} outline={outline} />}
            </>
          )}
        </div>
      </div>

      {/* 免打扰时的悬浮大纲入口 */}
      {zen && page && outline.length > 0 && (
        <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-2">
          {zenToc && (
            <div className="max-h-[52vh] w-64 animate-fade-up overflow-y-auto rounded-card border border-line bg-surface p-1.5 shadow-panel">
              {outline.map((o) => (
                <button
                  key={o.id}
                  onClick={() => document.getElementById(o.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="nav-item !text-[12.5px]"
                  style={{ paddingLeft: 10 + (o.level - 2) * 14 }}
                >
                  <span className="truncate">{o.text}</span>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setZenToc((v) => !v)}
            aria-label="大纲"
            title="页内大纲"
            className="rounded-full border border-line bg-surface p-2.5 text-fg-secondary shadow-panel transition-colors hover:border-accent/50 hover:text-accent"
          >
            <List size={15} />
          </button>
        </div>
      )}

      {palette && <CommandPalette onClose={() => setPalette(false)} onOpenPage={open} actions={paletteActions} />}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </div>
  )
}
