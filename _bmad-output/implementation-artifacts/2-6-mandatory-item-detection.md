# Story 2.6: 必响应项（*项）识别与高亮

Status: ready-for-dev

## Story

As a 售前工程师,
I want 系统自动识别招标文件中的必响应项并红色高亮,
So that 我绝不会因为遗漏*项而废标。

## Acceptance Criteria

1. **Given** 招标文件已完成解析（Story 2.3）且需求已抽取（Story 2.5），**When** 用户在 `*项检测` Tab 触发检测（如后续低风险接入自动链式触发，也必须保留手动入口），**Then** 所有必响应项被自动识别，检测结果持久化到 SQLite `mandatory_items` 表，并同步写入 `{rootPath}/tender/mandatory-items.json` 快照（FR13）。

2. **Given** *项检测完成，**When** 验证检测准确性，**Then** 召回率 100%（零遗漏），精确率 >90%（允许少量误报）。宁可多标不能漏标。

3. **Given** *项检测结果已生成，**When** 用户查看需求分析界面，**Then** 必响应项以红色高亮（`#FF4D4F`）标注显示，与普通需求视觉区分明显。

4. **Given** *项列表已展示，**When** 用户审核检测结果，**Then** 用户可以确认、驳回（误报标记）或手动添加*项，操作即时持久化。

5. **Given** 用户首次上传招标文件，**When** 看到*项红色高亮，**Then** 这是冷启动即时体验的第一个 Wow Moment——从上传到*项高亮 5 分钟内到达。

6. **Given** *项已识别并持久化，**When** 后续方案编辑和导出阶段引用，**Then** *项列表可被合规三层校验（FR49：解析时识别 + 编辑时合规校验 + 导出前最终拦截）的第一层引用。

## Tasks / Subtasks

### Task 1: 数据层 — mandatory_items 表与仓库 (AC: #1, #4, #6)

- [ ] 1.1 在 `src/main/db/schema.ts` 中新增 `MandatoryItemTable` 接口
  - 字段：id (TEXT PK), projectId (TEXT FK→projects), content (TEXT 描述), sourceText (TEXT 原文摘录), sourcePages (TEXT JSON), confidence (REAL 0-1), status (TEXT: detected/confirmed/dismissed), linkedRequirementId (TEXT nullable FK→requirements), detectedAt (TEXT ISO-8601), updatedAt (TEXT ISO-8601)
- [ ] 1.2 创建迁移文件 `src/main/db/migrations/005_create_mandatory_items.ts`
  - 建表 `mandatory_items`，projectId 索引，(projectId, content) 唯一约束防重复
- [ ] 1.3 创建 `src/main/db/repositories/mandatory-item-repo.ts`
  - `create(projectId, items[])` — 批量插入
  - `findByProject(projectId)` — 按 confidence DESC 排序查询
  - `update(id, patch)` — 更新 status/linkedRequirementId
  - `deleteByProject(projectId)` — 级联删除（重新检测时清旧数据）
  - `countByProject(projectId)` — 返回 { total, confirmed, dismissed }
- [ ] 1.4 在 `src/main/db/index.ts`、`src/main/db/repositories/index.ts` 注册仓库导出，并在 `src/main/db/migrator.ts` 中显式注册 `005_create_mandatory_items`

### Task 2: 共享类型 — MandatoryItem 类型定义 (AC: #1, #3, #4)

- [ ] 2.1 在 `src/shared/analysis-types.ts` 中新增类型：
  - `MandatoryItemStatus` = `'detected' | 'confirmed' | 'dismissed'`
  - `MandatoryItem` — id, projectId, content, sourceText, sourcePages, confidence, status, linkedRequirementId, detectedAt, updatedAt
  - `MandatoryItemSummary` — total, confirmed, dismissed, pending (computed: total - confirmed - dismissed)
  - `MandatoryItemsSnapshot` — projectId, items, updatedAt（用于 `{rootPath}/tender/mandatory-items.json`；summary 在读取时计算）
  - `DetectMandatoryInput` — projectId
  - `DetectMandatoryResult` — taskId (异步任务 ID)
  - `GetMandatoryItemsInput` — projectId
  - `UpdateMandatoryItemInput` — id, status?, linkedRequirementId?
  - `AddMandatoryItemInput` — projectId, content, sourceText?, sourcePages?: number[]
