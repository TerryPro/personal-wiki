import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Code2, Eye, FileText, Layers, Loader2, X } from 'lucide-react'
import { marked } from 'marked'
import { readFile } from '@/lib/agent'
import { highlightBlocks } from '@/lib/highlight'
import { data, resolveTitle } from '@/lib/wiki'
import { hydrateWikiLinks } from '@/components/PageView'
import { closeAllDocs, closeDoc, getOpenDocs, openDoc, setActiveDoc, subscribeOpenDocs, getOpenDocsVersion } from '@/lib/openDocs'
import NumberedSource from '@/components/NumberedSource'
import PanelFrame from './PanelFrame'

interface Props {
  vaultId: string
}

const baseName = (p: string) => p.split('/').pop() ?? p

/** 快照里的 page.file 是绝对路径；削成 vault 相对路径，与左栏「文件」开的 tab 保持同一键 */
function vaultRel(absFile: string): string {
  const root = data.vault?.replace(/\\/g, '/').replace(/\/+$/, '') ?? ''
  return root && absFile.startsWith(root + '/') ? absFile.slice(root.length + 1) : absFile
}

/** 右栏「文档」tab：支持同时打开多个文件（tab 条切换/关闭），套 PanelFrame 统一 chrome；无文档时引导空态 */
export default function PreviewPanel({ vaultId }: Props) {
  useSyncExternalStore(subscribeOpenDocs, getOpenDocsVersion)
  const { docs, active } = getOpenDocs(vaultId)
  const [content, setContent] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ size: number; truncated: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [srcView, setSrcView] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // 会话内内容缓存：切回已读 tab 不重新拉取（键含 vaultId，避免跨库同名相对路径串内容）
  const cache = useRef(new Map<string, { content: string; meta: { size: number; truncated: boolean } }>())

  useEffect(() => {
    if (!active) {
      setContent(null)
      setMeta(null)
      setError(null)
      return
    }
    const key = `${vaultId}::${active}`
    const hit = cache.current.get(key)
    if (hit) {
      setContent(hit.content)
      setMeta(hit.meta)
      setError(null)
      setSrcView(false)
      return
    }
    let alive = true
    setContent(null)
    setError(null)
    setSrcView(false)
    readFile(active)
      .then((r) => {
        if (!alive) return
        const v = { content: r.content, meta: { size: r.size, truncated: r.truncated } }
        cache.current.set(key, v)
        setContent(v.content)
        setMeta(v.meta)
      })
      .catch((e) => alive && setError(String((e as Error)?.message || e)))
    return () => {
      alive = false
    }
  }, [active, vaultId])

  const html = useMemo(() => {
    if (content == null || srcView || !active?.endsWith('.md')) return ''
    const body = content.replace(/^---[\s\S]*?---\r?\n/, '').replace(/^# .+$/m, '')
    return marked.parse(body, { async: false, gfm: true }) as string
  }, [content, srcView, active])

  useEffect(() => {
    if (!ref.current || !html) return
    highlightBlocks(ref.current)
    // 与阅读模式一致：[[双链]] 解析 + 悬停预览 + 断链样式；命中则作为新文档 tab 打开（留在工作区）
    hydrateWikiLinks(ref.current, (target) => {
      const hit = resolveTitle(target)
      if (hit) openDoc(vaultId, vaultRel(hit.file))
    })
  }, [html, vaultId])

  const isMd = active?.endsWith('.md')

  return (
    <PanelFrame
      icon={FileText}
      title={active ? baseName(active) : '文档'}
      meta={
        docs.length > 1
          ? `${docs.length} 个 · ${meta ? (meta.size / 1024).toFixed(1) + ' KB' : '—'}`
          : meta
            ? `${(meta.size / 1024).toFixed(1)} KB${meta.truncated ? ' · 已截断' : ''}`
            : undefined
      }
      actions={
        <>
          {docs.length > 0 && (
            <button
              onClick={() => closeAllDocs(vaultId)}
              title="关闭全部文档"
              className="shrink-0 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10.5px] text-fg-muted transition-colors hover:text-fg"
            >
              全部关闭
            </button>
          )}
          {isMd && content != null ? (
            <button
              onClick={() => setSrcView((v) => !v)}
              title={srcView ? '切换到渲染视图' : '查看源码'}
              className={`shrink-0 rounded-md border p-1 transition-colors ${
                srcView ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line bg-surface text-fg-muted hover:text-fg'
              }`}
            >
              {srcView ? <Eye size={12} /> : <Code2 size={12} />}
            </button>
          ) : undefined}
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* 多文档 tab 条：超过一个才占行高；横向滚动，chip 悬停出 × */}
        {docs.length > 1 && (
          <div className="flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-line px-2 py-1">
            {docs.map((d) => {
              const isActive = d === active
              return (
                <span
                  key={d}
                  className={`group flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-[3px] text-[11px] transition-colors ${
                    isActive ? 'border-accent/50 bg-accent/10 text-fg' : 'border-line bg-surface text-fg-muted hover:text-fg-secondary'
                  }`}
                  title={d}
                >
                  <button onClick={() => setActiveDoc(vaultId, d)} className="max-w-[9rem] truncate">
                    {baseName(d)}
                  </button>
                  <button
                    onClick={() => closeDoc(vaultId, d)}
                    aria-label={`关闭 ${baseName(d)}`}
                    className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-surface-raised group-hover:opacity-100"
                  >
                    <X size={10} strokeWidth={2.4} />
                  </button>
                </span>
              )
            })}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          {!active ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[11.5px] leading-5 text-fg-muted">
              <FileText size={20} className="opacity-40" />
              在左栏「文件」中选择一个文件以预览
              <span className="flex items-center gap-1 opacity-70">
                <Layers size={11} /> 可同时打开多个（最多 10 个），以 tab 切换
              </span>
            </div>
          ) : error ? (
            <div className="p-4 text-[12px] text-cat-concept">{error}</div>
          ) : content == null ? (
            <div className="flex items-center gap-2 p-4 text-[12px] text-fg-muted">
              <Loader2 size={13} className="animate-spin" />
              加载中…
            </div>
          ) : srcView || !isMd ? (
            <NumberedSource text={content} className="h-full overflow-y-auto p-4 font-mono text-[11.5px] leading-[1.7] text-fg-secondary" />
          ) : (
            <div ref={ref} className="prose-wiki h-full overflow-y-auto p-4 text-[13px]" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
      </div>
    </PanelFrame>
  )
}
