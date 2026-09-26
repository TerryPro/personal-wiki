---
tags: [llm-tools, ai]
sources: [llm.md, How-to-Build-Karpathys-LLM-Wiki.md, llm-wiki-tech-deep-dive-csdn.md, agent-obsidian-llm-wiki-claude-obsidian-csdn.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["qmd"]
---

# qmd

## 定义

作者为 tobi 的本地 markdown 搜索引擎（GitHub: tobi/qmd）。在 [[concepts/llm-wiki-pattern|LLM Wiki 模式]] 中作为**可选工具**被推荐："一个好的选项"。

## 特性（来源文档描述）

- 混合检索：BM25 + 向量搜索，加 LLM 重排序（re-ranking）
- 完全本地运行（on-device）
- 双接口：CLI（LLM 可通过 shell 调用）+ MCP server（LLM 作为原生工具使用）

## 何时需要

- 小规模时 index.md 已足够（见 [[concepts/llm-wiki-pattern|LLM Wiki 模式]] 的导航机制）
- 当 wiki 增长到 index 无法高效导航时，才需要真正的搜索
- 来源文档也提到替代路径：需要时让 LLM 自己"vibe-code"一个朴素的搜索脚本即可

## 与本 vault 的关系

初始化向导中用户选择了暂不安装 qmd；本 vault 当前依赖 index.md 导航。AGENTS.md 的工具节中保留了它的说明，规模增长后可补装。

## 多来源补充（2026-09-25 批量摄取）

- **作者是 Shopify CEO Tobi Lütke**——技术最高层采纳的信号（[[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]]；另见 [[sources/llm-wiki-tech-deep-dive-csdn|LLM Wiki 技术深度解析（CSDN）]]）
- **架构同路验证**：[[sources/claude-obsidian-engineering-practice-csdn|claude-obsidian 工程化实践详解（CSDN）]] 自建的 wiki-retrieve 检索采用同样的"BM25 主检索 + 向量仅语义重排"，理由是本地知识频繁变化、纯向量重建成本高
- **定位阶梯**：~100 页内 index 足够 → 100-500 页加 qmd → 500+ 页需向量模式 → 2000+ 页回到 RAG 基础设施（见 [[concepts/scale-and-hybrid-strategy|规模边界与混合策略]]）

## 相关页面

- [[sources/llm-wiki-pattern|LLM Wiki 模式（来源摘要）]]
- [[concepts/rag|RAG]] —— qmd 代表"检索作为辅助手段"而非核心机制
