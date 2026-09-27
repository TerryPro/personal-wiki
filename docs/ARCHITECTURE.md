# 架构（ARCHITECTURE）

## 1. 工作区结构

```
f:\WIKI\LLMWIKI\
├── vaults.json              # 知识库注册表 [{id,name,path,description}]
├── docs/                    # 跨会话文档（本目录）
├── llmwiki/                 # vault①：AI/LLM 研究
├── pi-coding-agent/         # vault②：pi coding agent 文档
│   ├── raw/                 #   不可变原始资料（仅顶层 .md 被 sync 扫描；附件 raw/assets/）
│   ├── wiki/                #   LLM 维护区：sources/ entities/ concepts/ synthesis/ + index.md + log.md
│   ├── output/              #   成品出口（一次性交付物）
│   ├── .pi/skills/          #   项目级 second-brain 技能
│   ├── .staging/<sid>/      #   审核门暂存区（agent 写入重定向到此）
│   └── AGENTS.md            #   知识库规则（由模板生成）
├── wiki-viewer/             # 前端 SPA（React18+TS+Vite+Tailwind）
│   ├── scripts/sync-data.mjs    # 多 vault 同步 → public/data/
│   ├── scripts/new-vault.mjs    # 新建 vault 脚手架
│   ├── public/data/vaults/*.json# 运行时快照（fetch 加载）
│   ├── public/data/vault-index.json
│   ├── src/lib/wiki.ts          # 数据索引 + loadVault(fetch) + dataVersion 订阅
│   ├── src/lib/agentStream.ts   # 会话流单例 store（切模式不丢流）
│   ├── src/lib/agent.ts         # agent-server 客户端（自动带 vaultId）
│   ├── src/modes/{WikiMode,AiMode}.tsx
│   ├── src/components/ai/*      # ChatWindow/ChatInput/ReviewPanel/PreviewPanel/SessionIndex/PanelFrame/AgentInfo...
│   └── (布局规范已移至根 docs/LAYOUT.md)
└── agent-server/            # 后端（Node ESM，:8787 仅 localhost）
    ├── index.mjs            # 路由 + SSE 执行器
    ├── lib/registry.mjs     # vaults.json 读取/解析/恢复入口
    ├── lib/vault.mjs        # 路径解析 + 系统提示词 guides
    ├── lib/sessions.mjs     # pi SDK 会话缓存 + 技能索引注入
    ├── lib/staging.mjs      # 审核门暂存（create/collect/apply/discard/子集/磁盘恢复）
    ├── lib/inbox.mjs        # raw 收件箱（上传写入 + URL 抓取 turndown）
    ├── lib/diff.mjs         # 零依赖 LCS unified diff
    └── references/          # agents-template.md + skills/ 模板
```

## 2. 多知识库（vaults）

- 注册表 `vaults.json` 驱动一切：sync、server 路径解析、前端切换。
- `sync-data.mjs` 遍历注册表，每 vault 生成 `public/data/vaults/<id>.json`（pages/brokenLinks/digestion/outputAttachments/vaultId）+ `vault-index.json`。
- 前端 `wiki.ts` 用**运行时 fetch** 加载（非构建期 glob），`loadVault` 后重建索引并 `notifyData()`（dataVersion+1）驱动订阅者重渲染。
- 切换 vault：App `activeVault` + `key={activeVault}` 强制 WikiMode/AiMode 重挂载 + `setAgentVault(id)` 让所有 API 带正确 vaultId。
- 新建 vault：`new-vault.mjs`（UI 对话框调 `POST /agent/vaults/new` 执行它）→ 建目录/初始 index·log/AGENTS.md/复制 skills → 更新注册表 → sync。

## 3. wiki-viewer 双模式

- **阅读模式 WikiMode**：三栏（Sidebar / 正文·图谱 / RightRail）+ 顶栏；Welcome 首页（统计+健康仪表盘）；zen 免打扰；命令面板。
- **工作模式 AiMode**：左栏(Brand+tabs 会话/知识库/文件/设置) + SessionIndex(左, mini/full) + 聊天列 + 右栏[文档|审查]。
- 模式路由 hash：`#/wiki[...]`、`#/ai`；App 为瘦壳（theme/mode/pendingTask/vaults/toast）。
- 布局/术语/尺寸规范见根目录 `docs/LAYOUT.md`。

## 4. 会话流单例（agentStream.ts）

- 持有 msgs/busy/activeId/sessionName/usage{cost,tokens,contextWindow,percent}/lastModelName/sessionsVersion + SSE 消费循环。
- AiMode 用 `useSyncExternalStore` 订阅；**卸载不断流**（切模式/切 vault 不丢进行中的对话）。
- diffs 事件多播 `addDiffsListener`：AiMode 自动开审查、App 弹 toast。
- dismissedReviews：用户主动关审查 → 自动开跳过。

## 5. agent-server 与审核门

- 内嵌 `@earendil-works/pi-coding-agent` SDK（createAgentSession / SessionManager / ModelRuntime / DefaultResourceLoader）。
- 每会话 `cwd=<vaultPath>`；工具白名单按模式（tools.json 可配）。
- **审核门**：inline extension 拦截 write/edit → 重定向到 `<vault>/.staging/<sid>/`（只允许 wiki/ 内）；read 命中已暂存文件也重定向。回合结束推 diffs → 人工审 → apply(落盘+sync) / discard。
- **子集审核**：apply/discard 支持 `files[]` 逐文件；会话剩余为空自动清理。
- **磁盘恢复**：`recoverFromDisk` 在 server 启动 + `/agent/staging` 查询时按需调用，重启不丢待审。
- **技能**：系统提示注入 `formatSkillsForPrompt` 索引（仅项目级 .pi/skills）+ 斜杠说明；用户消息保持 `/skill:name args` 原文（不内联 SKILL.md）。
- **不启用 project trust**（避免 .pi/extensions 的 MCP 桥绕过白名单）。

## 6. 数据流总览

```
raw/ ──(ingest skill / agent)──> .staging/ ──(人工审 apply)──> wiki/ ──(sync)──> public/data/*.json ──(fetch)──> wiki-viewer
  ▲                                                                              │
  └──(inbox: 上传 / URL 抓取 turndown)───────────────────────────────────────────┘
```

- apply / save-output / upload / clip 后均自动 `runSync()`。
- dev 下 json 变化不再依赖 HMR（已改 fetch）；切回阅读模式/窗口聚焦会 refetch。
