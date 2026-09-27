import type { ReactNode } from 'react'
import { X, type LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  /** 标题右侧的等宽 meta（如大小、文件数） */
  meta?: ReactNode
  /** 头部右侧动作区（close 之前） */
  actions?: ReactNode
  onClose?: () => void
  /** 底部操作区（如审查的应用/丢弃） */
  footer?: ReactNode
  children: ReactNode
}

/**
 * 右栏面板共享 chrome：头 h-9（全项目二级标题栏统一高度）+ body 填充 + 可选 footer。
 * PreviewPanel / ReviewPanel 等右栏内容统一套用它，保证布局与风格一致。
 */
export default function PanelFrame({ icon: Icon, title, meta, actions, onClose, footer, children }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <Icon size={13} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-fg" title={typeof title === 'string' ? title : undefined}>
          {title}
        </span>
        {meta && <span className="shrink-0 font-mono text-[10.5px] text-fg-muted">{meta}</span>}
        {actions}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="关闭面板"
            title="关闭面板"
            className="shrink-0 rounded-md p-1 text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg"
          >
            <X size={13} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      {footer && <div className="shrink-0 border-t border-line px-3 py-2">{footer}</div>}
    </div>
  )
}
