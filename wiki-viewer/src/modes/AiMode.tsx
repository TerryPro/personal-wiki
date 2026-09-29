import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { BookOpen, Bot, Columns2, FileDiff, FileText, FolderTree, History, MessageSquare, Moon, PanelBottom, PanelTop, PanelLeft, PanelRight, ScrollText, Settings2, Sun } from 'lucide-react'
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
import ContextPanel from '@/components/ai/ContextPanel'
import HistoryPanel from '@/components/ai/HistoryPanel'
import AgentToolbar from '@/components/ai/AgentToolbar'
import SessionIndex, { type IndexMode } from '@/components/ai/SessionIndex'
import { loadVault } from '@/lib/wiki'
import { getActiveDoc, getOpenDocs, openDoc, subscribeOpenDocs, getOpenDocsVersion } from '@/lib/openDocs'
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
/** 左栏双分区：每个标签归属唯一分区（topTabs/bottomTabs 互斥划分），各区独立记录当前面板；bottomTabs 为空 = 单栏 */
interface LeftPanes {
  topTabs: LeftTab[]
  bottomTabs: LeftTab[]
  topActive: LeftTab
  bottomActive: LeftTab | null
}
type RightTab = 'knowledge' | 'preview' | 'review' | 'context' | 'history'
/** 主体区三选一布局：中间列 / 右栏 / 两者并存（左栏为独立开关，不参与） */
type CrLayout = 'center' | 'right' | 'both'

const TABS: { key: LeftTab; label: string; icon: typeof Bot }[] = [
  { key: 'sessions', label: '会话', icon: Bot },
  { key: 'files', label: '文件', icon: FolderTree },
  { key: 'settings', label: '设置', icon: Settings2 },
]

const LAYOUTS: { key: CrLayout; label: string; icon: typeof Bot; hint: string }[] = [
  { key: 'center', label: '对话', icon: MessageSquare, hint: '只看中间聊天列（对话优先，右栏收起）' },
  { key: 'right', label: '面板', icon: PanelRight, hint: '只看右侧面板（沉浸审查/阅读，面板占满主体区）' },
  { key: 'both', label: '双栏', icon: Columns2, hint: '聊天列 + 右侧面板并排（边问边审）' },
]

/** 拖拽分栏的宽度边界：自由拖动，拖到边界外再多拖 DRAG_OVERSHOOT 即关闭对应面板 */
const RIGHT_MIN = 260 // 右栏最小宽，再窄就关右栏
const CENTER_MIN = 320 // 聊天列最小宽，再窄就关聊天列
const DRAG_OVERSHOOT = 28 // 越界缓冲：先卡在最小宽 + 红线提示，再多拖此距离才提交关闭

