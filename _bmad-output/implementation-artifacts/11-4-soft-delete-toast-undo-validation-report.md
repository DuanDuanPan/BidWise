# Story 11.4 Validation Report

日期：2026-04-18  
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）  
目标文档：`_bmad-output/implementation-artifacts/11-4-soft-delete-toast-undo.md`

## 校验范围

本次校验按 `validate-create-story` 工作流执行。复核范围覆盖：

- `_bmad/bmm/config.yaml`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/workflow.md`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/checklist.md`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/discover-inputs.md`
- `_bmad-output/implementation-artifacts/11-4-soft-delete-toast-undo.md`
- `_bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor.md`
- `_bmad-output/implementation-artifacts/11-2-focus-state-machine.md`
- `_bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- 当前代码基线：
  - `src/main/services/chapter-structure-service.ts`
  - `src/main/services/document-service.ts`
  - `src/main/services/chapter-identity-migration-service.ts`
  - `src/main/services/chapter-summary-store.ts`
  - `src/main/services/document-parser/traceability-matrix-service.ts`
  - `src/main/db/repositories/annotation-repo.ts`
  - `src/main/db/repositories/traceability-link-repo.ts`
  - `src/main/db/repositories/notification-repo.ts`
  - `src/main/ipc/chapter-structure-handlers.ts`
  - `src/main/index.ts`
  - `src/preload/index.ts`
  - `src/shared/models/proposal.ts`
  - `src/shared/chapter-types.ts`
  - `src/shared/chapter-markdown.ts`
  - `src/shared/ipc-types.ts`
  - `src/renderer/src/stores/documentStore.ts`
  - `src/renderer/src/modules/editor/hooks/useWordCount.ts`
  - `src/renderer/src/modules/editor/hooks/useDocumentOutline.ts`
  - `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
  - `src/renderer/src/modules/annotation/hooks/useCurrentSection.ts`
- 近期 git 记录：
  - `0d9d123 fix: preserve taskId locator mapping for trailing batch-complete event`
  - `c584721 fix: inject chapter + project context into skill-diagram prompt`
  - `8846a37 fix: clamp skill-diagram maxTokens to 32768 for Gemini proxy compat`
  - `0cbd1bc fix: defense-in-depth guard against empty-editor catastrophic overwrite`
  - `407e577 feat: chapter-summary cache with stale-race, bloat, and fan-out fixes (Story 3-12)`

## 发现并已修复的问题

### 1. 重启后的删除语义弱于 Epic 11 原始要求

原 Story 把启动恢复写成“只 finalize 已过期 snapshot”。`epics.md` 的原始产品语义更严格：只要 app 在 Undo window 内崩溃或关闭，下次启动就视为窗口结束，剩余倒计时不再保留。

已修复：

- 将 AC5 改为“进程重启后 active snapshot 一律 finalize”
- 将 Task 6.1 / 6.2 收敛到启动 cleanup + project read barrier 双层方案
- 在 Dev Notes 中明确“重启语义强于同进程 reload”

### 2. 删除 journal 缺少 staged → active 激活规则，存在误 hard-delete 风险

原 Story 直接把 pending snapshot 视为可见 Undo window，却没有定义 staged / committed 边界。多文件写入与 SQLite 删除无法做成单一原子事务，缺少激活规则时，进程在半途崩溃会把“未真正提交的删除”误判成“应在启动时 hard-delete 的删除”。

已修复：

- 在 AC1 中增加“只有 live markdown / metadata / SQLite 删除全部完成后，snapshot 才能成为 active Undo window”
- 在 AC5 中加入“未完成 activation 的 staging journal 只能丢弃或回滚”
- 在 Task 3.3 / 3.7 中明确 staged → active 两阶段激活与 durable staging 要求
- 在 Dev Notes 中点名这是 delete lifecycle 的核心安全约束

### 3. `proposal.meta.json.annotations` 被遗漏出删除 / Undo 范围

当前仓库里 `proposal.meta.json.annotations` 仍存在于 `ProposalMetadata`，`chapter-identity-migration-service.ts` 也把它当成章节身份相关工件处理。原 Story 在 live 删除与 Undo 恢复列表里只写了 SQLite `annotations`，漏掉了 metadata mirror。

已修复：

- 在 AC1 / AC3 中把 `annotations` mirror 纳入 live 删除与恢复范围
- 在 Task 3.4 中把 `proposal.meta.json.annotations` 纳入裁剪清单
- 在 Change Log 中记录与 11.1 migration scope 的对齐

### 4. Renderer 回写路径缺少 autosave 防回写约束

`chapter-structure:*` mutation 会在 main-process 直接改动 `proposal.md` 与 metadata。原 Story 只写“把返回的 markdown / sectionIndex 同步回 `useDocumentStore`”，没有说明如何处理 `documentStore` 里已经排队的 debounce autosave。这样会出现 stale markdown 在几百毫秒后把已删除 subtree 又写回磁盘。

已修复：

- 为 `requestSoftDelete()` / `undoDelete()` 的返回值补入 `lastSavedAt`
- 在 Task 5.2 / 5.3 中新增 committed snapshot 写回路径要求
- 在测试矩阵中补入 `documentStore` committed snapshot / autosave 清队列测试
- 在 Dev Notes 中明确“不能走普通 autosave 队列”

## 已修改工件

- `_bmad-output/implementation-artifacts/11-4-soft-delete-toast-undo.md`
- `_bmad-output/implementation-artifacts/11-4-soft-delete-toast-undo-validation-report.md`

## 剩余风险

- 当前工作树里 `_bmad-output/implementation-artifacts/sprint-status.yaml` 已有未提交修改。本次按 story-spec 校验流程只修订了 Story 11.4 文档本身，没有改写 sprint tracking 文件，以避免覆盖并发中的状态更新。
- Story 11.2 / 11.3 仍是 ready-for-dev 草稿，真正实现 11.4 前需要按它们定义的 `chapterStructureStore` / synthetic pending node / keymap contract 一起落地。
- 本次只做了 story artifact 校准，没有运行代码测试。

## 最终结论

经本轮 `validate-create-story` 复核与原位修订后，Story 11.4 已与当前仓库真实的 `proposal.md + proposal.meta.json.sectionIndex` 数据边界、11.1 的稳定 `sectionId` contract、11.2/11.3 的 renderer 前置依赖、`documentStore` 的 autosave 行为、以及现有 sidecar / SQLite 工件范围完成必要对齐。

当前 Story 已具备进入 `dev-story` 的实现清晰度，结论为 **PASS**。

## 备注

- 本次仅进行了 story-spec 修订，没有运行代码测试。
