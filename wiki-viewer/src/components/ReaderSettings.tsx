import { useEffect, useRef, useState } from 'react'
import { Type } from 'lucide-react'

export interface ReaderCfg {
  size: 0 | 1 | 2 // 字号：小 / 标准 / 大
  serif: boolean // 正文衬线（书籍感）
  pct: number // 行宽：正文区宽度百分比 50–100，免打扰时自动跟随展开
  padY: 0 | 1 | 2 // 上下留白：紧凑 / 标准 / 宽松
}

/** 快捷档：与滑杆共存，点档位后仍可用滑杆微调 */
const WIDTH_PRESETS: [number, string][] = [
  [58, '窄'],
  [72, '标准'],
  [85, '宽'],
  [100, '全宽'],
]

interface Props {
  value: ReaderCfg
  onChange: (v: ReaderCfg) => void
}

function Seg({ active, children, onClick, title }: { active: boolean; children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex-1 rounded-md py-1 text-[12px] font-medium transition-all ${
        active ? 'bg-surface-raised text-fg' : 'text-fg-muted hover:text-fg-secondary'
      }`}
    >
      {children}
    </button>
  )
}

export default function ReaderSettings({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const set = (patch: Partial<ReaderCfg>) => onChange({ ...value, ...patch })

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="排版设置"
        title="排版设置（字号 / 行宽 / 字体）"
        className={`rounded-md border p-1.5 transition-colors ${
          open
            ? 'border-accent/60 bg-accent/10 text-accent'
            : 'border-line bg-surface text-fg-secondary hover:border-accent/50 hover:text-accent'
        }`}
      >
        <Type size={14} strokeWidth={1.9} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-60 animate-fade-up rounded-card border border-line bg-surface p-3 shadow-panel">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">正文字号</div>
          <div className="mb-3 flex rounded-lg border border-line bg-ink-soft p-[2px]">
            <Seg active={value.size === 0} onClick={() => set({ size: 0 })} title="紧凑">A</Seg>
            <Seg active={value.size === 1} onClick={() => set({ size: 1 })} title="标准">
              <span className="text-[14px]">A</span>
            </Seg>
            <Seg active={value.size === 2} onClick={() => set({ size: 2 })} title="舒适">
              <span className="text-[17px]">A</span>
            </Seg>
          </div>

          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">正文字体</div>
          <div className="mb-3 flex rounded-lg border border-line bg-ink-soft p-[2px]">
            <Seg active={!value.serif} onClick={() => set({ serif: false })} title="无衬线（屏幕阅读）">无衬线</Seg>
            <Seg active={value.serif} onClick={() => set({ serif: true })} title="衬线（书斋纸感）">衬线</Seg>
          </div>

          <div className="mb-1 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
            <span>行宽（正文区百分比）</span>
            <span className="font-mono text-[11px] normal-case tracking-normal text-fg-secondary">{value.pct}%</span>
          </div>
          <div className="mb-2 flex rounded-lg border border-line bg-ink-soft p-[2px]">
            {WIDTH_PRESETS.map(([pct, label]) => (
              <Seg key={pct} active={value.pct === pct} onClick={() => set({ pct })} title={`行宽占正文区 ${pct}%`}>
                {label}
              </Seg>
            ))}
          </div>
          <input
            type="range"
            min={50}
            max={100}
            step={1}
            value={value.pct}
            onChange={(e) => set({ pct: Number(e.target.value) })}
            aria-label="行宽百分比"
            className="mb-3 w-full"
            style={{ accentColor: 'hsl(var(--accent))' }}
          />

          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">上下留白</div>
          <div className="flex rounded-lg border border-line bg-ink-soft p-[2px]">
            <Seg active={value.padY === 0} onClick={() => set({ padY: 0 })} title="紧凑，信息优先">紧凑</Seg>
            <Seg active={value.padY === 1} onClick={() => set({ padY: 1 })} title="默认留白">标准</Seg>
            <Seg active={value.padY === 2} onClick={() => set({ padY: 2 })} title="宽松，沉浸阅读">宽松</Seg>
          </div>
        </div>
      )}
    </div>
  )
}
