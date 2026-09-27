import { BookOpen, Gauge } from 'lucide-react'

interface Props {
  mode: 'wiki' | 'ai'
  onSwitch: (m: 'wiki' | 'ai') => void
}

/** 顶层模式切换分段控件：两种模式的顶栏共用，样式与阅读模式 segmented 一致 */
export default function ModeSwitch({ mode, onSwitch }: Props) {
  return (
    <div className="flex shrink-0 rounded-lg border border-line bg-surface p-[2px]" role="tablist" aria-label="模式切换">
      {(
        [
          ['wiki', '阅读', BookOpen],
          ['ai', '工作', Gauge],
        ] as const
      ).map(([m, label, Icon]) => (
        <button
          key={m}
          role="tab"
          aria-selected={mode === m}
          onClick={() => m !== mode && onSwitch(m)}
          title={m === 'wiki' ? 'Wiki 阅读模式' : '工作模式（pi 智能体，Ctrl+J）'}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-[12.5px] font-medium transition-all duration-150 ${
            mode === m ? 'bg-surface-raised text-fg' : 'text-fg-muted hover:text-fg-secondary'
          }`}
        >
          <Icon size={13} strokeWidth={1.9} />
          {label}
        </button>
      ))}
    </div>
  )
}
