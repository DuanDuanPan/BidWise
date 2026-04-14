---
title: '详细设计章节分治生成（Skeleton-Expand Chapter Generation）'
slug: 'skeleton-expand-chapter-generation'
created: '2026-04-14'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: [Electron, TypeScript, React, Vitest, Kysely, SQLite, Zustand]
files_to_modify:
  - src/shared/chapter-types.ts
  - src/shared/models/proposal.ts
  - src/main/prompts/generate-chapter.prompt.ts
  - src/main/services/agent-orchestrator/orchestrator.ts
  - src/main/services/agent-orchestrator/agents/generate-agent.ts
  - src/main/services/agent-orchestrator/post-processors/terminology-post-processor.ts
  - src/main/services/chapter-generation-service.ts
  - src/main/ipc/chapter-handlers.ts
  - src/shared/ipc-types.ts
  - src/preload/index.ts
  - src/renderer/src/modules/editor/hooks/useChapterGeneration.ts
  - src/renderer/src/modules/editor/components/EditorView.tsx
code_patterns:
  - 'AgentHandler returns wrapParams (delegate to orchestrator) or wrapResult (self-managed AI calls)'
  - 'Chapter types dispatched by title regex in generate-chapter.prompt.ts (DIAGRAM_HEAVY_RE, COMPLIANCE_MATRIX_RE)'
  - 'task-queue concurrency=3, fire-and-forget via agentOrchestrator.execute()'
  - 'Progress phases: queued → analyzing → generating-text → ... → completed/failed'
  - 'IPC handlers are thin dispatch: chapter-handlers.ts → chapterGenerationService → agentOrchestrator'
  - 'Template system: TemplateSection → applyWeights → SkeletonSection → sectionsToMarkdown'
  - 'LLM JSON parsing via src/main/utils/llm-json.ts (extractJsonObject/extractJsonArray with repair)'
  - 'terminologyPostProcessor skips by checking context.mode (existing pattern: ask-system, annotation-feedback)'
test_patterns:
  - 'Vitest + vi.mock for service dependencies'
  - 'vi.hoisted() for mock hoisting'
  - 'Dynamic import after mocks: await import(...)'
  - 'Test file location mirrors src: tests/unit/main/services/...'
---

# Tech-Spec: 详细设计章节分治生成（Skeleton-Expand Chapter Generation）

**Created:** 2026-04-14

## Overview

### Problem Statement

当前章节生成是"一章一次 LLM 调用"的黑盒模式。对于复合型详细设计章节（包含功能设计、UI设计、流程设计、数据库设计等多维度内容），单次生成的用户无法逐段审阅和定向调优，且不同架构范式（B/S、C/S、IoT、大数据、微服务）需要不同的骨架结构来确保不遗漏关键设计维度。

**核心价值**：分治的目标不是"让 LLM 能写更长的章节"（它已经能了），而是**给用户分段审阅和定向重新生成的能力**。

### Solution

引入三阶段分治管线——Phase 1 LLM 生成骨架结构（基于范式维度检查清单 + LLM 智能裁剪），Phase 2 串行生成子章节（后者可看到前者摘要），Phase 3 组装为完整 markdown 块替换父章节。通过 `generate-agent.ts` 新增 `skeleton-expand` mode 实现。

**分阶段交付**：
- **Story A（核心管线 — 本 spec 范围）**：generate-agent 新增 skeleton-expand mode，通用范式，骨架只读预览+确认，串行子章节生成，验证三阶段管线端到端
- **Story B（范式系统 — 后续）**：多范式模板 + 需求预分析 + project_profiles DB 表
- **Story C（前端交互 — 后续）**：骨架编辑器（拖拽/勾选维度） + 并行模式 + 失败子章节单独重试 UI

### Scope

**In Scope (Story A):**

- Phase 1: LLM 骨架生成（输出结构 JSON），含 schema validation + 优雅降级
- 骨架只读预览 + 确认/重新生成（不做编辑器）
- Phase 2: 子章节串行生成（后者 prompt 注入前者摘要），复用现有 `generateChapterPrompt`
- Phase 3: 组装为完整 markdown 块 + 术语后处理（由 orchestrator 自动执行）
- 子章节级错误隔离（部分完成状态）
- 用户手动选择分治模式（不自动判断）
- 三步 IPC：`skeleton-generate`(async) → `skeleton-confirm`(sync) → `batch-generate`(async)
- 一个通用范式维度检查清单
- 骨架确认结果持久化到 `proposal.meta.json`
- 扩展 `AgentHandler` 签名以支持 `setCheckpoint`

**Out of Scope:**

- 多范式模板系统 — Story B
- 需求预分析 + project_profiles DB 表 — Story B
- 骨架编辑 UI — Story C
- 并行子章节生成模式 — Story C
- 失败子章节单独重试 UI — Story C
- 自动判断章节是否需要分治 — 后续
- 自定义模板沉淀 — 后续
- 跨顶级章节的一致性校验

