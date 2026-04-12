# Story 7.3 Validation Report

日期：2026-04-12  
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）

## 校验范围

本次校验严格按 `validate-create-story` 工作流执行，不做自由形式评审。复核与修订范围覆盖：

- `_bmad/bmm/workflows/4-implementation/bmad-create-story/workflow.md`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/checklist.md`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/discover-inputs.md`
- `_bmad-output/implementation-artifacts/7-3-adversarial-review-execution.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/7-2-dynamic-adversarial-role-generation.md`
- `_bmad-output/implementation-artifacts/7-3-adversarial-review-execution-ux/prototype.manifest.yaml`
- `_bmad-output/implementation-artifacts/7-3-adversarial-review-execution-ux/ux-spec.md`
- `_bmad-output/implementation-artifacts/7-3-adversarial-review-execution-ux/prototype.pen`
- 参考导出图：`exports/7Pbmy.png`、`exports/9IyPA.png`、`exports/UlfNE.png`
- 当前代码基线：
  - `src/shared/adversarial-types.ts`
  - `src/shared/ipc-types.ts`
  - `src/shared/ai-types.ts`
  - `src/main/ipc/review-handlers.ts`
  - `src/main/services/adversarial-lineup-service.ts`
  - `src/main/services/agent-orchestrator/index.ts`
  - `src/main/services/agent-orchestrator/orchestrator.ts`
  - `src/main/services/ai-proxy/index.ts`
  - `src/main/services/document-service.ts`
  - `src/main/db/schema.ts`
  - `src/main/db/migrator.ts`
  - `src/renderer/src/stores/reviewStore.ts`
  - `src/renderer/src/modules/review/hooks/useReviewTaskMonitor.ts`
  - `src/renderer/src/modules/review/hooks/useAdversarialLineup.ts`
  - `src/renderer/src/modules/review/components/AdversarialLineupDrawer.tsx`
  - `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`

## 发现并已修复的问题

### 1. 外层任务类别与真实代码基线冲突

Story 原文把 7-3 的外层主任务写成了 `taskQueue.enqueue({ category: 'ai-agent' })`。这与仓库现状冲突：当前 `agent-orchestrator` 内部任务才使用 `ai-agent`，外层服务任务（例如 7-2 的 `adversarial-lineup-service.ts`）使用 `category: 'ai'`。如果不修，会直接误导实现者把外层主任务接到错误的执行器语义上。

已修复：

- Story Task 7 与 Dev Notes 均改为 `taskQueue.enqueue({ category: 'ai' })`
- 明确 `ai-agent` 仅用于 agent-orchestrator 内部任务

### 2. “全失败”语义在 AC 与 Dev Notes 中自相矛盾

Story AC4 写的是“仅当所有角色均失败时，整体任务标记为 failed”；但 Dev Notes 却写成“外部 task 仍标记为 completed，但 session.status='failed'”。这是会直接导致实现分叉的阻塞级矛盾。

已修复：

- 统一为：先持久化 `session.status='failed'` 和失败 `roleResults[]`，再让外层 task 进入 `failed`
- 在 Hook 任务监听中补充：外层 task `failed` 时仍需 `loadReview(projectId)` 恢复失败态面板

### 3. 右侧面板行为“Tab 切换或替换”不明确

当前代码基线中 `ProjectWorkspace.tsx` 的右侧面板始终是 `AnnotationPanel`；而 Story/UX spec 原本同时写了“Tab 切换或替换”。这会让实现者无法决定是新增 Tab 体系还是直接替换。

已修复：

- Story 7.3 明确决策：`compliance-review` 阶段右侧直接渲染 `AdversarialReviewPanel`，不引入 Tab
- `proposal-writing` 等其他阶段继续保留现有 `AnnotationPanel`
- story-level UX spec 同步改为 “replaces AnnotationPanel during compliance-review”

### 4. 章节引用可点击，但数据模型缺少稳定跳转定位信息

原 Story 的 finding 只有 `sectionRef: string`。当前编辑器导航体系实际使用 `ChapterHeadingLocator` + `scrollToHeading()`；仅靠显示字符串会导致重复标题场景不稳定。

