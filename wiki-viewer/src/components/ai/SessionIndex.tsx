import { useEffect, useMemo, useRef, useState } from 'react'
import { ListOrdered, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { buildExchanges, jumpToMsg, type Msg } from './ChatWindow'

export type IndexMode = 'mini' | 'full'

interface Props {
  msgs: Msg[]
  mode: IndexMode
  onMode: (m: IndexMode) => void
  onClose: () => void
}

/** 固定行高：保证收缩/展开两种状态下小方块的垂直位置完全一致 */
const ROW_H = 'h-11'

/**
 * 会话快速索引（pi-map 风格，置于聊天区左侧）：
 * - mini（收缩）= 只露出每行的小方块（minimap）
 * - full（展开）= 小方块 + 索引编号 + 用户问/助手答首行
 * 两态共用同一套固定行高的行，故方块高度与位置在切换时不变；方块与编号 01~NN 一一对应。
 * 共享 scroll-spy：聊天滚动时高亮当前轮并自动跟随；点击跳转。
 */
export default function SessionIndex({ msgs, mode, onMode, onClose }: Props) {
  const exchanges = useMemo(() => buildExchanges(msgs), [msgs])
  const listRef = useRef<HTMLDivElement>(null)
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const full = mode === 'full'

  // scroll-spy：监听聊天滚动容器，计算当前可视轮次
  useEffect(() => {
    const scroller = document.querySelector('[data-chat-scroll]') as HTMLElement | null
    if (!scroller) return
    const compute = () => {
      const top = scroller.scrollTop + 96
      let cur: number | null = null
      for (const e of exchanges) {
        const el = document.getElementById(`wv-msg-${e.idx}`)
        if (!el) continue
        if (el.offsetTop <= top) cur = e.idx
        else break
      }
      setActiveIdx(cur)
    }
    compute()
    scroller.addEventListener('scroll', compute, { passive: true })
    return () => scroller.removeEventListener('scroll', compute)
  }, [exchanges])

  // 当前轮变化 → 展开态列表自动跟随（保持高亮行可见）
  useEffect(() => {
    if (activeIdx == null || !full) return
    listRef.current?.querySelector(`[data-exchange="${activeIdx}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, full])

  const jump = (idx: number) => {
    setActiveIdx(idx)
    jumpToMsg(idx)
  }

  return (
    <aside className={`flex shrink-0 flex-col border-r border-line bg-ink-soft ${full ? 'w-72' : 'w-9'}`}>
      {/* 头：两态同高（h-9，全项目二级标题栏统一高度），保证下方方块起始位置一致 */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-2">
        {full ? (
          <>
            <ListOrdered size={13} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-fg">对话索引</span>
            <span className="shrink-0 font-mono text-[10.5px] text-fg-muted">{exchanges.length}</span>
            <button onClick={() => onMode('mini')} aria-label="收起为 minimap" title="收起为 minimap" className="shrink-0 rounded-md p-1 text-fg-muted transition-colors hover:bg-surface-raised hover:text-accent">
              <PanelLeftClose size={13} />
            </button>
            <button onClick={onClose} aria-label="关闭索引" title="关闭索引" className="shrink-0 rounded-md p-1 text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg">
              <X size={13} />
            </button>
          </>
        ) : (
          <button
            onClick={() => onMode('full')}
            aria-label="展开对话索引"
            title="展开对话索引"
            className="mx-auto rounded-md p-1 text-fg-muted transition-colors hover:bg-surface-raised hover:text-accent"
          >
            <PanelLeftOpen size={13} />
          </button>
        )}
      </div>

      {/* 行列表：固定行高；收缩态只露方块，展开态露 方块+编号+文本 */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
        {exchanges.length === 0 ? (
          full ? (
            <div className="px-3 py-4 text-[11.5px] leading-5 text-fg-muted">暂无对话。发送第一条消息后，这里会按轮次生成索引。</div>
          ) : null
        ) : (
          exchanges.map((e, k) => {
            const active = e.idx === activeIdx
            return (
              <button
                key={e.idx}
                data-exchange={e.idx}
                onClick={() => jump(e.idx)}
                title={`${String(k + 1).padStart(2, '0')} · ${e.user.slice(0, 40)}`}
                className={`relative flex w-full ${ROW_H} shrink-0 items-center text-left transition-colors ${
                  full ? 'gap-2 px-2' : 'justify-center px-0'
                } ${active ? 'bg-accent/10' : 'hover:bg-surface-raised'}`}
              >
                {active && <span className="absolute inset-y-1 left-0 w-[2px] rounded-r bg-accent" />}
                {/* 小方块：两态都在，位置/尺寸恒定 */}
                <span className={`h-2.5 w-2.5 shrink-0 rounded-[3px] transition-colors ${active ? 'bg-accent' : 'bg-fg-muted/60'}`} />
                {full && (
                  <>
                    <span className={`shrink-0 font-mono text-[10.5px] ${active ? 'text-accent' : 'text-fg-muted'}`}>
                      {String(k + 1).padStart(2, '0')}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
                      <span className={`truncate text-[12px] ${active ? 'font-medium text-fg' : 'text-fg-secondary'}`}>{e.user}</span>
                      {e.assistant && <span className="truncate text-[10.5px] text-fg-muted">{e.assistant}</span>}
                    </span>
                  </>
                )}
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}
