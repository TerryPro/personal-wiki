import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CornerDownLeft, Search, TrendingUp } from 'lucide-react'
import { CATEGORY_META, brokenLinks, pages, type PaletteAction } from '@/lib/wiki'
import type { WikiPage } from '@/types'

interface Props {
  onClose: () => void
  onOpenPage: (page: WikiPage) => void
  actions: PaletteAction[]
}

/** 子序列 + 子串混合评分：越靠前、连续命中分越高；全词相等最高 */
function score(hay: string, needle: string): number {
  const h = hay.toLowerCase()
  if (h === needle) return 1000
  const direct = h.indexOf(needle)
  let best = direct >= 0 ? 300 - Math.min(direct, 100) : 0
  // 子序列匹配（允许跳字，如 "lkw" 匹配 "llm wiki 模式"）
  let hi = 0, gaps = 0
  for (const ch of needle) {
    hi = h.indexOf(ch, hi)
    if (hi < 0) return best
    if (hi !== 0 && best === 0) gaps++
    hi++
  }
  return Math.max(best, 100 - gaps)
}

interface Item {
  key: string
  score: number
  row: ReactNode
  run: () => void
}

export default function CommandPalette({ onClose, onOpenPage, actions }: Props) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase()
    const out: Item[] = []

    for (const a of actions) {
      const s = !needle ? 500 : score(a.label, needle)
      if (s > 0)
        out.push({
          key: `a:${a.id}`,
          score: s + 60, // 动作略加权，常用操作浮在前面
          run: a.run,
          row: (
            <span className="flex items-center gap-2">
              <TrendingUp size={14} className="shrink-0 text-accent" />
              <span className="truncate">{a.label}</span>
              <span className="ml-auto shrink-0 text-[11px] text-fg-muted">命令</span>
            </span>
          ),
        })
    }

    for (const p of pages) {
      const aliasHit = p.aliases.some((a) => a.toLowerCase() === needle && needle)
      const s = !needle ? 400 : Math.max(score(p.title, needle), score(p.file.split('/').pop()!, needle), ...p.aliases.map((a) => score(a, needle)), ...p.tags.map((t) => score(t, needle) - 40))
      if (needle && s <= 0) continue
      const Icon = CATEGORY_META[p.category].icon
      out.push({
        key: p.id,
        score: s + (aliasHit ? 200 : 0) + (p.category === 'meta' ? -300 : 0),
        run: () => onOpenPage(p),
        row: (
          <span className="flex items-center gap-2">
            <Icon size={14} strokeWidth={1.9} className="shrink-0" style={{ color: CATEGORY_META[p.category].dot }} />
            <span className="truncate">{p.title}</span>
            <span className="ml-auto shrink-0 font-mono text-[11px] text-fg-muted/60">{p.slug}</span>
          </span>
        ),
      })
    }

    for (const b of brokenLinks) {
      const s = needle ? score(b.target, needle) : 0
      if (s <= 0) continue
      out.push({
        key: `b:${b.target}`,
        score: s,
        run: onClose, // 待创建页无法打开：仅关闭面板
        row: (
          <span className="flex items-center gap-2">
            <Search size={14} className="shrink-0 text-fg-muted/60" />
            <span className="truncate !text-fg-secondary">{b.target}</span>
            <span className="ml-auto shrink-0 text-[11px] text-cat-concept">待创建 · {b.from.length} 处引用</span>
          </span>
        ),
      })
    }

    return out.sort((a, b) => b.score - a.score).slice(0, 12)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, actions])

  useEffect(() => setSel(0), [q])
  useEffect(() => {
    listRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [items])

  const pick = (i: number) => {
    const it = items[i]
    if (it) {
      it.run()
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/60 pt-[14vh] backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[34rem] animate-fade-up overflow-hidden rounded-card border border-line bg-surface shadow-panel">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={15} className="shrink-0 text-fg-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="跳转页面或执行命令…（标题 / 文件名 / 别名 / 标签）"
            className="w-full bg-transparent py-3 text-[14px] text-fg placeholder:text-fg-muted focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); onClose() }
              else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
              else if (e.key === 'Enter') { e.preventDefault(); pick(sel) }
            }}
          />
          <kbd className="shrink-0 rounded border border-line bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <div className="py-8 text-center text-[12.5px] text-fg-muted">没有匹配项</div>
          ) : (
            items.map((it, i) => (
              <button
                key={it.key}
                data-sel={i === sel}
                onClick={() => pick(i)}
                onMouseMove={() => setSel(i)}
                className={`flex w-full items-center rounded-md px-2.5 py-[7px] text-left text-[13px] text-fg-secondary ${
                  i === sel ? 'bg-surface-raised !text-fg' : 'hover:bg-surface-raised/50'
                }`}
              >
                {it.row}
                {i === sel && <CornerDownLeft size={12} className="ml-2 shrink-0 text-fg-muted" />}
              </button>
            ))
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-fg-muted">
          <span>↑↓ 选择</span>
          <span>Enter 打开</span>
          <span className="ml-auto">{items.length} 项</span>
        </div>
      </div>
    </div>
  )
}
