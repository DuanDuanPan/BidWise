# Story 2.5: 需求结构化抽取与评分模型

Status: ready-for-dev

## Story

As a 售前工程师,
I want 系统从招标文件中自动抽取结构化需求清单和评分模型,
So that 我能快速把握招标核心要求和评分权重分布。

## Acceptance Criteria

### AC1: 技术需求条目清单抽取

- **Given** 招标文件已完成解析（ParsedTender 可用）
- **When** 用户点击"抽取需求"触发 LLM 结构化抽取
- **Then** 生成技术需求条目清单，每条需求有编号（sequenceNumber）、描述（description）、来源页码（sourcePages）、分类（category）；清单持久化到 SQLite `requirements` 表
- [Source: epics.md Story 2.5 AC1, FR11]

### AC2: 评分模型生成

- **Given** 招标文件包含评分标准
- **When** LLM 动态理解评分标准
- **Then** 生成逐项可解释的评分模型（如"技术方案 60 分 / 实施方案 20 分"），每项有推理依据（reasoning）供人工确认；评分模型持久化到 SQLite `scoring_models` 表 + 项目目录 `scoring-model.json`
- [Source: epics.md Story 2.5 AC2, FR12]

### AC3: UI 展示与人工修正

- **Given** 抽取结果展示
- **When** 用户查看
- **Then** 需求清单以结构化表格展示（Ant Design Table，支持排序/筛选），评分模型以可编辑表格展示（行内编辑分值/权重/推理依据），支持人工修正后保存
- [Source: epics.md Story 2.5 AC3, UX-DR20]

### AC4: 评分模型持久化与下游可引用

- **Given** 评分模型确认后
- **When** 用户点击"确认评分模型"
- **Then** 保存为项目级 `projects/{projectId}/scoring-model.json`（文件系统）+ SQLite `scoring_models` 表记录，后续阶段（Story 2.6 必响应项检测、Story 2.8 追溯矩阵、Story 7.8 评分仪表盘）可引用
- [Source: epics.md Story 2.5 AC4]

## Tasks / Subtasks

- [ ] Task 1: 共享类型定义 (AC: 1, 2, 3, 4)
  - [ ] 1.1 在 `src/shared/analysis-types.ts` 新增需求和评分模型类型：
    ```typescript
    interface RequirementItem {
      id: string
      sequenceNumber: number
      description: string
      sourcePages: number[]
      category: RequirementCategory
      priority: 'high' | 'medium' | 'low'
      status: 'extracted' | 'confirmed' | 'modified' | 'deleted'
    }

    type RequirementCategory =
      | 'technical'      // 技术要求
      | 'implementation' // 实施要求
      | 'service'        // 服务要求
      | 'qualification'  // 资质要求
      | 'commercial'     // 商务要求
      | 'other'          // 其他

    interface ScoringCriterion {
      id: string
      category: string           // e.g. "技术方案", "实施方案", "商务报价"
      maxScore: number           // e.g. 60
      weight: number             // 0-1, derived from maxScore/totalScore
      subItems: ScoringSubItem[]
      reasoning: string          // LLM 推理依据
      status: 'extracted' | 'confirmed' | 'modified'
    }

    interface ScoringSubItem {
      id: string
      name: string               // e.g. "系统架构设计"
      maxScore: number
      description: string
      sourcePages: number[]
    }

    interface ScoringModel {
      projectId: string
      totalScore: number
      criteria: ScoringCriterion[]
      extractedAt: string        // ISO-8601
      confirmedAt: string | null // null until user confirms
      version: number
    }

    interface ExtractionResult {
      requirements: RequirementItem[]
      scoringModel: ScoringModel
    }

    interface ExtractRequirementsInput {
      projectId: string
    }

    interface ExtractionTaskResult {
      taskId: string
    }

    interface GetRequirementsInput {
      projectId: string
    }

    interface GetScoringModelInput {
      projectId: string
    }

    interface UpdateRequirementInput {
      id: string
      patch: Partial<
        Pick<RequirementItem, 'description' | 'category' | 'priority' | 'status'>
      >
    }

    interface UpdateScoringModelInput {
      projectId: string
      criterionId: string
      patch: Partial<Pick<ScoringCriterion, 'maxScore' | 'weight' | 'reasoning' | 'status'>>
    }

    interface ConfirmScoringModelInput {
      projectId: string
    }
    ```
  - [ ] 1.2 在 `src/shared/ipc-types.ts` 中从 `analysis-types.ts` import 上述共享 DTO/类型，并同步扩展 `IPC_CHANNELS` 常量和 `IpcChannelMap`：
    - `'analysis:extract-requirements'`: `{ input: ExtractRequirementsInput; output: ExtractionTaskResult }`
    - `'analysis:get-requirements'`: `{ input: GetRequirementsInput; output: RequirementItem[] | null }`
    - `'analysis:get-scoring-model'`: `{ input: GetScoringModelInput; output: ScoringModel | null }`
    - `'analysis:update-requirement'`: `{ input: UpdateRequirementInput; output: RequirementItem }`
    - `'analysis:update-scoring-model'`: `{ input: UpdateScoringModelInput; output: ScoringModel }`
    - `'analysis:confirm-scoring-model'`: `{ input: ConfirmScoringModelInput; output: ScoringModel }`
  - [ ] 1.3 在 `src/shared/constants.ts` 的 `ErrorCode` 枚举补充：`EXTRACTION_FAILED = 'EXTRACTION_FAILED'`、`SCORING_MODEL_NOT_FOUND = 'SCORING_MODEL_NOT_FOUND'`、`REQUIREMENT_NOT_FOUND = 'REQUIREMENT_NOT_FOUND'`

