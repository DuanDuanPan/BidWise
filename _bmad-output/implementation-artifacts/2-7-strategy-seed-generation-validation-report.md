# Story 2.7 Validation Report

日期：2026-04-01
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）
目标文档：`_bmad-output/implementation-artifacts/2-7-strategy-seed-generation.md`

已核对工件：
- `_bmad/bmm/config.yaml`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/workflow.md`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/checklist.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/2-6-mandatory-item-detection.md`
- `_bmad-output/implementation-artifacts/3-4-ai-chapter-generation.md`
- `src/shared/analysis-types.ts`
- `src/shared/ipc-types.ts`
- `src/shared/ai-types.ts`
- `src/shared/constants.ts`
- `src/main/ipc/create-handler.ts`
- `src/main/ipc/analysis-handlers.ts`
- `src/main/ipc/index.ts`
- `src/main/services/agent-orchestrator/index.ts`
- `src/main/services/agent-orchestrator/orchestrator.ts`
- `src/main/services/agent-orchestrator/agents/extract-agent.ts`
- `src/main/services/agent-orchestrator/agents/generate-agent.ts`
- `src/main/services/document-parser/index.ts`
- `src/main/services/document-parser/scoring-extractor.ts`
- `src/main/services/document-parser/mandatory-item-detector.ts`
- `src/main/services/project-service.ts`
- `src/main/services/task-queue/queue.ts`
- `src/main/prompts/index.ts`
- `src/main/prompts/extract-requirements.prompt.ts`
- `src/main/prompts/detect-mandatory.prompt.ts`
- `src/main/db/schema.ts`
- `src/main/db/migrator.ts`
- `src/main/db/repositories/index.ts`
- `src/main/db/repositories/mandatory-item-repo.ts`
- `src/main/db/repositories/task-repo.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/stores/analysisStore.ts`
- `src/renderer/src/modules/analysis/hooks/useAnalysis.ts`
- `src/renderer/src/modules/analysis/components/AnalysisView.tsx`
- `src/renderer/src/modules/analysis/components/MandatoryItemsList.tsx`
- `src/renderer/src/modules/analysis/components/TenderUploadZone.tsx`
- `src/renderer/src/modules/project/components/ProjectCreateModal.tsx`
- `src/renderer/src/modules/project/components/ProjectEditModal.tsx`
- `tests/unit/main/ipc/analysis-handlers.test.ts`
- `tests/unit/main/db/migrations.test.ts`
- `tests/unit/main/services/document-parser/mandatory-item-detector.test.ts`
- `tests/unit/main/services/document-parser/scoring-extractor.test.ts`
- `tests/unit/main/services/agent-orchestrator/agents/extract-agent.test.ts`
- `tests/unit/main/prompts/extract-requirements.prompt.test.ts`
- `tests/unit/renderer/analysis/MandatoryItemsList.test.tsx`
- `tests/unit/renderer/analysis/useAnalysisTaskMonitor.test.tsx`
- `tests/unit/renderer/stores/analysisStore.test.ts`
- `_bmad-output/implementation-artifacts/2-7-strategy-seed-generation-ux/prototype.manifest.yaml`
- `_bmad-output/implementation-artifacts/2-7-strategy-seed-generation-ux/ux-spec.md`
- `_bmad-output/implementation-artifacts/2-7-strategy-seed-generation-ux/exports/4Kttd.png`
- `_bmad-output/implementation-artifacts/2-7-strategy-seed-generation-ux/exports/EHQ7k.png`
- `_bmad-output/implementation-artifacts/2-7-strategy-seed-generation-ux/exports/Jr2We.png`
- `_bmad-output/implementation-artifacts/2-7-strategy-seed-generation-ux/prototype.pen`
- `_bmad-output/implementation-artifacts/2-7-strategy-seed-generation-ux/prototype.snapshot.json`
- `_bmad-output/implementation-artifacts/2-7-strategy-seed-generation-ux/prototype.save-report.json`

`.pen` 核对说明：
- 已按用户要求的顺序先读 story design notes，再读 manifest，再看 3 张 PNG 导出。
- 之后通过 Pencil MCP 直接读取 `prototype.pen` 结构，并结合 `prototype.snapshot.json` / `prototype.save-report.json` 交叉确认。
- 已核对的关键原型状态包括：
  - `Screen A — 策略种子 Empty State`
  - `Screen B — 沟通素材上传 Modal`
  - `Screen C — 策略种子 Cards (Primary)`

结果：PASS

