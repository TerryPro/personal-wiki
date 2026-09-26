import { CATEGORY_META, getBacklinks } from '@/lib/wiki'
import { usePreviewState } from '@/lib/preview'

const W = 330

/** 全局悬停预览卡片：fixed 渲染在根部，pointer-events-none 不干扰鼠标 */
export default function PreviewCard() {
  const { target, x, y } = usePreviewState()
  if (!target) return null

  const left = Math.max(12, Math.min(x + 16, window.innerWidth - W - 12))
  const top = Math.max(12, Math.min(y + 18, window.innerHeight - 210))

  if ('broken' in target) {
    return (
      <div className="pointer-events-none fixed z-40 animate-fade-up rounded-card border border-dashed border-line bg-surface-raised p-4 shadow-panel" style={{ left, top, width: W }}>
        <div className="text-[13.5px] font-medium text-fg-secondary">[[{target.broken}]]</div>
        <p className="mt-1.5 text-[12px] leading-5 text-fg-muted">页面尚未创建 — 它已出现在侧栏「待创建」清单里，等待下一次摄取或 LLM 撰写。</p>
      </div>
    )
  }

  const p = target.page
  const meta = CATEGORY_META[p.category]
  const backlinks = getBacklinks(p)
  const Icon = meta.icon

  return (
    <div className="pointer-events-none fixed z-40 animate-fade-up rounded-card border border-line bg-surface-raised p-4 shadow-panel" style={{ left, top, width: W }}>
      <div className="flex items-center gap-2">
        <Icon size={14} strokeWidth={1.9} style={{ color: meta.dot }} />
        <span className="truncate text-[13.5px] font-semibold text-fg">{p.title}</span>
        <span className="ml-auto shrink-0 text-[11px] text-fg-muted">{p.categoryLabel}</span>
      </div>
      <p className="mt-2 line-clamp-4 text-[12px] leading-5 text-fg-secondary">{p.excerpt}</p>
      <div className="mt-2.5 flex items-center gap-2 border-t border-line/60 pt-2 text-[11px] text-fg-muted">
        <span className="font-mono">{p.slug}</span>
        <span className="ml-auto">{backlinks.length} 条反链 · 点击打开</span>
      </div>
    </div>
  )
}
