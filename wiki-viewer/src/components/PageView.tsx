import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Code2, Columns2, Eye, FileArchive, Sparkles } from 'lucide-react'
import { marked } from 'marked'
import { highlightBlocks } from '@/lib/highlight'
import { pageToMarkdown } from '@/lib/library'
import { applyOutlineIds, data, getBacklinks, getPage, loadVault, outlineFromHtml, resolveTitle, CATEGORY_META } from '@/lib/wiki'
import { markRawIngested } from '@/lib/agent'
import NumberedSource from '@/components/NumberedSource'
import { hidePreview, showPreview } from '@/lib/preview'
import type { OutlineItem, WikiPage } from '@/types'

export type View = 'read' | 'source' | 'split'
/** 三态循环：按钮图标/提示 = 下一步将进入的视图 */
export const NEXT_VIEW: Record<View, [View, string, typeof Eye]> = {
  read: ['source', '查看原始 Markdown（含 frontmatter）', Code2],
  source: ['split', '阅读 + 源码分栏对照', Columns2],
  split: ['read', '返回纯阅读视图', Eye],
}

interface Props {
  page: WikiPage
  onNavigate: (page: WikiPage) => void
  onOutline: (items: OutlineItem[]) => void
  hl: string
  view: View // 视图状态由 App 工具栏控制，便于跨页保持
  /** raw 页未消化时的「启动摄取」入口（打开 AgentPanel 跑 pi ingest） */
  onIngest?: (page: WikiPage) => void
}

const WIKI_RE = /\[\[([^\]]+)\]\]/g

/* ————— Callout（> [!type] 标题）渲染：与 Obsidian 语法对齐 ————— */
const CALLOUT_ICON: Record<string, string> = {
  note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  tip: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2Z"/>',
  warning: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  danger: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
  todo: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  example: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  quote: '<path d="M10 11H6a1 1 0 0 1-1-1V7a2 2 0 0 1 2-2h1a1 1 0 0 1 1 1v6a4 4 0 0 1-4 4"/><path d="M20 11h-4a1 1 0 0 1-1-1V7a2 2 0 0 1 2-2h1a1 1 0 0 1 1 1v6a4 4 0 0 1-4 4"/>',
}
const CALLOUT_LABEL: Record<string, string> = {
  note: '备注', info: '信息', tip: '提示', warning: '注意', danger: '警告', todo: '待办', example: '例证', quote: '引用',
}

