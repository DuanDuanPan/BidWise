# Story 2.8: 需求-方案双向追溯矩阵

Status: ready-for-dev

## Story

As a 售前工程师,
I want 招标需求与方案内容之间的双向追溯矩阵,
So that 我能确保每条需求都被方案覆盖，补遗变更时精确定位影响。

## Acceptance Criteria

1. **Given** 需求清单（Story 2.5）和方案骨架（Story 3.3）已存在，**When** 用户在分析视图点击「生成追溯矩阵」，**Then** 系统通过 LLM 自动建立每条招标需求到对应方案章节的映射，每个方案章节反向链接到源需求，结果持久化到 SQLite `traceability_links` 表（FR16）。

2. **Given** 追溯矩阵已生成，**When** 用户查看合规覆盖矩阵视图，**Then** 以需求条目×方案章节交叉矩阵展示覆盖情况：已覆盖（绿色）、未覆盖（红色，必须存在显式 link）、部分覆盖（橙色）、无关联（灰色 N/A）；点击未覆盖/部分覆盖单元格可切换到方案编辑阶段并定位到对应章节（存在 locator 时），无关联单元格支持手动创建映射（UX-DR14）。

3. **Given** 招标方发布补遗/变更通知，**When** 用户导入补遗文件（PDF/Word/文本粘贴），**Then** 系统通过 extract agent 的补遗模式解析新增/变更需求条目，在保留手动映射的前提下重新生成自动追溯关系，并高亮受影响的矩阵单元格与方案章节（FR17）。

4. **Given** 追溯矩阵展示中，**When** 用户手动创建/删除/调整映射关系，**Then** 变更即时反映在矩阵视图中，同时持久化到数据库。

5. **Given** 需求清单或方案骨架发生变更（新增/删除需求或章节），**When** 用户刷新追溯矩阵，**Then** 系统重新生成自动映射，保留全部 `source='manual'` 链接；任何被用户改写过的自动链接必须先转为 `manual` 再参与后续保留逻辑。

6. **Given** 所有需求均已覆盖（全绿），**When** 矩阵渲染完成，**Then** 逐项翻绿闪烁动效反馈（UX-DR14）。

## Tasks / Subtasks

### Task 1: 数据层 — `traceability_links` 表与仓库 (AC: #1, #4, #5)

- [ ] 1.1 在 `src/main/db/schema.ts` 中新增 `TraceabilityLinkTable` 接口
  - 字段：id (TEXT PK), projectId (TEXT FK→projects), requirementId (TEXT FK→requirements), sectionId (TEXT 稳定章节 ID), sectionTitle (TEXT 冗余标题), coverageStatus (TEXT: `'covered' | 'partial' | 'uncovered'`), confidence (REAL 0-1), matchReason (TEXT nullable), source (TEXT: `'auto' | 'manual'`), createdAt (TEXT ISO-8601), updatedAt (TEXT ISO-8601)
  - 在 `Database` 接口中新增 `traceabilityLinks: TraceabilityLinkTable`
- [ ] 1.2 创建迁移文件 `src/main/db/migrations/007_create_traceability_links.ts`
  - 建表 `traceability_links`
  - 索引：`project_id`、`(project_id, requirement_id)`、`(project_id, section_id)`
  - `(project_id, requirement_id, section_id)` 唯一约束防重复映射
  - `project_id` FK → `projects(id)` ON DELETE CASCADE
  - `requirement_id` FK → `requirements(id)` ON DELETE CASCADE
- [ ] 1.3 创建 `src/main/db/repositories/traceability-link-repo.ts`
  - `replaceAutoByProject(projectId, links[])`：事务内仅替换 `source='auto'` 的记录，保留 `manual`
  - `findByProject(projectId)`：返回项目全部链接；不在 repository 层做业务排序
  - `findByRequirement(projectId, requirementId)` / `findBySection(projectId, sectionId)`
  - `create(link)`：手动创建单条链接，插入前检查唯一约束
  - `update(id, patch)`：允许更新 `coverageStatus`、`source`、`matchReason`
  - `delete(id)`：单条删除
  - `deleteByProject(projectId)`：按项目清除全部
