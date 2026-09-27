import type { WikiPage } from '@/types'

export interface FNode {
  page: WikiPage
  x: number
  y: number
  vx: number
  vy: number
  r: number
  degree: number
}

export interface FEdge {
  from: string
  to: string
}

/** 初始环形布局 + 度数定节点半径 */
export function createNodes(pages: WikiPage[], edges: FEdge[]): FNode[] {
  const degree = new Map<string, number>()
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) || 0) + 1)
    degree.set(e.to, (degree.get(e.to) || 0) + 1)
  }
  return pages.map((page, i) => {
    const angle = (i / pages.length) * Math.PI * 2
    const d = degree.get(page.id) || 0
    return {
      page,
      x: Math.cos(angle) * 220 + (i % 7) * 8,
      y: Math.sin(angle) * 200,
      vx: 0,
      vy: 0,
      r: 3 + Math.min(6, d * 0.75),
      degree: d,
    }
  })
}

/** 单步力模拟：斥力 O(n²) + 弹簧 + 向心 + 阻尼（30 节点规模足够） */
export function step(nodes: FNode[], edges: FEdge[], alpha: number, pinned?: FNode | null) {
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j]
      let dx = a.x - b.x, dy = a.y - b.y
      let d2 = dx * dx + dy * dy
      if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1 }
      const f = (12000 / d2) * alpha
      const d = Math.sqrt(d2)
      a.vx += (dx / d) * f; a.vy += (dy / d) * f
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
    }

  const idx = new Map(nodes.map((n, i) => [n.page.id, i]))
  for (const e of edges) {
    const ia = idx.get(e.from)
    const ib = idx.get(e.to)
    // 防御：边端点不在节点集（如跨 vault 残留/过滤差异）时跳过，避免 nodes[undefined] 崩溃
    if (ia == null || ib == null) continue
    const a = nodes[ia], b = nodes[ib]
    const dx = b.x - a.x, dy = b.y - a.y
    const d = Math.max(1, Math.hypot(dx, dy))
    const f = ((d - 190) / d) * 0.02 * alpha * 6
    a.vx += dx * f * 0.5; a.vy += dy * f * 0.5
    b.vx -= dx * f * 0.5; b.vy -= dy * f * 0.5
  }

  for (const n of nodes) {
    n.vx += -n.x * 0.001 * alpha * 6
    n.vy += -n.y * 0.001 * alpha * 6
    if (n === pinned) { n.vx = 0; n.vy = 0; continue }
    n.vx *= 0.82
    n.vy *= 0.82
    n.x += n.vx
    n.y += n.vy
  }
}

/** 同步预计算：进画面前把布局跑稳，返回收敛后的 alpha 下限 */
export function prewarm(nodes: FNode[], edges: FEdge[], ticks = 320) {
  let alpha = 1
  for (let t = 0; t < ticks; t++) {
    step(nodes, edges, alpha)
    alpha *= 0.985
  }
  for (const n of nodes) { n.vx = 0; n.vy = 0 }
}