marked.use({
  renderer: {
    blockquote({ text }: { text: string }) {
      const m = text.match(/^<p>\[!(\w+)][ \t]?([\s\S]*?)<\/p>\s*/)
      if (!m) return `<blockquote>${text}</blockquote>`
      const type = m[1].toLowerCase()
      const key = type in CALLOUT_ICON ? type : 'note'
      const title = m[2].replace(/<[^>]+>/g, '').trim() || CALLOUT_LABEL[key]
      const rest = text.slice(m[0].length)
      return (
        `<div class="callout" data-callout="${key}">` +
        `<div class="callout-title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CALLOUT_ICON[key]}</svg><span>${title}</span></div>` +
        (rest ? `<div class="callout-body">${rest}</div>` : '') +
        `</div>`
      )
    },
    link({ href, title, text }: { href: string; title?: string | null; text: string }) {
      const t = title ? ` title="${title}"` : ''
      // 站外链接新标签打开，避免离开阅读现场
      if (/^(https?:|mailto:)/i.test(href)) return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`
      return `<a href="${href}"${t}>${text}</a>`
    },
    image({ href, title, text }: { href: string; title?: string | null; text: string }) {
      const t = title ? ` title="${title}"` : ''
      return `<img src="${href}" alt="${text}"${t} class="wiki-img" loading="lazy">`
    },
  },
})

/** 全文大小写不敏感高亮命中词；返回命中数。跳过代码/链接/已高亮区域 */
function highlightQuery(root: HTMLElement, q: string): number {
  const needle = q.trim().toLowerCase()
  if (!needle) return 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = n.parentElement
      if (!p || p.closest('code,pre,a,mark')) return NodeFilter.FILTER_REJECT
      return (n.nodeValue || '').toLowerCase().includes(needle) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    },
  })
  const texts: Text[] = []
  let cur
  while ((cur = walker.nextNode())) texts.push(cur as Text)
  let count = 0
  for (const text of texts) {
    const value = text.nodeValue || ''
    const lower = value.toLowerCase()
    const frag = document.createDocumentFragment()
    let last = 0
    let idx
    while ((idx = lower.indexOf(needle, last)) >= 0) {
      frag.append(document.createTextNode(value.slice(last, idx)))
      const mark = document.createElement('mark')
      mark.className = 'search-hit'
      mark.textContent = value.slice(idx, idx + needle.length)
      frag.append(mark)
      last = idx + needle.length
      count++
    }
    frag.append(document.createTextNode(value.slice(last)))
    text.replaceWith(frag)
  }
  return count
}

/** Obsidian 风格 ![[图片]] 嵌入 → 标准 md 图片（指向 sync 同步过来的 /assets/<vaultId>/） */
function rewriteEmbeds(body: string, vaultId: string): string {
  return body.replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, name: string, alias?: string) => {
    const file = name.trim().split('/').pop()!
    return `![${(alias || file).trim()}](/assets/${encodeURIComponent(vaultId)}/${encodeURIComponent(file)})`
  })
}

/** 源码视图的忠实 Markdown 已提取到 lib/library.ts（pageToMarkdown），与导出下载共用单一实现 */

/** 在渲染出的 DOM 里把文本节点中的 [[链接]] 替换为可点击元素；跳过 code/pre/a（AgentPanel 回答渲染也复用） */
export function hydrateWikiLinks(root: HTMLElement, onHit: (target: string) => void) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const parent = n.parentElement
      if (!parent || parent.closest('code,pre,a')) return NodeFilter.FILTER_REJECT
      return WIKI_RE.test(n.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    },
  })
  const texts: Text[] = []
  let cur
  while ((cur = walker.nextNode())) texts.push(cur as Text)
  for (const text of texts) {
    const frag = document.createDocumentFragment()
    let last = 0
    const value = text.nodeValue || ''
    WIKI_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = WIKI_RE.exec(value))) {
      frag.append(document.createTextNode(value.slice(last, m.index)))
      // 表格等场景里管道会被转义成 \|，反斜杠可能残留：整体取出后再按首个未转义管道拆分
      const [rawTarget, ...rest] = m[1].split(/\|(?![\]])/)
      const target = rawTarget.trim().replace(/\\+$/, '')
      const label = (rest.join('|').trim() || m[1].replace(/\\+$/, '').trim())
      const span = document.createElement('span')
      const found = resolveTitle(target)
      span.className = found ? 'wikilink' : 'wikilink-broken'
      span.textContent = label
      span.title = found ? `跳转到：${target}` : `[[${target}]] — 页面尚不存在`
      span.addEventListener('mouseenter', (e) => {
        const ev = e as MouseEvent
        showPreview(found ? { page: found } : { broken: target }, ev.clientX, ev.clientY)
      })
      span.addEventListener('mouseleave', hidePreview)
      if (found) span.addEventListener('click', () => { hidePreview(); onHit(target) })
      frag.append(span)
      last = m.index + m[0].length
    }
    frag.append(document.createTextNode(value.slice(last)))
    text.replaceWith(frag)
  }
}

export default function PageView({ page, onNavigate, onOutline, hl, view, onIngest }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const marksRef = useRef<HTMLElement[]>([])
  const [hits, setHits] = useState(0)
  const [curHit, setCurHit] = useState(0)
  const outlineCb = useRef(onOutline)
  outlineCb.current = onOutline

  // 人工消化标记/撤销（仅 raw 页横幅）：server 响应前已重跑 sync，重拉快照即可（保留阅读位置）
  const [markBusy, setMarkBusy] = useState(false)
  const toggleMark = async (value: boolean) => {
    if (markBusy) return
    setMarkBusy(true)
    try {
      await markRawIngested(page.id, value)
      await loadVault(data.vaultId)
      setMarkBusy(false)
    } catch {
      setMarkBusy(false)
    }
  }

  const { html, outline } = useMemo(() => {
    const body = rewriteEmbeds(page.content.replace(/^# .+$/m, ''), data.vaultId) // 标题单独渲染，避免双标题
    const h = marked.parse(body, { async: false, gfm: true }) as string
    return { html: h, outline: outlineFromHtml(h) }
  }, [page])

  // 顺链漫游推荐：出链目标优先，反链页补齐，最多 3 个
  const related = useMemo(() => {
    const out = new Map<string, WikiPage>()
    for (const l of page.links) {
      const t = resolveTitle(l)
      if (t && t.id !== page.id && t.category !== 'meta') out.set(t.id, t)
    }
    for (const b of getBacklinks(page)) if (b.category !== 'meta' && !out.has(b.id)) out.set(b.id, b)
    return [...out.values()].slice(0, 3)
  }, [page])

  // 正文 DOM 每次（重）建都要重新水合：双链、大纲 id、语法/搜索高亮。
  // 注意 deps 必须含 view：阅读⇄源码⇄分栏切换会重建 DOM，
  // 若只挂在 [outline] 上，切回阅读后标题丢失 id → 点大纲无法滚动定位
  useEffect(() => {
    outlineCb.current(outline) // 源码视图下右栏仍展示大纲
    if (!ref.current) {
      setHits(0)
      return
    }
    hydrateWikiLinks(ref.current, (target) => {
      const hit = resolveTitle(target)
      if (hit) onNavigate(hit)
    })
    applyOutlineIds(ref.current, outline)
    // 搜索词页内高亮；命中时定位到第一处（rAF 等 App 的滚动策略先落定）
    highlightBlocks(ref.current)
    const n = highlightQuery(ref.current, hl)
    marksRef.current = Array.from(ref.current.querySelectorAll('mark.search-hit'))
    setHits(n)
    setCurHit(0)
    if (n > 0) {
      requestAnimationFrame(() => {
        marksRef.current[0]?.scrollIntoView({ block: 'center' })
        marksRef.current[0]?.classList.add('current')
      })
    }
  }, [html, hl, onNavigate, view, outline])

  const gotoHit = (i: number) => {
    if (!marksRef.current.length) return
    const next = ((i % hits) + hits) % hits
    marksRef.current[curHit]?.classList.remove('current')
    marksRef.current[next]?.scrollIntoView({ block: 'center' })
    marksRef.current[next]?.classList.add('current')
    setCurHit(next)
  }

  return (
    <article
      key={page.id}
      className="mx-auto w-full animate-fade-up"
      style={{
        fontSize: 'var(--read-fs)',
        maxWidth: 'var(--read-pct)', // 相对正文区宽度的百分比，免打扰时自动跟随展开
        padding: 'var(--read-pad-y) var(--read-pad-x)',
      }}
    >
      <header className="mb-6">
        <div className="mb-2.5 flex items-center gap-2 text-[12px] text-fg-muted">
          <span>
            {page.categoryLabel}
            <span className="mx-1.5 opacity-50">/</span>
            <span className="font-mono">{page.file.split('/').pop()}</span>
          </span>
          {hits > 0 && (
            <span className="ml-auto flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-[3px] text-[11.5px] text-accent">
              {curHit + 1}/{hits} 处命中
              <button onClick={() => gotoHit(curHit + 1)} title="跳到下一处（循环）" className="rounded p-0.5 hover:bg-accent/20">
                <ArrowDown size={12} />
              </button>
            </span>
          )}
        </div>
        <h1 className="page-title text-[1.8em] font-semibold leading-[1.28] tracking-tight text-fg">{page.title}</h1>
      </header>
      {page.category === 'raw' && (
        <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-cat-raw/40 bg-cat-raw/10 px-4 py-2.5 text-[12.5px] text-fg-secondary">
          <FileArchive size={14} strokeWidth={1.9} className="shrink-0" style={{ color: CATEGORY_META.raw.dot }} />
          <span className="font-medium">原始资料 · agent 只读</span>
          {page.size != null && <span className="text-fg-muted">{(page.size / 1024).toFixed(1)} KB</span>}
          {(page.digestedBy?.length ?? 0) > 0 ? (
            <span className="flex flex-wrap items-center gap-x-1.5">
              <span className="text-fg-muted">已消化为：</span>
              {page.digestedBy!.map((id) => {
                const sp = getPage(id)
                if (!sp) return null
                return (
                  <button
                    key={id}
                    onClick={() => onNavigate(sp)}
                    onMouseEnter={(e) => showPreview({ page: sp }, e.clientX, e.clientY)}
                    onMouseLeave={hidePreview}
                    className="wikilink"
                    title={`跳转到：${sp.title}`}
                  >
                    {sp.title}
                  </button>
                )
              })}
            </span>
          ) : page.ingested ? (
            <span className="flex items-center gap-2 text-fg-muted">
              已人工标记为消化
              <button
                onClick={() => toggleMark(false)}
                disabled={markBusy}
                className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-[11.5px] text-fg-secondary transition-colors hover:border-cat-concept/50 hover:text-cat-concept disabled:opacity-40"
                title="撤销人工标记（置回 ingested: false），文件将回到待消化队列"
              >
                撤销标记
              </button>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-cat-concept">
              尚未消化
              {onIngest && (
                <button
                  onClick={() => onIngest(page)}
                  className="flex items-center gap-1 rounded-md border border-accent/50 bg-accent/10 px-2 py-0.5 text-[11.5px] font-medium text-accent transition-colors hover:bg-accent/20"
                  title="启动 pi 智能体摄取：生成来源摘要页与派生实体/概念（改动经 diff 审核后才会落盘）"
                >
                  <Sparkles size={11} />
                  启动摄取
                </button>
              )}
              <button
                onClick={() => toggleMark(true)}
                disabled={markBusy}
                className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-[11.5px] text-fg-muted transition-colors hover:border-cat-entity/50 hover:text-cat-entity disabled:opacity-40"
                title="人工标记已消化（置 ingested: true）——适用于 sources 元数据写错或无需摄取的文件"
              >
                标记已消化
              </button>
            </span>
          )}
        </div>
      )}
      {view === 'source' ? (
        <NumberedSource
          text={pageToMarkdown(page)}
          className="scroll-mt-4 rounded-card border border-line bg-ink-soft p-5 font-mono text-[12.5px] leading-6 text-fg-secondary"
        />
      ) : view === 'split' ? (
        /* 分栏对照：共用一个圆角边框容器，左右无缝相邻（border-l 分隔）；无各自滚动条，随中央列整体上下滚动 */
        <div className="grid overflow-hidden rounded-card border border-line xl:grid-cols-2">
          <div ref={ref} className="prose-wiki bg-surface/40 px-5 py-4" dangerouslySetInnerHTML={{ __html: html }} />
          <NumberedSource
            text={pageToMarkdown(page)}
            className="border-t border-line bg-ink-soft p-5 font-mono text-[12px] leading-6 text-fg-secondary xl:border-l xl:border-t-0"
          />
        </div>
      ) : (
        <>
          <div ref={ref} className="prose-wiki" dangerouslySetInnerHTML={{ __html: html }} />
          {related.length > 0 && (
            <nav className="mt-12 border-t border-line pt-6">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">继续阅读</div>
              <div className="grid gap-3 sm:grid-cols-3">
                {related.map((r) => {
                  const Icon = CATEGORY_META[r.category].icon
                  return (
                    <button key={r.id} onClick={() => onNavigate(r)} className="group rounded-card border border-line bg-surface p-3.5 text-left transition-colors hover:border-accent/50">
                      <span className="flex items-center gap-1.5 text-[10.5px] text-fg-muted">
                        <Icon size={11} strokeWidth={2} style={{ color: CATEGORY_META[r.category].dot }} />
                        {r.categoryLabel}
                      </span>
                      <span className="mt-1.5 block text-[13px] font-medium leading-snug text-fg group-hover:text-accent">{r.title}</span>
                      <span className="mt-1.5 line-clamp-2 block text-[11.5px] leading-5 text-fg-muted">{r.excerpt}</span>
                    </button>
                  )
                })}
              </div>
            </nav>
          )}
        </>
      )}
    </article>
  )
}
