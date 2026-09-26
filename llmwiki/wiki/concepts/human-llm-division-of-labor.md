---
tags: [ai, llm, agents]
sources: [llm.md, How-to-Build-Karpathys-LLM-Wiki.md, claude-obsidian-engineering-practice-csdn.md, self-growing-knowledge-base-workbuddy-obsidian.md]
created: 2026-09-25
updated: 2026-09-25
aliases: ["人机分工"]
---

# 人机分工

[[concepts/llm-wiki-pattern|LLM Wiki 模式]] 中人与 LLM 的职责划分原则。

## 分工界面

**人负责：**
- 策展来源（决定什么进入 `raw/`）
- 指导分析方向
- 提出好问题
- 思考一切含义（"the human's job is to curate sources, direct the analysis, ask good questions, and think about what it all means"）

**LLM 负责：**其余一切——摘要、交叉引用、归档、记账、一致性维护。

**用户极少亲自写 wiki**："You never (or rarely) write the wiki yourself."

## 为什么这样分

- 维护知识库的繁琐之处不在阅读与思考，而在**记账**：更新交叉引用、保持摘要新鲜、标记新旧矛盾、跨几十页维持一致
- **人类放弃 wiki 的原因**：维护负担增长快于价值
- **LLM 让该模式成立的原因**：不会厌倦、不会忘记更新引用、可一次触及 15 个文件——维护成本趋近于零，"wiki 保持健康因为维护成本近乎为零"

## 协作姿态

作者的实践：一侧开 LLM agent，一侧开 [[entities/obsidian|Obsidian]]；LLM 依据对话修改文件，人实时浏览结果——追踪链接、查看图谱、阅读更新后的页面。隐喻："Obsidian 是 IDE；LLM 是程序员；wiki 是代码库"。

商业/团队场景下可加人工审核环节（"possibly with humans in the loop reviewing updates"）。

## 对这一分工的批评与回应（2026-09-25 批量摄取）

- **"苦活即学习"批评**（HN 用户 qaadika，见 [[sources/karpathy-llm-wiki-complete-guide-starmorph|Karpathy LLM Wiki 完全指南（Starmorph）]]）：被外包的归档、交叉引用、摘要恰恰是深度理解形成的地方——最终你会得到一个自己并未内化的完整 wiki。**反方**：wiki 是参照系统而非思考替代品；人仍读来源、与 LLM 讨论要义、决定取舍——LLM 处理的是物流，不是洞见
- **分工的新边界**（[[sources/claude-obsidian-engineering-practice-csdn|claude-obsidian 工程化实践详解（CSDN）]]）：哪些资料值得入库、关键结论能否成立仍需人的判断；模型质量决定编译质量（"优质模型带来优质编译"）
- **实践式分工样板**（[[sources/self-growing-knowledge-base-canghe|自生长个人知识库实战（苍何）]]）：人定规则、检查结果、处理关键判断；agent 承担执行与编排——知识管理从手工整理变成可持续运行的人机协作机制

## 相关页面

- [[sources/llm-wiki-pattern|LLM Wiki 模式（来源摘要）]]
- [[concepts/memex|Memex]] —— Bush 未解决的"谁来维护"问题即由本分工回答
- [[concepts/compounding-knowledge|知识复利]]
