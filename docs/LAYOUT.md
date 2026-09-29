# wiki-viewer 布局规范与术语表

> 本文件是 wiki-viewer 前端布局的**单一事实来源**，用于统一术语、尺寸与交互约定。
> 新增/修改 UI 时请先对照本文档；若实现与文档冲突，以本文档为准并同步更新。
> 位置：工作区根 `docs/LAYOUT.md`（与 ARCHITECTURE/API/WORKFLOWS/PITFALLS/CONVENTIONS 同级，见 [README.md](./README.md)）。

---

## 1. 术语表（Glossary）

| 术语 | 英文/代码标识 | 含义 |
|---|---|---|
| 阅读模式 | `WikiMode` / `mode='wiki'` | 知识库浏览：三栏阅读 + 图谱 |
| 工作（工作模式） | `AiMode` / `mode='ai'` | AI 工作区：会话 + 知识库管理；分段标签用 2 字「工作」，散文用「工作模式」 |
| 顶栏 | `header` / TopBar | 每个模式顶部的 46px 工具条 |
| 左栏 | 左 `aside` | 全高首列：品牌区 + tab（工作模式）/ 分类导航（阅读） |
| 右栏 | 右 `aside` | 工作模式的 `[知识 \| 文档 \| 审查 \| 上下文 \| 历史]` 统一容器 |
| 聊天列 | 中央 `main` | 工作模式的消息流 + 输入区 |
| 工具首栏 | `AgentToolbar` | 聊天列顶部 `h-9` 信息条：pi agent 信息与控制统一入口（模型/思考档/ctx meter/成本/对话索引开关/上下文检视入口/审核门/压缩）；检视内容在右栏「上下文」tab 展示 |
| 对话索引 | `SessionIndex` | 会话轮次快速索引（pi-map 风格），置于聊天列**左侧** |
| minimap | `SessionIndex mode='mini'` | 对话索引的**收缩态**：窄条小方块 |
| 索引侧栏 | `SessionIndex mode='full'` | 对话索引的**展开态**：带背景框的完整列表 |
| 审查面板 | `ReviewPanel` | 右栏 tab：暂存 diff 的文件清单 + 着色 diff + 应用/丢弃 |
| 预览面板 | `PreviewPanel` | 右栏 tab：vault 文件渲染/源码查看（填充型） |
| 暂存 / 审核门 | `.staging/`、staging gate | agent 写入先落暂存区，人工审 diff 后才落盘 |
| 收件箱 | `RawInbox` | 工作模式右栏「知识」tab 顶部：上传/URL 剪藏入 `raw/` |
| 知识库 / vault | `VaultEntry` | 一个独立知识库（raw/wiki/output），注册于 `vaults.json` |
| 参与式侧栏 | participatory sidebar | 挤占布局的并排侧栏（**优于**悬浮抽屉/遮罩） |
| 免打扰 | zen | 阅读模式隐藏左右栏的专注态（`.` 切换） |

---

## 2. 顶层结构

### 2.1 模式路由
- `#/wiki[...]` → 阅读模式；`#/ai` → 工作模式；旧格式 `#/<cat>/<file>.md` 自动重定向。
- `App.tsx` 为瘦壳：theme + mode + pendingTask + 多知识库状态 + 待审 toast。
- 切换模式会**卸载**另一模式组件；会话流由模块级单例 `lib/agentStream.ts` 持有，**切模式不丢流**。

### 2.2 阅读模式（WikiMode）
```
┌ 顶栏(46px) ─────────────────────────────────────────────┐
├──────────┬───────────────────────────────┬──────────────┤
│ 左栏      │  中央：阅读 / 图谱 / 分栏        │ 右栏 RightRail│
│ Sidebar  │  PageView / GraphView          │ 大纲/反链/追溯  │
│ (w-side) │                               │              │
└──────────┴───────────────────────────────┴──────────────┘
```
- 左栏四视图：`[目录 | 标签 | 待创建 | 精选]`。「精选」= 书签清单（悬停可移除）+ 最近打开（最多 12 条，可清空）；书签/最近按 vault 隔离持久化 `wv-starred` / `wv-recent`（`lib/library.ts` 版本 store，与 dataVersion 同构）；目录/最近条目带 ★ 徽标。
- 搜索操作符（`lib/wiki.ts parseQuery`）：`tag:` · `cat:`（英文 key 或中文标签）· `"精确短语"` · `-排除`；多普通词为 AND；页内高亮仅取首个普通词（`primaryTerm`）。
- 顶栏页面动作簇（阅读态）：视图三态循环 → `书签(Star toggle，已收藏实心)` → `导出 Markdown(Download，Blob 下载含 frontmatter)` → `复制为 LLM 上下文`；后两者同步收入命令面板动作。

