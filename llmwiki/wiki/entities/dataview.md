---
tags: [llm-tools, knowledge-management]
sources: [llm.md, How-to-Build-Karpathys-LLM-Wiki.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["Dataview"]
---

# Dataview

## 定义

Obsidian 插件，可对页面的 YAML frontmatter 运行查询，生成动态表格与列表。

## 在来源文档中的角色

作为 [[concepts/llm-wiki-pattern|LLM Wiki 模式]] 的配套提示被提及："如果你的 LLM 为 wiki 页面添加了 YAML frontmatter（标签、日期、来源数量），Dataview 就能生成动态表格和列表。"——即 frontmatter 规范（见 AGENTS.md 的"页面格式"）是 Dataview 可用性的前提。

## 与本 vault 的关系

本知识库所有页面均按规则携带 frontmatter（tags / sources / created / updated），若将来用 Obsidian 浏览，可直接使用 Dataview 做动态汇总（如"按来源数排序的概念页"）。

## 典型查询（来自 [[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]]）

若 schema 为页面加了 confidence 字段，一句 Dataview 查询即可定位最薄弱的知识：

    ```dataview
    TABLE type, confidence, updated
    FROM "concepts"
    WHERE confidence = "low"
    SORT updated ASC
    ```

——把"哪里需要补研究"变成可执行的清单，与 [[concepts/llm-wiki-v2|LLM Wiki v2 扩展模式]] 的置信度机制天然衔接。

## 相关页面

- [[sources/llm-wiki-pattern|LLM Wiki 模式（来源摘要）]]
- [[entities/obsidian|Obsidian]]