- [ ] 2.2 在 `src/shared/constants.ts` 中新增 `ErrorCode.MANDATORY_DETECTION_FAILED`（`updateItem()` 缺失记录仍可沿用通用 `NOT_FOUND`）
- [ ] 2.3 在 `src/shared/ipc-types.ts` 中：
  - 在 `IPC_CHANNELS` 常量对象中新增：
    - `ANALYSIS_DETECT_MANDATORY: 'analysis:detect-mandatory'`
    - `ANALYSIS_GET_MANDATORY_ITEMS: 'analysis:get-mandatory-items'`
    - `ANALYSIS_GET_MANDATORY_SUMMARY: 'analysis:get-mandatory-summary'`
    - `ANALYSIS_UPDATE_MANDATORY_ITEM: 'analysis:update-mandatory-item'`
    - `ANALYSIS_ADD_MANDATORY_ITEM: 'analysis:add-mandatory-item'`
  - 在 `IpcChannelMap` 中新增频道类型映射：
    - `'analysis:detect-mandatory'` → DetectMandatoryInput → DetectMandatoryResult
    - `'analysis:get-mandatory-items'` → GetMandatoryItemsInput → `MandatoryItem[] | null`
    - `'analysis:get-mandatory-summary'` → GetMandatoryItemsInput → `MandatoryItemSummary | null`
    - `'analysis:update-mandatory-item'` → UpdateMandatoryItemInput → MandatoryItem
    - `'analysis:add-mandatory-item'` → AddMandatoryItemInput → MandatoryItem

### Task 3: AI Prompt — detect-mandatory.prompt.ts (AC: #1, #2)

- [ ] 3.1 创建 `src/main/prompts/detect-mandatory.prompt.ts`
  - 导出类型化函数 `(context: { rawText: string; sections: TenderSection[]; totalPages: number; hasScannedContent?: boolean; existingRequirements: RequirementItem[] }) => string`
  - Prompt 策略（召回优先）：
    - 扫描招标文件全文，识别所有"必须响应"、"应当提供"、"不得缺少"、"废标条款"、"否则视为无效"等强制性语言模式
    - 涵盖：资质要求、技术参数硬性指标、格式与文件要求、投标保证金、响应截止时间、特定认证要求等
    - 输出 JSON 数组：每项含 content（归纳描述）、sourceText（原文引用）、sourcePages（来源页码）、confidence（置信度 0-1）
    - 明确指令：宁可误报，不可遗漏（召回率 100% 目标）
  - 参考已有的 `extract-requirements.prompt.ts` 的语气和 JSON 约束风格，但输出目标仅为 mandatory items
- [ ] 3.2 修改 `src/main/services/agent-orchestrator/agents/extract-agent.ts`
  - 新增 `context.mode: 'requirements-scoring' | 'mandatory-items'` 分支
  - `requirements-scoring` 继续走现有 `extractRequirementsPrompt`
  - `mandatory-items` 走 `detectMandatoryPrompt`
  - 禁止误用现有 `parse-agent`；当前仓库只有 `extract-agent` 的上下文形状与 Story 2.3/2.5 的 `sections/rawText/totalPages/hasScannedContent` 输入契约一致

### Task 4: 后端服务 — MandatoryItemDetector (AC: #1, #2, #5)

