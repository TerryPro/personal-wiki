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
| 右栏 | 右 `aside` | 工作模式的 `[审查 \| 预览]` 统一容器 |
| 聊天列 | 中央 `main` | 工作模式的消息流 + 输入区 |
| 对话索引 | `SessionIndex` | 会话轮次快速索引（pi-map 风格），置于聊天列**左侧** |
| minimap | `SessionIndex mode='mini'` | 对话索引的**收缩态**：窄条小方块 |
| 索引侧栏 | `SessionIndex mode='full'` | 对话索引的**展开态**：带背景框的完整列表 |
| 审查面板 | `ReviewPanel` | 右栏 tab：暂存 diff 的文件清单 + 着色 diff + 应用/丢弃 |
| 预览面板 | `PreviewPanel` | 右栏 tab：vault 文件渲染/源码查看（填充型） |
| 暂存 / 审核门 | `.staging/`、staging gate | agent 写入先落暂存区，人工审 diff 后才落盘 |
| 收件箱 | `RawInbox` | 工作模式「知识库」tab 顶部：上传/URL 剪藏入 `raw/` |
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

### 2.3 工作模式（AiMode）
```
┌ 顶栏(46px) ─────────────────────────────────────────────┐
├────────┬───────────────────────────────────┬─────────────┤
│ 左栏    │ 对话索引 │  聊天列 main             │ 右栏         │
│ aside  │ Session  │  ChatWindow            │ [审查|预览]   │
│ w-side │ Index    │  ChatInput             │ 拖拽 340-760  │
│        │ mini/full│                        │             │
└────────┴───────────────────────────────────┴─────────────┘
```
- 左栏为**全高首列**：品牌区 `Brand` 直达窗口顶，下方四 tab（会话/知识库/文件/设置）。
- 对话索引在聊天列**左侧**（见 §5）。
- 右栏为 `[审查 | 预览]` tab 统一容器（见 §6）。

---

## 3. 顶栏工具栏约定（双模式统一）

**顺序约定**：
- 左簇：`知识库切换(VaultSwitcher)` → `模式切换(ModeSwitch)` → 模式专属控件
- 右簇：模式专属控件 → `设置(ReaderSettings/ChatSettings)` → `主题(Sun/Moon)` → 状态文本

**尺寸**：高度 `h-[46px]`；header `gap-2`；右簇 `gap-2.5`；背景 `bg-ink-soft` + 下边框。

**阅读模式右簇**：右栏折叠 → 免打扰 → 命令面板 → 阅读设置 → 主题 → 页数·同步时间
**工作模式右簇**：对话索引开关 → 对话排版设置 → 主题 → AgentInfo（上下文 meter + 累计成本）→ 在线状态

---

## 4. 通用布局原则

1. **参与式侧栏优于悬浮抽屉**：侧栏作为 flex 并排列挤占布局，不用 `fixed/absolute` 遮罩（对话索引、审查面板均遵循）。
2. **正交布局**：行宽（百分比变量）与页边距/留白是两个独立维度，互不耦合。
   - 阅读：`--read-pct`（行宽 50–100%）⊥ `--read-pad-x/y`（页边距档位）
   - 工作模式：`--chat-w`（对话流宽 %）⊥ `--chat-pad-y`（上下留白档位）
3. **独立侧栏折叠持久化**：阅读模式 `wv-panel-l/r`；工作模式左栏 `wv-panel-l-ai`、右栏 `wv-panel-r-ai`。两模式顶栏均提供 PanelLeft/PanelRight 折叠开关（高亮态=展开）。阅读模式左栏目录视图的**分类组**（概念/实体/来源…）亦可展开/收拢（chevron 指示），收拢集持久化 `wv-side-cats`。
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
- 默认态 `mini`；TopBar 索引按钮负责整体开/关。

---

## 6. 右栏（焦点对象工作区：文档 / 审查）

**定位**：右栏展示“当前正在处理的对象”的详情与操作——对象是**文件**→文档 tab；对象是**一批改动**→审查 tab。与左栏（列表/导航）、聊天（对话）职责正交。暂不含人工编辑（预留）。

- **整体开关**：TopBar 右簇 `PanelRight` 按钮控制右栏开/关（持久化 `wv-panel-r-ai`）；右栏是一等公民列，不再“仅在有内容时出现”。
- 统一容器 `aside`，宽度拖拽 `340–760px`，持久化 `wv-right-w`；拖拽柄 = 7px 隐形热区 + 居中 2px 可见 accent 线（hover/active 加深），线细但颜色醒目。
- 顶部 tab：`[文档 | 审查(n)]`，**永远可点**（不 disabled）；无内容时显示引导空态而非禁用。审查 tab 带待审数徽标。tab 选择持久化 `wv-right-tab`。
- **共享 chrome `PanelFrame`**：头 `h-9`（icon + title + meta + actions + close）+ body 填充 + 可选 footer。PreviewPanel/ReviewPanel 均套用它，风格统一。
- **文档 tab（PreviewPanel）**：头 = FileText + path + size；actions = 渲染/源码切换；空态引导“在左栏「文件」中选择文件”。
- **审查 tab（ReviewPanel）**：头 = FileDiff + “改动审查” + meta(模式·文件数) + 多会话选择器（pending>1 时）；body = 左文件清单 + 右着色 diff；footer = 应用全部/丢弃；空态“没有待审改动”。mode 标签：ingest=摄取 / lint=修复 / chat=会话 / edit=编辑(预留)。
- 待审 diff 到达 / 挂载发现未 dismissed pending / toast 点击 → 自动设 tab=审查 + 打开右栏；用户主动 X 关闭记入 dismissed，自动打开跳过 dismissed。

---

## 7. 聊天消息流（ChatWindow）

- **按 turn 时序交错铺排**：每轮 = 过程（thinking/工具/usage）→ 紧跟该轮文本卡。
- **结果卡区分**：中间步骤 = 浅红（`danger` 令牌）+ `Hammer` + 「中间步骤 N」；最终结果 = accent + `Sparkles` + 「最终结果」。
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
| 右栏宽 | 拖拽 340–760px，默认 460 |
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