- [ ] Task 2: 数据库迁移 (AC: 1, 2, 4)
  - [ ] 2.1 创建 `src/main/db/migrations/004_create_requirements_scoring.ts`
  - [ ] 2.2 `requirements` 表：
    ```sql
    CREATE TABLE requirements (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      sequence_number INTEGER NOT NULL,
      description TEXT NOT NULL,
      source_pages TEXT NOT NULL,       -- JSON array: [1, 5, 12]
      category TEXT NOT NULL DEFAULT 'other',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'extracted',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
    ```
  - [ ] 2.3 `scoring_models` 表：
    ```sql
    CREATE TABLE scoring_models (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      total_score REAL NOT NULL,
      criteria TEXT NOT NULL,            -- JSON: ScoringCriterion[]
      extracted_at TEXT NOT NULL,
      confirmed_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id)                -- 一个项目只有一个评分模型
    )
    ```
  - [ ] 2.4 在 `src/main/db/schema.ts` 的 `DB` 接口新增 `requirements: RequirementTable` 和 `scoringModels: ScoringModelTable` 类型定义
  - [ ] 2.5 在迁移注册表中添加 004 迁移

- [ ] Task 3: 数据访问层 (AC: 1, 2, 4)
  - [ ] 3.1 创建 `src/main/db/repositories/requirement-repo.ts`：
    - `create(projectId, items: RequirementItem[]): Promise<void>` — 批量插入
    - `findByProject(projectId): Promise<RequirementItem[]>` — 按 sequenceNumber 排序
    - `update(id, patch: Partial<RequirementItem>): Promise<RequirementItem>`
    - `deleteByProject(projectId): Promise<void>` — 重新抽取时清理旧数据
  - [ ] 3.2 创建 `src/main/db/repositories/scoring-model-repo.ts`：
    - `upsert(model: ScoringModel): Promise<ScoringModel>` — 插入或更新整份模型（抽取完成 / 确认后全量写入，UNIQUE project_id）
    - `findByProject(projectId): Promise<ScoringModel | null>`
    - `updateCriterion(projectId: string, criterionId: string, patch: Partial<ScoringCriterion>): Promise<ScoringModel>` — 行内编辑单个 criterion；repo 内部负责读取现有模型、merge patch、再持久化
    - `confirm(projectId): Promise<ScoringModel>` — 设置 confirmedAt
  - [ ] 3.3 `criteria` 字段使用 `JSON.stringify/parse` 序列化（Kysely jsonb 模式），`sourcePages` 同理
  - [ ] 3.4 CamelCasePlugin 自动处理 DB snake_case ↔ TS camelCase 转换，禁止手动映射