- [ ] 4.1 创建 `src/main/services/document-parser/mandatory-item-detector.ts`
  - 类 `MandatoryItemDetector`（单例模式，参考 ScoringExtractor）
  - `detect(input: DetectMandatoryInput)` 方法：
    1. 加载 `tender-parsed.json`（复用 ScoringExtractor 的读取逻辑）
    2. 加载已有 requirements（通过 RequirementRepository）
    3. 以 `taskQueue.enqueue({ category: 'import', input: { projectId, rootPath } })` 创建外层检测任务，保持与 `ScoringExtractor.extract()` 一致的 fire-and-forget 模式；内层 LLM 调用继续由 `agentOrchestrator` 产生 `ai-agent/extract` 任务
    4. 构建 prompt 上下文，调用 `agentOrchestrator.execute({ agentType: 'extract', context: { mode: 'mandatory-items', sections, rawText, totalPages, hasScannedContent, existingRequirements }, options: { timeoutMs: 120000 } })`
    5. 轮询任务状态直到完成（复用 ScoringExtractor 的 poll 模式：POLL_INTERVAL_MS=1000, TIMEOUT_MS=300000）
    6. 解析 LLM 返回的 JSON；如抽取公共 helper，必须同时支持 code fence、裸 JSON array、以及包裹在少量自然语言中的 array
    7. 自动关联：对每个检测到的*项，尝试与已有 requirements 做文本相似度匹配（简单的关键词重叠匹配即可，Alpha 阶段不需要语义匹配），设置 linkedRequirementId
    8. 清除旧数据 + 批量写入 DB
    9. 写入 `{rootPath}/tender/mandatory-items.json` 快照；即使 0 项也要写空快照，以区分“未执行检测”与“检测完成但无结果”
  - `getItems(projectId)` — 优先从 DB 读取；若 DB 为空但快照文件存在，返回 `[]`；若 DB 与快照都不存在，返回 `null`
  - `getSummary(projectId)` — 对“未执行”返回 `null`；对“已执行但 0 项”返回 `{ total: 0, confirmed: 0, dismissed: 0, pending: 0 }`
  - `updateItem(id, patch)` — 更新状态后同步回写 `mandatory-items.json`
  - `addItem(input: AddMandatoryItemInput)` — 手动添加*项（`status='confirmed'`, `confidence=1.0`），并同步回写 `mandatory-items.json`
- [ ] 4.2 在 `src/main/services/document-parser/index.ts` 导出单例（遵循已有模式）：
  `export const mandatoryItemDetector = new MandatoryItemDetector()`

### Task 5: IPC Handler 注册 (AC: #1, #3, #4)

- [ ] 5.1 在 `src/main/ipc/analysis-handlers.ts` 中注册 5 个新频道：
  - `analysis:detect-mandatory` → MandatoryItemDetector.detect()
  - `analysis:get-mandatory-items` → MandatoryItemDetector.getItems()
  - `analysis:get-mandatory-summary` → MandatoryItemDetector.getSummary()
  - `analysis:update-mandatory-item` → MandatoryItemDetector.updateItem()
  - `analysis:add-mandatory-item` → MandatoryItemDetector.addItem()
  - 遵循薄分发模式：参数解析 → 调用服务 → 包装 `{ success, data }` / `{ success: false, error }`
- [ ] 5.2 在 `src/preload/index.ts` 中新增对应的 preload API 方法（参考已有的 analysis 频道暴露模式）

### Task 6: Store 扩展 — analysisStore 必响应项状态 (AC: #1, #3, #4)

- [ ] 6.1 在 `src/renderer/src/stores/analysisStore.ts` 的 per-project state 中新增字段：
  - `mandatoryItems: MandatoryItem[] | null`（`null` = 从未检测；`[]` = 已检测但 0 项）
  - `mandatorySummary: MandatoryItemSummary | null`
  - `mandatoryDetectionTaskId: string | null`
  - `mandatoryDetectionProgress: number`
  - `mandatoryDetectionMessage: string`
  - `mandatoryDetectionLoading: boolean`
  - `mandatoryDetectionError: string | null`
- [ ] 6.2 新增 Actions：
  - `detectMandatoryItems(projectId)` — 调用 IPC，设置 taskId 和 loading 状态
  - `fetchMandatoryItems(projectId)` — 加载已检测的*项列表
  - `fetchMandatorySummary(projectId)` — 加载摘要统计
  - `updateMandatoryItem(id, patch)` — 更新状态并刷新列表
  - `addMandatoryItem(projectId, content, sourceText?, sourcePages?)` — 手动添加
  - `updateMandatoryDetectionProgress(projectId, progress, message?)` — 进度回调
  - `setMandatoryDetectionCompleted(projectId)` — 检测完成时获取 items + summary
  - `setMandatoryDetectionError(projectId, error)` — 仅影响 mandatory 检测态，不覆盖 parse/extraction 的 error 语义
