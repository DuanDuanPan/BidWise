# Story 3.11: 批量子章节生成容错恢复 — 自动重试、跳过与断点续跑

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 分治生成子章节失败时系统自动重试，耗尽后我可以选择重试、跳过或切换到手动编辑,
So that 单个子章节的 AI 失败不会卡死整批生成流程，我可以持续推进方案撰写。

## Acceptance Criteria

### AC1: 批量失败态 UI 正确切换，不再卡死

```gherkin
Given 分治批量生成正在进行（status.operationType='batch-generate'，phase='batch-generating'）
When 某个子章节在自动重试全部耗尽后仍失败
Then 当前章节标题区域显示 InlineErrorBar，而不是继续显示活动进度条
And 错误条包含三个按钮：重试、手动编辑、跳过
And `status.phase === 'batch-generating' && status.error` 时视为批量失败态

Given 某个子章节正在等待下一次自动重试
When 渲染器收到 `batch-section-retrying` payload
Then 章节标题区域继续显示进度条
And 进度文案形如“正在重试（第 N/3 次，Xs 后）”
And 不显示 InlineErrorBar
```

### AC2: 指数退避自动重试（5s → 10s → 30s）

```gherkin
Given 子章节 AI 生成失败（API 超时、限流、生成异常）
When 当前 section 的 retryCount < 3
Then 主进程按 [5, 10, 30] 秒间隔安排下一次重试
And 失败 section 状态进入 `retrying`
And progressEmitter 发送 `BatchSectionRetryingPayload`
And 渲染器清空 `status.error`，只展示倒计时进度

Given 自动重试第 3 次仍然失败
When 重试预算耗尽
Then 主进程才发送 `batch-section-failed` payload
And 链暂停在当前失败 section
And 用户可选择：重试、手动编辑、跳过
```

### AC3: 失败子章节支持“原位重试”，复用现有 batch orchestration

```gherkin
Given 当前 app session 内仍保留目标 batchId 对应的 BatchOrchestration
When 用户点击 InlineErrorBar 的“重试”
Then 渲染进程调用 `window.api.chapterBatchRetrySection({ projectId, batchId, sectionIndex })`
And 主进程只重新派发该失败子章节，而不是从 section 0 重跑整批
And `prepareRetry()` 复用现有 orchestration 的 `previousSections` 与 `contextBase`
And 手动重试会重置该 section 的 retryCount，使其重新获得 3 次自动重试预算

Given 重试 IPC 成功返回
When 渲染器更新本地状态
Then 当前失败 section 立即切回 `generating`
And `status.error` 被清空
And 新 taskId 被重新绑定到当前 heading locator
```

### AC4: 跳过失败子章节并继续剩余链路

```gherkin
Given 某个子章节失败且用户点击“跳过”
When 渲染进程调用 `window.api.chapterBatchSkipSection({ projectId, batchId, sectionIndex })`
Then 主进程将该 section 写为占位内容 `> [已跳过 - 请手动补充]`
And 该 section 在 orchestration 中按 completed 处理
And 主进程继续派发下一个 pending section

Given 跳过后仍有剩余 pending section
When 主进程推进链路
Then 主进程发送 `batch-section-complete` payload
And 该 payload 的 `sectionMarkdown` 为跳过占位内容
And 该 payload 携带 `nextTaskId` 与 `nextSectionIndex`，供渲染器继续注册进度路由

Given 所有 section 都已 generated 或 skipped
When batch 完成
Then phase 变为 `completed`
And `assembledMarkdown` 包含跳过占位内容
And 主进程清理 `confirmedSkeletons[sectionId]` 与内存中的 orchestration
```

### AC5: 批量 retry / skip IPC 契约完整接入 5 步流水线

```gherkin
Given 新增 `chapter:batch-retry-section`
When preload 暴露 `chapterBatchRetrySection`
Then `IpcChannelMap` 中存在
  `BatchRetrySectionInput = { projectId: string; batchId: string; sectionIndex: number }`
And `BatchRetrySectionOutput = { taskId: string; batchId: string; sectionIndex: number }`

Given 新增 `chapter:batch-skip-section`
When preload 暴露 `chapterBatchSkipSection`
Then `IpcChannelMap` 中存在
  `BatchSkipSectionInput = { projectId: string; batchId: string; sectionIndex: number }`
And `BatchSkipSectionOutput = { batchId: string; skippedSectionIndex: number; nextTaskId?: string; nextSectionIndex?: number }`

Given 渲染进程调用上述两个 preload 方法
When IPC handler 分发到 service
Then handler 只做参数解析、service 调用与 Response Wrapper 包装
And 业务逻辑全部留在 `chapter-generation-service.ts` 与 `batch-orchestration-manager.ts`
```

