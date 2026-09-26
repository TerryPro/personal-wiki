---
tags: [ai, llm, llm-wiki]
sources: [brain-os-markdown-git-juejin.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["长期 Brain OS：Markdown + Git 的工程化再思考（沐风）"]
---

# 长期 Brain OS：Markdown + Git 的工程化再思考（沐风）

**Source:** brain-os-markdown-git-juejin.md
**Date ingested:** 2026-09-25
**Type:** 中文体系设计文（掘金，2026-07-25）

## Summary

作者构建的 Mufeng Brain OS 对 [[concepts/llm-wiki-pattern|LLM Wiki 模式]] 的批判性扩展：把"内容类型"升级为"变更契约"、给 agent 的是仓库协议而非提示词、用确定性程序 + 语义审查双重校验，并给出五步最小可落地版本。定位是长期（数月/数年后仍可检查、修订、迁移）的知识底座。

## Key Claims

- 三个基本问题：只做搜索知识不会自然积累；来源/综合/项目/历史不能混在一个目录；如何防 AI 把知识库越维护越乱
- 明确边界声明：Karpathy 提案是个人知识库设计，**不是**证明 wiki 在所有规模上优于 RAG 的基准结论；"搜索是导航层，不应该自动成为唯一的真相层"
- 核心创新——变更契约：`10-inbox（允许粗糙）→ 20-sources（首次摄取后不静默改写）→ 30-knowledge（随证据持续修订）→ 40-projects → 50-research → 60-writing → 70-investing → 80-logs → 90-archive`；每层明确"什么可以改、什么不能改"
- "证据不可静默改写，结论可以被修订，这两件事必须同时成立"
- Markdown + Git 四属性：可检查、可比较（diff 审查 agent 改动）、可迁移、可重建（向量索引/图缓存都是可从 markdown 重新生成的加速层）；但"工具只提供能力，不能替代治理"
- 给 agent 的是仓库协议：修改前必读 AGENTS.md + 索引 + Schema，先搜同主题页面防漂移；frontmatter 最小集是 id/type/status/visibility/created/updated——schema 不是把 markdown 伪装成数据库，而是多 agent 对页面身份与生命周期的最低共识
- 主张分层：重要主张必须区分**事实、推断、假设、意见、决定**——AI 最危险的错误是把"来源作者的判断"压缩成"已验证的事实"
- 确定性校验：tools/brain.py（仅依赖 Python 标准库）检查必需文件/Schema/ID 唯一性/断链/索引覆盖，`make verify` 跑 9 项测试；"语义审查判断内容可信度，确定性程序阻止缺字段断链漏索引，两种检查各解各的问题"
- 真实失败教训：引用只指向作者主页链接 ≠ 可审计证据，必须精确到具体页面并建立来源记录（作者、创建时间、访问时间、捕获方式、记录限制）
- 反过早基建：当前规模 index + rg 足够；向量库、知识图谱、复杂自动化应由**真实失败触发**（反复找不到已知内容、索引过大、重复页面）而非想象预装
- 五步最小落地：①Markdown 为权威底座（应用只是视图）②至少分开 sources 与 knowledge ③AGENTS.md 写清修改规则 ④最小 schema ⑤把规则变成测试

## Entities Mentioned

- [[entities/obsidian|Obsidian]]、Git、Codex / [[entities/claude-code|Claude Code]] / Cursor / Gemini CLI / OpenCode（多 agent 共同读写）

## Concepts Covered

- [[concepts/llm-wiki-pattern|LLM Wiki 模式]]、[[concepts/three-layer-architecture|三层知识架构]]、[[concepts/schema-driven-agent|Schema 驱动代理]]、[[concepts/change-contract|变更契约]]、[[concepts/retrieval-vs-compilation|检索式与编译式范式]]、[[concepts/scale-and-hybrid-strategy|规模边界与混合策略]]
