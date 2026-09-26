import { useCallback, useEffect, useState } from 'react'
import WikiMode from '@/modes/WikiMode'
import AiMode from '@/modes/AiMode'
import PreviewCard from '@/components/PreviewCard'
import { getPage } from '@/lib/wiki'
import type { AgentTask, WikiPage } from '@/types'

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
    // 无 hash 时：恢复上次模式；wiki 模式下由 WikiMode 自行恢复 wv-last 页面
    if (saved === 'ai') {
      location.replace('#/ai')
      return 'ai'
    }
    location.replace('#/wiki')
    return 'wiki'
  })
  const [pendingTask, setPendingTask] = useState<AgentTask | null>(null)

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

  return (
    <>
      {mode === 'wiki' ? (
        <WikiMode theme={theme} setTheme={setTheme} onTask={handleTask} onSwitchToAi={() => switchTo('ai')} />
      ) : (
        <AiMode
          theme={theme}
          setTheme={setTheme}
          onSwitchToWiki={() => switchTo('wiki')}
          pendingTask={pendingTask}
          onTaskConsumed={() => setPendingTask(null)}
          onOpenWikiPage={openWikiPage}
        />
      )}
      <PreviewCard />
    </>
  )
}
