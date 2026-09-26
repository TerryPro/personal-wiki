export type Category = 'source' | 'entity' | 'concept' | 'synthesis' | 'meta'

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
}

/** 正文大纲条目（h2–h4），id 与渲染 DOM 中的标题一一对应 */
export interface OutlineItem {
  id: string
  text: string
  level: number
}
