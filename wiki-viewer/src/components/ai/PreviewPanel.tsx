import { useEffect, useMemo, useRef, useState } from 'react'
import { Code2, Eye, FileText, Loader2 } from 'lucide-react'
import { marked } from 'marked'
import { readFile } from '@/lib/agent'
import { highlightBlocks } from '@/lib/highlight'
import PanelFrame from './PanelFrame'

interface Props {
  path: string | null
  onClose: () => void
}

/** 右栏「文档」tab：vault 文件阅览（渲染/源码），套 PanelFrame 统一 chrome；无文件时引导空态 */
export default function PreviewPanel({ path, onClose }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ size: number; truncated: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [srcView, setSrcView] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!path) {
      setContent(null)
      setMeta(null)
      setError(null)
      return
    }
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
    if (content == null || srcView || !path?.endsWith('.md')) return ''
    const body = content.replace(/^---[\s\S]*?---\r?\n/, '').replace(/^# .+$/m, '')
    return marked.parse(body, { async: false, gfm: true }) as string
  }, [content, srcView, path])

  useEffect(() => {
    if (ref.current && html) highlightBlocks(ref.current)
  }, [html])

  const isMd = path?.endsWith('.md')

  return (
    <PanelFrame
      icon={FileText}
      title={path ?? '文档'}
      meta={meta ? `${(meta.size / 1024).toFixed(1)} KB${meta.truncated ? ' · 已截断' : ''}` : undefined}
      onClose={onClose}
      actions={
        isMd && content != null ? (
          <button
            onClick={() => setSrcView((v) => !v)}
            title={srcView ? '切换到渲染视图' : '查看源码'}
            className={`shrink-0 rounded-md border p-1 transition-colors ${
              srcView ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line bg-surface text-fg-muted hover:text-fg'
            }`}
          >
            {srcView ? <Eye size={12} /> : <Code2 size={12} />}
          </button>
        ) : undefined
      }
    >
      {!path ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[11.5px] leading-5 text-fg-muted">
          <FileText size={20} className="opacity-40" />
          在左栏「文件」中选择一个文件以预览
        </div>
      ) : error ? (
        <div className="p-4 text-[12px] text-cat-concept">{error}</div>
      ) : content == null ? (
        <div className="flex items-center gap-2 p-4 text-[12px] text-fg-muted">
          <Loader2 size={13} className="animate-spin" />
          加载中…
        </div>
      ) : srcView || !isMd ? (
        <pre className="h-full overflow-y-auto whitespace-pre-wrap p-4 font-mono text-[11.5px] leading-[1.7] text-fg-secondary">{content}</pre>
      ) : (
        <div ref={ref} className="prose-wiki h-full overflow-y-auto p-4 text-[13px]" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </PanelFrame>
  )
}
