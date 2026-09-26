import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Code2, Eye, Loader2, X } from 'lucide-react'
import { marked } from 'marked'
import { readFile } from '@/lib/agent'
import { highlightBlocks } from '@/lib/highlight'

interface Props {
  path: string
  onClose: () => void
}

const W_MIN = 320
const W_MAX = 760
const W_DEFAULT = 430

/** 右侧文件预览面板：Markdown 渲染 / 源码切换，左缘拖拽调宽 */
export default function PreviewPanel({ path, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ size: number; truncated: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [srcView, setSrcView] = useState(false)
  const [width, setWidth] = useState(() => {
    const n = Number(localStorage.getItem('wv-preview-w'))
    return n >= W_MIN && n <= W_MAX ? n : W_DEFAULT
  })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setContent(null)
    setError(null)
    setSrcView(false)
    readFile(path)
      .then((r) => {
        if (!alive) return
        setContent(r.content)
        setMeta({ size: r.size, truncated: r.truncated })
      })
      .catch((e) => alive && setError(String((e as Error)?.message || e)))
    return () => {
      alive = false
    }
  }, [path])

  const html = useMemo(() => {
    if (content == null || srcView || !path.endsWith('.md')) return ''
    const body = content.replace(/^---[\s\S]*?---\r?\n/, '').replace(/^# .+$/m, '')
    return marked.parse(body, { async: false, gfm: true }) as string
  }, [content, srcView, path])

  useEffect(() => {
    if (ref.current && html) highlightBlocks(ref.current)
  }, [html])

  useEffect(() => localStorage.setItem('wv-preview-w', String(width)), [width])

  const onDragStart = (e: ReactMouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const move = (ev: globalThis.MouseEvent) => {
      // 面板靠右：向左拖变宽
      setWidth(Math.min(W_MAX, Math.max(W_MIN, startW + (startX - ev.clientX))))
    }
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

  const isMd = path.endsWith('.md')

  return (
    <aside className="relative flex shrink-0 flex-col border-l border-line bg-ink" style={{ width }}>
      <div
        onMouseDown={onDragStart}
        title="拖拽调整预览宽度"
        className="absolute left-[-3px] top-0 z-10 h-full w-[7px] cursor-col-resize transition-colors hover:bg-accent/30 active:bg-accent/50"
      />
      {/* header */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-secondary" title={path}>
          {path}
        </span>
        {meta && (
          <span className="shrink-0 font-mono text-[10px] text-fg-muted">
            {(meta.size / 1024).toFixed(1)} KB{meta.truncated && ' · 已截断'}
          </span>
        )}
        {isMd && content != null && (
          <button
            onClick={() => setSrcView((v) => !v)}
            title={srcView ? '切换到渲染视图' : '查看源码'}
            className={`shrink-0 rounded-md border p-1 transition-colors ${
              srcView ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line bg-surface text-fg-muted hover:text-fg'
            }`}
          >
            {srcView ? <Eye size={12} /> : <Code2 size={12} />}
          </button>
        )}
        <button onClick={onClose} aria-label="关闭预览" className="shrink-0 rounded-md p-1 text-fg-muted hover:bg-surface-raised hover:text-fg">
          <X size={13} />
        </button>
      </div>
      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <div className="p-4 text-[12px] text-cat-concept">{error}</div>
        ) : content == null ? (
          <div className="flex items-center gap-2 p-4 text-[12px] text-fg-muted">
            <Loader2 size={13} className="animate-spin" />
            加载中…
          </div>
        ) : srcView || !isMd ? (
          <pre className="whitespace-pre-wrap p-4 font-mono text-[11.5px] leading-[1.7] text-fg-secondary">{content}</pre>
        ) : (
          <div ref={ref} className="prose-wiki p-4 text-[13px]" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </aside>
  )
}
