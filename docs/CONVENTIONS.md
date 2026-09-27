# 约定与术语（CONVENTIONS）

布局/尺寸/交互的权威规范在 [LAYOUT.md](./LAYOUT.md)；本文件补充命名、术语、内容、代码约定。

## 命名 / 术语

| 术语 | 用法 |
|---|---|
| 阅读模式 / 工作模式 | 双模式名；分段标签用 2 字「阅读 / 工作」，散文用「工作模式」；图标 Gauge |
| 知识库 / vault | 一个独立库（raw/wiki/output），注册于 vaults.json |
| 座舱 | 已弃用（历史名），统一为「工作/工作模式」 |
| 对话索引 / minimap / 索引侧栏 | SessionIndex 整体 / 收缩态 / 展开态 |
| 审查面板 / 文档面板 | 右栏两 tab（ReviewPanel / PreviewPanel），共享 PanelFrame chrome |
| 收件箱 | 知识库 tab 顶部上传/剪藏入口（RawInbox） |
| 暂存 / 审核门 | .staging/ + apply/discard 流程 |
| 参与式侧栏 | 并排挤占布局的侧栏（优于悬浮遮罩） |

## 内容语言

- `wiki/`、`output/` 由 LLM 生成的内容一律**简体中文**；专名/术语/代码/文件名保留原文。
- `raw/` 原始资料不翻译不改写。
- 界面文案中文；代码标识符英文。

## 知识库写作（AGENTS.md 摘要）

- 页面必有 frontmatter：tags / sources / aliases(=H1 标题) / created / updated。
- 内链一律路径式 `[[子目录/文件名|显示标题]]`；不用裸标题链。
- index.md 每页一行 ≤120 字符；log.md 只追加不改已有条目。
- 来源页只记事实；解读放概念/综合页；矛盾标注双方来源不强行裁定。
- 文件名 kebab-case；单来源触及 10–15 页属正常。

## 前端代码约定

- 颜色只走 CSS 变量令牌（--ink/--surface/--line/--fg/--accent/--cat-*/--co-danger）；新色相 = index.css 加变量 + tailwind.config 加 token。
- 高度：顶栏/Brand 46px；二级标题栏/tab 条 h-9；索引行 h-11。固定高度用 h-* + items-center，不用 padding 撑。
- 小分段控件选中态禁用 shadow-panel（底部硬阴影线破坏对称）；大浮层才用。
- 包文本的 `<button>` 显式 text-left。
- 侧栏/面板宽度偏好 localStorage 持久化；键见下。
- 跨状态位置不变的 UI 用固定行高（双态侧栏模式）。
- 数据派生值不要放模块顶层（跨 vault 过期）；放组件 useMemo 或订阅 dataVersion。

## localStorage 键

| 键 | 含义 |
|---|---|
| wv-theme / wv-mode | 主题 / 最后模式 |
| wv-vault / wv-last | 当前 vault / 阅读最近页 |
| wv-panel-l / wv-panel-r | 阅读模式左右栏折叠 |
| wv-panel-l-ai / wv-panel-r-ai | 工作模式左右栏开关 |
| wv-right-w / wv-right-tab | 右栏宽度 / 右栏 tab |
| wv-side-cats | 阅读左栏分类组收拢集 |
| wv-reader / wv-ai-chatcfg | 阅读排版 / 对话流排版 |
| wv-ai-model / wv-ai-thinking | 会话级模型覆盖 / 思考强度 |

## 服务端约定

- 仅绑 127.0.0.1:8787；零密钥（pi login 全局托管）。
- vault 写入唯一通道 = 审核门 apply；inbox(upload/clip) 与 save-output 为受控直写例外。
- 技能仅项目级 `.pi/skills`；不启用 project trust。
- 新增 vault 作用域路由必须读 vaultId 并 `resolveVaultId` 校验。

## 文档维护

- 改架构/API/约定 → 同步更新 docs/ 对应文件（含 LAYOUT.md）。
- 新坑 → PITFALLS.md 追加（现象/根因/预防）。
- 与代码冲突以代码为准并立即修文档。
