import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  ArrowRight,
  Eraser,
  File,
  Minimize2,
  Pencil,
  Plus,
  Puzzle,
  Square,
  Terminal,
} from 'lucide-react'
import { searchFiles, type SkillInfo } from '@/lib/agent'

interface Props {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop: () => void
  busy: boolean
  disabled: boolean
  /** 内置命令（/new /compact /clear）由菜单执行 */
  onCommand: (cmd: 'new' | 'compact' | 'clear') => void
  /** skills 列表（/ 菜单数据源） */
  skills: SkillInfo[]
}

interface CmdItem {
  name: string
  desc: string
  kind: 'builtin' | 'skill'
  icon: typeof Plus
}

type MenuState = { kind: 'cmd' | 'file'; query: string; start: number } | null

const BUILTIN_CMDS: CmdItem[] = [
  { name: '/new', desc: '新建一个空会话', kind: 'builtin', icon: Plus },
  { name: '/name', desc: '重命名当前会话（后接名称发送）', kind: 'builtin', icon: Pencil },
  { name: '/compact', desc: '压缩当前会话上下文，释放 token', kind: 'builtin', icon: Minimize2 },
  { name: '/clear', desc: '清空当前视图消息（不删除会话）', kind: 'builtin', icon: Eraser },
]

/** 检测光标前的 / 或 @ 触发词 */
function detectMenu(value: string, caret: number): MenuState {
  const before = value.slice(0, caret)
  const cmdM = before.match(/(?:^|\n)\/([\w-]*)$/)
  if (cmdM) return { kind: 'cmd', query: cmdM[1], start: caret - cmdM[1].length - 1 }
  const fileM = before.match(/@([\w./-]*)$/)
  if (fileM) return { kind: 'file', query: fileM[1], start: caret - fileM[1].length - 1 }
  return null
}