- [ ] 6.3 在 `EMPTY_ANALYSIS_PROJECT_STATE` 中初始化新字段默认值
- [ ] 6.4 扩展 `findAnalysisProjectIdByTaskId()`，把 `mandatoryDetectionTaskId` 纳入映射，避免 `useAnalysisTaskMonitor()` 丢失第三类任务

### Task 7: UI 组件 — MandatoryItemsList (AC: #3, #4, #5)

- [ ] 7.1 创建 `src/renderer/src/modules/analysis/components/MandatoryItemsList.tsx`
  - 使用 Ant Design Table 展示*项列表
  - 列定义：
    - 序号（自动）
    - 内容（content，红色文字 `#FF4D4F`）
    - 原文摘录（sourceText，可展开 Tooltip）
    - 来源页码（sourcePages）
    - 置信度（confidence，Progress 组件 + 颜色映射：>=0.9 绿色、0.7-0.9 橙色、<0.7 红色）
    - 状态（Tag 组件：detected=蓝色、confirmed=绿色、dismissed=灰色）
    - 操作（确认/驳回按钮，已确认/已驳回项显示对应状态）
  - 表头统计栏：显示 `共 X 项 | 已确认 Y | 已驳回 Z | 待审核 W`
  - 行样式：红色左边框（`border-left: 3px solid #FF4D4F`）强调视觉
  - 空状态需要区分两类：
    - 从未运行：显示"尚未执行必响应项检测"提示 + "开始检测"按钮（对齐 PNG/`.pen` 文案）
    - 已运行但 0 项：显示"本次未识别出必响应项，请人工复核或手动添加" + "重新检测" / "+ 添加*项"
  - 加入稳定 `data-testid`（列表、summary、redetect、add、confirm、dismiss），便于后续 E2E
- [ ] 7.2 创建 `src/renderer/src/modules/analysis/components/MandatoryItemsBadge.tsx`
  - 紧凑型摘要组件，本 Story 只用于 AnalysisView 的 Tab 标签
  - 显示：红色 Badge 数字（待审核数）+ 文字"*项覆盖 X/Y"
  - 全部确认时显示绿色勾号 ✓
- [ ] 7.3 "手动添加*项"功能：列表底部或工具栏的"+ 添加"按钮，弹出 Modal 输入内容和来源页码
  - Renderer 负责把来源页码输入 `"3, 7, 15"` 解析为 `number[]`（去空、去重、升序）

### Task 8: 集成到 AnalysisView (AC: #3, #5)

- [ ] 8.1 在 `AnalysisView.tsx` 的 Tabs 中新增"*项检测"标签页
  - Tab 标签带 Badge 显示待审核数量
  - 内容区渲染 `<MandatoryItemsList />`
- [ ] 8.2 首个可交付版本以 Tab 内手动触发为准
  - 抽取完成后立即加载 `mandatoryItems` / `mandatorySummary`
  - 若返回 `null`，展示空态 CTA；若返回数组/摘要则直接进入结果态
  - 如开发中确认可以低风险复用现有 extraction completion 流程自动启动检测，可作为增强项加入，但不得替代空态入口，也不作为本 Story 的 AC blocker
- [ ] 8.3 在 `RequirementsList.tsx` 中为已关联*项的需求行添加红色 Tag 标记（"*项"标签）
  - 通过 `mandatoryItems` 的 `linkedRequirementId` 做交叉引用
  - `RequirementsList` 组件新增 `mandatoryRequirementIds` 或等价 prop，避免在组件内直接读 store

### Task 9: Hook 集成 — useAnalysis 扩展 (AC: #1, #5)

- [ ] 9.1 在 `src/renderer/src/modules/analysis/hooks/useAnalysis.ts` 中：
  - 扩展 `TaskKind = 'import' | 'extraction' | 'mandatory'`
  - 扩展 `useAnalysisTaskMonitor` 监听 mandatoryDetectionTaskId 的进度事件和终态轮询
  - 新增 `useDetectMandatory(projectId)` hook，返回 detect 函数和 loading/error 状态
  - 新增 `useMandatoryItems(projectId)` hook，mount 时自动加载*项列表与 summary

### Task 10: 单元测试与集成测试 (AC: #1, #2, #4)