## Context for Development

### Codebase Patterns

**Agent Handler Pattern:**
`generateAgentHandler` in `generate-agent.ts` dispatches on `context.mode`. Returns `wrapParams()` to delegate the AI call to the orchestrator, or `wrapResult()` when the handler manages AI calls directly (e.g., diagram generation with retries). The `skeleton-expand` mode must use `wrapResult()` since it orchestrates multiple sequential AI calls internally.

**Important: `AgentHandler` currently receives `{ signal, updateProgress, aiProxy }` but NOT `setCheckpoint` or `checkpoint`.** The `TaskExecutorContext` has these fields (line 17-23 of `queue.ts`), but the orchestrator's `createExecutor` (line 92 of `orchestrator.ts`) does NOT forward them to the handler. This must be fixed for checkpoint support.

**Terminology Post-Processor Skip Pattern:**
`terminologyPostProcessor` (line 41-43 of `terminology-post-processor.ts`) already skips processing for modes `ask-system` and `annotation-feedback` by checking `context.mode`. The same pattern can be used to skip `skeleton-generate` mode (which returns JSON, not markdown).

**IPC + Task Queue Flow:**
`chapter-handlers.ts` → `chapterGenerationService` → `agentOrchestrator.execute()` → `taskQueue.enqueue()`. Each task gets a `taskId`, progress events stream via `window.api.onTaskProgress()`. Batch orchestration is done inside the agent handler (like diagram generation via `runWithConcurrency`).

**LLM JSON Extraction:**
`src/main/utils/llm-json.ts` provides `extractJsonObject<T>()` and `extractJsonArray<T>()` with automatic repair for malformed quotes.

**Renderer Progress Tracking:**
`useChapterGeneration.ts` tracks per-chapter status via `Map<locatorKey, ChapterGenerationStatus>`. Phases are mapped from progress events. Streaming content delivered via `ChapterStreamProgressPayload`.