- [ ] 1.4 在 `src/main/db/migrator.ts` 中显式注册 `007_create_traceability_links`

### Task 2: 共享契约 — `proposal.meta.json` 章节索引 + Traceability 类型 (AC: #1, #2, #3, #4, #5)

- [ ] 2.1 在 `src/shared/template-types.ts` 中新增 `ProposalSectionIndexEntry`
  - 字段：`sectionId`, `title`, `level`, `parentSectionId?`, `order`, `occurrenceIndex`, `headingLocator`, `weightPercent?`, `isKeyFocus?`
  - `headingLocator` 直接复用 `src/shared/chapter-types.ts` 中的 `ChapterHeadingLocator`
- [ ] 2.2 在 `src/shared/models/proposal.ts` 中扩展 `ProposalMetadata`
  - 新增 `sectionIndex?: ProposalSectionIndexEntry[]`
  - 保留既有 `sectionWeights` / `templateId`，但追溯矩阵列定义以后续 `sectionIndex` 为准
- [ ] 2.3 在 `src/main/services/document-service.ts` 与 `src/main/services/template-service.ts` 中同步扩展 `proposal.meta.json` 的读写
  - Story 3.3 生成/持久化骨架时，必须同时写入完整 `sectionIndex`
  - 兼容旧项目：`sectionIndex` 缺失时不报错，由 Story 2.8 在读取 `proposal.md` 时兜底合成临时索引
- [ ] 2.4 在 `src/shared/analysis-types.ts` 末尾新增 `// ─── Story 2.8: Traceability Matrix ───` 区块
  - `CoverageStatus` = `'covered' | 'partial' | 'uncovered'`
  - `TraceabilityLinkSource` = `'auto' | 'manual'`
  - `TraceabilityCellState` = `CoverageStatus | 'none'`
  - `TraceabilityLink`：补充 `matchReason?: string | null`
  - `TraceabilityMatrixCell`：`requirementId`, `requirementDescription`, `requirementSequence`, `sectionId`, `sectionTitle`, `cellState`, `coverageStatus: CoverageStatus | null`, `confidence`, `source`, `matchReason`, `linkId`, `isImpacted`
  - `TraceabilityMatrixColumn`：`sectionId`, `title`, `level`, `parentSectionId?`, `order`, `occurrenceIndex`, `weightPercent?`, `headingLocator?: ChapterHeadingLocator | null`
  - `TraceabilityMatrixRow`：`requirementId`, `sequenceNumber`, `description`, `category`, `cells`
  - `TraceabilityStats`：`totalRequirements`, `coveredCount`, `partialCount`, `uncoveredCount`, `coverageRate`
  - `TraceabilityMatrix`：`projectId`, `rows`, `columns`, `stats`, `generatedAt`, `updatedAt`, `recentlyImpactedSectionIds`, `recentlyAddedRequirementIds`
  - `GenerateMatrixInput` / `GenerateMatrixResult` / `GetMatrixInput`
  - `CreateLinkInput`：`projectId`, `requirementId`, `sectionId`, `coverageStatus`
  - `UpdateLinkInput`：`id`, `patch: Partial<Pick<TraceabilityLink, 'coverageStatus' | 'matchReason'>>`
  - `DeleteLinkInput`：`id`
  - `ImportAddendumInput`：`projectId`, `content?: string`, `filePath?: string`, `fileName?: string`，必须至少提供 `content` 或 `filePath` 之一
  - `ImportAddendumResult`：`taskId`
- [ ] 2.5 在 `src/shared/constants.ts` 中新增 `ErrorCode.MATRIX_GENERATION_FAILED`、`ErrorCode.ADDENDUM_PARSE_FAILED`
- [ ] 2.6 在 `src/shared/ipc-types.ts` 中新增频道与映射
  - `analysis:generate-matrix`
  - `analysis:get-matrix`
  - `analysis:get-matrix-stats`
  - `analysis:create-link`
  - `analysis:update-link`
  - `analysis:delete-link`
  - `analysis:import-addendum`
