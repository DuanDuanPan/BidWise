# Story 3.3 Validation Report

日期：2026-03-31
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）
目标文档：`_bmad-output/implementation-artifacts/3-3-template-driven-proposal-skeleton.md`

已核对工件：
- `_bmad/bmm/config.yaml`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline.md`
- `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-validation-report.md`
- `_bmad-output/implementation-artifacts/story-3-1-plate-editor-markdown-serialization.md`
- `src/shared/ipc-types.ts`
- `src/shared/analysis-types.ts`
- `src/shared/models/proposal.ts`
- `src/shared/constants.ts`
- `src/preload/index.ts`
- `src/main/ipc/create-handler.ts`
- `src/main/ipc/index.ts`
- `src/main/ipc/analysis-handlers.ts`
- `src/main/ipc/document-handlers.ts`
- `src/main/services/document-service.ts`
- `src/main/services/document-parser/scoring-extractor.ts`
- `src/main/services/project-service.ts`
- `src/main/utils/errors.ts`
- `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
- `src/renderer/src/modules/project/components/OutlinePanel.tsx`
- `src/renderer/src/modules/project/components/StatusBar.tsx`
- `src/renderer/src/modules/project/components/StageGuidePlaceholder.tsx`
- `src/renderer/src/modules/project/types.ts`
- `src/renderer/src/modules/editor/components/EditorView.tsx`
- `src/renderer/src/modules/editor/components/AutoSaveIndicator.tsx`
- `src/renderer/src/stores/documentStore.ts`
- `tests/unit/main/services/document-service.test.ts`
- `tests/unit/main/services/document-parser/scoring-extractor.test.ts`
- `tests/e2e/stories/story-2-5-requirements-scoring.spec.ts`
- `_bmad-output/implementation-artifacts/3-3-template-driven-proposal-skeleton-ux/prototype.manifest.yaml`
- `_bmad-output/implementation-artifacts/3-3-template-driven-proposal-skeleton-ux/ux-spec.md`
- `_bmad-output/implementation-artifacts/3-3-template-driven-proposal-skeleton-ux/exports/bRcia.png`
- `_bmad-output/implementation-artifacts/3-3-template-driven-proposal-skeleton-ux/exports/nJSJc.png`
- `_bmad-output/implementation-artifacts/3-3-template-driven-proposal-skeleton-ux/exports/gI1xx.png`
- `_bmad-output/implementation-artifacts/3-3-template-driven-proposal-skeleton-ux/prototype.pen`

`.pen` 核对说明：已按要求通过 Pencil MCP 打开 `prototype.pen`，并读取 `Screen 1 — Template Selection`、`Screen 2 — Skeleton Editor`、`Screen 3 — Existing Content` 的结构节点；同时对照 3 张 PNG 导出做视觉语义比对。

结果：PASS

## 摘要

本次按 `validate-create-story` 工作流重跑了 Story 3.3 的实现就绪性校验，并在 story 文件与直接相关 UX spec 中原位修复了所有可安全消除的阻塞项。修正后，文档已与当前仓库真实 IPC/metadata/Store 契约、Story 2.5 的评分模型结构、Story 3.1/3.2 的已落地编辑器边界，以及 UX 原型中的核心交互状态对齐。

## 发现的关键问题

None

## 已应用增强

- 补齐模板选择阶段缺失的章节结构预览，要求在点击“生成骨架”前先通过 `template:get` 拉取完整模板并展示只读预览；同步更新 UX spec 的信息架构与状态描述。
- 修正主进程调用链：
  - 删除 Story 中“主进程通过 `analysis:get-scoring-model` IPC 取评分模型”的错误描述，明确改为直接调用 `scoringExtractor.getScoringModel(projectId)`。
  - 修正 IPC handler 工厂引用为仓库真实存在的 `src/main/ipc/create-handler.ts`，不再指向不存在的 `handler-factory`。
- 补齐骨架编辑后的持久化闭环：
  - 新增 `template:persist-skeleton` IPC / preload / service 契约。
  - 明确 `solution-design` 阶段不能只依赖 `documentStore.saveDocument()`，必须同步刷新 `proposal.md` 与 `proposal.meta.json.sectionWeights`。
- 修正评分权重语义与匹配算法：
  - 明确 Story 2.5 的 `ScoringCriterion.weight` 是 0-1 小数，不是 0-100 百分数。
  - 将骨架侧字段改为 `weightPercent`，避免与评分模型原始 `weight` 混淆。
  - 明确匹配时需同时考虑 `criterion.category` 与 `subItems.name`，并把 sub-item 分值换算为展示百分比。
- 修正 sidecar 元数据设计，避免后续实现误删或漂移：
  - `SectionWeightEntry` 改为以稳定 `sectionId` 为主键，而不是只存 `sectionTitle`。
  - 为 `ProposalMetadata` 增加 `sectionWeights/templateId` 后，补充 `document-service` 需要保留这些字段的任务与测试，防止普通文档保存时把 Story 3.3 新字段冲掉。
- 强化已有内容覆盖安全：
  - `GenerateSkeletonInput` 增加 `overwriteExisting?: boolean`。
  - 明确主进程在非空 `proposal.md` 且未显式确认时必须返回 `SKELETON_OVERWRITE_REQUIRED`，而不是只依赖 renderer Modal。
- 修正 `SolutionDesignView` 与现有 Store/Workspace 契约不一致的问题：
  - 初始化改为 `documentStore.loadDocument(projectId)`，保证左侧大纲与状态栏字数在 `solution-design` 阶段也有真实数据来源。
  - `SolutionDesignView` 新增 `onEnterProposalWriting` 回调，由 `ProjectWorkspace` 负责真正切阶段，避免子组件自己绕开现有导航逻辑。
- 修正 `SkeletonEditor` 的交互细节：
  - 不再依赖 `defaultExpandAll`，改为受控 `expandedKeys`，确保新增/移动节点后仍保持可见。
  - 把“新增同级 / 新增子级”收敛为一个明确菜单入口，解决 AC、任务描述和原型之间的冲突。
- 收敛 `solution-design` 阶段左侧大纲的行为边界：
  - 明确该阶段展示的是只读 outline 预览，不再建议把点击事件接到 `scrollToHeading` 然后静默失败。
  - UX spec 与 Story 同步改为只读预览语义。
- 与原型对齐的细节补充：
  - 标准技术模板维持 8 个一级章节，军工/政务模板对齐为 10 个一级章节。
  - `solution-design` 阶段字数统计从“可选”收敛为明确显示，符合 PNG 原型。

## 剩余风险

None

## 最终结论

经本轮 `validate-create-story` 复核与原位修正后，Story 3.3 已无剩余的可执行阻塞项。当前 story、直接相关 UX spec、前置 Story 2.5/3.1/3.2 契约以及代码库现状已完成必要对齐，结论为 **PASS**。