- [ ] 10.1 `tests/unit/main/mandatory-item-detector.test.ts`
  - 测试 JSON 解析逻辑（正常 JSON、JSON fence、格式异常降级）
  - 测试自动关联逻辑（关键词匹配正确链接到 requirements）
  - 测试边界：空招标文件、无*项文件、全*项文件
  - 验证 `mandatory-items.json` 在 detect/update/add 后保持与 DB 一致；0 项时仍落空快照
- [ ] 10.2 `tests/unit/main/mandatory-item-repo.test.ts`
  - CRUD 操作测试
  - 重复插入防护测试
  - countByProject 统计正确性
- [ ] 10.3 `tests/unit/renderer/MandatoryItemsList.test.tsx`
  - 渲染测试：列表正确显示、红色样式、状态标签
  - 交互测试：确认/驳回/添加操作
  - 空状态渲染（未执行 / 已执行但 0 项 两种）
- [ ] 10.4 `tests/unit/main/detect-mandatory-prompt.test.ts`
  - 验证 prompt 函数输出包含关键指令（召回优先、JSON 格式要求等）
  - 验证不同 context 输入生成正确的 prompt
- [ ] 10.5 `tests/unit/main/services/agent-orchestrator/agents/extract-agent.test.ts`
  - 验证 `mode='requirements-scoring'` 与 `mode='mandatory-items'` 分别选择正确 prompt
- [ ] 10.6 `tests/unit/main/db/migrations.test.ts`
  - 验证 `005_create_mandatory_items` 被 migrator 注册，且 `mandatory_items` 表字段/索引存在
- [ ] 10.7 `tests/unit/main/ipc/analysis-handlers.test.ts`
  - 验证 5 个 mandatory 频道已注册，并正确分发到 `mandatoryItemDetector`
- [ ] 10.8 `tests/unit/renderer/modules/analysis/useAnalysis.test.ts`
  - 验证 `useAnalysisTaskMonitor()` 能处理 mandatoryDetectionTaskId 的 progress / completed / failed 分支
- [ ] 10.9 `tests/e2e/stories/story-2-6-mandatory-item-detection.spec.ts`
  - 以 Story 2.5 的 seeded analysis 模式预置 `tender-parsed.json`、requirements、mandatory-items snapshot/DB
  - 覆盖空态启动、检测完成列表、确认/驳回、重启应用后状态保持

## Dev Notes

### 核心设计决策

- **独立表 vs 需求扩展字段：** 选择独立 `mandatory_items` 表而非在 `requirements` 表加 `isMandatory` 字段，原因：
  1. *项可能来自招标文件中非"技术需求"部分（如资质要求、文件格式要求、保证金条款等），这些不在 requirements 表中
  2. *项有独立的检测置信度和审核生命周期
  3. 通过 `linkedRequirementId` 可选关联到 requirements，保持灵活性
  4. 后续合规三层校验（FR49）需要独立查询*项列表

- **检测时机：** 当前实现以 `*项检测` Tab 内手动触发为准，和 PNG/`.pen` 原型保持一致；自动链式触发仅作为不阻塞的增强项，不得替代空态 CTA。

- **召回优先策略：** Prompt 设计和后处理都遵循"宁多标不漏标"原则。低置信度项仍然保留，由用户审核 dismiss。

- **空态语义：** 必须严格区分：
  1. `mandatoryItems === null` / `summary === null` → 从未执行检测；
  2. `mandatoryItems === []` + `summary.total === 0` → 已执行检测但未识别出*项。
  这也是引入 `mandatory-items.json` 快照的核心原因。

- **快照位置与契约：** 与当前已落地的 `tender-parsed.json` / `scoring-model.json` 保持同目录，写入 `{rootPath}/tender/mandatory-items.json`。快照建议格式：
  ```json
  {
    "projectId": "proj-1",
    "items": [],
    "updatedAt": "2026-03-31T09:00:00.000Z"
  }
  ```
  `summary` 统一在服务读取时现算，避免文件与 DB 双份统计漂移。

### 关键复用点（禁止重复造轮子）

