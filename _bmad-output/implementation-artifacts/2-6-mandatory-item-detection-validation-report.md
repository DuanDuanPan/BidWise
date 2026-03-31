# Story 2.6 Validation Report

日期：2026-03-31
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）
目标文档：`_bmad-output/implementation-artifacts/2-6-mandatory-item-detection.md`

已核对工件：
- `_bmad/bmm/config.yaml`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/2-3-tender-import-async-parsing.md`
- `_bmad-output/implementation-artifacts/story-2-5.md`
- `src/shared/analysis-types.ts`
- `src/shared/ipc-types.ts`
- `src/shared/constants.ts`
- `src/shared/ai-types.ts`
- `src/main/utils/errors.ts`
- `src/main/ipc/create-handler.ts`
- `src/main/ipc/analysis-handlers.ts`
- `src/main/services/task-queue/queue.ts`
- `src/main/services/document-parser/index.ts`
- `src/main/services/document-parser/scoring-extractor.ts`
- `src/main/services/agent-orchestrator/orchestrator.ts`
- `src/main/services/agent-orchestrator/agents/extract-agent.ts`
- `src/main/services/agent-orchestrator/agents/parse-agent.ts`
- `src/main/db/schema.ts`
- `src/main/db/index.ts`
- `src/main/db/repositories/index.ts`
- `src/main/db/repositories/requirement-repo.ts`
- `src/main/db/migrator.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/stores/analysisStore.ts`
- `src/renderer/src/stores/index.ts`
- `src/renderer/src/modules/analysis/components/AnalysisView.tsx`
- `src/renderer/src/modules/analysis/components/RequirementsList.tsx`
- `src/renderer/src/modules/analysis/hooks/useAnalysis.ts`
- `tests/unit/main/ipc/analysis-handlers.test.ts`
- `tests/unit/main/db/migrations.test.ts`
- `tests/unit/main/services/document-parser/scoring-extractor.test.ts`
- `tests/e2e/stories/story-2-5-requirements-scoring.spec.ts`
- `_bmad-output/implementation-artifacts/2-6-mandatory-item-detection-ux/prototype.manifest.yaml`
- `_bmad-output/implementation-artifacts/2-6-mandatory-item-detection-ux/ux-spec.md`
- `_bmad-output/implementation-artifacts/2-6-mandatory-item-detection-ux/exports/BsUfi.png`
- `_bmad-output/implementation-artifacts/2-6-mandatory-item-detection-ux/exports/RsiE0.png`
- `_bmad-output/implementation-artifacts/2-6-mandatory-item-detection-ux/exports/wIkDw.png`
- `_bmad-output/implementation-artifacts/2-6-mandatory-item-detection-ux/prototype.pen`
- `_bmad-output/implementation-artifacts/2-6-mandatory-item-detection-ux/prototype.snapshot.json`

`.pen` 核对说明：
- 已按用户给定顺序读取 story design notes、manifest、3 张 PNG 导出。
- Pencil MCP 连接运行中的 App 失败，因此改为直接读取 UTF-8 文本格式的 `prototype.pen` 与 `prototype.snapshot.json`。
- 已核对 frame / node 文案与导出图一致：
  - `Screen A — Empty State`
  - `Screen B — Detection Complete`
  - `Screen C — All Items Reviewed`

结果：PASS

## 摘要

本次按 `validate-create-story` 工作流重跑了 Story 2.6 的实现就绪性校验，并在 story 文件与直接相关 UX spec 中原位修复了所有可安全消除的阻塞项。修正后，文档已与当前仓库真实的 `agentOrchestrator` / `task-queue` / IPC / store 契约、Story 2.3/2.5 已落地的数据路径、以及 UX 原型中的空态/结果态结构对齐。

## 发现的关键问题

None

## 已应用增强

- 修正 AI 调用链：
  - 删除了错误的 `agentType: 'parse'` 和不存在的 `retries` 选项。
  - 明确改为复用现有 `extract-agent`，通过 `context.mode = 'mandatory-items'` 选择新 prompt。
  - 补充了必须修改 `src/main/services/agent-orchestrator/agents/extract-agent.ts` 的任务，避免 story 漏掉关键胶水层。
- 修正持久化路径与快照契约：
  - 删除了错误的 `data/projects/{id}/mandatory-items.json` 描述。
  - 明确统一写入 `{rootPath}/tender/mandatory-items.json`，与 `tender-parsed.json` / `scoring-model.json` 保持同目录。
  - 新增 `MandatoryItemsSnapshot` 契约，并要求 `detect()` / `updateItem()` / `addItem()` 都回写快照。
- 修正“未执行检测”和“检测完成但 0 项”的语义缺口：
  - 把 `mandatoryItems` 明确为 `MandatoryItem[] | null`。
  - 要求 `analysis:get-mandatory-items` / `analysis:get-mandatory-summary` 返回 `null` 或零结果摘要，以支撑 UI 正确区分两类空态。
  - UX spec 新增 Zero Result State，并同步更新组件空态要求与测试用例。
- 修正 store / task monitor 契约：
  - 补齐 `mandatoryDetectionMessage`、`mandatoryDetectionError`。
  - 明确扩展 `findAnalysisProjectIdByTaskId()` 和 `TaskKind = 'mandatory'`，防止 `useAnalysisTaskMonitor()` 丢失第三类任务。
  - 要求 `RequirementsList` 通过显式 prop 接收 mandatory 关联结果，而不是组件内部直接读 store。
- 修正实现范围与 UX 边界：
  - 将“自动链式触发检测”降级为可选增强项，不再作为默认实现路径。
  - 明确本 Story 以 `*项检测` Tab 内手动触发为准，和 PNG/`.pen` 原型保持一致。
  - 明确 `MandatoryItemsBadge` 在本 Story 仅用于 tab label，状态栏集成延后到后续合规/仪表盘 story。
- 补齐容易遗漏的代码接线与测试要求：
  - 新增 `src/main/db/migrator.ts` 和 `src/main/db/repositories/index.ts` 的修改要求，避免迁移文件写了但不会执行。
  - 新增 `ErrorCode.MANDATORY_DETECTION_FAILED`。
  - 增补 `extract-agent` 分支测试、migration 注册测试、analysis IPC 测试、`useAnalysisTaskMonitor` 测试，以及 Story 2.6 的 E2E 场景。
- 修正不存在的复用点描述：
  - 删除了不存在的 `getTenderParsedPath()` 路径工具引用。
  - 改为明确复用当前代码里实际存在的 `path.join(project.rootPath, 'tender', ...)` 目录约定。

## 剩余风险

None

## 最终结论

经本轮 `validate-create-story` 复核与原位修正后，Story 2.6 已无剩余的可执行阻塞项。当前 story、直接相关 UX spec、Story 2.3/2.5 的数据契约、以及现有主进程/渲染进程实现边界已完成必要对齐，结论为 **PASS**。
