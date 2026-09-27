// new-vault.mjs — 新建知识库脚手架
// 用法：node scripts/new-vault.mjs --id <id> --name <name> [--path <rel>] [--description <text>]
// 功能：创建 vault 目录结构 + 初始文件 + 更新 vaults.json + 重跑 sync
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, cpSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')       // wiki-viewer/
const WORKSPACE = join(ROOT, '..')       // workspace 根
const REGISTRY_PATH = join(WORKSPACE, 'vaults.json')
const TEMPLATE_PATH = join(WORKSPACE, 'agent-server', 'references', 'agents-template.md')
const SKILLS_TEMPLATE = join(WORKSPACE, 'agent-server', 'references', 'skills')
const SYNC_SCRIPT = join(__dirname, 'sync-data.mjs')

/* ————— 解析命令行参数 ————— */
function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'
      args[key] = val
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const id = args.id
const name = args.name || id
const relPath = args.path || id
const description = args.description || `${name} 知识库`

if (!id) {
  console.error('用法：node new-vault.mjs --id <id> --name <name> [--path <rel>] [--description <text>]')
  console.error('  --id          唯一标识（kebab-case，如 pi-coding-agent）')
  console.error('  --name        显示名称（如 "Pi Coding Agent"）')
  console.error('  --path        相对于 workspace 根的目录路径（默认 = id）')
  console.error('  --description 一句话描述（选填）')
  process.exit(1)
}

if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
  console.error(`[new-vault] id 格式非法（只允许小写字母、数字、连字符）：${id}`)
  process.exit(1)
}

const vaultRoot = resolve(join(WORKSPACE, relPath))

if (existsSync(vaultRoot)) {
  console.error(`[new-vault] 目录已存在：${vaultRoot}`)
  process.exit(1)
}

// 检查注册表中是否已有同 id
let registry = []
try {
  registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
} catch { /* 文件不存在时初始化为空数组 */ }
if (registry.some((v) => v.id === id)) {
  console.error(`[new-vault] vaults.json 中已存在 id=${id}`)
  process.exit(1)
}

/* ————— 创建目录结构 ————— */
const dirs = [
  '',
  'wiki',
  'wiki/sources',
  'wiki/entities',
  'wiki/concepts',
  'wiki/synthesis',
  'raw',
  'raw/assets',
  'output',
  '.pi',
  '.pi/skills',
]
for (const d of dirs) {
  mkdirSync(join(vaultRoot, d), { recursive: true })
}
console.log(`[new-vault] 目录结构已创建：${vaultRoot}`)

/* ————— 初始文件 ————— */
const today = new Date().toISOString().slice(0, 10)

// wiki/index.md
writeFileSync(
  join(vaultRoot, 'wiki', 'index.md'),
  `---
tags: [index]
aliases: ["目录"]
created: ${today}
updated: ${today}
---

# 目录

> ${description}

## 来源（Sources）

_暂无来源页。将文章剪藏到 raw/ 后执行 /second-brain-ingest 开始摄取。_

## 实体（Entities）

_暂无实体页。_

## 概念（Concepts）

_暂无概念页。_

## 综合（Synthesis）

_暂无综合页。_
`,
  'utf8',
)

// wiki/log.md
writeFileSync(
  join(vaultRoot, 'wiki', 'log.md'),
  `---
tags: [log]
aliases: ["日志"]
created: ${today}
updated: ${today}
---

# 日志

## [${today}] setup | 知识库初始化
创建知识库「${name}」，主题：${description}。
目录结构：wiki/（sources/entities/concepts/synthesis）、raw/、output/。
`,
  'utf8',
)

// AGENTS.md（从模板生成）
if (existsSync(TEMPLATE_PATH)) {
  let tpl = readFileSync(TEMPLATE_PATH, 'utf8')
  tpl = tpl.replace(/\{\{VAULT_NAME\}\}/g, name)
  tpl = tpl.replace(/\{\{DOMAIN_DESCRIPTION\}\}/g, description)
  // 生成建议标签：从名称和描述中提取关键词
  const tags = [id, ...id.split('-').filter((w) => w.length > 2)].slice(0, 6)
  tpl = tpl.replace(/\{\{DOMAIN_TAGS\}\}/g, tags.map((t) => `- ${t}`).join('\n'))
  writeFileSync(join(vaultRoot, 'AGENTS.md'), tpl, 'utf8')
  console.log('[new-vault] AGENTS.md 已从模板生成')
} else {
  console.warn(`[new-vault] ⚠ 模板不存在，跳过 AGENTS.md：${TEMPLATE_PATH}`)
}

// .pi/skills（从模板复制 second-brain 系列技能，供座舱模式 /second-brain-* 调用）
if (existsSync(SKILLS_TEMPLATE)) {
  const skillsDest = join(vaultRoot, '.pi', 'skills')
  mkdirSync(skillsDest, { recursive: true })
  cpSync(SKILLS_TEMPLATE, skillsDest, { recursive: true })
  console.log('[new-vault] .pi/skills 已从模板复制（second-brain 系列）')
} else {
  console.warn(`[new-vault] ⚠ 技能模板不存在，跳过 .pi/skills：${SKILLS_TEMPLATE}`)
}

/* ————— 更新 vaults.json ————— */
registry.push({ id, name, path: relPath, description })
writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n', 'utf8')
console.log(`[new-vault] vaults.json 已更新（共 ${registry.length} 个 vault）`)

/* ————— 重跑 sync ————— */
try {
  execFileSync(process.execPath, [SYNC_SCRIPT], { stdio: 'inherit', timeout: 60000 })
  console.log('[new-vault] 数据快照已同步')
} catch (e) {
  console.error(`[new-vault] ⚠ sync 失败（vault 已创建，可手动 npm run sync）：${e.message}`)
}

console.log(`\n[new-vault] ✓ 知识库「${name}」创建完成！`)
console.log(`  路径：${vaultRoot}`)
console.log(`  下一步：将文章剪藏到 raw/，然后在 wiki-viewer 中执行 /second-brain-ingest`)