- [ ] 2.7 在 `src/shared/ai-types.ts` 中将 `AgentType` 扩展新增 `'traceability'`

### Task 3: Prompt 层 — 追溯映射与补遗提取 (AC: #1, #3)

- [ ] 3.1 创建 `src/main/prompts/generate-traceability.prompt.ts`
  - 导出类型化函数 `(context: TraceabilityPromptContext) => string`
  - Context：`{ requirements; sections; existingManualLinks? }`
  - 输出 JSON 数组：`[{ requirementId, sectionMappings: [{ sectionId, coverageStatus, confidence, reason }] }]`
  - 明确要求：仅返回存在 link 的章节；不要为无映射 requirement 伪造 `uncovered` 数据库记录
  - 当 `existingManualLinks` 非空时，提示模型避开与手动映射冲突的自动输出
- [ ] 3.2 创建 `src/main/prompts/extract-addendum.prompt.ts`
  - 输出与需求抽取兼容的 requirement 条目，只提取补遗中新出现或被实质变更的要求
  - 明确这是“补遗/变更通知”语境，不重复回传未变化的原始需求
- [ ] 3.3 在 `src/main/prompts/index.ts` 中导出上述新 prompt

### Task 4: Agent 编排 — `traceability-agent` + extract addendum mode (AC: #1, #3)

- [ ] 4.1 创建 `src/main/services/agent-orchestrator/agents/traceability-agent.ts`
  - 导出 `traceabilityAgentHandler: AgentHandler`
  - 接收 context: `{ requirements, sections, existingManualLinks }`
  - 返回低温度 (`temperature: 0.2`) 的高精确度映射请求
- [ ] 4.2 在 `src/main/services/agent-orchestrator/index.ts` 的真实注册入口注册 `traceability`
- [ ] 4.3 扩展 `src/main/services/agent-orchestrator/agents/extract-agent.ts`
  - 本地 `ExtractMode` 增加 `'addendum-requirements'`
  - `mode === 'addendum-requirements'` 时调用 `extract-addendum.prompt.ts`
  - 保持 `requirements-scoring` / `mandatory-items` 既有行为不变

### Task 5: 后端服务 — `TraceabilityMatrixService` (AC: #1, #3, #4, #5)

- [ ] 5.1 创建 `src/main/services/document-parser/traceability-matrix-service.ts`
  - 单例模式，风格对齐 `mandatory-item-detector.ts` / `strategy-seed-generator.ts`
  - 依赖：`RequirementRepository`, `TraceabilityLinkRepository`, `ProjectRepository`
  - 维护项目根目录快照文件：`{rootPath}/traceability-matrix.json`
- [ ] 5.2 `generate(input: GenerateMatrixInput)` 方法
  1. 加载项目与 requirements；若 requirement 为空则抛 `BidWiseError`
  2. 优先从 `proposal.meta.json.sectionIndex` 读取章节列定义；若缺失则从 `proposal.md` 用 `extractMarkdownHeadings()` 合成临时 section index，并为每列生成 `ChapterHeadingLocator`
  3. 若 `proposal.meta.json` 与 `proposal.md` 均不存在，则返回可展示错误“请先生成方案骨架”
  4. 加载全部 `source='manual'` 的链接作为保护集
  5. 通过 `taskQueue.enqueue({ category: 'import', input: { projectId, fileName: 'traceability-matrix' } })` 建立外层任务；`tasks.input` 只写最小元数据，不写原始 proposal / addendum 文本
  6. `taskQueue.execute(taskId, executor)` 内部：
     - 构建 traceability prompt 上下文
     - 调用 `agentOrchestrator.execute({ agentType: 'traceability', ... })`
     - 解析 JSON（兼容 code fence / 裸 JSON / 包裹对象）
     - 校验 `requirementId` / `sectionId`
     - 将模型返回映射展开为 auto links 并调用 `replaceAutoByProject(projectId, links)`
     - 不为无映射 requirement 额外写入 `uncovered` 记录；无 link 的 cell 由 `getMatrix()` 渲染为灰色 `N/A`
     - 生成并写入 `traceability-matrix.json` 快照：`links`, `stats`, `generatedAt`, `updatedAt`, `recentlyImpactedSectionIds`, `recentlyAddedRequirementIds`
  7. 返回 `{ taskId }`