## 摘要

本次按 `validate-create-story` 工作流对 Story 2.7 重新执行了实现就绪性校验，并在 story 文件内原位修复了所有可安全消除的阻塞项。修正后，文档已与当前仓库真实的 IPC / store / task-queue / agent 注册方式、Story 2.5/2.6 的既有分析链路、以及 UX 原型中的空态/Modal/结果态结构对齐，可直接进入实现。

## 发现的关键问题

None

## 已应用增强

- 修正共享类型契约，删除 `StrategySeed` 中与当前分析 item 模式不一致的 `projectId`，并把 `UpdateSeedInput` 改为现有仓库统一使用的 `{ id, patch }` 形状，避免 dev 按平铺字段实现出错。
- 修正 seed 任务的 agent 注册位置，明确应在 `src/main/services/agent-orchestrator/index.ts` 的真实注册入口接线，而不是模糊写成 `orchestrator.ts` 内部逻辑。
- 修正外层 task queue 输入，明确 `generateSeeds()` 不应把原始沟通素材全文写入 `tasks.input`；外层任务只持久化 `projectId/rootPath`，原文仅保留在 `seed.json` 快照中，避免在任务表重复落敏感长文本。
- 修正 repository 职责边界，去掉与当前仓库风格不一致的 `countByProject()` 摘要查询要求，改为通过 `findByProject()` / `getSeeds()` 计算 summary；同时补充 `findProjectId()` 与 `titleExists()`，保证 update/delete/syncSnapshot 以及重复标题校验可落地。
- 修正 `seed.json` 的路径描述，明确它位于项目根目录 `{rootPath}/seed.json`，并与已落地的 `tender/tender-parsed.json`、`tender/scoring-model.json`、`tender/mandatory-items.json` 分离，避免把 seed snapshot 错写进 `tender/`。
- 修正 AC #4 的“跳过”语义，明确 Alpha 阶段不新增独立 Skip 按钮；“跳过”指用户不上传沟通素材、直接离开该 Tab 或继续后续流程，但该空态不会阻塞后续阶段。
- 修正 AnalysisView / hook 边界，删除与现有 renderer 架构不一致的强制性 `useGenerateSeeds()` / `useSeeds()` 新抽象要求，改为沿用当前 `analysisStore + useAnalysisTaskMonitor` 的直连模式，仅扩展第四类任务 `seed` 的监控与错误路由。
- 修正 store 错误分流要求，明确 `setError()` 的 `taskKind` 必须扩展 `'seed'`，否则 seed 失败会污染 import / extraction / mandatory 的现有错误语义。
- 修正 UI 文案与原型对齐细节：
  - 空态 CTA 按钮文案收敛为 `上传沟通素材`，不再写成原型中不存在的长按钮文案。
  - MaterialInputModal props 改为与现有 Ant Design / 项目 modal 模式一致的 `open`，不再使用过时的 `visible`。
  - Summary bar 补充 success-tinted 背景/边框要求，底部按钮文案改为 `全部确认（N 个待确认）`，与 PNG / `.pen` 结果态一致。
  - `sourceExcerpt` 明确为可空字段，并要求卡片仅在其存在时渲染 Collapse 引用区，避免手动添加种子时出现空折叠区域。
- 修正测试落点与命名，统一对齐当前测试目录结构：
  - `tests/unit/renderer/analysis/StrategySeedCard.test.tsx`
  - `tests/unit/renderer/analysis/StrategySeedList.test.tsx`
  - `tests/unit/main/prompts/generate-seed.prompt.test.ts`
  - `tests/unit/renderer/analysis/useAnalysisTaskMonitor.test.tsx`
  - 新增 `tests/unit/renderer/stores/analysisStore.seed.test.ts`
  - 保留 `tests/unit/main/ipc/analysis-handlers.test.ts` / `tests/unit/main/db/migrations.test.ts` 的现有聚合测试扩展方式
- 补充重复标题的错误语义，要求 `updateSeed()` / `addSeed()` 在同项目标题重复时显式抛出 `BidWiseError(ErrorCode.DUPLICATE, ...)`，避免把数据库唯一约束错误原样暴露到 UI。

## 剩余风险

None

## 最终结论

经本轮 `validate-create-story` 复核与原位修正后，Story 2.7 已无剩余的可执行阻塞项。当前 story 与代码库现状、前置 Story 2.5/2.6 的分析契约、以及 UX 原型关键状态均已完成必要对齐，结论为 **PASS**。
