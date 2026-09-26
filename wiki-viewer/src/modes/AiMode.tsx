import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Bot, FolderTree, HeartPulse, Moon, Settings2, Sun } from 'lucide-react'
import ModeSwitch from '@/components/ModeSwitch'
import Brand from '@/components/Brand'
import ChatWindow, { type Msg } from '@/components/ai/ChatWindow'
import ChatInput from '@/components/ai/ChatInput'
import SessionSidebar from '@/components/ai/SessionSidebar'
import KnowledgePanel from '@/components/ai/KnowledgePanel'
import FileExplorer from '@/components/ai/FileExplorer'
import PreviewPanel from '@/components/ai/PreviewPanel'
import SettingsPanel, { type ModelChoice } from '@/components/ai/SettingsPanel'
import ChatSettings, { CHAT_PADY, DEFAULT_CHAT_CFG, type ChatCfg } from '@/components/ai/ChatSettings'
import {
  agentHealth,
  applyStaging,
  chat,
  compactSession,
  deleteSession,
  discardStaging,
  getModels,
  getSkills,
  getStagingDetail,
  getSessionMessages,
  listSessions,
  renameSession,
  runTask,
  saveOutput,
  type AgentStreamEvent,
  type SessionInfo,
  type SkillInfo,
  type TurnView,
} from '@/lib/agent'
import type { AgentTask, WikiPage } from '@/types'
import { version as VIEWER_VERSION } from '../../package.json'

interface Props {
  theme: 'dark' | 'light'
  setTheme: (fn: (t: 'dark' | 'light') => 'dark' | 'light') => void
  onSwitchToWiki: () => void
  /** 阅读模式发起的任务（摄取/修复），进入后自动执行 */
  pendingTask: AgentTask | null
  onTaskConsumed: () => void
  onOpenWikiPage: (p: WikiPage) => void
}

type LeftTab = 'sessions' | 'files' | 'knowledge' | 'settings'

const TABS: { key: LeftTab; label: string; icon: typeof Bot }[] = [
  { key: 'sessions', label: '会话', icon: Bot },
  { key: 'knowledge', label: '知识库', icon: HeartPulse },
  { key: 'files', label: '文件', icon: FolderTree },
  { key: 'settings', label: '设置', icon: Settings2 },
]