- [ ] Task 4: LLM 提示词 (AC: 1, 2)
  - [ ] 4.1 创建 `src/main/prompts/extract-requirements.prompt.ts`：
    - 导出 `(context: ExtractRequirementsContext) => string`
    - `ExtractRequirementsContext`: `{ sections: TenderSection[], rawText: string, totalPages: number }`
    - 提示词要求 LLM 输出结构化 JSON：`{ requirements: [...], scoringModel: { totalScore, criteria: [...] } }`
    - 中文系统提示：指导 LLM 扮演资深售前工程师，从招标文件中抽取技术需求条目和评分标准
    - 明确输出 JSON schema，包含每个字段的描述和约束
    - 要求每条需求标注来源页码，每个评分项附推理依据
  - [ ] 4.2 在 `src/main/prompts/index.ts` 导出新提示词

- [ ] Task 5: 抽取服务 scoring-extractor.ts (AC: 1, 2, 4)
  - [ ] 5.1 创建 `src/main/services/document-parser/scoring-extractor.ts`
  - [ ] 5.2 实现 `ScoringExtractor` 类：
    ```typescript
    class ScoringExtractor {
      async extract(
        projectId: string,
        tender: ParsedTender,
        options: { signal?: AbortSignal; updateProgress?: (p: number, m?: string) => void }
      ): Promise<ExtractionResult>
    }
    ```
  - [ ] 5.3 抽取流程（ScoringExtractor 作为 task-queue 执行器运行，遵循 TenderImportService 模式）：
    1. 构建提示词上下文（调用 `extractRequirementsPrompt(context)`）
    2. 调用 `agentOrchestrator.execute({ agentType: 'extract', context })` → 获得 `{ taskId }`（AI 任务异步启动，orchestrator 内部编排脱敏 → AI 调用 → 还原）
    3. 轮询 `agentOrchestrator.getAgentStatus(taskId)` 等待 AI 任务完成（`status === 'completed'`），期间通过 `options.updateProgress` 报告进度（20%→80%）；若 `status === 'failed'` 则抛出 BidWiseError
    4. 从 `AgentStatus.result.content` 提取 LLM 原始文本响应
    5. 解析 LLM JSON 响应为 `ExtractionResult`（健壮处理 markdown fence、字段缺失等）
    6. 为每个 RequirementItem 生成 UUID（`v4 as uuidv4` from `uuid`）
    7. 持久化到 SQLite（`requirementRepo.create()` + `scoringModelRepo.upsert()`）
    8. 保存 `scoring-model.json` 到项目目录（文件系统双写）
    9. 返回 `ExtractionResult`
  - [ ] 5.4 LLM 响应解析需健壮处理：JSON 提取（支持 markdown code fence 包裹）、字段缺失默认值、数据校验
  - [ ] 5.5 在 `src/main/services/document-parser/index.ts` 导出 `ScoringExtractor`

