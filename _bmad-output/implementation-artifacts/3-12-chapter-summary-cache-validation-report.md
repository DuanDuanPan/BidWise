# Story 3.12 Validation Report

日期：2026-04-17  
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）

## 校验范围

本次校验按 `validate-create-story` 工作流执行。复核范围覆盖：

- `.agents/skills/bmad-create-story/workflow.md`
- `.agents/skills/bmad-create-story/checklist.md`
- `_bmad-output/implementation-artifacts/3-12-chapter-summary-cache.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/3-4-ai-chapter-generation.md`
- `_bmad-output/implementation-artifacts/3-5-source-attribution-baseline-validation.md`
- `_bmad-output/implementation-artifacts/story-3-11-batch-subchapter-retry-recovery.md`
- 当前代码基线：
  - `src/main/services/chapter-generation-service.ts`
  - `src/main/prompts/generate-chapter.prompt.ts`
  - `src/main/services/agent-orchestrator/agents/generate-agent.ts`
  - `src/main/services/agent-orchestrator/index.ts`
  - `src/main/services/agent-orchestrator/orchestrator.ts`
  - `src/shared/ai-types.ts`
  - `src/shared/ipc-types.ts`
  - `src/shared/chapter-markdown.ts`
  - `src/shared/chapter-locator-key.ts`
  - `src/preload/index.ts`
  - `src/main/ipc/chapter-handlers.ts`
  - `src/renderer/src/modules/editor/components/EditorView.tsx`
  - `src/main/services/task-queue/queue.ts`
- 近期 git 记录：
  - `d226eee feat: add retry button for failed diagram generation in chapter pipeline`
  - `82309aa feat: route ai diagram generation through enhanced skill pipeline`
  - `eac8233 feat: switch chapter diagram generation to skill-first with SVG quality gate (Story 3-10)`

## 发现并已修复的问题

### 1. 单章节摘要触发点写在了错误位置

原 Story 把单章节 summary 提炼挂在 `chapter-generation-service` finalize。当前真实单章节写回发生在 renderer 的 `EditorView`，并且 `sourceAttr.triggerAttribution()` 与 `triggerBaselineValidation()` 已经在这里串联 post-write 行为。

已修复：

- 单章节触发点改为 `EditorView` 中 `replaceSectionRef.current(...)` 成功后 fire-and-forget 调用 `chapter-summary:extract`
- 批量子章节触发点单独定义为 `chapter-generation-service._onBatchSectionDone()`

### 2. AI 调用路径绕开了仓库要求的 `agent-orchestrator`

原 Story 把 summary 任务写成 direct `aiProxy.call`。仓库规则要求所有 AI 调用走 `agent-orchestrator`。

已修复：

- 引入新 `agentType = 'chapter-summary'`
- Story 明确通过 agent handler + post-processor 完成 prompt、解析、sidecar 持久化

### 3. Task Queue 与 agent contract 写法和现有类型系统不一致

原 Story 设计了 `chapter-summary:extract` 任务类型，却没有对齐当前 `TaskCategory = 'ai-agent'` 和 `AgentType` 联动注册方式。

已修复：

- summary 执行路径统一为 `category='ai-agent'`
- 在 Story 中明确扩展 `AgentType`
- `maxRetries=2`、`timeoutMs=60_000` 保持在现有 queue/orchestrator 语义下落地

### 4. Provider 能力表述超出了当前配置面

原 Story 直接枚举 Anthropic / OpenAI / Qwen / DeepSeek / Moonshot 作为一等 provider。当前共享类型 `AiProviderName` 只有 `claude | openai`。

已修复：

- AC6 改为对齐现有 provider 槽位：`claude` / `openai`
- Qwen / DeepSeek / Moonshot 改为通过 `provider='openai' + baseUrl` 承载

### 5. Sidecar identity 与 hash 规则会在重复标题场景中冲突

原 Story 的 summary schema 只有 `headingTitle + headingLevel + lineHash`。文档里存在同名同级章节时，这组字段无法稳定定位单个章节。

已修复：

- 加入 `headingKey = createChapterLocatorKey(locator)`
- 显式保留 `occurrenceIndex`
- `lineHash` 改为复用 `createContentDigest(直属正文)`

### 6. “直属正文”概念缺少可复用 helper，读写两侧会各写一套切片逻辑

原 Story 直接要求对“该 heading 直接文本段”做 hash 和摘要。当前共享模块里只有整段 section 提取，尚无直属正文 helper。

已修复：

- 在 Story tasks 中加入 `src/shared/chapter-markdown.ts` 的直属正文 helper
- digest、fallback summary、空章节判断统一复用该 helper

### 7. 上下文构建规则遗漏了 cache miss 的 fallback 和跨枝分组

原 Story 的 AC4 只枚举 lineHash 命中的 sidecar summary，并且只保留 `ancestors / siblings / descendants` 三组。这样会让跨枝已生成章节失去入口，也会让 hash 失配章节完全消失。

已修复：

- 枚举对象改成“直属正文非空章节”
- 读取策略改成“命中 cache 用 summary，cache miss 用直属正文 500 字截断”
- 分组统一为 `ancestors / siblings / descendants / others`

### 8. `model / provider` 持久化与 IPC / preload 测试面缺口未被写进 Story

原 Story 要求 sidecar 持久化 `model / provider`，同时又缺少对 `AgentExecuteResult`、orchestrator 序列化、IPC/preload/renderer 触发面的任务与测试要求。

已修复：

- 在 Task 2 中显式扩展 `AgentExecuteResult`
- 在 Task 3 和 Task 6 中补入 `chapter-summary:extract` 的 shared types、IPC handler、preload、EditorView 与相应测试

### 9. 参考工件路径与文件范围存在偏差

原 Story 引用了 `_bmad-output/implementation-artifacts/3-11-batch-subchapter-retry-recovery.md`，当前真实文件是 `story-3-11-batch-subchapter-retry-recovery.md`。同时原稿把 renderer 端写成“无改动”，这与真实单章节触发点相冲突。

已修复：

- References 改为真实 story 文件路径
- `Project Structure Notes` 明确纳入 renderer / preload / IPC 变更

## 已修改工件

- `_bmad-output/implementation-artifacts/3-12-chapter-summary-cache.md`

## 结果

经本轮 `validate-create-story` 复核与原位修订后，Story 3.12 已与以下事实完成必要对齐：

- 当前章节生成的真实写回位置：单章节在 `EditorView`，批量子章节在 `_onBatchSectionDone()`
- 仓库级 AI 调用规则：统一走 `agent-orchestrator`
- 当前 provider / task / agent / IPC 类型契约
- 当前摘要可复用基础设施：`createContentDigest()`、`createChapterLocatorKey()`
- 当前 prompt 与上下文构建边界：相邻章节摘要、skeleton-expand prompt、空库降级路径

本次校验后，Story 3.12 具备进入 `dev-story` 的实现清晰度，结论为 **PASS**。

## 备注

- 本次仅进行了 story-spec 修订，没有运行代码测试。
