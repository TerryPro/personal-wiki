---
tags: [llm-wiki, synthesis]
sources: [llm-wiki-tech-deep-dive-csdn.md, How-to-Build-Karpathys-LLM-Wiki.md, LLM-wiki-by-andrej-karpathyi-Build.md, agent-obsidian-llm-wiki-claude-obsidian-csdn.md, self-growing-knowledge-base-workbuddy-obsidian.md, llm-wiki-teardown-juejin.md]
created: 2026-09-25
updated: 2026-09-26
aliases: ["LLM Wiki 典型案例对照"]
---

# LLM Wiki 典型案例对照

**类型:** 跨来源综合
**形成方式:** query 回填——源于对"LLM Wiki 的典型案例"的查询，将散落在各来源页与实体页中的案例集中对照，形成可复用的案例索引。

## 结论先行

[[concepts/llm-wiki-pattern|LLM Wiki 模式]] 发布后已积累四类可考案例：**个人知识库实例、书籍编译实验、新手教程实操、社区开源实现**。它们从不同角度印证 [[concepts/compounding-knowledge|知识复利]] 与"wiki 作为 agent 记忆底座"的核心主张。

## 案例对照表

| 案例 | 类型 | 规模 | 效果 | 核心启示 | 来源页 |
|---|---|---|---|---|---|
| Farzapedia | 个人知识库 | 2500 日记 → 400 篇互链文章 | agent 跨页综合出落地页方案；推文 123 万浏览/3825 赞/4710 收藏 | wiki 作为 agent 记忆底座 | [[entities/farzapedia\|Farzapedia]] |
| 三本商业书实验 | 书籍编译 | 15.5 万词 → 210 页 / 约 4600 引用 | 出现用户未察觉的跨书综合 | 复利产生跨源新连接 | [[sources/karpathy-llm-wiki-complete-guide-starmorph\|Starmorph 完全指南]] |
| Data Science Dojo 教程 | 新手实操 | 5 篇论文 / 30 分钟 | 30 分钟跑通建库→复利→lint 闭环 | 最小闭环可复现 | [[sources/llm-wiki-datasciencedojo-tutorial\|DSDojo 教程]] |
| 社区开源实现 | 生态 | 一周内 7+ 个 | 多路线实现落地，共识结构不变 | 模式比工具更可迁移 | [[entities/claude-obsidian-community\|Claude-Obsidian 与社区实现]] |

## 案例详述

### 1. Farzapedia —— 个人知识库标杆

开发者 Farza 在 [[entities/andrej-karpathy|Andrej Karpathy]] 发推两天后搭建（详见 [[entities/farzapedia|Farzapedia]]，经 [[sources/llm-wiki-tech-deep-dive-csdn|LLM Wiki 技术深度解析（CSDN）]] 与 [[sources/llm-wiki-teardown-juejin|Karpathy LLM Wiki 完整拆解（掘金）]] 介绍）。将 2500 条日记 + Apple Notes + 部分 iMessage 编译为 400 篇带反向链接的文章。金句"**这个 Wiki 不是给我看的，是给我的 Agent 看的**"点破设计对象。

**效果（三层）**：
- **跨页综合**：agent 曾跨页调取"吉卜力纪录片 + YC 落地页 + 70 年代 Beatles 周边"融合生成落地页设计提案——综合出人类自己都没注意到的联系，印证 [[synthesis/wiki-mode-advantages|Wiki 模式的优势（综合评估）]] 中"agent 长期记忆底座"一项
- **对比 RAG**：Farza 此前用 [[concepts/rag|RAG]] 做类似系统，原话"it was ass"；文件系统 wiki 让 agent 能真正理解和导航知识（见 [[concepts/retrieval-vs-compilation|检索式与编译式范式]]）
- **传播与影响**：推文《This is Farzapedia》获约 123 万浏览、3825 赞、4710 收藏，被 Karpathy 转引并直接启发 [[concepts/karpathy-four-principles|Karpathy AI 个性化四原则]]

注：上述效果均为 Farza 本人自述与二手报道转述，无第三方独立复测。

### 2. 三本商业书实验 —— 复利的量化证据

HN 用户 vbarsoum 将约 15.5 万词按章节粒度摄取，产出 210 个概念页与约 4600 条交叉引用，并出现用户未曾察觉的跨书综合（详见 [[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]]）。这是 [[concepts/compounding-knowledge|知识复利]] 页最硬的实证数据：复利不只是存储，而是产生新连接。

### 3. Data Science Dojo 教程 —— 新手最小可运行案例

用 5 篇经典 AI 论文（Attention Is All You Need、BERT、GPT-3、Foundation Models、RLHF）在 30 分钟内搭起第一个实例，演示建目录 → 编译提示词 → Obsidian 图谱 → 增量复利 → lint 的完整闭环（详见 [[sources/llm-wiki-datasciencedojo-tutorial|LLM Wiki 30 分钟上手教程（Data Science Dojo）]]）。并总结**规模三阶段效应**：10 页答基础、50 页做隐性综合、100+ 页回答"存在于页面间关系里"的问题。

### 4. 社区开源实现 —— 一周内 7+ 个

2026-04-04 发布后一周内涌现 7+ 个开源实现（claude-obsidian 插件、WeSight 插件等，详见 [[entities/claude-obsidian-community|Claude-Obsidian 与社区实现]]）。共识结构不变——**raw/wiki/schema + ingest/query/lint**（见 [[concepts/three-layer-architecture|三层知识架构]]），印证模式本身比任何工具都更可迁移，契合 [[concepts/karpathy-four-principles|Karpathy AI 个性化四原则]] 的 BYOAI 精神。

## 备注

- 各案例规模数据来自来源页转述，Farzapedia 与三本商业书实验两组已在 [[synthesis/wiki-mode-advantages|Wiki 模式的优势（综合评估）]] 中列为"积累与复利"优势的核心实证（置信度：高）。
- 本 vault（llmwiki，9 来源 / 30 页）自身即微型验证：[[concepts/compounding-knowledge|知识复利]] 页在多次摄取中被多个来源充实。

## 相关页面

- [[concepts/llm-wiki-pattern|LLM Wiki 模式]] —— 案例所属的模式
- [[concepts/compounding-knowledge|知识复利]] —— 案例共同印证的机制
- [[synthesis/wiki-mode-advantages|Wiki 模式的优势（综合评估）]] —— 案例的论证定位
- [[entities/farzapedia|Farzapedia]] —— 标杆个人案例
