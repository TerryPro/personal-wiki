# 操作手册（WORKFLOWS）

## 0. 启动

```powershell
cd f:\WIKI\LLMWIKI\agent-server; npm start      # :8787（需已 pi login）
cd f:\WIKI\LLMWIKI\wiki-viewer;  npm run dev     # :5173（dev 自带 sync 前置）
# 生产：npm run build；预览：npm run preview
```

## 1. 新建知识库

- **UI**：顶栏 VaultSwitcher → 「+ 新建知识库」→ 填名称/ID/描述/路径 → 创建（server 跑 new-vault.mjs + sync）→ 自动 reload 切到新库。
- **CLI**：`cd wiki-viewer; node scripts/new-vault.mjs --id <id> --name <名> [--path <rel>] [--description <文本>]`
- 产物：目录结构 + wiki/index.md + wiki/log.md + AGENTS.md(模板) + .pi/skills(复制) + 注册表条目 + 快照。
- 校验：`GET /agent/skills?vaultId=<id>` 应返回 4 个 second-brain 技能。

## 2. 添加原料到 raw/

三选一（都自动 sync）：
- **收件箱上传**：工作模式 → 知识库 tab → 收件箱 → 拖拽/选择文件（.md/.txt→raw/，图片→raw/assets/）。
- **URL 剪藏**：收件箱粘贴网址 → 剪藏（server fetch + turndown；JS 渲染/反爬页会报空，改用 Obsidian Web Clipper）。
- **手动**：把 .md 直接放 `<vault>/raw/` **顶层**（子目录不被扫描），然后 `npm run sync`。
- 官方文档类原料推荐直接 git clone 后复制 `docs/*.md` 到 raw/（零转换损耗）。

## 3. 摄取（ingest）

- 入口：工作模式聊天输入 `/skill:second-brain-ingest <文件或批次说明>`；或 知识库 tab「待消化原料」逐条点「摄取」。
- **分批**：每批 ≤ 8–10 篇（按主题分组），一次性全摄取会爆上下文/输出且 diff 不可审。
- 过程：agent 写 wiki/ → 全部重定向到 `.staging/<sid>/` → 回合结束右栏自动开「审查」。
- **审核**：右栏审查 tab → 逐文件 ✓应用/✕撤销，或 footer 应用全部/丢弃 → apply 落盘 + sync。
- 消化标记：raw 文件被某 source 页 `sources:` 引用即视为已消化（队列自动划掉）。

## 4. 查询 / 综合 / 成品

- 聊天直接提问（query 模式，只读工具）；好答案点「保存到 output/」。
- `/skill:second-brain-query` 走技能流程；跨来源综合结论可让 agent 写 synthesis 页（经审核门）。

## 5. 健康检查（lint）

- 阅读模式 Welcome「知识健康」仪表盘 → 展开指标 → 「用 LLM 修复这 N 项」。
- 或聊天 `/skill:second-brain-lint`。节奏：每 10 次摄取 / 每月 / 大查询前。

## 6. 同步与刷新

- 手动：`cd wiki-viewer; npm run sync`。
- 自动：apply / save-output / upload / clip / new-vault 后。
- 前端刷新时机：切回阅读模式、窗口聚焦 会自动 refetch 当前 vault；或手动刷新页面。

## 7. 会话与上下文

- 会话持久化在 `~/.pi/agent/sessions/<cwd>/`，与 pi CLI 互通。
- 上下文压力看 TopBar AgentInfo ctx meter（绿<60% / 金60-85% / 红>85%）；红了用 `/compact`。
- 切换会话：左栏「会话」tab；重命名 `/name <新名>`。

## 8. 服务器重启 / 待审恢复

- 重启不丢待审：启动时 + 查询 `/agent/staging` 时自动 `recoverFromDisk` 重建孤儿暂存会话。
- 若 UI 没显示：工作模式 → 知识库 tab「暂存待审」→ 点击打开审查；或右栏审查 tab 选择器。

## 9. 常用排查

| 现象 | 处理 |
|---|---|
| 会话列表有但点开"会话不存在" | 前端 vaultId 未带（已修）；确认当前 vault 与会话所属库一致 |
| 待审不显示 | server 重启过 → 点刷新/暂存待审（会触发磁盘恢复） |
| 图谱崩溃 | 跨 vault 残留边（已加防御）；刷新即可 |
| 剪藏为空 | 目标页 JS 渲染/反爬 → 用 Obsidian Web Clipper 或手动存 raw/ |
| 数据不新 | 切回阅读模式/聚焦窗口自动 refetch；或手动刷新；prod 需重新 sync 后刷新 |
