// vault.mjs — 知识库路径解析与页面上下文拼装（不依赖前端快照，直接读文件系统）
// 多 vault 版本：所有函数接受 vaultPath 参数，不再依赖模块级 VAULT 常量。
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { getVaultPath, getDefaultVaultId } from './registry.mjs'

/** 向后兼容：默认 vault 路径（仅用于启动日志等无请求上下文的场景） */
export const DEFAULT_VAULT = getVaultPath(getDefaultVaultId()) || resolve(join(import.meta.dirname || '.', '..', '..', 'llmwiki'))

/** viewer 页面 id（category/filename.md）→ vault 内相对路径 */
const CAT_DIR = {
  source: 'wiki/sources',
  entity: 'wiki/entities',
  concept: 'wiki/concepts',
  synthesis: 'wiki/synthesis',
  meta: 'wiki',
  raw: 'raw',
  output: 'output',
}

export function pageIdToRelPath(pageId) {
  const slash = pageId.indexOf('/')
  if (slash < 0) return null
  const cat = pageId.slice(0, slash)
  const dir = CAT_DIR[cat]
  return dir ? `${dir}/${pageId.slice(slash + 1)}` : null
}

const MAX_CONTEXT_CHARS = 16000

/** 当前浏览页的上下文块（供注入 prompt）；页面不存在时返回空串 */
export function pageContextBlock(vaultPath, pageId) {
  if (!pageId) return ''
  const rel = pageIdToRelPath(pageId)
  if (!rel) return ''
  const file = join(vaultPath, rel)
  if (!existsSync(file)) return ''
  let content = readFileSync(file, 'utf8')
  const truncated = content.length > MAX_CONTEXT_CHARS
  if (truncated) content = content.slice(0, MAX_CONTEXT_CHARS) + '\n…（已截断）'
  return `\n【用户当前正在浏览的页面】${rel}${truncated ? '（节选）' : ''}\n\n${content}\n`
}

/** 直接读取 vault 内任意相对路径文本（供摄取等模式使用），越界/不存在返回 null */
export function readVaultFile(vaultPath, rel) {
  const file = resolve(join(vaultPath, rel))
  if (!file.startsWith(resolve(vaultPath))) return null // 防目录穿越
  if (!existsSync(file)) return null
  return readFileSync(file, 'utf8')
}

/** query 模式系统提示词附加段（AGENTS.md 由 pi 资源加载器自动注入，这里只补工作台专属规则） */
export const QUERY_GUIDE = `## 当前运行模式：wiki-viewer 知识库工作台

你正在为一个 LLM Wiki 知识库浏览器（wiki-viewer）提供全功能知识库服务（问答 + 整理 + 写入）：

1. 优先阅读 wiki/index.md 与相关 wiki 页面回答；wiki 中没有答案时才回读 raw/ 原始资料。
2. 回答使用简体中文，提及知识库页面时用 \`[[路径/文件名|显示标题]]\` 双链引用（遵循 AGENTS.md 链接规则），浏览器会把它们渲染为可点击跳转。
3. 你可以用 write/edit 修改文件，但所有写入都被审核门重定向到暂存区：只允许写 wiki/ 目录；回合结束后用户审核 diff 并选择应用或丢弃。raw/ 不可变，output/ 请走专用保存接口，不要尝试绕过审核门。
4. 用户要求写入知识库（新建/修订页面、沉淀综合结论、修复健康问题）时直接执行，并在回答中说明改动清单；无需再建议用户手动保存。
5. 回答保持聚焦：先给结论，再展开依据，并注明出处页面。`

/**
 * ingest/lint 写入模式共享审核门说明：
 * 服务器不启用 project trust（避免 .pi/extensions 的 ok MCP 桥绕过工具白名单），
 * 流程要点由本 guide 内置（与 .pi/skills/second-brain-* 同源）。
 */
export const REVIEW_GATE_NOTE = `## 写入审核门（重要）

你的所有 write/edit 调用会被服务器自动重定向到暂存区，**不会直接落盘**；完成后由人工审阅 diff 决定应用或丢弃。因此：

- 直接按正常目标路径写（如 wiki/sources/xxx.md），不要关心暂存机制，也不要试图绕过它。
- 不要中途停下来等待确认——一次性完成全部写入，最后用一段话汇报：关键要点、创建/更新的页面清单、发现的矛盾。
- 只允许写 wiki/ 目录；写 raw/ 或其他位置会被拒绝。
- 链接一律用路径式写法 [[category/file-name|显示标题]]；内容用简体中文（专名/术语保留原文）。`

export const INGEST_GUIDE = `## 当前运行模式：ingest（摄取新原料）

${REVIEW_GATE_NOTE}

按以下流程处理指定的 raw 文件（second-brain-ingest 规范）：

1. 完整阅读来源文件（含图片引用时记录它们；重要图表用文字描述入页）。
2. 在 wiki/sources/ 创建来源摘要页（kebab-case 文件名），frontmatter 含 tags/sources/aliases/created/updated；正文含：来源元信息、摘要、核心论断、提及实体、涉及概念。摘要页只记录事实，解读放概念/综合页。
3. 对文中每个实体（人物/组织/产品/工具）与概念（思想/框架/理论/模式）：已有页面则读取后补充新信息、追加 sources、更新 updated 日期、标注矛盾并引用双方来源；没有则在 wiki/entities/ 或 wiki/concepts/ 新建聚焦页。优先更新已有页面而非新建。
4. 在所有相关页面间补齐 [[双链]]。
5. 更新 wiki/index.md（每新页一行，<120 字符，放对分类标题下）。
6. 追加 wiki/log.md：\`## [YYYY-MM-DD] ingest | 来源标题\` + 一段描述（新建 N 页、更新 M 页、新实体/概念链接）。log.md 只能追加，绝不修改已有条目。

单个来源涉及 10-15 个 wiki 页面属正常范围。`

export const LINT_GUIDE = `## 当前运行模式：lint（健康修复）

${REVIEW_GATE_NOTE}

针对用户列出的健康问题执行修复（second-brain-lint 规范）：

1. 先阅读相关页面确认问题属实，再修复：断链→修正链接或创建缺失页；孤立页→在相关页面中自然地补链；陈旧页→用更新来源的信息刷新并更新 updated 日期；矛盾→保留双方说法并标注矛盾、引用两个来源。
2. 创建/删除页面时同步更新 wiki/index.md；完成后追加 wiki/log.md：\`## [YYYY-MM-DD] lint | 修复摘要\`。
3. 修复保守克制：只处理用户列出的问题，不顺手重写无关内容。`

/** 拼装写入模式的用户 prompt */
export function buildTaskPrompt(mode, detail) {
  if (mode === 'ingest')
    return `请对 ${detail} 执行 ingest：${INGEST_FLOW_HINT}`
  return detail
}

const INGEST_FLOW_HINT = '完整阅读该原始资料，按系统提示词中的 ingest 流程生成/更新全部相关 wiki 页面（来源摘要页 + 派生实体/概念 + 双链 + index.md/log.md），最后汇报结果。'