| 已有组件 | 复用方式 |
|---------|---------|
| `ScoringExtractor` 的 poll 模式 | 复用 `POLL_INTERVAL_MS` / timeout 策略和外层任务轮询结构；如提取公共 helper，需先回用到 `ScoringExtractor`，避免分叉 |
| `ScoringExtractor` 的 JSON fence 解析 | 提取为共享工具函数或复制同等行为，但必须补足 JSON array 提取能力 |
| `tender-import.ts` + `scoring-extractor.ts` 的文件路径约定 | 复用 `path.join(project.rootPath, 'tender', ...)` 目录结构，不引入新的 analysis 子目录 |
| `RequirementRepository` 的 CRUD 模式 | MandatoryItemRepo 遵循相同的仓库模式 |
| `analysisStore` 的 per-project state 模式 | 在同一 store 中扩展，不创建新 store |
| `RequirementsList.tsx` 的 Table 交互模式 | 列定义和状态 Tag 渲染模式保持一致 |
| `extract-requirements.prompt.ts` 的输出格式 | JSON 输出结构风格保持一致 |
| `extract-agent.ts` | 通过 `mode` 扩展现有 handler，而不是新建与当前 `AgentType` 不匹配的 agent |
| `useAnalysisTaskMonitor` 的任务监听模式 | 扩展监听 mandatoryDetectionTaskId，并同步扩展 `findAnalysisProjectIdByTaskId()` |

### 架构约束（必须遵守）

- **所有 AI 调用经 agentOrchestrator**，禁止直接调用 API。Mandatory detection 复用 `agentType: 'extract'`，通过 `context.mode = 'mandatory-items'` 切 prompt；禁止误用当前只接受 `rfpContent` 的 `parse-agent`
- **IPC handler 薄分发**，业务逻辑在 MandatoryItemDetector 服务中
- **统一 Response Wrapper**：`{ success: true, data }` / `{ success: false, error: { code, message } }`
- **BidWiseError** 错误类型体系，禁止 throw 裸字符串
- **Kysely CamelCasePlugin** 自动处理 snake_case ↔ camelCase，禁止手动映射
- **异步检测必须走 task-queue**，支持进度推送和取消
- **outer task 类别与现有实现对齐**：沿用 `ScoringExtractor.extract()` 的 `category: 'import'` 外层任务；内层 agent 任务仍由 orchestrator 记为 `ai-agent/extract`
- **ISO-8601 日期格式**
- **路径别名**：`@main/*`, `@shared/*`, `@renderer/*`, `@modules/*`，禁止 `../../`

### 文件结构与命名

| 新建文件 | 路径 |
|---------|------|
| 迁移文件 | `src/main/db/migrations/005_create_mandatory_items.ts` |
| 仓库 | `src/main/db/repositories/mandatory-item-repo.ts` |
| 检测服务 | `src/main/services/document-parser/mandatory-item-detector.ts` |
| Prompt | `src/main/prompts/detect-mandatory.prompt.ts` |
| UI 列表组件 | `src/renderer/src/modules/analysis/components/MandatoryItemsList.tsx` |
| UI Badge 组件 | `src/renderer/src/modules/analysis/components/MandatoryItemsBadge.tsx` |
| E2E Story Spec | `tests/e2e/stories/story-2-6-mandatory-item-detection.spec.ts` |

| 修改文件 | 路径 |
|---------|------|
| DB Schema | `src/main/db/schema.ts` |
| DB Index | `src/main/db/index.ts` |
| DB Migrator | `src/main/db/migrator.ts` |
| Repository Barrel | `src/main/db/repositories/index.ts` |
| 共享类型 | `src/shared/analysis-types.ts` |
| 错误码常量 | `src/shared/constants.ts` |
| IPC 类型 | `src/shared/ipc-types.ts` |
| IPC 处理器 | `src/main/ipc/analysis-handlers.ts` |
| Preload | `src/preload/index.ts` |
| Extract Agent | `src/main/services/agent-orchestrator/agents/extract-agent.ts` |
| Store | `src/renderer/src/stores/analysisStore.ts` |
| AnalysisView | `src/renderer/src/modules/analysis/components/AnalysisView.tsx` |
| RequirementsList | `src/renderer/src/modules/analysis/components/RequirementsList.tsx` |
| useAnalysis Hook | `src/renderer/src/modules/analysis/hooks/useAnalysis.ts` |
| document-parser index | `src/main/services/document-parser/index.ts` |
| extract agent tests | `tests/unit/main/services/agent-orchestrator/agents/extract-agent.test.ts` |
| migration tests | `tests/unit/main/db/migrations.test.ts` |
| analysis IPC tests | `tests/unit/main/ipc/analysis-handlers.test.ts` |
| analysis hooks tests | `tests/unit/renderer/modules/analysis/useAnalysis.test.ts` |

