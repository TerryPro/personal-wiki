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
  /** frontmatter 原文块（含起止 ---），源码视图优先展示；旧快照无此字段时回退重建 */
  fmRaw?: string
  /** raw 页：消化它的 source 页 id 列表 */
  digestedBy?: string[]
  /** raw 页：人工消化标记（frontmatter ingested: true，sources 反查落空时兜底） */
  ingested?: boolean
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
  /** 注册表中的 vault 唯一标识（多知识库切换用） */
  vaultId: string
  pages: WikiPage[]
  brokenLinks?: BrokenLink[]
  /** raw/ 消化进度汇总（manual = 仅靠人工标记消化的数量） */
  digestion?: { total: number; digested: number; manual?: number; undigestedFiles: string[] }
  /** output/ 中非 Markdown 附件条目 */
  outputAttachments?: { name: string; size: number; mtime: string }[]
}

/** vaults.json 注册表条目 */
export interface VaultEntry {
  id: string
  name: string
  path: string
  description?: string
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
  /** 批量摄取：知识面板勾选多个 raw 文件，经聊天 skill 路径单会话顺序处理 */
  | { type: 'batch-ingest'; rawFiles: string[] }
  | { type: 'lint'; issues: string[] }