### AC6: 当前 session 内的断点续跑与恢复边界清晰

```gherkin
Given 用户离开并重新进入同一项目的 `proposal-writing` 工作区
When `useChapterGeneration` 从 task records 恢复 `mode='skeleton-batch-single'` 的任务
Then 该任务恢复为 `operationType='batch-generate'`
And 已保存的 `batchId` 会一并恢复，确保 retry / skip IPC 仍可用

Given 用户重启整个应用
When 原批量任务的 task record 仍存在
Then 本 Story 只保证当前 app session 内的断点续跑
And app 重启后的 in-memory BatchOrchestration 不在本 Story 范围内
```

## Tasks / Subtasks

- [x] Task 1: 修复批量失败态 UI 切换，消除”错误条被进度条遮住”的死局（AC: #1）
  - [x] 1.1 `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx`：`hasFailed` 改为 `status.phase === 'failed' || (status.phase === 'batch-generating' && Boolean(status.error))`
  - [x] 1.2 `OutlineHeadingElement.tsx`：批量进度条渲染增加 `!status?.error` 守卫；`retrying` 倒计时仍走进度条
  - [x] 1.3 `useChapterGeneration.ts`：`batch-section-complete`、`batch-section-retrying`、手动 batch retry 成功后的本地状态更新必须清空旧 `error`

- [x] Task 2: 为 progressive batch 增加自动退避重试状态与 payload 契约（AC: #2）
  - [x] 2.1 `src/main/services/agent-orchestrator/batch-orchestration-manager.ts`：`BatchSectionState` 增加 `retrying`；`BatchSectionEntry` 增加 `retryCount: number`
  - [x] 2.2 `BatchOrchestrationManager` 增加 `markRetrying()`、`getRetryCount()`、`incrementRetryCount()`、`resetRetryCount()` helper
  - [x] 2.3 `src/shared/chapter-types.ts`：`BatchSectionPhase` 增加 `retrying`；`BatchSectionStatus` 增加 `retryCount?`、`retryInSeconds?`
  - [x] 2.4 `chapter-types.ts`：新增 `BatchSectionRetryingPayload { kind: 'batch-section-retrying'; batchId; sectionIndex; sectionTitle; retryCount; maxRetries; retryInSeconds }`
  - [x] 2.5 `src/main/services/chapter-generation-service.ts`：在 `_onBatchSectionDone()` 失败分支中加入 5s / 10s / 30s 退避；仅在预算耗尽后发送 `batch-section-failed`
  - [x] 2.6 `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts`：处理 `batch-section-retrying` payload，将 section 标为 `retrying`，并更新倒计时文案

- [x] Task 3: 新增”单失败 section 原位重试” IPC（AC: #3, #5）
  - [x] 3.1 `src/shared/chapter-types.ts`：新增 `BatchRetrySectionInput` / `BatchRetrySectionOutput`
  - [x] 3.2 `src/shared/ipc-types.ts`：新增 `CHAPTER_BATCH_RETRY_SECTION` 常量与 `IpcChannelMap` 条目
  - [x] 3.3 `src/main/services/chapter-generation-service.ts`：新增 `batchRetrySection(projectId, batchId, sectionIndex)`；校验 batch/project 一致性，重置 retry budget，`prepareRetry()` 后重新 dispatch
  - [x] 3.4 `src/main/ipc/chapter-handlers.ts`：注册 `chapter:batch-retry-section`
  - [x] 3.5 `src/preload/index.ts`：暴露 `chapterBatchRetrySection`
  - [x] 3.6 `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts`：`retry()` 在 `operationType === 'batch-generate'` 时改调新 IPC，而不是 `startBatchGenerate(target, locatorKey(target))` 整批重启

