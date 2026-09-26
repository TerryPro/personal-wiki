import { useEffect, useState, type ReactNode } from 'react'
import { CATEGORY_META, citedSourcePages, getBacklinks, resolveTitle, sourcePagesForRaw } from '@/lib/wiki'
import { hidePreview, showPreview } from '@/lib/preview'
import LocalGraph from '@/components/LocalGraph'
import type { OutlineItem, WikiPage } from '@/types'

interface Props {
  page: WikiPage
  onNavigate: (page: WikiPage) => void
  outline: OutlineItem[]
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-4 first:border-t-0">
      <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
        {title}
        {count !== undefined && <span className="font-mono font-normal normal-case opacity-70">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

export default function RightRail({ page, onNavigate, outline }: Props) {
  const backlinks = getBacklinks(page)
  const meta = CATEGORY_META[page.category]
  const [activeSec, setActiveSec] = useState<string | null>(null)

  // 滚动联动：取滚过正文顶部（含 60px 触发线）的最后一个标题作为当前小节；
  // 用 document 捕获阶段监听，兼容整页滚动与分栏模式的列内独立滚动
  const outlineKey = outline.map((o) => o.id).join('\u0000')
  useEffect(() => {
    setActiveSec(null)
    if (outline.length === 0) return
    const update = () => {
      let cur: string | null = null
      for (const o of outline) {
        const el = document.getElementById(o.id)
        if (el && el.getBoundingClientRect().top <= 60) cur = o.id
      }
      setActiveSec(cur)
    }
    document.addEventListener('scroll', update, true)
    update()
    return () => document.removeEventListener('scroll', update, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id, outlineKey, outline.length])

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    // 优先目标标题所在的最近滚动容器（分栏左列），否则整页 main
    const scroller =
      el.closest<HTMLElement>('[data-wv-scroll]') ?? document.querySelector<HTMLElement>('[data-wv-scroll]')
    if (!scroller) return
    const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 14
    scroller.scrollTo({ top, behavior: 'smooth' })
    setActiveSec(id)
  }

  return (
    <aside className="hidden w-rail shrink-0 overflow-y-auto border-l border-line bg-ink-soft xl:block">
      {outline.length > 0 && (
        <Section title="大纲" count={outline.length}>
          <ul className="space-y-[1px]">
            {outline.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => scrollToSection(o.id)}
                  title={o.text}
                  className={`nav-item !text-[12.5px] ${activeSec === o.id ? 'active !text-accent' : ''}`}
                  style={{ paddingLeft: 10 + (o.level - 2) * 14 }}
                >
                  <span className="truncate">{o.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="元信息">
        <dl className="space-y-1.5 text-[12px]">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-fg-muted">分类</dt>
            <dd><span className={`cat-badge ${meta.badge}`}>{page.categoryLabel}</span></dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-fg-muted">创建</dt>
            <dd className="font-mono text-fg-secondary">{page.created || '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-fg-muted">更新</dt>
            <dd className="font-mono text-fg-secondary">{page.updated || '—'}</dd>
          </div>
        </dl>
        {page.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {page.tags.map((t) => (
              <span key={t} className="rounded-full border border-line bg-surface px-2 py-[1px] font-mono text-[11px] text-fg-secondary">
                #{t}
              </span>
            ))}
          </div>
        )}
      </Section>

      {(page.sources.length > 0 || citedSourcePages(page).length > 0) && (
        <Section title="来源追溯" count={page.sources.length}>
          {page.category !== 'source' && citedSourcePages(page).length > 0 && (
            <ul className="mb-2 space-y-[2px]">
              {citedSourcePages(page).map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => { hidePreview(); onNavigate(s) }}
                    onMouseEnter={(e) => showPreview({ page: s }, e.clientX, e.clientY)}
                    onMouseLeave={hidePreview}
                    className="nav-item"
                    title={`来源摘要页：${s.title}`}
                  >
                    <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: CATEGORY_META.source.dot }} />
                    <span className="truncate">{s.title}</span>
                    <span className="ml-auto shrink-0 text-[10.5px] text-fg-muted">摘要页</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ul className="space-y-1.5">
            {page.sources.map((s) => {
              const consumers = sourcePagesForRaw(s)
              return (
                <li key={s} className="text-[11.5px]">
                  <div className="flex items-baseline gap-1.5" title={consumers.length ? `已由 ${consumers.length} 个摘要页消化` : '尚无摘要页消化这份原始来源'}>
                    <span className="shrink-0 opacity-60">raw/</span>
                    <span className="truncate font-mono text-fg-secondary">{s}</span>
                    <span className={`ml-auto shrink-0 text-[10px] ${consumers.length ? 'text-cat-entity' : 'text-cat-concept'}`}>
                      {consumers.length ? '✓ 已消化' : '未消化'}
                    </span>
                  </div>
                  {consumers.length > 0 && (
                    <div className="ml-[26px] flex flex-wrap gap-1 pt-0.5">
                      {consumers.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => onNavigate(c)}
                          className="max-w-full truncate rounded border border-line bg-surface px-1.5 text-[10.5px] text-fg-muted transition-colors hover:border-accent/50 hover:text-accent"
                        >
                          {c.title}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      <Section title="反向链接" count={backlinks.length}>
        {backlinks.length === 0 ? (
          <p className="text-[12px] text-fg-muted">尚无入链 — 等待下一次摄取连接它</p>
        ) : (
          <ul className="space-y-[2px]">
            {backlinks.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => { hidePreview(); onNavigate(b) }}
                  onMouseEnter={(e) => showPreview({ page: b }, e.clientX, e.clientY)}
                  onMouseLeave={hidePreview}
                  className="nav-item"
                >
                  <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: CATEGORY_META[b.category].dot }} />
                  <span className="truncate">{b.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {page.links.length > 0 && (
        <Section title="出链" count={page.links.length}>
          <ul className="space-y-[2px]">
            {page.links.map((l) => {
              const target = resolveTitle(l)
              return target ? (
                <li key={l}>
                  <button
                    onClick={() => { hidePreview(); onNavigate(target) }}
                    onMouseEnter={(e) => showPreview({ page: target }, e.clientX, e.clientY)}
                    onMouseLeave={hidePreview}
                    className="nav-item"
                  >
                    <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: CATEGORY_META[target.category].dot }} />
                    <span className="truncate">{l}</span>
                  </button>
                </li>
              ) : (
                <li key={l}>
                  <div
                    className="flex items-center gap-2 px-2.5 py-[5px] text-[13px] text-fg-muted"
                    onMouseEnter={(e) => showPreview({ broken: l }, e.clientX, e.clientY)}
                    onMouseLeave={hidePreview}
                  >
                    <span className="h-[6px] w-[6px] shrink-0 rounded-full border border-dashed border-fg-muted/60" />
                    <span className="truncate">{l}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      {page.category !== 'meta' && (
        <Section title="本地图谱">
          <LocalGraph page={page} onOpen={onNavigate} />
          <p className="mt-1.5 text-[11px] leading-4 text-fg-muted">两阶邻居 · 悬停看关联 · 点击打开</p>
        </Section>
      )}
    </aside>
  )
}
