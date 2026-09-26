---
tags: [ai, llm, ml-research]
sources: [llm.md, LLM-Wiki-A-New-AI-Knowledge.md, How-to-Build-Karpathys-LLM-Wiki.md, LLM-wiki-by-andrej-karpathyi-Build.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["RAG"]
---

# RAG

## 定义

RAG（Retrieval-Augmented Generation，检索增强生成）：将文件集合上传/索引后，LLM 在**查询时**检索相关片段并即时生成答案。代表产品：[[entities/notebooklm|NotebookLM]]、ChatGPT 文件上传及多数向量检索系统。

## 在 LLM Wiki 模式中的定位

在 [[entities/andrej-karpathy|Andrej Karpathy]] 的 [[concepts/llm-wiki-pattern|LLM Wiki 模式]] 论述中，RAG 是**对照面**——指出其根本局限：

- 每次提问都从零"重新发现"知识，**没有积累**
- 需要综合五份文档的微妙问题，LLM 每次都要重新寻找并拼装片段
- 知识从不被编译和沉淀，系统不随使用而变强

## 与 Wiki 模式的对比

| 维度 | RAG | [[concepts/llm-wiki-pattern|LLM Wiki 模式]] |
|---|---|---|
| 知识加工时机 | 查询时 | 摄取时（一次编译、持续保鲜） |
| 积累性 | 无 | 有（见 [[concepts/compounding-knowledge|知识复利]]） |
| 交叉引用 | 每次重建 | 已预先存在于页面间 |
| 矛盾处理 | 无状态 | 摄取时即标记（Lint 时复查） |
| 基础设施 | 通常需要嵌入/向量库 | 中等规模下 index.md 即可导航 |

## 备注

来源文档并不否定 RAG "能用"（原文："This works"），批评点在于它不构建任何持久产物。当 wiki 规模增长后，来源文档也建议引入 [[entities/qmd|qmd]] 这类本地搜索——即 wiki 模式并不排斥检索技术，只是把它降级为辅助手段而非核心机制。

## 多来源补充视角（2026-09-25 批量摄取）

- **无状态 vs 有状态**：[[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]] 给出八维对比：RAG 每次查询独立、需向量库基础设施、chunk 级引用、矛盾不可检测；wiki 有状态、一个文件夹即成系统、源级引用、lint 标记矛盾
- **RAG 仍赢的场景**：百万级文档无法全部预编译、文档频繁变化重摄取不现实、需亚秒级延迟、跨团队多权限共享（详见 [[concepts/scale-and-hybrid-strategy|规模边界与混合策略]]）
- **新鲜度优势**：[[sources/llm-wiki-datacamp-overview|LLM Wiki：新一代 AI 知识架构（DataCamp 综述）]] 指出 RAG 查询时读活源，文档更新立即反映；wiki 需重摄取才能跟进，存在编译滞后
- **分歧点（可追溯性）**：Starmorph 认为 wiki 的源级引用优于 RAG 的 lossy chunk 引用；而 [[sources/llm-wiki-datasciencedojo-tutorial|LLM Wiki 30 分钟上手教程（Data Science Dojo）]] 评估 RAG 追溯性高、wiki 只有中等（页面级）。待后续 lint 时结合实践裁定

## 相关页面

- [[sources/llm-wiki-pattern|LLM Wiki 模式（来源摘要）]]
- [[concepts/retrieval-vs-compilation|检索式与编译式范式]] —— 本页对照面的范式化表述
- [[concepts/scale-and-hybrid-strategy|规模边界与混合策略]]
