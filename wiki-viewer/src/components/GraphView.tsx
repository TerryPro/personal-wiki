import { useEffect, useMemo, useRef, useState } from 'react'
import type { WheelEvent as ReactWheelEvent } from 'react'
import { Crosshair, RotateCcw } from 'lucide-react'
import { CATEGORY_META, buildEdges, pages } from '@/lib/wiki'
import { createNodes, prewarm, step, type FNode } from '@/lib/force'
import type { Category, WikiPage } from '@/types'

interface Props {
  activeId: string | null
  onOpen: (page: WikiPage) => void
}

const graphPages = pages.filter((p) => p.category !== 'meta')

export default function GraphView({ activeId, onOpen }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [, setTick] = useState(0)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<Category>>(new Set())
  const [ego, setEgo] = useState(false)
  const view = useRef({ k: 1, tx: 0, ty: 0, w: 800, h: 600 })
  const dragRef = useRef<{ mode: 'node'; node: FNode } | { mode: 'pan'; sx: number; sy: number; tx0: number; ty0: number } | null>(null)
  const downRef = useRef<{ x: number; y: number } | null>(null)
  const alphaRef = useRef(0)

  const edges = useMemo(buildEdges, [])

  // 邻接表（供两阶聚焦）
  const adj = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const e of edges) {
      m.set(e.from, [...(m.get(e.from) ?? []), e.to])
      m.set(e.to, [...(m.get(e.to) ?? []), e.from])
    }
    return m
  }, [edges])

  // 可见集：类别过滤 ∧（可选）以当前页为中心的两阶邻居；非知识页（meta）时聚焦自动失效
  const egoActive = ego && !!activeId && adj.has(activeId)
  const visible = useMemo(() => {
    let ids = new Set(graphPages.filter((p) => !hidden.has(p.category)).map((p) => p.id))
    if (egoActive && activeId) {
      const center = new Set<string>([activeId, ...(adj.get(activeId) ?? [])])
      for (const n1 of center) for (const n2 of adj.get(n1) ?? []) center.add(n2)
      ids = new Set([...ids].filter((id) => center.has(id)))
      ids.add(activeId)
    }
    return ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, egoActive, activeId, adj])

  const toggleCat = (c: Category) =>
    setHidden((h) => {
      const n = new Set(h)
      n.has(c) ? n.delete(c) : n.add(c)
      return n
    })
  const nodes = useRef<FNode[]>([])
  if (nodes.current.length === 0) {
    nodes.current = createNodes(graphPages, edges)
    prewarm(nodes.current, edges) // 进画面前先跑稳 320 步：开场即静止布局
  }

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      view.current.w = el.clientWidth
      view.current.h = el.clientHeight
      fitView()
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 按布局包围盒自动缩放居中，避免密集/偏移 */
  const fitView = () => {
    const ns = nodes.current
    const el = boxRef.current
    if (!ns.length || !el) return
    const v = view.current
    v.w = el.clientWidth
    v.h = el.clientHeight
    const xs = ns.map((n) => n.x), ys = ns.map((n) => n.y)
    const spanX = Math.max(240, Math.max(...xs) - Math.min(...xs) + 240)
    const spanY = Math.max(200, Math.max(...ys) - Math.min(...ys) + 190)
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2
    v.k = Math.min(1.3, Math.max(0.4, Math.min(v.w / spanX, v.h / spanY)))
    v.tx = -cx * v.k
    v.ty = -cy * v.k
    setTick((t) => t + 1)
  }

  useEffect(() => {
    let raf = 0
    const loop = () => {
      if (alphaRef.current > 0.004) {
        step(nodes.current, edges, alphaRef.current, dragRef.current?.mode === 'node' ? dragRef.current.node : null)
        alphaRef.current *= 0.97
        setTick((t) => t + 1)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [edges])

  const heat = (a: number) => (alphaRef.current = Math.max(alphaRef.current, a))

  /** 屏幕坐标 → 以视口中心为原点的画布坐标 → 世界坐标 */
  const toWorld = (clientX: number, clientY: number) => {
    const r = boxRef.current!.getBoundingClientRect()
    const v = view.current
    const px = clientX - r.left - r.width / 2
    const py = clientY - r.top - r.height / 2
    return { x: (px - v.tx) / v.k, y: (py - v.ty) / v.k, px, py }
  }

  const onWheel = (e: ReactWheelEvent) => {
    e.preventDefault()
    const v = view.current
    const before = toWorld(e.clientX, e.clientY)
    v.k = Math.min(3, Math.max(0.4, v.k * Math.exp(-e.deltaY * 0.0012)))
    const r = boxRef.current!.getBoundingClientRect()
    const px = e.clientX - r.left - r.width / 2
    const py = e.clientY - r.top - r.height / 2
    v.tx = px - before.x * v.k
    v.ty = py - before.y * v.k
    setTick((t) => t + 1)
  }

  const nlist = nodes.current
  const { k, tx, ty, w, h } = view.current
  const focusId = hoverId ?? activeId
  const focus = focusId ? nlist.find((n) => n.page.id === focusId) : null
  const neighbor = (n: FNode) =>
    !!focus && (n === focus || edges.some((e) => (e.from === focus.page.id && e.to === n.page.id) || (e.to === focus.page.id && e.from === n.page.id)))
  const idx = new Map(nlist.map((n, i) => [n.page.id, i]))

  return (
    <div ref={boxRef} className="relative h-full min-h-0 w-full select-none overflow-hidden" onWheel={onWheel}>
      <svg className="h-full w-full"
        onPointerDown={(e) => {
          dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx0: tx, ty0: ty }
        }}
        onPointerMove={(e) => {
          const d = dragRef.current
          if (!d) return
          if (d.mode === 'pan') {
            view.current.tx = d.tx0 + (e.clientX - d.sx)
            view.current.ty = d.ty0 + (e.clientY - d.sy)
            setTick((t) => t + 1)
          } else {
            const p = toWorld(e.clientX, e.clientY)
            d.node.x = p.x; d.node.y = p.y
            heat(0.25)
          }
        }}
        onPointerUp={() => (dragRef.current = null)}
        onPointerLeave={() => (dragRef.current = null)}
      >
        <g transform={`translate(${w / 2 + tx},${h / 2 + ty}) scale(${k})`}>
          {edges.map((e, i) => {
            const a = nlist[idx.get(e.from)!], b = nlist[idx.get(e.to)!]
            const vis = visible.has(e.from) && visible.has(e.to)
            const hot = vis && focus && (a === focus || b === focus)
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              style={{ stroke: hot ? 'hsl(var(--graph-hot) / 0.75)' : 'hsl(var(--graph-edge))', strokeWidth: (hot ? 1.6 : 0.8) / k, opacity: vis ? (focus && !hot ? 0.25 : 1) : 0.04 }} />
          })}
          {nlist.map((n) => {
            const isActive = n.page.id === activeId
            const near = neighbor(n)
            const vis = visible.has(n.page.id)
            return (
              <g key={n.page.id} transform={`translate(${n.x},${n.y})`} opacity={vis ? (focus && !near ? 0.25 : 1) : 0.05}
                className={vis ? 'cursor-pointer' : 'pointer-events-none'}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  dragRef.current = { mode: 'node', node: n }
                  downRef.current = { x: e.clientX, y: e.clientY }
                }}
                onPointerOver={() => setHoverId(n.page.id)}
                onPointerOut={() => setHoverId((id) => (id === n.page.id ? null : id))}
                onClick={(e) => {
                  const d = downRef.current
                  if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) onOpen(n.page)
                }}
              >
                <circle r={n.r + 7 / k} fill="transparent" />
                <circle r={n.r} style={{
                  fill: CATEGORY_META[n.page.category].dot,
                  stroke: isActive ? 'hsl(var(--fg))' : 'hsl(var(--ink))',
                  strokeWidth: (isActive ? 2 : near && focus === n ? 1.6 : 1.2) / k,
                }} />
                {(n.degree >= 6 || near) && (
                  <text y={-(n.r + 6 / k)} textAnchor="middle" fontSize={10 / Math.max(k, 0.8)} style={{ fill: 'hsl(var(--graph-label))' }} className="pointer-events-none">
                    {n.page.title.length > 11 ? n.page.title.slice(0, 10) + '…' : n.page.title}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {/* hover 气泡 */}
      {focus && hoverId && (() => {
        const sx = w / 2 + tx + focus.x * k
        const sy = h / 2 + ty + focus.y * k
        return (
          <div className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-line bg-surface-raised px-2.5 py-1.5 shadow-panel"
            style={{ left: sx, top: sy - (focus.r * k + 34) }}
          >
            <div className="text-[12px] font-medium text-fg">{focus.page.title}</div>
            <div className="mt-0.5 text-[11px] text-fg-muted">{focus.page.categoryLabel} · {focus.degree} 条连接 · 点击打开</div>
          </div>
        )
      })()}

      {/* 左下：类别过滤开关 + 两阶聚焦 */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2">
        <div className="flex gap-1.5 rounded-md border border-line bg-surface/90 px-2 py-2 text-[11px] text-fg-secondary backdrop-blur">
          {(Object.keys(CATEGORY_META) as Category[]).filter((k) => k !== 'meta').map((key) => {
            const m = CATEGORY_META[key]
            const off = hidden.has(key)
            return (
              <button key={key} onClick={() => toggleCat(key)} title={off ? '点击显示该类别' : '点击隐藏该类别'}
                className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all hover:bg-surface-raised ${off ? 'text-fg-muted/50 line-through' : ''}`}>
                <span className="h-2 w-2 rounded-full" style={{ background: m.dot, opacity: off ? 0.3 : 1 }} />
                {m.label}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => setEgo((v) => !v)}
          disabled={!activeId || !adj.has(activeId)}
          title={activeId && adj.has(activeId) ? '只看当前页两阶邻居' : '先打开一个知识页面再聚焦'}
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-[11px] backdrop-blur transition-colors disabled:cursor-default disabled:opacity-40 ${
            egoActive ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line bg-surface/90 text-fg-secondary hover:border-accent/50 hover:text-accent'
          }`}
        >
          <Crosshair size={12} /> 聚焦
        </button>
      </div>

      <div className="absolute right-4 top-4 flex items-center gap-2">
        <span className="rounded-md border border-line bg-surface/90 px-3 py-1.5 text-[11px] text-fg-muted backdrop-blur">
          滚轮缩放 · 拖动空白平移 · 悬停看关联 · 点击打开页面
        </span>
        <button
          onClick={() => {
            nlist.forEach((n, i) => {
              const a = (i / nlist.length) * Math.PI * 2
              n.x = Math.cos(a) * 220; n.y = Math.sin(a) * 200; n.vx = 0; n.vy = 0
            })
            prewarm(nlist, edges)
            fitView()
            setTick((t) => t + 1)
          }}
          title="重新计算布局"
          className="flex items-center gap-1.5 rounded-md border border-line bg-surface/90 px-2.5 py-1.5 text-[11px] text-fg-secondary backdrop-blur transition-colors hover:border-accent/50 hover:text-accent"
        >
          <RotateCcw size={12} /> 重置布局
        </button>
      </div>
    </div>
  )
}