### UX 规范

- *项红色高亮色值：`#FF4D4F`（Ant Design danger 色，与 UX 规范一致）
- 状态 Tag 颜色：detected=蓝色（`#1677FF`）、confirmed=绿色（`#52C41A`）、dismissed=灰色（`#D9D9D9`）
- 表格行左边框强调：`border-left: 3px solid #FF4D4F`
- Badge 显示待审核数量，全部处理完显示绿色 ✓
- 置信度用 Progress 组件，颜色映射：>=0.9 绿 / 0.7-0.9 橙 / <0.7 红
- Ant Design Alert 组件用于检测进行中 / 检测失败提示

### 迁移文件编号

已确认现有迁移：`001_initial_schema.ts`, `002_add_industry.ts`, `003_create_tasks.ts`, `004_create_requirements_scoring.ts`。新迁移使用 `005`。

### 数据流总览

```
用户进入 AnalysisView 的 "*项检测" Tab
  → analysisStore.fetchMandatoryItems(projectId) + fetchMandatorySummary(projectId)
    → 若返回 null → 渲染空态 CTA
    → 若返回 [] / summary.total=0 → 渲染"未识别出*项"结果态
    → 若返回 items → 渲染列表态
  → 用户点击"开始检测" / "重新检测"
    → analysisStore.detectMandatoryItems(projectId)
      → IPC: analysis:detect-mandatory
        → MandatoryItemDetector.detect()
          → 加载 tender-parsed.json + requirements
          → taskQueue.enqueue(category='import')
          → agentOrchestrator.execute({ agentType: 'extract', context: { mode: 'mandatory-items', ... } })
          → 轮询 inner task，向 outer task 推进度
          → LLM 返回 JSON → 解析 + 验证
          → 自动关联 linkedRequirementId
          → MandatoryItemRepo.create() 批量写入 DB
          → 写入 tender/mandatory-items.json 快照
      → useAnalysisTaskMonitor 拉取 items + summary
        → MandatoryItemsList 红色高亮渲染
        → MandatoryItemsBadge 更新 Tab 标签
        → RequirementsList 显示 *项标签
```

### Project Structure Notes

- 与统一项目结构完全对齐：服务在 `document-parser/`，prompt 在 `prompts/`，UI 在 `modules/analysis/components/`
- 遵循已有模式：MandatoryItemDetector 参考 ScoringExtractor，MandatoryItemRepo 参考 RequirementRepository
- 无结构冲突或偏差

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2 Story 2.6]
- [Source: _bmad-output/planning-artifacts/prd.md#FR13 必响应项识别]
- [Source: _bmad-output/planning-artifacts/prd.md#FR49 合规三层校验]
- [Source: _bmad-output/planning-artifacts/prd.md#领域特定硬性指标 *项检测]
- [Source: _bmad-output/planning-artifacts/architecture.md#document-parser 目录结构]
- [Source: _bmad-output/planning-artifacts/architecture.md#prompts/detect-mandatory.prompt.ts]
- [Source: _bmad-output/planning-artifacts/architecture.md#FR→目录映射]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#语义色 Danger #FF4D4F]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#合规覆盖矩阵]
- [Source: _bmad-output/implementation-artifacts/2-3-tender-import-async-parsing.md#TenderImportService]
- [Source: src/main/services/document-parser/scoring-extractor.ts#ScoringExtractor poll 模式]
- [Source: src/shared/analysis-types.ts#RequirementItem 类型]
- [Source: src/renderer/src/stores/analysisStore.ts#per-project state 模式]

## Dev Agent Record

### Agent Model Used

(待实施时填写)

### Debug Log References

### Completion Notes List

### File List
