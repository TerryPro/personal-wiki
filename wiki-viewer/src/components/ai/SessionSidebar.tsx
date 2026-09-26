import { useState } from 'react'
import { Check, MessageSquare, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { SessionInfo } from '@/lib/agent'

interface Props {
  sessions: SessionInfo[]
  activeId: string | null
  busy: boolean
  online: boolean | null
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / 昨天 / N 天前 / 日期 */
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day === 1) return '昨天'
  if (day < 7) return `${day} 天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

/** 时间分组：今天 / 本周 / 更早 */
function groupOf(iso: string): '今天' | '本周' | '更早' {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return '今天'
  const weekAgo = now.getTime() - 7 * 86400000
  return d.getTime() >= weekAgo ? '本周' : '更早'
}

export default function SessionSidebar({ sessions, activeId, busy, online, onSelect, onNew, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const groups = ['今天', '本周', '更早'] as const
  const byGroup = groups.map((g) => [g, sessions.filter((s) => groupOf(s.modified) === g)] as const).filter(([, list]) => list.length > 0)

  const startRename = (s: SessionInfo) => {
    setEditing(s.id)
    setEditName(s.name || s.firstMessage || '')
  }
  const commitRename = (id: string) => {
    const name = editName.trim()
    if (name) onRename(id, name)
    setEditing(null)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-2.5 pb-2 pt-3">
        <button
          onClick={onNew}
          disabled={busy || online === false}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-accent/50 bg-accent/10 py-1.5 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
        >
          <Plus size={13} />
          新建会话
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {sessions.length === 0 && (
          <div className="px-2 py-6 text-center text-[11.5px] leading-5 text-fg-muted">
            暂无历史会话
            <br />
            发起对话或任务后自动创建
          </div>
        )}
        {byGroup.map(([g, list]) => (
          <div key={g} className="mb-1">
            <div className="px-2 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{g}</div>
            {list.map((s) => {
              const active = s.id === activeId
              return (
                <div
                  key={s.id}
                  className={`group relative rounded-md px-2 py-1.5 transition-colors ${
                    active ? 'bg-accent/10' : 'hover:bg-surface-raised'
                  }`}
                >
                  {editing === s.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(s.id)
                          if (e.key === 'Escape') setEditing(null)
                        }}
                        className="min-w-0 flex-1 rounded border border-accent/50 bg-surface px-1.5 py-0.5 text-[12px] text-fg focus:outline-none"
                      />
                      <button onClick={() => commitRename(s.id)} className="text-cat-entity" aria-label="确认重命名">
                        <Check size={12} />
                      </button>
                      <button onClick={() => setEditing(null)} className="text-fg-muted" aria-label="取消重命名">
                        <X size={12} />
                      </button>
                    </div>
                  ) : confirmDel === s.id ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-cat-concept">
                      <span className="min-w-0 flex-1 truncate">删除此会话？</span>
                      <button
                        onClick={() => {
                          onDelete(s.id)
                          setConfirmDel(null)
                        }}
                        className="rounded border border-cat-concept/50 px-1.5 py-px hover:bg-cat-concept/15"
                      >
                        删除
                      </button>
                      <button onClick={() => setConfirmDel(null)} className="text-fg-muted hover:text-fg">
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => onSelect(s.id)} className="block w-full text-left" title={s.name || s.firstMessage}>
                      <span className="flex items-center gap-1.5">
                        <MessageSquare size={11} className={active ? 'shrink-0 text-accent' : 'shrink-0 text-fg-muted/60'} />
                        <span className={`min-w-0 flex-1 truncate text-[12.5px] ${active ? 'font-medium text-fg' : 'text-fg-secondary'}`}>
                          {s.name || s.firstMessage || '(空会话)'}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 pl-[17px] text-[10.5px] text-fg-muted">
                        {timeAgo(s.modified)}
                        <span>·</span>
                        <span>{s.messageCount} 条</span>
                        <span className="ml-auto hidden gap-1 group-hover:flex">
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label="重命名会话"
                            onClick={(e) => {
                              e.stopPropagation()
                              startRename(s)
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && startRename(s)}
                            className="cursor-pointer rounded p-0.5 hover:bg-surface hover:text-fg"
                          >
                            <Pencil size={10} />
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label="删除会话"
                            onClick={(e) => {
                              e.stopPropagation()
                              setConfirmDel(s.id)
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && setConfirmDel(s.id)}
                            className="cursor-pointer rounded p-0.5 hover:bg-surface hover:text-cat-concept"
                          >
                            <Trash2 size={10} />
                          </span>
                        </span>
                      </span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
