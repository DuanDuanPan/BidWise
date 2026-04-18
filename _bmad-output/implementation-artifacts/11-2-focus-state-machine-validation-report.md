# Story 11.2 Validation Report

日期：2026-04-18  
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）  
目标文档：`_bmad-output/implementation-artifacts/11-2-focus-state-machine.md`

## 校验范围

本次校验按 `validate-create-story` 工作流执行。复核范围覆盖：

- `_bmad/bmm/config.yaml`
- `.agents/skills/bmad-create-story/workflow.md`
- `.agents/skills/bmad-create-story/checklist.md`
- `_bmad-output/implementation-artifacts/11-2-focus-state-machine.md`
- `_bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor.md`
- `_bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor-validation-report.md`
- `_bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md`
- `_bmad-output/implementation-artifacts/11-4-soft-delete-toast-undo.md`
- `_bmad-output/implementation-artifacts/11-8-llm-structure-recommend.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- 当前代码基线：
  - `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
  - `src/renderer/src/modules/project/components/OutlinePanel.tsx`
  - `src/renderer/src/modules/editor/components/DocumentOutlineTree.tsx`
  - `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx`
  - `src/renderer/src/modules/editor/hooks/useDocumentOutline.ts`
  - `src/renderer/src/modules/annotation/hooks/useCurrentSection.ts`
  - `src/shared/chapter-locator-key.ts`
  - `src/shared/template-types.ts`
  - `src/shared/models/proposal.ts`
  - `src/preload/index.ts`
  - `src/main/ipc/document-handlers.ts`
  - `src/main/services/document-service.ts`
  - `src/main/services/template-service.ts`
  - `tests/unit/renderer/modules/editor/components/DocumentOutlineTree.test.tsx`
  - `tests/unit/renderer/modules/annotation/hooks/useCurrentSection.test.ts`
  - `tests/unit/renderer/project/ProjectWorkspace.test.tsx`

## 发现并已修复的问题

### 1. 状态容器写到了不存在的 `chapterStore`

原 Story 把五态集中管理写进 `src/renderer/src/stores/chapterStore.ts`。当前仓库没有这个 store，11.1 validation report 也已经把这类旧命名列为 11.2-11.8 的待修正风险。

已修复：

- 将 renderer 状态落点明确为新建 `src/renderer/src/stores/chapterStructureStore.ts`
- 将该 store 定位为“视觉状态机 + `locatorKey ↔ sectionId` bridge”，保持 11.1 的 sidecar + service contract

### 2. 节点组件切入点与真实 UI 结构不一致

原 Story 计划新增独立 `ChapterNode.tsx`。当前真实结构面板已经由 `OutlinePanel.tsx` + `DocumentOutlineTree.tsx` + Ant Design `Tree` title slot 组成。

已修复：

- 节点渲染切入点改为 `DocumentOutlineTreeNode.tsx`
- `DocumentOutlineTree.tsx` 继续保留 Tree shell、展开折叠、phase icon 与交互容器职责
- `OutlinePanel.tsx` 壳层宽度与 header 合同保持不变

### 3. 原 Story 没有接上“当前光标在哪”的真实信号

用户故事强调“瞬间识别光标在哪”。当前仓库已有 `useCurrentSection()` 从编辑器 DOM heading marker 推导当前章节，原 Story 却只写了“点击 / ↑↓ 切 focused”。

已修复：

- 在 AC1 与 Tasks 中补入 `useCurrentSection()` → `syncFocusedLocator(locator)` 的联动路径
- 明确 `ProjectWorkspace.tsx` 是结构面板与当前章节同步的真实集成点

### 4. 当前 outline key 设计会破坏状态连续性

`useDocumentOutline.ts` 当前把 `OutlineNode.key` 生成成 `heading-${lineIndex}`。正文一旦插入或删行，line index 就会漂移，Focused / Editing / Pending-Delete 的视觉状态会失去连续性。

已修复：

- 将 outline 稳定 key 收敛到 `createChapterLocatorKey({ title, level, occurrenceIndex })`
- 补入对应测试，覆盖重复标题与 occurrenceIndex 场景

### 5. Editing 态会被现有 `onMouseDown(e.preventDefault())` 卡住

`DocumentOutlineTree.tsx` 当前为了保持编辑器焦点，在 title span 上统一拦截 `mousedown`。这个行为会让行内输入框拿不到焦点。

已修复：

- 在 AC2 与 Task 3 中明确：Editing 态输入区域放行 pointer focus
- 将当前保护逻辑收窄到非输入区域
- 测试矩阵补入“Editing 输入框可聚焦”

### 6. `selectedKeys` 双真源会让 Focused 态漂移

当前 `DocumentOutlineTree.tsx` 自己维护 `selectedKeys`，而 11.2 又需要从 `useCurrentSection()` 和后续 Story 11.3 键盘导航驱动焦点。继续保留本地 `selectedKeys` 会形成双真源。

已修复：

- 在 Story 中明确 `DocumentOutlineTree` 不再持有交互真源的 `selectedKeys`
- Focused 态统一从 `chapterStructureStore` 派生

### 7. Locked / Pending-Delete 的跨 Story 边界没有说清楚

原 Story 只写“暴露 `markLocked` / `markPendingDelete`”，却没有说明这些 API 的 renderer / main 边界，容易让 dev 在 11.2 就去新增 main service 或 fake repo。

已修复：

- 将 11.2 明确为 renderer-first story
- `markLocked` / `markPendingDelete` 收敛为 renderer 状态 API
- 结构 CRUD、删除事务、AI 推荐 transport 分别留给 11.1 / 11.4 / 11.8

### 8. Story artifact 结构不完整

原 Story 缺少 create-story 模板要求的 validation note、`Project Structure Notes`、`Change Log`。

已修复：

- 补回 validation note
- 增加 `Project Structure Notes`
- 增加 `Change Log`

## 已修改工件

- `_bmad-output/implementation-artifacts/11-2-focus-state-machine.md`
- `_bmad-output/implementation-artifacts/11-2-focus-state-machine-validation-report.md`

## 剩余风险

- `_bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md`
- `_bmad-output/implementation-artifacts/11-4-soft-delete-toast-undo.md`
- `_bmad-output/implementation-artifacts/11-8-llm-structure-recommend.md`

这些相邻 Story 仍沿用旧的 `chapterStore` / `chapter-repo` 假设。进入实现前应继续按同一 contract 各自执行一次 `validate-create-story`。

## 结果

经本轮 `validate-create-story` 复核与原位修订后，Story 11.2 已与以下事实完成必要对齐：

- 当前结构面板真实入口：`ProjectWorkspace.tsx` + `OutlinePanel.tsx` + `DocumentOutlineTree.tsx`
- 当前章节焦点真实来源：`OutlineHeadingElement.tsx` + `useCurrentSection.ts`
- 当前 metadata 读取路径：`document:get-metadata` → `documentService.getMetadata()`
- 当前章节 identity 合同：`proposal.meta.json.sectionIndex` 中的 `sectionId`，以及 renderer read-side 的 `locatorKey`
- 当前 UX 与可访问性要求：UX-DR23 / UX-DR24 的动效与 focus outline 规范

当前 Story 已具备进入 `dev-story` 的实现清晰度，结论为 **PASS**。

## 备注

- 本次仅进行了 story-spec 修订，没有运行代码测试。
