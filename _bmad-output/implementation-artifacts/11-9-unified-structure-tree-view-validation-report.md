# Story 11.9 Validation Report

日期：2026-04-18  
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）  
目标文档：`_bmad-output/implementation-artifacts/11-9-unified-structure-tree-view.md`

## 校验范围

本次校验按 `validate-create-story` 工作流执行。复核范围覆盖：

- `_bmad/bmm/config.yaml`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/workflow.md`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/checklist.md`
- `_bmad-output/implementation-artifacts/11-9-unified-structure-tree-view.md`
- `_bmad-output/implementation-artifacts/11-2-focus-state-machine.md`
- `_bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md`
- `_bmad-output/implementation-artifacts/11-4-soft-delete-toast-undo.md`
- `_bmad-output/implementation-artifacts/11-5-depth-limit-warn-llm-lock.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- 当前代码基线：
  - `src/renderer/src/modules/editor/components/SkeletonEditor.tsx`
  - `src/renderer/src/modules/editor/components/SolutionDesignView.tsx`
  - `src/renderer/src/modules/editor/hooks/useStructureKeymap.ts`
  - `src/renderer/src/modules/structure-design/components/StructureDesignWorkspace.tsx`
  - `src/renderer/src/modules/structure-design/components/StructureCanvas.tsx`
  - `src/renderer/src/modules/structure-design/components/StructureCanvasNode.tsx`
  - `src/renderer/src/modules/structure-design/hooks/useStructureOutline.ts`
  - `src/renderer/src/stores/chapterStructureStore.ts`
  - `src/renderer/src/stores/documentStore.ts`
  - `src/shared/models/proposal.ts`
  - `src/shared/template-types.ts`
  - `src/shared/ipc-types.ts`
  - `src/main/services/document-service.ts`
  - `src/main/services/chapter-structure-service.ts`
  - `src/main/services/template-service.ts`
  - `src/main/ipc/chapter-structure-handlers.ts`
  - `src/preload/index.ts`

## 发现并已修复的问题

### 1. 首次确认文案依赖了不存在的 store / schema / service

原 Story 把“首次确认骨架”信号落在不存在的 `documentStore.hasEverCommittedSkeleton`、`documentStore.getDocumentMetadata(projectId)`、`document-service.markSkeletonConfirmed()` 与 `ProposalMetaJson` 上。当前仓库真实落点是 `ProposalMetadata` + `documentService.updateMetadata()`。

已修复：

- 将 sidecar schema 明确收敛到 `src/shared/models/proposal.ts` 的 `ProposalMetadata.firstSkeletonConfirmedAt?: string`
- 将写入路径改为新 thin IPC `document:mark-skeleton-confirmed`
- 将 CTA 文案派生责任收敛到 `SolutionDesignView`

### 2. persisted 模式拖拽与插入子节点缺少真实 mutation 合同

原 Story 直接承诺 persisted Tree 与 draft Tree 拖拽完全等价，当前 live store 只暴露 `insertSibling` / `indentSection` / `outdentSection` / `commitTitle` / `requestSoftDelete`。这组动作覆盖不了 AntD Tree 的 `before / after / inside` drop 语义，也覆盖不了显式“新增子节点”。

已修复：

- 在 Story 中补入 `insertChild(projectId, parentSectionId)` 合同
- 在 Story 中补入 `moveSubtree(projectId, dragSectionId, dropSectionId, placement)` 合同
- 明确 AntD drop 语义到 main / IPC / preload / store 的完整映射

### 3. `useStructureOutline` 与 11.3 snapshot 回写链路重复拉取

当前 `chapterStructureStore` mutation 成功后会通过 `documentStore.applyStructureSnapshot()` 写回 committed markdown + sectionIndex。原 Story 保留 `useStructureOutline.reload()` + `documentGetMetadata()` 轮询，会把 11.9 写成第二条读链路。

已修复：

- 将 `useStructureOutline` 明确改成 documentStore-first 订阅
- 将 `refreshNonce` + 二次 metadata 轮询改成移除目标
- 将 selector 写法校准为 `sectionIndex + loadedProjectId` 的真实 store 字段

### 4. 公共组件 API 漏掉关键 seam

原 Story 的 AC1 没有把后续实现必需的 `onInsertChild`、`onMove`、`onUndoPendingDelete`、`maxDepth` 列进公共组件合同，Task / Dev Notes 却默认这些 seam 已存在。

已修复：

- 在 AC1 显式补齐四个 props
- 在 Task 2、Task 4、Task 7、Task 9 与测试矩阵里同步补齐
- 在 pending-delete 与 depth-limit 相关说明里把 11.4 / 11.5 的衔接关系写清楚

## 已修改工件

- `_bmad-output/implementation-artifacts/11-9-unified-structure-tree-view.md`
- `_bmad-output/implementation-artifacts/11-9-unified-structure-tree-view-validation-report.md`

## 剩余风险

- `pending-delete` 的真实撤销动作仍依赖 Story 11.4，11.9 当前保留 `onUndoPendingDelete` seam
- `maxDepth` 从 4 提升到 6 仍依赖 Story 11.5
- 本次仅进行了 story-spec 校准，没有运行代码测试

## 最终结论

经本轮 `validate-create-story` 复核与原位修订后，Story 11.9 已与当前仓库真实的 `documentStore` 回写链路、`chapterStructureStore` action surface、`ProposalMetadata` sidecar schema、`SolutionDesignView` phase 分发方式，以及现有 main / preload / IPC 边界完成必要对齐。

当前 Story 已具备进入 `dev-story` 的实现清晰度，结论为 **PASS**。

## 备注

- 本次仅进行了 story-spec 修订，没有运行代码测试。