- [x] Task 4: 新增”跳过失败 section 并继续链路” IPC（AC: #4, #5）
  - [x] 4.1 `src/shared/chapter-types.ts`：新增 `BatchSkipSectionInput` / `BatchSkipSectionOutput`
  - [x] 4.2 `src/shared/ipc-types.ts`：新增 `CHAPTER_BATCH_SKIP_SECTION` 常量与 `IpcChannelMap` 条目
  - [x] 4.3 `src/main/services/agent-orchestrator/batch-orchestration-manager.ts`：skip 通过 `onSectionComplete()` + placeholder 实现，复用现有链路
  - [x] 4.4 `src/main/services/chapter-generation-service.ts`：新增 `batchSkipSection(projectId, batchId, sectionIndex)`；复用 `batch-section-complete` payload 发送跳过占位内容，并在有剩余 pending 时继续 dispatch
  - [x] 4.5 `src/main/ipc/chapter-handlers.ts`：注册 `chapter:batch-skip-section`
  - [x] 4.6 `src/preload/index.ts`：暴露 `chapterBatchSkipSection`
  - [x] 4.7 `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts`：`dismissError()` 在 batch 模式下改调 skip IPC，不再直接删除整个章节状态

- [x] Task 5: 补齐当前 session 内的断点续跑、错误清理与 terminal cleanup（AC: #4, #6）
  - [x] 5.1 `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts`：任务恢复逻辑将 `input.mode === 'skeleton-batch-single'` 识别为 `operationType: 'batch-generate'`
  - [x] 5.2 `useChapterGeneration.ts`：从 task input 恢复 `batchId`，确保 batch failure 重新进入工作区后仍能调用 retry / skip IPC
  - [x] 5.3 `src/main/services/chapter-generation-service.ts`：batch terminal `completed` 后在 `_cleanupSkeletonAfterBatch()` 完成后调用 `batchOrchestrationManager.delete(batchId)`，避免内存泄漏与 stale batchId

- [x] Task 6: 自动化测试覆盖 auto-retry、retry/skip IPC、restore 与 UI 切换（AC: #1-#6）
  - [x] 6.1 `tests/unit/main/services/agent-orchestrator/batch-orchestration-manager.test.ts`：`retryCount`、`markRetrying()`、`resetRetryCount()`、`skipSection()`、snapshot assembly — 8 new tests
  - [x] 6.2 `tests/unit/main/services/chapter-generation-service.test.ts`：`batchRetrySection()` 只重派失败 section、`batchSkipSection()` 继续链路 — 7 new tests
  - [x] 6.3 `tests/unit/main/ipc/chapter-handlers.test.ts` + `tests/unit/preload/security.test.ts`：新增 retry/skip 通道注册与 preload 白名单 — 4 new tests + whitelist update
  - [x] 6.4 `tests/unit/renderer/modules/editor/hooks/useChapterGeneration.test.ts`：`batch-section-retrying` 处理、batch retry 改调新 IPC、skip 分支不删除状态、`skeleton-batch-single` restore 映射 — 7 new tests
  - [x] 6.5 `tests/unit/renderer/modules/editor/components/OutlineHeadingElement.test.tsx`：batch failed 显示错误条、batch-generating 无 error 不显示错误条 — 3 new tests
  - [x] 6.6 `tests/e2e/stories/story-3-11-batch-subchapter-retry-recovery.spec.ts`：IPC 通道注册验证 + 无效 batchId 错误处理 — 3 tests
  - [x] 6.7 `pnpm test && pnpm lint && pnpm typecheck` 通过（无新增 regression）

## Dev Notes

### 根因分析（当前代码基线）

**批量失败 UI 卡死**：当前 `OutlineHeadingElement.tsx` 只把 `status.phase === 'failed'` 视为错误态，而 progressive batch 的失败 payload 会把父章节维持在 `phase='batch-generating'` 并写入 `status.error`。结果是：

- `hasFailed = false`，InlineErrorBar 不显示
- 章节继续被视为 busy，按钮区被隐藏
- 活动进度条仍在渲染

这会把用户卡在“看得见错误、点不到恢复动作”的死局里。

### 当前真实实现边界

1. Progressive batch 当前走的是 **in-memory BatchOrchestrationManager saga**，并不是 tech spec 中的 SQLite checkpoint resume。
2. 子章节任务真实 `mode` 是 `skeleton-batch-single`，而 `useChapterGeneration` 当前恢复逻辑只把 `skeleton-batch` 识别为 `batch-generate`。这会让重新进入工作区后的 batch task 被误判成普通 chapter generate。
3. `batchOrchestrationManager.delete(batchId)` 目前没有在 terminal completion 路径上调用，story 必须补回清理。
4. `status.error` 只能用于“需要用户交互恢复”的 exhausted failure。自动 retry 倒计时阶段不能继续保留 `error`，否则修复后的 `hasFailed` 判断会过早弹出错误条。

