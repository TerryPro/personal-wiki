---
tags: [ai, llm, agents]
sources: [llm.md, self-growing-knowledge-base-workbuddy-obsidian.md, agent-obsidian-llm-wiki-claude-obsidian-csdn.md, brain-os-markdown-git-juejin.md, llm-wiki-teardown-juejin.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["Schema 驱动代理"]
---

# Schema 驱动代理

## 定义

[[concepts/llm-wiki-pattern|LLM Wiki 模式]] 的第三层：用一份 **schema 文档**（如 [[entities/claude-code|Claude Code]] 的 CLAUDE.md、Codex 的 AGENTS.md）告知 LLM wiki 的结构、约定，以及摄取来源、回答问题、维护 wiki 时应遵循的工作流。

## 作用

来源文档将其称为"关键配置文件"——**它使 LLM 成为有纪律的 wiki 维护员，而非通用聊天机器人**。没有 schema，LLM 的行为不可预测：可能随意发明结构、遗漏索引更新、丢失交叉引用。

## 共同演化

Schema 不是写死的规格，而是"你与 LLM 随时间共同演化（co-evolve）的配置——一起摸索出适合你领域的做法"。例如个人的摄取节奏（一次一个来源并保持参与，还是批量低监督摄取）应作为工作流写进 schema，供未来会话遵循。

## 本 vault 的实现

本知识库的 schema 即 `llmwiki/AGENTS.md`，内容包括：架构定义、页面格式（YAML frontmatter + `[[wikilink]]`）、三种操作的工作流（Ingest/Query/Lint）、命名规范、11 条行为规则（含第 11 条"整理知识一律使用简体中文"）。

## 多来源深化的 schema 实践（2026-09-25 批量摄取）

- **模板约束页面结构**（[[sources/claude-obsidian-engineering-practice-csdn|claude-obsidian 工程化实践详解（CSDN）]]）：为每种页面类型准备 `_template.md`，元信息可参照都柏林核心标准；无模板则模型随意发挥
- **可复用的 10 条规则提示词**（[[sources/self-growing-knowledge-base-canghe|自生长个人知识库实战（苍何）]]）：先搜已有页面、raw 禁改、每源建来源页、概念实体独立建页、事实标源/存疑标"待核实"、分歧保留不覆盖、只更新受影响页面、log 只追加、不擅自删除、影响结构时暂停提问
- **仓库协议而非提示词**（[[sources/brain-os-markdown-git-mufeng|长期 Brain OS：Markdown + Git 的工程化再思考（沐风）]]）：schema 是多个 agent 对页面身份与生命周期的最低共识（id/type/status/时间字段）；进一步可升级为按可变规则划分目录的 [[concepts/change-contract|变更契约]]
- **confidence 字段**（[[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]]）：schema 模板可为页面加 high/medium/low 置信度，配合 [[entities/dataview|Dataview]] 定位最需要补研究的区域

## 生产环境六条教训（bluewater8008）

[[sources/llm-wiki-teardown-juejin|Karpathy LLM Wiki 完整拆解（掘金）]] 引入的 Gist 评论区经验：一个团队在生产环境跑了几周 LLM Wiki 后总结的六条纪律，多数应固化进 schema：

1. **先分类再提取**：50 页报告与 2 页信件需不同处理策略，先按类型分类再走类型专属提取流程，省 token 且结果更好
2. **给索引设 token 预算**：四级渐进式披露（详见 [[concepts/scale-and-hybrid-strategy|规模边界与混合策略]]），纪律是“不读完索引就不读全文”
3. **每种实体类型一个模板**：定义 7 种实体类型各有必填字段，LLM 严格遵守以保结构一致（与本页上文“模板约束页面结构”同源）
4. **每个任务产出两个输出**：输出一是给用户的答案，输出二是把发现回填 wiki；不在 schema 里明写，LLM 会把知识丢在聊天记录里（即 [[concepts/compounding-knowledge|知识复利]] 的查询回填机制）
5. **从第一天设计跨域标签**：frontmatter 加 domain 标签；跨领域共享实体是知识图谱最有价值的节点，后期补很痛苦
6. **人类负责验证**：LLM 会在不引用来源的情况下做综合，需在 schema 强制来源引用并定期抽查——“LLM 是作者，你是主编”（呼应 [[concepts/human-llm-division-of-labor|人机分工]]）

## 相关页面

- [[concepts/llm-wiki-pattern|LLM Wiki 模式]]
- [[concepts/three-layer-architecture|三层知识架构]]
- [[concepts/change-contract|变更契约]]
- [[sources/llm-wiki-pattern|LLM Wiki 模式（来源摘要）]]
