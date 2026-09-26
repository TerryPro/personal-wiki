---
tags: [ai, llm, llm-wiki]
sources: [self-growing-knowledge-base-workbuddy-obsidian.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["自生长个人知识库实战（苍何）"]
---

# 自生长个人知识库实战（苍何）

**Source:** self-growing-knowledge-base-workbuddy-obsidian.md
**Date ingested:** 2026-09-25
**Type:** 中文实战教程（掘金，2026-08-09）

## Summary

基于 [[concepts/llm-wiki-pattern|LLM Wiki 模式]] 的中文落地实战：论证为何选 [[entities/obsidian|Obsidian]]、agent 执行层职责，给出扩展三层目录模板与完整的搭建/摄取提示词，并对比三种落地路线（提示词直搭、[[entities/claude-obsidian-community|claude-obsidian 插件]]、WeSight 插件）。

## Key Claims

- "自生长"的定义：AI 处理完资料后知识库**必须留下变化**——新增概念、补上关联、或暴露一个暂无答案的问题；变化累积才成体系
- 三层职责口诀：Raw 保存证据，Wiki 记录理解，Schema 负责定规则
- Obsidian 三角色：存储底座、人机操作界面、知识观察窗口；对比 Notion/IMA/[[entities/notebooklm|NotebookLM]] 的优势是本地化与数据自主（"工具可以换，知识不用跟着搬家"）
- wiki 页面更重要的价值是成为 **agent 的长期检索层和推理底座**：提问时先检索已沉淀页面，沿双链回溯原文，答案有依据、可追溯
- 三种搭建路线由繁到简：提示词直搭（需工程化理解）→ claude-obsidian（初始化/入库/检索封装为 Agent Skill）→ WeSight（全部整合进 Obsidian 界面，会员内测）
- 模型选型：长上下文优先；建议用自己的真实资料跑完整任务，观察上下文丢失、工具调用稳定性、输出格式漂移与成本
- 提供可复用的 10 条 AGENTS.md 规则提示词（先搜已有页面、raw 不可变、来源可溯、分歧保留不覆盖、待核实标注、不擅自删除、影响结构时暂停提问等）
- 增量维护而非重建：每次只更新受影响的页面，同步维护双链、index 与 log

## Entities Mentioned

- [[entities/obsidian|Obsidian]]、[[entities/claude-obsidian-community|claude-obsidian]]、WorkBuddy、Codex、WeSight 插件

## Concepts Covered

- [[concepts/llm-wiki-pattern|LLM Wiki 模式]]、[[concepts/three-layer-architecture|三层知识架构]]、[[concepts/schema-driven-agent|Schema 驱动代理]]、[[concepts/compounding-knowledge|知识复利]]、[[concepts/human-llm-division-of-labor|人机分工]]
