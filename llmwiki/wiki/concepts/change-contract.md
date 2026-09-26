---
tags: [ai, llm, knowledge-management]
sources: [brain-os-markdown-git-juejin.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["变更契约"]
---

# 变更契约

## 定义

沐风 Brain OS 对 [[concepts/three-layer-architecture|三层知识架构]] 的工程化升级：目录不按"内容类型"划分，而按**每层允许的变更规则**划分——"内容类型"回答"这是什么"，变更契约回答"什么可以改、什么不能改、谁能改"。

## Brain OS 的九层契约

```
10-inbox      捕获：允许粗糙和未核验
20-sources    证据：首次摄取后不静默改写
30-knowledge  综合：随证据变化持续修订
40-projects   执行：记录目标、约束和当前状态
50-research   研究：保留问题、竞争解释和证据缺口
60-writing    写作：面向读者的稿件与发布记录
70-investing  投资：观察、论点和资本决策分开
80-logs       历史：追加变更、决定和交接
90-archive    归档：退出活跃导航，但不删除历史
```

核心律令：**证据不可静默改写，结论可以被修订——两件事必须同时成立。**

## 与本 vault 规则的映射

本库的 [[concepts/schema-driven-agent|AGENTS.md]] 已隐含一份简化契约：`raw/` 不可变（≈20-sources）、`wiki/` 可维护（≈30-knowledge）、`log.md` 仅追加（≈80-logs）、`output/` 为产物（≈60-writing）。差异在于 Brain OS 把契约显式化到目录命名层，并用确定性程序校验（见下）。

## 配套机制

- **主张分层**：重要内容必须区分事实、推断、假设、意见、决定——防止 AI 压缩时把"来源作者的判断"写成"已验证的事实"
- **确定性校验**：语义审查（内容可信吗）与程序检查（缺字段、重复 ID、断链、漏索引）是两类问题，必须分别解决；程序端可用最朴素的工具（仅依赖标准库的 brain.py + `make verify`）
- **状态字段**：frontmatter 加 status/visibility，让多 agent 对页面生命周期有最低共识

## 相关页面

- [[sources/brain-os-markdown-git-mufeng|长期 Brain OS：Markdown + Git 的工程化再思考（沐风）]]
- [[concepts/scale-and-hybrid-strategy|规模边界与混合策略]] —— 反过早基建原则与契约的关系
