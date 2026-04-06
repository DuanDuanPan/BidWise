# Story 3.5 Validation Report

结果: PASS

## 摘要

本次按 `validate-create-story` 工作流重跑了 Story 3.5 的 implementation-readiness 校验，并将所有可安全修复的问题直接回写到 story 文件与同目录 UX spec。修订后，Story 3.5 已与当前仓库真实的 `agent-orchestrator` 注册入口、`orchestrator` 进度行为、`documentService` sidecar 保留逻辑、`template-service` 的 `company-data` 双路径解析模式、`EditorView` 的章节替换时机，以及 3.5 UX 原型中的四个关键状态完成对齐。

## 发现的关键问题

None

## 已应用增强

- 补回了 create-story 模板要求的 validation note，并新增 `Change Log`，恢复 story 模板一致性。
- 修正了错误的实现契约：新 agent 应注册在 [`src/main/services/agent-orchestrator/index.ts`](/Users/enjoyjavapan163.com/Public/SyncForAll/Doc/BidWise/src/main/services/agent-orchestrator/index.ts)，而不是误写为仅在 [`src/main/services/agent-orchestrator/orchestrator.ts`](/Users/enjoyjavapan163.com/Public/SyncForAll/Doc/BidWise/src/main/services/agent-orchestrator/orchestrator.ts) 注册。
- 修正了“来源标注 task 只返回 inner agent taskId、但无人解析并写回 sidecar”的断点，改为明确 outer task 负责轮询、解析 JSON、调用 `documentService.updateMetadata()` 持久化。
- 将 sidecar 并发写入风险收敛为明确契约：Story 3.5 现在要求扩展 [`src/main/services/document-service.ts`](/Users/enjoyjavapan163.com/Public/SyncForAll/Doc/BidWise/src/main/services/document-service.ts) 的 `updateMetadata()`，避免 attribution / baseline 两条任务互相覆盖。
- 为 `sourceAttributions` / `baselineValidations` 补齐 `paragraphDigest` / `claimDigest`，使“已编辑”状态和 mismatch 失效逻辑可实现且可跨刷新保持。
- 修正了错误触发点：自动 attribution 不能挂在 `OutlineHeadingElement` 或抽象“完成回调”上，而应在 [`src/renderer/src/modules/editor/components/EditorView.tsx`](/Users/enjoyjavapan163.com/Public/SyncForAll/Doc/BidWise/src/renderer/src/modules/editor/components/EditorView.tsx) 中 `replaceSectionContent()` 真正成功后触发。
- 将 renderer 侧状态跟踪改为 outer task 语义，明确使用 `onTaskProgress + taskGetStatus()`，而不是错误复用 `agentStatus()`。
- 明确了 baseline 文件解析约定：采用 [`src/main/services/template-service.ts`](/Users/enjoyjavapan163.com/Public/SyncForAll/Doc/BidWise/src/main/services/template-service.ts) 同款双路径搜索，按 `{proposalType}.md|json` → `default.md|json` 查找；无文件时走 skipped 语义且不阻塞流程。
- 补齐了实现所需的共享契约与文件落点：`AgentType` 扩展、`source:*` IPC 类型、`SourceAttributionContext`、`editorPlugins.ts` / `PlateEditor.tsx` 渲染接入点、`tests/unit/preload/security.test.ts` 与 baseline fixture。
- 修正了 UX 说明与真实代码边界的冲突：Story 3.4 的 `ChapterGenerationPhase` 保持四个核心阶段不破坏性改名，Screen 4 的第五步“基线验证”改为视觉槽位/secondary note，而不是强行重写既有共享 phase enum。

## 剩余风险

- 当前仓库快照中 `company-data/baselines` 尚不存在；按修订后的 story，这不会阻塞实现或运行，只会使基线验证走 skipped 路径，待公司级数据仓库补充基线文件后自动启用。
- 真实资产语义搜索与知识图谱查询仍属于后续 Epic 范围；Story 3.5 的 Alpha 版本只要求 AI 基于显式上下文推断来源类型，这一边界已在 story 中明确。

## 最终结论

经本轮 `validate-create-story` 复核与原位修正后，Story 3.5 已无剩余的可执行阻塞项。当前 story、同目录 UX 规格、前置 Story 3.4 的真实实现边界、以及仓库中的 main/preload/renderer 现状已完成必要对齐，结论为 **PASS**。