- [ ] 5.3 `getMatrix(projectId)` 方法
  - 加载 requirements、traceability links、section index / heading fallback、快照
  - requirements 行排序：按 `sequenceNumber`
  - columns 排序：按 `sectionIndex.order`
  - cell 语义：
    - `linkId === null` → `cellState='none'`，灰色 N/A
    - 显式 `coverageStatus='uncovered'` → 红色
    - `partial` / `covered` 直接渲染
  - `null` 语义：仅在“尚未生成过且没有快照也没有 links”时返回 `null`
- [ ] 5.4 `getStats(projectId)` 方法
  - 以 requirement 为粒度计算有效状态：
    - 存在任一显式 `uncovered`，或完全无 link → uncovered
    - 否则存在任一 `partial` → partial
    - 否则（至少一个 covered，且无 partial / uncovered）→ covered
- [ ] 5.5 CRUD 语义
  - `createLink(input)`：创建 `source='manual'` link，并刷新快照
  - `updateLink(id, patch)`：若目标 link 当前为 `auto`，任何用户编辑都先转为 `manual`
  - `deleteLink(id)`：仅允许删除 `manual` link；若用户要否决 auto link，应改为 `coverageStatus='uncovered'` 并转为 `manual`
- [ ] 5.6 `importAddendum(input: ImportAddendumInput)` 方法
  - `.txt` 支持 renderer 传 `content`
  - `.pdf/.doc/.docx` 支持 renderer 传 `filePath` + `fileName`，正文提取在 main 进程完成，复用现有 tender import 解析能力
  - 使用 extract agent 的 `addendum-requirements` 模式提取新增/变更 requirement
  - 将新 requirement 插入 `requirements` 表，`sequenceNumber` 从现有最大值递增
  - 导入完成后执行“全量自动映射重算 + 手动映射保留”，而不是仅对新增 requirement 做局部 replace
  - 对比导入前后快照，填充 `recentlyImpactedSectionIds` 与 `recentlyAddedRequirementIds`
- [ ] 5.7 在 `src/main/services/document-parser/index.ts` 导出单例：`export const traceabilityMatrixService = new TraceabilityMatrixService()`

### Task 6: IPC / preload 接线 (AC: #1, #3, #4)

- [ ] 6.1 在 `src/main/ipc/analysis-handlers.ts` 中注册 7 个新频道
  - `analysis:generate-matrix`
  - `analysis:get-matrix`
  - `analysis:get-matrix-stats`
  - `analysis:create-link`
  - `analysis:update-link`
  - `analysis:delete-link`
  - `analysis:import-addendum`
  - 维持现有薄分发模式：参数解析 → service → `ApiResponse`
- [ ] 6.2 在 `src/preload/index.ts` 与 `src/preload/index.d.ts` 中暴露并声明对应 API

### Task 7: Renderer 状态与任务监控 (AC: #1, #2, #3, #4, #5, #6)

- [ ] 7.1 在 `src/renderer/src/stores/analysisStore.ts` 的 `AnalysisProjectState` 中新增字段
  - `traceabilityMatrix: TraceabilityMatrix | null`
  - `traceabilityStats: TraceabilityStats | null`
  - `matrixGenerationTaskId`, `matrixGenerationProgress`, `matrixGenerationMessage`, `matrixGenerationLoading`, `matrixGenerationError`
  - `addendumImportTaskId`, `addendumImportProgress`, `addendumImportMessage`, `addendumImportLoading`, `addendumImportError`
