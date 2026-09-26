import { X } from 'lucide-react'

interface Props {
  onClose: () => void
}

const KEYS: [string, string][] = [
  ['Ctrl / Cmd + K（或 O）', '打开命令面板：跳转任意页面或执行命令'],
  ['Alt + ← / →', '在历史栈中后退 / 前进'],
  ['Ctrl + F', '聚焦侧栏全文搜索'],
  ['↑ / ↓ + Enter', '面板内选择并打开'],
  ['Esc', '关闭命令面板与帮助'],
  ['?', '打开 / 关闭本帮助'],
  ['.', '免打扰模式（隐藏侧栏与右栏，再按一次或 Esc 退出）'],
  ['悬停 [[双链]]', '弹出目标页预览卡片'],
  ['图谱视图', '滚轮缩放 · 拖动平移 · 拖拽节点 · 点击打开'],
]

export default function HelpOverlay({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[30rem] animate-fade-up rounded-card border border-line bg-surface shadow-panel">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[14px] font-semibold text-fg">快捷键与操作</h2>
          <button onClick={onClose} aria-label="关闭帮助" className="rounded-md p-1 text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg">
            <X size={15} />
          </button>
        </div>
        <ul className="px-5 py-3">
          {KEYS.map(([key, desc]) => (
            <li key={key} className="flex items-baseline gap-3 border-b border-line/50 py-2.5 text-[12.5px] last:border-b-0">
              <kbd className="shrink-0 rounded border border-line bg-surface-raised px-1.5 py-0.5 font-mono text-[11px] text-fg">{key}</kbd>
              <span className="text-fg-secondary">{desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
