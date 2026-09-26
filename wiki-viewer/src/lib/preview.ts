import { useSyncExternalStore } from 'react'
import type { WikiPage } from '@/types'

/**
 * 悬停预览的全局单例 store：
 * PageView / RightRail 等任意位置调用 showPreview，根部挂的 <PreviewCard /> 统一渲染。
 * 空悬时避免误触：首次 450ms 延迟显示；已有一张卡时切换目标零延迟（Obsidian 行为）。
 */
export type PreviewTarget = { page: WikiPage } | { broken: string }

interface State {
  target: PreviewTarget | null
  x: number
  y: number
}

let state: State = { target: null, x: 0, y: 0 }
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  listeners.forEach((l) => l())
}

export function showPreview(target: PreviewTarget, x: number, y: number) {
  if (state.target) {
    set({ target, x, y })
    return
  }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    set({ target, x, y })
  }, 450)
}

export function hidePreview() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (state.target) set({ target: null, x: 0, y: 0 })
}

export function usePreviewState(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