已修复：

- 为 `AdversarialFinding` 增加 `sectionLocator?: ChapterHeadingLocator | null`
- 为 DB finding 表增加 `section_locator` JSON 字段
- 要求 service 使用 `documentService.getMetadata(projectId)` 中的 `sectionIndex` 解析 `sectionRef -> sectionLocator`
- 明确 UI 链接优先用 `sectionLocator`，无稳定定位时仅展示文本

### 5. Running 面板需要角色运行态，但原 `RoleReviewResult` 无法表达

原 Story 只给了 `success | failed`，无法支撑 UX 中的 waiting / running / completed / failed 角色状态指示器。

已修复：

- `RoleReviewResult.status` 扩展为 `pending | running | success | failed`
- 明确 confirmed lineup 初始化即生成全部角色的 `roleResults[]`

### 6. 零 finding 成功态未定义

如果所有成功角色都返回空 findings，原 Story 没有说明应该展示成功空态还是失败态。

已修复：

- 在 AC2、Task 10.1、story-level UX spec 中新增零结果空态
- 明确“0 findings 仍是有效完成态，不是失败态”

### 7. 反驳理由是否必填未落成执行约束

原 Story 的 AC3 只说“弹出 TextArea 输入反驳理由”，但 IPC/service 规范没有要求 rejected 时必须给非空理由。

已修复：

- 在 IPC 约束和 service 规范中明确：`action === 'rejected'` 时 `rebuttalReason` 必填且 trim 后不能为空

### 8. 全局 UX 规划文档仍保留旧版“自动启动 + 流式结果呈现”叙述

`_bmad-output/planning-artifacts/ux-design-specification.md` 仍存在多处与 Story 7.3 现行方案冲突的表述：

- 阶段 5 自动启动对抗评审
- 对抗评审流式结果呈现
- 交叉火力“流式可视化”

这会让实现者在回溯规划文档时得到旧结论。

已修复：

- 改为：阶段 5 自动进入评审准备态并加载/生成对抗阵容，用户确认后手动启动执行
- 改为：对抗评审只流式反馈进度，不流式渲染 findings
- 改为：统一结果呈现 + 矛盾高亮，而非流式 finding 可视化

### 9. Story 缺少 create-story 模板应有的 validation note 与变更追踪

原 Story 7.3 缺少 create-story 模板里的 validation note，也没有 Change Log，不利于后续追溯。

已修复：

- 补回 validation note
- 新增 `Change Log`

### 10. Story 缺少 story-level UX 原型锚点

原 Story References 只引用了总 UX 文档，没有把 7-3 专属的 manifest / ux-spec / `.pen` frame 锚点纳入实现上下文。

已修复：

- 增加 7-3 story-level UX 引用
- 明确 `.pen` 主 frame：`7Pbmy`、`9IyPA`、`UlfNE`
- 记录原型导出仅覆盖 trigger / completed / partial，running / failed 以 ux-spec 为准

## 已修改工件

- `_bmad-output/implementation-artifacts/7-3-adversarial-review-execution.md`
- `_bmad-output/implementation-artifacts/7-3-adversarial-review-execution-ux/ux-spec.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`

## 结果

经本轮 `validate-create-story` 复核与原位修正后，Story 7.3 已与以下事实完成必要对齐：

- Epic 7 / PRD 中的 FR45 / FR46 / FR47 / FR48 / NFR7
- 7-2 已落地的 lineup / task-queue / reviewStore / ProjectWorkspace 真实代码基线
- 当前 `aiProxy` 的 desensitize → provider call → restore 实际封装边界
- 现有 `documentService` / `ChapterHeadingLocator` / `scrollToHeading()` 的章节导航协议
- 7-3 story-level UX manifest、PNG 导出与 `.pen` frame 结构
- 总 UX 规划文档中 Stage 5 的高层叙述

本次校验后，未发现仍会阻塞 Story 7.3 开发实施的未解决歧义、矛盾或缺失项。结论为 **PASS**。

## 备注

- 本次仅进行了文档与规划工件修订，未运行代码测试；当前结论针对 story-spec implementation readiness，而非代码正确性。
