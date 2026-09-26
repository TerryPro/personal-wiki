# Index

所有 wiki 页面的总目录，每次摄取（ingest）后更新。

## Sources

- [[sources/llm-wiki-pattern|LLM Wiki 模式（来源摘要）]] — Karpathy 关于用 LLM 构建并维护持久互链 wiki 的思想文件
- [[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]] — 最系统英文指南：架构、schema 模板、社区实现、批评与谱系
- [[sources/llm-wiki-datacamp-overview|LLM Wiki：新一代 AI 知识架构（DataCamp 综述）]] — 检索式 vs 编译式范式，双受众定义，agent 记忆视角
- [[sources/llm-wiki-datasciencedojo-tutorial|LLM Wiki 30 分钟上手教程（Data Science Dojo）]] — 5 篇论文起步的新手实操与常见错误
- [[sources/self-growing-knowledge-base-canghe|自生长个人知识库实战（苍何）]] — 中文实战：三种搭建路线、可复用提示词、模型选型
- [[sources/claude-obsidian-engineering-practice-csdn|claude-obsidian 工程化实践详解（CSDN）]] — hash 去重、hot.md 缓存、答案治理、企业适用性评估
- [[sources/llm-wiki-tech-deep-dive-csdn|LLM Wiki 技术深度解析（CSDN）]] — 中文最完整剖解：Farzapedia 案例、四原则、使能条件、趋势判断
- [[sources/brain-os-markdown-git-mufeng|长期 Brain OS：Markdown + Git 的工程化再思考（沐风）]] — 变更契约、仓库协议、确定性校验
- [[sources/llm-wiki-teardown-juejin|Karpathy LLM Wiki 完整拆解（掘金）]] — 三层架构中文拆解，独家引入 bluewater8008 六条生产教训与 idea file 理念
- [[sources/what-is-the-llm-wiki-karpathys|What Is the LLM Wiki?（Karpathy 的 AI 知识库导论）]] — 检索式视角：把 LLM wiki 当作 RAG 结构化知识库，含检索管线与分块策略

## Entities

- [[entities/andrej-karpathy|Andrej Karpathy]] — LLM Wiki 模式的提出者，llm.md 作者
- [[entities/obsidian|Obsidian]] — markdown 知识库应用，wiki 的阅读浏览界面（"IDE"）
- [[entities/qmd|qmd]] — 本地 markdown 搜索引擎，BM25/向量混合检索 + LLM 重排序
- [[entities/marp|Marp]] — 基于 markdown 的幻灯片格式，查询产物的输出形式之一
- [[entities/dataview|Dataview]] — Obsidian 插件，对 frontmatter 运行动态查询
- [[entities/claude-obsidian-community|Claude-Obsidian 与社区实现]] — claude-obsidian 项目及一周内涌现的 7+ 开源实现群
- [[entities/farzapedia|Farzapedia]] — 2500 条日记→400 篇互链文章的标杆案例，"wiki 是给 Agent 看的"
- [[entities/claude-code|Claude Code]] — Anthropic 终端 agent，LLM Wiki 生态最常用执行端（CLAUDE.md 命名由来）
- [[entities/notebooklm|NotebookLM]] — Google 文档问答产品，本库中作为 RAG 路线对照样本被引用
- [[entities/mindstudio|MindStudio]] — 低代码 AI 应用/agent 平台，What Is the LLM Wiki 一文发布方（Remy）

## Concepts

- [[concepts/llm-wiki-pattern|LLM Wiki 模式]] — LLM 增量构建并维护持久互链 wiki，取代查询时检索
- [[concepts/rag|RAG]] — 检索增强生成：可用但无积累，wiki 模式的对照面
- [[concepts/compounding-knowledge|知识复利]] — wiki 作为持久产物，摄取与查询回填均使其增值
- [[concepts/memex|Memex]] — Vannevar Bush 1945 年的个人知识库设想，本模式思想源头
- [[concepts/schema-driven-agent|Schema 驱动代理]] — 用 AGENTS.md 类配置把 LLM 变成有纪律的 wiki 维护员
- [[concepts/three-layer-architecture|三层知识架构]] — raw（不可变）/ wiki（LLM 全权）/ schema（共同演化）
- [[concepts/human-llm-division-of-labor|人机分工]] — 人选料提问思考，LLM 做全部摘要、引用、归档、记账
- [[concepts/retrieval-vs-compilation|检索式与编译式范式]] — 查询时检索 vs 摄取时编译，两种知识处理路线
- [[concepts/scale-and-hybrid-strategy|规模边界与混合策略]] — 各量级下的导航方式、wiki/RAG 互补架构、已知风险
- [[concepts/karpathy-four-principles|Karpathy AI 个性化四原则]] — 显性化、属于你、File over App、BYOAI
- [[concepts/llm-wiki-v2|LLM Wiki v2 扩展模式]] — 记忆生命周期、置信度、多 agent 治理的后续扩展提案
- [[concepts/change-contract|变更契约]] — 按"什么可以改"划分目录的 Brain OS 工程化升级
- [[concepts/chunking-strategies|分块策略]] — 固定/语义/层级三类切分，检索式知识库最易出错的一环
- [[concepts/retrieval-pipeline|检索管线]] — 摄入/嵌入/向量库/检索接口四层，RAG 的基础设施全貌

## Synthesis

- [[synthesis/wiki-mode-advantages|Wiki 模式的优势（综合评估）]] — 基于 8 来源的六项优势、边界条件与置信度评级（synthesis 首篇）
- [[synthesis/llm-wiki-case-studies|LLM Wiki 典型案例对照]] — Farzapedia、三本商业书实验、DSDojo 教程、社区实现四类案例的规模与启示对照
- [[synthesis/llm-wiki-definition-divergence|LLM Wiki 的两种定义]] — 检索增强底座 vs 编译式知识库：同一热词的两套互不兼容定义
