---
tags: [ai, llm, agents]
sources: [llm-wiki-tech-deep-dive-csdn.md, llm-wiki-teardown-juejin.md]
created: 2026-09-25
updated: 2026-09-26
aliases: ["Farzapedia"]
---

# Farzapedia

## 定义

开发者 Farza 在 [[entities/andrej-karpathy|Andrej Karpathy]] 发推两天后，用 [[concepts/llm-wiki-pattern|LLM Wiki 模式]] 思路搭建的个人知识库实例——中文圈的"最惊艳落地案例"（经 [[sources/llm-wiki-tech-deep-dive-csdn|LLM Wiki 技术深度解析（CSDN）]] 介绍）。

## 规模与构成

```
2500 条日记 + Apple Notes 笔记 + 部分 iMessage 对话
        ↓ LLM 编译
400 篇结构化 Markdown 文章（全部带反向链接）
内容涵盖：朋友、创业项目、研究方向、最喜欢的动漫及其个人影响
```

## 关键设计思想

- 金句：**"这个 Wiki 不是给我看的，是给我的 Agent 看的。"** 文件结构与反向链接为 agent 爬取而优化——从 index.md 出发即可精准定位
- 基于文件系统的知识库 agent 天然能理解，比任何封闭格式都好用
- 实际案例：设计产品落地页时让 agent"去看看最近启发我的图片和电影"，agent 从 wiki 翻出吉卜力纪录片笔记、截图过的 YC 落地页、七十年代 Beatles 周边设计，融合三者给出方案——**跨概念页综合出人类自己都没注意到的联系**
- **对 RAG 的否定**：Farza 此前用 RAG 做过类似系统，原话“it was ass”（烂透了）；他认为文件系统结构的 wiki 让 agent 能真正理解和导航知识，比向量检索靠谱得多（呼应 [[concepts/retrieval-vs-compilation|检索式与编译式范式]]）

## 意义

Farzapedia 证明了 wiki 作为 agent 记忆的第二条路：agent 个性化不必依赖黑箱记忆功能，而可以建立在显式、人类可读、可审计、可迁移的文件底座上——这直接启发了 [[concepts/karpathy-four-principles|Karpathy AI 个性化四原则]] 的提出。

## 一手来源与溯源

本条目的事实最初来自二手转述（[[sources/llm-wiki-tech-deep-dive-csdn|LLM Wiki 技术深度解析（CSDN）]]）。2026-09-25 联网核查定位到一手来源：

- **一手出处**：Farza（X 账号 `@FarzaTV`，本名 Farza Majeed）于 **2026-04-04** 发布的推文《**This is Farzapedia**》；同文镜像发于 LinkedIn（`linkedin.com/posts/farza-majeed-76685612a_...`）
- **传播数据**：该推文获约 **123 万浏览、3825 赞、4710 收藏**（注：与 [[entities/andrej-karpathy|Karpathy]] 主推文的 16M~17M 浏览是两条不同推文，勿混淆）
- **Karpathy 引用**：Karpathy 在 `x.com/karpathy/status/2040572272944324650` 转引 Farzapedia，并据此总结出 [[concepts/karpathy-four-principles|Karpathy AI 个性化四原则]]
- **溯源状态**：X 正文无法直接抓取，上述细节系经 juejin（8 万人收藏拆解文）、CSDN、blockchain.news 三方二手报道交叉核实后重建。其中 [[sources/llm-wiki-teardown-juejin|掘金拆解文]]（含 Farza 推文较完整转述）已于 2026-09-25 作为来源存入 raw/（`llm-wiki-teardown-juejin.md`）；Farza 的 X 推文逐字原文仍待补录
- **时间线待核（2026-09-26 lint）**：[[sources/llm-wiki-tech-deep-dive-csdn|CSDN 深度解析]] 称「Karpathy 发推**两天后**」Farza 即搭建，而本页记 Farza 推文为 2026-04-04；[[sources/llm-wiki-teardown-juejin|掘金拆解]] 的「两天后」实指 Karpathy **追加 Gist** 的时间，与 Farzapedia 无关。若 Farza 推文确为 04-04，Karpathy 原推应在 04-02 前后——推文确切日期（04-02/04-03/04-04）说法不一，故 wiki 内统一改用「2026 年 4 月初」表述。

## 相关页面

- [[synthesis/llm-wiki-case-studies|LLM Wiki 典型案例对照]] —— 本案例在四类典型案例中的定位
- [[concepts/compounding-knowledge|知识复利]] —— 本案例印证的机制
