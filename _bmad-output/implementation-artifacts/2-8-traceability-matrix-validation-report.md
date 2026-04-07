# Story 2.8 Validation Report

日期：2026-04-03
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）
目标文档：`_bmad-output/implementation-artifacts/2-8-traceability-matrix.md`

已核对工件：
- `_bmad/bmm/config.yaml`
- `.agents/skills/bmad-create-story/SKILL.md`
- `.agents/skills/bmad-create-story/workflow.md`
- `.agents/skills/bmad-create-story/checklist.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/2-8-traceability-matrix.md`
- `_bmad-output/implementation-artifacts/2-8-traceability-matrix-ux/ux-spec.md`
- `_bmad-output/implementation-artifacts/2-8-traceability-matrix-ux/prototype.manifest.yaml`
- `_bmad-output/implementation-artifacts/2-8-traceability-matrix-ux/exports/Hsg6Y.png`
- `_bmad-output/implementation-artifacts/2-8-traceability-matrix-ux/exports/XJzh6.png`
- `_bmad-output/implementation-artifacts/2-8-traceability-matrix-ux/exports/dt4Tv.png`
- `_bmad-output/implementation-artifacts/2-8-traceability-matrix-ux/prototype.pen`
- `_bmad-output/implementation-artifacts/2-7-strategy-seed-generation.md`
- `_bmad-output/implementation-artifacts/3-3-template-driven-proposal-skeleton.md`
- `src/shared/analysis-types.ts`
- `src/shared/ipc-types.ts`
- `src/shared/ai-types.ts`
- `src/shared/constants.ts`
- `src/shared/models/proposal.ts`
- `src/shared/template-types.ts`
- `src/shared/chapter-types.ts`
- `src/shared/chapter-markdown.ts`
- `src/main/db/schema.ts`
- `src/main/db/migrator.ts`
- `src/main/db/repositories/requirement-repo.ts`
- `src/main/db/repositories/mandatory-item-repo.ts`
- `src/main/db/repositories/strategy-seed-repo.ts`
- `src/main/services/document-service.ts`
- `src/main/services/template-service.ts`
- `src/main/services/document-parser/index.ts`
- `src/main/services/document-parser/tender-import.ts`
- `src/main/services/document-parser/scoring-extractor.ts`
- `src/main/services/document-parser/mandatory-item-detector.ts`
- `src/main/services/document-parser/strategy-seed-generator.ts`
- `src/main/services/agent-orchestrator/index.ts`
- `src/main/services/agent-orchestrator/agents/extract-agent.ts`
- `src/main/services/agent-orchestrator/agents/seed-agent.ts`
- `src/main/prompts/index.ts`
- `src/main/prompts/generate-seed.prompt.ts`
- `src/main/ipc/analysis-handlers.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/stores/analysisStore.ts`
- `src/renderer/src/stores/documentStore.ts`
- `src/renderer/src/modules/analysis/hooks/useAnalysis.ts`
- `src/renderer/src/modules/analysis/components/AnalysisView.tsx`
- `src/renderer/src/modules/analysis/components/MaterialInputModal.tsx`
- `src/renderer/src/modules/analysis/components/StrategySeedList.tsx`
- `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
- `src/renderer/src/modules/editor/lib/scrollToHeading.ts`
- `tests/unit/main/db/migrations.test.ts`
- `tests/unit/main/ipc/analysis-handlers.test.ts`
- `tests/unit/main/prompts/extract-requirements.prompt.test.ts`
- `tests/unit/main/prompts/generate-seed.prompt.test.ts`
- `tests/unit/renderer/analysis/useAnalysisTaskMonitor.test.tsx`
- `tests/unit/renderer/stores/analysisStore.test.ts`
- `tests/unit/renderer/stores/analysisStore.seed.test.ts`
- `tests/e2e/stories/story-2-7-strategy-seed-generation.spec.ts`

`.pen` 核对说明：
- 已按用户要求的顺序先读 story design notes，再读 manifest，再看 3 张 PNG 导出。
- 之后通过 Pencil MCP 直接读取 `prototype.pen` 结构，并核对 3 个关键画面：
  - `XJzh6` — 追溯矩阵 Empty State
  - `dt4Tv` — 追溯矩阵 Primary Matrix View
  - `Hsg6Y` — 导入补遗 Modal
- PNG 仅用于视觉对齐，`.pen` 用于确认结构与状态划分。

结果: PASS

## 摘要

本次按 `validate-create-story` 工作流对 Story 2.8 重新执行了实现就绪性校验，并将所有可安全修复的 story-spec 问题直接原位修正到 story 与直接相关的 UX 规范中。修正后，文档已与当前仓库真实的 proposal metadata 契约、task-queue / agent / IPC / store 结构、补遗导入能力边界，以及 workspace 级章节跳转机制对齐，可直接进入实现。

## 发现的关键问题

None

## 已应用增强

- 修正方案章节来源契约，新增 `proposal.meta.json.sectionIndex` 作为追溯矩阵列定义的首选来源，并明确 Story 2.8 需同时补齐 `src/shared/template-types.ts`、`src/shared/models/proposal.ts`、`src/main/services/document-service.ts`、`src/main/services/template-service.ts`，避免继续误用仅含权重的 `sectionWeights`。
- 补充旧项目兼容策略：`sectionIndex` 缺失时从 `proposal.md` 标题解析临时索引并生成 `ChapterHeadingLocator`，从而支持已存在项目直接升级，不因 metadata 旧版本阻塞实现。
- 修正章节跳转链路，删除 story 中错误的 `documentStore` 直接滚动假设，改为通过 workspace 层切换到 `proposal-writing` 后调用 `scrollToHeading()`，并明确 locator 缺失时的非阻塞降级行为。
- 修正 addendum 输入契约，`ImportAddendumInput` 改为 `content? / filePath? / fileName?`，并明确 `.txt` 走 `FileReader`、`.pdf/.doc/.docx` 走 Electron `File.path` + main 进程解析，与现有 tender import 模式保持一致。
- 明确 task 持久化边界：`tasks.input` 只保留最小元数据，不落原始补遗正文或 proposal 正文，避免把长文本/敏感文本重复写入任务表。
- 修正 addendum 解析架构，要求扩展现有 `extract-agent.ts` 支持 `addendum-requirements` mode，并新增 `extract-addendum.prompt.ts`，避免引入多余的新 agent 类型。
- 修正自动/手动映射语义：任何用户编辑过的 auto link 必须先转为 `manual`；删除仅允许针对 `manual` link；否决 auto link 的实现方式改为“标记为未覆盖并转为 manual”，从而使“重新生成仅覆盖 auto”这一规则可稳定落地。
- 修正矩阵 cell 语义，明确灰色 N/A 表示“无 link”，红色 uncovered 仅表示“存在显式 uncovered link”，避免用数据库伪记录表达缺失关系。
- 修正覆盖率统计口径，要求按 requirement 粒度保守计算有效状态：无 link 或显式 uncovered 计为 uncovered，存在 partial 计为 partial，仅在无 partial/uncovered 且至少一个 covered 时才计为 covered，使 badge、全绿动效和矩阵颜色语义一致。
- 新增 `matchReason` 契约，要求贯通 DB schema、shared types、service 和 UI popover，补齐原 prompt 已要求但 story 原文漏掉的匹配理由展示字段。
- 引入 `traceability-matrix.json` 快照要求，作为“是否曾生成过”的 durable marker，并承载 `generatedAt/updatedAt`、stats、受影响章节和新增 requirement 信息，避免 `null` / `[]` 语义混乱。
- 修正补遗处理流程，放弃“仅对新 requirement 做增量追溯替换”的高风险方案，改为“插入新 requirement 后执行全量 auto 映射重算 + manual 保留 + 快照 diff”，实现更简单且与现有仓库模式更一致。
- 修正 repository/service 边界，删除 repository 层错误的 UUID 排序要求，明确业务排序应在 `getMatrix()` 中按 requirement `sequenceNumber` 和 section `order` 完成。
- 修正 store / task monitor 要求，补齐 `addendumImportProgress`、`addendumImportMessage`，并明确 `useAnalysis.ts` / `useAnalysisTaskMonitor` 需要扩展 `'matrix' | 'addendum'` 任务种类，而不仅仅新增 taskId 字段。
- 修正 AnalysisView Tab 行为，改为“Tab 可进入但使用 muted/tooltip 呈现前置条件不足”，从而与 UX State A 的信息态保持一致，不再出现“真正 disabled 导致看不到空态”的矛盾。
- 修正性能要求，移除 Alpha 阶段对 `react-window` 之类新依赖的强制要求，改为使用现有 Ant Design + CSS sticky + overflow 完成滚动体验，避免引入仓库当前不存在的依赖作为故事阻塞项。
- 修正测试计划，全部对齐当前测试目录结构，并补齐缺失覆盖项：`generate-traceability.prompt`、`extract-addendum.prompt`、`traceability-agent`、`extract-agent` addendum mode、`traceability-matrix-service`、`analysisStore.traceability`、`useAnalysisTaskMonitor` 扩展、三个 renderer 组件，以及 `tests/e2e/stories/story-2-8-traceability-matrix.spec.ts`。
- 修正 UX 规范中的关键交互，使其与 `.pen` 原型和当前代码现实同时对齐：State A 可进入信息态、State H 受影响高亮、右键菜单的 auto/manual 差异、addendum 上传输入来源、以及跨阶段导航桥接逻辑。

## 剩余风险

None

## 最终结论

经本轮 `validate-create-story` 复核与原位修正后，Story 2.8 已无剩余的可执行阻塞项。当前 story、UX 规范、原型状态说明以及与现有代码库的接口假设已经完成必要对齐，结论为 **PASS**。
