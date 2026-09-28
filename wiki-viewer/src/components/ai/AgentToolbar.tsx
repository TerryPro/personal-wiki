import { Cog, Lightbulb, ListOrdered, Minimize2, ScrollText, ShieldCheck } from 'lucide-react'
import AgentInfo from './AgentInfo'
import type { StreamState } from '@/lib/agentStream'

interface Props {
  /** SSE usage 快照（累计细分 + ctx 占用 + 成本，由 AgentInfo 徽章行呈现） */
  usage: StreamState['usage']
  /** 当前会话模型显示名（点击打开左栏设置 tab） */
  modelDisplay: string
  onOpenSettings: () => void
  /** thinking level（点击循环 off→low→medium→high） */
  thinkingLevel: string
  onThinkingCycle: () => void
  /** 压缩当前会话上下文（/compact） */
  onCompact: () => void
  /** 打开右栏「上下文」tab 检视系统提示词与用量 */
  onOpenContext: () => void
  /** 对话索引当前是否开启（mini/full 都算开） */
  indexOn: boolean
  /** 切换对话索引：off ↔ mini */
  onToggleIndex: () => void
  activeId: string | null
  busy: boolean
}

/**
 * Agent 工具首栏：对话区顶部的 pi agent 信息与控制统一入口。
 * 左簇 = 信息（模型 / 思考档 / ctx 用量 / 成本）；右簇 = 控制与状态（对话索引 / 上下文检视 / 审核门 / 压缩）。
 * 检视内容在右栏 ContextPanel 展示，本栏只留入口。
 */
export default function AgentToolbar({
  usage,
  modelDisplay,
  onOpenSettings,
  thinkingLevel,
  onThinkingCycle,
  onCompact,
  onOpenContext,
  indexOn,
  onToggleIndex,
  activeId,
  busy,
}: Props) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-ink-soft px-3 text-[11px] text-fg-muted">
      {/* 左簇：会话配置信息 */}
      <button
        onClick={onOpenSettings}
        title="当前会话模型（点击在设置中切换）"
        className="flex shrink-0 items-center gap-1.5 rounded px-1 py-px text-fg-secondary transition-colors hover:text-accent"
      >
        <Cog size={11} />
        <span className="max-w-[180px] truncate">{modelDisplay}</span>
      </button>
      <button
        onClick={onThinkingCycle}
        title="思考强度：点击在 off → low → medium → high 间循环"
        className="flex shrink-0 items-center gap-1 rounded px-1 py-px transition-colors hover:text-fg"
      >
        <Lightbulb size={11} />
        {thinkingLevel}
      </button>
      <AgentInfo usage={usage} />

      {/* 右簇：控制与状态 */}
      <span className="ml-auto flex items-center gap-3">
        <button
          onClick={onToggleIndex}
          aria-label="对话索引"
          title={indexOn ? '关闭对话索引（minimap / 展开列表）' : '开启对话索引（minimap）'}
          className={`flex items-center gap-1 rounded px-1 py-px transition-colors ${indexOn ? 'text-accent' : 'hover:text-fg'}`}
        >
          <ListOrdered size={11} />
          索引
        </button>
        <button
          onClick={onOpenContext}
          aria-label="上下文检视"
          title={activeId ? '在右侧面板查看当前会话的系统提示词与上下文' : '打开右侧面板（当前无活动会话，将显示引导）'}
          className="flex items-center gap-1 rounded px-1 py-px transition-colors hover:text-fg"
        >
          <ScrollText size={11} />
          检视
        </button>
        <span
          className="flex items-center gap-1 text-fg-muted/80"
          title="write/edit 改动被重定向到 .staging/ 暂存区，diff 审核通过后才写入真实知识库（仅 wiki/ 目录）"
        >
          <ShieldCheck size={11} />
          审核门
        </span>
        <button
          onClick={onCompact}
          disabled={!activeId || busy}
          title="压缩当前会话上下文（/compact）"
          className="flex items-center gap-1 rounded px-1 py-px transition-colors hover:text-fg disabled:cursor-default disabled:opacity-40"
        >
          <Minimize2 size={11} />
          压缩
        </button>
      </span>
    </div>
  )
}
