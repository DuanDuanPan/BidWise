# Story 11.5 Validation Report

日期：2026-04-18  
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）  
目标文档：`_bmad-output/implementation-artifacts/11-5-depth-limit-warn-llm-lock.md`

## 校验范围

本次校验按 `validate-create-story` 工作流执行。复核范围覆盖：

- `_bmad/bmm/config.yaml`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/workflow.md`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/checklist.md`
- `_bmad-output/implementation-artifacts/11-5-depth-limit-warn-llm-lock.md`
- `_bmad-output/implementation-artifacts/11-2-focus-state-machine.md`
- `_bmad-output/implementation-artifacts/11-2-focus-state-machine-validation-report.md`
- `_bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md`
- `_bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete-validation-report.md`
- `_bmad-output/implementation-artifacts/11-7-word-outline-import.md`
- `_bmad-output/implementation-artifacts/11-8-llm-structure-recommend.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- 当前代码基线：
  - `src/shared/chapter-identity.ts`
  - `src/shared/chapter-locator-key.ts`
  - `src/shared/chapter-types.ts`
  - `src/shared/template-types.ts`
  - `src/shared/constants.ts`
  - `src/shared/models/proposal.ts`
  - `src/main/services/chapter-structure-service.ts`
  - `src/main/ipc/chapter-structure-handlers.ts`
  - `src/main/ipc/document-handlers.ts`
  - `src/main/services/document-service.ts`
  - `src/main/services/agent-orchestrator/index.ts`
  - `src/main/services/task-queue/index.ts`
  - `src/main/services/docx-bridge/index.ts`
  - `src/main/services/document-parser/word-extractor.ts`
  - `src/preload/index.ts`
  - `src/renderer/src/stores/documentStore.ts`
  - `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
  - `src/renderer/src/modules/editor/components/DocumentOutlineTree.tsx`
  - `src/renderer/src/modules/editor/hooks/useDocumentOutline.ts`
  - `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts`

## 发现并已修复的问题

### 1. Story 建在了不存在的 `src/shared/chapter-utils.ts` 与错误树类型上

原 Story 把深度计算落到 `src/shared/chapter-utils.ts`，并假设 `ChapterNode[]` 可以同时服务结构面板、Word 导入、AI 推荐三条链路。当前仓库没有这个文件，三条链路的数据形状也并不相同。

已修复：

- 将共享约束落点收敛为新的 `src/shared/chapter-structure-constraints.ts`
- 将 canonical `sectionIndex` 单节点深度计算收敛到 `src/shared/chapter-identity.ts`
- 明确 Word 导入树、AI 推荐树与 canonical 结构树共用一套纯函数约束 helper

### 2. Story 仍写在不存在的 `chapterStore` 上

原 Story 要求在 `src/renderer/src/stores/chapterStore.ts` 上实现 `markLocked()` / `unmarkLocked()` 与结构操作 guard。当前仓库没有这个 store，Story 11.2 validation 已经把 renderer 结构状态容器收敛到 `chapterStructureStore`。

已修复：

- 将结构锁定状态统一落到 Story 11.2 的 `src/renderer/src/stores/chapterStructureStore.ts`
- 将 11.3 的结构快捷键拒绝路径改成返回 `blockedReason: 'locked'`
- 将 11.5 的深度 warning 结果改成通过 `depthWarning` 从 mutation 结果向 UI 回传

### 3. 告警 / 提示通道写成了与当前 renderer 模式脱节的 `notification.*` 直调

原 Story 直接要求 `notification.warning` / `notification.info`。当前 renderer 代码普遍通过 `App.useApp().message` 触发轻量提示，这套模式更贴合现有组件与 hook 组织方式。

已修复：

- 将 11.5 的 advisory warning / locked info 收敛到 keyed `App.useApp().message`
- 明确深度 warning 用 `message.warning`，locked 拒绝用 `message.info`
- 明确 keyed single-instance 约束，保持同时只有一条活动告警

### 4. 深度判断缺少 canonical snapshot 来源，开发容易用到漂移中的 lineIndex tree

