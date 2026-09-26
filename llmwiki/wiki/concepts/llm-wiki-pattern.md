---
tags: [ai, llm, knowledge-management]
sources: [llm.md, How-to-Build-Karpathys-LLM-Wiki.md, LLM-Wiki-A-New-AI-Knowledge.md, LLM-wiki-by-andrej-karpathyi-Build.md, self-growing-knowledge-base-workbuddy-obsidian.md, llm-wiki-tech-deep-dive-csdn.md, llm-wiki-teardown-juejin.md, What-Is-the-LLM-Wiki-Karpathys.md]
created: 2026-09-25
updated: 2026-09-26
aliases: ["LLM Wiki 模式"]
---

# LLM Wiki 模式

## 定义

由 [[entities/andrej-karpathy|Andrej Karpathy]] 提出的一种个人知识库构建模式：LLM 不在查询时才从原始文档中检索拼装答案，而是**增量地构建并维护一个持久的、互链的 markdown wiki**。该 wiki 位于人与原始资料之间，是知识库的主体形态。本 vault（llmwiki）即按此模式建立。

## 与 RAG 的区别

传统 [[concepts/rag|RAG]]（如 [[entities/notebooklm|NotebookLM]]、ChatGPT 文件上传）在每次提问时检索原始文档片段并即时生成答案——知识从不积累，每次都要重新"发现"。LLM Wiki 模式则在摄取时一次性完成阅读、提取、整合，之后只保持内容新鲜。关键差异：**wiki 是持久的复利产物**（见 [[concepts/compounding-knowledge|知识复利]]）——交叉引用已就位，矛盾已标记，综合已反映全部所读。

## 运转方式

- **三层结构**：原始资料、wiki、schema，见 [[concepts/three-layer-architecture|三层知识架构]]
- **三种操作**：Ingest（摄取，单来源常触及 10~15 页）、Query（查询，优质答案回填为新页面）、Lint（定期体检，消除矛盾/过时/孤立页面）
- **两个特殊文件**：index.md（内容目录，查询入口）与 log.md（时间线，仅追加）；中等规模下 index.md 即可替代向量检索
- **角色分工**：见 [[concepts/human-llm-division-of-labor|人机分工]]——人负责选料、提问、指导；LLM 负责摘要、交叉引用、归档、记账。作者的使用姿态："一侧开着 LLM agent，另一侧开着 [[entities/obsidian|Obsidian]] 实时浏览结果"

## 核心隐喻

> Obsidian 是 IDE；LLM 是程序员；wiki 是代码库。

## 社区共识定义与扩展（2026-09-25 批量摄取）

- **三要素定义**（[[sources/llm-wiki-datacamp-overview|LLM Wiki：新一代 AI 知识架构（DataCamp 综述）]]）：持久（页面创建后持续更新）、持续更新（每个来源触发全库修改）、**双受众**（人类可读 + agent 可推理）
- **编译器类比**（[[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]]）：raw 是源码、LLM 是编译器、wiki 是 executable、lint 是测试、query 是运行时（见 [[concepts/retrieval-vs-compilation|检索式与编译式范式]]）
- **规模三阶段效应**（[[sources/llm-wiki-datasciencedojo-tutorial|LLM Wiki 30 分钟上手教程（Data Science Dojo）]]）：10 页答基本问题；50 页开始综合你从未显式连接的观点；100+ 页能回答"答案存在于页面间关系"的问题
- **元框架定位**（[[sources/llm-wiki-tech-deep-dive-csdn|LLM Wiki 技术深度解析（CSDN）]]）：不依赖具体模型或技术栈，定义的是人机协作管理知识的方式，因而比任何实现都更稳定
- **自生长判据**（[[sources/self-growing-knowledge-base-canghe|自生长个人知识库实战（苍何）]]）：处理完资料后知识库必须"留下变化"——新增概念、补上关联、或暴露一个暂无答案的问题
- **传播轨迹**：2026-04-04 发布后获 16M+ 浏览、数日内 5000+ stars、一周内 7+ 开源实现（见 [[entities/claude-obsidian-community|Claude-Obsidian 与社区实现]]）；局限与适用区间见 [[concepts/scale-and-hybrid-strategy|规模边界与混合策略]]
- **"idea file" 传播方式**（[[sources/llm-wiki-teardown-juejin|Karpathy LLM Wiki 完整拆解（掘金）]]）：Karpathy 刻意不开源代码仓库，只发布一份抽象的 idea file，让每人的 agent 据此定制自己的实现——“每个实现都不一样，核心模式一致”，这正是本模式作为元框架（而非具体工具）的传播机制
- **生产环境纪律**（同上，bluewater8008）：团队落地总结的六条教训（先分类、token 预算、实体模板、双输出回填、跨域标签、人类验证）已归入 [[concepts/schema-driven-agent|Schema 驱动代理]] 与 [[concepts/scale-and-hybrid-strategy|规模边界与混合策略]]
- **名称被挪用（术语分歧）**：[[sources/what-is-the-llm-wiki-karpathys|What Is the LLM Wiki?]] 仍用"LLM wiki"一词，但实际指**为 RAG 检索优化的结构化知识库**——原子单元是 chunk、依赖嵌入与向量库、查询时综合，与本模式（原子单元是页面、摄取时编译、零基础设施）相反。两定义对照见 [[synthesis/llm-wiki-definition-divergence|LLM Wiki 的两种定义]]，检索侧工程细节归入 [[concepts/retrieval-pipeline|检索管线]] 与 [[concepts/chunking-strategies|分块策略]]

## 相关页面

- 原始出处：[[sources/llm-wiki-pattern|LLM Wiki 模式（来源摘要）]]
- 思想源头：[[concepts/memex|Memex]]
- 落地约束：[[concepts/schema-driven-agent|Schema 驱动代理]]
- 辅助工具：[[entities/qmd|qmd]]
- 范式定位：[[concepts/retrieval-vs-compilation|检索式与编译式范式]]
- 边界条件：[[concepts/scale-and-hybrid-strategy|规模边界与混合策略]]
- 优势总评：[[synthesis/wiki-mode-advantages|Wiki 模式的优势（综合评估）]]
- 案例索引：[[synthesis/llm-wiki-case-studies|LLM Wiki 典型案例对照]]
