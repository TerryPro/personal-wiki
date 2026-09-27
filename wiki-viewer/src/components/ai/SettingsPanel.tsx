import { useEffect, useState } from 'react'
import { Check, Cpu, Loader2, Plug, Puzzle, Wrench } from 'lucide-react'
import { getExtensions, getModels, getSkills, getTools, setModeTools, type ExtensionsPayload, type ModelInfo, type SkillInfo, type ToolCatalogItem } from '@/lib/agent'

export interface ModelChoice {
  provider: string
  id: string
}

interface Props {
  model: ModelChoice | null
  onModel: (m: ModelChoice | null) => void
  online: boolean | null
}

const TOOL_MODES: [string, string][] = [
  ['query', '问答 / 工作'],
  ['ingest', '摄取'],
  ['lint', '修复'],
]

/** 设置工作区：会话默认模型选择 + Skills 只读清单（server 解析 .pi/skills frontmatter） */
export default function SettingsPanel({ model, onModel, online }: Props) {
  const [models, setModels] = useState<ModelInfo[] | null>(null)
  const [defaultModel, setDefaultModel] = useState<ModelInfo | null>(null)
  const [skills, setSkills] = useState<SkillInfo[] | null>(null)
  const [exts, setExts] = useState<ExtensionsPayload | null>(null)
  const [tools, setTools] = useState<{ catalog: ToolCatalogItem[]; modes: Record<string, string[]> } | null>(null)
  const [toolBusy, setToolBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (online !== true) return
    getModels()
      .then((r) => {
        setModels(r.models)
        setDefaultModel(r.defaultModel ?? null)
      })
      .catch((e) => setError(String((e as Error)?.message || e)))
    getSkills()
      .then(setSkills)
      .catch(() => setSkills([]))
    getExtensions()
      .then(setExts)
      .catch(() => setExts({ builtin: [], extensions: [], errors: [] }))
    getTools()
      .then(setTools)
      .catch(() => setTools({ catalog: [], modes: {} }))
  }, [online])

  /** 开关某模式的工具（服务端校验 + 持久化，已缓存会话重建后生效） */
  const toggleTool = async (mode: string, name: string) => {
    if (!tools || toolBusy) return
    const cur = tools.modes[mode] ?? []
    const next = cur.includes(name) ? cur.filter((t) => t !== name) : [...cur, name]
    if (!next.length) return
    setToolBusy(`${mode}:${name}`)
    try {
      const r = await setModeTools(mode, next)
      setTools((s) => (s ? { ...s, modes: r.modes } : s))
    } catch {
      /* 服务端拒绝时保持原状 */
    } finally {
      setToolBusy(null)
    }
  }

  // 当前生效模型：会话级覆盖优先，否则 server 解析的默认模型
  const override = model && models?.find((m) => m.provider === model.provider && m.id === model.id)
  const effective = model
    ? { name: override?.name ?? model.id, id: `${model.provider}/${model.id}`, overridden: true }
    : defaultModel
      ? { name: defaultModel.name, id: `${defaultModel.provider}/${defaultModel.id}`, overridden: false }
      : null

  if (online === false)
    return <div className="px-3 py-6 text-center text-[11.5px] text-fg-muted">agent-server 离线，无法读取配置</div>

  return (
    <div className="h-full overflow-y-auto">
      {/* 模型 */}
      <div className="border-b border-line px-3 py-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
          <Cpu size={11} />
          会话模型
        </div>
        {error ? (
          <div className="text-[11.5px] text-cat-concept">{error}</div>
        ) : models == null ? (
          <div className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
            <Loader2 size={11} className="animate-spin" />
            读取模型列表…
          </div>
        ) : (
          <>
            {/* 当前生效模型摘要 */}
            <div className="mb-2 flex items-center gap-2 rounded-md border border-line bg-ink-soft px-2.5 py-2">
              <Cpu size={13} className="shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-fg">{effective?.name ?? '未解析'}</div>
                {effective && <div className="truncate font-mono text-[10px] text-fg-muted">{effective.id}</div>}
              </div>
              <span
                className={`shrink-0 rounded border px-1 py-px text-[9.5px] ${
                  effective?.overridden
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-line bg-surface text-fg-muted'
                }`}
              >
                {effective?.overridden ? '会话覆盖' : '默认'}
              </span>
            </div>
            <div className="space-y-1">
              <button
                onClick={() => onModel(null)}
                className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-surface-raised ${
                  model == null ? 'bg-accent/10 text-accent' : 'text-fg-secondary'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">
                  跟随默认{defaultModel ? `（${defaultModel.name}）` : ''}
                </span>
                {model == null && <Check size={12} className="shrink-0" />}
              </button>
              {models.map((m) => {
                const active = model?.provider === m.provider && model?.id === m.id
                const isDefault = defaultModel?.provider === m.provider && defaultModel?.id === m.id
                return (
                  <button
                    key={`${m.provider}/${m.id}`}
                    onClick={() => onModel(active ? null : { provider: m.provider, id: m.id })}
                    className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-surface-raised ${
                      active ? 'bg-accent/10 text-accent' : 'text-fg-secondary'
                    }`}
                    title={`${m.provider} / ${m.id}`}
                  >
                    <span className="shrink-0 rounded border border-line bg-ink-soft px-1 py-px font-mono text-[9.5px] text-fg-muted">
                      {m.provider}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    {isDefault && (
                      <span className="shrink-0 rounded border border-line bg-ink-soft px-1 py-px text-[9.5px] text-fg-muted">
                        默认
                      </span>
                    )}
                    {active && <Check size={12} className="shrink-0" />}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* 工具 */}
      <div className="border-b border-line px-3 py-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
          <Wrench size={11} />
          工具
        </div>
        {tools == null ? (
          <div className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
            <Loader2 size={11} className="animate-spin" />
            读取工具清单…
          </div>
        ) : (
          <div className="space-y-1.5">
            {TOOL_MODES.map(([mode, label]) => (
              <div key={mode} className="rounded-md border border-line bg-surface px-2.5 py-2">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="text-[11.5px] font-medium text-fg">{label}</span>
                  <span className="ml-auto shrink-0 rounded border border-line bg-ink-soft px-1 py-px font-mono text-[9.5px] text-fg-muted">
                    {(tools.modes[mode] ?? []).length} 项
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {tools.catalog.map((t) => {
                    const on = (tools.modes[mode] ?? []).includes(t.name)
                    const busy = toolBusy === `${mode}:${t.name}`
                    return (
                      <button
                        key={t.name}
                        onClick={() => toggleTool(mode, t.name)}
                        title={`${t.description}${on ? '（点击禁用）' : '（点击启用）'}`}
                        className={`rounded border px-1 py-px font-mono text-[9.5px] transition-colors ${
                          busy
                            ? 'border-line opacity-50'
                            : on
                              ? 'border-accent/40 bg-accent/10 text-accent hover:border-cat-concept/50 hover:bg-cat-concept/10 hover:text-cat-concept'
                              : 'border-line bg-ink-soft text-fg-muted/60 hover:border-accent/40 hover:text-fg-secondary'
                        }`}
                      >
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 插件（extensions） */}
      <div className="border-b border-line px-3 py-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
          <Plug size={11} />
          插件（Extensions）
        </div>
        {exts == null ? (
          <div className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
            <Loader2 size={11} className="animate-spin" />
            读取插件清单…
          </div>
        ) : (
          <div className="space-y-1.5">
            {exts.builtin.map((b) => (
              <div key={b.name} className="rounded-md border border-line bg-surface px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-mono text-[11.5px] font-medium text-fg">{b.name}</span>
                  <span className="ml-auto shrink-0 rounded border border-accent/40 bg-accent/10 px-1 py-px text-[9.5px] text-accent">内置</span>
                </div>
                <p className="mt-1 text-[11px] leading-[1.6] text-fg-muted">{b.description}</p>
              </div>
            ))}
            {exts.extensions.map((e) => (
              <div key={e.path} className="rounded-md border border-line bg-surface px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-mono text-[11.5px] font-medium text-fg" title={e.path}>
                    {e.path}
                  </span>
                  <span
                    className={`ml-auto shrink-0 rounded border px-1 py-px text-[9.5px] ${
                      e.scope === 'project'
                        ? 'border-cat-entity/40 bg-cat-entity/10 text-cat-entity'
                        : 'border-line bg-ink-soft text-fg-muted'
                    }`}
                  >
                    {e.scope === 'project' ? '项目' : e.scope}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {e.tools.length > 0 && (
                    <span className="rounded border border-line bg-ink-soft px-1 py-px font-mono text-[9.5px] text-fg-muted">
                      {e.tools.length} 工具
                    </span>
                  )}
                  {e.commands.length > 0 && (
                    <span className="rounded border border-line bg-ink-soft px-1 py-px font-mono text-[9.5px] text-fg-muted">
                      {e.commands.length} 命令
                    </span>
                  )}
                  {e.tools.length === 0 && e.commands.length === 0 && (
                    <span className="rounded border border-line bg-ink-soft px-1 py-px font-mono text-[9.5px] text-fg-muted">仅事件钩子</span>
                  )}
                </div>
              </div>
            ))}
            {exts.errors.map((x) => (
              <div key={x.path} className="rounded-md border border-cat-concept/40 bg-cat-concept/10 px-2.5 py-1.5 text-[11px] leading-[1.6] text-cat-concept">
                {x.path}：{x.error}
              </div>
            ))}
            {exts.builtin.length === 0 && exts.extensions.length === 0 && exts.errors.length === 0 && (
              <div className="text-[11.5px] text-fg-muted">无插件</div>
            )}
          </div>
        )}
      </div>

      {/* Skills */}
      <div className="px-3 py-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
          <Puzzle size={11} />
          Skills
        </div>
        {skills == null ? (
          <div className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
            <Loader2 size={11} className="animate-spin" />
            读取中…
          </div>
        ) : skills.length === 0 ? (
          <div className="text-[11.5px] text-fg-muted">未发现项目级 skill（llmwiki/.pi/skills/）</div>
        ) : (
          <div className="space-y-1.5">
            {skills.map((s) => (
              <div key={`${s.source}/${s.name}`} className="rounded-md border border-line bg-surface px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-mono text-[11.5px] font-medium text-fg">{s.name}</span>
                  <span
                    className={`ml-auto shrink-0 rounded border px-1 py-px text-[9.5px] ${
                      s.source === 'project'
                        ? 'border-cat-entity/40 bg-cat-entity/10 text-cat-entity'
                        : 'border-line bg-ink-soft text-fg-muted'
                    }`}
                  >
                    {s.source === 'project' ? '项目' : '全局'}
                  </span>
                </div>
                {s.description && (
                  <p className="mt-1 line-clamp-3 text-[11px] leading-[1.6] text-fg-muted">{s.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
