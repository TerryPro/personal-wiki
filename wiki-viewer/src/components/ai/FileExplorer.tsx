import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, File, Folder, FolderOpen, Loader2 } from 'lucide-react'
import { listFiles, type FileEntry } from '@/lib/agent'

interface Props {
  onPreview: (path: string) => void
  activePath: string | null
  online: boolean | null
}

type NodeState = FileEntry[] | 'loading' | 'error'

function DirNode({
  name,
  depth,
  expanded,
  children,
  onToggle,
}: {
  name: string
  depth: number
  expanded: boolean
  children: React.ReactNode
  onToggle: () => void
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1 rounded-md py-[3px] pr-1.5 text-left hover:bg-surface-raised"
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        <ChevronRight
          size={11}
          className={`shrink-0 text-fg-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        {expanded ? (
          <FolderOpen size={12} className="shrink-0 text-accent/80" />
        ) : (
          <Folder size={12} className="shrink-0 text-fg-muted" />
        )}
        <span className="truncate text-[12px] text-fg-secondary">{name}</span>
      </button>
      {expanded && <div>{children}</div>}
    </div>
  )
}

export default function FileExplorer({ onPreview, activePath, online }: Props) {
  // path → 子项（'' 为 vault 根）；undefined = 未加载
  const [tree, setTree] = useState<Record<string, NodeState>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const load = useCallback(async (path: string) => {
    setTree((t) => ({ ...t, [path]: 'loading' }))
    try {
      const r = await listFiles(path)
      setTree((t) => ({ ...t, [path]: r.entries }))
    } catch {
      setTree((t) => ({ ...t, [path]: 'error' }))
    }
  }, [])

  useEffect(() => {
    if (online && tree[''] === undefined) load('')
  }, [online, load, tree])

  const toggle = (path: string) => {
    const next = !open[path]
    setOpen((o) => ({ ...o, [path]: next }))
    if (next && tree[path] === undefined) load(path)
  }

  const renderDir = (path: string, depth: number): React.ReactNode => {
    const state = tree[path]
    if (state === undefined) return null
    if (state === 'loading')
      return (
        <div className="flex items-center gap-1.5 py-1 text-[11px] text-fg-muted" style={{ paddingLeft: 20 + depth * 12 }}>
          <Loader2 size={10} className="animate-spin" />
          加载中…
        </div>
      )
    if (state === 'error')
      return (
        <div className="py-1 text-[11px] text-cat-concept" style={{ paddingLeft: 20 + depth * 12 }}>
          加载失败
        </div>
      )
    return state.map((e) => {
      const childPath = path ? `${path}/${e.name}` : e.name
      if (e.dir)
        return (
          <DirNode
            key={childPath}
            name={e.name}
            depth={depth}
            expanded={!!open[childPath]}
            onToggle={() => toggle(childPath)}
          >
            {renderDir(childPath, depth + 1)}
          </DirNode>
        )
      const active = childPath === activePath
      return (
        <button
          key={childPath}
          onClick={() => onPreview(childPath)}
          className={`flex w-full items-center gap-1 rounded-md py-[3px] pr-1.5 text-left hover:bg-surface-raised ${active ? 'bg-accent/10' : ''}`}
          style={{ paddingLeft: 17 + depth * 12 }}
          title={`${childPath} · ${(e.size / 1024).toFixed(1)} KB`}
        >
          <File size={11} className={active ? 'shrink-0 text-accent' : 'shrink-0 text-fg-muted/60'} />
          <span className={`truncate text-[11.5px] ${active ? 'font-medium text-fg' : 'text-fg-secondary'}`}>{e.name}</span>
        </button>
      )
    })
  }

  if (online === false)
    return <div className="px-3 py-6 text-center text-[11.5px] text-fg-muted">agent-server 离线，无法浏览文件</div>

  return (
    <div className="h-full overflow-y-auto px-1.5 py-2">
      <div className="mb-1.5 px-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
        llmwiki/（vault 实时文件）
      </div>
      {renderDir('', 0)}
    </div>
  )
}
