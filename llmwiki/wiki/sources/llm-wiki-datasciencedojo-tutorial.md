---
tags: [ai, llm, llm-wiki]
sources: [LLM-wiki-by-andrej-karpathyi-Build.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["LLM Wiki 30 分钟上手教程（Data Science Dojo）"]
---

# LLM Wiki 30 分钟上手教程（Data Science Dojo）

**Source:** LLM-wiki-by-andrej-karpathyi-Build.md
**Date ingested:** 2026-09-25
**Type:** 英文实操教程（datasciencedojo.com）

## Summary

面向新手的 6 步实操教程：用 5 篇经典 AI 论文（Attention Is All You Need、BERT、GPT-3、Foundation Models、RLHF）在 30 分钟内搭起第一个 [[concepts/llm-wiki-pattern|LLM Wiki 模式]] 实例，演示了从建目录、编译提示词到 [[entities/obsidian|Obsidian]] 图谱浏览、增量复利和 lint 的完整闭环。

## Key Claims

- 多数 AI 知识工具是**无状态的**：每次会话从零开始，模型检索、回答、遗忘
- 规模效应三阶段：10 页能答基本问题；50 页开始综合你从未显式连接的观点；100+ 页能回答"答案不存在于任何单一来源、而存在于页面间关系里"的问题
- 操作极简：Claude.ai 免费版即可（上传 PDF + 粘贴编译提示词），Claude Code 自动化写入；无需编程
- RAG 对比表中的独有观点：RAG 源级可追溯性**高**、wiki 只有**中等**（页面级）——与 Starmorph 指南的"源级引用更优"结论存在口径差异（分歧点：wiki 通过 sources frontmatter 回溯 raw/ 的程度）
- 每 ~20 个新页面运行一次 lint："自愈步骤"，防止错误经三条入链扩散成"组织化的错误信息"
- 三大常见错误：一页混多个概念（应拆分）、从不 lint、一次混入过多不相关主题（主题集中的图谱更丰富）
- Karpathy 实测边界重申：约 100 篇 / 40 万词规模下 index + 摘要导航仍快于且准于 RAG 管道
- 进阶方向：一个研究主题一个独立 wiki（比巨型单库图谱更干净）；100+ 页维护良好的 wiki 可作 fine-tuning 训练集，"把个人研究变成私有定制情报"

## Entities Mentioned

- [[entities/andrej-karpathy|Andrej Karpathy]]、[[entities/obsidian|Obsidian]]、[[entities/claude-code|Claude Code]] / Claude.ai、[[entities/notebooklm|NotebookLM]]

## Concepts Covered

- [[concepts/llm-wiki-pattern|LLM Wiki 模式]]、[[concepts/compounding-knowledge|知识复利]]、[[concepts/rag|RAG]]、[[concepts/scale-and-hybrid-strategy|规模边界与混合策略]]