### 2.3 工作模式（AiMode）
```
┌ 顶栏(46px) ─────────────────────────────────────────────┐
├────────┬───────────────────────────────────┬─────────────┤
│ 左栏    │ 对话索引 │ 工具首栏 AgentToolbar   │ 右栏         │
│ aside  │ Session  │ 聊天列 ChatWindow      │ [知识|文档|  │
│ w-side │ Index    │      ChatInput          │  审查|上下文] │
│        │ mini/full│                        │ 固定/拉伸双态 │
└────────┴───────────────────────────────────┴─────────────┘
```
- 左栏为**全高首列**：品牌区 `Brand` 直达窗口顶，下方为分区（pane）容器。
- 左栏支持**上/下双分区通用布局**（issue #1，数据驱动）：面板注册表 `TABS`（会话/文件/设置，未来新面板参加即自动获得分栏能力）；每个分区有自己的 h-9 tab 条与内容区。状态 `{ top, bottom|null }`：`bottom=null` 为单栏（默认，现状）；上半 tab 条右端 `PanelBottom` 按钮把当前面板送到下半开启分栏（上半回落到注册表下一个面板）；下半 tab 条右端 `ArrowDownUp` 交换两区内容、`PanelBottomClose` 回退单栏。**tab 条互斥**：对方分区正在显示的面板不在本条出现（一个面板只属于一个区）。两区各 `flex-1`（1:1），中间 1px `line` 分隔。下半区选择持久化 `wv-left-bottom`（无/非法值 = 单栏；取代已废弃的 `wv-file-dock`）。
- 对话索引在聊天列**左侧**（见 §5）。
- 右栏为 `[知识 | 文档 | 审查 | 上下文 | 历史]` tab 统一容器（见 §6）。
- **主体区三选一布局**（对话 / 面板 / 双栏）：顶栏右簇 segmented 控件单选，控制中间聊天列与右侧面板的地位对等（二者可各自独占主体区）；选「面板」时聊天列完全隐藏、右栏 `flex-1` 占满主体区（tab 条保留，见 §6）。左栏为独立开关（PanelLeft），不参与该单选。

---

## 3. 顶栏工具栏约定（双模式统一）

**顺序约定**：
- 左簇：`知识库切换(VaultSwitcher)` → `模式切换(ModeSwitch)` → 模式专属控件
- 右簇：模式专属控件 → `设置(ReaderSettings/ChatSettings)` → `主题(Sun/Moon)` → 状态文本

**尺寸**：高度 `h-[46px]`；header `gap-2`；右簇 `gap-2.5`；背景 `bg-ink-soft` + 下边框。

**阅读模式右簇**：右栏折叠 → 免打扰 → 命令面板 → 阅读设置 → 主题 → 页数·同步时间
**工作模式右簇**：布局三选一（对话 MessageSquare / 面板 PanelRight / 双栏 Columns2）→ 对话排版设置 → 主题 → 在线状态

**Agent 信息不在顶栏**：ctx meter、成本、模型、思考档、审核门、压缩、上下文检视、对话索引开关统一收在聊天列顶部的 `AgentToolbar` 工具首栏（`h-9`，左簇=信息、右簇=控制），顶栏不重复展示；`AgentInfo`（meter 组件）由工具首栏嵌入。

---

## 4. 通用布局原则

1. **参与式侧栏优于悬浮抽屉**：侧栏作为 flex 并排列挤占布局，不用 `fixed/absolute` 遮罩（对话索引、审查面板均遵循）。
2. **正交布局**：行宽（百分比变量）与页边距/留白是两个独立维度，互不耦合。
   - 阅读：`--read-pct`（行宽 50–100%）⊥ `--read-pad-x/y`（页边距档位）
   - 工作模式：`--chat-w`（对话流宽 %）⊥ `--chat-pad-y`（上下留白档位）
