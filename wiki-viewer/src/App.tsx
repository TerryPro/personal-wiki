import { useCallback, useEffect, useRef, useState } from 'react'
import WikiMode from '@/modes/WikiMode'
import AiMode from '@/modes/AiMode'
import PreviewCard from '@/components/PreviewCard'
import NewVaultDialog from '@/components/NewVaultDialog'
import { getPage, loadVault, loadVaultIndex } from '@/lib/wiki'
import { setAgentVault } from '@/lib/agent'
import { addDiffsListener, isReviewDismissed } from '@/lib/agentStream'
import type { AgentTask, VaultEntry, WikiPage } from '@/types'

type AppMode = 'wiki' | 'ai'

/**
 * 顶层 hash 解析：
 * - #/ai            → AI 管理模式
 * - #/wiki[/...]    → Wiki 阅读模式
 * - #/<cat>/<f>.md  → 旧格式深链，重定向到 #/wiki/<cat>/<f>.md
 * - 空              → 上次模式（localStorage）
 */
function parseMode(): AppMode | null {
  const h = location.hash
  if (h.startsWith('#/ai')) return 'ai'
  if (h.startsWith('#/wiki')) return 'wiki'
  const legacy = h.match(/^#\/([a-z]+)\/(.+\.md)$/)
  if (legacy) {
    location.replace(`#/wiki/${legacy[1]}/${legacy[2]}`)
    return 'wiki'
  }
  return null
}

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    localStorage.getItem('wv-theme') === 'light' ? 'light' : 'dark',
  )
  const [mode, setMode] = useState<AppMode>(() => {
    const m = parseMode()
    if (m) return m
    const saved = localStorage.getItem('wv-mode')
    if (saved === 'ai') {
      location.replace('#/ai')
      return 'ai'
    }
    location.replace('#/wiki')
    return 'wiki'
  })
  const [pendingTask, setPendingTask] = useState<AgentTask | null>(null)

  /* ————— 待审 toast（diffs 到达但审查面板不可见时提醒） ————— */
  const [reviewToast, setReviewToast] = useState<{ sessionId: string; count: number } | null>(null)
  const [reviewRequest, setReviewRequest] = useState<string | null>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode
  useEffect(
    () =>
      addDiffsListener((sid, count) => {
        // 座舱内且未dismissed → AiMode 会自动开审查，无需 toast；其余情况弹 toast
        if (modeRef.current !== 'ai' || isReviewDismissed(sid)) setReviewToast({ sessionId: sid, count })
      }),
    [],
  )

  /* ————— 多知识库状态 ————— */
  const [vaults, setVaults] = useState<VaultEntry[]>([])
  const [activeVault, setActiveVault] = useState<string>(() => localStorage.getItem('wv-vault') || 'llmwiki')
  const [vaultReady, setVaultReady] = useState(false)
  const [showNewVault, setShowNewVault] = useState(false)

  // 初始化：加载注册表 + 当前 vault 数据
  useEffect(() => {
    loadVaultIndex().then(async (list) => {
      setVaults(list)
      const id = localStorage.getItem('wv-vault') || list[0]?.id || 'llmwiki'
      setAgentVault(id)
      try {
        await loadVault(id)
        setActiveVault(id)
      } catch {
        // vault 数据不存在时回退到第一个可用的
        for (const v of list) {
          try {
            await loadVault(v.id)
            setActiveVault(v.id)
            localStorage.setItem('wv-vault', v.id)
            setAgentVault(v.id)
            break
          } catch { /* 继续尝试下一个 */ }
        }
      }
      setVaultReady(true)
    })
  }, [])

  const switchVault = useCallback(async (id: string) => {
    setVaultReady(false)
    localStorage.setItem('wv-vault', id)
    setAgentVault(id)
    try {
      await loadVault(id)
      setActiveVault(id)
    } catch (e) {
      console.error('[App] vault 切换失败:', e)
    }
    setVaultReady(true)
  }, [])

  // 近实时：切回阅读模式 / 窗口重新聚焦时重拉当前 vault 快照（loadVault 会通知订阅者重渲染）
  useEffect(() => {
    if (!vaultReady) return
    if (mode === 'wiki') loadVault(activeVault).catch(() => {})
  }, [mode, activeVault, vaultReady])
  useEffect(() => {
    if (!vaultReady) return
    const onFocus = () => loadVault(activeVault).catch(() => {})
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [activeVault, vaultReady])

  /** 新建 vault 成功后：刷新注册表并切换到新 vault（页面 reload 以刷新 glob） */
  const handleVaultCreated = useCallback((newId: string) => {
    localStorage.setItem('wv-vault', newId)
    window.location.reload()
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    localStorage.setItem('wv-theme', theme)
  }, [theme])

  // hash → 模式（浏览器前进/后退、手动改地址栏）
  useEffect(() => {
    const onHash = () => {
      const m = parseMode()
      if (m) setMode(m)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const switchTo = useCallback((m: AppMode) => {
    setMode(m)
    localStorage.setItem('wv-mode', m)
    if (m === 'ai') {
      if (!location.hash.startsWith('#/ai')) location.hash = '#/ai'
    } else if (!location.hash.startsWith('#/wiki')) {
      const last = localStorage.getItem('wv-last')
      location.hash = last && getPage(last) ? `#/wiki/${last}` : '#/wiki'
    }
  }, [])

  // 阅读模式发起 AI 任务：记下任务并切换模式（AiMode 挂载后自动执行）
  const handleTask = useCallback(
    (task: AgentTask) => {
      setPendingTask(task)
      switchTo('ai')
    },
    [switchTo],
  )

  // AI 模式中点击双链 → 切回阅读模式并打开对应页
  const openWikiPage = useCallback(
    (p: WikiPage) => {
      switchTo('wiki')
      location.hash = `#/wiki/${p.id}`
    },
    [switchTo],
  )

  /* ————— 加载中占位 ————— */
  if (!vaultReady) {
    return (
      <div className="flex h-full items-center justify-center bg-ink">
        <div className="flex flex-col items-center gap-3 text-fg-muted">
          <svg width="36" height="36" viewBox="0 0 26 26" aria-hidden="true" className="animate-pulse opacity-60">
            <circle cx="13" cy="6" r="2.6" fill="hsl(42 52% 62%)" />
            <circle cx="5.5" cy="18" r="2.2" fill="hsl(202 48% 60%)" />
            <circle cx="20.5" cy="18" r="2.2" fill="hsl(272 34% 64%)" />
            <circle cx="13" cy="13.5" r="1.7" fill="hsl(28 62% 58%)" />
            <path d="M13 6 5.5 18M13 6l7.5 12M5.5 18h15M13 13.5 13 6M13 13.5 5.5 18M13 13.5l7.5 4.5" stroke="hsl(160 10% 42%)" strokeWidth="0.9" opacity="0.65" />
          </svg>
          <span className="text-[13px]">正在加载知识库…</span>
        </div>
      </div>
    )
  }

  const vaultProps = {
    vaults,
    activeVault,
    onSwitchVault: switchVault,
    onNewVault: () => setShowNewVault(true),
  }

  return (
    <>
      {mode === 'wiki' ? (
        <WikiMode key={activeVault} theme={theme} setTheme={setTheme} onTask={handleTask} onSwitchToAi={() => switchTo('ai')} {...vaultProps} />
      ) : (
        <AiMode
          key={activeVault}
          theme={theme}
          setTheme={setTheme}
          onSwitchToWiki={() => switchTo('wiki')}
          pendingTask={pendingTask}
          onTaskConsumed={() => setPendingTask(null)}
          onOpenWikiPage={openWikiPage}
          reviewRequest={reviewRequest}
          onReviewRequestConsumed={() => setReviewRequest(null)}
          {...vaultProps}
        />
      )}
      <PreviewCard />
      {/* 待审 toast：点击跳回座舱并打开审查 */}
      {reviewToast && (
        <div className="fixed bottom-6 right-6 z-[90] flex w-72 animate-fade-up items-center gap-2 rounded-card border border-accent/50 bg-surface px-3 py-2.5 shadow-panel">
          <span className="min-w-0 flex-1 text-[12px] text-fg-secondary">
            <span className="font-mono text-accent">{reviewToast.count}</span> 个文件待审查
          </span>
          <button
            onClick={() => {
              setReviewRequest(reviewToast.sessionId)
              setReviewToast(null)
              switchTo('ai')
            }}
            className="shrink-0 rounded-md border border-accent/50 bg-accent/10 px-2 py-1 text-[11.5px] font-medium text-accent transition-colors hover:bg-accent/20"
          >
            查看
          </button>
          <button onClick={() => setReviewToast(null)} aria-label="关闭提醒" className="shrink-0 rounded p-1 text-fg-muted hover:bg-surface-raised hover:text-fg">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}
      {showNewVault && (
        <NewVaultDialog
          onClose={() => setShowNewVault(false)}
          onCreated={handleVaultCreated}
        />
      )}
    </>
  )
}
