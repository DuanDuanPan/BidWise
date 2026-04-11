# Story 7.1: 必做项合规三层校验引擎

Status: review

## Story

As a 售前工程师,
I want 必做项合规在编辑态与导出态持续校验,
so that 我不会在最终交付前遗漏任何一条必须响应的要求。

## Acceptance Criteria (AC)

1. **AC1 — 编辑态实时合规分**
   Given Story 2.6 已产出必做项检测结果，且 Story 2.8 已建立需求-章节追溯关系  
   When 已确认必做项、其 `linkedRequirementId`，或 `traceability_links` 发生变化  
   Then `reviewStore` 在 1 秒内刷新当前项目合规结果，状态栏用 `coveredCount / totalConfirmed * 100` 的整数分展示合规分，并按 `>=80` 绿色、`60-79` 橙色、`<60` 红色编码；`partial`、`uncovered`、`unlinked` 都不能计入 covered；若第一层检测尚未执行，则状态栏显示 `--`，不得伪造 100 分。

2. **AC2 — 导出前最终拦截**
   Given 用户已进入 Story 8.2 / 8.3 的导出预览并点击“确认导出”  
   When `useExportPreview.confirmExport()` 执行  
   Then 必须先调用 `window.api.complianceExportGate({ projectId })`：  
   - `status='pass'`：沿用现有 `exportConfirm()` 流程继续导出  
   - `status='blocked'`：弹出不可关闭 Modal（`closable=false`, `maskClosable=false`, `keyboard=false`），列出全部 `partial` / `uncovered` / `unlinked` 必做项，用户只能显式选择“返回修改”或“仍然导出”；“仍然导出”必须经过二次确认  
   - `status='not-ready'`：提示尚未完成第一层必做项检测，只允许返回修改，不提供强制导出按钮

3. **AC3 — 必做项过滤矩阵与全绿反馈**
   Given 追溯矩阵视图已加载  
   When 用户开启“仅显示必做项”  
   Then `TraceabilityMatrixView` 仅显示 `linkedRequirementId` 命中的已确认必做项行，并在顶部展示 `covered / totalConfirmed` 摘要、进度条、`partial` / `uncovered` / `unlinked` 摘要；若存在 `unlinked` 项，需有明确提示其无法在矩阵中展示；仅当 `totalConfirmed > 0` 且所有已确认必做项都为 `covered` 时，才允许复用现有 `ComplianceCoverageMatrix` 全绿动效。

## Out of Scope

- 第一层必做项识别算法、Prompt 与持久化契约（Story 2.6）
- 追溯矩阵生成逻辑与自动映射算法（Story 2.8）
- 质量分 / 评分仪表盘 UI 与状态栏质量分占位（Story 7.8）
- 导出渲染、保存对话框与 docx 拷贝流程本身（Stories 8.2 / 8.3）
- 新数据库表、迁移或 sidecar 文件格式变更

## Tasks / Subtasks

### Task 1: 共享契约 — 合规类型与 IPC 频道 (AC: #1, #2, #3)

- [x] 1.1 在 `src/shared/analysis-types.ts` 中新增：
  - `MandatoryComplianceStatus = CoverageStatus | 'unlinked'`
  - `MandatoryComplianceItem`：`mandatoryItemId`、`content`、`linkedRequirementId`、`coverageStatus`
  - `MandatoryComplianceResult`：`items`、`totalConfirmed`、`coveredCount`、`partialCount`、`uncoveredCount`、`unlinkedCount`、`complianceRate`
  - `ComplianceGateStatus = 'pass' | 'blocked' | 'not-ready'`
  - `ExportComplianceGate`：`status`、`canExport`、`blockingItems`、`complianceRate`、`message?`
- [x] 1.2 明确契约语义：
  - `complianceRate = totalConfirmed === 0 ? 100 : Math.round((coveredCount / totalConfirmed) * 100)`
  - `blockingItems = coverageStatus in ('partial', 'uncovered', 'unlinked')`
  - `compliance:check` 返回 `MandatoryComplianceResult | null`；`null` 仅表示第一层必做项检测尚未执行
- [x] 1.3 在 `src/shared/ipc-types.ts` 中注册：
  - `compliance:check` → 输入 `{ projectId: string }`，输出 `MandatoryComplianceResult | null`
  - `compliance:export-gate` → 输入 `{ projectId: string }`，输出 `ExportComplianceGate`
  - preload 方法名使用 `complianceCheck` / `complianceExportGate`，与现有 camelCase 规则一致