3. **独立侧栏折叠持久化**：阅读模式 `wv-panel-l/r`；工作模式左栏 `wv-panel-l-ai`，主体区布局 `wv-layout-cr`（`center`|`right`|`both`，默认 `center`；旧的 `wv-panel-c-ai`/`wv-panel-r-ai` 两键仍可读取迁移）。快捷键 `"` 循环三选一布局、`[` 切左栏（输入控件聚焦时不触发）。**单选布局中间列与右栏至少一个可见，因此不可能出现只剩顶栏的空屏**（已取代早期“三栏完全正交”的设想）。阅读模式左栏目录视图的**分类组**（概念/实体/来源…）亦可展开/收拢（chevron 指示），收拢集持久化 `wv-side-cats`。
4. **多滚动容器定位**：大纲/跳转用 `el.closest('[data-wv-scroll]')` 就近找滚动容器 + `document` 捕获阶段监听 scroll；聊天滚动容器标记 `data-chat-scroll`。
5. **主题令牌化**：颜色一律走 CSS 变量（`--ink/--surface/--line/--fg/--accent/--cat-*`），双主题经 `html.light` 切换；组件不写死色值。
6. **固定行高保证对齐**：需要跨状态位置不变的元素（如 minimap 方块），用恒定行高/头高实现（见 §5）。

---

## 5. 对话索引（SessionIndex / pi-map）

- **位置**：聊天列左侧，`border-r` 分隔，背景 `bg-ink-soft`。
- **双态**：
  - `mini`（收缩 = minimap）：宽 `w-9`，每行只露一个小方块。
  - `full`（展开 = 索引侧栏）：宽 `w-72`，每行 = `小方块 + 编号(01..) + 用户问 + 助手答首行`。
- **位置恒定**：两态共用同一套行，行高固定 `h-11`、头高固定 `h-9`（全项目二级标题栏统一高度）→ 切换时小方块高度/垂直位置**完全不变**。
- **一一对应**：minimap 第 k 个方块 ↔ 列表第 `01..NN` 行（同序同数据源 `buildExchanges`）。
- **滚动同步（scroll-spy）**：监听 `data-chat-scroll`，高亮当前轮（方块实心 accent + 行浅底 + 左指示条），展开态列表自动跟随；点击跳转 `jumpToMsg`。
- **方块配色**：空闲实心 `fg-muted/60`（醒目），当前轮实心 `accent`。
- **文字对齐**：行是 `<button>`，必须显式 `text-left`（button 默认居中）。
- 默认态 `mini`；整体开/关由工具首栏「索引」按钮负责（off ↔ mini；mini/full 两态切换在 SessionIndex 内部）。

---

## 6. 右栏（焦点对象工作区：知识 / 文档 / 审查 / 上下文 / 历史）

**定位**：右栏展示“当前正在处理的对象”的详情与操作——对象是**整个 vault**→知识 tab；对象是**文件**→文档 tab；对象是**一批改动**→审查 tab；对象是**当前会话**→上下文 tab；对象是**会话的完整历史/分支**→历史 tab。与左栏（列表/导航）、聊天（对话）职责正交。暂不含人工编辑（预留）。

