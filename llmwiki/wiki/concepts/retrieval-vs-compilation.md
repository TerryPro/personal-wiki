---
tags: [ai, llm, ml-research]
sources: [LLM-Wiki-A-New-AI-Knowledge.md, How-to-Build-Karpathys-LLM-Wiki.md, agent-obsidian-llm-wiki-claude-obsidian-csdn.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["检索式与编译式范式"]
---

# 检索式与编译式范式

## 定义

区分 AI 处理知识的两种根本路线：

- **检索优先（retrieval-first）**：查询时从原始文档召回片段交给模型临时综合——即 [[concepts/rag|RAG]] 路线
- **编译优先（compilation-first）**：摄取时读一遍来源、提取要义、写入结构化知识库；查询变成"从一个已经被思考过的底座上阅读"——即 [[concepts/llm-wiki-pattern|LLM Wiki 模式]] 路线

## 核心洞察

检索与编译是**两份不同的工作**。检索把"理解"推迟到每次查询；编译把"理解"提前到摄取时刻一次性完成。[[entities/andrej-karpathy|Andrej Karpathy]] 的编译器类比（多篇文章引述）：raw 是源码、LLM 是编译器、wiki 是 executable、lint 是测试、query 是运行时。

## 时间维度的差异

- RAG 的上下文是**用完即弃**的：上一个问题用过的片段在模型回复结束时就消失了，明天问相关问题，检索器重新跑一遍
- 编译式的产物是**持久**的：连接新素材与旧知识的劳动只花一次，之后每次查询都受益（见 [[concepts/compounding-knowledge|知识复利]]）

## 各赢一面（并非替代关系）

| 场景 | 更优范式 |
|---|---|
| 语料频繁变化、要求即时新鲜 | 检索（查询时读活源） |
| 跨多源综合、观点演化 | 编译（综合已预写并审阅） |
| 百万级文档 | 检索 |
| 个人/团队规模深度研究 | 编译 |

详见 [[concepts/scale-and-hybrid-strategy|规模边界与混合策略]]。多来源分歧时保留各方说法及来源、时间与适用范围，也是编译式特有的能力（检索式只能让矛盾片段并存）。

## 相关页面

- [[sources/llm-wiki-datacamp-overview|LLM Wiki：新一代 AI 知识架构（DataCamp 综述）]] — 范式区分与四维权衡的系统出处
- [[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]] — "手动可追溯的 Graph RAG"论断
- [[sources/llm-wiki-pattern|LLM Wiki 模式（来源摘要）]]