- [ ] 7.2 新增 actions
  - `generateMatrix(projectId)`
  - `fetchMatrix(projectId)`
  - `fetchMatrixStats(projectId)`
  - `createLink(...)`
  - `updateLink(...)`
  - `deleteLink(...)`
  - `importAddendum(projectId, input)`
  - `updateMatrixGenerationProgress(projectId, progress, message?)`
  - `setMatrixGenerationCompleted(projectId)`
  - `updateAddendumImportProgress(projectId, progress, message?)`
  - `setAddendumImportCompleted(projectId)`
- [ ] 7.3 扩展错误与任务映射
  - `setError(projectId, error, taskKind)` 的 `taskKind` 新增 `'matrix' | 'addendum'`
  - `EMPTY_ANALYSIS_PROJECT_STATE` 初始化默认值
  - `findAnalysisProjectIdByTaskId()` 纳入 `matrixGenerationTaskId`、`addendumImportTaskId`
- [ ] 7.4 扩展 `src/renderer/src/modules/analysis/hooks/useAnalysis.ts`
  - `TaskKind` / task monitor 识别 `'matrix' | 'addendum'`
  - 与现有 `useAnalysisTaskMonitor` 模式保持一致，进度消息回写 store

### Task 8: UI 组件与跨阶段导航 (AC: #2, #3, #4, #6)

- [ ] 8.1 创建 `src/renderer/src/modules/analysis/components/TraceabilityMatrixView.tsx`
  - 集成到 AnalysisView Tab
  - 顶部操作栏：生成/重新生成、导入补遗、统计 badges
  - 状态：从未生成、前置缺失、生成中、错误、结果态
  - 导入补遗完成后，如果 `recentlyImpactedSectionIds` / `recentlyAddedRequirementIds` 非空，显示一次性“已更新 X 个需求 / Y 个章节受影响”的提示
- [ ] 8.2 创建 `src/renderer/src/modules/analysis/components/ComplianceCoverageMatrix.tsx`
  - 评分族视觉风格，对齐 UX-DR14
  - 行头按 requirement `sequenceNumber` 排序；列头按 `sectionIndex.order`
  - 单元格展示 `matchReason`、`confidence`、`source`
  - 交互：
    - `none` cell：允许创建 manual link
    - `covered` / `partial` / `uncovered` cell：Popover 展示详情
    - 右键菜单：创建链接 / 更新状态；仅 `manual` link 提供删除
    - 用户对 auto link 执行任一状态修改时，UI 文案明确显示“将转为手动映射”
  - 章节跳转：
    - 不通过 `documentStore` 直接滚动
    - 使用 `TraceabilityMatrixColumn.headingLocator`
    - 通过 workspace 层切换到 `proposal-writing`，待编辑器挂载后调用 `scrollToHeading()`
    - 若 locator 缺失，仅保留当前矩阵高亮并给出非阻塞提示
  - 受补遗影响的行/列/cell 增加蓝色高亮轮廓或脉冲
  - Alpha 阶段不引入 `react-window`；使用现有 Ant Design + CSS sticky + overflow 完成滚动体验
- [ ] 8.3 创建 `src/renderer/src/modules/analysis/components/AddendumImportModal.tsx`
  - Modal 标题："导入招标补遗/变更通知"
  - 输入：TextArea + `Upload`（`.pdf,.docx,.doc,.txt`）
  - `.txt` 使用 `FileReader`
  - `.pdf/.doc/.docx` 保留 Electron `File.path` 与 `fileName`，提交给 main 进程解析
  - Props：`open`, `onImport(input: { content?: string; filePath?: string; fileName?: string })`, `onCancel`
  - “开始解析” 按钮在 `content` 与 `filePath` 同时为空时禁用
- [ ] 8.4 在 `src/renderer/src/modules/analysis/components/AnalysisView.tsx` 中新增「追溯矩阵」Tab
  - 位于「策略种子」Tab 之后
  - Tab 始终可点击进入，以便展示前置条件说明
  - 当前置条件缺失时使用 muted 样式 + tooltip，而不是彻底 disabled
  - Badge 显示未覆盖数 / 覆盖率 / 全绿状态
