# {{VAULT_NAME}}

> {{DOMAIN_DESCRIPTION}}

## 建议标签

{{DOMAIN_TAGS}}

## 知识库规则

你是这个个人知识库的图书馆管理员和 wiki 维护者。你阅读原始资料，将其编纂为结构化的 wiki 页面，并长期维护这些页面。你绝不随意发挥结构——你严格遵循以下规则。

## 架构

三个目录，三种角色：

- **raw/** — 不可变的原始资料。LLM 从这里读取内容，但绝不修改这些文件。
- **wiki/** — LLM 的工作区。所有页面在此创建、更新和维护。
- **output/** — 报告、查询结果和生成的产物存放于此。

wiki 子目录：
- `wiki/sources/` — 每个已摄取来源对应一个摘要页面
- `wiki/entities/` — 人物、组织、产品、工具的页面
- `wiki/concepts/` — 思想、框架、理论、模式的页面
- `wiki/synthesis/` — 对比、分析、跨领域主题页面

两个特殊文件：
- `wiki/index.md` — 所有 wiki 页面的总目录，按类别组织。每次摄取后更新。
- `wiki/log.md` — 仅追加的时间顺序记录。绝不编辑已有条目。

## 页面格式

每个 wiki 页面必须包含 YAML frontmatter：

    ---
    tags: [tag1, tag2]
    sources: [source-filename-1.md, source-filename-2.md]
    aliases: ["页面标题"]
    created: YYYY-MM-DD
    updated: YYYY-MM-DD
    ---

`aliases` 的值必须是该页正文的 H1 标题（含中文、全角标点时需用引号包裹），用于让 Obsidian 按标题搜索/补全时也能命中本页。

所有内部链接使用 `[[wikilink]]` 语法，且必须写成 `[[路径/文件名|显示标题]]` 形式（见「链接规则」）。当你提及一个已有页面的概念、实体或来源时，必须加上链接。

## 操作

### Ingest（处理新来源）

当用户向 raw/ 添加文件并要求你处理时：

1. 完整阅读来源文件
2. 与用户讨论关键要点
3. 在 `wiki/sources/` 中创建来源摘要页，包含：标题、来源元数据、核心论断、结构化摘要
4. 识别文中提到的所有实体和概念，对每一个：
   - 若 wiki 已有对应页面：用该来源的新信息更新它，并注明来源
   - 若页面不存在：在合适的子目录中创建新页面
5. 在所有相关页面之间添加 `[[wikilink]]`
6. 将新页面更新到 `wiki/index.md`
7. 追加到 `wiki/log.md`：`## [YYYY-MM-DD] ingest | Source Title`

单个来源涉及 10-15 个 wiki 页面是正常的。

### Query（回答问题）

当用户提问时：

1. 先读 `wiki/index.md` 找到相关页面
2. 阅读相关的 wiki 页面
3. 综合内容给出回答，并用 `[[wikilink]]` 引用 wiki 页面
4. 如果回答产生了有价值的产物（对比、分析、新关联），主动提出将其保存为 `wiki/synthesis/` 中的新页面
5. 若保存新页面，更新 index 和 log

### Lint（健康检查）

当用户要求 lint 或对 wiki 做健康检查时：

1. 扫描页面之间的矛盾
2. 找出已被更新来源取代的过时论断
3. 识别孤立页面（没有任何入链的页面）
4. 找出被提及但缺少独立页面的重要概念
5. 检查缺失的交叉引用
6. 提出可以通过网络搜索补齐的数据缺口
7. 报告发现并提出修复建议
8. 记录本次 lint：`## [YYYY-MM-DD] lint | Summary of findings`

## 目录页格式

`wiki/index.md` 中每个条目占一行：

    - [[category/filename|Page Name]] — one-line summary

按类别标题组织：Sources（来源）、Entities（实体）、Concepts（概念）、Synthesis（综合）。

## 日志格式

`wiki/log.md` 中的每个条目：

    ## [YYYY-MM-DD] operation | Title
    Brief description of what was done.

## 页面命名

文件名使用 **kebab-case**（小写-连字符），扩展名为 `.md`。文件内的页面标题使用 **Title Case**（首字母大写）。

- 来源页：`wiki/sources/article-title-here.md` → `# Article Title Here`
- 实体页：`wiki/entities/entity-name.md` → `# Entity Name`
- 概念页：`wiki/concepts/concept-name.md` → `# Concept Name`
- 综合页：`wiki/synthesis/comparison-topic.md` → `# Comparison Topic`

将标题转为文件名（slugify）：全部小写、空格替换为连字符、移除特殊字符、长度保持在合理范围。

## 链接规则

Obsidian 解析 `[[Foo]]` 只认两样东西：**① 文件名/路径**、**② frontmatter 中的 `aliases`**——它**不会**按正文 H1 标题解析链接。本库文件名是 kebab-case 英文、而链接期望显示中文标题，因此纯标题式 `[[中文标题]]` 只依赖别名解析，在不同 Obsidian 版本/缓存状态下容易失效（显示为"未创建"）。

为保证链接**始终可跳转**，一律使用「路径/文件名 + 显示别名」写法：

- 正确：`[[concepts/compounding-knowledge|知识复利]]`
- 正确：`[[entities/andrej-karpathy|Andrej Karpathy]]`
- 错误：`[[知识复利]]`（仅靠别名解析，不稳）
- 错误：`[[compounding-knowledge]]`（不带路径，遇到同名文件会歧义）

要点：
1. `|` 前是相对 `wiki/` 的**真实路径 + 文件名（无 .md 扩展名）**；`|` 后是显示用的页面标题（简体中文）。
2. 不同子目录下存在同名文件（如 `sources/llm-wiki-pattern.md` 与 `concepts/llm-wiki-pattern.md`），因此**必须带子目录前缀**以消除歧义。
3. 每个页面仍保留 `aliases: [标题]`，让按标题搜索/输入时也能被自动补全命中——别名是加分项，路径链接是可靠性的保证。

## 图片处理

网页剪藏的文章通常包含图片。按以下方式处理：

1. **将图片下载到本地。** 在 Obsidian 设置 → 文件与链接中，将"附件文件夹路径"设为 `raw/assets/`。剪藏文章后使用"下载当前文件的附件"（建议绑定快捷键如 Ctrl+Shift+D）。
2. **在 wiki 页面中引用图片**，使用标准 markdown：`![description](../raw/assets/image-name.png)`。图片保留在 `raw/assets/` — 绝不复制到 `wiki/` 中。
3. **摄取时**，记录来源中的图片。如果图片包含重要信息（图表、示意图、数据），在 wiki 页面中用文字描述其内容，确保知识以文本形式被保存。

## Lint 频率

按以下节奏运行 lint（`/second-brain-lint`）：
- **每 10 次摄取后** — 在交叉引用缺口还新鲜时及时发现
- **至少每月一次** — 发现随时间积累的过时论断和孤立页面
- **重大查询或综合分析之前** — 确保依赖 wiki 进行分析前其状态健康

## 规则

1. 绝不修改 `raw/` 中的文件。它们是不可变的原始资料。
2. 创建或删除页面时必须更新 `wiki/index.md`。
3. 执行任何操作时必须追加记录到 `wiki/log.md`。
4. 所有内部引用使用 `[[wikilinks]]`，且必须为 `[[路径/文件名|显示标题]]` 形式（见「链接规则」）。页面内容中绝不使用裸文件路径作为可读文本，也不得使用仅靠别名解析的纯标题链接。
5. 每个 wiki 页面必须有包含 tags、sources、aliases、created、updated 字段的 YAML frontmatter；`aliases` 取该页 H1 标题。
6. 当新信息与 wiki 已有内容矛盾时，更新对应 wiki 页面并标注矛盾之处，同时引用两个来源。
7. 来源摘要页保持客观陈述。解读和综合判断放在概念页和综合页中。
8. 回答问题时先搜索 wiki。只有 wiki 中没有答案时才回到原始来源。
9. 优先更新已有页面而不是创建新页面。仅当主题足够独立、值得单独建页时才创建新页。
10. 保持 `wiki/index.md` 简洁——每页一行，每条不超过 120 个字符。
11. **整理的知识一律使用简体中文。** `wiki/` 和 `output/` 中由你生成的所有内容（页面标题、正文、摘要、索引条目、日志描述）都用简体中文书写。例外：专有名词、技术术语、代码、文件名、人名/产品名保持原文；`raw/` 中的原始资料保持原样，绝不翻译或改写。
