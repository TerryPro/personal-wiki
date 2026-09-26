# Log

所有操作的时间顺序记录（仅追加，不修改已有条目）。

## [2026-09-25] setup | Vault initialized
创建知识库 "llmwiki"，主题为 AI / LLM 研究。
已生成 agent 配置：AGENTS.md（Codex）。

## [2026-09-25] ingest | LLM Wiki 模式（来源摘要）
处理 llm.md。新建 13 个页面，无更新页面（首次摄取）。
新增来源：[[LLM Wiki 模式（来源摘要）]]。
新增实体：[[Andrej Karpathy]]、[[Obsidian]]、[[qmd]]、[[Marp]]、[[Dataview]]。
新增概念：[[LLM Wiki 模式]]、[[RAG]]、[[知识复利]]、[[Memex]]、[[Schema 驱动代理]]、[[三层知识架构]]、[[人机分工]]。

## [2026-09-25] ingest | LLM Wiki 相关文章批量摄取（7 篇）
处理：How-to-Build-Karpathys-LLM-Wiki.md、LLM-Wiki-A-New-AI-Knowledge.md、LLM-wiki-by-andrej-karpathyi-Build.md、self-growing-knowledge-base-workbuddy-obsidian.md、agent-obsidian-llm-wiki-claude-obsidian-csdn.md、llm-wiki-tech-deep-dive-csdn.md、brain-os-markdown-git-juejin.md。
新建 7 个来源页；新建概念 5（[[检索式与编译式范式]]、[[规模边界与混合策略]]、[[Karpathy AI 个性化四原则]]、[[LLM Wiki v2 扩展模式]]、[[变更契约]]）；新建实体 2（[[Claude-Obsidian 与社区实现]]、[[Farzapedia]]）。
更新既有页 10：[[RAG]]、[[LLM Wiki 模式]]、[[知识复利]]、[[人机分工]]、[[Schema 驱动代理]]、[[Andrej Karpathy]]、[[Obsidian]]、[[qmd]]、[[Dataview]]、[[Memex]]。
发现分歧 1：wiki 源级可追溯性与 RAG 孰优（Starmorph vs Data Science Dojo），已在 [[RAG]] 页标注双方来源待后续裁定。

## [2026-09-25] lint | 健康检查（27 页）
发现 0 错误、2 警告、4 提示，已全部处理。
机械检查全过：断链 0、孤立页 0、index 一致、frontmatter 完整、无过时论断。
已修复：新建 [[Claude Code]]、[[NotebookLM]] 两页（警告 1、2），并在 11 处提及位补双链。
免修项："Obsidian 未链"为 [[Claude-Obsidian 与社区实现]] 子串误报；RAG 追溯性分歧已合规标注；数据缺口（企业场景、MCP 集成、独立 token 成本验证）待后续摄取补齐。

## [2026-09-25] query | Wiki 模式的优势——重新分析并回填 synthesis
基于 8 来源、29 页重新综合（初版仅基于 llm.md），产出 [[Wiki 模式的优势（综合评估）]]：六项优势按论证强度排序 + 五项边界条件 + 置信度评级。
新增发现：Karpathy 推文浏览量存在 16M（Starmorph）vs 1700 万（CSDN）尾数出入，已在页内标注待下次 lint 复核。
首次启用 wiki/synthesis/ 目录，index 已新增 Synthesis 条目。

## [2026-09-25] query | LLM Wiki 典型案例——汇总并回填 synthesis
基于 4 个来源页/实体页综合，产出 [[LLM Wiki 典型案例对照]]：Farzapedia、三本商业书实验、Data Science Dojo 教程、社区开源实现四类案例的规模、核心启示与来源对照表。
已在 [[LLM Wiki 模式]]、[[知识复利]]、[[Farzapedia]]、[[Wiki 模式的优势（综合评估）]] 补充回链，index 新增 Synthesis 条目。

## [2026-09-25] query | Farzapedia 一手来源溯源
联网核查定位到 [[Farzapedia]] 的一手出处：Farza（@FarzaTV）2026-04-04 推文《This is Farzapedia》及 Karpathy 转引推文。
已在 [[Farzapedia]] 页新增“一手来源与溯源”节，补充此前缺失细节（Farza 对 RAG 的“it was ass”评价、推文 123 万浏览/3825 赞/4710 收藏）。
遗留数据缺口：X 正文无法直接抓取，一手推文全文未入 raw/，待后续补录。

## [2026-09-25] ingest | Karpathy LLM Wiki 完整拆解（掘金）
处理 llm-wiki-teardown-juejin.md（含 Farza 推文较完整转述）。新建 1 个来源页 [[Karpathy LLM Wiki 完整拆解（掘金）]]，更新 5 个既有页。
新知识落点：bluewater8008 六条生产教训→ [[Schema 驱动代理]]；四级渐进式披露 token 预算 + 企业局限→ [[规模边界与混合策略]]；idea file 理念→ [[Andrej Karpathy]] 与 [[LLM Wiki 模式]]；Farza 推文一手转述→ [[Farzapedia]] 溯源升级为“已入 raw”。
发现数据出入 1：Karpathy 原帖浏览量现三源不一（1500 万/掘金 vs 16M/Starmorph vs 1700 万/CSDN），同量级不同尾数，已按规则 6 标注待 lint 复核。

## [2026-09-26] query | Farzapedia 效果——回填至典型案例对照页
查询 Farzapedia 效果并将其作为新维度回填 [[LLM Wiki 典型案例对照]]：对照表新增“效果”列，Farzapedia 详述拆为三层效果（跨页综合 / 对比 RAG / 传播影响）。
已刷新该页 sources（+llm-wiki-teardown-juejin.md）与 updated（2026-09-26），统计口径更新为 9 来源 / 30 页；效果数据标注“无第三方复测”。




