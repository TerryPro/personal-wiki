import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Library, Plus } from 'lucide-react'
import type { VaultEntry } from '@/types'

interface Props {
  vaults: VaultEntry[]
  activeVault: string
  onSwitch: (id: string) => void
  onNew: () => void
}

/**
 * 知识库切换下拉：显示当前 vault 名称，点击展开列表。
 * 样式与工具栏其他按钮保持一致（border-line / bg-surface / accent 高亮）。
 */
export default function VaultSwitcher({ vaults, activeVault, onSwitch, onNew }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const current = vaults.find((v) => v.id === activeVault)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="切换知识库"
        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors ${
          open
            ? 'border-accent/60 bg-accent/10 text-accent'
            : 'border-line bg-surface text-fg-secondary hover:border-accent/50 hover:text-accent'
        }`}
      >
        <Library size={13} strokeWidth={1.9} />
        <span className="max-w-[100px] truncate">{current?.name ?? activeVault}</span>
        <ChevronDown size={11} strokeWidth={2.2} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 animate-fade-up rounded-card border border-line bg-surface p-1 shadow-panel">
          {vaults.map((v) => (
            <button
              key={v.id}
              onClick={() => {
                if (v.id !== activeVault) onSwitch(v.id)
                setOpen(false)
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                v.id === activeVault
                  ? 'bg-accent/10 font-medium text-accent'
                  : 'text-fg-secondary hover:bg-surface-raised hover:text-fg'
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{v.name}</span>
              {v.id === activeVault && <Check size={12} strokeWidth={2.4} className="shrink-0" />}
            </button>
          ))}

          <div className="my-1 h-px bg-line" />

          <button
            onClick={() => {
              setOpen(false)
              onNew()
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-fg-muted transition-colors hover:bg-surface-raised hover:text-accent"
          >
            <Plus size={12} strokeWidth={2.2} />
            新建知识库…
          </button>
        </div>
      )}
    </div>
  )
}
