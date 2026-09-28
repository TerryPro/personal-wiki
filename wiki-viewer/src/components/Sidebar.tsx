import { useEffect, useState, useSyncExternalStore } from 'react'
import { ChevronDown, CircleDashed, FileText, History, Star, Tag, X } from 'lucide-react'
import Brand from '@/components/Brand'
import { CATEGORY_META, brokenLinks, getPage, groupedByCategory, listTags, search } from '@/lib/wiki'
import { clearRecent, getLibraryVersion, listRecent, listStarred, subscribeLibrary, toggleStar } from '@/lib/library'
import type { Category, WikiPage } from '@/types'

interface Props {
  activeId: string | null
  vaultId: string
  query: string
  onQuery: (q: string) => void
  onOpen: (page: WikiPage) => void
  /** 点击品牌区回首页 */
  onHome?: () => void
}

type View = 'dir' | 'tag' | 'todo' | 'star'

const VIEWS: [View, string, typeof Tag][] = [
  ['dir', '目录', FileText],
  ['tag', '标签', Tag],
  ['todo', '待创建', CircleDashed],
  ['star', '精选', Star],
]

export default function Sidebar({ activeId, vaultId, query, onQuery, onOpen, onHome }: Props) {
  // 订阅库状态：书签/最近变化即重渲染
  useSyncExternalStore(subscribeLibrary, getLibraryVersion)
  const hits = query.trim() ? search(query) : null
  const [view, setView] = useState<View>('dir')
  const [openTag, setOpenTag] = useState<string | null>(null)
  const [openBroken, setOpenBroken] = useState<string | null>(null)
  // 目录视图分类组的收拢状态（持久化）
  const [collapsed, setCollapsed] = useState<Set<Category>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('wv-side-cats') ?? '[]') as Category[])
    } catch {
      return new Set()
    }
  })
  useEffect(() => localStorage.setItem('wv-side-cats', JSON.stringify([...collapsed])), [collapsed])
  const toggleCat = (c: Category) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })

  // 书签/最近（按当前 vault 隔离，过滤已不存在的页面）
  const starredSet = new Set(listStarred(vaultId))
  const starredPages = listStarred(vaultId).map(getPage).filter(Boolean) as WikiPage[]
  const recentPages = listRecent(vaultId).filter((id) => id !== activeId).map(getPage).filter(Boolean) as WikiPage[]
  const onRemoveStar = (id: string) => toggleStar(vaultId, id)
  const onClearRecent = () => clearRecent(vaultId)

  return (
    <aside className="flex w-side shrink-0 flex-col border-r border-line bg-ink-soft">
      {/* brand（点击回首页） */}
      <Brand onClick={onHome} />

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
            placeholder='搜索… 支持 tag: cat: "精确" -排除'
            title='操作符：tag:标签名 · cat:source/来源 · "精确短语" · -排除词；多个普通词为 AND 全命中'
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
                  view === v ? 'bg-surface-raised text-fg' : 'text-fg-muted hover:text-fg-secondary'
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
            {hits.length === 0 && (
              <div className="px-1 py-6 text-center text-[12px] leading-6 text-fg-muted">
                没有匹配的页面
                <br />
                <span className="font-mono text-[11px] opacity-80">tag: cat: "精确" -排除</span>
              </div>
            )}
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
        ) : view === 'star' ? (
          <div className="mt-2 space-y-5">
            <section>
              <div className="flex items-center gap-1.5 px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                <Star size={11} className="text-accent" />
                书签
                <span className="ml-auto font-mono text-[11px] opacity-70">{starredPages.length}</span>
              </div>
              <div className="space-y-[1px]">
                {starredPages.map((p) => {
                  const Icon = CATEGORY_META[p.category].icon
                  const isActive = p.id === activeId
                  return (
                    <div key={p.id} className={`group flex items-center ${isActive ? 'rounded-md bg-accent/10' : ''}`}>
                      <button onClick={() => onOpen(p)} title={p.title} className={`nav-item flex-1 ${isActive ? 'active' : ''}`}>
                        <Icon size={13} strokeWidth={1.9} className={isActive ? 'shrink-0 text-accent' : 'shrink-0 text-fg-muted/70'} />
                        <span className="truncate">{p.title}</span>
                      </button>
                      <button
                        onClick={() => onRemoveStar(p.id)}
                        aria-label="移除书签"
                        title="移除书签"
                        className="mr-1 shrink-0 rounded p-1 text-fg-muted opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
                      >
                        <X size={11} strokeWidth={2.2} />
                      </button>
                    </div>
                  )
                })}
                {starredPages.length === 0 && (
                  <div className="px-1 py-4 text-center text-[12px] leading-5 text-fg-muted">
                    还没有书签 — 打开任意页面后点工具栏 <Star size={11} className="inline" /> 收藏
                  </div>
                )}
              </div>
            </section>
            <section>
              <div className="flex items-center gap-1.5 px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                <History size={11} className="text-fg-muted/70" />
                最近打开
                {recentPages.length > 0 && (
                  <button
                    onClick={() => onClearRecent()}
                    className="ml-auto text-[10.5px] font-normal normal-case tracking-normal text-fg-muted/70 transition-colors hover:text-fg"
                    title="清空当前库的最近记录"
                  >
                    清空
                  </button>
                )}
              </div>
              <div className="space-y-[1px]">
                {recentPages.map((p) => {
                  const Icon = CATEGORY_META[p.category].icon
                  return (
                    <button key={p.id} onClick={() => onOpen(p)} title={p.title} className="nav-item">
                      <Icon size={13} strokeWidth={1.9} className="shrink-0 text-fg-muted/60" />
                      <span className="truncate">{p.title}</span>
                      {starredSet.has(p.id) && <Star size={10} className="ml-auto shrink-0 text-accent/70" />}
                    </button>
                  )
                })}
                {recentPages.length === 0 && <div className="px-1 py-4 text-center text-[12px] text-fg-muted">暂无访问记录</div>}
              </div>
            </section>
          </div>
        ) : (
          groupedByCategory().map((g) => {
            const GroupIcon = CATEGORY_META[g.category].icon
            const isCollapsed = collapsed.has(g.category)
            return (
            <section key={g.category} className="mt-4 first:mt-2">
              <button
                onClick={() => toggleCat(g.category)}
                title={isCollapsed ? `展开「${g.label}」` : `收拢「${g.label}」`}
                className="flex w-full items-center gap-1.5 px-1 pb-1.5 text-left"
              >
                <ChevronDown size={11} strokeWidth={2.2} className={`shrink-0 text-fg-muted transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                <GroupIcon size={12} strokeWidth={2.1} style={{ color: CATEGORY_META[g.category].dot }} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{g.label}</span>
                <span className="ml-auto text-[11px] text-fg-muted/70">{g.items.length}</span>
              </button>
              {!isCollapsed && (
              <div className="space-y-[1px]">
                {g.items.map((p) => {
                  const Icon = CATEGORY_META[p.category].icon
                  const isActive = p.id === activeId
                  const digested = p.category === 'raw' && ((p.digestedBy?.length ?? 0) > 0 || p.ingested === true)
                  return (
                  <button key={p.id} onClick={() => onOpen(p)} title={p.title} className={`nav-item ${isActive ? 'active' : ''}`}>
                    <Icon size={13} strokeWidth={1.9} className={isActive ? 'shrink-0 text-accent' : 'shrink-0 text-fg-muted/70'} />
                    <span className="truncate">{p.title}</span>
                    {starredSet.has(p.id) && <Star size={10} className="ml-auto shrink-0 text-accent/70" />}
                    {p.category === 'raw' && (
                      <span
                        className={`ml-auto shrink-0 text-[11px] ${digested ? 'text-cat-entity' : 'text-cat-concept'}`}
                        title={digested ? '已消化：已生成来源摘要页' : '待消化：尚未生成来源摘要页'}
                      >
                        {digested ? '✓' : '○'}
                      </span>
                    )}
                  </button>
                  )
                })}
              </div>
              )}
            </section>
            )
          })
        )}
      </nav>
    </aside>
  )
}
