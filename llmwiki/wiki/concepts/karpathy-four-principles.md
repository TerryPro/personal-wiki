---
tags: [ai, llm, knowledge-management]
sources: [llm-wiki-tech-deep-dive-csdn.md, How-to-Build-Karpathys-LLM-Wiki.md, What-Is-the-LLM-Wiki-Karpathys.md]
created: 2026-09-25
updated: 2026-09-26
aliases: ["Karpathy AI 个性化四原则"]
---

# Karpathy AI 个性化四原则

## 定义

[[entities/andrej-karpathy|Andrej Karpathy]] 在看到 [[entities/farzapedia|Farzapedia]] 案例后专门发推总结的四条 AI 个性化原则，被普遍认为是 LLM Wiki 模式价值主张的凝练表达。

## 四原则

### 1. Explicit（显性化）

AI"记住"了什么必须可见。ChatGPT/Claude 的记忆功能是黑箱——不知道记了什么、漏了什么、哪天会搞混两段记忆。LLM Wiki 的知识全在 markdown 文件里，打开就能看，哪条需要修正一目了然。

### 2. Yours（属于你）

数据在自己电脑上，不在 OpenAI 服务器或 Anthropic 数据库里。换供应商知识库跟着走；删除的记忆真的消失了。

### 3. File over App（文件优先于应用）

概念来自 [[entities/obsidian|Obsidian]] 创始人 Steph Ango。知识存成 markdown 和图片两种最通用格式：Obsidian 能看、VS Code 能改、grep 能搜、脚本能批量处理、任何 agent 能直接读——不被任何一个 App 锁死。

### 4. BYOAI（自带 AI）

知识库是标准 markdown，Claude、GPT、Codex、开源模型都能用，无供应商锁定。

## 与相关概念的关系

- 四原则是 [[concepts/three-layer-architecture|三层知识架构]] 中"raw 不可变 + wiki 是纯文件"设计的价值论证
- [[concepts/retrieval-vs-compilation|检索式与编译式范式]] 关注知识加工时机，四原则关注知识资产归属——两者共同构成选择 LLM Wiki 的完整理由
- "显性化"直接对立于黑箱记忆：agent 的记忆可以是可审计的 wiki（多 agent 共享、可迁移）

## 归因存疑（2026-09-26 lint）

[[sources/what-is-the-llm-wiki-karpathys|What Is the LLM Wiki?]] 另有一套归给 [[entities/andrej-karpathy|Andrej Karpathy]] 的“核心原则”——原子知识单元、上下文随分块同行、跨条目格式一致、新鲜度与版本化。该套原则无具体出处，且属**检索工程**关注点，与本页**知识资产归属**取向的四原则并非同一框架；两套框架的分歧已固定于 [[synthesis/llm-wiki-definition-divergence|LLM Wiki 的两种定义]]，两套并存、不择一断言。

## 相关页面

- [[sources/what-is-the-llm-wiki-karpathys|What Is the LLM Wiki?（Karpathy 的 AI 知识库导论）]] — 归给 Karpathy 的另一套「核心原则」（检索工程取向）
- [[synthesis/llm-wiki-definition-divergence|LLM Wiki 的两种定义]] — 归因与定义分歧的固定页
- [[sources/llm-wiki-tech-deep-dive-csdn|LLM Wiki 技术深度解析（CSDN）]] — 四原则的中文系统介绍
- [[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]]