### Task 2: 主进程服务 — 合规结果计算 (AC: #1, #2, #3)

- [x] 2.1 创建 `src/main/services/compliance-service.ts`
  - 使用 `createLogger('compliance-service')`
  - 复用 `MandatoryItemRepository` 与 `TraceabilityLinkRepository`
  - 通过 `mandatoryItemDetector.getSummary(projectId)` 或等价的 snapshot-aware 读取方式区分：
    - `null`：从未执行第一层检测
    - `{ total: 0 ... }`：检测已执行但没有必做项
- [x] 2.2 实现 `checkMandatoryCompliance(projectId: string): Promise<MandatoryComplianceResult | null>`
  - 只统计 `status === 'confirmed'` 的必做项
  - `linkedRequirementId === null` 或指向已不存在 requirement 时，记为 `unlinked`
  - 对同一 requirement 的覆盖状态判定必须与 Story 2.8 当前矩阵语义保持一致：
    - 有 `covered` 且无显式更差状态 → `covered`
    - 有 `partial`，或同时存在 `covered` / `partial` 与 `uncovered` → `partial`
    - 仅有 `uncovered` 或完全无 link → `uncovered`
  - 返回项列表时按严重度排序：`unlinked` → `uncovered` → `partial` → `covered`
  - 不创建新持久化数据，不走 AI，不走 task-queue
- [x] 2.3 实现 `getMandatoryComplianceForExport(projectId: string): Promise<ExportComplianceGate>`
  - `checkMandatoryCompliance()` 返回 `null` → `status='not-ready'`, `canExport=false`, `blockingItems=[]`
  - 全部已确认必做项为 `covered`，或检测完成后 `totalConfirmed===0` → `status='pass'`
  - 只要存在 `partial` / `uncovered` / `unlinked` → `status='blocked'`
  - `message` 文案要能直接驱动 Modal，无需 renderer 再拼装业务语义

### Task 3: IPC / Preload 注册 (AC: #1, #2)

- [x] 3.1 创建 `src/main/ipc/compliance-handlers.ts`
  - 按 `annotation-handlers.ts` / `export-handlers.ts` 的 handler-map 模式实现
  - 注册 `compliance:check` 与 `compliance:export-gate`
- [x] 3.2 在 `src/main/ipc/index.ts` 中接入 `registerComplianceHandlers()`，并纳入 compile-time exhaustive check
- [x] 3.3 在 `src/preload/index.ts` 中暴露 `complianceCheck()` / `complianceExportGate()`
- [x] 3.4 不修改 `src/preload/index.d.ts` 的手写签名；`FullPreloadApi` 应通过共享类型自动收敛

### Task 4: Renderer Store — `reviewStore` 合规域状态 (AC: #1, #3)

- [x] 4.1 创建 `src/renderer/src/stores/reviewStore.ts`
  - 结构参照 `annotationStore.ts` 的 `projects: Record<string, ProjectState>` 模式，而不是零散的 `Record<string, value>` 字段
  - `ReviewProjectState` 最少包含：`compliance`、`loading`、`error`、`loaded`
  - 使用 `create<ReviewStore>()(subscribeWithSelector(...))`
- [x] 4.2 新增 helper：
  - `createProjectState()`
  - `getReviewProjectState(state, projectId)`
  - `updateProject(state, projectId, patch)`
- [x] 4.3 新增 actions：
  - `checkCompliance(projectId)`：调用 `window.api.complianceCheck({ projectId })`
  - `reset(projectId?)`
- [x] 4.4 在 `src/renderer/src/stores/index.ts` 中导出 `useReviewStore`、`getReviewProjectState`
- [x] 4.5 命名遵循现有约定：只使用 `loading`，禁止 `isLoading` / `complianceLoading`

### Task 5: 状态栏集成 — 仅替换合规分位 (AC: #1)