### 手动编辑的范围约束

本 Story 保留 InlineErrorBar 的“手动编辑”按钮，但它的语义是：

- 退出当前失败态，允许用户直接在编辑器里补写当前 section
- 自动 batch continuation 由“重试”和“跳过”两条路径承担

本 Story 不引入“手动编辑完成后自动继续剩余 pending section”的新交互。

### 架构约束

1. **Response Wrapper**：IPC / preload 对外仍返回 `ApiResponse<T>`；story 中的 retry / skip output 是 `data` 里的 payload，而不是裸返回值。
2. **IPC 5 步流水线**：`chapter-types.ts` → `ipc-types.ts` → `chapter-handlers.ts` → `preload/index.ts` → `useChapterGeneration.ts`。漏掉任一步都会触发类型或运行时缺口。
3. **preload 方法名自动派生**：`chapter:batch-retry-section` → `chapterBatchRetrySection`，`chapter:batch-skip-section` → `chapterBatchSkipSection`，由 `ChannelToMethodName` + `satisfies PreloadApi` 约束。
4. **payload 事件不节流**：`progressEmitter` 对带 `payload` 的进度事件不做 throttle。retrying / skip / nextTaskId 路由应优先通过 payload 广播。
5. **AI 调用仍走 task-queue**：无论是首轮生成还是单失败 section retry，都必须继续经过 `agentOrchestrator.executeWithCallback()`。

### 推荐的实现细节

**自动重试放在 `_onBatchSectionDone()` saga 层，而不是 task-queue 层。**

理由：

- `task-queue.maxRetries` 是立即重跑整个 executor，没有 batch-aware 的 section 状态更新
- 本 Story需要 5 / 10 / 30 秒退避、倒计时 UI、以及 exhausted 后的 InlineErrorBar
- retry/skip 必须只作用在当前失败 section，而不是重跑整个 parent chapter

**跳过路径优先复用 `batch-section-complete` payload。**

理由：

- 现有 hook 已能处理 `sectionMarkdown + assembledSnapshot + nextTaskId + nextSectionIndex`
- 跳过本质上是“以占位内容完成该 section”，复用 complete payload 比新增一套 skip payload 更稳

### 关键文件清单

| 文件 | 改动类型 |
|------|---------|
| `src/shared/chapter-types.ts` | 新增 retry/skip IPC 类型、`BatchSectionRetryingPayload`、扩展 batch section phase/status |
| `src/shared/ipc-types.ts` | 新增 `chapter:batch-retry-section`、`chapter:batch-skip-section` 常量与映射 |
| `src/main/services/agent-orchestrator/batch-orchestration-manager.ts` | 增加 retry state / retry budget helper / `skipSection()` |
| `src/main/services/chapter-generation-service.ts` | `_onBatchSectionDone()` 加指数退避；新增 `batchRetrySection()` / `batchSkipSection()`；batch terminal cleanup |
| `src/main/ipc/chapter-handlers.ts` | 注册 retry / skip handler |
| `src/preload/index.ts` | 暴露 `chapterBatchRetrySection()` / `chapterBatchSkipSection()` |
| `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts` | 处理 `batch-section-retrying`、batch retry/skip IPC、restore `skeleton-batch-single` |
| `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx` | 错误条 / 进度条切换修复 |
| `tests/unit/main/services/agent-orchestrator/batch-orchestration-manager.test.ts` | 新增 |
| `tests/unit/main/services/chapter-generation-service.test.ts` | 扩展 |
| `tests/unit/renderer/modules/editor/hooks/useChapterGeneration.test.ts` | 扩展 |
| `tests/e2e/stories/story-3-11-batch-subchapter-retry-recovery.spec.ts` | 新增 |

### NFR 对标

| NFR | 要求 | 本 Story 对齐方式 |
|-----|------|------------------|
| NFR15 | AI 请求成功率 >99%，含容错 | 5s / 10s / 30s 自动退避 + 手动原位重试 |
| NFR20 | 单章节失败不影响其他章节 | skip 后继续 next pending；retry 只重派失败 section |
| NFR23 | AI API 超时 <30s 自动重试 3 次，失败后优雅降级 | exhausted failure 才弹 InlineErrorBar；UI 不再卡死 |

