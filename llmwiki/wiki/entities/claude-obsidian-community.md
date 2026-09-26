---
tags: [llm-tools, ai, agents]
sources: [agent-obsidian-llm-wiki-claude-obsidian-csdn.md, self-growing-knowledge-base-workbuddy-obsidian.md, How-to-Build-Karpathys-LLM-Wiki.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["Claude-Obsidian 与社区实现"]
---

# Claude-Obsidian 与社区实现

## 定义

[[concepts/llm-wiki-pattern|LLM Wiki 模式]] 发布一周内涌现的开源实现群。其中 **claude-obsidian**（AgriciDaniel）是工程化落地最完整的代表：把初始化、入库、索引、检索封装为可复用的 Agent Skill，名字虽含 Claude，实际可在 Codex、Cursor、WorkBuddy 等任意 agent 中使用。

## claude-obsidian 要点

- 安装：`claude plugin marketplace add AgriciDaniel/claude-obsidian` → `claude plugin install claude-obsidian@agricidaniel-claude-obsidian`
- `wiki` 指令初始化：先问用途，内置 **6 种场景模式**（项目研究/个人成长等），每种对应不同 wiki 层目录结构（标准基础结构 + 模式特有层）
- 核心命令：`wiki-ingest`（hash 去重摄取）、`wiki-query`（index→页面检索）、`save`（答案归档为 question 页）、`wiki-lint`（健康报告写入 wiki/meta）、`autoresearch`（联网补库）、`wiki-retrieve`（BM25+向量重排的本地检索）
- 特色机制：`_templates` 模板约束、`raw/.manifest.json` 摄取去重、`hot.md` 上下文缓存（覆盖式，约 500 词，宣称省 70%+ token）
- 详见 [[sources/claude-obsidian-engineering-practice-csdn|claude-obsidian 工程化实践详解（CSDN）]]

## 其他社区实现（Starmorph 指南收录）

| 项目 | 定位 |
|---|---|
| lucasastorian/llmwiki | 上传文档 + MCP 连接 Claude |
| Ar9av/obsidian-wiki | agent 构建 Obsidian wiki 的框架 |
| **NicholasSpisak/second-brain** | LLM 维护的 Obsidian 知识库——**本 vault 所用 skill 即出自此仓库** |
| ussumant/llm-wiki-compiler | markdown 知识文件编译为主题 wiki |
| CacheZero | 一条 `npm install` 的实现 |
| kfchou/wiki-skills、Astro-Han/karpathy-llm-wiki | [[entities/claude-code|Claude Code]] 技能包 |
| rohitg00 LLM Wiki v2 | 扩展模式（见 [[concepts/llm-wiki-v2|LLM Wiki v2 扩展模式]]） |

## 观察

实现虽多，共识结构不变（raw/wiki/schema + ingest/query/lint）——印证模式本身（而非某个工具）才是可迁移资产，符合 [[concepts/karpathy-four-principles|Karpathy AI 个性化四原则]] 的 BYOAI 精神。WeSight 等 Obsidian 内嵌插件代表了另一路线：把操作入口收进 vault 界面（见 [[sources/self-growing-knowledge-base-canghe|自生长个人知识库实战（苍何）]]）。

## 相关页面

- [[entities/obsidian|Obsidian]]、[[entities/qmd|qmd]]
