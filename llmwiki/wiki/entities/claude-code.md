---
tags: [llm-tools, agents]
sources: [llm.md, How-to-Build-Karpathys-LLM-Wiki.md, LLM-wiki-by-andrej-karpathyi-Build.md, agent-obsidian-llm-wiki-claude-obsidian-csdn.md, brain-os-markdown-git-juejin.md, self-growing-knowledge-base-workbuddy-obsidian.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["Claude Code"]
---

# Claude Code

## 定义

Anthropic 推出的终端形态 LLM agent（命令行运行，直接读写本地文件、执行 shell）。在 [[concepts/llm-wiki-pattern|LLM Wiki 模式]] 生态中是最常用的执行 agent——Karpathy 本人以它为主力，schema 文件因此命名为 CLAUDE.md（Codex 环境则用 AGENTS.md，见 [[concepts/schema-driven-agent|Schema 驱动代理]]）。

## 在本知识库来源中的角色

- [[sources/llm-wiki-pattern|LLM Wiki 模式（来源摘要）]]：Karpathy 的 gist 设计为"粘贴给你的 LLM Agent（OpenAI Codex、Claude Code、OpenCode/Pi 等）"
- [[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]]：完整搭建教程以 Claude Code 为默认执行端（`cd <wiki> && claude` + 摄取指令）；最小可行栈 = 一个文件夹 + 任意 LLM agent
- [[sources/llm-wiki-datasciencedojo-tutorial|LLM Wiki 30 分钟上手教程（Data Science Dojo）]]：给出 Claude.ai（免终端、上传 PDF + 提示词）与 Claude Code（自动写盘）双路线
- [[sources/claude-obsidian-engineering-practice-csdn|claude-obsidian 工程化实践详解（CSDN）]]：claude-obsidian 以 Claude Code 插件市场分发，但同类 Skill 在 Codex、Cursor 等 agent 中通用
- [[sources/brain-os-markdown-git-mufeng|长期 Brain OS：Markdown + Git 的工程化再思考（沐风）]]：Brain OS 定位为"可被 Codex、Claude Code、Cursor、Gemini CLI、OpenCode 共同读写的文件协议"——多 agent 可互换是共识

## 选型提示

[[sources/self-growing-knowledge-base-canghe|自生长个人知识库实战（苍何）]] 提醒：agent 选择门槛低（各家都能干），**真正重要的是底层模型质量**——"优质模型带来优质编译"。

## 相关页面

- [[entities/claude-obsidian-community|Claude-Obsidian 与社区实现]]、[[concepts/llm-wiki-pattern|LLM Wiki 模式]]
