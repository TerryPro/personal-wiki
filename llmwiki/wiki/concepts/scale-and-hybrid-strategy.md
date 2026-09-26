---
tags: [ai, llm, llm-wiki]
sources: [llm-wiki-tech-deep-dive-csdn.md, How-to-Build-Karpathys-LLM-Wiki.md, LLM-Wiki-A-New-AI-Knowledge.md, LLM-wiki-by-andrej-karpathyi-Build.md, agent-obsidian-llm-wiki-claude-obsidian-csdn.md, llm-wiki-teardown-juejin.md, What-Is-the-LLM-Wiki-Karpathys.md]
created: 2026-09-25
updated: 2026-09-26
aliases: ["规模边界与混合策略"]
---

# 规模边界与混合策略

## 问题

[[concepts/llm-wiki-pattern|LLM Wiki 模式]] 并非在所有规模上成立。本页综合五个来源的量化判断，回答"什么时候 wiki 有效、什么时候该引入检索、什么时候该回到 [[concepts/rag|RAG]]"。

## 规模分级（多来源综合）

| wiki 规模 | 导航方式 | 依据 |
|---|---|---|
| < 100 来源 / ~40 万词 | index.md 手工索引足够 | Karpathy 自述"并非严格需要 RAG"，多来源重申 |
| 100~500 页 | index + 轻量搜索（[[entities/qmd|qmd]] BM25） | CSDN 深度解析分级表 |
| 500~2000 页 | 混合搜索（BM25 + 向量重排） | qmd 向量模式；claude-obsidian 的 wiki-retrieve 方案 |
| 2000+ 页 | 传统 RAG 基础设施，wiki 退居综合层 | 同上；DataCamp："对 wiki 本身跑 RAG" |

另一维度：实际上下文退化——虽然模型有 1M+ token 窗口，多位用户报告**约 200K-300K token 后质量开始下降**（漏联系、页面不一致），这正是"index 导航 + 定向阅读"必须替代"全库塞上下文"的原因。

## 何时 RAG 赢（Starmorph）

百万级文档无法全部预编译；文档变化频繁、重摄取不现实；需要亚秒级查询延迟；跨团队多权限级别共享。

## 何时 wiki 赢

~100-200 来源以内；要求知识复利；在意每条断言的源级可追溯性；只想要"一个文件夹 + 一个 LLM"的零基础设施；重视一致性检查（lint）胜过检索速度。

## 混合架构（共识）

DataCamp 与 CSDN 深度解析一致：**wiki 与 RAG 互补而非互斥**——先查 wiki（精确、已综合、人可读），再查向量库（覆盖面、新鲜度），合并生成。RAG 处理活文档新鲜度，wiki 承担编译后的长期上下文。

## 已知风险与缓解

- **知识漂移/模型坍缩**：反复改写累积小错。缓解：raw 不可变作为事实锚点、lint 查漂移、Git 全历史回溯（starmorph HN 讨论）
- **冷启动**：前几十篇摄取期查询质量不如现成 RAG；跨过量级后反超
- **复杂度上限**：当人与 agent 都无法对整体保持足够理解时系统崩溃（HN 用户 kubb）——个人/团队 50-200 来源是最稳区间
- **"苦活即学习"批评**：交出簿记是否交出理解？反驳：wiki 是参照系统不是思考替代，人仍读来源、讨论要义、做取舍（见 [[concepts/human-llm-division-of-labor|人机分工]]）

## 上下文预算：四级渐进式披露

[[sources/llm-wiki-teardown-juejin|Karpathy LLM Wiki 完整拆解（掘金）]] 引入的生产实践（bluewater8008）：与其把全库塞进上下文，不如按层逐步披露并给每层设 token 预算，直接回应上文的“上下文退化”问题：

| 层级 | 内容 | token 预算 | 加载时机 |
|---|---|---|---|
| L0 | 项目上下文 | ~200 | 每次会话都加载 |
| L1 | 索引文件 | 1-2K | 会话开始时加载 |
| L2 | 搜索结果 | 2-5K | 按需 |
| L3 | 完整文章 | 5-20K | 定向阅读 |

关键纪律：**不读完索引就不读全文**——这正是 index 导航策略在上下文层的落地。

## 企业场景局限（掘金拆解文）

面向团队/企业落地时的四条现实约束：① 规模上限不明确（Karpathy 自述 ~100 篇/40 万字，再大一个量级未验证）；② 对模型能力有要求（默认 Claude/GPT-4 级顶级模型，小模型跑 Ingest/Lint 打折）；③ 冷启动需耐心（前 5-10 篇为调校期）；④ 验证成本易被低估（LLM 会无源综合，严肃用途需算入抽查时间）。数据安全、权限控制、多人协作冲突是 Karpathy 方案未涵盖的企业难点。

## 向量库的规模门槛（检索式视角，2026-09-26）

[[sources/what-is-the-llm-wiki-karpathys|What Is the LLM Wiki?]] 从上文未覆盖的**检索侧**给出规模判断，与本页分级互补：

- **小规模（几百篇文档内）**：可不用向量库，内存检索甚至关键词法即可——与上文"< 100 来源时 index.md 足够"相呼应
- **生产系统**：向量库带来显著更好的语义检索与扩展性；开源 Chroma / pgvector 上手门槛低，托管 Pinecone / Weaviate 承担规模与可用性
- **块大小与基础设施的耦合**：检索质量直接受 embedding 模型与 chunk 策略影响，见 [[concepts/chunking-strategies|分块策略]] 与 [[concepts/retrieval-pipeline|检索管线]]

## 相关页面

- [[concepts/retrieval-vs-compilation|检索式与编译式范式]]、[[concepts/change-contract|变更契约]]、[[concepts/llm-wiki-v2|LLM Wiki v2 扩展模式]]
