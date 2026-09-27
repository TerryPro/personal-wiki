import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { createVault } from '@/lib/agent'

interface Props {
  onClose: () => void
  onCreated: (id: string) => void
}

/** 名称 → kebab-case id */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

export default function NewVaultDialog({ onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [idManual, setIdManual] = useState(false)
  const [description, setDescription] = useState('')
  const [path, setPath] = useState('')
  const [pathManual, setPathManual] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleName = (v: string) => {
    setName(v)
    if (!idManual) setId(slugify(v))
    if (!pathManual) setPath(slugify(v))
  }

  const submit = async () => {
    const finalId = id.trim()
    const finalName = name.trim()
    if (!finalId || !finalName) {
      setError('名称和 ID 不能为空')
      return
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(finalId)) {
      setError('ID 只允许小写字母、数字和连字符，且不能以连字符开头')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await createVault({
        id: finalId,
        name: finalName,
        path: path.trim() || finalId,
        description: description.trim() || undefined,
      })
      onCreated(finalId)
    } catch (e) {
      setError(String((e as Error)?.message || e))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md animate-fade-up rounded-card border border-line bg-surface p-5 shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-fg">新建知识库</h2>
          <button onClick={onClose} className="rounded-md p-1 text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg">
            <X size={15} />
          </button>
        </div>

        <div className="space-y-3">
          {/* 名称 */}
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-fg-secondary">名称 *</span>
            <input
              value={name}
              onChange={(e) => handleName(e.target.value)}
              placeholder="如：Pi Coding Agent"
              autoFocus
              className="w-full rounded-md border border-line bg-ink-soft px-3 py-1.5 text-[13px] text-fg placeholder:text-fg-muted/50 focus:border-accent/60 focus:outline-none"
            />
          </label>

          {/* ID */}
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-fg-secondary">
              ID * <span className="font-normal text-fg-muted">（kebab-case，用于文件路径和 API）</span>
            </span>
            <input
              value={id}
              onChange={(e) => { setId(e.target.value); setIdManual(true) }}
              placeholder="pi-coding-agent"
              className="w-full rounded-md border border-line bg-ink-soft px-3 py-1.5 font-mono text-[12.5px] text-fg placeholder:text-fg-muted/50 focus:border-accent/60 focus:outline-none"
            />
          </label>

          {/* 描述 */}
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-fg-secondary">描述</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话说明知识库主题"
              className="w-full rounded-md border border-line bg-ink-soft px-3 py-1.5 text-[13px] text-fg placeholder:text-fg-muted/50 focus:border-accent/60 focus:outline-none"
            />
          </label>

          {/* 路径 */}
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-fg-secondary">
              路径 <span className="font-normal text-fg-muted">（相对于 workspace 根，默认 = ID）</span>
            </span>
            <input
              value={path}
              onChange={(e) => { setPath(e.target.value); setPathManual(true) }}
              placeholder="pi-coding-agent"
              className="w-full rounded-md border border-line bg-ink-soft px-3 py-1.5 font-mono text-[12.5px] text-fg placeholder:text-fg-muted/50 focus:border-accent/60 focus:outline-none"
            />
          </label>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-cat-concept/40 bg-cat-concept/10 px-3 py-2 text-[12px] text-cat-concept">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-line bg-surface px-3.5 py-1.5 text-[12.5px] text-fg-secondary transition-colors hover:bg-surface-raised disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={busy || !name.trim() || !id.trim()}
            className="flex items-center gap-1.5 rounded-md border border-accent/60 bg-accent/10 px-3.5 py-1.5 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {busy ? '创建中…' : '创建知识库'}
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-4 text-fg-muted">
          需要 agent-server 在线。创建后会自动生成目录结构（wiki/raw/output）、AGENTS.md 和初始 index/log 页面，并刷新数据快照。
        </p>
      </div>
    </div>
  )
}
