# Story 3.2 Validation Report

日期：2026-03-30
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）
目标文档：`_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline.md`

已核对工件：
- `_bmad/bmm/config.yaml`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/story-1-7-workspace-layout-shell.md`
- `_bmad-output/implementation-artifacts/story-3-1-plate-editor-markdown-serialization.md`
- `package.json`
- `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
- `src/renderer/src/modules/project/components/OutlinePanel.tsx`
- `src/renderer/src/modules/project/components/StatusBar.tsx`
- `src/renderer/src/modules/project/components/WorkspaceLayout.tsx`
- `src/renderer/src/modules/project/types.ts`
- `src/renderer/src/modules/editor/components/EditorView.tsx`
- `src/renderer/src/modules/editor/components/PlateEditor.tsx`
- `src/renderer/src/modules/editor/components/AutoSaveIndicator.tsx`
- `src/renderer/src/modules/editor/hooks/useDocument.ts`
- `src/renderer/src/modules/editor/plugins/editorPlugins.ts`
- `src/renderer/src/stores/documentStore.ts`
- `src/renderer/src/globals.css`
- `tests/unit/renderer/project/ProjectWorkspace.test.tsx`
- `tests/unit/renderer/project/OutlinePanel.test.tsx`
- `tests/unit/renderer/project/StatusBar.test.tsx`
- `tests/unit/renderer/modules/editor/components/EditorView.test.tsx`
- `tests/unit/renderer/modules/editor/components/PlateEditor.test.tsx`
- `tests/unit/renderer/modules/editor/components/AutoSaveIndicator.test.tsx`
- `tests/unit/renderer/modules/editor/hooks/useDocument.test.tsx`
- `tests/unit/renderer/modules/editor/plugins/editorPlugins.test.ts`
- `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/prototype.manifest.yaml`
- `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/ux-spec.md`
- `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/exports/DgeeX.png`
- `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/exports/mVgex.png`
- `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/exports/piz9Q.png`
- `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/prototype.pen`
- `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/prototype.snapshot.json`
- Ant Design Tree official docs（用于确认 `defaultExpandAll` 仅在初始化时生效）：https://ant.design/components/tree/

`.pen` 结构查阅说明：本轮 Pencil app 连接不可用，改为直接读取 `prototype.pen` 与 `prototype.snapshot.json`，并结合 manifest + PNG 导出完成结构与交互核对；未形成剩余阻塞。

结果：PASS

## 摘要

本次按 `validate-create-story` 工作流重新执行 Story 3.2 的 readiness 校验，并在 story 与直接相关 UX 说明中原位修复了所有可安全落地的问题。修正后，文档已与当前代码库真实结构、Story 1.7/3.1 的现有契约、以及 UX 原型的关键交互行为对齐，可直接进入实现。

## 发现的关键问题

None

## 已应用增强

- 将大纲树展开策略从 `defaultExpandAll` 修正为受控 `expandedKeys`，明确覆盖“初次为空大纲，随后异步加载/编辑后出现节点”的真实运行场景，避免新节点不自动展开。
- 为 `DocumentOutlineTree` 补充无障碍要求：标题包装节点需暴露包含层级信息的 `aria-label`，与 UX spec 中的可访问性要求对齐。
- 修正 `OutlinePanel` 的集成说明：注入真实大纲内容时，内容区必须从原先的居中 placeholder 布局切换为顶部对齐的可滚动容器，避免开发者直接复用占位态样式导致 Tree 居中/不可滚动。
- 补齐测试要求：
  - `useDocumentOutline` 需覆盖 `~~~` fenced code block。
  - `useWordCount` 需覆盖 fenced code block / 表格分隔行等结构标记不计数。
  - `DocumentOutlineTree` 需覆盖 outline 从空到有内容时的默认展开行为，以及标题 `aria-label`。
  - `editorPlugins.test.ts` 需增量验证 H1-H4 已接入 `OutlineHeadingElement`。
  - `EditorView.test.tsx` 需增量验证 `data-editor-scroll-container="true"`。
- 收敛状态栏视觉/文案歧义：
  - 明确本 Story 的强制实现项是信息布局、指标顺序和精确数字格式，不单独开启工作空间 shell 主题重做。
  - 明确自动保存状态复用 Story 3.1 已落地的 `AutoSaveIndicator` 文案（`已保存` / `保存中...` / `未保存更改` / `保存失败`），PNG 中“已自动保存”为示意，不再构成实现歧义。
- 在 UX spec 中同步修正与当前仓库实现不一致的细项：
  - 折叠过渡时长从 200ms 调整为继承现有 shell token 的 300ms。
  - 状态栏背景描述改为继承当前工作空间 shell chrome，而非强制新的深色主题任务。
  - 空态字体从 13px 调整为复用当前 `OutlinePanel` placeholder 的 12px。
  - 补充 outline 受控展开的行为说明，避免 UX spec 与 story tasks 再次偏离。
- 增补防偏航约束：明确本 Story 不额外引入 `@platejs/toc` 或其他 TOC 依赖，继续基于现有 `documentStore.content` 派生 outline，保持依赖面和实现边界可控。

## 剩余风险

None

## 最终结论

经本轮 `validate-create-story` 复核与原位修正后，Story 3.2 已无剩余的可执行阻塞项。当前 story、UX spec、前置 Story 3.1/1.7 契约、以及代码库现状已完成必要对齐，结论为 **PASS**。