- [x] 5.1 修改 `src/renderer/src/modules/project/components/StatusBar.tsx`
  - 新增 props：`complianceRate?: number | null`, `complianceLoading?: boolean`, `complianceReady?: boolean`
  - 保留现有 `wordCount`、`leftExtra`、`质量分 --` 占位，不把 PNG 中的“已保存时间”强行改进状态栏右侧
  - 用中性状态点 / spinner 表达合规状态，不要复用 `CheckCircleOutlined` 作为橙色 / 红色 / 未就绪态图标
  - 展示规则：
    - `complianceLoading=true` → spinner + `合规分 --`
    - `complianceReady=false` → 灰色状态点 + `合规分 --`
    - `complianceRate` 数值 → 彩色状态点 + `合规分 {rate}`
  - 颜色阈值：`>=80` 绿色，`60-79` 橙色，`<60` 红色
  - 增加稳定 `data-testid`，不要破坏现有 `status-compliance`
- [x] 5.2 修改 `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
  - 使用 `useReviewStore()` 获取当前项目合规状态
  - 挂载 `useComplianceAutoRefresh(projectId)`
  - 将 `complianceRate` / `complianceLoading` / `complianceReady` 传给 `StatusBar`
  - 不改变现有 `AutoSaveIndicator` 与导出预览挂载位置

### Task 6: 导出前合规拦截 — Hook 主导，Modal 展示 (AC: #2)

- [x] 6.1 创建 `src/renderer/src/modules/export/components/ComplianceGateModal.tsx`
  - `Modal` 必须 `closable={false}`, `maskClosable={false}`, `keyboard={false}`
  - `status='blocked'`：
    - 标题与布局按 UX 原型
    - 列出 `blockingItems`，`uncovered` / `unlinked` 用红色 Tag，`partial` 用橙色 Tag
    - 显示合规率进度条
    - 按钮：`返回修改`、`仍然导出`
  - `status='not-ready'`：
    - 显示“尚未完成必做项检测，请先返回分析阶段执行检测”
    - 仅显示 `返回修改`
  - `仍然导出` 必须经过二次确认（`Modal.confirm` / `Popconfirm` 均可）
- [x] 6.2 修改 `src/renderer/src/modules/export/hooks/useExportPreview.ts`
  - 扩展 state：`complianceGateOpen`, `complianceGateData`, `complianceGateChecking`
  - 新增 actions：`closeComplianceGate()`, `forceExport()`
  - 将当前真正执行 `window.api.exportConfirm()` 的逻辑抽成私有 helper，供 `confirmExport()` 与 `forceExport()` 复用，避免复制两份导出逻辑
  - `confirmExport()` 流程：
    1. 调用 `window.api.complianceExportGate({ projectId })`
    2. `status='pass'` → 继续既有导出
    3. `status='blocked' | 'not-ready'` → 打开 `ComplianceGateModal`，保持 preview modal 继续打开
- [x] 6.3 `ProjectWorkspace.tsx` 负责渲染 `ComplianceGateModal`
  - 不把合规逻辑塞进 `ExportPreviewModal.tsx`
  - `ExportPreviewModal` 仍保持“预览展示 + 点击确认导出”的纯展示职责

### Task 7: 追溯矩阵必做项视图 (AC: #3)

- [x] 7.1 修改 `src/renderer/src/modules/analysis/components/TraceabilityMatrixView.tsx`
  - 新增“仅显示必做项”开关
  - 读取 `reviewStore` 当前项目合规结果；不要直接重新计算合规统计
  - `toggle on` 时仅保留 `requirementId ∈ confirmedMandatoryLinkedRequirementIds` 的行
- [x] 7.2 构造 `filteredMatrix` 时同步覆盖 `stats`
  - `stats` 必须基于 `MandatoryComplianceResult` 重新组装，而不是沿用原始 `traceabilityMatrix.stats`
  - 为避免误触发全绿动画，`totalRequirements` 应对应 `totalConfirmed`
  - `unlinkedCount` 需要计入 `filteredMatrix.stats.uncoveredCount` 的等效阻塞量，即使这些项没有可展示的 matrix row
- [x] 7.3 在矩阵顶部新增摘要条
  - 显示 `必做项覆盖 coveredCount / totalConfirmed`
  - 进度条基于 `complianceRate`
  - Badge / Tag 至少显示 `partial`、`uncovered`、`unlinked`
  - `unlinkedCount > 0` 时显示明确提示：这些项尚未关联 requirement，因此不会出现在矩阵行中
- [x] 7.4 保持 `ComplianceCoverageMatrix.tsx` 不改业务逻辑
  - 不在该组件里新增“必做项”分支
  - 通过派生 `filteredMatrix` + 覆盖 `stats` 实现 Story 7.1 需求

### Task 8: 自动刷新 Hook (AC: #1, #3)

- [x] 8.1 创建 `src/renderer/src/modules/review/hooks/useComplianceAutoRefresh.ts`
  - mount 时先执行一次 `checkCompliance(projectId)`
  - 使用 `useAnalysisStore.subscribe` + `subscribeWithSelector` 监听最小必要切片：
    - 已确认 `mandatoryItems` 的数量、id、`linkedRequirementId`
    - `traceabilityMatrix?.updatedAt`
  - 1000ms 防抖，避免矩阵批量更新时重复触发
  - unmount 时清理 subscription 和 debounce timer
- [x] 8.2 约束：
  - `reviewStore` 不直接调用 `analysisStore` 的 actions
  - 合规刷新 orchestration 全部放在 hook / 组件层，不放在 store action 内跨 store 调用

### Task 9: 测试与回归验证 (AC: #1, #2, #3)

- [x] 9.1 `tests/unit/main/services/compliance-service.test.ts`
  - 覆盖：全部 covered、partial、uncovered、unlinked、混合场景
  - 覆盖：检测未执行返回 `null`
  - 覆盖：检测已执行但 0 个 confirmed 返回 100 分
  - 覆盖：排序严重度与 `ExportComplianceGate.status`
- [x] 9.2 `tests/unit/main/ipc/compliance-handlers.test.ts`
  - 校验 handler 注册、分发与错误包装
- [x] 9.3 `tests/unit/renderer/stores/reviewStore.test.ts`
  - 覆盖 `loaded` / `loading` / `error` / `compliance` 生命周期
- [x] 9.4 扩展现有 renderer 测试：
  - `tests/unit/renderer/project/StatusBar.test.tsx`
  - `tests/unit/renderer/project/ProjectWorkspace.test.tsx`
  - `tests/unit/renderer/modules/export/hooks/useExportPreview.test.ts`
  - `tests/unit/renderer/modules/analysis/TraceabilityMatrixView.test.tsx`
- [x] 9.5 新增 `tests/unit/renderer/modules/export/components/ComplianceGateModal.test.tsx`
  - `blocked` / `not-ready` 两种 Modal 状态
  - `Esc`、遮罩点击、右上角关闭均不可关闭
  - “仍然导出”二次确认路径
- [x] 9.6 新增 `tests/unit/renderer/modules/review/hooks/useComplianceAutoRefresh.test.ts`
  - 验证 debounce 与 subscription cleanup
- [x] 9.7 新增 E2E：`tests/e2e/stories/story-7-1-mandatory-item-compliance-engine.spec.ts`
  - 覆盖状态栏分数刷新
  - 覆盖 mandatory-only toggle + summary bar
  - 覆盖 export blocked modal、返回修改、强制导出二次确认

## Dev Notes

### 业务语义与判定边界

- 本 Story 交付 FR49 的第二层和第三层；第一层识别由 Story 2.6 提供，不能在 7.1 中重做或替换
- “不可跳过的强制确认对话框”指：用户不能通过 `Esc`、点击遮罩、右上角关闭按钮绕开 Modal，但在 `blocked` 状态下仍可以承担风险后显式强制导出
- `partial` 属于“未完全覆盖”，必须出现在拦截列表里，不能计入 `coveredCount`

### 与现有实现保持一致的覆盖规则

- `TraceabilityMatrixService.computeStats()` 当前 `coverageRate` 只按 `coveredCount / totalRequirements` 计算；7.1 的 `complianceRate` 必须沿用同一语义，不能把 `partial` 算作已覆盖，否则会与现有矩阵覆盖率和导出拦截语义冲突
- 对同一 requirement 同时存在 `covered` 与 `uncovered` link 时，按 `partial` 处理；不要自行发明第五种状态

### 现有基础设施（必须复用）

| 组件 | 路径 | 本 Story 用法 |
|------|------|---------------|
| `MandatoryItemRepository` | `src/main/db/repositories/mandatory-item-repo.ts` | 读取 `confirmed` 必做项 |
| `mandatoryItemDetector` | `src/main/services/document-parser/mandatory-item-detector.ts` | 复用“未执行检测 vs 已执行 0 项”的语义 |
| `TraceabilityLinkRepository` | `src/main/db/repositories/traceability-link-repo.ts` | 读取 requirement → section 覆盖链接 |
| `TraceabilityMatrixService` | `src/main/services/document-parser/traceability-matrix-service.ts` | 对齐覆盖状态优先级与 coverageRate 语义 |
| `annotationStore` | `src/renderer/src/stores/annotationStore.ts` | 作为 `reviewStore` 结构参考 |
| `StatusBar` | `src/renderer/src/modules/project/components/StatusBar.tsx` | 替换合规占位，保留其它位 |
| `useExportPreview` | `src/renderer/src/modules/export/hooks/useExportPreview.ts` | 在确认导出前插入 gate |
| `ExportPreviewModal` | `src/renderer/src/modules/export/components/ExportPreviewModal.tsx` | 保持展示职责，不承载业务 gate |
| `TraceabilityMatrixView` | `src/renderer/src/modules/analysis/components/TraceabilityMatrixView.tsx` | 新增过滤与摘要 |
| `ComplianceCoverageMatrix` | `src/renderer/src/modules/analysis/components/ComplianceCoverageMatrix.tsx` | 直接复用全绿动效，不改内部逻辑 |

### 关键实现流

```text
ProjectWorkspace mount
  → useComplianceAutoRefresh(projectId)
    → reviewStore.checkCompliance(projectId)
      → IPC compliance:check
        → compliance-service.checkMandatoryCompliance()

