---
tags: [ai, llm, llm-wiki]
sources: [How-to-Build-Karpathys-LLM-Wiki.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["Karpathy LLM Wiki 完全指南（Starmorph）"]
---

# Karpathy LLM Wiki 完全指南（Starmorph）

**Source:** How-to-Build-Karpathys-LLM-Wiki.md
**Date ingested:** 2026-09-25
**Type:** 英文教程/综述（blog.starmorph.com）

## Summary

对 [[concepts/llm-wiki-pattern|LLM Wiki 模式]] 最系统的英文指南：从知识库为何崩塌讲起，覆盖三层架构、三操作、[[entities/claude-code|Claude Code]] + [[entities/obsidian|Obsidian]] 完整搭建步骤、生产级 schema 模板、RAG 对比、工具栈、社区实现、思想谱系与批评。

## Key Claims

- 知识库死于维护成本：收集容易、组织困难、维护在规模下"不可能"；LLM 恰好擅长这种簿记
- 编译类比：raw 是源码、LLM 是编译器、wiki 是 executable、lint 是测试、query 是运行时
- LLM Wiki 本质是**手动可追溯的 Graph RAG 实现**——无需图数据库、实体抽取管道、本体工程
- RAG 八维对比：无状态 vs 有状态、向量库基础设施 vs 一个文件夹、chunk 级引用 vs 源级引用、矛盾不可见 vs lint 标记
- Karpathy 三阶段演化：Vibe Coding（2025-02）→ Agentic Engineering（2026-01）→ LLM 知识库（2026-04），每阶段把更多认知劳动移交给 LLM
- 传播数据：2026-04-04 推文 16M+ 浏览，gist 数日内 5000+ stars，一周内 7+ 开源实现
- 实测案例：三本商业书（约 15.5 万词）产出 210 个概念页、约 4600 条交叉引用，且出现跨书非指令性综合
- schema 页面模板引入 confidence（high/medium/low）字段，配合 [[entities/dataview|Dataview]] 查询低置信页面
- 关联项目：Jeremy Howard 的 llms.txt（对外：让 LLM 懂你的网站）与 LLM Wiki（对内：用 LLM 懂你的领域）共享"markdown 是 LLM 最佳格式"的哲学；[[entities/qmd|qmd]] 作者是 Shopify CEO Tobi Lütke
- 社区实现清单：lucasastorian/llmwiki、Ar9av/obsidian-wiki、**NicholasSpisak/second-brain**（本 vault 所用 skill 的上游仓库）、ussumant/llm-wiki-compiler、CacheZero、kfchou/wiki-skills、rohitg00 的 [[concepts/llm-wiki-v2|LLM Wiki v2]]

## Entities Mentioned

- [[entities/andrej-karpathy|Andrej Karpathy]]、[[entities/obsidian|Obsidian]]、[[entities/qmd|qmd]]（Tobi Lütke）、[[entities/dataview|Dataview]]、[[entities/claude-obsidian-community|社区实现项目]]、[[entities/claude-code|Claude Code]]

## Concepts Covered

- [[concepts/llm-wiki-pattern|LLM Wiki 模式]]、[[concepts/rag|RAG]]、[[concepts/retrieval-vs-compilation|检索式与编译式范式]]、[[concepts/scale-and-hybrid-strategy|规模边界与混合策略]]、[[concepts/karpathy-four-principles|Karpathy AI 个性化四原则]]、[[concepts/llm-wiki-v2|LLM Wiki v2 扩展模式]]、[[concepts/memex|Memex]]
