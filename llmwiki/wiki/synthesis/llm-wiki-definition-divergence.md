---
tags: [llm-wiki, synthesis, rag]
sources: [What-Is-the-LLM-Wiki-Karpathys.md, llm.md, llm-wiki-tech-deep-dive-csdn.md, LLM-Wiki-A-New-AI-Knowledge.md, karpathy-llm-wiki-complete-guide-starmorph.md]
aliases: ["LLM Wiki 的两种定义"]
created: 2026-09-26
updated: 2026-09-26
---

# LLM Wiki 的两种定义

**类型:** 跨来源综合 / 矛盾梳理
**形成方式:** 由 [[sources/what-is-the-llm-wiki-karpathys|What Is the LLM Wiki?]] 的摄取触发——该文对"LLM wiki"的使用与本库主线定义**直接冲突**，故单列一页固定这一分歧，供后续 lint 与查询复用。

## 结论先行

"LLM wiki"一词目前在英文内容市场上承载着**两个互不兼容的定义**：① 一个**为 RAG 检索优化的结构化知识库**（检索式）；② 一个**LLM 增量编译维护的持久互链 markdown wiki**（编译式）。本库主线采用定义 ②（源自 [[entities/andrej-karpathy|Andrej Karpathy]] 的 llm.md），而定义 ① 是许多 SEO/营销文章（含本文）对同一热词的挪用。二者共享"知识要先结构化"的前提，但在**基础设施、知识单元、加工时机**上完全相反。

## 定义对照

| 维度 | ① 检索增强底座（本文路线） | ② 编译式知识库（本库主线） |
|---|---|---|
| 核心隐喻 | 给 RAG 喂一个整理好的向量库 | wiki 是被编译的持久产物 |
| 人工/LLM 加工时机 | 建库时切分嵌入，**查询时**综合 | **摄取时**编译、查询只是阅读 |
| 知识单元 | chunk（token/语义切分） | 页面（人机共同理解的实体/概念） |
| 基础设施 | 解析器 + 嵌入模型 + 向量库 + 重排序（重） | 一个文件夹 + 任意 agent（零） |
| 积累性 | 无（回答仍每次重生成） | 有（[[concepts/compounding-knowledge|知识复利]]） |
| 代表出处 | [[sources/what-is-the-llm-wiki-karpathys|What Is the LLM Wiki?]] | [[sources/llm-wiki-pattern|llm.md]]、[[sources/llm-wiki-tech-deep-dive-csdn|CSDN 深度解析]] |

## 分歧的实质

- **不是同一件事的两种实现，而是两种范式被同一顶帽子盖住。** 定义 ① 本质上就是 [[concepts/rag|RAG]] 的工程实践（见 [[concepts/retrieval-pipeline|检索管线]]、[[concepts/chunking-strategies|分块策略]]），并未解决 [[concepts/retrieval-vs-compilation|检索式]] 的根本局限——知识从不被编译沉淀。
- **共同点被误读为同一性。** 两派都强调"原子化、自包含、格式一致、来源可溯"，于是营销文章容易把 RAG 建库指南包装成"Karpathy 的 LLM wiki"。但定义 ② 的原子单元是**页面**、靠人机编辑纪律维持；定义 ① 的是**chunk**、靠工程管线生成。
- **归因漂移**：本文把"原子单元/上下文随块同行/格式一致/新鲜度"标为 Karpathy 的核心原则，而 Karpathy 真正总结的是 [[concepts/karpathy-four-principles|AI 个性化四原则]]（显性化/属于你/File over App/BYOAI）。两套框架关注点不同（前者=检索工程，后者=知识资产归属），本文未给出处，疑为主题再归纳。

## 实践含义

- **查询本库时**：遇到英文资料称"LLM wiki"，先判断它属定义 ① 还是 ②。定义 ① 的内容应分别归入 [[concepts/rag|RAG]]、[[concepts/retrieval-pipeline|检索管线]]、[[concepts/chunking-strategies|分块策略]]，而非 [[concepts/llm-wiki-pattern|LLM Wiki 模式]]。
- **两派并非完全互斥**：[[concepts/scale-and-hybrid-strategy|规模边界与混合策略]] 已指出 wiki 与 RAG 在 2000+ 页后互补；定义 ① 的工程能力正是 wiki 扩张后的检索补丁。
- **警惕营销污染**：定义 ① 的流行部分由工具厂商（如 [[entities/mindstudio|MindStudio]]）推动，热词挪用时需与中立来源交叉验证。

## 相关页面

- [[sources/what-is-the-llm-wiki-karpathys|What Is the LLM Wiki?（Karpathy 的 AI 知识库导论）]]——定义 ① 的代表文本
- [[concepts/llm-wiki-pattern|LLM Wiki 模式]]——定义 ②
- [[concepts/retrieval-vs-compilation|检索式与编译式范式]]——分歧的范式化表述
- [[concepts/rag|RAG]]、[[concepts/retrieval-pipeline|检索管线]]——定义 ① 的归属地