/** pi-web 风格输入区：一体化圆角容器 + 内嵌发送按钮 + / 命令与 @ 文件菜单（agent 信息与控制已迁至 AgentToolbar） */
export default function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  disabled,
  onCommand,
  skills,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<MenuState>(null)
  const [cmdItems, setCmdItems] = useState<CmdItem[]>([])
  const [fileItems, setFileItems] = useState<{ path: string; size: number }[]>([])
  const [sel, setSel] = useState(0)

  // 自动增高：单行起步，随内容长到 160px 封顶
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(160, Math.max(24, ta.scrollHeight))}px`
  }, [value])

  // 菜单数据源：命令 = 内置 + skills（模糊匹配、分组）；文件 = server 搜索（空查询返回最近文件）
  useEffect(() => {
    if (!menu) return
    if (menu.kind === 'cmd') {
      const q = menu.query.toLowerCase()
      const all: CmdItem[] = [
        ...BUILTIN_CMDS,
        ...skills.map((s) => ({
          name: `/skill:${s.name}`,
          desc: s.description.replace(/\s+/g, ' ').slice(0, 64),
          kind: 'skill' as const,
          icon: Puzzle,
        })),
      ]
      setCmdItems(q ? all.filter((c) => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)) : all)
      setSel(0)
    } else {
      let alive = true
      const timer = setTimeout(() => {
        searchFiles(menu.query)
          .then((r) => alive && setFileItems(r))
          .catch(() => alive && setFileItems([]))
      }, 100)
      setSel(0)
      return () => {
        alive = false
        clearTimeout(timer)
      }
    }
  }, [menu, skills])

  const itemsCount = menu?.kind === 'cmd' ? cmdItems.length : fileItems.length

  // 键盘导航时滚动条跟随选中项
  useEffect(() => {
    if (!menu) return
    listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [sel, menu])

  const refreshMenu = () => {
    const ta = taRef.current
    if (!ta) return setMenu(null)
    setMenu(detectMenu(ta.value, ta.selectionStart))
  }

  /** 用选中项替换触发词范围 */
  const replaceRange = (start: number, text: string) => {
    const ta = taRef.current
    if (!ta) return
    const caret = ta.selectionStart
    const next = value.slice(0, start) + text + value.slice(caret)
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = start + text.length
    })
  }

  const confirmSel = () => {
    if (!menu) return false
    if (menu.kind === 'cmd') {
      const item = cmdItems[sel]
      if (!item) return false
      if (item.kind === 'builtin' && item.name !== '/name') {
        replaceRange(menu.start, '')
        onCommand(item.name.slice(1) as 'new' | 'compact' | 'clear')
      } else {
        replaceRange(menu.start, `${item.name} `)
      }
    } else {
      const item = fileItems[sel]
      if (!item) return false
      replaceRange(menu.start, `@${item.path} `)
    }
    setMenu(null)
    return true
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menu && itemsCount > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSel((s) => (s + 1) % itemsCount)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSel((s) => (s - 1 + itemsCount) % itemsCount)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        confirmSel()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMenu(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!busy && !disabled && value.trim()) onSend()
    }
  }

  const menuOpen = menu !== null && itemsCount > 0
  // 命令菜单分组索引（内置 / skills 两段）
  const builtinCount = menu?.kind === 'cmd' ? cmdItems.filter((c) => c.kind === 'builtin').length : 0

  return (
    <div className="shrink-0 px-5 pb-2.5 pt-1">
      <div className="relative mx-auto max-w-full" style={{ width: 'var(--chat-w, 72%)' }}>
        {/* 弹出菜单（/ 命令 / @ 文件） */}
        {menuOpen && (
          <div className="absolute bottom-[calc(100%+6px)] left-0 right-0 z-20 overflow-hidden rounded-lg border border-line bg-surface shadow-panel">
            <div ref={listRef} className="max-h-72 overflow-y-auto p-1">
              {menu.kind === 'cmd' ? (
                <>
                  {builtinCount > 0 && (
                    <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                      命令
                    </div>
                  )}
                  {cmdItems.map((c, i) => {
                    const Icon = c.icon
                    return (
                      <div key={c.name}>
                        {i === builtinCount && c.kind === 'skill' && (
                          <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                            Skills
                          </div>
                        )}
                        <button
                          data-idx={i}
                          onClick={() => {
                            setSel(i)
                            confirmSel()
                          }}
                          onMouseEnter={() => setSel(i)}
                          className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${
                            i === sel ? 'bg-accent/10' : 'hover:bg-surface-raised'
                          }`}
                        >
                          <Icon size={13} className={c.kind === 'skill' ? 'shrink-0 text-cat-synthesis' : 'shrink-0 text-accent'} />
                          <span className={`shrink-0 font-mono text-[12px] font-medium ${i === sel ? 'text-fg' : 'text-fg-secondary'}`}>
                            {c.name}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[11px] text-fg-muted">{c.desc}</span>
                          <span className="shrink-0 rounded border border-line bg-ink-soft px-1 py-px text-[9.5px] text-fg-muted">
                            {c.kind === 'skill' ? 'skill' : '内置'}
                          </span>
                        </button>
                      </div>
                    )
                  })}
                </>
              ) : (
                <>
                  <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                    {menu.query ? `文件引用 · ${fileItems.length} 个匹配` : '最近修改的文件'}
                  </div>
                  {fileItems.map((f, i) => (
                    <button
                      key={f.path}
                      data-idx={i}
                      onClick={() => {
                        setSel(i)
                        confirmSel()
                      }}
                      onMouseEnter={() => setSel(i)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${
                        i === sel ? 'bg-accent/10' : 'hover:bg-surface-raised'
                      }`}
                    >
                      <File size={13} className="shrink-0 text-fg-muted" />
                      <span className={`min-w-0 flex-1 truncate font-mono text-[11.5px] ${i === sel ? 'text-fg' : 'text-fg-secondary'}`}>
                        {f.path}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-fg-muted">{(f.size / 1024).toFixed(1)} KB</span>
                    </button>
                  ))}
                </>
              )}
            </div>
            {/* 键盘提示行 */}
            <div className="flex items-center gap-3 border-t border-line bg-ink-soft px-2.5 py-1 text-[10px] text-fg-muted">
              <span className="flex items-center gap-1">
                <Terminal size={9} />↑↓ 导航
              </span>
              <span>Enter 选择</span>
              <span>Esc 关闭</span>
              <span className="ml-auto">{itemsCount} 项</span>
            </div>
          </div>
        )}

        {/* 一体化输入容器：items-center 保证单行时文字与发送按钮垂直居中对称 */}
        <div
          className={`flex items-center gap-2 rounded-xl border bg-surface px-4 py-2.5 transition-colors ${
            disabled
              ? 'border-line opacity-60'
              : 'border-line focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/10'
          }`}
        >
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              requestAnimationFrame(refreshMenu)
            }}
            onClick={refreshMenu}
            onKeyDown={onKeyDown}
            onBlur={() => setTimeout(() => setMenu(null), 150)}
            rows={1}
            placeholder={disabled ? 'agent-server 离线，无法提问' : '消息…输入 / 使用命令，输入 @ 引用文件'}
            disabled={disabled}
            className="min-w-0 flex-1 resize-none bg-transparent text-[13.5px] leading-6 text-fg placeholder:text-fg-muted focus:outline-none"
          />
          {busy ? (
            <button
              onClick={onStop}
              aria-label="停止"
              title="中断当前任务"
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-cat-concept/40 bg-cat-concept/10 px-3 py-1.5 text-[12.5px] font-medium text-cat-concept transition-colors hover:bg-cat-concept/20"
            >
              <Square size={12} />
              停止
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={disabled || !value.trim()}
              aria-label="发送"
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-3 py-1.5 text-[12.5px] font-medium text-fg-secondary transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-default disabled:opacity-40"
            >
              <ArrowRight size={13} strokeWidth={2.2} />
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
