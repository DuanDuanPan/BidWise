# Story 2.9 Validation Report

日期：2026-04-03
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）
目标文档：`_bmad-output/implementation-artifacts/2-9-fog-map.md`

已核对工件：
- `_bmad/bmm/config.yaml`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/workflow.md`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/checklist.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/story-2-5.md`
- `_bmad-output/implementation-artifacts/2-6-mandatory-item-detection-validation-report.md`
- `_bmad-output/implementation-artifacts/2-7-strategy-seed-generation.md`
- `_bmad-output/implementation-artifacts/2-7-strategy-seed-generation-validation-report.md`
- `_bmad-output/implementation-artifacts/2-9-fog-map.md`
- `_bmad-output/implementation-artifacts/2-9-fog-map-ux/ux-spec.md`
- `_bmad-output/implementation-artifacts/2-9-fog-map-ux/prototype.manifest.yaml`
- `_bmad-output/implementation-artifacts/2-9-fog-map-ux/exports/igGTl.png`
- `_bmad-output/implementation-artifacts/2-9-fog-map-ux/exports/JbArg.png`
- `_bmad-output/implementation-artifacts/2-9-fog-map-ux/exports/RFoRP.png`
- `_bmad-output/implementation-artifacts/2-9-fog-map-ux/prototype.pen`
- `_bmad-output/implementation-artifacts/2-9-fog-map-ux/prototype.snapshot.json`
- `_bmad-output/implementation-artifacts/2-9-fog-map-ux/prototype.save-report.json`
- `src/shared/analysis-types.ts`
- `src/shared/ipc-types.ts`
- `src/shared/ai-types.ts`
- `src/shared/constants.ts`
- `src/main/ipc/analysis-handlers.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/main/services/agent-orchestrator/index.ts`
- `src/main/services/agent-orchestrator/orchestrator.ts`
- `src/main/services/agent-orchestrator/agents/extract-agent.ts`
- `src/main/services/agent-orchestrator/agents/seed-agent.ts`
- `src/main/services/document-parser/index.ts`
- `src/main/services/document-parser/scoring-extractor.ts`
- `src/main/services/document-parser/mandatory-item-detector.ts`
- `src/main/services/document-parser/strategy-seed-generator.ts`
- `src/main/services/task-queue/queue.ts`
- `src/main/prompts/index.ts`
- `src/main/prompts/detect-mandatory.prompt.ts`
- `src/main/prompts/generate-seed.prompt.ts`
- `src/main/db/schema.ts`
- `src/main/db/migrator.ts`
- `src/main/db/repositories/mandatory-item-repo.ts`
- `src/main/db/repositories/strategy-seed-repo.ts`
- `src/main/db/repositories/requirement-repo.ts`
- `src/main/db/repositories/task-repo.ts`
- `src/main/utils/errors.ts`
- `src/renderer/src/stores/analysisStore.ts`
- `src/renderer/src/modules/analysis/hooks/useAnalysis.ts`
- `src/renderer/src/modules/analysis/components/AnalysisView.tsx`
- `src/renderer/src/modules/analysis/components/MandatoryItemsList.tsx`
- `src/renderer/src/modules/analysis/components/StrategySeedList.tsx`
- `src/renderer/src/modules/analysis/components/StrategySeedCard.tsx`
- `src/renderer/src/modules/analysis/components/StrategySeedBadge.tsx`
- `src/renderer/src/modules/analysis/components/MaterialInputModal.tsx`
- `tests/unit/main/ipc/analysis-handlers.test.ts`
- `tests/unit/main/db/migrations.test.ts`
- `tests/unit/main/services/agent-orchestrator/agents/seed-agent.test.ts`
- `tests/unit/main/prompts/generate-seed.prompt.test.ts`
- `tests/unit/renderer/stores/analysisStore.test.ts`
- `tests/unit/renderer/stores/analysisStore.seed.test.ts`
- `tests/unit/renderer/analysis/useAnalysisTaskMonitor.test.tsx`
- `tests/unit/renderer/analysis/StrategySeedList.test.tsx`
- `tests/unit/renderer/analysis/StrategySeedCard.test.tsx`

`.pen` 核对说明：
- 已按用户要求顺序执行：先读 story design notes，再读 manifest，再打开 3 张 PNG 导出。
- 随后直接读取 `prototype.pen`、`prototype.snapshot.json`、`prototype.save-report.json` 复核结构与交互细节。
- 已核对的关键原型状态包括：
  - `Screen A — 迷雾地图 Empty State`
  - `Screen B — 迷雾地图 Primary State`
  - `Screen C — Card Expanded Detail`