**ProposalMetadata persistence:**
`proposal.meta.json` accessed via `documentService.updateMetadata(projectId, updater)`. Uses per-project promise-chain mutex + temp-file atomic rename for concurrent write safety.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/main/services/agent-orchestrator/agents/generate-agent.ts` | Agent handler — add `skeleton-generate` and `skeleton-batch` mode branches |
| `src/main/services/agent-orchestrator/orchestrator.ts` | Orchestrator — extend `AgentHandler` options to forward `setCheckpoint` + `checkpoint` |
| `src/main/services/agent-orchestrator/post-processors/terminology-post-processor.ts` | Post-processor — add skip for `skeleton-generate` mode |
| `src/main/services/chapter-generation-service.ts` | Context builder + dispatch — add skeleton entry points |
| `src/main/prompts/generate-chapter.prompt.ts` | Prompt templates — add skeleton generation prompt + sub-chapter dimension prompts |
| `src/shared/chapter-types.ts` | Shared types — extend phases, add skeleton/batch types |
| `src/shared/models/proposal.ts` | ProposalMetadata — add `confirmedSkeletons` field |
| `src/main/ipc/chapter-handlers.ts` | IPC dispatch — add 3 new channels |
| `src/shared/ipc-types.ts` | IPC channel registry — register new channels + type mappings |
| `src/preload/index.ts` | Context bridge — expose 3 new API methods |
| `src/main/utils/llm-json.ts` | JSON extraction — reuse for skeleton JSON parsing |
| `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts` | Renderer hook — extend for skeleton + batch progress |
| `src/renderer/src/modules/editor/components/EditorView.tsx` | UI — add "分治生成" button + skeleton preview modal |

### Technical Decisions

1. **Reuse `agentType: 'generate'` with new modes** — `mode: 'skeleton-generate'` for Phase 1, `mode: 'skeleton-batch'` for Phase 2+3. No new agent type registration needed. The existing `terminologyPostProcessor` skips `skeleton-generate` mode (returns JSON), runs for `skeleton-batch` mode (returns markdown).

2. **Three-step IPC:**
   - `chapter:skeleton-generate` → async task, returns `{ taskId }`. Agent handler generates skeleton JSON via LLM.
   - `chapter:skeleton-confirm` → sync IPC, persists confirmed skeleton to `proposal.meta.json`. Returns `{ success: true }`.
   - `chapter:batch-generate` → async task, returns `{ taskId }`. Agent handler reads confirmed skeleton from metadata, serially generates sub-chapters with context chaining.

3. **Serial sub-chapter generation with context chaining:**
   Each sub-chapter's prompt includes a truncated summary (max 500 chars) of previously generated sub-chapters as `adjacentContext`. This prevents repetition/contradiction.

4. **Sub-chapter error isolation + checkpoint (F1 fix):**
   Failed sub-chapters are recorded but don't abort. `setCheckpoint()` called after each successful sub-chapter. This requires extending `AgentHandler` options to include `setCheckpoint` and `checkpoint` from `TaskExecutorContext`. Final result: `{ completedSections, failedSections }` encoded as structured metadata alongside the assembled markdown content.

5. **Output replaces parent chapter as complete markdown block:**
   Sub-headings are generated content. Reuses existing `baselineDigest` conflict detection. The `batch-generate` result content is **always markdown** (the orchestrator's post-processor runs on it). Structured metadata (`completedSections`, `failedSections`) is reported via the final progress event payload, NOT embedded in content.

6. **Skeleton JSON schema validation + graceful degradation (F5 fix):**
   If LLM returns invalid skeleton, the `skeleton-generate` handler returns a result with a structured JSON `{ fallback: true, reason: "..." }`. The frontend completion handler checks for `fallback: true` and automatically triggers standard `startGeneration(target)` — the user sees a brief "骨架生成失败，已切换为标准生成" toast notification.

7. **Lean sub-chapter prompts:**
   Requirements filtered by `traceabilityLinkRepo`. `maxTokens=4096` per sub-chapter.

8. **Skeleton persisted to `proposal.meta.json`:**
   Field `confirmedSkeletons: Record<string, SkeletonExpandPlan>`, keyed by `sectionId`. Cleaned up after successful batch-generate completion (F7 fix: `skeleton-confirm` writes, `batchGenerate` completion deletes the entry).

9. **Terminology post-processor skip for skeleton-generate (F4 fix):**
   Add `context.mode === 'skeleton-generate'` to the existing skip check in `terminologyPostProcessor` (line 43). This follows the established pattern for `ask-system` and `annotation-feedback`.

10. **Batch timeout extended (F8 fix):**
    `batchGenerate` dispatches with `timeoutMs: 600_000` (10 minutes) instead of the default `CHAPTER_TIMEOUT_MS = 300_000`. Serial generation of 5-10 sub-chapters needs more headroom.

### Elicitation Insights

**Risks mitigated:**
- Renderer crash → skeleton persisted to metadata on confirm
- Sub-chapters inconsistent → serial with context chaining
- Partial failure → checkpoint per sub-chapter + partial completion status
- LLM JSON malformed → schema validation + graceful degradation with auto-fallback to single-shot
- Token explosion → lean prompts + maxTokens=4096
- Sub-headings not in proposal.md → complete block replacement
- Auto-detection misclassification → manual trigger only

**Adversarial review fixes applied:**
- F1: Extended `AgentHandler` options to include `setCheckpoint` + `checkpoint` (Task 0)
- F2: Post-processor runs automatically via orchestrator, not manually in handler (Task 5 corrected)
- F3: `operationType` union extended with `'skeleton-generate' | 'batch-generate'` (Task 1)
- F4: `terminologyPostProcessor` skips `skeleton-generate` mode (Task 3b)
- F5: Frontend auto-triggers fallback on `{ fallback: true }` result (Task 8)
- F6: Schema validation rejects sections with level > 4 (Task 4)
- F7: `confirmedSkeletons` entry cleaned up after batch completion (Task 6)
- F8: Batch timeout = 600_000ms (Task 6)
- F9: Overwrite confirmation dialog when chapter has content (Task 9)
- F10: Content is always markdown for batch; metadata via progress payload (Task 5)
- F11: Frontend hook tests added (Task 14)
- F12: `DesignDimension` changed to `string` with `KNOWN_DIMENSIONS` constant (Task 1)

## Implementation Plan

### Tasks

- [x] **Task 0: Extend AgentHandler signature for checkpoint support** _(F1 fix)_
  - File: `src/main/services/agent-orchestrator/orchestrator.ts`
  - Action: Extend the `AgentHandler` options type to include optional `setCheckpoint` and `checkpoint`:
    ```typescript
    export type AgentHandler = (
      context: Record<string, unknown>,
      options: {
        signal: AbortSignal
        updateProgress: (progress: number, message?: string, payload?: unknown) => void
        aiProxy?: AiProxyLike
        setCheckpoint?: (data: unknown) => Promise<void>
        checkpoint?: unknown
      }
    ) => Promise<AiRequestParams | AgentHandlerResult>
    ```
  - Action: In `createExecutor` (line 92), forward `setCheckpoint` and `checkpoint` from `TaskExecutorContext` to the handler options:
    ```typescript
    const handlerResult = await handler(ctx.input as Record<string, unknown>, {
      signal: ctx.signal,
      updateProgress: ctx.updateProgress,
      aiProxy,
      setCheckpoint: ctx.setCheckpoint,
      checkpoint: ctx.checkpoint,
    })
    ```
  - Notes: Both fields are optional — existing handlers don't need changes. Only `handleSkeletonBatch` will use them.

- [x] **Task 1: Define shared types for skeleton-expand**
  - File: `src/shared/chapter-types.ts`
  - Action: Add the following types:
    - `DesignDimension` — `string` type alias (not union). Add `KNOWN_DIMENSIONS` constant array: `['functional', 'ui', 'process-flow', 'data-model', 'interface', 'security', 'deployment'] as const` _(F12 fix: flexible for future extension)_
    - `SkeletonExpandSection` — `{ title: string; level: number; dimensions: string[]; guidanceHint?: string }`
    - `SkeletonExpandPlan` — `{ parentTitle: string; parentLevel: number; sections: SkeletonExpandSection[]; dimensionChecklist: string[]; confirmedAt: string }`
    - `SkeletonBatchProgressPayload` — `{ kind: 'skeleton-batch'; completedCount: number; totalCount: number; completedSections: string[]; failedSections: Array<{ title: string; error: string }> }`
    - Extend `ChapterGenerationPhase` union with: `'skeleton-generating' | 'skeleton-ready' | 'batch-generating' | 'batch-composing'`
    - Extend `operationType` in `ChapterGenerationStatus` to: `'generate' | 'regenerate' | 'skeleton-generate' | 'batch-generate'` _(F3 fix)_
    - Add optional `skeletonPlan?: SkeletonExpandPlan` field to `ChapterGenerationStatus`
    - `SkeletonGenerateInput` — `{ projectId: string; target: ChapterHeadingLocator }`
    - `SkeletonGenerateOutput` — `{ taskId: string }`
    - `SkeletonConfirmInput` — `{ projectId: string; sectionId: string; plan: SkeletonExpandPlan }`
    - `BatchGenerateInput` — `{ projectId: string; target: ChapterHeadingLocator; sectionId: string }`
    - `BatchGenerateOutput` — `{ taskId: string }`
  - Notes: Import `TokenUsage` from `ai-types.ts`.

- [x] **Task 2: Extend ProposalMetadata for skeleton persistence**
  - File: `src/shared/models/proposal.ts`
  - Action: Add optional field `confirmedSkeletons?: Record<string, SkeletonExpandPlan>` to `ProposalMetadata` interface. Import `SkeletonExpandPlan` from `../chapter-types`.
  - File: `src/main/services/document-service.ts`
  - Action: In `readMetadata()`, pass through `confirmedSkeletons` if present (same pattern as `sectionWeights`). In validation, add: if `confirmedSkeletons` exists and is not a plain object, throw parse error.

- [x] **Task 3: Create skeleton generation prompt + extend post-processor** _(F4 fix)_
  - File: `src/main/prompts/generate-chapter.prompt.ts`
  - Action: Add new exported function `generateSkeletonPrompt(context: SkeletonPromptContext): string` where:
    ```typescript
    interface SkeletonPromptContext {
      chapterTitle: string
      chapterLevel: number
      requirements: string
      scoringWeights?: string
      documentOutline?: string
      dimensionChecklist: string
    }
    ```
    The prompt instructs LLM to:
    1. Analyze requirements and determine which functional modules/subsystems this chapter should cover
    2. For each module, select applicable design dimensions from the checklist
    3. Output strict JSON: `{ "sections": [{ "title": "模块名 - 维度名", "level": N, "dimensions": ["functional", "ui"], "guidanceHint": "brief" }] }`
    4. Use checklist as reference, not rigid constraint ("根据实际需求选择性应用")
  - Action: Add exported constant `SKELETON_GENERATION_SYSTEM_PROMPT`.
  - Action: Add exported function `generateSubChapterPrompt(context: SubChapterPromptContext): string` where:
    ```typescript
    interface SubChapterPromptContext extends GenerateChapterContext {
      dimensionFocus: string
      previousSectionsSummary?: string
    }
    ```
    This wraps `generateChapterPrompt()` and appends dimension-specific instructions + previous sections summary.
  - Notes: The dimension checklist for Story A is hardcoded as a constant string (generic B/S web checklist).
  - **File: `src/main/services/agent-orchestrator/post-processors/terminology-post-processor.ts`** _(F4 fix)_
  - Action: Add `context.mode === 'skeleton-generate'` to the existing skip check at line 43:
    ```typescript
    if (context.mode === 'ask-system' || context.mode === 'annotation-feedback' || context.mode === 'skeleton-generate') {
      return result
    }
    ```

- [x] **Task 4: Add skeleton-generate agent handler (Phase 1)**
  - File: `src/main/services/agent-orchestrator/agents/generate-agent.ts`
  - Action: Add `handleSkeletonGenerate` function:
    1. Build `SkeletonPromptContext` from `context` fields
    2. Call `aiProxy.call()` with `SKELETON_GENERATION_SYSTEM_PROMPT` + `generateSkeletonPrompt()`, `maxTokens=2048`
    3. Parse response with `extractJsonObject<{ sections: unknown[] }>()`
    4. Validate schema: each section must have `title` (string), `level` (number between parentLevel+1 and 4), `dimensions` (string array). **Filter out sections with level > 4** _(F6 fix)_. Filter out entries missing required fields.
    5. If no valid sections remain, log warning and return `wrapResult()` with content = `JSON.stringify({ fallback: true, reason: 'LLM 返回的骨架结构无效' })`
    6. If valid, return `wrapResult()` with content = `JSON.stringify({ fallback: false, plan: { parentTitle, parentLevel, sections, dimensionChecklist, confirmedAt: '' } })`
    7. Progress: `0% analyzing → 50% skeleton-generating → 100% skeleton-ready`
  - Action: Add dispatch in `generateAgentHandler`: `if (context.mode === 'skeleton-generate') return handleSkeletonGenerate(context, signal, updateProgress, aiProxy)`
  - Notes: Handler must guard for `aiProxy` being undefined (same pattern as `handleChapterGeneration` line 304).

- [x] **Task 5: Add skeleton-batch agent handler (Phase 2+3)** _(F1, F2, F10 fixes)_
  - File: `src/main/services/agent-orchestrator/agents/generate-agent.ts`
  - Action: Add `handleSkeletonBatch` function with signature including `setCheckpoint` and `checkpoint` from extended options:
    1. Read confirmed skeleton from `context.confirmedSkeleton` (passed by service layer)
    2. If `checkpoint` exists, restore state: `completedMarkdowns` and `failedSections` from checkpoint data, skip already-completed sections
    3. Initialize tracking: `completedMarkdowns: string[]`, `failedSections: Array<{title, error}>`, `totalUsage: TokenUsage`
    4. Serial loop over remaining `confirmedSkeleton.sections`:
       a. `throwIfAborted(signal)` before each sub-chapter
       b. Build `SubChapterPromptContext` — include `dimensionFocus` from section's dimensions, `previousSectionsSummary` from truncated join of `completedMarkdowns` (max 500 chars per section, most recent 3 sections)
       c. Call `aiProxy.call()` with `GENERATE_CHAPTER_SYSTEM_PROMPT` + `generateSubChapterPrompt()`, `maxTokens=4096`
       d. On success: append to `completedMarkdowns`, call `setCheckpoint({ completedMarkdowns, failedSections })`, report progress via `updateProgress` with `SkeletonBatchProgressPayload`
       e. On failure (catch non-abort errors): record in `failedSections`, continue
    5. Assembly:
       a. Join `completedMarkdowns` with `\n\n`
       b. For failed sections, insert placeholder: `> [生成失败] {title}: {error}`
       c. Report progress `90% batch-composing`
    6. Return `wrapResult(assembledMarkdown, totalUsage, latencyMs)` — content is **always markdown**. The orchestrator's registered `terminologyPostProcessor` runs automatically on this result _(F2 fix: do NOT manually call post-processor)_. Structured metadata (completedSections, failedSections) is in the final progress payload _(F10 fix)_.
  - Action: Add dispatch: `if (context.mode === 'skeleton-batch') return handleSkeletonBatch(context, signal, updateProgress, aiProxy, setCheckpoint, checkpoint)`
  - Notes: Destructure `setCheckpoint` and `checkpoint` from options in the `generateAgentHandler` entry point, pass through.

- [x] **Task 6: Add skeleton service methods** _(F7, F8 fixes)_
  - File: `src/main/services/chapter-generation-service.ts`
  - Action: Add constant `BATCH_CHAPTER_TIMEOUT_MS = 600_000` _(F8 fix: 10 minutes for serial batch)_
  - Action: Add 3 new methods to `chapterGenerationService`:
    1. `skeletonGenerate(projectId, target)` — builds same context as `_dispatchGeneration` (requirements, scoring, document outline). Dispatches with `mode: 'skeleton-generate'`, `timeoutMs: CHAPTER_TIMEOUT_MS`. Does NOT check `isChapterEmpty()`. Returns `{ taskId }`.
    2. `skeletonConfirm(projectId, sectionId, plan)` — calls `documentService.updateMetadata(projectId, current => ({ ...current, confirmedSkeletons: { ...current.confirmedSkeletons, [sectionId]: plan } }))`. Returns `{ success: true }`.
    3. `batchGenerate(projectId, target, sectionId)` — reads `confirmedSkeletons[sectionId]` from metadata, throws `NOT_FOUND` if missing. Builds full rich context (requirements, scoring, adjacents, strategy seed, writing style). Passes `confirmedSkeleton` in agent context. Dispatches with `mode: 'skeleton-batch'`, `timeoutMs: BATCH_CHAPTER_TIMEOUT_MS`, `enableDiagrams: false`. Returns `{ taskId }`. **On task completion callback: remove `confirmedSkeletons[sectionId]` from metadata** _(F7 fix: cleanup after use)_.
  - Notes: `skeletonGenerate` reuses `_resolveSectionId()` to get sectionId for the target.

- [x] **Task 7: Register IPC channels**
  - File: `src/shared/ipc-types.ts`
  - Action: Add to `IPC_CHANNELS` enum:
    ```
    CHAPTER_SKELETON_GENERATE: 'chapter:skeleton-generate',
    CHAPTER_SKELETON_CONFIRM: 'chapter:skeleton-confirm',
    CHAPTER_BATCH_GENERATE: 'chapter:batch-generate',
    ```
    Add to `IpcChannelMap`:
    ```
    'chapter:skeleton-generate': { input: SkeletonGenerateInput; output: SkeletonGenerateOutput }
    'chapter:skeleton-confirm': { input: SkeletonConfirmInput; output: { success: true } }
    'chapter:batch-generate': { input: BatchGenerateInput; output: BatchGenerateOutput }
    ```
    Import types from `chapter-types.ts`.
  - File: `src/main/ipc/chapter-handlers.ts`
  - Action: Add 3 new handlers to `chapterHandlerMap` (the exhaustive `ChapterChannel` mapped type will require this once `IpcChannelMap` is updated):
    ```
    'chapter:skeleton-generate': () => createIpcHandler('chapter:skeleton-generate', input =>
      chapterGenerationService.skeletonGenerate(input.projectId, input.target)),
    'chapter:skeleton-confirm': () => createIpcHandler('chapter:skeleton-confirm', input =>
      chapterGenerationService.skeletonConfirm(input.projectId, input.sectionId, input.plan)),
    'chapter:batch-generate': () => createIpcHandler('chapter:batch-generate', input =>
      chapterGenerationService.batchGenerate(input.projectId, input.target, input.sectionId)),
    ```
  - File: `src/preload/index.ts`
  - Action: Add 3 new API methods following existing pattern:
    ```
    chapterSkeletonGenerate: (input) => typedInvoke(IPC_CHANNELS.CHAPTER_SKELETON_GENERATE, input),
    chapterSkeletonConfirm: (input) => typedInvoke(IPC_CHANNELS.CHAPTER_SKELETON_CONFIRM, input),
    chapterBatchGenerate: (input) => typedInvoke(IPC_CHANNELS.CHAPTER_BATCH_GENERATE, input),
    ```

- [x] **Task 8: Extend renderer hook for skeleton + batch flow** _(F5 fix)_
  - File: `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts`
  - Action: Add 3 new methods to `UseChapterGenerationReturn`:
    1. `startSkeletonGenerate(target)` — set phase `'skeleton-generating'`, `operationType: 'skeleton-generate'`, call `window.api.chapterSkeletonGenerate({ projectId, target })`, track taskId.
    2. `confirmSkeleton(target, sectionId, plan)` — call `window.api.chapterSkeletonConfirm({ projectId, sectionId, plan })`. On success, update status to `'skeleton-ready'` and store plan in `skeletonPlan` field.
    3. `startBatchGenerate(target, sectionId)` — set `operationType: 'batch-generate'`, call `window.api.chapterBatchGenerate({ projectId, target, sectionId })`, track taskId.
  - Action: Extend `progressToPhase()` to handle new messages: `'skeleton-generating'`, `'skeleton-ready'`, `'batch-generating'`, `'batch-composing'`.
  - Action: Handle skeleton-generate task completion:
    - Parse `result.content` as JSON
    - If `{ fallback: true }`: **auto-trigger `startGeneration(target)` and show toast "骨架生成失败，已切换为标准生成"** _(F5 fix: explicit fallback chain)_
    - If `{ fallback: false, plan }`: store plan in `skeletonPlan` field, set phase to `'skeleton-ready'`
  - Action: Handle batch-generate task completion:
    - Content is markdown — apply via normal `generatedContent` flow
    - Parse final progress payload for `SkeletonBatchProgressPayload` to extract `completedCount` / `failedSections` for UI display
  - Action: Extend `retry` logic: if `operationType === 'skeleton-generate'`, call `startSkeletonGenerate`; if `'batch-generate'`, call `startBatchGenerate`.
  - Notes: The `operationType` field is critical for correct retry routing _(F3 fix)_.

- [x] **Task 9: Add UI for skeleton-expand trigger + preview** _(F9 fix)_
  - File: `src/renderer/src/modules/editor/components/EditorView.tsx` (or the specific chapter toolbar component)
  - Action: Add a "分治生成" button next to the existing "生成" button on chapter headings (level 1 or 2 only). The button:
    1. **If chapter has existing content**: show Ant Design `Modal.confirm` dialog "该章节已有内容，分治生成将替换现有内容，是否继续？" _(F9 fix: overwrite confirmation)_
    2. Calls `startSkeletonGenerate(target)` on confirmation
    3. When status reaches `'skeleton-ready'`, shows a modal with:
       - Read-only `<List>` of planned sub-sections (title + `<Tag>` for each dimension)
       - "确认并生成" button → calls `confirmSkeleton()` then `startBatchGenerate()`
       - "重新生成骨架" button → calls `startSkeletonGenerate()` again
    4. During `'batch-generating'` phase, shows progress: "已完成 3/10 子章节" (from `SkeletonBatchProgressPayload`)
    5. On completion, normal flow (content inserted into editor, conflict detection)
  - Notes: UI tooltip on button: "适用于包含多个功能模块的复合型章节". Use Ant Design `Modal`, `List`, `Tag`, `Progress` components.

- [x] **Task 10: Write unit tests for AgentHandler checkpoint extension**
  - File: `tests/unit/main/services/agent-orchestrator/orchestrator.test.ts` (or extend existing)
  - Action: Verify that `createExecutor` forwards `setCheckpoint` and `checkpoint` to the agent handler. Mock a handler that accesses `options.setCheckpoint`, verify it receives the function from TaskExecutorContext.

- [x] **Task 11: Write unit tests for skeleton-generate handler**
  - File: `tests/unit/main/services/agent-orchestrator/agents/generate-agent.skeleton.test.ts`
  - Action: Test `handleSkeletonGenerate` via `generateAgentHandler` with `context.mode = 'skeleton-generate'`:
    - Given valid context, when LLM returns valid skeleton JSON, then handler returns `wrapResult` with `{ fallback: false, plan: {...} }`
    - Given valid context, when LLM returns malformed JSON, then handler returns `wrapResult` with `{ fallback: true }`
    - Given LLM returns sections with level > 4, then those sections are filtered out _(F6 validation)_
    - Given signal is aborted, then handler throws abort error

- [x] **Task 12: Write unit tests for skeleton-batch handler**
  - File: `tests/unit/main/services/agent-orchestrator/agents/generate-agent.batch.test.ts`
  - Action: Test `handleSkeletonBatch`:
    - Given 3 sections, when all succeed, then returns assembled markdown with all sections joined
    - Given 3 sections, when 1 fails, then returns partial markdown with failure placeholder, no throw
    - Given context chaining, when generating section 2, then prompt includes summary of section 1
    - Given signal is aborted mid-generation, then handler throws abort error
    - Given checkpoint from previous partial run, then resumes from where it left off
    - Verify `setCheckpoint` is called after each successful section

- [x] **Task 13: Write unit tests for skeleton prompt generation**
  - File: `tests/unit/main/prompts/generate-chapter.prompt.test.ts`
  - Action: Add test suite for `generateSkeletonPrompt()` and `generateSubChapterPrompt()`:
    - Given chapter title and requirements, when generating skeleton prompt, then output contains dimension checklist and JSON output instructions
    - Given sub-chapter with dimensionFocus and previousSectionsSummary, when generating, then output contains both
    - Given sub-chapter without previousSectionsSummary (first section), then output omits that block

- [x] **Task 14: Write unit tests for useChapterGeneration skeleton extensions** _(F11 fix)_
  - File: `tests/unit/renderer/modules/editor/hooks/useChapterGeneration.test.ts`
  - Action: Add test cases for:
    - `startSkeletonGenerate` sets correct initial status with `operationType: 'skeleton-generate'`
    - Skeleton-generate completion with valid plan updates status to `'skeleton-ready'` with `skeletonPlan`
    - Skeleton-generate completion with `{ fallback: true }` auto-triggers `startGeneration` _(F5 fallback chain)_
    - `confirmSkeleton` calls IPC and updates phase to `'skeleton-ready'`
    - `startBatchGenerate` sets correct initial status with `operationType: 'batch-generate'`
    - `retry` routes correctly based on `operationType`

- [x] **Task 15: Write integration test for chapter-generation-service skeleton flow**
  - File: `tests/unit/main/services/chapter-generation-service.skeleton.test.ts`
  - Action: Test `skeletonConfirm` and `batchGenerate` service methods:
    - Given valid plan, when skeletonConfirm called, then plan is persisted to metadata `confirmedSkeletons[sectionId]`
    - Given sectionId with no confirmed skeleton, when batchGenerate called, then throws NOT_FOUND
    - Given confirmed skeleton exists, when batchGenerate called, then dispatches with `mode: 'skeleton-batch'`, `timeoutMs: 600_000`, and `confirmedSkeleton` in context

- [x] **Task 16: Write unit test for terminologyPostProcessor skip**
  - File: `tests/unit/main/services/agent-orchestrator/post-processors/terminology-post-processor.test.ts` (extend existing)
  - Action: Given `context.mode = 'skeleton-generate'`, when post-processor runs, then returns result unchanged (skip processing)

### Acceptance Criteria

- [x] AC 1: Given a user on a level 1-2 chapter heading, when they click "分治生成", then an async task starts and the UI shows "skeleton-generating" phase with a spinner.

- [x] AC 2: Given the skeleton-generate task completes successfully, when the LLM returns valid JSON with 3+ sections, then the UI displays a read-only skeleton preview modal listing all planned sub-sections with their dimension tags.

- [x] AC 3: Given the skeleton-generate task completes, when the LLM returns invalid/unparseable JSON, then the system gracefully falls back to standard single-shot chapter generation, shows a brief toast notification, and no error modal is displayed.

- [x] AC 4: Given the skeleton preview is displayed, when the user clicks "确认并生成", then the skeleton plan is persisted to `proposal.meta.json` under `confirmedSkeletons[sectionId]` AND a batch-generate task starts.

- [x] AC 5: Given batch generation is running with 5 sub-sections, when 3 have completed, then the UI shows progress "已完成 3/5 子章节" and the `batch-generating` phase.

- [x] AC 6: Given batch generation completes with all sections successful, when the assembled markdown is returned, then it is inserted as a complete block replacing the parent chapter's body content, conflict detection (baselineDigest) works correctly, and the `confirmedSkeletons` entry is cleaned up from metadata.

- [x] AC 7: Given batch generation with 5 sections where 2 fail, then the result contains assembled markdown for 3 successful sections + failure placeholders for 2 failed sections, and the UI shows "完成 3/5，失败 2/5".

- [x] AC 8: Given sub-chapter 3 is being generated, when its prompt is constructed, then it includes a truncated summary (max 500 chars) of sub-chapters 1 and 2 in the `previousSectionsSummary` field.

- [x] AC 9: Given the user clicks "重新生成骨架" on the skeleton preview, when a new skeleton-generate task completes, then the preview updates with the new skeleton plan.

- [x] AC 10: Given a batch-generate task is running, when the user triggers abort, then the task is cancelled at the next sub-chapter boundary and already-generated content is preserved in checkpoint.

- [x] AC 11: Given the renderer crashes after skeleton confirmation, when the user reopens the project, then the confirmed skeleton is still available in `proposal.meta.json`.

- [x] AC 12: Given a chapter with existing content, when the user clicks "分治生成", then a confirmation dialog appears warning that existing content will be replaced.

- [x] AC 13: Given a `skeleton-generate` task completes, when `terminologyPostProcessor` is called, then it skips processing (returns content unchanged) because `context.mode === 'skeleton-generate'`.

## Additional Context

### Dependencies

- **No new external libraries required.** All functionality builds on existing infrastructure:
  - `llm-json.ts` for JSON parsing
  - `task-queue` for async execution + checkpoint
  - `documentService.updateMetadata()` for skeleton persistence
  - `terminologyPostProcessor` for automatic post-processing (orchestrator-managed)
  - Ant Design `Modal`, `List`, `Tag`, `Progress` for skeleton preview UI

- **Depends on existing features:**
  - `traceabilityLinkRepo.findBySection()` for per-section requirement filtering (Story 2.8)
  - `documentService.getMetadata()` for reading confirmed skeletons
  - Task progress event system (`onTaskProgress`)

### Testing Strategy

**Unit Tests (Tasks 10-16):**
- Orchestrator checkpoint forwarding (Task 10)
- Skeleton-generate handler: JSON parsing, validation, level filtering, fallback (Task 11)
- Skeleton-batch handler: serial generation, context chaining, error isolation, checkpoint, resume, assembly (Task 12)
- Prompt generation: correct structure, dimension injection, previous sections summary (Task 13)
- Frontend hook: new methods, phase handling, fallback chain, retry routing (Task 14)
- Service layer: metadata persistence, skeleton retrieval, error cases (Task 15)
- Post-processor skip: skeleton-generate mode bypass (Task 16)

**Manual Testing:**
1. Trigger "分治生成" on a detailed design chapter → verify skeleton preview appears
2. Confirm skeleton → verify batch generation starts, progress updates show "已完成 N/M 子章节"
3. After completion → verify assembled markdown is correct, sub-headings present, content coherent
4. Test fallback: mock LLM to return invalid JSON → verify auto-fallback to single-shot with toast
5. Test partial failure: mock one aiProxy.call to throw → verify other sections still generated
6. Test cancel: abort during batch generation → verify clean cancellation
7. Test crash recovery: confirm skeleton, kill renderer, reopen → verify skeleton still in metadata
8. Test overwrite confirmation: trigger "分治生成" on chapter with content → verify dialog appears
9. Test checkpoint resume: interrupt batch generation, restart → verify it resumes from checkpoint

### Notes

**High-risk items:**
- LLM skeleton JSON quality varies across providers (Claude vs OpenAI vs MiniMax). Schema validation + fallback is critical. Consider structured output / JSON mode if provider supports it.
- Serial generation is slower than single-shot for simple chapters. Button tooltip: "适用于包含多个功能模块的复合型章节".
- Context chaining summary truncation (500 chars) may lose details for later sub-chapters. Monitor quality and adjust.
- `BATCH_CHAPTER_TIMEOUT_MS = 600_000` assumes max ~10 sub-chapters at ~40s each. May need adjustment for very large chapters.

**Future considerations (Story B/C):**
- Story B: Multiple paradigm templates loaded from `resources/templates/paradigms/`. LLM pre-analysis to auto-select paradigm. `project_profiles` DB table.
- Story C: Tree editor for skeleton editing (dnd-kit). Parallel generation with `runWithConcurrency(sections, 4, worker)`. Per-sub-chapter retry UI with checkpoint resume.
- Cost estimation in skeleton preview: estimated token count and API cost before user confirms.
