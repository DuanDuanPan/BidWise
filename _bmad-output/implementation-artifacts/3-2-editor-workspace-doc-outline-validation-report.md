# Story 3.2 Validation Report

日期：2026-03-30
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）
目标文档：`_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline.md`

已核对工件：
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/story-1-7-workspace-layout-shell.md`
- `_bmad-output/implementation-artifacts/story-3-1-plate-editor-markdown-serialization.md`
- `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
- `src/renderer/src/modules/project/components/OutlinePanel.tsx`
- `src/renderer/src/modules/project/components/StatusBar.tsx`
- `src/renderer/src/modules/project/components/WorkspaceLayout.tsx`
- `src/renderer/src/modules/project/hooks/useWorkspaceLayout.ts`
- `src/renderer/src/modules/editor/components/EditorView.tsx`
- `src/renderer/src/modules/editor/components/PlateEditor.tsx`
- `src/renderer/src/modules/editor/plugins/editorPlugins.ts`
- `src/renderer/src/stores/documentStore.ts`
- `tests/unit/renderer/project/ProjectWorkspace.test.tsx`
- `tests/unit/renderer/project/OutlinePanel.test.tsx`
- `tests/unit/renderer/project/StatusBar.test.tsx`
- `tests/unit/renderer/modules/editor/components/EditorView.test.tsx`
- `tests/unit/renderer/modules/editor/components/PlateEditor.test.tsx`
- `tests/unit/renderer/modules/editor/plugins/editorPlugins.test.ts`
- `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/prototype.manifest.yaml`
- `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/ux-spec.md`
- `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/exports/DgeeX.png`
- `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/exports/mVgex.png`
- `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/exports/piz9Q.png`
- `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/prototype.pen`

结果：PASS

## 摘要

本次按 `validate-create-story` 工作流重新执行了 story readiness 校验，并在文档内直接修复了可安全落地的问题。修正后，Story 3.2 的实现路径已与当前代码库真实结构、前置 Story 1.7/3.1 契约，以及 UX 原型状态对齐，可继续保持 `ready-for-dev`。

## 发现的关键问题

None

## 已应用增强

- 修正了 AC2 的错误来源引用：原文错误引用 `UX-DR7`，现已改为 `ux-design-specification.md §长文档编辑体验`。
- 修正了错误文件路径与错误导出假设：移除了并不存在的 `src/renderer/src/modules/editor/index.ts` / `components/index.ts` / `hooks/index.ts` barrel 依赖，明确使用当前仓库已采用的直连导入模式。
- 修正了大纲滚动方案中的实现级错误：
  - 不再要求使用 `workspace-main` 作为滚动容器，改为为 `EditorView` 根节点增加稳定的 `data-editor-scroll-container="true"` 标记。
  - 不再使用把原始标题文本直接拼进 CSS selector 的 `querySelector('[data-heading-text=\"...\"]')` 方案，改为 `querySelectorAll` + attribute 精确比较。
  - 不再接受“同名标题取第一个匹配”的歧义方案，补充 `occurrenceIndex` 作为滚动消歧字段。
- 修正了 Plate.js API 假设：
  - story 原文使用了与当前 Plate v52 不匹配的 `render.node` 写法。
  - 现已改为基于官方当前模式的 `node.component` / `withComponent`，并补充 `OutlineHeadingElement.tsx` 作为自定义 heading DOM 包装组件。
  - 去除了对未经本仓验证 helper 名称（如 `getNodeString`）的依赖，改为本地递归提取 heading 文本。
- 修正了 `OutlineNode` 结构：原文的 `elementIndex` 不足以支撑可靠滚动定位，现改为 `lineIndex + occurrenceIndex`。
- 修正了 `DocumentOutlineTree` 的交互说明：
  - 增补 `selectedKeys` 本地状态，匹配 UX 原型中的选中节点高亮。
  - 增补 `title` 自定义 `ReactNode` 包装与 `onMouseDown.preventDefault()`，以满足“点击大纲不抢编辑器焦点”的 UX 约束。
  - 空状态说明补齐为“文件图标 + 文案”的组合，而不是纯文字。
- 修正了 `StatusBar` 方案与 UX 原型之间的矛盾：
  - 原文使用 `1.2k` 简写，与原型中的 `3,842` 精确计数冲突；现已统一为 `Intl.NumberFormat('zh-CN')` 精确数字格式。
  - 原文未覆盖左右 cluster 布局；现已明确左侧为阶段名 + 自动保存，右侧为字数 / 合规分占位 / 质量分占位。
  - 原文仍沿用 `合规 --` / `质量 --`；现已统一为 `合规分 --` / `质量分 --`。
- 修正了测试路径与测试范围：
  - `ProjectWorkspace` / `OutlinePanel` / `StatusBar` 的真实测试路径为 `tests/unit/renderer/project/...`，已从错误的 `tests/unit/renderer/modules/project/...` 改正。
  - 增补了同名标题滚动、OutlinePanel children fallback、StatusBar 精确计数格式等缺失测试点。
- 修正了 Story 1.7 / 3.2 / UX 原型之间的壳层尺寸冲突：
  - 3.2 story 与本地 UX spec 现已明确：本 Story 继承 Story 1.7 已落地 shell（240px 展开、40px 折叠条、48px 标题栏），UX PNG / `.pen` 主要用于内容态与信息排布对齐，不重新定义 1.7 已交付的外层尺寸。
- 修正了 Story 3.1 中关于“富文本工具栏由 Story 3.2 负责”的刚性措辞，避免 dev 同时读取 3.1 与 3.2 时得到冲突 scope。现已改为“是否在 3.2 一并激活，以经过 validation 的 3.2 文件为准”。
- 同步更新了 `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/ux-spec.md`，使其与已验证 story 一致：
  - 状态栏格式改为精确数字。
  - duplicate heading 匹配改为 DOM 顺序 + occurrence index。
  - collapsed outline state 改为继承 Story 1.7 已实现 shell。
  - 交互描述改为“保持编辑器焦点 + outline selection 可见”，移除 story 未要求的“目标标题短暂高亮”。

## 剩余风险

None

## 最终结论

经本轮 `validate-create-story` 校验与原位修正后，Story 3.2 已无剩余的可执行阻塞项。当前 story、直接相关 UX 说明、以及前置 Story 3.1 的边界表述已经对齐，结论为 **PASS**，可进入实现阶段。