- 关键结论：原型明确显示 confirmed 的 ambiguous/risky 卡片仍留在原组内，仅切换为绿色 confirmed 样式，并通过组头 `已确认 N` 计数表达消雾进度；不会移动到 `明确需求` 组。

结果：PASS

## 摘要

本次按 `validate-create-story` 工作流对 Story 2.9 重新执行了实现就绪性校验，并在 story 文件与直接相关 UX spec 中原位修复了所有可安全消除的阻塞项。修正后，文档已与当前仓库真实的 `analysisStore` / `useAnalysisTaskMonitor` / IPC / task-queue / agent 注册方式、Story 2.5/2.6/2.7 的既有分析链路、以及迷雾地图 UX 原型中的空态/结果态/展开卡片细节对齐，可直接进入实现。

## 发现的关键问题

None

## 已应用增强

- 修正了最关键的原型漂移：
  - 删除“confirmed 的 ambiguous/risky 卡片会移动到 `明确需求` 组”的错误要求。
  - 明确改为“confirmed 项保留在原 risk/ambiguous 分组中，只切换为绿色 confirmed 样式，并增加组头 `已确认 N` 计数”，与 PNG / `.pen` 原型一致。
- 修正了顶层统计与组件结构描述：
  - 顶部区域改为“标题 + 百分比 + Progress + stats row”，stats row 明确包含 `已确认 N` 蓝点统计。
  - 首次生成仅使用居中的 Empty State CTA，已生成后右上角只显示“重新生成”，不再混写成 `[生成迷雾地图] / [重新生成]` 的双按钮形态。
- 修正了后端服务的缺失 guardrail：
  - `FogMapClassifier.generate()` 明确先通过 `ProjectRepository.findById()` 读取并校验 `rootPath`，避免写快照/读 parsed tender 时缺少路径来源。
  - `tenderSections` 改为直接读取 `{rootPath}/tender/tender-parsed.json` 降级获取，不再模糊写成“可反向调用 TenderImportService”。
- 修正了 repository / DTO 契约边界：
  - `RequirementCertainty` 共享类型去掉 `projectId`，对齐当前 `MandatoryItem` / `StrategySeed` 的 item DTO 风格。
  - 删除与当前仓库风格不一致的 `countByProject()` 要求，改为通过 service 基于 `findByProject()` / `getFogMap()` 计算 summary。
  - 补充 `findProjectId(id)`，保证单条确认后的 `syncSnapshot()` 可落地。
- 修正了 prompt / fallback 语义：
  - 不再强制 clear 项输出 50-200 字建议，明确 clear 的 `suggestion` 可为空字符串或 `"无需补充确认"`。
  - 明确 LLM 漏掉 requirementId 时，默认补齐为 `ambiguous`，并且必须同时写入 fallback `reason` / `suggestion`，防止出现空字段。
- 修正了需求重抽取回归缺口：
  - 新增对 `src/main/services/document-parser/scoring-extractor.ts` 的直接修改要求。
  - 明确当 Story 2.5 重新抽取 requirements / scoring model 时，必须清除 `requirement_certainties` 并删除/失效旧 `tender/fog-map.json`，否则会遗留过期派生产物。
- 修正了 store / task monitor / 测试接线描述：
  - `confirmCertainty()` / `batchConfirmCertainty()` 明确为“原组内绿色乐观更新 + 失败回滚”。
  - `useAnalysisTaskMonitor` 测试路径改为扩展现有的 `tests/unit/renderer/analysis/useAnalysisTaskMonitor.test.tsx`，而不是新增与当前测试结构不一致的后缀文件。
  - E2E 场景要求改为同时预置 `requirements + scoringModel + mandatoryItems`，覆盖 fog map 对上游分析结果的真实依赖。
- 补充了 snapshot 契约：
  - `FogMapSnapshot.items` 明确包含 `requirementSequenceNumber`、`requirementDescription`、`sourcePages`、`category`、`priority` 等下游需要消费的字段。
  - 下游消费示例同步更新，避免实现时只写最小字段导致后续 story 读取能力不足。
- 修正了 UX 文案与可访问性细节：
  - `FogMapCard` 明确为 custom-styled expandable card，不允许直接套用默认 Ant Design Card / Collapse 皮肤。
  - `aria-label` 从“确认此需求为明确”修正为“确认此需求已完成人工确认”，避免把 confirmed 误写成 certaintyLevel 变化。

## 剩余风险

None

## 最终结论

经本轮 `validate-create-story` 复核与原位修正后，Story 2.9 已无剩余的可执行阻塞项。当前 story、直接相关 UX spec、前置 Story 2.5/2.6/2.7 的分析契约、以及 2-9 原型中的关键状态与交互细节已完成必要对齐，结论为 **PASS**。