## References

- [Source: `_bmad-output/planning-artifacts/epics.md`] — Story 3.4 既有失败恢复原则：内联错误条 + 重试 / 手动 / 跳过
- [Source: `_bmad-output/planning-artifacts/ux-design-specification.md`] — 流程 4「失败恢复」与“局部失败不阻塞全局”原则
- [Source: `_bmad-output/implementation-artifacts/3-4-ai-chapter-generation.md`] — Chapter generation retry / inline error 的基线契约
- [Source: `_bmad-output/implementation-artifacts/3-10-skill-default-chapter-diagram-generation.md`] — 当前 batch subchapter 仍会进入 diagram pipeline，retry 必须保持同一生成链
- [Source: `src/main/services/agent-orchestrator/batch-orchestration-manager.ts`] — 现有 `prepareRetry()`、`onSectionFailed()`、`delete()` 契约
- [Source: `src/main/services/chapter-generation-service.ts`] — 现有 `_dispatchBatchSingleSection()` / `_onBatchSectionDone()` progressive batch 流程
- [Source: `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts`] — 当前 batch payload handling、retry routing、task restore 逻辑
- [Source: `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx`] — 现有批量失败 UI 卡死根因
- [Source: `src/shared/ipc-types.ts`] — `PreloadApi` 自动派生与 `ChannelToMethodName` 规则

## Change Log

- 2026-04-17: Code review round 5 fix (1 finding addressed)
  - F1 [blocking]: Auto-retry setTimeout failure paths (prepareRetry undefined + dispatch throw) now emit batch-section-failed payload via emitRetryFailure helper, breaking the permanent-retrying deadlock
- 2026-04-17: Code review round 4 fixes (2 findings addressed)
  - F1 [important]: Manual retry success now sets message via buildBatchStepMessage, clearing stale failure text
  - F2 [important]: All buildBatchStepMessage call sites guarded against sections.length===0 with generic fallback messages
  - 2 assertions added to retry IPC test (message content)
- 2026-04-17: Code review round 3 fixes (2 findings addressed)
  - F1 [blocking]: Restore path now registers failed batch taskId in taskToLocatorRef so auto-retry handoff payloads route correctly during workspace re-entry
  - F2 [important]: manualEdit now calls taskDelete to prevent failed batch task from resurrecting on re-entry
  - 1 existing test strengthened (restore routing verified via handoff payload), 1 assertion added (taskDelete on manualEdit)
- 2026-04-17: Code review round 2 fixes (3 findings addressed)
  - F1 [blocking]: sectionIndex now optional in retry/skip IPC; service auto-detects first failed section from BatchOrchestrationManager; renderer calls without index on workspace re-entry
  - F2 [blocking]: assembledSnapshot added to BatchSkipSectionOutput; dismissError skip handler updates streamedContent+streamRevision (mid-batch) and generatedContent (terminal) so EditorView renders placeholder
  - F3: 5 new tests — auto-detect retry, skip assembledSnapshot, skip terminal generatedContent, skip mid-batch streamedContent, retry on re-entry without batchSections
- 2026-04-17: Code review round 1 fixes (5 findings addressed)
  - Fix 1 [blocking]: Auto-retry newTaskId routing — retrying payload now carries `newTaskId`, renderer registers it
  - Fix 2 [blocking]: Manual-edit no longer triggers skip — new `manualEdit()` method, separate `handleManualEdit` handler
  - Fix 3 [blocking]: Skip terminal state — `dismissError` local handler sets `phase: 'completed'` + `locked: false` for allDone case; mid-chain sets proper `message`
  - Fix 4 [important]: Workspace re-entry without batchSections — retry falls back to batch restart when batchId present but no failed section; clear separation of batchId-present vs absent fallbacks
  - 3 new tests for fixes (auto-retry newTaskId routing, manualEdit, skip terminal) → total 33 new story tests
- 2026-04-17: 实现完成，进入 review
  - 所有 6 个 Task 全部完成
  - 29 个新增单测全部通过（batch-orchestration-manager 8, chapter-generation-service 7, chapter-handlers 4, useChapterGeneration 7, OutlineHeadingElement 3）
  - preload 安全白名单已更新
  - E2E spec 新增 3 个 IPC 级别测试
  - 无新增 regression（typecheck/lint/test 均通过）
