# Story 3-4: AI Chapter Generation — UAT Validation Report

**Date**: 2026-04-02
**Branch**: `worktree-story-3-4-ai-chapter-generation`
**HEAD**: `e5ab8c1`

## Build & Quality Gates

| Check | Result |
|-------|--------|
| `pnpm test` (unit) | 844 passed, 0 failed |
| `pnpm test` (E2E) | 22 passed (5 story-3-4 specific) |
| `pnpm lint` | Clean (0 warnings) |
| `pnpm typecheck` | Clean (node + web) |
| `pnpm build` | Success |

## Acceptance Criteria Verification

### AC1: Guidance-only chapter AI generation with skeleton + phase progress

**PASS**

- `ChapterGenerateButton` renders only when `isMarkdownSectionEmpty()` returns true (guidance-only or blank)
- `ChapterGenerationProgress` implements all 5 phases with correct Chinese labels:
  - `queued` → 排队中... | `analyzing` → 分析需求上下文... | `matching-assets` → 匹配资产素材... | `generating` → AI 正在撰写... | `annotating-sources` → 标注来源...
- 200ms fade-in animation defined in `globals.css` (`.animate-fadeIn`) and applied to progress component
- Respects `prefers-reduced-motion` for accessibility
- E2E: `@story-3-4 @p0` test verifies generation trigger, progress events, and content insertion

### AC2: Regeneration of non-empty chapters via modal with additional context

**PASS**

- `RegenerateDialog` displays read-only chapter title, `TextArea` (max 2000 chars) for additional context, and "重新生成" confirm button
- `OutlineHeadingElement` shows regenerate button only for `!chapterEmpty` chapters
- Hook's `startRegeneration(target, additionalContext)` stores `operationType: 'regenerate'` and context for retry support
- E2E: `@story-3-4 @p1` test exercises dialog open, textarea fill, confirm, and content replacement

### AC3: Provider failure auto-retry (max 3, exponential backoff) + inline error bar

**PASS**

- `chapter-generation-service.ts` sets `maxRetries: 0` — no task-queue level retry
- `provider-adapter.ts` implements `withRetry()`: `MAX_RETRIES = 3`, base delay 1000ms, exponential backoff (`1s, 2s, 4s`), retryable on timeout/network/429/5xx
- `InlineErrorBar` renders exactly 3 buttons: 重试 (`chapter-retry-btn`), 手动编辑 (`chapter-manual-edit-btn`), 跳过 (`chapter-skip-btn`)
- E2E: `@story-3-4 @p1` test triggers mock error via `__E2E_FORCE_ERROR__` marker, verifies all 3 buttons, exercises skip dismissal

### AC4: 120-second timeout across task-queue AND aiProxy.call()

**PASS**

- `CHAPTER_TIMEOUT_MS = 120_000` set in `chapter-generation-service.ts`
- Timeout propagation chain verified:
  1. Service → `agentOrchestrator.execute({ options: { timeoutMs: 120000 } })`
  2. Orchestrator → `taskQueue.execute(taskId, executor, timeoutMs)` (queue execution window)
  3. Orchestrator → `createExecutor()` → `aiProxy.call({ timeoutMs })` (AI call timeout)
  4. `aiProxy` → `provider.chat({ timeoutMs })` → SDK timeout parameter
- Task-queue enforces per-task timeout via `AbortController` + `setTimeout`, marks as `failed` on expiry

### AC5: All AI calls through agent-orchestrator, .prompt.ts convention

**PASS**

- `src/main/prompts/generate-chapter.prompt.ts` exports `generateChapterPrompt()` function and `GENERATE_CHAPTER_SYSTEM_PROMPT` constant
- `chapter-generation-service.ts` exclusively calls `agentOrchestrator.execute()` — no direct AI API imports
- `generate-agent.ts` implements `AgentHandler` type, returns `AiRequestParams` (not direct API call)
- `chapter-handlers.ts` uses `createIpcHandler()` enforcing `{ success, data }` / `{ success, error }` response wrapper

### AC6: Generated Markdown replaced via heading locator, triggers auto-save

**PASS**

- `ChapterHeadingLocator` type: `{ title: string, level: 1|2|3|4, occurrenceIndex: number }`
- `replaceMarkdownSection(markdown, locator, content)` in `chapter-markdown.ts` locates by title+level+occurrenceIndex, splices content between heading and next same-or-higher-level heading
- `PlateEditor.replaceSectionContent()` imperative API: calls `replaceMarkdownSection()`, re-deserializes to Plate nodes, calls `documentStore.updateContent()` to trigger auto-save
- E2E: Content insertion verified by checking mock-generated headings appear in editor

### AC7: No blocking on user edits; conflict detection with overwrite confirmation

**PASS**

- `baselineDigest` created at task start from `createContentDigest(chapter.contentLines.join('\n'))` and stored in task context
- `resolveTerminalPhase()` in hook compares `baselineDigest` vs current digest on completion; returns `'conflicted'` if mismatch
- `EditorView.tsx` shows `Modal.confirm` when phase is `'conflicted'`: title "章节已被修改", OK="替换", Cancel="保留手动编辑" (default preserves human content)
- `confirmOverwrite()` method in hook applies stored `generatedContent` via editor API

### AC8: Parallel chapter scheduling (maxConcurrency=3) with queued state

**PASS**

- `task-queue/queue.ts`: `DEFAULT_MAX_CONCURRENCY = 3`, enforced in `execute()` — excess tasks enter `pendingQueue`
- Hook sets initial phase to `'queued'` on `startGeneration()` / `startRegeneration()`
- Recovery maps `task.status === 'pending'` to `'queued'` phase
- `ChapterGenerationProgress` renders `排队中...` with `ClockCircleOutlined` icon for queued phase
- E2E: `@story-3-4 @p1` multi-chapter test triggers 2 concurrent generations, verifies both complete

### AC9: Task persistence across workspace re-entry

**PASS**

- Hook's `useEffect` on mount calls `window.api.taskList({ category: 'ai-agent', agentType: 'generate' })`
- Filters by `input.projectId === projectId` to scope to current project
- Recovers pending/running tasks: registers in `taskToLocatorRef` for continued progress listening
- Recovers completed/failed tasks: resolves terminal phase via digest comparison
- `baselineDigest` is persisted in task context (service-side), enabling conflict detection on recovery
- E2E: `@story-3-4 @p1` test navigates away to kanban and back, verifies generated content persists

## E2E Test Coverage Matrix

| E2E Test | ACs Covered |
|----------|-------------|
| guidance-only chapter triggers AI generation and inserts content | AC1, AC5, AC6 |
| multiple chapters queue and execute with progress tracking | AC8 |
| error recovery shows inline error bar with retry/manual-edit/skip | AC3 |
| regeneration dialog for chapter with existing content | AC2 |
| task restoration on workspace re-entry | AC9 |

## Out-of-Scope (Confirmed Placeholders)

- **匹配资产 phase (25-49%)**: Alpha placeholder; real asset matching deferred to Epic 5
- **来源标注 phase (90-99%)**: Alpha placeholder; real source attribution deferred to Story 3.5
- **文风控制**: Story 3.6
- **经验图谱注入**: Beta phase
- **AnnotationPanel card system**: Lightweight summary only ("N 个章节正在生成中...")

## Verdict

**PASS** — All 9 acceptance criteria verified against implementation and covered by automated tests (844 unit + 22 E2E). No blocking issues found. Story is ready for merge.