当前 `useDocumentOutline()` 仍然生成 `heading-${lineIndex}` key，11.2 / 11.3 的 validation 已经把结构 identity 收敛为 `sectionIndex.sectionId + locatorKey` 双层桥接。原 Story 没有点名 11.5 的深度判断应基于哪个事实源。

已修复：

- 将深度判断明确建立在 11.3 mutation 返回的最新 `proposal.meta.json.sectionIndex` snapshot 上
- 补入 `affectedSectionId` 深度计算要求，避免从旧 outline 状态回推
- 将这一路径写进 AC1、Task 1、Task 3 与 Dev Notes

### 5. 结构锁定态与现有正文生成 `locked` 语义边界不清

当前 `useChapterGeneration()` 已经有自己的 `locked` 字段，用于正文生成与 batch 子章节流程。原 Story 没有说明 11.5 的 locked 态是“结构面板锁定”还是“正文生成锁定”，两条语义容易混线。

已修复：

- 明确结构锁定由 `chapterStructureStore` 承载
- 明确正文生成 `locked` 继续留在 `useChapterGeneration()` 语义内
- 明确 11.8 的结构推荐流只接入结构锁定合同

### 6. AC3 缺少 11.8 真正需要遵守的 task-queue / orchestrator / error-code 合同

原 Story 只写了“prompt 加约束、service 校验后拒收”，缺少当前仓库必须遵守的执行边界：Prompt 目录、`agent-orchestrator`、`task-queue`、脱敏、以及当前尚不存在的 `STRUCTURE_VIOLATES_CONSTRAINTS` 错误码。

已修复：

- 补入 `src/main/prompts/recommend-structure.prompt.ts` 的明确落点
- 补入 `task-queue` + `agent-orchestrator` + 脱敏前置要求
- 补入 `ErrorCode.STRUCTURE_VIOLATES_CONSTRAINTS` 的新增要求
- 补入校验发生在缓存写入 / complete 事件 / diff 视图接入之前的时机约束

### 7. Story artifact 结构不完整

原 Story 缺少 create-story 模板要求的 validation note、`Project Structure Notes`、`Change Log`。

已修复：

- 补回 validation note
- 增加 `Project Structure Notes`
- 增加 `Change Log`

## 已修改工件

- `_bmad-output/implementation-artifacts/11-5-depth-limit-warn-llm-lock.md`
- `_bmad-output/implementation-artifacts/11-5-depth-limit-warn-llm-lock-validation-report.md`

## 剩余风险

- `_bmad-output/implementation-artifacts/11-6-three-path-entry-diff-merge.md`
- `_bmad-output/implementation-artifacts/11-7-word-outline-import.md`
- `_bmad-output/implementation-artifacts/11-8-llm-structure-recommend.md`

这些相邻 Story 仍带有旧草稿痕迹，尤其是 `chapterStore`、旧的 docx bridge 路径、以及 AI / diff 合并合同中的未对齐项。进入实现前继续按同一 contract 执行 `validate-create-story` 可以保持 11.x 串联一致。

## 结果

经本轮 `validate-create-story` 复核与原位修订后，Story 11.5 已与以下事实完成必要对齐：

- 当前 canonical 结构身份合同：`proposal.meta.json.sectionIndex` 中的 `sectionId`
- 当前结构 read-side / renderer bridge：`locatorKey` + `sectionIndex`
- 当前结构状态容器：Story 11.2 的 `chapterStructureStore`
- 当前结构 mutation 落点：Story 11.3 的 `chapter-structure-service` + thin IPC
- 当前 renderer 轻提示模式：`App.useApp().message`
- 当前 AI 任务执行边界：`prompts/` + `agent-orchestrator` + `task-queue`
- 当前 Python / Word / docx bridge 真实路径：`src/main/services/docx-bridge/`

当前 Story 已具备进入 `dev-story` 的实现清晰度，结论为 **PASS**。

## 备注

- 本次仅进行了 story-spec 修订，没有运行代码测试。