- **整体开关**：由顶栏布局三选一（对话/面板/双栏）控制，持久化 `wv-layout-cr`；右栏是一等公民列，不再“仅在有内容时出现”。需要右栏亮相的入口（打开审查/上下文/预览文件）仅将 `center` 升到 `both`，已在面板/双栏态则不变。**离线态**：右栏离线时不渲染（离线引导卡统一展示在聊天列）；若处于 `right` 则自动回落到 `center`。
- **双模式宽度**：`both` → 固定宽 `rightW`（持久化 `wv-right-w`）；`right` → 右栏 `flex-1` 占满主体区，**tab 条必须保留**（否则无法切面板，且会退化成空壳）。
- **拖拽即布局切换（drag-to-close）**：右栏左缘一条分隔线同时负责调宽与关闭，**不再设 340/760 硬上下限**。可合法区间 = `[RIGHT_MIN 260, 行宽 − CENTER_MIN 320]`；拖到区间内正常改宽；越过边界后先卡在极限宽并将 2px 指示线变 `danger` 红（预示），再多拖 `DRAG_OVERSHOOT 28px` 则松手时提交：
  - 右栏过窄 → 关右栏（`center`）；聊天列过窄 → 关聊天列（`right`）
  - 提交关闭后回写拖拽前的 `rightW`，下次展开不保留被拖到极限的窄态
  - 拖拽柄**仅在 `both` 态渲染**：`right`（面板独占）已占满主体区，调宽无意义，因此不显示拖拽柄（回 `both` 用顶栏三选一或 `"`）
  - 常量定义在 `AiMode.tsx` 顶部（`RIGHT_MIN` / `CENTER_MIN` / `DRAG_OVERSHOOT`）