用户点击“确认导出”
  → useExportPreview.confirmExport()
    → IPC compliance:export-gate
      → status=pass      → 继续现有 exportConfirm()
      → status=blocked   → 打开 ComplianceGateModal（可二次确认后强制导出）
      → status=not-ready → 打开 ComplianceGateModal（仅返回修改）
```

### Project Structure Notes

- 新建：
  - `src/main/services/compliance-service.ts`
  - `src/main/ipc/compliance-handlers.ts`
  - `src/renderer/src/stores/reviewStore.ts`
  - `src/renderer/src/modules/export/components/ComplianceGateModal.tsx`
  - `src/renderer/src/modules/review/hooks/useComplianceAutoRefresh.ts`
- 修改：
  - `src/shared/analysis-types.ts`
  - `src/shared/ipc-types.ts`
  - `src/preload/index.ts`
  - `src/main/ipc/index.ts`
  - `src/renderer/src/stores/index.ts`
  - `src/renderer/src/modules/project/components/StatusBar.tsx`
  - `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
  - `src/renderer/src/modules/export/hooks/useExportPreview.ts`
  - `src/renderer/src/modules/analysis/components/TraceabilityMatrixView.tsx`
- 明确不改：
  - `src/main/db/migrations/*`
  - `src/main/services/document-parser/mandatory-item-detector.ts`
  - `src/main/services/document-parser/traceability-matrix-service.ts` 的 AI / 生成流程
  - `src/renderer/src/modules/analysis/components/ComplianceCoverageMatrix.tsx`
  - `src/main/services/export-service.ts` 的导出复制语义

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 7 Story 7.1]
- [Source: _bmad-output/planning-artifacts/prd.md — FR49 / FR53 / FR54]
- [Source: _bmad-output/planning-artifacts/architecture.md — Zustand store 模式、IPC handler 模式、modules/review 规划、loading 命名约定]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — 强制拦截使用 Modal、Danger 操作需二次确认]
- [Source: _bmad-output/implementation-artifacts/7-1-mandatory-item-compliance-engine-ux/prototype.manifest.yaml]
- [Source: _bmad-output/implementation-artifacts/7-1-mandatory-item-compliance-engine-ux/ux-spec.md]
- [Source: _bmad-output/implementation-artifacts/2-6-mandatory-item-detection.md]
- [Source: _bmad-output/implementation-artifacts/2-8-traceability-matrix.md]
- [Source: _bmad-output/implementation-artifacts/8-2-export-preview.md]
- [Source: _bmad-output/implementation-artifacts/8-3-one-click-docx-export.md]
- [Source: src/main/db/repositories/mandatory-item-repo.ts]
- [Source: src/main/db/repositories/traceability-link-repo.ts]
- [Source: src/main/services/document-parser/traceability-matrix-service.ts]
- [Source: src/main/ipc/analysis-handlers.ts]
- [Source: src/main/ipc/export-handlers.ts]
- [Source: src/renderer/src/stores/annotationStore.ts]
- [Source: src/renderer/src/modules/project/components/StatusBar.tsx]
- [Source: src/renderer/src/modules/project/components/ProjectWorkspace.tsx]
- [Source: src/renderer/src/modules/export/hooks/useExportPreview.ts]
- [Source: src/renderer/src/modules/analysis/components/TraceabilityMatrixView.tsx]
- [Source: src/renderer/src/modules/analysis/components/ComplianceCoverageMatrix.tsx]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- preload security test needed update to include new compliance methods in allowlist
- analysisStore does not use subscribeWithSelector; useComplianceAutoRefresh uses fingerprint-based change detection with plain subscribe

