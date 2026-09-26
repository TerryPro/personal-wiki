---
tags: [ai, llm, agents]
sources: [llm.md, How-to-Build-Karpathys-LLM-Wiki.md, llm-wiki-tech-deep-dive-csdn.md, LLM-wiki-by-andrej-karpathyi-Build.md, llm-wiki-teardown-juejin.md, What-Is-the-LLM-Wiki-Karpathys.md]
created: 2026-09-25
updated: 2026-09-26
aliases: ["Andrej Karpathy"]
---

# Andrej Karpathy

## 本页上下文

[[concepts/llm-wiki-pattern|LLM Wiki 模式]] 的提出者，llm.md（gist：442a6bf555914893e9891c11519de94f）的作者。在该文中他以第一人称描述了自己的实践：一侧开 LLM agent、一侧开 [[entities/obsidian|Obsidian]]，"我更喜欢一次摄取一个来源并保持参与——阅读摘要、检查更新、指导 LLM 应该强调什么"。

## 与本知识库的关系

本 vault（llmwiki）所遵循的整套模式——三层结构、Ingest/Query/Lint 操作、index/log 双文件——均源自他这份刻意保持抽象的思想文件。他主张该文档"唯一的工作是传达这个模式，你的 LLM 能搞定其余部分"。

## 模式发布与影响（2026-09-25 批量摄取）

- **传播数据**：2026-04-04 在 X 发布 LLM Wiki 推文，获 16M~17M 浏览；gist 12 小时内 2100+ stars、数日内 5000+；一周内社区涌现 7+ 开源实现（见 [[entities/claude-obsidian-community|Claude-Obsidian 与社区实现]]）。注：[[sources/llm-wiki-teardown-juejin|掘金拆解文]] 记其 04-03 原帖《LLM Knowledge Bases》为 **1500 万浏览**，与 16M/1700 万为同一量级不同尾数，已列入数据出入待复核
- **"idea file" 传播理念**（[[sources/llm-wiki-teardown-juejin|Karpathy LLM Wiki 完整拆解（掘金）]]）：推文走红后他**未开源具体代码仓库**，而是写了一份 idea file（即那份 Gist）——主张"在 LLM agent 时代，分享想法比分享代码更有意义"，把 idea file 丢给 agent 即可定制出属于你自己的系统；该追加推文获 2709 转发、4 万收藏。这与本 vault “文档只传达模式、其余交给 LLM”的定位一致
- **思想演化三阶段**（[[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]]）：Vibe Coding（2025-02）→ Agentic Engineering（2026-01）→ LLM 知识库（2026-04）——每阶段把更多认知劳动移交给 LLM，人保留判断与方向
- **[[entities/farzapedia|Farzapedia]] 启发他总结 [[concepts/karpathy-four-principles|Karpathy AI 个性化四原则]]**；他在自己的研究中 wiki 已达约 100 篇 / 40 万词而仍可用 index 高效导航
- **思想资源**：明确引用 Vannevar Bush 1945 论文《As We May Think》与 [[concepts/memex|Memex]] 概念（另见 Jeremy Howard 的 llms.txt：外向让 LLM 懂你的网站，与 LLM Wiki 内向用 LLM 懂你的领域互为镜像）

## 身份与归因（多来源）

- **本文给出的身份链**：[[sources/what-is-the-llm-wiki-karpathys|What Is the LLM Wiki?]] 称其为"前 OpenAI 研究员、特斯拉 AI 总监，当下实用 AI 系统最有影响力的声音之一"，并称他"一直呼吁知识在 agent 能可靠使用前必须先被结构化"
- **归因漂移警告**：该文把"原子知识单元 / 上下文随 chunk 同行 / 格式一致 / 新鲜度版本化"标为 Karpathy 的"核心原则"，但这与 Karpathy 本人总结的 [[concepts/karpathy-four-principles|AI 个性化四原则]]（显性化/属于你/File over App/BYOAI）并非同一套框架，且未给出处。同一顶帽子下实为两种思路（检索工程 vs 知识资产归属），已记入 [[synthesis/llm-wiki-definition-divergence|LLM Wiki 的两种定义]] 待复核

## 相关页面

- [[sources/llm-wiki-pattern|LLM Wiki 模式（来源摘要）]]
- [[concepts/llm-wiki-pattern|LLM Wiki 模式]]
- [[concepts/karpathy-four-principles|Karpathy AI 个性化四原则]]
- [[synthesis/llm-wiki-definition-divergence|LLM Wiki 的两种定义]]