- [ ] Task 6: Agent 注册 (AC: 1, 2)
  - [ ] 6.1 决策点——两种方案（推荐方案 A）：
    - **方案 A**：复用现有 `parse` AgentType，在 parse-agent handler 中根据 context 参数区分"RFP 解析"和"需求抽取"两种子任务
    - **方案 B**：在 `src/shared/ai-types.ts` 的 `AgentType` 联合类型扩展 `'extract'`，创建独立 `extract-agent.ts` handler
  - [ ] 6.2 若方案 B：创建 `src/main/services/agent-orchestrator/agents/extract-agent.ts`，实现 `AgentHandler` 接口
  - [ ] 6.3 若方案 B：在 orchestrator `index.ts` 中 `registerAgent('extract', extractAgentHandler)`
  - [ ] 6.4 Agent handler 职责：接收 ParsedTender context → 构建 AiRequestParams（prompt + model config）→ 由 orchestrator 编排调用 ai-proxy

- [ ] Task 7: IPC Handler 扩展 (AC: 1, 2, 3, 4)
  - [ ] 7.1 在 `src/main/ipc/analysis-handlers.ts` 新增以下通道处理器（薄分发层，业务逻辑在 Service 中）：
    - `analysis:extract-requirements` — 调用 `scoringExtractor.extract()`，通过 task-queue 异步执行，返回 `{ taskId }`
    - `analysis:get-requirements` — 调用 `requirementRepo.findByProject()`
    - `analysis:get-scoring-model` — 调用 `scoringModelRepo.findByProject()`
    - `analysis:update-requirement` — 调用 `requirementRepo.update()`
    - `analysis:update-scoring-model` — 调用 `scoringModelRepo.updateCriterion()`（部分更新单个 criterion）；`upsert()` 仅用于整份模型写回
    - `analysis:confirm-scoring-model` — 调用 `scoringModelRepo.confirm()` + 写 `scoring-model.json` 到项目目录
  - [ ] 7.2 `analysis:extract-requirements` 必须通过 task-queue 异步执行（白名单要求），进度通过 IPC 推送到渲染进程
  - [ ] 7.3 在 `src/main/ipc/index.ts` 的注册列表中确认 analysis-handlers 已注册（应已有）

- [ ] Task 8: Preload API 扩展 (AC: 3)
  - [ ] 8.1 在 `src/preload/index.ts` 的 `requestApi` 对象中手动添加新 IPC 通道方法（preload 是手动 `typedInvoke` 封装映射，非自动生成）：`analysisExtractRequirements`、`analysisGetRequirements`、`analysisGetScoringModel`、`analysisUpdateRequirement`、`analysisUpdateScoringModel`、`analysisConfirmScoringModel`，并确认 `api` 对象满足 `PreloadApi` 类型约束（编译时自动检查）

- [ ] Task 9: 渲染进程 Store 扩展 (AC: 3, 4)
  - [ ] 9.1 在 `src/renderer/src/stores/analysisStore.ts` 扩展状态：
    ```typescript
    // 在 AnalysisProjectState 中新增：
    requirements: RequirementItem[] | null
    scoringModel: ScoringModel | null
    extractionTaskId: string | null
    extractionProgress: number
    extractionMessage: string
    extractionLoading: boolean
    ```
  - [ ] 9.2 新增 Actions：
    - `extractRequirements(projectId): Promise<void>` — 调用 IPC `analysis:extract-requirements`，设置 extractionTaskId
    - `fetchRequirements(projectId): Promise<void>` — 调用 IPC `analysis:get-requirements`
    - `fetchScoringModel(projectId): Promise<void>` — 调用 IPC `analysis:get-scoring-model`
    - `updateRequirement(id, patch): Promise<void>` — 调用 IPC `analysis:update-requirement`
    - `updateScoringCriterion(projectId, criterionId, patch): Promise<void>` — 调用 IPC `analysis:update-scoring-model`
    - `confirmScoringModel(projectId): Promise<void>` — 调用 IPC `analysis:confirm-scoring-model`
    - `updateExtractionProgress(projectId, progress, message): void`
    - `setExtractionCompleted(projectId, result): void`
  - [ ] 9.3 `loading: boolean` 命名规范（不用 `isLoading`/`fetching`）