### Completion Notes List

- Task 1: Added `MandatoryComplianceStatus`, `MandatoryComplianceItem`, `MandatoryComplianceResult`, `ComplianceGateStatus`, `ExportComplianceGate` types to shared/analysis-types.ts. Registered `compliance:check` and `compliance:export-gate` IPC channels with compile-time exhaustive check.
- Task 2: Created `compliance-service.ts` with `checkMandatoryCompliance()` (reads confirmed mandatory items, validates linked requirements exist, computes per-requirement coverage matching traceability matrix semantics) and `getMandatoryComplianceForExport()` (returns pass/blocked/not-ready gate status with message).
- Task 3: Created `compliance-handlers.ts` following handler-map pattern, registered in `ipc/index.ts` with exhaustive check. Added preload methods `complianceCheck`/`complianceExportGate`.
- Task 4: Created `reviewStore.ts` with per-project state pattern (compliance, loading, error, loaded), helpers (createProjectState, getReviewProjectState, updateProject), and actions (checkCompliance, reset). Exported from stores/index.ts.
- Task 5: Modified StatusBar to accept `complianceRate`, `complianceLoading`, `complianceReady` props. Shows spinner/gray dot/colored dot based on state. Color thresholds: >=80 green, 60-79 orange, <60 red. Wired in ProjectWorkspace.
- Task 6: Created ComplianceGateModal (closable=false, maskClosable=false, keyboard=false) with blocked/not-ready states and two-step force export confirmation. Modified useExportPreview to intercept confirmExport with compliance gate check, extracted doExportConfirm as shared helper.
- Task 7: Modified TraceabilityMatrixView with mandatory-only toggle. When on, filters matrix rows to mandatory-linked requirements, overrides stats from MandatoryComplianceResult (unlinkedCount counts as uncoveredCount equivalent). Added summary bar with coverage progress and unlinked warning.
- Task 8: Created useComplianceAutoRefresh hook with mount-time check, fingerprint-based change detection on analysisStore (mandatory items + matrix updatedAt), 1000ms debounce, and cleanup on unmount.
- Task 9: 15 new compliance-service tests, 5 handler tests, 10 reviewStore tests, 5 StatusBar tests, 9 ComplianceGateModal tests, 3 useComplianceAutoRefresh tests. Updated preload security test. All 1608 tests pass, 0 regressions. Lint clean.