- **不空屏约束**：进入 `right` 布局时，若当前停在无预览对象的文档 tab，自动落到知识 tab（总要有可见内容）。
- 统一容器 `aside`；拖拽柄 = 7px 隐形热区 + 居中 2px 可见线（常态 accent/40，hover/active 加深，拖到越界时转 `danger`），线细但颜色醒目。
- 顶部 tab：`[知识 | 文档 | 审查(n) | 上下文 | 历史]`，**永远可点**（不 disabled）；无内容时显示引导空态而非禁用。审查 tab 徽标 n = **待审文件总数**（跨会话求和），悬停提示补充会话数（如「1 个待审会话 · 共 37 个文件待审」）。tab 选择持久化 `wv-right-tab`（默认文档）。
- **共享 chrome `PanelFrame`**：头 `h-9`（icon + title + meta + actions + close）+ body 填充 + 可选 footer。PreviewPanel/ReviewPanel 均套用它，风格统一。
- **知识 tab（KnowledgePanel）**：vault 总览与入库管理——收件箱（拖拽上传/URL 剪藏）、待消化原料队列（逐个发起摄取，或「标记已消化」文字按钮人工标记；队尾附「已消化 N」折叠清单，自动消化标注来源页、人工标记带徽标）、健康问题（孤立页/断链/陈旧页，一键发起 lint 修复）、暂存待审列表（点击切到审查 tab）。根节点 `flex h-full flex-col overflow-y-auto` 自滚动，不套 PanelFrame。
- **文档 tab（PreviewPanel）**：**多文档同时打开**——状态在模块级 store `lib/openDocs.ts`（按 vault 隔离持久化 `wv-open-docs`，上限 10 个 FIFO 挤退，切模式/切库不丢）；头 = FileText + 活跃文件名 + size（多开时 meta = `N 个 · size`）+ actions（「全部关闭」常显 + 渲染/源码切换；**无头部 X**，关闭入口 = tab chip × / 全部关闭）；>1 个时头下出现横向滚动 tab 条（chip 点击切换、悬停 × 关闭，关闭后活跃落相邻 tab）；内容会话内缓存（键含 vaultId）；源码态用共享组件 `NumberedSource`（左行号栏 + 右正文，每行同一 grid 行：折行时行号对齐首视觉行、空行由行号撑高；阅读模式 PageView 的源码/分栏视图同享）；渲染态复用阅读模式的 `hydrateWikiLinks` 解析 `[[双链]]`（悬停预览 + 断链样式，命中则 `openDoc` 为新 tab，路径经 `data.vault` 前缀削为 vault 相对键与文件树一致）；空态引导选文件（提示可多开）。
- **上下文 tab（ContextPanel）**：pi agent 上下文检视——套 PanelFrame（头 = ScrollText + “上下文检视” + 会话短 id + 刷新）；body = 元信息条（模式/模型/ctx/成本/工具 chips）+ 系统提示词全文（mono 可滚动）；对象是当前活动会话，无活动会话时引导空态；工具首栏「检视」按钮为快捷入口（切 tab + 展开右栏）。
- **历史 tab（HistoryPanel）**：会话完整历史——套 PanelFrame（头 = History + “会话历史” + 会话短 id + 刷新）；对象是当前活动会话，无活动会话时引导空态。上=**分支树**（`GET /sessions/:id/tree`，线性链折叠同一缩进、仅在分叉处降一级；当前 leaf→根活动路径高亮 + 徒章，分叉节点标 `×N`；行首角色芯片染色区分问答：问=`cat-entity`、答=`accent`、压缩=中性、分支=`cat-synthesis`（背景 `/15` + 本色字，图标不再加 opacity）；**轮次分组**：以 user 行为界把扁平行切成「一问 + 其后全部回答/过程行」的 Exchange（`groupExchanges`），问行是可折叠分组头（前置招箭头，收起时显「N 项」计数；箭头列固定 `w-4`，子行渲染同宽空占位使上下图标严格对齐成一列，层级靠芯片色与箭头列区分而非额外缩进）；树重建时默认只展开最后一轮，头部栏提供全部展开/全部收起（收起保留选中所在轮）；收起态点问行 = 选中并自动展开），下=选中节点的**单条详情**（`GET /sessions/:id/entry?entryId=`，只看这一条：角色/时间/模型/用量页脚 + 助手 thinking、工具折叠（含参数与结果）、prose-chat 正文；用户/压缩/分支摘要各自渲染）。详情区按**真实时序**渲染：assistant entry 服务端新增 `parts`（content blocks 原始顺序），有 parts 时思考/叙述文本/工具卡平铺交错展示——思考=`cat-source` 折叠卡、工具=`cat-entity` 折叠卡（行尾入参/出参字符数）、叙述文本（工具前的旁白）=浅蓝折叠卡（NarrationCard，`cat-raw`，与思考/回答卡同形制：一行标题「旁白 · N 字符」+ 单击展开收拢；色与聊天列旁白卡对齐，与思考的 `cat-source` 区分）、**仅最后一个 tool 之后的 text 段**=danger 回答卡（AnswerCard，默认收起限高滚动；工具前的 text 是旁白不得标“结果”，全卡统一叫「回答 · N 字符」与工具出参区分）；旧数据无 parts 时降级为分组布局（外层「处理详情」`<details open>` = 思考+工具清单，末尾回答卡）。四类卡片均为模块级组件 ThinkingCard/ToolCard/NarrationCard/AnswerCard，字体统一：summary 行 `font-mono text-[10.5px]`、展开正文 `text-[11.5px] text-fg-secondary`；卡片配色套路：边框 `/40`、底色 `/5`、summary 文字用本色：思考展开后 `max-h-60`、入参 `max-h-40`、工具结果 `max-h-60`、正文 `max-h-[28rem]`（prose-chat）均内部滚动，防止撑爆详情区。**纯分析定位（已移除分支切换）**：只读浏览不改动历史；底部「切到此分支继续」按钮及 `busy`/`onBranched` props、前端 `branchSession` 封装均已删除（服务端 `POST /sessions/:id/branch` 路由保留但无前端入口）。**双形态排列**：默认上下堆叠（树在上、限高 46%）；当面板实宽 ≥ `WIDE_PX 720`（典型为顶栏选「面板」独占态，或双栏下把右栏拖宽）时由 `ResizeObserver` 自动切为**左右并排**（树列固定 `w-72` 居左 + `border-r` 分隔，详情居右占满），空态文案随之变“选择左侧节点”。观察器用**回调 ref** 建立（根节点是 `tree` 就绪后才条件渲染的，`useEffect(…, [])` + `ref.current` 会拿到 null 而永不生效）。
- **审查 tab（ReviewPanel）**：头 = FileDiff + “改动审查 · <模式> <来源>”（ingest 来源 = raw 文件路径，如 `raw/002_夏本纪.md`；重启恢复的旧暂存无 meta 时显示「(重启恢复)」）+ meta(文件数) + 多会话选择器（pending>1 时，选项含来源短名）；body = 左文件清单 + 右着色 diff；footer = 应用全部/丢弃；空态“没有待审改动”。mode 标签：ingest=摄取 / lint=修复 / chat=会话 / edit=编辑(预留)。暂存会话元信息（mode/target/createdAt）持久化为 `.staging/<sid>.meta.json` 兄弟文件（目录外，避免被 walkStaged 收为暂存对象），apply/discard 清理时同删。
- 待审 diff 到达 / 挂载发现未 dismissed pending / toast 点击 → 自动设 tab=审查 + 打开右栏；用户主动 X 关闭记入 dismissed，自动打开跳过 dismissed。

