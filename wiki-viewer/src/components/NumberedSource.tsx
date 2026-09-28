import { Fragment } from 'react'

interface Props {
  text: string
  /** 外层容器类：由调用方控制滚动、背景、内边距与字号 */
  className?: string
}

/**
 * 带行号的源码展示：左行号栏 + 右正文。
 * 每行是同一 grid 行，正文 pre-wrap 折行时行号对齐首视觉行、空行由行号撑高；
 * 文档面板（PreviewPanel）源码视图与阅读模式（PageView）源码/分栏视图共用。
 */
export default function NumberedSource({ text, className = '' }: Props) {
  const lines = text.split(/\r?\n/)
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return (
    <div className={className}>
      <div className="grid grid-cols-[minmax(2ch,auto)_1fr]">
        {lines.map((ln, i) => (
          <Fragment key={i}>
            <span aria-hidden className="select-none pr-2 text-right text-[0.82em] text-fg-muted/50">
              {i + 1}
            </span>
            <span className="whitespace-pre-wrap break-words pl-3">{ln}</span>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