- [ ] Task 10: 渲染进程 UI 组件 (AC: 3)
  - [ ] 10.1 创建 `src/renderer/src/modules/analysis/components/RequirementsList.tsx`：
    - Ant Design `Table` 组件，列：编号、描述、分类（Tag 着色）、来源页码、优先级、状态
    - 支持按分类/优先级筛选（Table filters）
    - 行内编辑：双击描述可修改、分类下拉选择、优先级下拉
    - 修改后自动调用 `updateRequirement` 保存
  - [ ] 10.2 创建 `src/renderer/src/modules/analysis/components/ScoringModelEditor.tsx`：
    - Ant Design `Table` 嵌套子表格（主表：评分大类，展开：子评分项）
    - 列：评分类别、最高分值、权重(%)、推理依据、状态
    - 行内编辑：分值可修改（InputNumber）、推理依据可编辑（TextArea）
    - 底部汇总行：总分值
    - "确认评分模型" 按钮（Ant Design Button type="primary"），调用 `confirmScoringModel`
    - 确认后状态变为 'confirmed'，按钮变为 "已确认" 禁用态
  - [ ] 10.3 在 `AnalysisView.tsx` 中集成新组件：
    - 招标文件解析完成后，显示"抽取需求与评分模型"按钮
    - 抽取过程中显示进度条（复用 ParseProgressPanel 模式）
    - 抽取完成后切换显示 RequirementsList + ScoringModelEditor（Tab 或上下布局）
  - [ ] 10.4 空状态处理：未抽取时显示引导提示；抽取失败时显示错误 + 重试按钮

- [ ] Task 11: 单元测试 (AC: 全部)
  - [ ] 11.1 `tests/unit/main/services/document-parser/scoring-extractor.test.ts`：
    - Mock `agentOrchestrator.execute()` 返回 `{ taskId: 'test-id' }`，Mock `agentOrchestrator.getAgentStatus('test-id')` 返回 completed 状态（`status: 'completed'`，`result.content` 包含结构化 JSON 字符串）
    - 验证异步轮询正确等待 AI 任务完成后解析为 ExtractionResult
    - 验证持久化到 requirementRepo + scoringModelRepo + 文件系统
    - LLM 返回格式异常时的错误处理（JSON 解析失败、字段缺失）
    - 进度回调正确触发
  - [ ] 11.2 `tests/unit/main/db/repositories/requirement-repo.test.ts`：
    - 批量插入 + 查询 + 更新 + 删除
    - sourcePages JSON 序列化/反序列化
    - 外键级联删除（项目删除时需求跟着删）
  - [ ] 11.3 `tests/unit/main/db/repositories/scoring-model-repo.test.ts`：
    - upsert 语义（首次插入 + 更新覆盖）
    - updateCriterion() 仅更新目标 criterion，并保留其余 criteria 不变
    - criteria JSON 序列化/反序列化
    - confirm() 设置 confirmedAt
    - UNIQUE(project_id) 约束
  - [ ] 11.4 `tests/unit/main/prompts/extract-requirements.prompt.test.ts`：
    - 提示词函数返回包含关键指令的字符串
    - 不同输入上下文（有评分标准/无评分标准/扫描件标记）生成正确提示词
  - [ ] 11.5 `tests/unit/renderer/stores/analysisStore.test.ts`：
    - 新增 action 的状态转换测试
    - loading/error 状态管理
    - extractionProgress 更新
  - [ ] 11.6 `tests/unit/renderer/components/RequirementsList.test.tsx`：
    - 表格正确渲染需求列表
    - 筛选/排序功能
    - 行内编辑触发 updateRequirement
  - [ ] 11.7 `tests/unit/renderer/components/ScoringModelEditor.test.tsx`：
    - 嵌套表格正确渲染评分模型
    - 行内编辑分值/推理依据
    - 确认按钮状态管理