- [ ] 8.5 在 `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`（或同级 workspace 状态承载点）实现跨阶段章节跳转桥接
  - 持有待跳转的 `ChapterHeadingLocator`
  - 从 analysis stage 切到 `proposal-writing`
  - editor DOM 就绪后调用 `scrollToHeading(document.querySelector('[data-editor-scroll-container=\"true\"]'), locator)`

### Task 9: 测试 (AC: #1-#6)

- [ ] 9.1 `tests/unit/main/db/repositories/traceability-link-repo.test.ts`
  - `replaceAutoByProject()` 保留 manual
  - 唯一约束
  - 需求删除级联清理
  - `matchReason` 持久化
- [ ] 9.2 `tests/unit/main/services/document-parser/traceability-matrix-service.test.ts`
  - `generate()`：解析 LLM JSON、合法性校验、快照写入
  - `getMatrix()`：N/A vs explicit uncovered 语义正确
  - `getStats()`：按 requirement 粒度统计
  - `importAddendum()`：新 requirement 插入、全量自动映射重算、受影响章节 diff
  - 兼容旧项目：`proposal.meta.json.sectionIndex` 缺失时从 `proposal.md` headings 回退
- [ ] 9.3 Prompt / Agent 测试
  - `tests/unit/main/prompts/generate-traceability.prompt.test.ts`
  - `tests/unit/main/prompts/extract-addendum.prompt.test.ts`
  - `tests/unit/main/services/agent-orchestrator/agents/traceability-agent.test.ts`
  - 扩展 `tests/unit/main/services/agent-orchestrator/agents/extract-agent.test.ts`
- [ ] 9.4 IPC / preload 测试
  - 扩展 `tests/unit/main/ipc/analysis-handlers.test.ts`
  - 扩展现有 preload 类型/API 测试
- [ ] 9.5 Renderer 测试
  - `tests/unit/renderer/analysis/TraceabilityMatrixView.test.tsx`
  - `tests/unit/renderer/analysis/ComplianceCoverageMatrix.test.tsx`
  - `tests/unit/renderer/analysis/AddendumImportModal.test.tsx`
  - 扩展 `tests/unit/renderer/analysis/useAnalysisTaskMonitor.test.tsx`
  - 新增 `tests/unit/renderer/stores/analysisStore.traceability.test.ts`
- [ ] 9.6 E2E Story 测试
  - `tests/e2e/stories/story-2-8-traceability-matrix.spec.ts`
  - 覆盖生成矩阵、手动修正、补遗导入、章节跳转降级

## Dev Notes

### 架构模式与约束

- **服务模式**：参考 `strategy-seed-generator.ts` / `mandatory-item-detector.ts` 的单例 + taskQueue 异步执行模式
- **IPC 薄分发**：handler 仅做参数解析 → service → `ApiResponse`
- **Store 模式**：继续扩展 `analysisStore` 的 per-project state，不新增独立 store
- **错误处理**：统一 `BidWiseError`
- **日期格式**：ISO-8601
- **Kysely CamelCase**：DB 列 snake_case，TS 使用 camelCase
- **taskQueue 约束**：矩阵生成、补遗导入都走现有 `category: 'import'` 任务通道
- **任务输入最小化**：`tasks.input` 不持久化长文本 addendum / proposal 原文

### 关键数据流

```
requirements (Story 2.5) ────────┐
proposal.meta.json.sectionIndex ─┼──→ TraceabilityMatrixService.generate()
proposal.md headings fallback ───┘                 │
manual links (protected set) ──────────────────────┤
                                                   ├──→ traceability agent
                                                   ├──→ parse/validate mappings
                                                   ├──→ replaceAutoByProject()
                                                   ├──→ build stats + snapshot
                                                   └──→ TraceabilityMatrix UI
```

### 方案章节数据来源

追溯矩阵列定义优先级：
1. **`proposal.meta.json.sectionIndex`**：首选，提供稳定 `sectionId`、顺序、层级和 `ChapterHeadingLocator`
2. **`proposal.md` Markdown 标题解析**：兼容旧项目的回退路径；生成临时 `sectionId` 与 `headingLocator`