### Change Log

- 2026-04-11: Story 7.1 implementation — mandatory item compliance engine with three-layer validation (edit-time score, export gate, matrix filter)

### File List

**New files:**
- src/main/services/compliance-service.ts
- src/main/ipc/compliance-handlers.ts
- src/renderer/src/stores/reviewStore.ts
- src/renderer/src/modules/export/components/ComplianceGateModal.tsx
- src/renderer/src/modules/review/hooks/useComplianceAutoRefresh.ts
- tests/unit/main/services/compliance-service.test.ts
- tests/unit/main/ipc/compliance-handlers.test.ts
- tests/unit/renderer/stores/reviewStore.test.ts
- tests/unit/renderer/modules/export/components/ComplianceGateModal.test.tsx
- tests/unit/renderer/modules/review/hooks/useComplianceAutoRefresh.test.ts

**Modified files:**
- src/shared/analysis-types.ts
- src/shared/ipc-types.ts
- src/preload/index.ts
- src/main/ipc/index.ts
- src/renderer/src/stores/index.ts
- src/renderer/src/modules/project/components/StatusBar.tsx
- src/renderer/src/modules/project/components/ProjectWorkspace.tsx
- src/renderer/src/modules/export/hooks/useExportPreview.ts
- src/renderer/src/modules/analysis/components/TraceabilityMatrixView.tsx
- tests/unit/renderer/project/StatusBar.test.tsx
- tests/unit/preload/security.test.ts
