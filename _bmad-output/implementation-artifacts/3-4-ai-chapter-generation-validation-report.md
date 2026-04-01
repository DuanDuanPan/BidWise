# Story 3.4 Validation Report

日期：2026-04-01
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）
目标文档：`_bmad-output/implementation-artifacts/3-4-ai-chapter-generation.md`

已核对工件：
- `_bmad/bmm/config.yaml`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/3-3-template-driven-proposal-skeleton.md`
- `_bmad-output/implementation-artifacts/3-3-template-driven-proposal-skeleton-validation-report.md`
- `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-validation-report.md`
- `_bmad-output/implementation-artifacts/3-4-ai-chapter-generation.md`
- `_bmad-output/implementation-artifacts/3-4-ai-chapter-generation-ux/ux-spec.md`
- `_bmad-output/implementation-artifacts/3-4-ai-chapter-generation-ux/prototype.manifest.yaml`
- `_bmad-output/implementation-artifacts/3-4-ai-chapter-generation-ux/exports/0D5kp.png`
- `_bmad-output/implementation-artifacts/3-4-ai-chapter-generation-ux/exports/AZ9bb.png`
- `_bmad-output/implementation-artifacts/3-4-ai-chapter-generation-ux/exports/ElQ7O.png`
- `_bmad-output/implementation-artifacts/3-4-ai-chapter-generation-ux/exports/WcNXo.png`
- `_bmad-output/implementation-artifacts/3-4-ai-chapter-generation-ux/exports/p5RRC.png`
- `_bmad-output/implementation-artifacts/3-4-ai-chapter-generation-ux/exports/qZz9d.png`
- `_bmad-output/implementation-artifacts/3-4-ai-chapter-generation-ux/prototype.pen`
- `src/shared/ipc-types.ts`
- `src/shared/ai-types.ts`
- `src/shared/analysis-types.ts`
- `src/shared/template-types.ts`
- `src/shared/models/proposal.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/main/ipc/index.ts`
- `src/main/ipc/agent-handlers.ts`
- `src/main/ipc/document-handlers.ts`
- `src/main/ipc/template-handlers.ts`
- `src/main/services/agent-orchestrator/orchestrator.ts`
- `src/main/services/agent-orchestrator/agents/generate-agent.ts`
- `src/main/services/task-queue/queue.ts`
- `src/main/services/ai-proxy/provider-adapter.ts`
- `src/main/services/document-service.ts`
- `src/main/services/project-service.ts`
- `src/main/services/template-service.ts`
- `src/main/services/document-parser/scoring-extractor.ts`
- `src/main/services/document-parser/mandatory-item-detector.ts`
- `src/main/prompts/generate-chapter.prompt.ts`
- `src/renderer/src/stores/documentStore.ts`
- `src/renderer/src/modules/editor/components/EditorView.tsx`
- `src/renderer/src/modules/editor/components/PlateEditor.tsx`
- `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx`
- `src/renderer/src/modules/editor/components/DocumentOutlineTree.tsx`
- `src/renderer/src/modules/editor/hooks/useDocumentOutline.ts`
- `src/renderer/src/modules/editor/lib/scrollToHeading.ts`
- `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
- `src/renderer/src/modules/project/components/AnnotationPanel.tsx`
- `tests/unit/main/services/agent-orchestrator/orchestrator.test.ts`
- `tests/unit/main/services/task-queue/queue.test.ts`
- `tests/unit/renderer/modules/editor/components/EditorView.test.tsx`
- `tests/unit/renderer/modules/editor/components/PlateEditor.test.tsx`
- `tests/unit/renderer/modules/editor/components/DocumentOutlineTree.test.tsx`
- `tests/unit/renderer/project/ProjectWorkspace.test.tsx`

`.pen` 核对说明：已按要求遵循 Lookup Order，先读 story 设计说明，再读 manifest，再查看 6 张 PNG 导出做视觉语义比对，最后通过 Pencil MCP 打开 `prototype.pen` 并读取 6 个 Screen 的结构节点，确认交互状态与文档修订一致。

结果: PASS

## 摘要

本次按 `validate-create-story` 工作流重新执行了 Story 3.4 的实现就绪性校验，并把所有可安全修复的 story-spec 问题直接修正到了故事文件与直接相关 UX spec 中。修订后，Story 3.4 已与当前仓库的真实 heading 定位机制、任务队列/重试边界、编辑器插入方式、任务恢复能力以及 UX 原型状态机对齐，可作为实现输入继续推进。

## 发现的关键问题

None

## 已应用增强

- 把章节定位从不真实的 `sectionId` 方案改为基于当前 Markdown 的 `title + level + occurrenceIndex` heading locator，避免 Story 3.3 产出的纯 Markdown 骨架无法被稳定寻址。
- 明确“空章节”判定必须兼容 Story 3.3 写入的 guidance blockquote，占位型章节可显示 `AI 生成`，防止按钮永远不出现。
- 修正章节写回路径，要求由 `PlateEditor` 暴露 imperative section replacement API，在编辑器内部完成 AST 区间替换与 canonical Markdown flush，而不是在 `EditorView` 外部拼接 Slate 变换。
- 补齐同章编辑冲突处理，要求生成任务记录 `baselineDigest`，完成时若章节被人工改动则进入显式覆盖确认，默认保留人工内容。
- 收紧重试语义，明确 `provider-adapter` 的 3 次自动重试是唯一自动重试边界；故事已要求扩展 `AgentExecuteOptions.maxRetries` 并在章节生成时显式传 `0`，避免与 task-queue 默认重试叠加。
- 补齐超时语义，明确 `timeoutMs=120000` 必须同时作用于 task-queue 执行窗口和内部 `aiProxy.call()`，避免“只限制 provider 请求、不限制整任务”的实现偏差。
- 修正 prompt/上下文来源，明确需求与评分模型来自 `scoringExtractor`，必响应项来自 `mandatoryItemDetector`，`seed.json` 为可选输入，缺失时必须无错误降级。
- 将章节生成状态提升到 `proposal-writing` 工作区作用域，供 `DocumentOutlineTree`、`EditorView` 和 `AnnotationPanel` 轻量摘要共享，避免新建全局 Zustand store。
- 明确任务恢复只针对当前项目：通过 `taskList({ category: 'ai-agent', agentType: 'generate' })` 拉取后，再按 `task.status` 和 `task.input.projectId` 过滤当前项目 active 任务。
- 将 UX 原型中的未来态与本 Story 交付边界剥离，明确 Screen 3 的 AI 建议卡、评分预警卡和来源标签不属于 Story 3.4 gate；本 Story 的右侧栏仅交付轻量级生成摘要。
- 扩展测试清单，补充 `maxRetries/timeoutMs` 透传、仅恢复当前项目任务、章节冲突确认、outline 状态图标、PlateEditor imperative API 和重新进入工作区后的任务恢复等关键覆盖点。

## 剩余风险

None

## 最终结论

经本轮 `validate-create-story` 复核与原位修正后，Story 3.4 已不存在剩余的可执行阻塞项。当前 story 文件、直接相关 UX 规格、Epic/PRD/架构约束及代码库真实契约已经完成必要对齐，结论为 **PASS**。