export default function AiMode({ theme, setTheme, onSwitchToWiki, pendingTask, onTaskConsumed, onOpenWikiPage }: Props) {
  const [online, setOnline] = useState<boolean | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sessionName, setSessionName] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [usage, setUsage] = useState<{ cost: number; tokens: number | null } | null>(null)
  const [leftTab, setLeftTab] = useState<LeftTab>('sessions')
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [model, setModel] = useState<ModelChoice | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('wv-ai-model') ?? 'null')
    } catch {
      return null
    }
  })
  const [skills, setSkills] = useState<SkillInfo[]>([])
  // pi 版本（空会话品牌行右侧展示，pi-web 同款）
  const [piVersion, setPiVersion] = useState<string | null>(null)
  // server 端 SDK 解析出的默认模型名（无会话级覆盖且无 turn 回报时展示）
  const [defaultModelName, setDefaultModelName] = useState<string | null>(null)
  // 对话流排版（宽度百分比 + 上下留白，持久化 wv-ai-chatcfg）
  const [chatCfg, setChatCfg] = useState<ChatCfg>(() => {
    try {
      return { ...DEFAULT_CHAT_CFG, ...(JSON.parse(localStorage.getItem('wv-ai-chatcfg') ?? 'null') ?? {}) }
    } catch {
      return DEFAULT_CHAT_CFG
    }
  })
  const updateChatCfg = (v: ChatCfg) => {
    setChatCfg(v)
    localStorage.setItem('wv-ai-chatcfg', JSON.stringify(v))
  }
  // 思考强度（会话级，持久化）与最近一次 turn 回报的模型名
  const [thinkingLevel, setThinkingLevel] = useState<string>(() => localStorage.getItem('wv-ai-thinking') || 'medium')
  const [lastModelName, setLastModelName] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  busyRef.current = busy
  const startedTask = useRef<AgentTask | null>(null)

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await listSessions())
    } catch {
      /* server 离线时静默 */
    }
  }, [])

  // 挂载时探测 server 并加载会话列表 / skills
  useEffect(() => {
    agentHealth().then((h) => {
      setOnline(!!h)
      if (h) {
        setPiVersion(h.piVersion ?? null)
        refreshSessions()
        getModels()
          .then((r) => setDefaultModelName(r.defaultModel?.name || r.defaultModel?.id || null))
          .catch(() => {})
        getSkills()
          .then(setSkills)
          .catch(() => setSkills([]))
      }
    })
  }, [refreshSessions])

  /** 更新最后一条 assistant 消息 */
  const patchAssistant = (fn: (m: Extract<Msg, { role: 'assistant' }>) => Msg) =>
    setMsgs((all) => {
      const next = [...all]
      for (let i = next.length - 1; i >= 0; i--)
        if (next[i].role === 'assistant') {
          next[i] = fn(next[i] as Extract<Msg, { role: 'assistant' }>)
          break
        }
      return next
    })

  /** 更新最后一条 assistant 的最后一个 turn（不存在则创建） */
  const patchTurn = (fn: (t: TurnView) => TurnView) =>
    patchAssistant((m) => {
      const turns = [...m.turns]
      if (!turns.length) turns.push({ thinking: '', tools: [], text: '' })
      turns[turns.length - 1] = fn(turns[turns.length - 1])
      return { ...m, turns }
    })

  const runStream = async (
    label: string,
    run: (onEvent: (e: AgentStreamEvent) => void, signal: AbortSignal) => Promise<void>,
    assistantSeed?: Partial<Extract<Msg, { role: 'assistant' }>>,
  ) => {
    setMsgs((m) => [
      ...m,
      { role: 'user', text: label, ts: Date.now() },
      { role: 'assistant', turns: [], ts: Date.now(), ...assistantSeed },
    ])
    setBusy(true)
    const ctl = new AbortController()
    abortRef.current = ctl
    const onEvent = (e: AgentStreamEvent) => {
      if (e.type === 'turnstart')
        patchAssistant((m) => ({ ...m, turns: [...m.turns, { thinking: '', tools: [], text: '' }] }))
      else if (e.type === 'delta') patchTurn((t) => ({ ...t, text: t.text + e.text }))
      else if (e.type === 'thinking') patchTurn((t) => ({ ...t, thinking: t.thinking + e.text }))
      else if (e.type === 'session') {
        setActiveId(e.sessionId)
        setSessionName(e.name)
        refreshSessions()
      } else if (e.type === 'usage')
        setUsage({
          cost: e.cost,
          tokens: e.contextUsage && typeof e.contextUsage.tokens === 'number' ? e.contextUsage.tokens : null,
        })
      else if (e.type === 'turn') {
        patchTurn((t) => ({ ...t, model: e.model ?? t.model, usage: e.usage, cost: e.cost }))
        if (e.model) setLastModelName(e.model)
      }
      else if (e.type === 'tool') {
        if (e.state === 'start')
          patchTurn((t) => ({
            ...t,
            tools: [...t.tools, { id: e.id ?? null, name: e.name, args: e.args ?? null, running: true }],
          }))
        else
          patchTurn((t) => {
            const tools = [...t.tools]
            let idx = tools.findIndex((x) => x.id != null && x.id === e.id)
            if (idx < 0) for (let k = tools.length - 1; k >= 0; k--) if (tools[k].running) { idx = k; break }
            if (idx >= 0)
              tools[idx] = {
                ...tools[idx],
                running: false,
                isError: e.isError,
                durationMs: e.durationMs ?? null,
                result: e.result ?? null,
              }
            return { ...t, tools }
          })
      } else if (e.type === 'diffs')
        setMsgs((m) => [...m, { role: 'diffs', sessionId: e.sessionId, mode: e.mode, files: e.files, state: 'pending' }])
      else if (e.type === 'error') patchAssistant((m) => ({ ...m, error: e.message }))
    }
    try {
      await run(onEvent, ctl.signal)
      refreshSessions()
    } catch (err) {
      if (!ctl.signal.aborted) patchAssistant((m) => ({ ...m, error: String((err as Error)?.message || err) }))
    } finally {
      abortRef.current = null
      setBusy(false)
    }
  }

  const send = () => {
    const q = input.trim()
    if (!q || busy || online !== true) return
    // /name <新名称>：重命名当前会话，不发送消息
    const nameM = q.match(/^\/name\s+(.+)$/)
    if (nameM) {
      setInput('')
      if (!activeId) {
        setMsgs((m) => [...m, { role: 'assistant', turns: [{ thinking: '', tools: [], text: '当前没有活动会话，先发起对话再命名。' }], ts: Date.now() }])
        return
      }
      void doRename(activeId, nameM[1].trim())
      return
    }
    setInput('')
    void runStream(
      q,
      (onEvent, signal) =>
        chat(
          {
            sessionId: activeId,
            message: q,
            model,
            thinkingLevel,
          },
          onEvent,
          signal,
        ),
      { question: q },
    )
  }

  /** 思考强度循环切换 */
  const cycleThinking = () => {
    const order = ['off', 'low', 'medium', 'high']
    const next = order[(order.indexOf(thinkingLevel) + 1) % order.length] ?? 'medium'
    setThinkingLevel(next)
    localStorage.setItem('wv-ai-thinking', next)
  }

  /** 输入区内置命令：/new /compact /clear */
  const handleCommand = (cmd: 'new' | 'compact' | 'clear') => {
    if (cmd === 'new') newSession()
    else if (cmd === 'clear') setMsgs([])
    else if (cmd === 'compact') {
      if (!activeId) {
        setMsgs((m) => [...m, { role: 'assistant', turns: [{ thinking: '', tools: [], text: '当前没有活动会话，无需压缩。' }], ts: Date.now() }])
        return
      }
      compactSession(activeId)
        .then((r) =>
          setMsgs((m) => [
            ...m,
            {
              role: 'assistant',
              turns: [
                {
                  thinking: '',
                  tools: [],
                  text: `上下文已压缩${r.tokensBefore != null ? `（压缩前约 ${r.tokensBefore.toLocaleString('en-US')} tokens）` : ''}。`,
                },
              ],
              ts: Date.now(),
            },
          ]),
        )
        .catch((e) =>
          setMsgs((m) => [...m, { role: 'assistant', turns: [{ thinking: '', tools: [], text: `压缩失败：${String((e as Error)?.message || e)}` }], ts: Date.now() }]),
        )
    }
  }

  const startTask = useCallback(
    (task: AgentTask) => {
      if (task.type === 'ingest')
        void runStream(`摄取原始资料：raw/${task.rawFile}`, (onEvent, signal) =>
          runTask({ mode: 'ingest', rawFile: task.rawFile }, onEvent, signal),
        )
      else
        void runStream(`修复 ${task.issues.length} 项健康问题`, (onEvent, signal) =>
          runTask({ mode: 'lint', issues: task.issues }, onEvent, signal),
        )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId],
  )

  // 阅读模式带来的任务：自动发起（消费后清空，避免重复触发）
  useEffect(() => {
    if (!pendingTask || busyRef.current || online !== true) return
    if (startedTask.current === pendingTask) return
    startedTask.current = pendingTask
    onTaskConsumed()
    startTask(pendingTask)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTask, online])

  const switchSession = async (id: string) => {
    if (busy || id === activeId) return
    setActiveId(id)
    setUsage(null)
    try {
      const r = await getSessionMessages(id)
      setSessionName(r.name)
      setMsgs(
        r.messages.map((m) =>
          m.role === 'user'
            ? { role: 'user' as const, text: m.text ?? '', ts: m.ts ? new Date(m.ts).getTime() : Date.now() }
            : {
                role: 'assistant' as const,
                turns: m.turns ?? [{ thinking: '', tools: [], text: m.text ?? '' }],
                ts: m.ts ? new Date(m.ts).getTime() : Date.now(),
              },
        ),
      )
    } catch (e) {
      setMsgs([{ role: 'assistant', turns: [], ts: Date.now(), error: String((e as Error)?.message || e) }])
    }
  }

  const newSession = () => {
    if (busy) return
    setActiveId(null)
    setSessionName(null)
    setMsgs([])
    setUsage(null)
  }

  const doRename = async (id: string, name: string) => {
    try {
      await renameSession(id, name)
      if (id === activeId) setSessionName(name)
      refreshSessions()
    } catch {
      /* 忽略 */
    }
  }

  const doDelete = async (id: string) => {
    try {
      await deleteSession(id)
      if (id === activeId) newSession()
      refreshSessions()
    } catch {
      /* 忽略 */
    }
  }

  const actOnDiffs = async (i: number, action: 'apply' | 'discard') => {
    const m = msgs[i]
    if (m.role !== 'diffs' || m.state !== 'pending') return
    setMsgs((all) =>
      all.map((x, j) => (j === i && x.role === 'diffs' ? { ...x, note: action === 'apply' ? '正在应用到知识库…' : '正在丢弃…' } : x)),
    )
    try {
      if (action === 'apply') {
        const r = await applyStaging(m.sessionId)
        setMsgs((all) =>
          all.map((x, j) =>
            j === i && x.role === 'diffs'
              ? { ...x, state: 'applied', note: `已应用 ${r.changed.length} 个文件${r.synced ? ' · 快照已同步，浏览器即将刷新数据' : ' · 快照同步失败，请手动 npm run sync'}` }
              : x,
          ),
        )
      } else {
        await discardStaging(m.sessionId)
        setMsgs((all) => all.map((x, j) => (j === i && x.role === 'diffs' ? { ...x, state: 'discarded', note: '已丢弃，知识库未发生任何变化' } : x)))
      }
    } catch (e) {
      setMsgs((all) => all.map((x, j) => (j === i && x.role === 'diffs' ? { ...x, note: `操作失败：${String((e as Error)?.message || e)}` } : x)))
    }
  }

  const saveAnswer = async (i: number) => {
    const m = msgs[i]
    if (m.role !== 'assistant') return
    const fullText = m.turns.map((t) => t.text).join('\n\n').trim()
    if (!fullText || m.savedAs) return
    const title = (m.question || '知识库问答').slice(0, 40)
    try {
      const r = await saveOutput({ title, content: fullText, question: m.question })
      setMsgs((all) => all.map((x, j) => (j === i && x.role === 'assistant' ? { ...x, savedAs: r.path } : x)))
    } catch (e) {
      setMsgs((all) => all.map((x, j) => (j === i && x.role === 'assistant' ? { ...x, saveError: String((e as Error)?.message || e) } : x)))
    }
  }

  /** 从知识库面板恢复暂存待审会话：拉完整 diff 插入审核卡 */
  const showStaging = async (id: string, mode: string) => {
    try {
      const r = await getStagingDetail(id)
      setMsgs((m) => [...m, { role: 'diffs', sessionId: r.sessionId, mode, files: r.files, state: 'pending' }])
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', turns: [], ts: Date.now(), error: `恢复暂存会话失败：${String((e as Error)?.message || e)}` }])
    }
  }

  const offline = online === false
  // pi-web 同款：新会话且无消息时输入区垂直居中，有内容后回到底端
  const isEmptyNew = msgs.length === 0 && !busy

  const chatInput = (
    <ChatInput
      value={input}
      onChange={setInput}
      onSend={send}
      onStop={() => abortRef.current?.abort()}
      busy={busy}
      disabled={offline}
      modelDisplay={model?.id ?? lastModelName ?? defaultModelName ?? '默认模型'}
      onOpenSettings={() => setLeftTab('settings')}
      thinkingLevel={thinkingLevel}
      onThinkingCycle={cycleThinking}
      onCompact={() => handleCommand('compact')}
      onCommand={handleCommand}
      skills={skills}
    />
  )

  return (
    <div className="flex h-full">
      {/* 左侧栏：全高到顶（与阅读模式 Sidebar 同结构：品牌区在最顶） */}
      <aside className="flex w-side shrink-0 flex-col border-r border-line bg-ink-soft">
        <Brand />
        <div className="flex shrink-0 gap-1 border-b border-line px-2 py-1.5">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setLeftTab(key)}
              title={label}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[11.5px] transition-colors ${
                leftTab === key ? 'bg-accent/10 font-medium text-accent' : 'text-fg-muted hover:bg-surface-raised hover:text-fg-secondary'
              }`}
            >
              <Icon size={12} strokeWidth={2} />
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          {leftTab === 'sessions' ? (
            <SessionSidebar
              sessions={sessions}
              activeId={activeId}
              busy={busy}
              online={online}
              onSelect={switchSession}
              onNew={newSession}
              onRename={doRename}
              onDelete={doDelete}
            />
          ) : leftTab === 'knowledge' ? (
            <KnowledgePanel onStartTask={startTask} onShowStaging={showStaging} busy={busy} online={online} />
          ) : leftTab === 'files' ? (
            <FileExplorer onPreview={setPreviewPath} activePath={previewPath} online={online} />
          ) : (
            <SettingsPanel
              model={model}
              onModel={(m) => {
                setModel(m)
                localStorage.setItem('wv-ai-model', JSON.stringify(m))
              }}
              online={online}
            />
          )}
        </div>
      </aside>

      {/* 右列：TopBar + 主体 */}
      <div className="flex min-w-0 flex-1 flex-col">
      {/* TopBar */}
      <header className="flex h-[46px] shrink-0 items-center gap-3 border-b border-line bg-ink-soft px-3">
        {/* 模式切换（与阅读模式顶栏同款控件） */}
        <ModeSwitch mode="ai" onSwitch={onSwitchToWiki} />

        {/* 当前会话 */}
        <div className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">
          <span className="text-fg-secondary">{sessionName || (busy ? '新会话（进行中）' : '新会话')}</span>
          {activeId && <span className="ml-2 font-mono text-[10.5px] opacity-50">{activeId.slice(0, 8)}</span>}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-fg-muted">
          <span
            className={`flex items-center gap-1.5 ${offline ? 'text-cat-concept' : ''}`}
            title={offline ? 'agent-server 离线' : 'pi 智能体服务在线'}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${online === null ? 'bg-fg-muted/40' : offline ? 'bg-cat-concept' : 'bg-cat-entity'}`} />
            {offline ? '离线' : '在线'}
          </span>
          {usage && (
            <span className="font-mono tabular-nums" title="当前会话累计成本 / 上下文 token 估算">
              ${usage.cost.toFixed(4)}
              {usage.tokens != null && <span className="ml-1.5 opacity-70">{(usage.tokens / 1000).toFixed(1)}k tok</span>}
            </span>
          )}
          <ChatSettings value={chatCfg} onChange={updateChatCfg} />
          <button
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
            title={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
            className="rounded-md border border-line bg-surface p-1.5 text-fg-secondary transition-colors hover:border-accent/50 hover:text-accent"
          >
            {theme === 'dark' ? <Sun size={14} strokeWidth={1.9} /> : <Moon size={14} strokeWidth={1.9} />}
          </button>
        </div>
      </header>

        <div className="flex min-h-0 flex-1">
        {/* 中央：聊天主窗口（--chat-w / --chat-pad-y 由排版设置下发） */}
        <main
          className="flex min-w-0 flex-1 flex-col"
          style={{ '--chat-w': `${chatCfg.pct}%`, '--chat-pad-y': CHAT_PADY[chatCfg.padY] } as CSSProperties}
        >
          {offline ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="max-w-sm rounded-card border border-line bg-surface p-5 text-[12.5px] leading-6 text-fg-secondary">
                <div className="mb-1.5 flex items-center gap-2 text-[14px] font-semibold text-fg">
                  <Bot size={16} className="text-cat-concept" />
                  agent-server 未启动
                </div>
                <p className="text-fg-muted">工作台需要本地运行 pi 智能体服务（所有写入经 diff 审核门）。在项目根目录执行：</p>
                <pre className="mt-2 overflow-x-auto rounded-md border border-line bg-ink-soft p-2.5 font-mono text-[11.5px] text-accent-glow">
                  {'cd agent-server\nnpm install   # 首次\nnpm start'}
                </pre>
                <p className="mt-2 text-fg-muted">启动后刷新本页即可（需 pi 0.86+ 且已完成 pi login）。</p>
              </div>
            </div>
          ) : isEmptyNew ? (
            <>
              {/* 空会话：品牌行 + 输入框整体垂直居中（上下 flex-1 夹心，pi-web 同款） */}
              <div className="min-h-0 flex-1" />
              <div className="mb-3 w-full shrink-0 px-5">
                <div className="mx-auto flex max-w-full items-center justify-between gap-3 font-mono" style={{ width: 'var(--chat-w, 72%)' }}>
                  <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden leading-tight">
                    <svg width="32" height="32" viewBox="0 0 26 26" aria-hidden="true" className="shrink-0">
                      <circle cx="13" cy="6" r="2.6" fill="hsl(42 52% 62%)" />
                      <circle cx="5.5" cy="18" r="2.2" fill="hsl(202 48% 60%)" />
                      <circle cx="20.5" cy="18" r="2.2" fill="hsl(272 34% 64%)" />
                      <circle cx="13" cy="13.5" r="1.7" fill="hsl(28 62% 58%)" />
                      <path d="M13 6 5.5 18M13 6l7.5 12M5.5 18h15M13 13.5 13 6M13 13.5 5.5 18M13 13.5l7.5 4.5" stroke="hsl(160 10% 42%)" strokeWidth="0.9" opacity="0.65" />
                    </svg>
                    <span className="shrink-0 whitespace-nowrap text-[22px] font-bold text-fg">LLM Wiki</span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] text-fg-muted">
                    <span>
                      viewer <span className="text-fg">v{VIEWER_VERSION}</span>
                    </span>
                    <span>
                      pi <span className="text-fg">v{piVersion ?? '—'}</span>
                    </span>
                  </div>
                </div>
              </div>
              {chatInput}
              <div className="min-h-0 flex-1" />
            </>
          ) : (
            <>
              <ChatWindow
                msgs={msgs}
                busy={busy}
                onLink={onOpenWikiPage}
                onSave={saveAnswer}
                onApply={(i) => actOnDiffs(i, 'apply')}
                onDiscard={(i) => actOnDiffs(i, 'discard')}
              />
              {chatInput}
            </>
          )}
        </main>

        {/* 右侧预览面板（文件浏览打开） */}
        {previewPath && !offline && <PreviewPanel path={previewPath} onClose={() => setPreviewPath(null)} />}
        </div>
      </div>
    </div>
  )
}
