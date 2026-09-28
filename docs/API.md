# agent-server API 参考

Base: `http://127.0.0.1:8787`（仅 localhost）。dev 下经 vite proxy `/agent` 转发。
**所有 vault 作用域的接口都必须带 `vaultId`**（query 或 body），否则回落到注册表第一条（llmwiki）→ 跨库取错数据。

## 基础

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/agent/health` | `{ok, piVersion, vault, vaults}` 探活 |

## 多知识库

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/agent/vaults` | `{vaults: VaultEntry[]}` 注册表 |
| POST | `/agent/vaults/new` | body `{id,name,path?,description?}` → 执行 new-vault.mjs → `{ok, vaults}` |

## raw 收件箱（不经审核门，server 直写 + sync）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/agent/raw/upload` | body `{vaultId, files:[{name, contentBase64}]}`；.md/.txt→raw/，图片→raw/assets/；重名加 -N；单文件≤20MB |
| POST | `/agent/raw/clip` | body `{vaultId, url}` → fetch+turndown 转 Markdown 存 `raw/<slug>.md`（带 source/title/clipped frontmatter） |
| POST | `/agent/raw/mark` | body `{vaultId, file, ingested}` → 人工消化标记：只改 raw 文件 frontmatter 的 `ingested` 字段（true/false）后重跑 sync。file 兼容裸文件名（自动补 raw/ 前缀）；仅限 raw/ 下 .md；无 frontmatter 块→400，越界路径→403，不存在→404 |

## 会话（SSE 流）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/agent/chat` | body `{vaultId, message, sessionId?, model?, thinkingLevel?, contextPageId?}`；SSE 流。`/skill:name args` 与 `@file` 由 server 解析（技能走系统提示索引，@file 注入内容） |
| POST | `/agent/task` | body `{vaultId, mode:'ingest'|'lint', rawFile?|issues?, sessionId?}`；SSE 流；写入经审核门 |

### SSE 事件协议

`session{sessionId,name,mode}` · `turnstart` · `delta{text}` · `thinking{text}` · `tool{id,name,state:'start'|'end',args?,isError?,durationMs?,result?}` · `turn{model,usage{input,output,cacheRead},cost}` · `usage{cost,contextUsage{tokens,contextWindow,percent}}`（流开始与结束各推一次） · `diffs{sessionId,mode,files[]}` · `done` · `error{message}`

## 会话管理

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/agent/sessions?vaultId=` | `{sessions:[{id,name,created,modified,messageCount,firstMessage}]}` |
| GET | `/agent/sessions/:id/messages?vaultId=` | `{sessionId,name,messages[],usage?}`；usage 仅活跃缓存会话有值 |
| GET | `/agent/sessions/:id/context?vaultId=` | 上下文检视 `{active,mode,vaultId,model,systemPrompt,tools[],contextUsage,cost}`；系统提示运行时拼装，冷会话由 server 按磁盘转录懒恢复（mode=query，首次略慢）；会话不存在/无法恢复时 404 |
| POST | `/agent/sessions/:id/rename` | body `{name, vaultId}` |
| DELETE | `/agent/sessions/:id?vaultId=` | 删除会话文件 |
| POST | `/agent/compact` | body `{sessionId}` 压缩上下文 |

## 审核门（staging）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/agent/staging?vaultId=` | 待审会话列表（查询时按需 recoverFromDisk） |
| GET | `/agent/staging/:id` | `{sessionId, files:[{path,status:'new'|'modified',diff}]}` |
| POST | `/agent/apply` | body `{sessionId, vaultId, files?[]}`；files 省略=全部；子集=逐文件；返回 `{ok,changed,synced,done,remaining}` |
| POST | `/agent/discard` | body `{sessionId, vaultId, files?[]}`；返回 `{ok,done,remaining}` |
| POST | `/agent/save-output` | body `{vaultId,title,content,question?}` → 写 `output/<slug>-<date>.md` + sync |

## 文件浏览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/agent/files?vaultId=&path=` | 目录列表（隐藏 .staging/.git/node_modules/.obsidian/.ok/.cursor；保留 .pi） |
| GET | `/agent/file?vaultId=&path=` | 文件内容（>2MB 截断） |
| GET | `/agent/search?vaultId=&q=` | q 空=最近 30 文件；否则子串匹配按路径长度排 |

## 模型 / 技能 / 扩展 / 工具

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/agent/models` | `{models[], defaultModel?}`（server 解析的默认模型） |
| GET | `/agent/skills?vaultId=` | 仅项目级 `.pi/skills` |
| GET | `/agent/extensions?vaultId=` | 内置 staging-gate + 项目级 extensions 清单 |
| GET/PUT | `/agent/tools` | GET 目录+各模式白名单；PUT `{mode,tools[]}` 持久化 tools.json |

## 前端客户端（lib/agent.ts）

- 模块级 `_vaultId` + `setAgentVault(id)`：所有请求自动带 vaultId。
- `streamAgent(path,body,onEvent,signal)`：fetch + ReadableStream 手工解析 SSE 帧。
- 会话流状态在 `lib/agentStream.ts` 单例（见 ARCHITECTURE §4）。
