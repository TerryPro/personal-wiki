---
tags: [llm-tools, agents, ai]
sources: [llm.md, How-to-Build-Karpathys-LLM-Wiki.md, LLM-Wiki-A-New-AI-Knowledge.md, llm-wiki-tech-deep-dive-csdn.md, llm-wiki-teardown-juejin.md]
aliases: ["MCP"]
created: 2026-09-26
updated: 2026-09-26
---

# MCP

## 定义

MCP（Model Context Protocol，模型上下文协议）：把工具或数据源以标准接口暴露给 LLM agent 的协议。在本库来源中，它反复出现在两类位置——**工具接入**与**知识库对外暴露**。

## 在本库来源中的角色

- **工具接入**：[[entities/qmd|qmd]] 同时提供 CLI 与 MCP server 两种接口（[[sources/llm-wiki-pattern|llm.md]]、[[sources/llm-wiki-tech-deep-dive-csdn|LLM Wiki 技术深度解析（CSDN）]]、[[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]]），[[entities/claude-code|Claude Code]] 等执行端可把它当原生工具调用
- **wiki 对外暴露**（[[sources/llm-wiki-datacamp-overview|LLM Wiki：新一代 AI 知识架构（DataCamp 综述）]]）：MCP 被视为"向 agent 暴露 wiki 的自然接口"；托管型实现少见，企业级接入仍处早期
- **社区实现路线**：lucasastorian/llmwiki 走"上传文档 + MCP 连接 Claude"路线（[[entities/claude-obsidian-community|Claude-Obsidian 与社区实现]]）
- **趋势判断**（[[sources/llm-wiki-tech-deep-dive-csdn|CSDN 深度解析]]）：MCP Server 标准化是 2026 年趋势之一——让任何 agent 都能读写 wiki

## 与本库的关系

本 vault 当前完全依赖文件系统 + index.md 导航，未接入任何 MCP 工具；若将来接入 qmd 或把 wiki 暴露给外部 agent，MCP 即为首选接口层（规模判断见 [[concepts/scale-and-hybrid-strategy|规模边界与混合策略]]）。

## 相关页面

- [[entities/qmd|qmd]] —— MCP server 接入的本地搜索引擎
- [[concepts/schema-driven-agent|Schema 驱动代理]] —— MCP 解决"工具可用"，schema 解决"行为有纪律"
- [[concepts/retrieval-pipeline|检索管线]] —— MCP 是其第 4 层"agent 检索接口"的一种实现
