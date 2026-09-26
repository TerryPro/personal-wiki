import { useState } from 'react'
import { CircleDashed, FileText, Tag } from 'lucide-react'
import { CATEGORY_META, brokenLinks, getPage, groupedByCategory, listTags, search } from '@/lib/wiki'
import type { WikiPage } from '@/types'

interface Props {
  activeId: string | null
  query: string
  onQuery: (q: string) => void
  onOpen: (page: WikiPage) => void
}

type View = 'dir' | 'tag' | 'todo'

const VIEWS: [View, string, typeof Tag][] = [
  ['dir', '目录', FileText],
  ['tag', '标签', Tag],
  ['todo', '待创建', CircleDashed],
]

export default function Sidebar({ activeId, query, onQuery, onOpen }: Props) {
  const hits = query.trim() ? search(query) : null
  const [view, setView] = useState<View>('dir')
  const [openTag, setOpenTag] = useState<string | null>(null)
  const [openBroken, setOpenBroken] = useState<string | null>(null)

  return (
    <aside className="flex w-side shrink-0 flex-col border-r border-line bg-ink-soft">
      {/* brand */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-[13px]">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
          <circle cx="13" cy="6" r="2.6" fill="hsl(42 52% 62%)" />
          <circle cx="5.5" cy="18" r="2.2" fill="hsl(202 48% 60%)" />
          <circle cx="20.5" cy="18" r="2.2" fill="hsl(272 34% 64%)" />
          <circle cx="13" cy="13.5" r="1.7" fill="hsl(28 62% 58%)" />
          <path d="M13 6 5.5 18M13 6l7.5 12M5.5 18h15M13 13.5 13 6M13 13.5 5.5 18M13 13.5l7.5 4.5" stroke="hsl(160 10% 42%)" strokeWidth="0.9" opacity="0.65" />
        </svg>
        <div className="min-w-0 leading-tight">
          <div className="text-[14px] font-semibold tracking-tight text-fg">LLM Wiki</div>
          <div className="truncate text-[11px] text-fg-muted">second-brain 知识库</div>
        </div>
      </div>

      {/* search */}
      <div className="px-3 pb-2 pt-3">
        <div className="relative">
          <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            id="wv-search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="搜索全部页面…"
            className="w-full rounded-md border border-line bg-surface py-[7px] pl-8 pr-8 text-[13px] text-fg placeholder:text-fg-muted focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/15"
          />
          {query && (
            <button onClick={() => onQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-muted hover:text-fg" aria-label="清除搜索">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* view switch：目录 / 标签 / 待创建 */}
      {!hits && (
        <div className="px-3 pb-1">
          <div className="flex rounded-lg border border-line bg-surface p-[2px] text-[12px]">
            {VIEWS.map(([v, label, Icon]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 font-medium transition-all duration-150 ${
                  view === v ? 'bg-surface-raised text-fg shadow-panel' : 'text-fg-muted hover:text-fg-secondary'
                }`}
              >
                <Icon size={12} strokeWidth={2} />
                {v === 'todo' && brokenLinks.length > 0 ? (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-cat-concept" />
                    {brokenLinks.length}
                  </span>
                ) : (
                  label
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* nav / results */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {hits ? (
          <div className="space-y-1">
            <div className="px-1 py-1.5 text-[11px] text-fg-muted">{hits.length} 条结果</div>
            {hits.map(({ page, snippet }) => {
              const Icon = CATEGORY_META[page.category].icon
              return (
              <button key={page.id} onClick={() => onOpen(page)} className={`nav-item !items-start !py-2 ${page.id === activeId ? 'active' : ''}`}>
                <Icon size={14} strokeWidth={1.9} className="mt-[3px] shrink-0" style={{ color: CATEGORY_META[page.category].dot }} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-fg">{page.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-fg-muted">{snippet}</span>
                </span>
              </button>
              )
            })}
            {hits.length === 0 && <div className="px-1 py-6 text-center text-[12px] text-fg-muted">没有匹配的页面</div>}
          </div>
        ) : view === 'tag' ? (
          <div className="mt-2 space-y-[1px]">
            {listTags().map(({ tag, pages: tagged }) => {
              const expanded = openTag === tag
              return (
                <div key={tag}>
                  <button
                    onClick={() => setOpenTag(expanded ? null : tag)}
                    className={`nav-item ${expanded ? 'active' : ''}`}
                    title={`${tagged.length} 个页面`}
                  >
                    <Tag size={13} strokeWidth={1.9} className={expanded ? 'shrink-0 text-accent' : 'shrink-0 text-fg-muted/70'} />
                    <span className="truncate">{tag}</span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-fg-muted/70">{tagged.length}</span>
                  </button>
                  {expanded && (
                    <div className="mb-1 ml-4 space-y-[1px] border-l border-line pl-1.5">
                      {tagged.map((p) => {
                        const Icon = CATEGORY_META[p.category].icon
                        const isActive = p.id === activeId
                        return (
                          <button key={p.id} onClick={() => onOpen(p)} title={p.title} className={`nav-item ${isActive ? 'active' : ''}`}>
                            <Icon size={12} strokeWidth={1.9} className={isActive ? 'shrink-0 text-accent' : 'shrink-0 text-fg-muted/60'} />
                            <span className="truncate">{p.title}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            {listTags().length === 0 && <div className="px-1 py-6 text-center text-[12px] text-fg-muted">暂无带标签的页面</div>}
          </div>
        ) : view === 'todo' ? (
          <div className="mt-2 space-y-[1px]">
            <div className="px-1 pb-1.5 text-[11px] leading-5 text-fg-muted">
              被 <span className="font-mono text-fg-secondary">[[双链]]</span> 引用但尚未创建的页面 — 知识库的待办清单
            </div>
            {brokenLinks.map(({ target, from }) => {
              const expanded = openBroken === target
              return (
                <div key={target}>
                  <button
                    onClick={() => setOpenBroken(expanded ? null : target)}
                    className={`nav-item ${expanded ? 'active' : ''}`}
                    title={`${from.length} 处引用`}
                  >
                    <CircleDashed size={13} strokeWidth={1.9} className={expanded ? 'shrink-0 text-cat-concept' : 'shrink-0 text-fg-muted/60'} />
                    <span className="truncate !text-fg-secondary">{target}</span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-fg-muted/70">{from.length}</span>
                  </button>
                  {expanded && (
                    <div className="mb-1 ml-4 space-y-[1px] border-l border-dashed border-line pl-1.5">
                      {from.map((f) => {
                        const p = getPage(f.id)
                        if (!p) return null
                        return (
                          <button key={f.id} onClick={() => onOpen(p)} title={p.title} className={`nav-item ${f.id === activeId ? 'active' : ''}`}>
                            <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: CATEGORY_META[p.category].dot }} />
                            <span className="truncate">{f.title}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            {brokenLinks.length === 0 && <div className="px-1 py-6 text-center text-[12px] text-fg-muted">没有断链 — 所有引用都能跳转到真实页面 ✓</div>}
          </div>
        ) : (
          groupedByCategory().map((g) => {
            const GroupIcon = CATEGORY_META[g.category].icon
            return (
            <section key={g.category} className="mt-4 first:mt-2">
              <div className="flex items-center gap-1.5 px-1 pb-1.5">
                <GroupIcon size={12} strokeWidth={2.1} style={{ color: CATEGORY_META[g.category].dot }} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{g.label}</span>
                <span className="text-[11px] text-fg-muted/70">{g.items.length}</span>
              </div>
              <div className="space-y-[1px]">
                {g.items.map((p) => {
                  const Icon = CATEGORY_META[p.category].icon
                  const isActive = p.id === activeId
                  return (
                  <button key={p.id} onClick={() => onOpen(p)} title={p.title} className={`nav-item ${isActive ? 'active' : ''}`}>
                    <Icon size={13} strokeWidth={1.9} className={isActive ? 'shrink-0 text-accent' : 'shrink-0 text-fg-muted/70'} />
                    <span className="truncate">{p.title}</span>
                  </button>
                  )
                })}
              </div>
            </section>
            )
          })
        )}
      </nav>
    </aside>
  )
}
