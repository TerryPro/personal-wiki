---
tags: [ai, llm, rag, llm-tools]
sources: [What-Is-the-LLM-Wiki-Karpathys.md]
aliases: ["检索管线"]
created: 2026-09-26
updated: 2026-09-26
---

# 检索管线

## 定义

检索管线：把一个知识库变成"agent 可查询"所需的整套工程组件与流程。[[sources/what-is-the-llm-wiki-karpathys|What Is the LLM Wiki?]] 将其概括为**四层架构**：① 摄入管线 ② 嵌入生成 ③ 向量数据库 ④ 干净的 agent 检索接口。它是**检索式**路线（[[concepts/rag|RAG]]）的核心基础设施，也是本页被引出的背景——本库主线的编译式 wiki（[[concepts/llm-wiki-pattern|LLM Wiki 模式]]）刻意**省掉**这整层。

## 四个层次

### 1. 摄入管线（Ingestion Pipeline）

原始材料（文档、网页、数据库导出、转录、邮件）流入处理流水线：

- **解析（Parsing）**：PDF/DOCX/HTML → 干净文本
- **清洗（Cleaning）**：剥离页眉页脚、导航、样板文字
- **去重（Deduplication）**：跨来源识别并移除冗余
- **切分（Splitting）**：按语义边界分块，见 [[concepts/chunking-strategies|分块策略]]

工具示例：PyPDF2 / Unstructured（解析）、LangChain text splitters / LlamaIndex node parsers（切分）。

### 2. 嵌入生成（Embedding Generation）

每个 chunk 转为**向量嵌入**——捕捉语义的数值表示；语义相近的块在向量空间中彼此靠近，与是否用词相同无关。问题也做嵌入，从而做语义相似检索。嵌入模型的选择与生成方式直接影响检索质量（如 OpenAI text-embedding-3-small，或经 Ollama 的本地模型）。

### 3. 向量数据库（Vector Database）

存放嵌入，专为**近似最近邻搜索**优化（给定查询向量快速找出最相近的 N 个）。常见：Pinecone、Weaviate、Chroma、pgvector。通常同时配一个**元数据存储**，保存原始文本、来源引用、时间戳及结构化字段。

规模建议：几百篇以内可用内存检索甚至关键词法；生产系统用向量库显著提升语义检索与可扩展性；开源 Chroma / pgvector 上手门槛低，托管 Pinecone / Weaviate 承担规模与可用性。

### 4. 检索与重排序（Retrieval & Re-ranking）

设计良好的系统不是只取 top-1：

- **重排序（Re-ranking）**：二次打分，按相关性/时效重排召回结果——"先广召回、再紧排序"优于单趟检索
- **混合检索（Hybrid Search）**：向量相似 + 传统关键词检索（**BM25**）合并结果，处理语义检索易漏的精确术语（缩写、产品名、特定代号）

### Agent 接口

agent 无需知道嵌入与数据库存在，只需调用一个工具，如 `search_knowledge_base(query)`：发自然语言查询、取回最相关的块及其元数据、并入推理。接口越干净可预测，agent 使用越可靠。

## 两项使检索更精准的精化

- **元数据过滤（Metadata Filtering）**：在语义搜索**之前**按来源、日期、内容类型、标签过滤（"只要近一个月的笔记""只要 machine-learning 标签"），缩小候选池、减少误匹配
- **来源引用（Source Citations）**：答案旁返回源分块，让用户可核验、深读；是**防止 agent 悄悄改用训练数据作答的最有效护栏**

## 常见故障与排查

[[sources/what-is-the-llm-wiki-karpathys|同上来源]] 给出的排障映射：

- 重要块召回不出 → 分块或嵌入问题
- 不相关块排名靠前 → 需重排序或改进查询构造
- 结果出现重复内容 → 摄入去重问题
- agent 忽视知识库 → 工具接口不清晰或结果噪声过大
- 结果变陈旧 → 需为摄入管线加变更触发

## 与编译式 wiki 的对照

| 维度 | 检索管线（本条） | 编译式 wiki |
|---|---|---|
| 核心资产 | 嵌入 + 向量库 + 元数据 | markdown 页面 + 双链 |
| 知识单元 | chunk（机械/语义切分） | 页面（人机共同理解） |
| 基础设施 | 重（较多组件） | 零（一个文件夹 + agent） |
| 悖论 | 需要专门解决"上下文随块同行" | 页面自带上下文与来源 |

后者对前者的批评正是"文件系统 + index 在中等规模下即可替代向量检索"，见 [[concepts/scale-and-hybrid-strategy|规模边界与混合策略]] 与 [[concepts/retrieval-vs-compilation|检索式与编译式范式]]。

## 相关页面

- [[sources/what-is-the-llm-wiki-karpathys|What Is the LLM Wiki?（Karpathy 的 AI 知识库导论）]]——本页主要出处
- [[concepts/chunking-strategies|分块策略]]——管线中最易出错的一环
- [[concepts/rag|RAG]]——检索管线服务的范式
