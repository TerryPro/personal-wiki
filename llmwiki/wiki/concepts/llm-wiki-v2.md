---
tags: [ai, llm, agents]
sources: [How-to-Build-Karpathys-LLM-Wiki.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["LLM Wiki v2 扩展模式"]
---

# LLM Wiki v2 扩展模式

## 定义

开发者 rohitg00 基于自身 agent 记忆系统经验，对 [[concepts/llm-wiki-pattern|LLM Wiki 模式]] 的扩展提案（GitHub Gist "LLM Wiki v2"），加入记忆生命周期与置信度评分等机制。

## 四项关键扩展

1. **记忆生命周期**：置信度评分（confidence scoring）、取代追踪（supersession tracking）、保持衰减（retention decay，参照艾宾浩斯遗忘曲线）
2. **巩固分层**：工作记忆 → 情景记忆 → 语义记忆 → 程序记忆（working → episodic → semantic → procedural）
3. **知识图谱结构化**：类型化实体 + 关系类别（"uses"、"depends on"、"contradicts"、"supersedes"）
4. **多 agent 治理**：并行 agent 场景下共享知识与私有知识的范围划分

## 适用时机

Starmorph 指南的判断：这些扩展在 wiki 超过约 **100-200 页**、简单 index 导航开始退化时才变得相关——在此之前属于过早优化（对照 [[concepts/change-contract|变更契约]] 来源的"反过早基建"原则：由真实失败触发）。

## 与本 vault 的关联

- 置信度字段可低成本引入 frontmatter（AGENTS.md 页面格式的可选项），配合 [[entities/dataview|Dataview]] 查询低置信页面
- "contradicts / supersedes" 关系类型与本库 lint 操作（矛盾、过时论断检测）目标一致，可作为 lint 报告的分类词汇表

## 相关页面

- [[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]]
- [[concepts/scale-and-hybrid-strategy|规模边界与混合策略]]