- [ ] Task 12: 集成验证 (AC: 全部)
  - [ ] 12.1 验证 `pnpm lint && pnpm typecheck && pnpm build` 全部通过
  - [ ] 12.2 验证数据库迁移正确执行（004 迁移 up/down）
  - [ ] 12.3 验证完整流程：上传招标文件 → 解析 → 抽取需求+评分模型 → 展示 → 修正 → 确认 → 文件持久化
  - [ ] 12.4 验证 task-queue 异步执行 + 进度推送正常
  - [ ] 12.5 验证 scoring-model.json 文件内容与 SQLite 数据一致

## Dev Notes

### 架构模式与约束

**本 Story 在架构中的位置：**
```
用户点击"抽取需求"
  → Renderer (analysisStore.extractRequirements)
    → IPC (analysis:extract-requirements)
      → analysis-handlers.ts（薄分发）
        → task-queue.enqueue()（异步白名单）→ 返回 { taskId } 给渲染进程
          → scoringExtractor.extract()（task-queue 执行器内运行）
            → extractRequirementsPrompt(context)（构建提示词）
            → agentOrchestrator.execute({ agentType: 'extract', context }) → { taskId: innerTaskId }
              → orchestrator 内部：agent handler → ai-proxy.call()（脱敏 → LLM → 还原）
            → 轮询 agentOrchestrator.getAgentStatus(innerTaskId) 等待 completed
            → 从 AgentStatus.result.content 提取 LLM 响应
            → JSON 解析 LLM 响应为 ExtractionResult
            → requirementRepo.create()（持久化需求到 SQLite）
            → scoringModelRepo.upsert()（持久化评分模型到 SQLite）
            → fs.writeFile(scoring-model.json)（文件系统双写）
          → task-queue progress → IPC push → analysisStore.updateExtractionProgress
```

**关键编排约束：**
- 所有 AI 调用必须经过 agent-orchestrator → ai-proxy，禁止直接调用 API
- 抽取操作必须通过 task-queue 异步执行（白名单要求）
- IPC handler 仅做薄分发，业务逻辑在 ScoringExtractor 服务中
- 评分模型确认后双写：SQLite + `scoring-model.json`（保证文件系统和数据库一致）

### 已有代码资产（禁止重复创建）

| 已有文件 | 内容 | Story |
|----------|------|-------|
| `src/main/services/document-parser/rfp-parser.ts` | RfpParser.parse() → ParsedTender | 2.3 |
| `src/main/services/document-parser/tender-import.ts` | TenderImportService（文件导入 + task-queue 编排） | 2.3 |
| `src/main/services/agent-orchestrator/orchestrator.ts` | AgentOrchestrator.execute() | 2.2 |
| `src/main/services/agent-orchestrator/agents/parse-agent.ts` | parse agent handler | 2.2 |
| `src/main/services/task-queue/queue.ts` | TaskQueueService.enqueue/execute/registerExecutor | 2.2 |
| `src/main/services/task-queue/progress-emitter.ts` | ProgressEmitter IPC 推送 | 2.2 |
| `src/main/services/ai-proxy/index.ts` | aiProxy.call(request) | 2.1 |
| `src/main/ipc/analysis-handlers.ts` | analysis:import-tender, analysis:get-tender | 2.3 |
| `src/renderer/src/stores/analysisStore.ts` | Zustand store + import/parse state | 2.3 |
| `src/renderer/src/modules/analysis/components/AnalysisView.tsx` | 分析模块入口 | 2.3 |
| `src/renderer/src/modules/analysis/components/ParseProgressPanel.tsx` | 进度条组件 | 2.3 |
| `src/shared/analysis-types.ts` | ParsedTender, TenderSection, TenderMeta，及 analysis 域共享 DTO（ImportTenderInput 等） | 2.3 |
| `src/shared/ai-types.ts` | AgentType, AgentExecuteRequest, TaskStatus | 2.2 |
| `src/shared/ipc-types.ts` | `IPC_CHANNELS` 常量 + `IpcChannelMap`（含 analysis:import-tender 等） | 2.3 |
| `src/shared/constants.ts` | ErrorCode 枚举（含 AI_PROXY_*, AGENT_*, TASK_* 等） | 2.1/2.2 |
| `src/main/utils/errors.ts` | BidWiseError / AiProxyError / TaskQueueError | 2.1/2.2 |
| `src/main/utils/logger.ts` | createLogger(module) | 1.1 |
| `src/main/db/schema.ts` | `DB` 接口（projects, tasks 表） | 1.2 |
| `src/main/db/repositories/project-repo.ts` | UUID 生成模式 `v4 as uuidv4` | 1.2 |
| `src/main/prompts/parse-rfp.prompt.ts` | RFP 解析提示词（参照格式） | 2.3 |
| `src/main/prompts/index.ts` | 提示词导出入口 | 2.3 |

