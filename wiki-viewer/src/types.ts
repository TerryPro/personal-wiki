export type Category = 'source' | 'entity' | 'concept' | 'synthesis' | 'meta' | 'raw' | 'output'

export interface WikiPage {
  id: string
  slug: string
  file: string
  title: string
  category: Category
  categoryLabel: string
  aliases: string[]
  tags: string[]
  sources: string[]
  created: string
  updated: string
  links: string[]
  excerpt: string
  content: string
  /** raw 页：消化它的 source 页 id 列表 */
  digestedBy?: string[]
  /** raw/output 页：文件字节数与修改时间 */
  size?: number
  mtime?: string
}

/** 断链：被引用但目标页面不存在；from = 引用它的页面 */
export interface BrokenLink {
  target: string
  from: { id: string; title: string }[]
}

export interface WikiData {
  syncedAt: string
  vault: string
  pages: WikiPage[]
  brokenLinks?: BrokenLink[]
  /** raw/ 消化进度汇总 */
  digestion?: { total: number; digested: number; undigestedFiles: string[] }
  /** output/ 中非 Markdown 附件条目 */
  outputAttachments?: { name: string; size: number; mtime: string }[]
}

/** 正文大纲条目（h2–h4），id 与渲染 DOM 中的标题一一对应 */
export interface OutlineItem {
  id: string
  text: string
  level: number
}

/** 跨模式任务：Wiki 阅读模式发起，交给 AI 管理模式执行 */
export type AgentTask =
  | { type: 'ingest'; rawFile: string; title: string }
  | { type: 'lint'; issues: string[] }
