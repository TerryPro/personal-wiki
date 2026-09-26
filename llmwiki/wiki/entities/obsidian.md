---
tags: [llm-tools, knowledge-management]
sources: [llm.md, self-growing-knowledge-base-workbuddy-obsidian.md, agent-obsidian-llm-wiki-claude-obsidian-csdn.md, How-to-Build-Karpathys-LLM-Wiki.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["Obsidian"]
---

# Obsidian

## 定义

本地 markdown 知识库应用。在 [[concepts/llm-wiki-pattern|LLM Wiki 模式]] 中充当 wiki 的**阅读与浏览界面**——核心隐喻："Obsidian 是 IDE；LLM 是程序员；wiki 是代码库"（见 [[concepts/human-llm-division-of-labor|人机分工]]）。

## 来源文档中提及的功能

- **图谱视图（Graph View）**：查看 wiki 形状的最佳方式——什么与什么相连、哪些页面是枢纽、哪些是孤儿
- **Web Clipper（网页剪藏扩展）**：把网页文章转为 markdown 存入 `raw/`
- **附件路径设置**：Settings → Files and links 将附件文件夹设为 `raw/assets/`；配合 "Download attachments for current file" 快捷键（如 Ctrl+Shift+D）本地化文章图片
- **插件生态**：支持 [[entities/marp|Marp]]（幻灯片）与 [[entities/dataview|Dataview]]（frontmatter 查询）
- wiki 本质是 markdown 文件目录，天然可放入 git 获得版本历史、分支与协作

## 与本 vault 的关系

本知识库 `f:\WIKI\LLMWIKI\llmwiki` 即设计为用 Obsidian 打开的 vault；`[[wikilink]]` 语法正是 Obsidian 的原生链接格式。

## 已知限制（来源文档指出）

LLM 无法一次读完带内嵌图片的 markdown——需先读文本，再单独查看被引用的图片（"有点笨拙但够用"）。

## 多来源角色补充（2026-09-25 批量摄取）

- **三重角色**（[[sources/self-growing-knowledge-base-canghe|自生长个人知识库实战（苍何）]]）：存储底座、人机操作界面、知识观察窗口
- **选它的根本理由：数据主权**（[[sources/claude-obsidian-engineering-practice-csdn|claude-obsidian 工程化实践详解（CSDN）]]）：笔记全在本地纯文本，不锁在厂商服务器；Notion/IMA/[[entities/notebooklm|NotebookLM]] 依赖平台，知识迁移受格式锁死。"工具可以换，知识不用跟着搬家"——这也是 [[concepts/karpathy-four-principles|Karpathy AI 个性化四原则]] 中 File over App 的落地
- **反向链接面板**（[[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]]）：点任一页面即可看到所有引用它的页面，无需手工维护关系清单
- **提醒：不要神化它**：Obsidian 只管文件与可视化，知识库质量取决于 agent 与框架（另见 [[entities/dataview|Dataview]]、[[entities/marp|Marp]] 插件路线）

## 相关页面

- [[sources/llm-wiki-pattern|LLM Wiki 模式（来源摘要）]]
- [[concepts/three-layer-architecture|三层知识架构]]
