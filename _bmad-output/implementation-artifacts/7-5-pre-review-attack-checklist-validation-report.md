# Story 7.5 Validation Report

日期：2026-04-12  
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）

## 校验范围

本次校验严格按 `validate-create-story` 工作流执行，而不是自由评审。复核范围覆盖：

- `.agents/skills/bmad-create-story/workflow.md`
- `.agents/skills/bmad-create-story/checklist.md`
- `.agents/skills/bmad-create-story/discover-inputs.md`
- `_bmad/bmm/config.yaml`
- `_bmad-output/implementation-artifacts/7-5-pre-review-attack-checklist.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/7-2-dynamic-adversarial-role-generation.md`
- `_bmad-output/implementation-artifacts/7-3-adversarial-review-execution.md`
- `_bmad-output/implementation-artifacts/7-5-pre-review-attack-checklist-ux/prototype.manifest.yaml`
- `_bmad-output/implementation-artifacts/7-5-pre-review-attack-checklist-ux/ux-spec.md`
- `_bmad-output/implementation-artifacts/7-5-pre-review-attack-checklist-ux/prototype.pen`
- 参考导出图：`exports/LLvoh.png`、`exports/4mlcJ.png`、`exports/KNrIN.png`
- 当前代码基线：
  - `src/shared/ai-types.ts`
  - `src/shared/adversarial-types.ts`
  - `src/shared/ipc-types.ts`
  - `src/preload/index.ts`
  - `src/preload/index.d.ts`
  - `src/main/db/schema.ts`
  - `src/main/db/migrator.ts`
  - `src/main/db/migrations/013_create_adversarial_lineups.ts`
  - `src/main/db/migrations/014_create_adversarial_reviews.ts`
  - `src/main/db/repositories/adversarial-lineup-repo.ts`
  - `src/main/db/repositories/adversarial-review-repo.ts`
  - `src/main/services/adversarial-lineup-service.ts`
  - `src/main/services/adversarial-review-service.ts`
  - `src/main/services/agent-orchestrator/index.ts`
  - `src/main/services/agent-orchestrator/orchestrator.ts`
  - `src/main/services/agent-orchestrator/agents/adversarial-agent.ts`
  - `src/main/services/agent-orchestrator/agents/adversarial-review-agent.ts`
  - `src/main/services/document-service.ts`
  - `src/main/ipc/review-handlers.ts`
  - `src/renderer/src/stores/reviewStore.ts`
  - `src/renderer/src/stores/index.ts`
  - `src/renderer/src/modules/review/hooks/useReviewTaskMonitor.ts`
  - `src/renderer/src/modules/review/hooks/useAdversarialLineup.ts`
  - `src/renderer/src/modules/review/hooks/useAdversarialReview.ts`
  - `src/renderer/src/modules/review/components/AdversarialLineupDrawer.tsx`
  - `src/renderer/src/modules/review/components/AdversarialReviewPanel.tsx`
  - `src/renderer/src/modules/project/components/AnnotationPanel.tsx`
  - `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
  - `src/renderer/src/modules/editor/lib/scrollToHeading.ts`

## 发现并已修复的问题

### 1. Checklist 父表 upsert 语义会误导实现者使用危险的 `INSERT OR REPLACE`

原 Story 把 `saveChecklist()` 写成 `INSERT OR REPLACE`。这与当前仓库已落地的 lineup/review repository 模式冲突，也不适合有子表 FK 的 parent row：SQLite `REPLACE` 会删除旧行再插入新行，容易破坏 checklist item 的外键语义和父行 ID 稳定性。

已修复：

- Story Task 3 改为复用 `adversarial-lineup-repo.ts` / `adversarial-review-repo.ts` 的 update-or-insert 模式
- Dev Notes / Change Log 同步明确：禁止对 checklist parent row 使用 raw `INSERT OR REPLACE`

### 2. 策略种子来源指向了错误的数据入口

原 Story 要求在 7.5 service 中调用 `chapter-generation-service.ts` 私有 `readStrategySeed()`。但当前仓库真实的对抗域上下文聚合已经在 `adversarial-lineup-service.ts` 中落地为 `StrategySeedRepository.findByProject()` + confirmed/adjusted → pending fallback 逻辑，且 `readStrategySeed()` 既非导出 API，也读取的是另一条 sidecar 路径。

已修复：

- Story Task 5 改为明确复用 `adversarial-lineup-service.ts` 的策略种子聚合模式
- References / Change Log 同步替换为真实代码基线

### 3. 目标章节跳转缺少稳定 locator，且阶段 5 下会直接失效

原 Story 只有 `targetSection: string`，并把跳转描述成“复用 `useCurrentSection` 的 heading locator 跳转能力”。这与仓库现状不符：

- `useCurrentSection` 是“检测当前章节”，不是“执行导航”
- `scrollToHeading()` 使用 locator/title+occurrenceIndex
- 阶段 5 右侧并没有编辑器，必须先切回 `proposal-writing`

已修复：

- 为 `AttackChecklistItem` 增加 `targetSectionLocator: ChapterHeadingLocator | null`
- 迁移 / schema / repository / service 任务同步补入 `target_section_locator`
- 明确 service 使用 `documentService.getMetadata(projectId).sectionIndex` 把 `targetSection` 解析为 `targetSectionLocator`
- 明确 UI 点击链接时复用 `ProjectWorkspace.handleNavigateToChapter()` + `scrollToHeading()`；阶段 5 先切回阶段 4 再滚动
- UX spec 同步新增 stage 5 点击返回 proposal-writing 的约束

### 4. Stage 5 右侧宿主关系不清晰，会与 Story 7.3 冲突

原 Story 只说把 panel 集成到 `AnnotationPanel.tsx`，但当前真实代码中阶段 5 的右侧区域可能被 `AdversarialReviewPanel` 替代；同时 `ProjectWorkspace` 目前在 stage 5 默认不给 `AnnotationPanel` 传 `projectId`。如果不修，开发者会在“并列渲染 / 替换渲染 / 看不到 checklist”之间摇摆。

已修复：

- 明确阶段 4：panel 作为 `AnnotationPanel` shell 内的 stacked section，位于批注主体和 `RecommendationPanel` 之间
- 明确阶段 5：仅在 `AdversarialReviewPanel` 未打开时复用 `AnnotationPanel` shell 显示 checklist；review panel 打开时保持 Story 7.3 的右侧替换关系
- 明确需要修改 `ProjectWorkspace.tsx`，在阶段 5 仍向 `AnnotationPanel` 透传 `projectId` 并传入章节导航回调
- UX spec 同步补充 stage 5 host 规则

### 5. reviewStore / task monitor 的责任边界写反了

原 Story 要求 `startAttackChecklistGeneration()` “设置 taskId，启动轮询”。这与当前 review 域已落地的模式冲突：renderer 侧统一由 `useReviewTaskMonitor` 消费 outer task progress，service 只在主进程内轮询 inner `ai-agent` 子任务。

已修复：

- Story Task 7 改为：store 仅保存 `attackChecklistTaskId`
- 增加 `setAttackChecklistProgress()`、`setAttackChecklistTaskError()`、`refreshAttackChecklist()`
- 明确扩展 `TaskKind` / `findReviewProjectIdByTaskId()` / `useReviewTaskMonitor`
- Dev Notes / Change Log 同步改为“monitor outer task，而非自建 polling timer”

### 6. preload 类型声明任务与真实类型系统不一致

原 Story 把 `src/preload/index.d.ts` 当成需要手动维护的目标。但当前仓库的 `window.api` 类型来源是 `src/shared/ipc-types.ts` 里的 `FullPreloadApi` 自动派生，`index.d.ts` 只是引用入口。

已修复：

- Story Task 6.5 改为“不要手动编辑 `index.d.ts`”
- 明确只需同步 `IpcChannelMap` + `src/preload/index.ts` + `security.test.ts`

### 7. 迁移规范缺少与现有 review 域一致的外键/索引约束

原 Story 对 `attack_checklists.project_id` 只写了 `TEXT NOT NULL UNIQUE`，没有对齐现有 `013_create_adversarial_lineups.ts` / `014_create_adversarial_reviews.ts` 的 `REFERENCES projects(id) ON DELETE CASCADE` 模式，也没把 `target_section_locator` 列补进迁移规范。

已修复：

- 在迁移任务中补入 `project_id REFERENCES projects(id) ON DELETE CASCADE`
- 为 `attack_checklists` 补入 unique project index
- 为 `attack_checklist_items` 补入 `target_section_locator` JSON 列
- 把迁移编号约束精确到当前仓库真实最新值 `014`

### 8. Story-level UX 约束没有回写到实现文档，且参考 PNG 已与 `.pen` 重新对齐

原 Story References 没把 manifest / ux-spec / `.pen` 主 frame 锚点纳入实现上下文，容易让开发者只看总 UX 文档，忽略 7.5 的 story-level 原型细节。校验中还发现回退态参考图需要以 `.pen` 重新导出，才能保证与结构源一致。

已修复：

- Story References 新增 manifest / ux-spec / `.pen` / PNG exports
- Story Dev Notes 新增 `.pen` frame anchors：`LLvoh`、`4mlcJ`、`KNrIN`
- 重新导出 `LLvoh.png`、`4mlcJ.png`、`KNrIN.png`，确保视觉参考与 `.pen` 结构一致
- UX spec 同步补入 stage 5 host / target locator / cross-stage navigation 约束

## 已修改工件

- `_bmad-output/implementation-artifacts/7-5-pre-review-attack-checklist.md`
- `_bmad-output/implementation-artifacts/7-5-pre-review-attack-checklist-ux/ux-spec.md`
- `_bmad-output/implementation-artifacts/7-5-pre-review-attack-checklist-ux/exports/LLvoh.png`
- `_bmad-output/implementation-artifacts/7-5-pre-review-attack-checklist-ux/exports/4mlcJ.png`
- `_bmad-output/implementation-artifacts/7-5-pre-review-attack-checklist-ux/exports/KNrIN.png`

## 结果

经本轮 `validate-create-story` 复核与原位修正后，Story 7.5 已与以下事实完成必要对齐：

- Epic 7 / PRD 中的 FR44，以及与 Story 7.2 / 7.3 的真实依赖边界
- 当前 review 域的 outer-task / inner-agent / reviewStore / useReviewTaskMonitor 实现模式
- 当前 `ProjectWorkspace` / `AnnotationPanel` / `AdversarialReviewPanel` 的右侧宿主关系
- 当前 `documentService` + `proposal.meta.json sectionIndex` + `scrollToHeading()` 的章节导航协议
- 7.5 story-level UX manifest、PNG 导出与 `.pen` frame 结构

本次校验后，未发现仍会阻塞 Story 7.5 开发实施的未解决歧义、矛盾或缺失项，结论为 **PASS**。

## 备注

- 本次仅进行了 story-spec / UX artifact 修订与 PNG 重导出，未运行代码测试；当前结论针对 implementation readiness，而非代码正确性。
