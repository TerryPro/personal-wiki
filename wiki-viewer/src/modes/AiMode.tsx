import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { BookOpen, Bot, FileDiff, FileText, FolderTree, ListOrdered, Moon, PanelLeft, PanelRight, Settings2, Sun } from 'lucide-react'
import ModeSwitch from '@/components/ModeSwitch'
import VaultSwitcher from '@/components/VaultSwitcher'
import Brand from '@/components/Brand'
import ChatWindow from '@/components/ai/ChatWindow'
import ChatInput from '@/components/ai/ChatInput'
import SessionSidebar from '@/components/ai/SessionSidebar'
import KnowledgePanel from '@/components/ai/KnowledgePanel'
import FileExplorer from '@/components/ai/FileExplorer'
import PreviewPanel from '@/components/ai/PreviewPanel'
import ReviewPanel from '@/components/ai/ReviewPanel'
import AgentInfo from '@/components/ai/AgentInfo'
import SessionIndex, { type IndexMode } from '@/components/ai/SessionIndex'
import { loadVault } from '@/lib/wiki'
import SettingsPanel, { type ModelChoice } from '@/components/ai/SettingsPanel'
import ChatSettings, { CHAT_PADY, DEFAULT_CHAT_CFG, type ChatCfg } from '@/components/ai/ChatSettings'
import {
  agentHealth,
  chat,
  compactSession,
  deleteSession,
  getModels,
  getSkills,
  getSessionMessages,
  listSessions,
  listStagingSessions,
  renameSession,
  runTask,
  saveOutput,
  type SessionInfo,
  type SkillInfo,
  type StagingSessionInfo,
} from '@/lib/agent'
import {
  addDiffsListener,
  appendAssistantNote,
  clearMsgs,
  dismissReview,
  getState as getStreamState,
  isReviewDismissed,
  loadSession,
  patchMsg,
  resetForNewSession,
  runStream as storeRunStream,
  setDiffsState,
  setSessionName as setStoreSessionName,
  setUsage as setStoreUsage,
  stop as stopStream,
  subscribe as subscribeStream,
  undismissReview,
} from '@/lib/agentStream'
import type { AgentTask, VaultEntry, WikiPage } from '@/types'
import { version as VIEWER_VERSION } from '../../package.json'

interface Props {
  theme: 'dark' | 'light'
  setTheme: (fn: (t: 'dark' | 'light') => 'dark' | 'light') => void
  onSwitchToWiki: () => void
  /** 阅读模式发起的任务（摎取/修复），进入后自动执行 */
  pendingTask: AgentTask | null
  onTaskConsumed: () => void
  onOpenWikiPage: (p: WikiPage) => void
  /** 多知识库 */
  vaults: VaultEntry[]
  activeVault: string
  onSwitchVault: (id: string) => void
  onNewVault: () => void
  /** App 层 toast 点击后请求打开的审查会话 */
  reviewRequest: string | null
  onReviewRequestConsumed: () => void
}

type LeftTab = 'sessions' | 'files' | 'settings'
type RightTab = 'knowledge' | 'preview' | 'review'

const TABS: { key: LeftTab; label: string; icon: typeof Bot }[] = [
  { key: 'sessions', label: '会话', icon: Bot },
  { key: 'files', label: '文件', icon: FolderTree },
  { key: 'settings', label: '设置', icon: Settings2 },
]

