# 踩坑录（PITFALLS）

格式：**现象 → 根因 → 修复/预防**。新坑请追加。

## 多 vault / 数据

1. **跨库取错数据（"会话不存在"/列表错）** → vault 作用域接口未带 `vaultId`，server 回落默认库 → 所有 sessions/staging/files/skills 接口前端必须带 vaultId（agent.ts 已统一注入）。新增 vault 作用域路由时务必读 vaultId。
2. **快照不实时 / 全 0** → 曾用 `import.meta.glob` 构建期打包：新 vault json 后加不识别；dev 下 json 变化 HMR 重置模块但无人重 loadVault → pages 空 → 全 0 → 改**运行时 fetch `public/data/`** + dataVersion 订阅 + 切回阅读/窗口聚焦 refetch。
3. **模块级派生常量跨 vault 过期**（图谱崩溃 `nodes[undefined].x`） → `graphPages` 写在模块顶层只算一次，切库后与 edges 不同源 → 移入组件 `useMemo`；force.ts 边端点缺失加 `continue` 防御。
4. **raw 子目录不扫描** → sync 只读 raw/ 顶层 .md；放子目录不进队列 → 文档直接放顶层。
5. **HTML `<img src="images/..">` 不渲染** → viewer 只重写 Obsidian `![[...]]`；装饰截图可直接删，alt 文本已承载语义。

## 审核门 / 暂存

6. **server 重启丢待审** → 暂存表纯内存 → `recoverFromDisk` 启动时 + `/agent/staging` 查询时按需重建；别只依赖内存。
7. **审核入口"必须手动开"** → 单靠 diffs 事件不够（切走/刷新/恢复时不在场） → 多级自动开：挂载查 pending、diffs 监听、App toast；dismissed 集合防打扰。
8. **agent 偷改 log.md 已有条目** → 审核门 diff 如实暴露 → 人工审核不可省；逐文件应用可隔离坏文件。

## 会话流

9. **切模式对话流冻住** → App 条件渲染卸载 AiMode，SSE 回调指向已卸载组件 → 流状态移入 `agentStream.ts` 单例，卸载仅退订不断流。
10. **旧版把 SKILL.md 拼进用户消息** → 巨型气泡污染转录 → 技能索引进系统提示（formatSkillsForPrompt），用户消息保持 `/skill:name args` 原文；历史 blob 前端折叠为命令头。

## UI 对齐 / 样式

11. **`<button>` 文字居中** → UA 默认 text-align:center → 包文本的 button 显式 `text-left`。
12. **分段控件上下不对称** → `shadow-panel` 含 `0 1px 0` 底部硬阴影线吃掉 1px → 小分段控件禁用 shadow-panel（扁平 bg-surface-raised）；仅大浮层/对话框用。
13. **标题栏高度不齐** → py-* 撑高随内容行高漂移 → 统一固定 `h-9 + items-center`（全项目二级标题栏/tab 条）；顶栏/Brand 固定 46px。
14. **双态侧栏切换跳动** → 行高/头高不固定 → 固定 `h-11` 行 / `h-9` 头，两态共用同一套行。
15. **输入框文字不居中** → 容器 `items-end`（为多行贴底）使单行 textarea 沉底 → 改 `items-center`。

## 工具 / 环境

16. **DeleteFile 报成功但文件仍在** → 偶发最终一致问题 → 删除后 `Test-Path` 校验，必要时重试。
17. **JSDoc 注释里写 `.staging/*/`** → `*/` 提前终止块注释 → 注释内避免 `*/` 字面量。
18. **PowerShell 无 `head`** → 用 `Select-Object -First N`；后台起 server 后立刻查询可能端口未就绪（connection refused），稍等重试。
19. **npm install 偶发 ParserError** → Windows PowerShell 后台终端解析错乱 → 用 `--prefix` 形式或前台执行。
20. **turndown 剪藏空正文** → JS 渲染/反爬页 → 报错提示并建议 Obsidian Web Clipper。

## 摄取策略

21. **一次摄取全部文档失败/质量差** → 上下文+输出超限、diff 不可审 → 按主题分批 ≤8–10 篇；跨文档共同概念聚合建页避免重复。