**关键提醒：**
- `AgentType` 当前为 `'parse' | 'generate'`，需决定是复用 `'parse'` 还是扩展新类型
- analysis 域新增 IPC 时，需遵循现有模式：共享 DTO 定义在 `src/shared/analysis-types.ts`，`src/shared/ipc-types.ts` 负责 import 后同时扩展 `IPC_CHANNELS` 和 `IpcChannelMap`
- `analysisStore` 已有 `importTender`/`fetchTenderResult` 等 action，本 Story 在其基础上扩展
- `analysis-handlers.ts` 已有 2 个通道，本 Story 新增 6 个通道
- 迁移编号续接 003，新增为 004
- `AnalysisView.tsx` 已有上传/解析 UI，本 Story 在解析完成后追加需求抽取 UI
- 遵循已有 `TenderImportService` 的 task-queue 编排模式

### 评分模型数据设计

**scoring-model.json 文件格式（与 ScoringModel 类型对齐）：**
```json
{
  "projectId": "uuid",
  "totalScore": 100,
  "criteria": [
    {
      "id": "uuid",
      "category": "技术方案",
      "maxScore": 60,
      "weight": 0.6,
      "subItems": [
        {
          "id": "uuid",
          "name": "系统架构设计",
          "maxScore": 15,
          "description": "系统整体架构的合理性和先进性",
          "sourcePages": [23, 24]
        }
      ],
      "reasoning": "招标文件第23页明确技术方案占60分，包含系统架构、功能设计等子项",
      "status": "extracted"
    }
  ],
  "extractedAt": "2026-03-21T10:00:00.000Z",
  "confirmedAt": null,
  "version": 1
}
```

**双写策略：**
- SQLite `scoring_models` 表：`criteria` 列存储 JSON 字符串，用于查询和状态管理
- 文件系统 `scoring-model.json`：与 SQLite 内容一致，用于下游 Story 文件级引用
- 确认操作同时更新两处，保证一致性
- 如不一致，以 SQLite 为权威源

### LLM 提示词设计要点

**提示词策略：**
- 单次调用同时抽取需求清单 + 评分模型（减少 API 调用次数和成本）
- 如果招标文件超长（>50 页），考虑分段抽取后合并（但 Alpha 阶段先实现单次调用）
- 输出格式严格约束为 JSON，提示词中给出完整 schema 示例
- 中文提示词，指导 LLM 扮演资深售前工程师角色

**LLM JSON 响应解析：**
- 支持 markdown code fence 包裹（` ```json ... ``` `）
- 字段缺失时使用默认值（category → 'other'，priority → 'medium'）
- maxScore 为 0 或负数时标记为异常
- 总分不等于各项之和时日志警告但不阻断

### 进度反馈设计

```
0%   — 开始抽取，正在构建提示词
20%  — 提示词已构建，正在调用 AI
80%  — AI 返回结果，正在解析和持久化
100% — 抽取完成
```

### 与后续 Story 的接口契约

