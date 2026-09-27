# LLMWIKI 工作区文档索引

> 目的：新会话**先读这里**，避免重复探索代码库。本目录是跨会话的事实来源（single source of truth）。
> 前端布局/术语/尺寸规范见 [LAYOUT.md](./LAYOUT.md)。

## 文档清单

| 文档 | 内容 | 何时读 |
|---|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 工作区结构、多知识库(vaults)、wiki-viewer 双模式、agent-server、数据流、审核门、流单例 | 理解系统/改架构前 |
| [API.md](./API.md) | agent-server 全部 HTTP 路由 + SSE 事件协议 + 请求/响应字段 | 改前后端通信前 |
| [WORKFLOWS.md](./WORKFLOWS.md) | 建库/加原料/摄取/审核/查询/体检/同步 的操作手册 | 执行日常操作时 |
| [PITFALLS.md](./PITFALLS.md) | 踩过的坑：根因 + 修复 + 预防（多 vault 参数、glob vs fetch、暂存恢复、UI 对齐等） | 遇到相似 bug / 写新代码前 |
| [CONVENTIONS.md](./CONVENTIONS.md) | 命名/术语/颜色/尺寸/localStorage 键/内容语言 等约定 | 写新 UI 或新模块前 |
| [LAYOUT.md](./LAYOUT.md) | 前端布局权威规范：术语表/双模式结构/顶栏约定/布局原则/索引/右栏/消息流/尺寸令牌 | 改任何 UI 布局前 |

## 一分钟速览

- **两个知识库**：`llmwiki`（AI/LLM 研究）、`pi-coding-agent`（pi 文档），注册于根 `vaults.json`。
- **wiki-viewer**（React+Vite，:5173）：阅读模式 + 工作模式；数据来自 `public/data/vaults/*.json`（运行时 fetch）。
- **agent-server**（Node ESM，:8787，仅 localhost）：内嵌 pi SDK；所有 vault 写入经 `.staging/` 审核门。
- **写入唯一通道**：审核门 apply（人工审 diff 后落盘 + 自动 sync）。viewer 不直写 vault。
- **启动**：`cd agent-server && npm start`；`cd wiki-viewer && npm run dev`。

## 维护守则

- 改动架构/API/约定后，**同步更新对应文档**（尤其 ARCHITECTURE/API/CONVENTIONS）。
- 新踩的坑追加到 PITFALLS.md（根因+修复+预防三段式）。
- 文档与代码冲突时以代码为准，并立即修正文档。
