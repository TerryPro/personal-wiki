interface UsageInfo {
  cost: number
  tokens: number | null
  contextWindow?: number | null
  percent?: number | null
}

interface Props {
  usage: UsageInfo | null
}

const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)))

/**
 * Agent 上下文用量 meter（由 AgentToolbar 工具首栏嵌入）：迷你进度条 + 百分比，按占用变色 + 累计成本。
 * 数据来自服务端 usage 事件（SDK ContextUsage: tokens / contextWindow / percent）。
 */
export default function AgentInfo({ usage }: Props) {
  // 无数据时也渲染占位（槽位稳定，不跳动）：ctx — · $0.0000
  const u = usage ?? { cost: 0, tokens: null, contextWindow: null, percent: null }
  const pct =
    u.percent ?? (u.tokens != null && u.contextWindow ? Math.round((u.tokens / u.contextWindow) * 100) : null)
  const clamped = pct == null ? 0 : Math.min(100, Math.max(0, pct))
  const tone = pct == null ? 'muted' : pct < 60 ? 'ok' : pct < 85 ? 'warn' : 'danger'
  const barCls = tone === 'ok' ? 'bg-cat-entity' : tone === 'warn' ? 'bg-accent' : tone === 'danger' ? 'bg-danger' : 'bg-fg-muted'
  const txtCls = tone === 'ok' ? 'text-cat-entity' : tone === 'warn' ? 'text-accent' : tone === 'danger' ? 'text-danger' : 'text-fg-muted'
  const tip = [
    pct == null
      ? '上下文：未知（尚无会话或压缩后待下一次回复）'
      : `上下文：${fmtK(u.tokens ?? 0)} / ${fmtK(u.contextWindow ?? 0)} tokens（${parseFloat(pct.toFixed(4))}%）`,
    `累计成本：$${u.cost.toFixed(4)}`,
    pct != null && pct >= 85 ? '接近上下文上限，可用 /compact 压缩' : '',
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <span className="flex items-center gap-1.5 font-mono tabular-nums" title={tip}>
      <span className="flex items-center gap-1">
        <span className="text-[10px] text-fg-muted">ctx</span>
        <span className="h-1 w-14 overflow-hidden rounded-full bg-surface-raised">
          <span className={`block h-full rounded-full transition-all ${barCls}`} style={{ width: `${clamped}%` }} />
        </span>
        <span className={`text-[10.5px] ${txtCls}`}>{pct == null ? '—' : `${parseFloat(pct.toFixed(4))}%`}</span>
      </span>
      <span className="text-fg-muted/60">·</span>
      <span className="text-[10.5px] text-fg-muted" title="本会话累计成本">
        ${u.cost.toFixed(4)}
      </span>
    </span>
  )
}
