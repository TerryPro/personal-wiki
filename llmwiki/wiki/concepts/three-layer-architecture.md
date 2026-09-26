---
tags: [ai, llm, knowledge-management]
sources: [llm.md]
created: 2026-09-25
updated: 2026-09-26
aliases: ["三层知识架构"]
---

# 三层知识架构

[[concepts/llm-wiki-pattern|LLM Wiki 模式]] 将系统分为三层，每层有明确的所有权和可变性规则：

## 第一层：原始资料（raw sources）

- 用户亲手策展的源文档集合：文章、论文、图片、数据文件
- **不可变**——LLM 只读取，绝不修改
- 定位："这是你的真理之源"（your source of truth）
- 本 vault 对应：`raw/`（附件在 `raw/assets/`）

## 第二层：wiki

- LLM 生成的 markdown 文件目录：摘要、实体页、概念页、对比、综述、综合
- **LLM 完全拥有这一层**——创建页面、随新来源到达而更新、维护交叉引用、保持整体一致
- 用户的角色是阅读，写入归 LLM（见 [[concepts/human-llm-division-of-labor|人机分工]]）
- 本 vault 对应：`wiki/`（sources/、entities/、concepts/、synthesis/ + index.md + log.md）

## 第三层：schema

- 告知 LLM 结构、约定与工作流的配置文档（如 CLAUDE.md、AGENTS.md）
- 由人与 LLM 共同演化（详见 [[concepts/schema-driven-agent|Schema 驱动代理]]）
- 本 vault 对应：`AGENTS.md`

## 层间关系

原始资料是事实基准 → wiki 是编译产物 → schema 是编译器的规则手册。三层的所有权分离（用户拥有第一层、LLM 拥有第二层、双方共有第三层）是模式能长期运转的结构性保证。

## 相关页面

- [[sources/llm-wiki-pattern|LLM Wiki 模式（来源摘要）]]
- [[concepts/schema-driven-agent|Schema 驱动代理]] —— 第三层的展开
- [[concepts/change-contract|变更契约]] —— 把层间可变性规则显式化到目录命名
- [[concepts/ingest-query-lint|三大操作（Ingest / Query / Lint）]] —— 静态三层对应的动态循环