export default function AiMode({ theme, setTheme, onSwitchToWiki, pendingTask, onTaskConsumed, onOpenWikiPage, vaults, activeVault, onSwitchVault, onNewVault, reviewRequest, onReviewRequestConsumed }: Props) {
  const [online, setOnline] = useState<boolean | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [input, setInput] = useState('')
  // 会话流状态来自模块级单例 store（切换模式卸载 AiMode 也不丢流）
  const snap = useSyncExternalStore(subscribeStream, getStreamState)
  const { msgs, busy, activeId, sessionName, usage, lastModelName } = snap
  // 左栏双分区（issue #1）：标签按归属分区不重复；下半有标签才显示下半区
  const [panes, setPanes] = useState<LeftPanes>(() => {
    const all = TABS.map((t) => t.key)
    let bottomTabs: LeftTab[] = []
    const raw = localStorage.getItem('wv-left-bottom')
    if (raw) {
      if (all.includes(raw as LeftTab)) bottomTabs = [raw as LeftTab] // 兼容旧版单值（如 "files"）
      else {
        try {
          const v: unknown = JSON.parse(raw)
          if (Array.isArray(v)) bottomTabs = v.filter((k): k is LeftTab => all.includes(k as LeftTab))
        } catch {
          /* 非法值回退单栏 */
        }
      }
    }
    bottomTabs = [...new Set(bottomTabs)]
    const topTabs = all.filter((k) => !bottomTabs.includes(k))
    return { topTabs, bottomTabs, topActive: topTabs.includes('sessions') ? 'sessions' : (topTabs[0] ?? 'sessions'), bottomActive: bottomTabs[0] ?? null }
  })
  const { topTabs, bottomTabs, topActive, bottomActive } = panes
  useEffect(() => {
    if (bottomTabs.length) localStorage.setItem('wv-left-bottom', JSON.stringify(bottomTabs))
    else localStorage.removeItem('wv-left-bottom')
  }, [bottomTabs])
  /** 上半当前标签移到下半；上半只剩一个标签时禁止（由 tab 条 disabled 拦截） */
  const moveTopToBottom = () =>
    setPanes((p) => {
      if (p.topTabs.length <= 1) return p
      const moving = p.topActive
      const topTabs = p.topTabs.filter((k) => k !== moving)
      return { ...p, topTabs, topActive: topTabs[0] ?? moving, bottomTabs: [...p.bottomTabs, moving], bottomActive: p.bottomActive ?? moving }
    })
  /** 下半当前标签移回上半；下半清空后下半区自动消失 */
  const moveBottomToTop = () =>
    setPanes((p) => {
      if (!p.bottomActive) return p
      const moving = p.bottomActive
      const bottomTabs = p.bottomTabs.filter((k) => k !== moving)
      return { ...p, bottomTabs, bottomActive: bottomTabs[0] ?? null, topTabs: [...p.topTabs, moving] }
    })
  // 左栏展开/收拢（持久化），与阅读模式 PanelLeft 开关对齐
  const [leftOpen, setLeftOpen] = useState(() => localStorage.getItem('wv-panel-l-ai') !== '0')
  useEffect(() => localStorage.setItem('wv-panel-l-ai', leftOpen ? '1' : '0'), [leftOpen])
  // 右栏「文档」多 tab 状态在模块级 store（lib/openDocs）：切模式/切库不丢已开文档
  const openDocsVersion = useSyncExternalStore(subscribeOpenDocs, getOpenDocsVersion)
  // 右栏 [知识|文档|审查|上下文] tab 与当前审查会话；宽度拖拽持久化；rightOpen 为右栏整体开关
  const [rightTab, setRightTab] = useState<RightTab>(() => {
    const v = localStorage.getItem('wv-right-tab')
    return v === 'review' || v === 'knowledge' || v === 'context' || v === 'history' ? v : 'preview'
  })
  useEffect(() => localStorage.setItem('wv-right-tab', rightTab), [rightTab])
  // 主体区布局（三选一，持久化）；由它派生中间列/右栏的可见性与右栏拉伸态，因此不会出现两者皆空的布局
  const [layout, setLayout] = useState<CrLayout>(() => {
    const v = localStorage.getItem('wv-layout-cr')
    if (v === 'center' || v === 'right' || v === 'both') return v
    // 旧版双开关键迁移
    const c = localStorage.getItem('wv-panel-c-ai') !== '0'
    const r = localStorage.getItem('wv-panel-r-ai') === '1'
    return c && r ? 'both' : r ? 'right' : 'center'
  })
  useEffect(() => localStorage.setItem('wv-layout-cr', layout), [layout])
  const centerOpen = layout !== 'right'
  const rightOpen = layout !== 'center'
  /** 右栏拉伸态：无中间列时 flex-1 占满主体区（tab 条保留，否则无法切面板） */
  const rightMain = layout === 'right'
  /** 切换三选一布局：进入「面板」时若文档 tab 没开任何文件，自动落到知识 tab（保证主体区不空） */
  const pickLayout = useCallback(
    (next: CrLayout) => {
      setLayout(next)
      if (next === 'right' && rightTab === 'preview' && getOpenDocs(activeVault).docs.length === 0) setRightTab('knowledge')
    },
    [rightTab, activeVault, openDocsVersion],
  )
  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null)
  const [stagingPending, setStagingPending] = useState<StagingSessionInfo[]>([])
  // 对话索引：off 关闭 / mini 收缩 minimap / full 展开侧栏；默认 mini
  const [indexMode, setIndexMode] = useState<'off' | IndexMode>('mini')
  const [rightW, setRightW] = useState(() => {
    const n = Number(localStorage.getItem('wv-right-w'))
    return n >= RIGHT_MIN ? n : 460
  })
  useEffect(() => localStorage.setItem('wv-right-w', String(rightW)), [rightW])
  // 拖拽越界时的关闭预示（指示线变红）：right = 将关右栏，center = 将关聊天列
  const [dragZone, setDragZone] = useState<null | 'right' | 'center'>(null)
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

  // 离线守卫：独占面板布局下右栏不渲染（也无对话入口），强制回到对话布局以保证离线引导可见
  useEffect(() => {
    if (online === false && layout === 'right') setLayout('center')
  }, [online, layout])

  // 全局快捷键：" 循环三选一布局，[ 切换左栏（输入控件聚焦时不触发）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (/input|textarea/i.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable) return
      if (e.key === '"') {
        e.preventDefault()
        const order: CrLayout[] = ['center', 'right', 'both']
        pickLayout(order[(order.indexOf(layout) + 1) % order.length] ?? 'center')
      } else if (e.key === '[') {
        e.preventDefault()
        setLeftOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [layout, pickLayout])

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
      // 切换会话时同步该会话的实时用量（活跃缓存会话有值；冷会话仅有磁盘重算的累计细分，上下文占用为 null→占位）
      const cu = r.usage?.contextUsage
      setStoreUsage(
        r.usage
          ? {
              cost: r.usage.cost || r.usage.stats?.cost || 0,
              tokens: cu && typeof cu.tokens === 'number' ? cu.tokens : null,
              contextWindow: cu && typeof cu.contextWindow === 'number' ? cu.contextWindow : null,
              percent: cu && typeof cu.percent === 'number' ? cu.percent : null,
              stats: r.usage.stats?.tokens ?? null,
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

  /** 需要右栏亮相时的布局：已在面板/双栏态则保持，否则升到双栏 */
  const revealRight = useCallback(() => setLayout((v) => (v === 'center' ? 'both' : v)), [])

  /** 打开右栏审查面板（手动打开不受 dismissed 限制） */
  const openReview = useCallback((id: string) => {
    undismissReview(id)
    setReviewSessionId(id)
    setRightTab('review')
    setLayout((v) => (v === 'center' ? 'both' : v))
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

  /**
   * 右栏左缘拖拽调宽（仅 `both` 布局下有拖拽柄）：自由拖动，越界即关闭对应面板
   * - 向右拖使右栏 < RIGHT_MIN → 松手关闭右栏（回「对话」）
   * - 向左拖使聊天列 < CENTER_MIN → 松手关闭聊天列（进「面板」）
   * 越界后先卡在最小宽并将指示线变红，再多拖 DRAG_OVERSHOOT 才提交，避免误触；关闭后宽度回写拖拽前的值。
   */
  const onRightDragStart = (e: ReactMouseEvent) => {
    e.preventDefault()
    const aside = document.querySelector('[data-aside-r]') as HTMLElement | null
    const rowW = (aside?.parentElement ?? document.body).getBoundingClientRect().width
    const maxW = Math.max(RIGHT_MIN, rowW - CENTER_MIN)
    const startW = Math.min(Math.max(rightW, RIGHT_MIN), maxW)
    const startX = e.clientX
    let collapseTo: CrLayout | null = null
    const move = (ev: MouseEvent) => {
      const raw = startW + (startX - ev.clientX)
      setRightW(Math.min(Math.max(raw, RIGHT_MIN), maxW))
      setDragZone(raw < RIGHT_MIN ? 'right' : raw > maxW ? 'center' : null)
      if (raw < RIGHT_MIN - DRAG_OVERSHOOT) collapseTo = 'center'
      else if (raw > maxW + DRAG_OVERSHOOT) collapseTo = 'right'
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      setDragZone(null)
      if (collapseTo) {
        setRightW(startW) // 回写拖拽前宽度，下次展开不保留被拖到极限的窄态
        pickLayout(collapseTo)
      }
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

  // 左栏两类列表的可复用节点：文件 tab 在「下半停靠」布局中会与会话列表同屏上下分栏
  const sessionList = (
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
  )
  const fileTree = (
    <FileExplorer
      onPreview={(p) => {
        openDoc(activeVault, p)
        setRightTab('preview')
        revealRight()
      }}
      activePath={getActiveDoc(activeVault)}
      online={online}
    />
  )
  const settingsPanel = (
    <SettingsPanel
      model={model}
      onModel={(m) => {
        setModel(m)
        localStorage.setItem('wv-ai-model', JSON.stringify(m))
      }}
      online={online}
    />
  )

  /** 按注册表 key 取面板节点（上下两区共用同一渲染映射） */
  const paneNode = (key: LeftTab) => (key === 'sessions' ? sessionList : key === 'files' ? fileTree : settingsPanel)
  /** 分区 tab 条：只渲染归属本区的标签（一个标签只属于一个区）；右端移动按钮把本区当前标签送到对方区 */
  const renderPaneBar = (own: 'top' | 'bottom') => {
    const tabs = own === 'top' ? topTabs : bottomTabs
    const active = own === 'top' ? topActive : bottomActive
    const activeLabel = TABS.find((t) => t.key === active)?.label ?? ''
    return (
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        {TABS.filter((t) => tabs.includes(t.key)).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setPanes((p) => (own === 'top' ? { ...p, topActive: key } : { ...p, bottomActive: key }))}
            title={label}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] transition-colors ${
              active === key ? 'bg-accent/10 font-medium text-accent' : 'text-fg-muted hover:bg-surface-raised hover:text-fg-secondary'
            }`}
          >
            <Icon size={12} strokeWidth={2} />
            {label}
          </button>
        ))}
        {own === 'top' ? (
          <button
            onClick={moveTopToBottom}
            disabled={topTabs.length <= 1}
            title={topTabs.length <= 1 ? '上半区至少保留一个标签，无法下移' : `将「${activeLabel}」移到下半区`}
            aria-label="将当前标签移到下半区"
            className="ml-auto rounded-md border border-line bg-surface p-1 text-fg-secondary transition-colors hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-fg-secondary"
          >
            <PanelBottom size={13} strokeWidth={1.9} />
          </button>
        ) : (
          <button
            onClick={moveBottomToTop}
            title={`将「${activeLabel}」移回上半区（下半区清空后自动消失）`}
            aria-label="将当前标签移回上半区"
            className="ml-auto rounded-md border border-accent/60 bg-accent/10 p-1 text-accent transition-colors hover:bg-accent/20"
          >
            <PanelTop size={13} strokeWidth={1.9} />
          </button>
        )}
      </div>
    )
  }

  const chatInput = (
    <ChatInput
      value={input}
      onChange={setInput}
      onSend={send}
      onStop={stopStream}
      busy={busy}
      disabled={offline}
      onCommand={handleCommand}
      skills={skills}
    />
  )

  // Agent 工具首栏：pi agent 信息与控制统一入口（模型/思考档/ctx/成本/检视/审核门/压缩）
  const agentToolbar = (
    <AgentToolbar
      usage={usage}
      modelDisplay={model?.id ?? lastModelName ?? defaultModelName ?? '默认模型'}
      onOpenSettings={() =>
        setPanes((p) => (p.bottomTabs.includes('settings') ? { ...p, bottomActive: 'settings' } : { ...p, topActive: 'settings' }))
      }
      thinkingLevel={thinkingLevel}
      onThinkingCycle={cycleThinking}
      onCompact={() => handleCommand('compact')}
      onOpenContext={() => {
        setRightTab('context')
        revealRight()
      }}
      indexOn={indexMode !== 'off'}
      onToggleIndex={() => setIndexMode((m) => (m === 'off' ? 'mini' : 'off'))}
      activeId={activeId}
      busy={busy}
    />
  )

  return (
    <div className="flex h-full">
      {/* 左侧栏：全高到顶（与阅读模式 Sidebar 同结构：品牌区在最顶）；可收拢；支持上/下双分区（任意注册面板可归位任一区） */}
      {leftOpen && (
      <aside className="flex w-side shrink-0 flex-col border-r border-line bg-ink-soft">
        <Brand />
        {renderPaneBar('top')}
        <div className="min-h-0 flex-1">{paneNode(topActive)}</div>
        {bottomTabs.length > 0 && (
          <>
            <div className="h-px shrink-0 bg-line" />
            {renderPaneBar('bottom')}
            <div className="min-h-0 flex-1">{paneNode(bottomActive ?? bottomTabs[0] ?? 'sessions')}</div>
          </>
        )}
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

        {/* 当前会话：有 id 但未命名时显示「未命名会话」，避免把旧会话误标成「新会话」；仅无活动会话时才是新会话 */}
        <div className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">
          <span className="text-fg-secondary">{sessionName || (activeId ? '未命名会话' : busy ? '新会话（进行中）' : '新会话')}</span>
          {activeId && <span className="ml-2 font-mono text-[10.5px] opacity-50">{activeId.slice(0, 8)}</span>}
        </div>

        <div className="flex items-center gap-2.5 text-[11px] text-fg-muted">
          {/* 主体区布局三选一（对话 / 面板 / 双栏）：取代旧的两个易混淆开关；样式对齐 ModeSwitch */}
          <div className="flex shrink-0 rounded-lg border border-line bg-surface p-[2px]" role="tablist" aria-label="显示区切换">
            {LAYOUTS.map(({ key, label, icon: Icon, hint }) => (
              <button
                key={key}
                role="tab"
                aria-selected={layout === key}
                onClick={() => pickLayout(key)}
                title={`${hint}（" 循环切换）`}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-all duration-150 ${
                  layout === key ? 'bg-surface-raised text-fg' : 'text-fg-muted hover:text-fg-secondary'
                }`}
              >
                <Icon size={13} strokeWidth={1.9} />
                {label}
              </button>
            ))}
          </div>
          <ChatSettings value={chatCfg} onChange={updateChatCfg} />
          <button
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
            title={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
            className="rounded-md border border-line bg-surface p-1.5 text-fg-secondary transition-colors hover:border-accent/50 hover:text-accent"
          >
            {theme === 'dark' ? <Sun size={14} strokeWidth={1.9} /> : <Moon size={14} strokeWidth={1.9} />}
          </button>
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
        {/* 中央：聊天主窗口（--chat-w / --chat-pad-y 由排版设置下发）；与右栏对等，可整体收起 */}
        {centerOpen && (
        <main
          className="relative flex min-w-0 flex-1"
          style={{ '--chat-w': `${chatCfg.pct}%`, '--chat-pad-y': CHAT_PADY[chatCfg.padY] } as CSSProperties}
        >
          {/* 对话索引（pi-map 风格）：置于聊天区左侧，mini=收缩 minimap / full=展开侧栏 */}
          {indexMode !== 'off' && !offline && (
            <SessionIndex msgs={msgs} mode={indexMode} onMode={setIndexMode} onClose={() => setIndexMode('off')} />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
          {!offline && agentToolbar}
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
        )}

        {/* 右栏：与聊天列对等的一等主栏——「面板」布局下 flex-1 占满主体区（tab 条保留，否则无法切面板）；离线时不展示（引导卡已在聊天列） */}
        {rightOpen && !offline && (
          <aside
            data-aside-r
            className={`relative flex flex-col border-l border-line bg-ink ${rightMain ? 'min-w-0 flex-1' : 'shrink-0'}`}
            style={rightMain ? undefined : { width: rightW }}
          >
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
              <button
                onClick={() => setRightTab('context')}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] transition-colors ${
                  rightTab === 'context' ? 'bg-accent/10 font-medium text-accent' : 'text-fg-muted hover:bg-surface-raised hover:text-fg-secondary'
                }`}
              >
                <ScrollText size={12} strokeWidth={1.9} />
                上下文
              </button>
              <button
                onClick={() => setRightTab('history')}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] transition-colors ${
                  rightTab === 'history' ? 'bg-accent/10 font-medium text-accent' : 'text-fg-muted hover:bg-surface-raised hover:text-fg-secondary'
                }`}
              >
                <History size={12} strokeWidth={1.9} />
                历史
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
            ) : rightTab === 'context' ? (
              <ContextPanel sessionId={activeId} />
            ) : rightTab === 'history' ? (
              <HistoryPanel sessionId={activeId} />
            ) : (
              <PreviewPanel vaultId={activeVault} />
            )}
            {/* 拖拽柄只在双栏态出现：面板独占时已占满主体区，调宽无意义（回双栏用顶栏或 "） */}
            {!rightMain && (
              <div
                onMouseDown={onRightDragStart}
                title="拖拽调整宽度 · 拖过边界即关闭对应面板"
                className="group absolute left-[-3px] top-0 z-10 flex h-full w-[7px] cursor-col-resize justify-center"
              >
                {/* 细可见线（2px）+ 宽隐形热区（7px）：拖到越界时变红提示将关闭 */}
                <div
                  className={`h-full w-[2px] transition-colors ${
                    dragZone ? 'bg-danger' : 'bg-accent/40 group-hover:bg-accent group-active:bg-accent'
                  }`}
                />
              </div>
            )}
          </aside>
        )}
        </div>
      </div>
    </div>
  )
}
