---
tags: [ai, knowledge-management, ml-research]
sources: [llm.md, How-to-Build-Karpathys-LLM-Wiki.md, llm-wiki-tech-deep-dive-csdn.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["Memex"]
---

# Memex

## 定义

Memex（Memory Extender，记忆扩展器）：Vannevar Bush 于 1945 年提出的个人知识存储设想——一个私有、精心策展的知识库，文档之间通过"联想轨迹"（associative trails）相互连接。

## 在来源文档中的引用

[[entities/andrej-karpathy|Andrej Karpathy]] 在 llm.md 中指出 [[concepts/llm-wiki-pattern|LLM Wiki 模式]] 与 Memex "精神相通"（related in spirit），并给出两点判断：

1. **Bush 的愿景比今天的网页更接近这一模式**：私有的、主动策展的、文档间的连接与文档本身同等有价值
2. **Bush 没能解决的部分是"谁来维护"**——[[concepts/llm-wiki-pattern|LLM Wiki 模式]] 的回答是：LLM 承担维护工作

## 与 LLM Wiki 模式的对应关系

| Memex 设想 | LLM Wiki 模式实现 |
|---|---|
| 个人策展的知识库 | `raw/` 精选来源（见 [[concepts/three-layer-architecture|三层知识架构]]） |
| 联想轨迹（连接即知识） | `[[wikilink]]` 双链与图谱视图（[[entities/obsidian|Obsidian]]） |
| 维护者缺位 | LLM 作为图书馆管理员（见 [[concepts/human-llm-division-of-labor|人机分工]]） |

## 谱系细节（2026-09-25 批量摄取）

- 出处：Vannevar Bush 1945 年 7 月发表于《The Atlantic》的论文 **《As We May Think》**；设想是一台机械桌面设备，存储并交叉引用一个人的全部书籍与通信（[[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]]）
- 直接影响：启发了鼠标发明者道格拉斯·恩格尔巴特与"超文本"概念提出者泰德·尼尔森；但互联网最终走向公开庞杂，而非 Bush 设想的私人精心整理方向
- 为何当年没成立：交叉引用全靠手工创建——"没人能在规模上坚持建轨迹"；LLM 把这项成本降到趋近零（见 [[concepts/human-llm-division-of-labor|人机分工]]）
- 定位：[[sources/llm-wiki-tech-deep-dive-csdn|LLM Wiki 技术深度解析（CSDN）]] 称 LLM Wiki 是迄今最接近实现 Memex 愿景的方案

## 相关页面

- [[sources/llm-wiki-pattern|LLM Wiki 模式（来源摘要）]]
