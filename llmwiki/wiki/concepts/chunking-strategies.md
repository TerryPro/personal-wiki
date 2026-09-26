---
tags: [ai, llm, rag]
sources: [What-Is-the-LLM-Wiki-Karpathys.md]
aliases: ["分块策略"]
created: 2026-09-26
updated: 2026-09-26
---

# 分块策略

## 定义

分块（chunking）：把源文档切成**可被独立检索的最小语义单元**（chunk）的方法。是 [[concepts/retrieval-pipeline|检索管线]] 中"最容易被做错"的一步——[[sources/what-is-the-llm-wiki-karpathys|What Is the LLM Wiki?]] 指出，朴素的固定 token 切分会横切逻辑边界，产生"孤立时失去意义"的碎片，而检索质量在很大程度上由切分质量决定。

> 关联：本库主线（编译式 wiki）不做机械切分，而是以"页面 = 知识单元"（见 [[concepts/llm-wiki-pattern|LLM Wiki 模式]]）；分块是**检索式**路线（[[concepts/rag|RAG]]）特有的问题域。

## 三类策略

| 策略 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| **固定大小（Fixed-size）** | 每 256–512 token 一切，重叠 50–100 token | 简单、可预测 | 无视结构，跨逻辑边界 |
| **语义切分（Semantic）** | 在段落/小节/标题等自然边界切 | 每块承载一个完整想法 | 块长不均、依赖文档结构 |
| **层级切分（Hierarchical）** | 在句、段等多粒度各存嵌入，按查询选层检索 | 粗细可调、灵活 | 存储与实现更复杂 |

**默认建议**：按小节或段落边界切分 + 少量重叠，对多数知识库是稳健起点。重叠的作用是保住边界处的上下文不被切断。

## 块大小的经验值

- 检索式语义搜索常用 **256–512 token**，相邻块重叠 **50–100 token**
- 无万能答案：技术文档宜偏小、叙事内容宜偏大；应以**实际检索用例测试**为准
- 关键约束仍是"孤立可解"——每块应能脱离原文被正确理解

## 关联概念

- [[concepts/retrieval-pipeline|检索管线]]——分块是其中的切分环节
- [[concepts/rag|RAG]]——分块策略服务的主要范式
- [[concepts/llm-wiki-pattern|LLM Wiki 模式]]——以"页面"而非"块"为知识单元的对照路线

## 相关页面

- [[sources/what-is-the-llm-wiki-karpathys|What Is the LLM Wiki?（Karpathy 的 AI 知识库导论）]]——本页主要出处
