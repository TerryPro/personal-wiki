---
tags: [ai, llm, knowledge-management]
sources: [llm.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["LLM Wiki 模式（来源摘要）"]
---

# LLM Wiki 模式（来源摘要）

**Source:** llm.md
**Date ingested:** 2026-09-25
**Type:** 思想文件（idea file）
**作者：** [[entities/andrej-karpathy|Andrej Karpathy]]（gist 原文链接）

## Summary

本文是 [[entities/andrej-karpathy|Andrej Karpathy]] 撰写的「用 LLM 构建个人知识库」模式说明，刻意保持抽象、不含具体实现，设计为直接粘贴给用户的 LLM agent，由 agent 与用户协作实例化。核心主张：用 [[concepts/llm-wiki-pattern|LLM Wiki 模式]] 取代传统 RAG——LLM 不在查询时才从原始文档中重新拼装知识，而是增量构建并持续维护一个持久的互链 markdown wiki。系统分三层（见 [[concepts/three-layer-architecture|三层知识架构]]），由 schema 文件（即 [[concepts/schema-driven-agent|Schema 驱动代理]]）约束 LLM 行为，围绕三种操作运转：Ingest（摄取）、Query（查询）、Lint（体检）。两个特殊文件 index.md 与 log.md 承担导航职责。作者认为该模式奏效的原因是：知识库的痛点不是阅读与思考，而是记账式的维护；人类会因维护负担放弃 wiki，而 LLM 的维护成本趋近零（见 [[concepts/human-llm-division-of-labor|人机分工]]）。思想上承接 [[concepts/memex|Memex]]。工具建议：[[entities/obsidian|Obsidian]]（IDE 隐喻）、[[entities/qmd|qmd]]（搜索）、[[entities/marp|Marp]]（幻灯片）、[[entities/dataview|Dataview]]（frontmatter 查询）。

## Key Claims

- 传统 RAG（[[entities/notebooklm|NotebookLM]]、ChatGPT 文件上传）每次提问都从零重新发现知识，没有积累；wiki 模式让知识"编译一次、持续保鲜"
- wiki 是持久的复利产物（[[concepts/compounding-knowledge|知识复利]]）：交叉引用已就位、矛盾已标记、综合已反映全部所读内容
- 人几乎不写 wiki——LLM 撰写并维护全部内容；人负责选料、探索、提问
- "Obsidian 是 IDE；LLM 是程序员；wiki 是代码库"
- 单次摄取触及 10~15 个 wiki 页面属正常
- 好的查询答案应回填为 wiki 新页面，让探索与摄取同样复利
- 中等规模（约 100 个来源、数百页面）下，仅靠 index.md 导航即可，无需向量检索基础设施
- log.md 条目采用统一前缀（如 `## [2026-04-02] ingest | Article Title`）即可用 grep 等 unix 工具解析
- 人类放弃 wiki 的根因是维护成本增长快于价值；LLM 不会厌倦、不会遗漏引用更新，故维护成本趋近零
- 本文档一切内容可选、模块化——"正确的用法是把文档交给你的 LLM agent，一起实例化适合你自己的版本"

## Entities Mentioned

- [[entities/andrej-karpathy|Andrej Karpathy]] — 本文档作者，提出该模式的 LLM agent 实践者
- [[entities/obsidian|Obsidian]] — markdown 知识库应用，作为 wiki 的阅读与浏览界面（网页剪藏、图谱视图、附件下载、Marp/Dataview 插件）
- [[entities/qmd|qmd]] — 本地 markdown 搜索引擎（tobi/qmd），混合 BM25/向量检索 + LLM 重排序，提供 CLI 与 MCP 两种接口
- [[entities/marp|Marp]] — 基于 markdown 的幻灯片格式，Obsidian 有对应插件
- [[entities/dataview|Dataview]] — Obsidian 插件，可对页面 frontmatter 运行查询生成动态表格

## Concepts Covered

- [[concepts/llm-wiki-pattern|LLM Wiki 模式]] — 本文核心：LLM 增量构建并维护持久互链 wiki
- [[concepts/rag|RAG]] — 作为对照：查询时检索片段、无知识积累
- [[concepts/three-layer-architecture|三层知识架构]] — raw sources / wiki / schema 三层及其所有权
- [[concepts/schema-driven-agent|Schema 驱动代理]] — schema 配置文件使 LLM 成为"有纪律的 wiki 维护员"
- [[concepts/compounding-knowledge|知识复利]] — wiki 与回填的答案共同积累增值
- [[concepts/human-llm-division-of-labor|人机分工]] — 人选料提问，LLM 做全部簿记
- [[concepts/memex|Memex]] — Vannevar Bush 1945 年的设想，本模式的思想源头