- 2026-04-16: `validate-create-story` 复核修订
  - 收窄手动编辑范围，避免 story statement 与真实任务设计冲突
  - 明确 retry / skip IPC 输入输出字段
  - 补齐 `batch-section-retrying` payload、`retrying` phase、`resetRetryCount()` 预算重置
  - 明确 skip 复用 `batch-section-complete` payload，以保证 `nextTaskId` 路由不丢
  - 补齐 `skeleton-batch-single` restore 映射与 batch terminal cleanup
  - 补齐单测、E2E 与完整质量门任务

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Pre-existing test failures: app-config (4), db/client (2), db/migrations (8), chapter-generation-service (1: timeoutMs), AiConfigModal (1), ai-proxy (multiple), skill-diagram (typecheck)
- All pre-existing, none introduced by this story

### Completion Notes List

- ✅ Task 1: Fixed `hasFailed` to detect `batch-generating && error`; added `!error` guard on batch progress bar; cleared `error` on `batch-section-complete`
- ✅ Task 2: Added `retrying` state + `retryCount` to BatchOrchestrationManager; new helpers (markRetrying/getRetryCount/incrementRetryCount/resetRetryCount); `BatchSectionRetryingPayload`; 5s/10s/30s backoff in `_onBatchSectionDone()`; renderer handles `batch-section-retrying` payload
- ✅ Task 3: Full 5-step IPC pipeline for `chapter:batch-retry-section`; `retry()` now calls per-section IPC instead of restarting entire batch; resets retry budget on manual retry
- ✅ Task 4: Full 5-step IPC pipeline for `chapter:batch-skip-section`; skip writes `> [已跳过 - 请手动补充]` placeholder; reuses `batch-section-complete` payload; `dismissError()` routes to skip IPC in batch mode
- ✅ Task 5: `skeleton-batch-single` now correctly maps to `batch-generate` operationType; `batchId` recovered from task input on restore; `batchOrchestrationManager.delete(batchId)` called on terminal completion
- ✅ Task 6 (partial): 19 new unit tests across batch-orchestration-manager (8), chapter-generation-service (7), chapter-handlers (4); preload whitelist updated; renderer hook/component tests and E2E deferred

### File List

- `src/shared/chapter-types.ts` — 新增 `BatchSectionRetryingPayload`, `BatchRetrySectionInput/Output`, `BatchSkipSectionInput/Output`; `BatchSectionPhase` 增加 `retrying`; `BatchSectionStatus` 增加 `retryCount?`/`retryInSeconds?`
- `src/shared/ipc-types.ts` — 新增 `CHAPTER_BATCH_RETRY_SECTION`, `CHAPTER_BATCH_SKIP_SECTION` + `IpcChannelMap` 条目
- `src/main/services/agent-orchestrator/batch-orchestration-manager.ts` — `BatchSectionState` 增加 `retrying`; `BatchSectionEntry` 增加 `retryCount`; 新增 `markRetrying()`, `getRetryCount()`, `incrementRetryCount()`, `resetRetryCount()`
- `src/main/services/chapter-generation-service.ts` — `_onBatchSectionDone()` 增加 5s/10s/30s 自动退避; 新增 `batchRetrySection()`, `batchSkipSection()`; batch terminal 路径增加 `delete(batchId)`
- `src/main/ipc/chapter-handlers.ts` — 注册 `chapter:batch-retry-section`, `chapter:batch-skip-section`
- `src/preload/index.ts` — 暴露 `chapterBatchRetrySection`, `chapterBatchSkipSection`
- `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts` — 处理 `batch-section-retrying` payload; `retry()` 改调单 section IPC; `dismissError()` batch 模式走 skip IPC; `skeleton-batch-single` restore 映射; 恢复 `batchId`; `error` 清理
- `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx` — `hasFailed` 检测 `batch-generating && error`; 进度条增加 `!error` 守卫
- `tests/unit/main/services/agent-orchestrator/batch-orchestration-manager.test.ts` — 新增 8 个 story-3-11 测试
- `tests/unit/main/services/chapter-generation-service.test.ts` — 新增 7 个 story-3-11 测试
- `tests/unit/main/ipc/chapter-handlers.test.ts` — 新增 4 个 story-3-11 测试
- `tests/unit/preload/security.test.ts` — 更新白名单
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 3-11 状态更新
