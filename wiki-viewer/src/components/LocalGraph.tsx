import { useMemo, useState } from 'react'
import { CATEGORY_META, buildEdges, getPage } from '@/lib/wiki'
import { createNodes, prewarm } from '@/lib/force'
import type { WikiPage } from '@/types'

interface Props {
  page: WikiPage
  onOpen: (page: WikiPage) => void
}

const W = 240
const H = 180
const PAD = 20
const MAX_NODES = 24

/** 以当前页为中心的本地图谱：BFS 两阶邻居 + 预稳定力布局，静态渲染可点击 */
export default function LocalGraph({ page, onOpen }: Props) {
  const [hover, setHover] = useState<string | null>(null)

  const { pts, lines } = useMemo(() => {
    const all = buildEdges()
    const adj = new Map<string, string[]>()
    for (const e of all) {
      adj.set(e.from, [...(adj.get(e.from) ?? []), e.to])
      adj.set(e.to, [...(adj.get(e.to) ?? []), e.from])
    }
    // 中心 → 一阶 → 二阶依次入选，总数封顶后裁剪
    const order = [page.id, ...(adj.get(page.id) ?? [])]
    const seen = new Set(order)
    for (const id of [...order])
      for (const n of adj.get(id) ?? []) if (!seen.has(n) && order.length < MAX_NODES) { seen.add(n); order.push(n) }
    const ids = [...new Set(order)].slice(0, MAX_NODES)
    const inSet = new Set(ids)
    const localEdges = all.filter((e) => inSet.has(e.from) && inSet.has(e.to))
    const localPages = ids.map(getPage).filter(Boolean) as WikiPage[]

    const nodes = createNodes(localPages, localEdges)
    prewarm(nodes, localEdges, 240)

    // 世界坐标包围盒 → viewBox 等比投影（节点半径不随缩放，保持可读）
    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y)
    const spanX = Math.max(60, Math.max(...xs) - Math.min(...xs))
    const spanY = Math.max(60, Math.max(...ys) - Math.min(...ys))
    const k = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY)
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2
    const pts = nodes.map((n) => ({
      id: n.page.id,
      page: n.page,
      x: W / 2 + (n.x - cx) * k,
      y: H / 2 + (n.y - cy) * k,
      r: n.page.id === page.id ? 5 : 3,
    }))
    const idx = new Map(pts.map((p, i) => [p.id, i]))
    const lines = localEdges
      .filter((e) => idx.has(e.from) && idx.has(e.to))
      .map((e) => ({ a: pts[idx.get(e.from)!], b: pts[idx.get(e.to)!] }))
    return { pts, lines }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id])

  if (pts.length <= 1) {
    return <p className="text-[12px] text-fg-muted">该页暂无图谱内链接（导航页不入图）</p>
  }

  const hot = (id: string) => id === page.id || lines.some((l) => (l.a.id === page.id && l.b.id === id) || (l.b.id === page.id && l.a.id === id))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" style={{ height: H }}>
      {lines.map((l, i) => {
        const on = l.a.id === page.id || l.b.id === page.id
        return (
          <line key={i} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y}
            style={{ stroke: on ? 'hsl(var(--graph-hot) / 0.7)' : 'hsl(var(--graph-edge))', strokeWidth: on ? 1.1 : 0.7, opacity: hover && !on ? 0.35 : 1 }} />
        )
      })}
      {pts.map((p) => {
        const isCenter = p.id === page.id
        const dim = hover && hover !== p.id && !hot(p.id)
        return (
          <g key={p.id} transform={`translate(${p.x},${p.y})`} className="cursor-pointer" opacity={dim ? 0.3 : 1}
            onClick={() => !isCenter && onOpen(p.page)}
            onMouseEnter={() => setHover(p.id)}
            onMouseLeave={() => setHover((h) => (h === p.id ? null : h))}
          >
            <circle r={p.r + 6} fill="transparent" />
            <circle r={p.r} style={{
              fill: CATEGORY_META[p.page.category].dot,
              stroke: isCenter ? 'hsl(var(--fg))' : 'hsl(var(--ink))',
              strokeWidth: isCenter ? 1.4 : 0.8,
            }} />
            {(isCenter || hover === p.id) && (
              <text y={-(p.r + 4)} textAnchor="middle" fontSize={7.5} style={{ fill: 'hsl(var(--graph-label))' }} className="pointer-events-none">
                {p.page.title.length > 10 ? p.page.title.slice(0, 9) + '…' : p.page.title}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