export default function AiMode({ theme, setTheme, onSwitchToWiki, pendingTask, onTaskConsumed, onOpenWikiPage, vaults, activeVault, onSwitchVault, onNewVault, reviewRequest, onReviewRequestConsumed }: Props) {
  const [online, setOnline] = useState<boolean | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [input, setInput] = useState('')
  // 会话流状态来自模块级单例 store（切换模式卸载 AiMode 也不丢流）
  const snap = useSyncExternalStore(subscribeStream, getStreamState)
  const { msgs, busy, activeId, sessionName, usage, lastModelName } = snap
  const [leftTab, setLeftTab] = useState<LeftTab>('sessions')
  // 左栏展开/收拢（持久化），与阅读模式 PanelLeft 开关对齐
  const [leftOpen, setLeftOpen] = useState(() => localStorage.getItem('wv-panel-l-ai') !== '0')
  useEffect(() => localStorage.setItem('wv-panel-l-ai', leftOpen ? '1' : '0'), [leftOpen])
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  // 右栏 [知识|文档|审查] tab 与当前审查会话；宽度拖拽持久化；rightOpen 为右栏整体开关
  const [rightTab, setRightTab] = useState<RightTab>(() => {
    const v = localStorage.getItem('wv-right-tab')
    return v === 'review' || v === 'knowledge' ? v : 'preview'
  })
  useEffect(() => localStorage.setItem('wv-right-tab', rightTab), [rightTab])
  const [rightOpen, setRightOpen] = useState(() => localStorage.getItem('wv-panel-r-ai') === '1')
  useEffect(() => localStorage.setItem('wv-panel-r-ai', rightOpen ? '1' : '0'), [rightOpen])
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null)
  const [stagingPending, setStagingPending] = useState<StagingSessionInfo[]>([])
  // 对话索引：off 关闭 / mini 收缩 minimap / full 展开侧栏；默认 mini
  const [indexMode, setIndexMode] = useState<'off' | IndexMode>('mini')
  const [rightW, setRightW] = useState(() => {
    const n = Number(localStorage.getItem('wv-right-w'))
    return n >= 340 && n <= 760 ? n : 460
  })
  useEffect(() => localStorage.setItem('wv-right-w', String(rightW)), [rightW])
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

  const refreshPending = useCallback(async () => {
    try {
      setStagingPending(await listStagingSessions())
    } catch {
      setStagingPending([])
    }
  }, [])

  // 流内 session 事件 / 流结束 → 刷新侧栏会话列表 + 待审暂存
  useEffect(() => {
    if (snap.sessionsVersion > 0) {
      refreshSessions()
      refreshPending()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.sessionsVersion])

  // 任务流运行期间活刷新待审列表：暂存文件随 agent 写入逐个落盘，
  // 3s 节奏轮询使审查面板文件清单/徽标计数/知识面板暂存待审同步增量更新（不必等回合结束）
  useEffect(() => {
    if (!busy) return
    const t = setInterval(refreshPending, 3000)
    return () => clearInterval(t)
  }, [busy, refreshPending])

  // 挂载时探测 server 并加载会话列表 / skills；若有未关闭过的待审暂存则自动打开审查
  useEffect(() => {
    agentHealth().then(async (h) => {
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
        const pend = await listStagingSessions().catch(() => [] as StagingSessionInfo[])
        setStagingPending(pend)
        const target = pend.find((s) => !isReviewDismissed(s.id))
        if (target) openReview(target.id)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSessions])

  const send = () => {
    const q = input.trim()
    if (!q || busy || online !== true) return
    // /name <新名称>：重命名当前会话，不发送消息
    const nameM = q.match(/^\/name\s+(.+)$/)
    if (nameM) {
      setInput('')
      if (!activeId) {
        appendAssistantNote('当前没有活动会话，先发起对话再命名。')
        return
      }
      void doRename(activeId, nameM[1].trim())
      return
    }
    setInput('')
    void storeRunStream(
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
    else if (cmd === 'clear') clearMsgs()
    else if (cmd === 'compact') {
      if (!activeId) {
        appendAssistantNote('当前没有活动会话，无需压缩。')
        return
      }
      compactSession(activeId)
        .then((r) =>
          appendAssistantNote(`上下文已压缩${r.tokensBefore != null ? `（压缩前约 ${r.tokensBefore.toLocaleString('en-US')} tokens）` : ''}。`),
        )
        .catch((e) => appendAssistantNote(`压缩失败：${String((e as Error)?.message || e)}`))
    }
  }

  const startTask = useCallback(
    (task: AgentTask) => {
      // 任务永远新建独立会话：先清空视图，避免把新会话的流拼接到旧会话历史后面造成跨会话拼接假象
      resetForNewSession()
      if (task.type === 'ingest')
        void storeRunStream(`摄取原始资料：raw/${task.rawFile}`, (onEvent, signal) =>
          runTask({ mode: 'ingest', rawFile: task.rawFile }, onEvent, signal),
        )
      else if (task.type === 'batch-ingest') {
        // 批量摄取：走聊天 skill 路径（单会话顺序处理，写入同经审核门）；新建会话 + 消息原文作暂存 target 便于溯源
        const msg = `/skill:second-brain-ingest ${task.rawFiles.join(' ')}`
        void storeRunStream(
          msg,
          (onEvent, signal) => chat({ sessionId: null, message: msg, model, thinkingLevel }, onEvent, signal),
          { question: msg },
        )
      } else
        void storeRunStream(`修复 ${task.issues.length} 项健康问题`, (onEvent, signal) =>
          runTask({ mode: 'lint', issues: task.issues }, onEvent, signal),
        )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, model, thinkingLevel],
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
    try {
      const r = await getSessionMessages(id)
      loadSession(
        r.messages.map((m) =>
          m.role === 'user'
            ? { role: 'user' as const, text: m.text ?? '', ts: m.ts ? new Date(m.ts).getTime() : Date.now() }
            : {
                role: 'assistant' as const,
                turns: m.turns ?? [{ thinking: '', tools: [], text: m.text ?? '' }],
                ts: m.ts ? new Date(m.ts).getTime() : Date.now(),
              },
        ),
        id,
        r.name,
      )
      // 切换会话时同步该会话的实时用量（活跃缓存会话有值，冷会话为 null→占位）
      const cu = r.usage?.contextUsage
      setStoreUsage(
        r.usage
          ? {
              cost: r.usage.cost,
              tokens: cu && typeof cu.tokens === 'number' ? cu.tokens : null,
              contextWindow: cu && typeof cu.contextWindow === 'number' ? cu.contextWindow : null,
              percent: cu && typeof cu.percent === 'number' ? cu.percent : null,
            }
          : null,
      )
    } catch (e) {
      loadSession([{ role: 'assistant', turns: [], ts: Date.now(), error: String((e as Error)?.message || e) }], id, null)
      setStoreUsage(null)
    }
  }

  const newSession = () => {
    if (busy) return
    resetForNewSession()
  }

  const doRename = async (id: string, name: string) => {
    try {
      await renameSession(id, name)
      if (id === activeId) setStoreSessionName(name)
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

  /** 打开右栏审查面板（手动打开不受 dismissed 限制） */
  const openReview = useCallback((id: string) => {
    undismissReview(id)
    setReviewSessionId(id)
    setRightTab('review')
    setRightOpen(true)
  }, [])

  // diffs 事件 → 自动打开审查（跳过用户主动关闭过的）；卸载即解除监听
  useEffect(() => addDiffsListener((id) => {
    if (!isReviewDismissed(id)) openReview(id)
  }), [openReview])

  // App 层 toast 点击 → 打开指定审查会话
  useEffect(() => {
    if (reviewRequest) {
      openReview(reviewRequest)
      onReviewRequestConsumed()
    }
  }, [reviewRequest, openReview, onReviewRequestConsumed])

  /** 审查面板应用/丢弃后：更新聊天指针卡状态、解除 dismissed、收起审查并刷新待审；
   * apply 服务端已重跑 sync，这里重拉快照让消化队列/已消化清单/阅读模式实时刷新（不再依赖整页 reload） */
  const handleReviewApplied = (sessionId: string) => {
    setDiffsState(sessionId, 'applied', '已应用，快照已同步')
    undismissReview(sessionId)
    setReviewSessionId(null)
    refreshSessions()
    refreshPending()
    void loadVault(activeVault)
  }
  const handleReviewDiscarded = (sessionId: string) => {
    setDiffsState(sessionId, 'discarded', '已丢弃，知识库未发生任何变化')
    undismissReview(sessionId)
    setReviewSessionId(null)
    refreshPending()
  }

  /** 右栏左缘拖拽调宽 */
  const onRightDragStart = (e: ReactMouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = rightW
    const move = (ev: MouseEvent) => setRightW(Math.min(760, Math.max(340, startW + (startX - ev.clientX))))
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  const saveAnswer = async (i: number) => {
    const m = msgs[i]
    if (m.role !== 'assistant') return
    const fullText = m.turns.map((t) => t.text).join('\n\n').trim()
    if (!fullText || m.savedAs) return
    const title = (m.question || '知识库问答').slice(0, 40)
    try {
      const r = await saveOutput({ title, content: fullText, question: m.question })
      patchMsg(i, { savedAs: r.path })
      void loadVault(activeVault) // output/ 新增成品页，重拉快照
    } catch (e) {
      patchMsg(i, { saveError: String((e as Error)?.message || e) })
    }
  }

  /** 从知识库面板打开暂存待审会话的审查面板 */
  const showStaging = (id: string, _mode: string) => openReview(id)

  const offline = online === false
  // 待审文件总数（徽标显示）；会话数在悬停提示中补充
  const pendingFileCount = stagingPending.reduce((n, s) => n + s.files.length, 0)
  // pi-web 同款：新会话且无消息时输入区垂直居中，有内容后回到底端
  const isEmptyNew = msgs.length === 0 && !busy

  const chatInput = (
    <ChatInput
      value={input}
      onChange={setInput}
      onSend={send}
      onStop={stopStream}
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
      {/* 左侧栏：全高到顶（与阅读模式 Sidebar 同结构：品牌区在最顶）；可收拢 */}
      {leftOpen && (
      <aside className="flex w-side shrink-0 flex-col border-r border-line bg-ink-soft">
        <Brand />
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setLeftTab(key)}
              title={label}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] transition-colors ${
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
          ) : leftTab === 'files' ? (
            <FileExplorer
              onPreview={(p) => {
                setPreviewPath(p)
                setRightTab('preview')
                setRightOpen(true)
              }}
              activePath={previewPath}
              online={online}
            />
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
      )}

      {/* 右列：TopBar + 主体 */}
      <div className="flex min-w-0 flex-1 flex-col">
      {/* TopBar */}
      <header className="flex h-[46px] shrink-0 items-center gap-2 border-b border-line bg-ink-soft px-3">
        {/* 与阅读模式顶栏同序：知识库切换 → 模式切换 */}
        <VaultSwitcher vaults={vaults} activeVault={activeVault} onSwitch={onSwitchVault} onNew={onNewVault} />
        <ModeSwitch mode="ai" onSwitch={onSwitchToWiki} />

        {/* 左栏展开/收拢开关 */}
        <button
          onClick={() => setLeftOpen((v) => !v)}
          aria-label={leftOpen ? '收起左栏' : '展开左栏'}
          title={leftOpen ? '收起左栏' : '展开左栏'}
          className={`rounded-md border p-1.5 transition-colors ${
            leftOpen
              ? 'border-accent/60 bg-accent/10 text-accent'
              : 'border-line bg-surface text-fg-secondary hover:border-accent/50 hover:text-accent'
          }`}
        >
          <PanelLeft size={14} strokeWidth={1.9} />
        </button>

        {/* 当前会话 */}
        <div className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">
          <span className="text-fg-secondary">{sessionName || (busy ? '新会话（进行中）' : '新会话')}</span>
          {activeId && <span className="ml-2 font-mono text-[10.5px] opacity-50">{activeId.slice(0, 8)}</span>}
        </div>

        <div className="flex items-center gap-2.5 text-[11px] text-fg-muted">
          <button
            onClick={() => setIndexMode((m) => (m === 'off' ? 'mini' : 'off'))}
            aria-label="对话索引"
            title="对话索引：minimap / 展开列表"
            className={`rounded-md border p-1.5 transition-colors ${
              indexMode !== 'off'
                ? 'border-accent/60 bg-accent/10 text-accent'
                : 'border-line bg-surface text-fg-secondary hover:border-accent/50 hover:text-accent'
            }`}
          >
            <ListOrdered size={14} strokeWidth={1.9} />
          </button>
          <button
            onClick={() => setRightOpen((v) => !v)}
            aria-label={rightOpen ? '收起右栏' : '展开右栏'}
            title={rightOpen ? '收起右栏（知识库/文档/审查）' : '展开右栏（知识库/文档/审查）'}
            className={`rounded-md border p-1.5 transition-colors ${
              rightOpen
                ? 'border-accent/60 bg-accent/10 text-accent'
                : 'border-line bg-surface text-fg-secondary hover:border-accent/50 hover:text-accent'
            }`}
          >
            <PanelRight size={14} strokeWidth={1.9} />
          </button>
          <ChatSettings value={chatCfg} onChange={updateChatCfg} />
          <button
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
            title={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
            className="rounded-md border border-line bg-surface p-1.5 text-fg-secondary transition-colors hover:border-accent/50 hover:text-accent"
          >
            {theme === 'dark' ? <Sun size={14} strokeWidth={1.9} /> : <Moon size={14} strokeWidth={1.9} />}
          </button>
          <AgentInfo usage={usage} />
          <span
            className={`flex items-center gap-1.5 ${offline ? 'text-cat-concept' : ''}`}
            title={offline ? 'agent-server 离线' : 'pi 智能体服务在线'}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${online === null ? 'bg-fg-muted/40' : offline ? 'bg-cat-concept' : 'bg-cat-entity'}`} />
            {offline ? '离线' : '在线'}
          </span>
        </div>
      </header>

        <div className="flex min-h-0 flex-1">
        {/* 中央：聊天主窗口（--chat-w / --chat-pad-y 由排版设置下发） */}
        <main
          className="relative flex min-w-0 flex-1"
          style={{ '--chat-w': `${chatCfg.pct}%`, '--chat-pad-y': CHAT_PADY[chatCfg.padY] } as CSSProperties}
        >
          {/* 对话索引（pi-map 风格）：置于聊天区左侧，mini=收缩 minimap / full=展开侧栏 */}
          {indexMode !== 'off' && !offline && (
            <SessionIndex msgs={msgs} mode={indexMode} onMode={setIndexMode} onClose={() => setIndexMode('off')} />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
          {offline ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="max-w-sm rounded-card border border-line bg-surface p-5 text-[12.5px] leading-6 text-fg-secondary">
                <div className="mb-1.5 flex items-center gap-2 text-[14px] font-semibold text-fg">
                  <Bot size={16} className="text-cat-concept" />
                  agent-server 未启动
                </div>
                <p className="text-fg-muted">工作模式需要本地运行 pi 智能体服务（所有写入经 diff 审核门）。在项目根目录执行：</p>
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
                onOpenReview={openReview}
              />
              {chatInput}
            </>
          )}
          </div>
        </main>

        {/* 右栏：焦点对象工作区 [知识 | 文档 | 审查]，tab 永远可点 + 空态；TopBar 开关控制整体 */}
        {rightOpen && !offline && (
          <aside className="relative flex shrink-0 flex-col border-l border-line bg-ink" style={{ width: rightW }}>
            <div
              onMouseDown={onRightDragStart}
              title="拖拽调整宽度"
              className="group absolute left-[-3px] top-0 z-10 flex h-full w-[7px] cursor-col-resize justify-center"
            >
              {/* 细可见线（2px）+ 宽隐形热区（7px）：线细但颜色醒目 */}
              <div className="h-full w-[2px] bg-accent/40 transition-colors group-hover:bg-accent group-active:bg-accent" />
            </div>
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
              <button
                onClick={() => setRightTab('knowledge')}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] transition-colors ${
                  rightTab === 'knowledge' ? 'bg-accent/10 font-medium text-accent' : 'text-fg-muted hover:bg-surface-raised hover:text-fg-secondary'
                }`}
              >
                <BookOpen size={12} strokeWidth={1.9} />
                知识
              </button>
              <button
                onClick={() => setRightTab('preview')}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] transition-colors ${
                  rightTab === 'preview' ? 'bg-accent/10 font-medium text-accent' : 'text-fg-muted hover:bg-surface-raised hover:text-fg-secondary'
                }`}
              >
                <FileText size={12} strokeWidth={1.9} />
                文档
              </button>
              <button
                onClick={() => {
                  setRightTab('review')
                  if (!reviewSessionId) {
                    const t = stagingPending.find((s) => !isReviewDismissed(s.id)) ?? stagingPending[0]
                    if (t) setReviewSessionId(t.id)
                  }
                }}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] transition-colors ${
                  rightTab === 'review' ? 'bg-accent/10 font-medium text-accent' : 'text-fg-muted hover:bg-surface-raised hover:text-fg-secondary'
                }`}
              >
                <FileDiff size={12} strokeWidth={1.9} />
                审查
                {pendingFileCount > 0 && (
                  <span
                    className="rounded-full bg-accent/20 px-1.5 font-mono text-[10px] text-accent"
                    title={`${stagingPending.length} 个待审会话 · 共 ${pendingFileCount} 个文件待审`}
                  >
                    {pendingFileCount}
                  </span>
                )}
              </button>
            </div>
            {rightTab === 'knowledge' ? (
              <KnowledgePanel onStartTask={startTask} onShowStaging={showStaging} onOpenPage={onOpenWikiPage} busy={busy} online={online} />
            ) : rightTab === 'review' ? (
              <ReviewPanel
                sessionId={reviewSessionId}
                sessions={stagingPending}
                onSelectSession={setReviewSessionId}
                onClose={() => {
                  if (reviewSessionId) dismissReview(reviewSessionId)
                  setReviewSessionId(null)
                }}
                onApplied={handleReviewApplied}
                onDiscarded={handleReviewDiscarded}
                onPartial={() => {
                  refreshPending()
                  void loadVault(activeVault) // 子集 apply 也可能改变消化状态
                }}
              />
            ) : (
              <PreviewPanel path={previewPath} onClose={() => setPreviewPath(null)} />
            )}
          </aside>
        )}
        </div>
      </div>
    </div>
  )
}
