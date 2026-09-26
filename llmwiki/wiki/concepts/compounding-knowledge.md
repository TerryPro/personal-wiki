---
tags: [ai, llm, knowledge-management]
sources: [llm.md, How-to-Build-Karpathys-LLM-Wiki.md, self-growing-knowledge-base-workbuddy-obsidian.md, llm-wiki-tech-deep-dive-csdn.md]
created: 2026-09-25
updated: 2026-09-26
aliases: ["知识复利"]
---

# 知识复利

## 定义

[[concepts/llm-wiki-pattern|LLM Wiki 模式]] 的核心特性：wiki 是一个**持久的、不断增值的产物**（persistent, compounding artifact）。每摄取一个新来源、每完成一次有价值的查询，知识库整体变得更丰富，而非仅仅增加一份孤立文档。

## 复利的两个来源

1. **摄取（Ingest）**：新来源不只是被索引，而是被整合——更新实体页、修订主题综述、标记新旧论断的矛盾、强化或挑战正在演化的综合结论。单个来源可触及 10~15 个页面，一次投入在多处产生复利。
2. **查询回填（Query → file back）**：好答案不应消失在聊天记录里。用户要求的对比、分析、新发现的关联，应回填为 `wiki/synthesis/` 新页面——"让你的探索与摄取来源同样复利"。

## 复利的表现形式

- 交叉引用已经在那里（无需每次重建）
- 矛盾已被标记（无需每次重新察觉）
- 综合已反映全部所读（无需每次重新拼装）

## 与其他概念的关系

复利的前提是维护成本趋近零，这依赖 [[concepts/human-llm-division-of-labor|人机分工]] 中 LLM 承担全部簿记工作；导航能力则依赖 index.md（见 [[concepts/llm-wiki-pattern|LLM Wiki 模式]]），规模过大时用 [[entities/qmd|qmd]] 补足搜索。

## 实证案例（2026-09-25 批量摄取）

- **三本商业书实验**（HN 用户 vbarsoum，见 [[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]]）：约 15.5 万词按章节粒度摄取 → 210 个概念页 + 约 4600 条交叉引用，并出现用户未曾察觉的跨书综合——复利不只是存储，而是产生新连接
- **[[entities/farzapedia|Farzapedia]]**：2500 条日记等个人材料 → 400 篇互链文章，后续每次探索都站在已编译底座上
- **agent 的长期检索层**（[[sources/self-growing-knowledge-base-canghe|自生长个人知识库实战（苍何）]]）：wiki 页面成为 agent 推理底座，"这层可复用的中间知识持续积累，后续查询和维护越来越高效"；重复搜索更少、上下文更浓、跨会话学习（另见 [[sources/llm-wiki-datacamp-overview|LLM Wiki：新一代 AI 知识架构（DataCamp 综述）]]）
- **复利的前提是健康**：知识漂移会抵消复利（每次摄取都可能引入小错，见 [[concepts/scale-and-hybrid-strategy|规模边界与混合策略]]），故需定期 lint

## 相关页面

- [[sources/llm-wiki-pattern|LLM Wiki 模式（来源摘要）]]
- [[concepts/rag|RAG]] —— 反面案例：无积累的查询时模式
- [[concepts/retrieval-vs-compilation|检索式与编译式范式]] —— 复利（编译式）与无积累（检索式）的分水岭
- [[concepts/ingest-query-lint|三大操作（Ingest / Query / Lint）]] —— 复利的运转机制
- [[synthesis/llm-wiki-case-studies|LLM Wiki 典型案例对照]] —— 复利的实证案例汇总