**Story 2.6（必响应项检测）将消费：**
- `requirementRepo.findByProject(projectId)` — 获取需求清单作为检测输入
- `RequirementItem` 类型

**Story 2.8（追溯矩阵）将消费：**
- `scoringModelRepo.findByProject(projectId)` — 获取评分模型
- `RequirementItem[]` — 需求清单
- `ScoringModel` 类型

**Story 7.8（评分仪表盘）将消费：**
- `scoring-model.json` 文件 — 评分权重分布
- `ScoringModel.criteria` — 逐项分值

本 Story 需为这些消费者预留稳定接口，但不提前实现下游逻辑。

### 反模式清单（禁止）

- ❌ 直接调用 ai-proxy 绕过 agent-orchestrator
- ❌ 抽取操作不走 task-queue（白名单强制要求）
- ❌ IPC handler 中写业务逻辑（必须委托给 ScoringExtractor 服务）
- ❌ 手动 snake_case ↔ camelCase 转换（Kysely CamelCasePlugin 处理）
- ❌ 硬编码提示词在业务代码中（必须在 `prompts/` 目录）
- ❌ `../../` 相对路径 import（使用 `@main/`、`@shared/`、`@renderer/` 别名）
- ❌ throw 裸字符串（使用 BidWiseError 或子类）
- ❌ `isLoading`/`fetching` 命名（统一用 `loading: boolean`）
- ❌ 渲染进程直接 import Node.js 模块
- ❌ 同步文件 I/O（使用 `fs.promises`）
- ❌ 评分模型仅存文件不存数据库（必须双写）

### 前序 Story 开发经验

**Story 2.3 关键经验（tender-import 模式参考）：**
- `TenderImportService` 是 task-queue 编排的参考实现——本 Story 的 `ScoringExtractor` 应遵循同样的 enqueue → execute → progress → complete 模式
- `analysis-handlers.ts` 的 createIpcHandler 工厂使用模式已成熟，直接扩展

**Story 2.2 关键经验（orchestrator 集成参考）：**
- `agentOrchestrator.execute()` 接收 `AgentExecuteRequest`，内部自动编排脱敏 → AI 调用 → 还原
- Agent handler 只需返回 `AiRequestParams`（prompt + config），orchestrator 处理其余一切

**Story 2.1 关键经验（ai-proxy 参考）：**
- aiProxy.call() 的 `caller` 字段用于追踪日志，本 Story 应传 `'extract-agent'` 或 `'scoring-extractor'`

### 测试规范

- **单元测试：** Vitest（主进程测试用 Node.js 环境，渲染进程组件测试用 jsdom）
- **Agent/AI Mock 策略：** `vi.mock` `agentOrchestrator.execute()` 返回 `{ taskId }`；`vi.mock` `agentOrchestrator.getAgentStatus()` 返回 `completed` 状态和 `result.content` 中的预设 JSON 字符串
- **DB 测试策略：** 使用内存 SQLite（`:memory:`）+ 迁移，测试完整 CRUD
- **组件测试策略：** `@testing-library/react` + Ant Design 组件 mock
- **进度测试：** 验证 progress callback 按预期序列调用

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5 需求结构化抽取与评分模型]
- [Source: _bmad-output/planning-artifacts/prd.md#FR11 结构化抽取技术需求]
- [Source: _bmad-output/planning-artifacts/prd.md#FR12 LLM 动态评分模型]
- [Source: _bmad-output/planning-artifacts/architecture.md#评分模型数据结构]
- [Source: _bmad-output/planning-artifacts/architecture.md#Agent 编排层设计原则]
- [Source: _bmad-output/planning-artifacts/architecture.md#异步任务白名单]
- [Source: _bmad-output/planning-artifacts/architecture.md#代码组织结构 document-parser/]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#阶段2 需求分析 UX 流程]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#评分仪表盘]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### Change Log

- 2026-03-21 — Story 文件创建，包含需求结构化抽取与评分模型完整开发上下文
