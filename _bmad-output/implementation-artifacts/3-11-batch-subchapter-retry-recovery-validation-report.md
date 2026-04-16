# Story 3.11 Validation Report

日期：2026-04-16  
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）

## 校验范围

本次校验严格按 `validate-create-story` 工作流执行。复核范围覆盖：

- `.agents/skills/bmad-create-story/workflow.md`
- `.agents/skills/bmad-create-story/checklist.md`
- `.agents/skills/bmad-create-story/discover-inputs.md`
- `_bmad/bmm/config.yaml`
- `_bmad-output/implementation-artifacts/story-3-11-batch-subchapter-retry-recovery.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/3-4-ai-chapter-generation.md`
- `_bmad-output/implementation-artifacts/3-5-source-attribution-baseline-validation.md`
- `_bmad-output/implementation-artifacts/3-10-skill-default-chapter-diagram-generation.md`
- `_bmad-output/implementation-artifacts/tech-spec-skeleton-expand-chapter-generation.md`
- 当前代码基线：
  - `src/main/services/agent-orchestrator/batch-orchestration-manager.ts`
  - `src/main/services/chapter-generation-service.ts`
  - `src/main/services/agent-orchestrator/orchestrator.ts`
  - `src/main/services/task-queue/queue.ts`
  - `src/main/services/task-queue/progress-emitter.ts`
  - `src/shared/chapter-types.ts`
  - `src/shared/ipc-types.ts`
  - `src/main/ipc/chapter-handlers.ts`
  - `src/preload/index.ts`
  - `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts`
  - `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx`
  - `src/renderer/src/modules/editor/components/InlineErrorBar.tsx`
  - `tests/unit/renderer/modules/editor/hooks/useChapterGeneration.test.ts`
- 近期 git 记录：
  - `d226eee feat: add retry button for failed diagram generation in chapter pipeline`
  - `82309aa feat: route ai diagram generation through enhanced skill pipeline`
  - `eac8233 feat: switch chapter diagram generation to skill-first with SVG quality gate (Story 3-10)`
  - `9b8b866 feat: add AI diagram editor integration with skill-based SVG generation (Story 3-9)`

## 发现并已修复的问题

### 1. Story 没有把 exhausted failure 和 retrying countdown 区分开

原 Story 只提出“修复 `hasFailed` 判断”，但没有同步定义 `retrying` phase / payload，也没有明确 `status.error` 在自动重试阶段必须清空。按原稿实现，修复 `hasFailed` 后，章节在 5s / 10s / 30s 倒计时期间也会直接弹出错误条，继续遮挡进度。

已修复：

- 在 Story 中新增 `BatchSectionRetryingPayload`
- 为 `BatchSectionPhase` / `BatchSectionStatus` 补入 `retrying`、`retryCount`、`retryInSeconds`
- 明确 exhausted failure 才写入 `status.error`

### 2. 手动 retry 的“再来 3 次”缺少 retry budget reset 语义

原 Story 只写了 `prepareRetry()` 和重新 dispatch，没有定义 `retryCount` 在手动 retry 后如何处理。这样会让“自动重试 3 次后用户再点重试”直接进入 exhausted 状态，和 AC 里的“再来 3 次”冲突。

已修复：

- 在 manager 任务中补入 `resetRetryCount()`
- 在 retry IPC service 任务中明确“手动 retry 先重置 retry budget，再重新 dispatch”

### 3. skip 路径的进度路由契约不完整，容易丢失下一个 section 的 taskId

当前 progressive batch 的 renderer 依赖 `batch-section-complete` payload 里的 `nextTaskId` 来重新绑定进度路由。原 Story 给 `batchSkipSection()` 只写了 `{ success: true }`，没有约束 next task 的回传方式，实际实现很容易在 skip 后启动了下一 section，却让 renderer 收不到后续进度。

已修复：

- 明确 skip 路径优先复用 `batch-section-complete` payload
- 在 Story 中补入 `nextTaskId` / `nextSectionIndex` 约束
- `BatchSkipSectionOutput` 也同步补入对应字段，减少 IPC 与 progress event 的竞态窗口

### 4. “断点续跑”标题与真实恢复边界不一致

当前 batch orchestration 真实实现是 `BatchOrchestrationManager` 的内存 `Map`，并没有 tech spec 早期提到的 checkpoint resume。原 Story 标题与文案直接写“断点续跑”，但没有把范围限定为“当前 app session 内”，也没有补当前代码里真实存在的 `skeleton-batch-single` restore 缺口。

已修复：

- 新增 AC6，明确只覆盖当前 app session 内的断点续跑
- 明确 `useChapterGeneration` 恢复 `mode='skeleton-batch-single'` 为 `operationType='batch-generate'`
- 明确从 task input 恢复 `batchId`

### 5. manual edit 的故事表述超出了当前任务设计

原 Story 叙述写成“手动编辑并继续剩余章节”，但 tasks 只保留了 `dismissError()` 语义，没有定义“手动编辑完成后何时继续 batch chain”的交互或 IPC。这个差距会让开发者在“新增继续按钮 / 自动继续 / 只清 UI”之间摇摆。

已修复：

- 收窄 Story 主叙述
- 在 Dev Notes 中把 manual edit 定义为“退出失败态并手动补写当前 section”
- 把 batch continuation 的实现责任明确落在 retry / skip 两条路径

### 6. terminal cleanup 缺失，会留下 stale orchestration

当前 `batch-orchestration-manager.ts` 有 `delete(batchId)`，但 `chapter-generation-service.ts` 现有 terminal completion 路径没有调用它。原 Story 没有把这件事写进 tasks，开发后仍会留下内存残留和 stale batchId。

已修复：

- 在 Task 5 中新增 terminal cleanup
- 明确 batch 完成后同时清理 `confirmedSkeletons[sectionId]` 与 in-memory orchestration

### 7. Story 缺少测试任务与 Change Log，开发交付护栏不足

原 Story 只有实现任务，没有测试任务，也没有 `Change Log`。这和当前仓库大部分已验证 story 的产物约定不一致，也会让 dev-story 在缺少回归护栏时直接进入实现。

已修复：

- 新增 Task 6，覆盖 main / IPC / preload / renderer hook / component / E2E / 全量质量门
- 补回 `Change Log`

## 已修改工件

- `_bmad-output/implementation-artifacts/story-3-11-batch-subchapter-retry-recovery.md`

## 结果

经本轮 `validate-create-story` 复核与原位修订后，Story 3.11 已与以下事实完成必要对齐：

- Epic 3 既有 AI 章节生成失败恢复原则
- 当前 progressive batch 的真实主进程实现：`executeWithCallback()` + `BatchOrchestrationManager` 内存 saga
- 当前 renderer 的 task restore、batch payload 路由、错误态与进度态切换逻辑
- 当前 IPC / preload / `ApiResponse<T>` / `PreloadApi` 自动派生契约
- Story 3.9 / 3.10 之后的真实 chapter generation pipeline 边界

本次校验后，未发现仍会阻塞 Story 3.11 开发实施的未解决歧义、矛盾或缺失项，结论为 **PASS**。

## 备注

- 本次仅进行了 story-spec 修订，没有运行代码测试。
- 当前 app 重启后的 batch saga 恢复不在 Story 3.11 范围内；story 已把这一边界写清楚。