---

## 7. 聊天消息流（ChatWindow）

- **按真实时序交错铺排**：每轮 = thinking → 文本卡（旁白/最终）→ 工具行 + usage（TurnHead/TurnTail 两段包裹）；pi 工具执行晚于文本生成，叙述恒在工具前。
- **回答卡区分**：回答 = accent + `Sparkles` + 「回答」标签的大卡（`rounded-card px-4 py-2.5`）；旁白 = **与 ThinkingBox 同形制的紧凑盒**（NarrationBox：`rounded-md border px-2.5 py-1.5`、mono 11.5px）。两盒均为 ThinkingBox 镜像（mono 直排不走 markdown，仅图标/颜色不同：思考=灯泡+中性边框，旁白=`MessageSquareText`+`cat-raw` 浅蓝盒 `border-cat-raw/40 bg-cat-raw/5`）。**自适应折叠**：短内容（≤ `AUTO_COLLAPSE_CHARS 160` 字符）直接展开（单行观感不变），流式中超阈值自动收拢为单行截断 + 尾部「N 字符」计数；点击手动展开/收拢后以手动状态优先（`userOpen ?? 长度判定`），解决长思考全展开刷屏问题。**判定规则**：`isFinal = 最后一个有文本的轮 且 该轮无工具调用`——带工具的轮文本必在工具前生成，一律旁白；冷回放时服务端把每条 entry 作为单轮消息返回，若只看轮位置会把所有中间轮误标成回答（已修）。术语与历史面板对齐（旁白/回答），不用“结果”字样与工具出参区分。
- **字号层级**：聊天列「回答」卡 = `prose-chat` 基线 **13.5px**（主内容阅读级字号，曾一度压到 11.5px 后用户要求恢复）；过程元素（工具行/思考盒/旁白盒）与历史面板卡片正文 = 11.5px（历史面板各卡自行加 `text-[11.5px]`）；标题、代码芯片等 markdown 内部层级由 prose-chat 保留；用户消息气泡 13px。
- **用户消息折叠**：旧版技能 blob 折叠为命令头（可展开全文）；>160 字默认两行截断 + 展开/收起；短斜杠命令用芯片。
- 消息锚点 `id=wv-msg-{i}` 供索引/minimap 跳转。

---

## 8. 尺寸令牌速查

| 项 | 值 |
|---|---|
| 顶栏高 | `46px` |
| 二级标题栏 / tab 条高 | `h-9` (36px)——左栏 tab 条、右栏 tab 条、索引头、预览头、审查头统一 |
| 品牌区 Brand 高 | `46px`（与顶栏对齐，左栏首行与顶栏同高成一条水平线） |
| 左栏宽 | `w-side` = 18.5rem (296px) |
| 右栏宽 | `both` 态拖拽 `[260, 行宽−320]`，默认 460，越界关闭；`right` 态 flex-1 占满主体区 |
| 主体区布局 | 顶栏三选一（对话/面板/双栏），持久化 `wv-layout-cr`，默认 `center` |
| 索引 mini 宽 | `w-9` (36px) |
| 索引 full 宽 | `w-72` (288px) |
| 索引行高 / 头高 | `h-11` / `h-9` |
| 圆角卡片 | `rounded-card` = 0.625rem |
| 阅读行宽 | `--read-pct` 50–100% |
| 对话流宽 | `--chat-w` 50–100% |

---

## 9. 变更守则

- 新增侧栏/面板：优先**参与式并排**，不引入遮罩；宽度偏好 localStorage 持久化。
- 新增顶栏控件：按 §3 顺序插入对应簇，不破坏「设置→主题→状态」尾部。
- 涉及跨状态位置不变的 UI：用固定行高/头高（§4.6）。
- 颜色：只用主题令牌；确需新色相时在 `index.css` 加变量 + `tailwind.config.ts` 加 token（如 `danger`）。
- 修改本文档覆盖的结构时，同步更新本文件。