`sectionWeights` 仅作为辅助展示权重来源，不能再单独承担矩阵列定义职责。

### 补遗导入流程

1. 用户在 `AddendumImportModal` 粘贴文本或选择文件
2. 前端调用 `analysis:import-addendum`
3. 后端 `TraceabilityMatrixService.importAddendum()`：
   - 文本输入：直接使用 `content`
   - 文件输入：`.txt` 可由 renderer 读成 `content`；`.pdf/.doc/.docx` 通过 `filePath` 在 main 进程提取正文
   - 以 extract agent `addendum-requirements` 模式提取新增/变更 requirement
   - 插入 `requirements`
   - 执行“全量 auto 映射重算 + manual 映射保留”
   - 对比快照，标记受影响章节/需求

### UI 集成位置

- `TraceabilityMatrixView` 作为 AnalysisView 新 Tab，位于「策略种子」之后
- `ComplianceCoverageMatrix` 共享评分族视觉语言
- 章节跳转必须经过 workspace 层：切到 `proposal-writing` 后使用 `scrollToHeading()`，不能在 analysis 阶段直接操作 editor DOM

### 与已有功能的关系

| 依赖 Story | 依赖内容 | 缺失时降级策略 |
|------------|---------|-------------|
| 2.5 (需求抽取) | `requirements` 数据 | Tab 可进入，但显示“请先完成需求抽取”信息态 |
| 3.3 (方案骨架) | `proposal.meta.json.sectionIndex` / `proposal.md` | 缺少 `sectionIndex` 时解析 `proposal.md`；两者都不存在则提示先生成方案骨架 |
| 2.6 (必响应项) | `mandatoryItems.linkedRequirementId` | 当前不依赖，仅预留后续叠加 |
| 3.2 / 3.4 (编辑器导航/章节定位) | `ChapterHeadingLocator` + editor scroll bridge | locator 缺失时仅保留矩阵内高亮，不阻塞其他功能 |

### Project Structure Notes

- 新文件均按现有目录结构放置，无冲突
- 迁移文件编号 007，接续 006_create_strategy_seeds
- Repository/Service 命名遵循 kebab-case 文件名 + PascalCase 类名模式
- UI 组件放在 `src/renderer/src/modules/analysis/components/` 下，与现有组件同级

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.8] — AC 原始定义（FR16, FR17）
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR14] — 合规覆盖矩阵视觉规格
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#L986-987] — 合规覆盖矩阵组件详细描述
- [Source: _bmad-output/planning-artifacts/architecture.md#数据架构] — 项目文件结构、SQLite + Kysely 模式
- [Source: _bmad-output/planning-artifacts/architecture.md#Agent 编排层] — Agent 注册/执行模式
- [Source: src/shared/analysis-types.ts] — RequirementItem, MandatoryItem 类型定义
- [Source: src/shared/template-types.ts] — SkeletonSection, SectionWeightEntry, proposal metadata 扩展点
- [Source: src/shared/models/proposal.ts] — `proposal.meta.json` 当前结构
- [Source: src/shared/ipc-types.ts] — IPC_CHANNELS, IpcChannelMap 类型安全模式
- [Source: src/shared/chapter-types.ts] — `ChapterHeadingLocator`
- [Source: src/shared/chapter-markdown.ts] — heading 解析与定位工具
- [Source: src/main/db/repositories/mandatory-item-repo.ts] — replaceByProject 事务模式参考
- [Source: src/main/services/document-parser/strategy-seed-generator.ts] — 单例服务 + taskQueue 执行模式参考
- [Source: src/main/services/template-service.ts] — Story 3.3 骨架与 metadata 持久化路径
- [Source: src/main/services/document-service.ts] — proposal/meta 读写能力
- [Source: src/renderer/src/modules/project/components/ProjectWorkspace.tsx] — stage 切换与 `scrollToHeading()` 现有实现
- [Source: _bmad-output/implementation-artifacts/2-7-strategy-seed-generation.md] — 前序 Story 模式参考

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
