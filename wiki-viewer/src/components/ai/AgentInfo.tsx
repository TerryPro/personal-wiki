import { ArrowDown, ArrowUp, Gauge, RefreshCw } from 'lucide-react'
import type { StreamState } from '@/lib/agentStream'

interface Props {
  usage: StreamState['usage']
}

/** 紧凑数字：≥1M → 3.3M，≥1000 → 187k，其余原样（pi-web formatCompact 同款） */
const fmtCompact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)

/** 成本：0 → 占位；>0 但 <0.01 → <$0.01；否则两位小数（pi-web 同款） */
const fmtCost = (c: number) => (c <= 0 ? '$0.00' : c < 0.01 ? '<$0.01' : `$${c.toFixed(2)}`)

/**
 * Agent 用量徽章行（pi-web 会话统计栏同款）：↑in ↓out ↻cacheR $成本 ⌒上下文%，
 * 累计细分来自服务端全量聚合（含 compaction/usage 条目，不因压缩回退），
 * 上下文百分比按占用分档变色（≥85% 危险 / ≥60% 提醒），hover 展示全量明细。
 */
export default function AgentInfo({ usage }: Props) {
  const tokens = usage?.tokens ?? null
  const ctxWindow = usage?.contextWindow ?? null
  const pct = usage?.percent ?? (tokens != null && ctxWindow ? Math.round((tokens / ctxWindow) * 100) : null)
  const stats = usage?.stats ?? null
  // 累计成本（store 已将快照 cost 与细分聚合 cost 归一）
  const cost = usage?.cost ?? 0

  const tone = pct == null ? 'muted' : pct < 60 ? 'ok' : pct < 85 ? 'warn' : 'danger'
  const txtCls = tone === 'ok' ? 'text-cat-entity' : tone === 'warn' ? 'text-accent' : tone === 'danger' ? 'text-danger' : 'text-fg-muted'

  const tipLines: string[] = []
  if (stats)
    tipLines.push(
      `累计：in ${stats.input.toLocaleString('en-US')} · out ${stats.output.toLocaleString('en-US')} · ` +
        `cache R ${stats.cacheRead.toLocaleString('en-US')} · cache W ${stats.cacheWrite.toLocaleString('en-US')} · ` +
        `成本 $${cost.toFixed(4)}`,
    )
  tipLines.push(
    pct == null
      ? '上下文：未知（尚无会话或压缩后待下一次回复）'
      : `上下文：${(tokens ?? 0).toLocaleString('en-US')} / ${(ctxWindow ?? 0).toLocaleString('en-US')} tokens（${pct.toFixed(1)}%）`,
  )
  if (pct != null && pct >= 85) tipLines.push('接近上下文上限，可用 /compact 压缩')
  const tip = tipLines.join('\n')

  const badge = 'flex items-center gap-0.5'
  const empty = !stats && pct == null && cost <= 0

  return (
    <span className="flex items-center gap-2 font-mono tabular-nums" title={tip}>
      {stats && stats.input > 0 && (
        <span className={badge} title="累计输入 tokens">
          <ArrowUp size={10} />
          {fmtCompact(stats.input)}
        </span>
      )}
      {stats && stats.output > 0 && (
        <span className={badge} title="累计输出 tokens">
          <ArrowDown size={10} />
          {fmtCompact(stats.output)}
        </span>
      )}
      {stats && stats.cacheRead > 0 && (
        <span className={badge} title="累计缓存读取 tokens">
          <RefreshCw size={10} />
          {fmtCompact(stats.cacheRead)}
        </span>
      )}
      <span className={cost > 0 ? 'text-fg-secondary' : 'text-fg-muted'} title="本会话累计成本">
        {fmtCost(cost)}
      </span>
      {pct == null ? (
        <span className={badge}>
          <Gauge size={10} className="text-fg-muted" />
          <span className="text-[10.5px] text-fg-muted">—</span>
          {ctxWindow != null && <span className="text-fg-muted/70">/ {fmtCompact(ctxWindow)}</span>}
        </span>
      ) : (
        <span className={`${badge} ${txtCls}`} title="上下文占用（tokens / 窗口上限）">
          <Gauge size={10} />
          {pct.toFixed(0)}%
          {ctxWindow != null && <span className="text-fg-muted/70"> / {fmtCompact(ctxWindow)}</span>}
        </span>
      )}
      {empty && <span className="text-[10.5px] text-fg-muted/70">暂无用量</span>}
    </span>
  )
}
