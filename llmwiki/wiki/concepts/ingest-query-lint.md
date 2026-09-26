---
tags: [ai, llm, knowledge-management]
sources: [llm.md, How-to-Build-Karpathys-LLM-Wiki.md, LLM-Wiki-A-New-AI-Knowledge.md, LLM-wiki-by-andrej-karpathyi-Build.md, llm-wiki-tech-deep-dive-csdn.md, agent-obsidian-llm-wiki-claude-obsidian-csdn.md, llm-wiki-teardown-juejin.md]
aliases: ["三大操作（Ingest / Query / Lint）"]
created: 2026-09-26
updated: 2026-09-26
---

# 三大操作（Ingest / Query / Lint）

## 定义

[[concepts/llm-wiki-pattern|LLM Wiki 模式]] 中 LLM 维护知识库的三个基本操作，即模式的"运行时"：[[concepts/three-layer-architecture|三层知识架构]] 定义静态结构，三操作定义动态循环。

## Ingest（摄取）

读一个来源、提取要义、写入并**更新**受影响页面。单个来源常触及 10~15 个页面（[[sources/llm-wiki-pattern|llm.md]]）。要点：

- **先搜已有页面再建新页**，优先更新而非新建——避免重复页与知识漂移
- 事实标源；多来源分歧保留双方说法与来源，不覆盖
- 是 [[concepts/compounding-knowledge|知识复利]] 的第一来源
- 节奏可按需：一次一源并保持参与，或批量低监督摄取——所选节奏应写进 schema（见 [[concepts/schema-driven-agent|Schema 驱动代理]]）

## Query（查询）

从已编译的底座上阅读并综合，而不是每次现场检索拼装。要点：

- **答案回填**：有价值的对比、分析、新关联应写成 `wiki/synthesis/` 新页面，使探索与摄取同样复利——本库已两次落地（[[synthesis/wiki-mode-advantages|Wiki 模式的优势（综合评估）]]、[[synthesis/llm-wiki-case-studies|LLM Wiki 典型案例对照]]）
- 产物形式多样：markdown 页面、对比表、[[entities/marp|Marp]] 幻灯片、图表、canvas（[[sources/llm-wiki-pattern|llm.md]]）
- 输出须带来源引用，防止无源综合（bluewater8008 第 6 条，见 [[concepts/schema-driven-agent|Schema 驱动代理]]）

## Lint（体检）

定期扫描矛盾、过时论断、孤立页、缺失交叉引用与断链，并修复。要点：

- **频率**：每 10~20 次摄取一次（[[sources/llm-wiki-datasciencedojo-tutorial|Data Science Dojo 教程]] 建议每 ~20 页；[[sources/claude-obsidian-engineering-practice-csdn|claude-obsidian 工程实践]] 建议每 15 次摄取）、至少每月一次、重大查询前跑一次
- **定位**：编译器类比中的"测试"环节——raw 是源码、LLM 是编译器、wiki 是 executable、query 是运行时（[[concepts/retrieval-vs-compilation|检索式与编译式范式]]）
- **必要性**：单页错误会沿入链扩散成"组织化的错误信息"；从不 lint 是新手三大常见错误之一
- 依赖 raw 不可变作事实锚点，抑制知识漂移（见 [[concepts/scale-and-hybrid-strategy|规模边界与混合策略]] 的已知风险节）

## 三者的循环关系

摄取产生页面 → 查询消费页面并把新洞察回填 → lint 保证前两者不腐化。三者共同构成 [[concepts/compounding-knowledge|知识复利]] 的运转机制；[[concepts/change-contract|变更契约]] 则把这套循环显式化为目录级规则（什么可改、什么不可改）。

## 相关页面

- [[concepts/llm-wiki-pattern|LLM Wiki 模式]] —— 三操作所属的模式
- [[concepts/compounding-knowledge|知识复利]] —— 三操作共同服务的机制
- [[concepts/schema-driven-agent|Schema 驱动代理]] —— 把三操作固化为可执行工作流
- [[concepts/scale-and-hybrid-strategy|规模边界与混合策略]] —— lint 节奏与漂移控制
- [[sources/llm-wiki-pattern|LLM Wiki 模式（来源摘要）]]
