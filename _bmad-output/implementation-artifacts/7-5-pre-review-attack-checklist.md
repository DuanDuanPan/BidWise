# Story 7.5: "先评后写"攻击清单

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 在正式撰写方案前先看到对抗攻击清单,
So that 我在写的时候就进行防御性写作，而非写完再被打回。

## Acceptance Criteria

1. **AC1 — 攻击清单异步生成**
   Given 项目已完成招标文件分析（需求提取完成）
   When 用户在评审模块或撰写阶段入口点击"生成攻击清单"
   Then 对抗 Agent 基于招标需求、评分标准、策略种子和*项列表异步生成攻击清单（通过 task-queue），Toast 显示生成进度，生成完成后清单自动加载（FR44）

   Given 攻击清单生成请求
   When LLM 调用失败或超时
   Then 系统回退到预置通用攻击清单（5-8 条通用检查项），标记 `generationSource: 'fallback'`，顶部显示橙色警告"AI 生成失败，已使用通用攻击清单"

   Given 项目已有攻击清单
   When 用户再次点击"重新生成"
   Then 旧清单条目全部清除，重新执行 LLM 生成（覆盖语义，非追加）

2. **AC2 — 攻击清单侧边面板展示**
   Given 攻击清单已生成
   When 用户进入 SOP 阶段 4（方案撰写），或处于阶段 5 且当前未打开对抗评审结果面板
   Then 右侧侧边栏显示"攻击清单"可折叠 section，清单条目按 severity（critical → major → minor）排序，每条展示攻击角度摘要 + severity 徽标 + 目标章节（如有）

   Given 攻击清单面板中有条目
   When 用户点击某条目展开
   Then 显示完整攻击场景描述 + 防御建议 + 分类标签；若有 `targetSection` 则显示可点击的章节跳转链接

   Given 某条目包含 `targetSection`
   When 用户点击目标章节链接
   Then 系统优先使用 `targetSectionLocator` 做稳定章节跳转；若当前不在阶段 4，则先切回 `proposal-writing` 再滚动到对应章节

   Given 攻击清单面板
   When 清单为空或未生成
   Then 显示引导文案：`尚未生成攻击清单。点击"生成攻击清单"按钮，让 AI 帮您提前发现方案薄弱点。`

3. **AC3 — 条目状态追踪**
   Given 攻击清单面板中有条目
   When 用户点击条目的"已防御"按钮
   Then 条目状态变为 `addressed`，视觉变为绿色边框 + 删除线 + "已防御"标签，面板标题 badge 更新（如 `攻击清单 3/8`）

   Given 攻击清单面板中有条目
   When 用户点击条目的"忽略"按钮
   Then 条目状态变为 `dismissed`，从默认视图中隐藏（可通过"显示全部"开关恢复可见）

   Given 攻击清单有已防御/已忽略的条目
   When 用户切换项目或刷新页面
   Then 条目状态从 SQLite 恢复，不丢失

4. **AC4 — 进度概览**
   Given 攻击清单已有条目
   When 面板渲染
   Then 面板顶部显示进度条：`已防御 N / 共 M 条`（不含已忽略），进度条颜色跟随完成度（红<50% / 橙50-80% / 绿>80%）

5. **AC5 — 持久化与恢复**
   Given 攻击清单已生成且有状态变更
   When 用户关闭并重新打开项目
   Then 攻击清单及所有条目状态从 SQLite 完整恢复

   Given 项目数据
   When 攻击清单数据结构
   Then 每个项目至多一份攻击清单（upsert 语义），清单和条目均持久化到 SQLite

## Tasks / Subtasks

### Task 1: 数据模型与类型定义 (AC: #1, #3, #5)

- [ ] 1.1 创建 `src/shared/attack-checklist-types.ts`
  - `AttackChecklistItemSeverity = FindingSeverity`（直接复用 `src/shared/adversarial-types.ts` 中的 severity 联合类型，避免重复定义）
  - `AttackChecklistItemStatus = 'unaddressed' | 'addressed' | 'dismissed'`
  - `AttackChecklistStatus = 'generating' | 'generated' | 'failed'`
  - `AttackChecklistItem = { id: string; checklistId: string; category: string; attackAngle: string; severity: AttackChecklistItemSeverity; defenseSuggestion: string; targetSection: string | null; targetSectionLocator: ChapterHeadingLocator | null; status: AttackChecklistItemStatus; sortOrder: number; createdAt: string; updatedAt: string }`
  - `AttackChecklist = { id: string; projectId: string; status: AttackChecklistStatus; items: AttackChecklistItem[]; generationSource: 'llm' | 'fallback'; warningMessage: string | null; generatedAt: string; createdAt: string; updatedAt: string }`
  - `GenerateAttackChecklistInput = { projectId: string }`
  - `UpdateChecklistItemStatusInput = { itemId: string; status: AttackChecklistItemStatus }`
  - `AttackChecklistLLMOutput = Array<{ category: string; attackAngle: string; severity: string; defenseSuggestion: string; targetSection?: string }>`（LLM 原始输出格式）

- [ ] 1.2 在 `src/main/db/schema.ts` 新增两个表接口
  - `AttackChecklistsTable`：`id`, `projectId`, `status`, `generationSource`, `warningMessage`, `generatedAt`, `createdAt`, `updatedAt`
  - `AttackChecklistItemsTable`：`id`, `checklistId`, `category`, `attackAngle`, `severity`, `defenseSuggestion`, `targetSection`, `targetSectionLocator`, `status`, `sortOrder`, `createdAt`, `updatedAt`
  - 在 `DB` 接口新增 `attackChecklists` 和 `attackChecklistItems`

- [ ] 1.3 在 `src/shared/ai-types.ts` 的 `AgentType` 联合类型中新增 `'attack-checklist'`

### Task 2: 数据库迁移 (AC: #5)

- [ ] 2.1 创建迁移文件（检查当前最新迁移编号，使用下一个可用编号）
  - 表 `attack_checklists`：
    - `id` TEXT PK
    - `project_id` TEXT NOT NULL UNIQUE REFERENCES `projects(id)` ON DELETE CASCADE（每个项目至多一份）
    - `status` TEXT NOT NULL DEFAULT 'generating'
    - `generation_source` TEXT NOT NULL DEFAULT 'llm'
    - `warning_message` TEXT
    - `generated_at` TEXT
    - `created_at` TEXT NOT NULL
    - `updated_at` TEXT NOT NULL
  - 表 `attack_checklist_items`：
    - `id` TEXT PK
    - `checklist_id` TEXT NOT NULL REFERENCES `attack_checklists(id)` ON DELETE CASCADE
    - `category` TEXT NOT NULL
    - `attack_angle` TEXT NOT NULL
    - `severity` TEXT NOT NULL DEFAULT 'major'
    - `defense_suggestion` TEXT NOT NULL
    - `target_section` TEXT
    - `target_section_locator` TEXT（JSON 序列化后的 `ChapterHeadingLocator`）
    - `status` TEXT NOT NULL DEFAULT 'unaddressed'
    - `sort_order` INTEGER NOT NULL DEFAULT 0
    - `created_at` TEXT NOT NULL
    - `updated_at` TEXT NOT NULL
  - 索引：`attack_checklists_project_id_idx`（unique）+ `idx_attack_checklist_items_checklist_id` ON `checklist_id`
  - **注意**：当前仓库最新迁移为 `014_create_adversarial_reviews.ts`，默认新建 `015_create_attack_checklists.ts`；仅当实现分支已新增 015 时再顺延

### Task 3: Repository 层 (AC: #1, #3, #5)

- [ ] 3.1 创建 `src/main/db/repositories/attack-checklist-repo.ts`
  - 遵循 `adversarial-lineup-repo.ts` + `adversarial-review-repo.ts` 模式
  - `findByProjectId(projectId: string): Promise<AttackChecklist | null>` — 返回清单 + 加载所有条目（LEFT JOIN 或两次查询），条目按 `sort_order` ASC 排序
  - `saveChecklist(input: { id?: string; projectId; status; generationSource; warningMessage?; generatedAt? }): Promise<AttackChecklist>` — 复用 lineup/review repo 的“先查 `projectId` 再 update/insert”模式，**不要**使用 raw `INSERT OR REPLACE`（会重写父行并破坏子项 FK 语义）
  - `saveItems(items: Array<{...}>): Promise<void>` — 批量插入（分块 50 条），并序列化 `targetSectionLocator`
  - `deleteItemsByChecklistId(checklistId: string): Promise<void>` — 清除旧条目（重新生成时使用）
  - `updateItemStatus(itemId: string, status: AttackChecklistItemStatus): Promise<AttackChecklistItem>` — 更新单条目状态 + `updatedAt`
  - `updateChecklistStatus(id: string, status: AttackChecklistStatus, warningMessage?: string): Promise<void>` — 更新清单状态

### Task 4: Prompt 与 Agent Handler (AC: #1)

- [ ] 4.1 创建 `src/main/prompts/attack-checklist.prompt.ts`
  - 接口 `AttackChecklistPromptContext`：
    - `requirements: string` — 招标需求摘要
    - `scoringCriteria: string` — 评分标准
    - `mandatoryItems?: string` — *项列表
    - `strategySeed?: string` — 策略种子
    - `proposalType?: string` — 方案类型
    - `industry?: string` — 行业
  - 导出 `ATTACK_CHECKLIST_SYSTEM_PROMPT: string` — 系统提示词（角色：资深投标评审战略分析师）
  - 导出 `attackChecklistPrompt(context): string` — 用户提示词
  - Prompt 要求 LLM 输出 JSON 数组，每项含：`category`（攻击分类）、`attackAngle`（攻击场景描述）、`severity`（critical/major/minor）、`defenseSuggestion`（防御建议）、`targetSection`（建议在哪个章节防御，可选）
  - 引导 LLM 生成 8-15 条差异化攻击，覆盖维度：技术方案可行性、实施计划合理性、成本控制、合规性、竞对优势对比、团队能力、运维复杂度、行业适配性等

- [ ] 4.2 创建 `src/main/services/agent-orchestrator/agents/attack-checklist-agent.ts`
  - 导出 `attackChecklistAgentHandler: AgentHandler`
  - 模式参考 `adversarial-agent.ts`（单一模式 handler）
  - 流程：
    1. `updateProgress(10, '正在分析项目攻击面...')`
    2. 从 context 提取字段，构建 `AttackChecklistPromptContext`
    3. 调用 `attackChecklistPrompt(context)` 生成 prompt
    4. `updateProgress(30, '正在生成攻击清单...')`
    5. 返回 `AiRequestParams`（system prompt + user prompt，maxTokens: 4096，temperature: 0.7）

- [ ] 4.3 在 `src/main/services/agent-orchestrator/index.ts` 注册新 agent
  - `import { attackChecklistAgentHandler } from './agents/attack-checklist-agent'`
  - `agentOrchestrator.registerAgent('attack-checklist', attackChecklistAgentHandler)`

### Task 5: 攻击清单服务层 (AC: #1, #3)

- [ ] 5.1 创建 `src/main/services/attack-checklist-service.ts`
  - 使用 `createLogger('attack-checklist-service')`
  - **默认通用攻击清单**（`DEFAULT_FALLBACK_CHECKLIST`）：5-8 条通用条目，覆盖"*项覆盖完整性"、"技术架构选型论证"、"实施计划时间合理性"、"成本估算依据充分性"、"竞对差异化优势"等
  - `generate(projectId: string): Promise<{ taskId: string }>`
    - 加载项目上下文：requirements（`requirementRepo`）、scoringModel（`scoringModelRepo`）、mandatoryItems（`mandatoryItemRepo`）、strategySeeds（复用 `adversarial-lineup-service.ts` 的 `StrategySeedRepository.findByProject()` + confirmed/adjusted → pending fallback 选择逻辑）、project.proposalType + project.industry，以及 `documentService.getMetadata(projectId).sectionIndex`
    - 若已有清单（`findByProjectId`），保留 checklist 父记录 id，仅删除旧条目（`deleteItemsByChecklistId`）；不要通过 SQL REPLACE 替换父记录
    - 创建/更新清单记录（status: `generating`）
    - 调用 `agentOrchestrator.execute({ agentType: 'attack-checklist', context: {...} })`
    - 返回 `{ taskId }`
    - 采用与 `adversarial-lineup-service.ts` 相同的 task 轮询模式（1 秒间隔，120 秒超时）
    - 任务完成后：解析 LLM JSON 输出 → 归一化条目（校验 severity、补全默认值）→ 使用 `sectionIndex` 将 `targetSection` 解析为 `targetSectionLocator`（无法稳定定位时保留文本并写入 `null`）→ 按 severity 权重 + 原始顺序排序 → 批量保存条目 → 更新清单状态为 `generated`
    - LLM 失败时：使用 `DEFAULT_FALLBACK_CHECKLIST` → 保存 → 状态 `generated` + `generationSource: 'fallback'` + `warningMessage`
  - `getChecklist(projectId: string): Promise<AttackChecklist | null>` — 透传 repo
  - `updateItemStatus(itemId: string, status: AttackChecklistItemStatus): Promise<AttackChecklistItem>` — 调用 `repo.updateItemStatus()`
  - JSON 解析辅助：复用 Story 7-2 中 `adversarial-lineup-service.ts` 已有的 markdown fence 剥离 + raw JSON 提取模式

### Task 6: IPC 通道与预加载 (AC: #1, #3)

- [ ] 6.1 在 `src/shared/ipc-types.ts` 新增 3 个 IPC 频道
  - `IPC_CHANNELS` 新增：
    - `REVIEW_GENERATE_ATTACK_CHECKLIST: 'review:generate-attack-checklist'`
    - `REVIEW_GET_ATTACK_CHECKLIST: 'review:get-attack-checklist'`
    - `REVIEW_UPDATE_CHECKLIST_ITEM_STATUS: 'review:update-checklist-item-status'`
  - `IpcChannelMap` 新增对应 3 个频道的 input/output 类型映射

- [ ] 6.2 在 `src/main/ipc/review-handlers.ts` 新增 3 个 handler
  - 追加到现有 `reviewHandlerMap` 中（已有 8 个 `review:*` 频道）
  - 使用 `createIpcHandler()` 模式，handler 仅做参数透传

- [ ] 6.3 确认 `src/main/ipc/index.ts` 现有 `registerReviewHandlers()` 调用无需修改
  - 新增 handler 在 `review-handlers.ts` 内部注册，外部注册入口不变

- [ ] 6.4 更新 `src/preload/index.ts` 暴露 3 个新 API
  - `window.api.reviewGenerateAttackChecklist({ projectId })`
  - `window.api.reviewGetAttackChecklist({ projectId })`
  - `window.api.reviewUpdateChecklistItemStatus({ itemId, status })`
  - 遵循现有 `typedInvoke()` 模式

- [ ] 6.5 **不要手动编辑** `src/preload/index.d.ts`
  - `window.api` 类型继续由 `src/shared/ipc-types.ts` 中的 `FullPreloadApi` 自动派生
  - 只需保持 `IpcChannelMap` 与 `src/preload/index.ts` 同步，并在 `security.test.ts` 中补充白名单断言

### Task 7: 状态管理扩展 (AC: #1, #2, #3, #4, #5)

- [ ] 7.1 在 `src/renderer/src/stores/reviewStore.ts` 扩展 `ReviewProjectState`
  - 新增状态字段：
    - `attackChecklist: AttackChecklist | null`
    - `attackChecklistLoaded: boolean`
    - `attackChecklistLoading: boolean`
    - `attackChecklistError: string | null`
    - `attackChecklistTaskId: string | null`
    - `attackChecklistProgress: number`
    - `attackChecklistMessage: string | null`
  - 新增 Actions：
    - `startAttackChecklistGeneration(projectId: string): Promise<void>` — 调用 `window.api.reviewGenerateAttackChecklist()`，仅设置 `attackChecklistTaskId`；**不要**在 store/hook 内自行启动轮询
    - `loadAttackChecklist(projectId: string): Promise<boolean>` — 调用 `window.api.reviewGetAttackChecklist()`
    - `refreshAttackChecklist(projectId: string): Promise<void>` — 轻量刷新，遵循 `reviewStore` 现有 per-project version guard，避免 stale response 覆盖
    - `updateChecklistItemStatus(projectId: string, itemId: string, status: AttackChecklistItemStatus): Promise<void>` — 乐观更新 + 调用 `window.api.reviewUpdateChecklistItemStatus()`
    - `setAttackChecklistProgress(projectId: string, progress: number, message?: string): void`
    - `setAttackChecklistTaskError(projectId: string, error: string): void`
    - `clearAttackChecklistError(projectId: string): void`
  - 在 `createProjectState()` 中添加新字段的初始值
  - 扩展 `TaskKind` / `findReviewProjectIdByTaskId()` / `useReviewTaskMonitor`：识别 `attackChecklistTaskId`；outer task progress 由 monitor 统一消费，completed 时 `loadAttackChecklist()`，failed 时设置 error

### Task 8: UI 组件与侧边栏集成 (AC: #2, #3, #4)

- [ ] 8.1 创建 `src/renderer/src/modules/review/components/AttackChecklistPanel.tsx`
  - 可折叠 section（与 RecommendationPanel 同层级结构）
  - 标题：`攻击清单` + badge（如 `3/8 已防御`）
  - 进度条：`已防御 N / 共 M 条`（颜色：红<50% / 橙50-80% / 绿>80%），不含已忽略条目
  - "显示全部"开关（控制是否显示已忽略条目，默认关闭）
  - 生成中状态：Spin + 进度消息
  - 未生成状态：引导文案 + "生成攻击清单"按钮
  - 生成失败顶部：橙色 Alert "AI 生成失败，已使用通用攻击清单"（当 `generationSource === 'fallback'`）
  - "重新生成"按钮（已有清单时可见）

- [ ] 8.2 创建 `src/renderer/src/modules/review/components/AttackChecklistItemCard.tsx`
  - 卡片结构（参考 `AdversarialFindingCard` 风格但更轻量）：
    - 头部：severity 徽标（`critical` 红 / `major` 橙 / `minor` 蓝）+ 分类标签 + 目标章节链接（如有）
    - 摘要行：`attackAngle` 截断 2 行
    - 展开区域（点击 toggle）：完整 `attackAngle` + `defenseSuggestion` 高亮框
    - 操作按钮行：`已防御`（primary，点击后变为绿色勾选态）、`忽略`（text）
  - `addressed` 状态：绿色左边框 + "已防御"标签 + 文字删除线 + 操作按钮隐藏
  - `dismissed` 状态：灰色半透明 + "已忽略"标签（仅在"显示全部"开关打开时可见）
  - 目标章节链接：仅当 `targetSectionLocator` 已解析时才渲染为可点击链接；点击后通过宿主回调复用 `ProjectWorkspace.handleNavigateToChapter()` / `scrollToHeading()` 跳转；若 locator 为空则只展示文本标签

- [ ] 8.3 创建 `src/renderer/src/modules/review/hooks/useAttackChecklist.ts`
  - `useAttackChecklist(projectId?: string)` — 封装 store 操作
  - 自动在 mount 时加载已有清单（`loadAttackChecklist`）
  - 返回：`{ checklist, loading, error, progress, message, generateChecklist, updateItemStatus, clearError, stats }`
  - `stats`：计算属性 `{ total, addressed, dismissed, remaining, progressPercent }`
  - 不含已忽略条目的 total/progress 计算

- [ ] 8.4 侧边栏集成
  - 将 `AttackChecklistPanel` 集成到项目工作空间右侧侧边栏
  - 修改文件：`src/renderer/src/modules/project/components/AnnotationPanel.tsx` + `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
  - 阶段 4：在 `AnnotationPanel` shell 中将攻击清单 section 放在批注主体与 `RecommendationPanel` 之间
  - 阶段 5：当 `AdversarialReviewPanel` **未打开**时，继续复用右侧 `AnnotationPanel` shell 展示攻击清单；当 review panel 打开时，保持 Story 7.3 的右侧替换关系，不并列渲染
  - **仅在 SOP 阶段 4（方案撰写）和阶段 5（评审打磨）时渲染**
  - 阶段判断复用现有 `ProjectWorkspace` / `AnnotationPanel` 的 `currentStageKey` / `sopPhase` 传参，不要在 `AttackChecklistPanel` 内自行读取 `projectStore.currentProject`
  - 面板在阶段 4 默认展开，阶段 5 默认折叠（因为阶段 5 更侧重对抗评审本身）
  - `ProjectWorkspace` 需要把现有 `handleNavigateToChapter()` 作为回调传给 checklist 条目，确保阶段 5 点击目标章节时会先切回 `proposal-writing` 再滚动

- [ ] 8.5 生成触发入口
  - 在 `AttackChecklistPanel` 的空状态中提供"生成攻击清单"按钮
  - 在 `AdversarialLineupDrawer`（7-2 组件）中增加辅助入口：lineup 确认后提示"建议生成攻击清单进行防御性写作"（Link 文字，非强制）
  - 按钮点击后调用 `generateChecklist()`，进入 loading 态

### Task 9: 测试矩阵 (AC: #1, #2, #3, #4, #5)

- [ ] 9.1 新建 `tests/unit/main/db/repositories/attack-checklist-repo.test.ts`
  - 覆盖：`saveChecklist()` upsert、`findByProjectId()` 含条目加载与排序、`saveItems()` 批量插入、`deleteItemsByChecklistId()` 级联清除、`updateItemStatus()` 状态更新 + updatedAt、UNIQUE 约束验证

- [ ] 9.2 新建 `tests/unit/main/services/attack-checklist-service.test.ts`
  - 覆盖：
    - `generate()` 正常 LLM 生成 → 解析 → 保存
    - `generate()` LLM 失败 → fallback 清单
    - `generate()` 已有清单 → 删除旧条目 → 重新生成
    - `generate()` JSON 解析失败 → fallback
    - `getChecklist()` 透传
    - `updateItemStatus()` 透传
    - 上下文加载（requirements/scoring/mandatory/seed）

- [ ] 9.3 新建 `tests/unit/main/services/agent-orchestrator/attack-checklist-agent.test.ts`
  - 覆盖：prompt 构建、progress 更新、返回参数结构、context 字段提取

- [ ] 9.4 新建 `tests/unit/main/ipc/review-handlers-attack-checklist.test.ts`
  - 覆盖：3 个新频道注册、参数透传与错误包装
  - 或在现有 `review-handlers.test.ts` 中追加

- [ ] 9.5 更新 `tests/unit/preload/security.test.ts`
  - 新增 `reviewGenerateAttackChecklist`、`reviewGetAttackChecklist`、`reviewUpdateChecklistItemStatus` 到 preload 白名单断言

- [ ] 9.6 新建 `tests/unit/renderer/stores/reviewStore-attack-checklist.test.ts`
  - 覆盖：startAttackChecklistGeneration（设置 taskId + loading，无本地 polling）、loadAttackChecklist（成功/失败）、refreshAttackChecklist 版本保护、updateChecklistItemStatus（乐观更新 + 回滚）、清单状态恢复、`TaskKind`/taskId 映射

- [ ] 9.7 新建 `tests/unit/renderer/modules/review/components/AttackChecklistPanel.test.tsx`
  - 覆盖：空状态引导文案、生成按钮触发、loading Spin、条目列表渲染、进度条颜色映射、badge 计数、fallback 警告 Alert、"显示全部"开关

- [ ] 9.8 新建 `tests/unit/renderer/modules/review/components/AttackChecklistItemCard.test.tsx`
  - 覆盖：severity 徽标渲染、展开/折叠切换、"已防御"按钮 → 状态变化、"忽略"按钮 → 隐藏（默认视图）、目标章节链接仅在 locator 存在时可点击、已防御态视觉（绿色边框 + 删除线）

- [ ] 9.9 更新 `tests/unit/renderer/project/AnnotationPanel.test.tsx`
  - 覆盖：阶段 4/5 checklist section 渲染顺序、与 `RecommendationPanel` 的堆叠关系、阶段 5 默认折叠

- [ ] 9.10 更新 `tests/unit/renderer/project/ProjectWorkspace.test.tsx`
  - 覆盖：阶段 5 review panel precedence、`projectId` 在阶段 5 仍透传给 `AnnotationPanel`、点击 checklist 目标章节时通过 `handleNavigateToChapter()` 切回 `proposal-writing`

- [ ] 9.11 新建 `tests/e2e/stories/story-7-5-attack-checklist.spec.ts`
  - 种入项目 + requirements 数据到测试 SQLite
  - 覆盖：
    - 生成攻击清单，面板显示条目列表
    - 标记条目为"已防御"，视觉变化 + badge 更新
    - 忽略条目，默认视图中隐藏
    - 关闭重新打开项目，条目状态恢复
    - 阶段 5 点击目标章节链接，自动切回阶段 4 并定位对应章节
    - LLM 失败时 fallback 清单显示 + 警告

## Dev Notes

### 架构要点

- **Agent 注册模式**：Story 7-2 注册了 `adversarial` agent（角色生成），7-3 注册了 `adversarial-review` agent（评审执行）。本故事注册新的 `attack-checklist` agent，遵循相同的"独立 agent handler 文件 + index.ts 注册"模式，**不要**在现有 adversarial-agent.ts 中添加模式分支。
- **Task 边界**：Service 内部仅轮询 `agentOrchestrator` 的子任务，外层 `review:*` 任务进度仍由 renderer 侧 `useReviewTaskMonitor` 统一消费；不要在 store/hook 内再起第二套 polling timer。
- **JSON 解析鲁棒性**：复用 Story 7-2 中 lineup service 已有的 markdown fence 剥离（````json ... ```）+ 裸 JSON 提取逻辑，不要重新实现。如已提取为共享 helper 则直接引用。
- **upsert 语义**：每个项目至多一份攻击清单。重新生成时先删除旧条目再插入新条目；父记录必须沿用 lineup/review repo 的 update-or-insert 模式，避免 `INSERT OR REPLACE` 替换父行并影响子项 FK。
- **阶段感知与宿主**：攻击清单面板仅在 SOP 阶段 4 和 5 可见，且由 `ProjectWorkspace` / `AnnotationPanel` 现有 `currentStageKey` / `sopPhase` 传参驱动；阶段 5 若 `AdversarialReviewPanel` 打开，保持 Story 7.3 的右侧替换关系。
- **章节跳转**：`targetSection` 只负责展示文本，服务层需基于 `proposal.meta.json sectionIndex` 派生 `targetSectionLocator`；UI 点击时复用 `ProjectWorkspace.handleNavigateToChapter()` + `scrollToHeading()`，确保阶段 5 可切回撰写态。
- **数据落点**：所有数据持久化到主应用 SQLite（`app.getPath('userData')/data/db/bidwise.sqlite`），与 adversarial lineups/reviews 一致。

### 与 Story 7-2/7-3 的关系

| 能力 | 7-2 已完成 | 7-3 已完成 | 7-5 新增 |
|---|---|---|---|
| Agent 类型 | `adversarial`（角色生成） | `adversarial-review`（评审执行） | `attack-checklist`（攻击清单生成） |
| 数据模型 | `adversarial_lineups` | `adversarial_review_sessions` + `adversarial_findings` | `attack_checklists` + `attack_checklist_items` |
| IPC 频道 | `review:generate-roles` / `get-lineup` / `update-roles` / `confirm-lineup` | `review:start-execution` / `get-review` / `handle-finding` / `retry-role` | `review:generate-attack-checklist` / `get-attack-checklist` / `update-checklist-item-status` |
| Store 状态 | lineup + lineupTaskId + progress | reviewSession + reviewTaskId + progress | attackChecklist + attackChecklistTaskId + progress |
| UI 组件 | LineupDrawer / RoleCard / AddRoleModal | ReviewPanel / FindingCard / FailedRoleAlert | AttackChecklistPanel / AttackChecklistItemCard |

### 前置 Story 关键学习

1. **inner agent 轮询不能在 renderer 做**：类似 7-2，攻击清单 service 内部负责轮询 `agentOrchestrator` 子任务；renderer 只监听外层 task-queue 进度（`useReviewTaskMonitor`），不要在 store/hook 再增加 interval。
2. **LLM 输出 JSON 解析**：必须处理 markdown 代码块包裹（```json ... ```）、裸 JSON 对象/数组、以及格式异常的降级。
3. **Fallback 是完成态不是错误态**：LLM 失败后使用默认清单，状态为 `generated` + `generationSource: 'fallback'`，用户仍可正常使用。
4. **乐观更新 + 回滚**：条目状态更新（addressed/dismissed）应先乐观更新 UI，后台 IPC 失败时回滚，参考 `reviewStore.handleFinding()` 模式。
5. **Store 版本化刷新**：`reviewStore` 使用 per-project 版本号防止并发刷新覆盖，新增的清单刷新逻辑必须遵循相同模式。
6. **注册入口不变**：`review-handlers.ts` 内的 `registerReviewHandlers()` 遍历 `reviewHandlerMap` 注册所有频道，新增频道只需在 map 中添加条目。
7. **跨阶段章节跳转已有现成桥接**：`ProjectWorkspace` 已有 `handleNavigateToChapter()` + `pendingLocatorRef`，阶段 5 点击 checklist 目标章节时应直接复用，而不是在子组件里自行操作 DOM。

### Prompt 设计要点

攻击清单 prompt 与角色生成 prompt 的**关键区别**：
- 角色生成（7-2）输出的是**人物画像**（名称、视角、攻击焦点、强度）
- 攻击清单（7-5）输出的是**具体攻击场景**（攻击角度、严重程度、防御建议、目标章节）

攻击清单 prompt 应引导 LLM：
1. 设想自己是评标委员会成员 + 竞争对手 + 最终用户 + 行业专家
2. 逐一审视招标需求，找出方案可能的薄弱点
3. 为每个薄弱点给出具体的攻击场景（而非抽象维度）
4. 给出可操作的防御建议（怎么在方案中预防这个攻击）
5. 指出应在哪个章节中进行防御（如果能判断）

### 默认通用攻击清单（Fallback）

```typescript
const DEFAULT_FALLBACK_CHECKLIST: Array<{...}> = [
  { category: '合规性', attackAngle: '*项/必须响应项是否全部明确覆盖？评标时遗漏一条即可能废标', severity: 'critical', defenseSuggestion: '逐条检查*项覆盖矩阵，确保每条有对应方案章节', targetSection: null },
  { category: '技术方案', attackAngle: '技术架构选型是否有充分论证？竞对可能采用更先进的架构方案', severity: 'major', defenseSuggestion: '在架构设计章节增加选型对比分析和决策依据', targetSection: '系统架构设计' },
  { category: '实施计划', attackAngle: '实施工期是否过于乐观？历史项目平均超期比例较高', severity: 'major', defenseSuggestion: '提供详细里程碑计划并引用类似项目交付经验', targetSection: '项目实施计划' },
  { category: '成本', attackAngle: '报价依据是否充分？缺少明细分解的报价容易被质疑', severity: 'major', defenseSuggestion: '提供清晰的成本构成分解和计算依据', targetSection: null },
  { category: '团队', attackAngle: '项目团队配置是否合理？关键岗位资质证明是否充分', severity: 'minor', defenseSuggestion: '列出团队成员资质和类似项目经验', targetSection: null },
  { category: '运维', attackAngle: '运维方案复杂度是否超出客户实际能力？', severity: 'minor', defenseSuggestion: '提供运维培训计划和自动化运维工具说明', targetSection: null },
  { category: '差异化', attackAngle: '方案是否有足够的差异化亮点？避免与竞对方案同质化', severity: 'major', defenseSuggestion: '在方案中突出独特价值主张和竞争优势', targetSection: null },
]
```

### 现有代码模式参考

| 层 | 参考文件 | 关键模式 |
|---|---|---|
| Migration | `src/main/db/migrations/014_create_adversarial_reviews.ts` | CASCADE 外键 + 索引 |
| Repository | `src/main/db/repositories/adversarial-review-repo.ts` | upsert + 批量插入 + 条目状态更新 |
| Repository | `src/main/db/repositories/adversarial-lineup-repo.ts` | findByProjectId + save |
| Service (生成) | `src/main/services/adversarial-lineup-service.ts` | task 轮询 + JSON 解析 + fallback |
| Service (执行) | `src/main/services/adversarial-review-service.ts` | 条目状态更新 + 排序 |
| Agent handler | `src/main/services/agent-orchestrator/agents/adversarial-agent.ts` | 单模式 prompt builder |
| Agent 注册 | `src/main/services/agent-orchestrator/index.ts` | `registerAgent()` 调用 |
| Prompt | `src/main/prompts/adversarial-role.prompt.ts` | context 接口 + 模板函数 |
| IPC handler | `src/main/ipc/review-handlers.ts` | channel map + 注册函数 |
| Preload | `src/preload/index.ts` | `typedInvoke()` + camelCase 方法名 |
| Store | `src/renderer/src/stores/reviewStore.ts` | per-project 状态 + 版本化刷新 + 乐观更新 |
| UI 面板 | `src/renderer/src/modules/review/components/AdversarialReviewPanel.tsx` | 多状态面板 + 过滤 |
| UI 卡片 | `src/renderer/src/modules/review/components/AdversarialFindingCard.tsx` | severity 徽标 + 操作按钮 |
| Hook | `src/renderer/src/modules/review/hooks/useAdversarialReview.ts` | auto-load + action 封装 |
| 侧边栏集成 | `src/renderer/src/modules/project/components/AnnotationPanel.tsx` | 可折叠 section 宿主 |
| 工作区导航 | `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` | 跨阶段章节跳转桥接 + stage 5 右侧宿主判定 |
| 文档元数据 | `src/main/services/document-service.ts` | `proposal.meta.json` / `sectionIndex` 读取 |
| 上下文加载 | `src/main/services/adversarial-lineup-service.ts` | requirements/scoring/mandatory/strategy seeds 聚合模式 |
| 章节滚动 | `src/renderer/src/modules/editor/lib/scrollToHeading.ts` | locator 驱动的稳定滚动 |
| AgentType | `src/shared/ai-types.ts` | 联合类型扩展 |

### Story-Level UX 锚点

- Manifest：`_bmad-output/implementation-artifacts/7-5-pre-review-attack-checklist-ux/prototype.manifest.yaml`
- UX 规格：`_bmad-output/implementation-artifacts/7-5-pre-review-attack-checklist-ux/ux-spec.md`
- `.pen` 主 frame：`LLvoh`（活跃态）、`4mlcJ`（空态）、`KNrIN`（回退警告）
- 右侧侧边栏宽度以 story-level UX 原型为准：320px fixed；活跃态 badge = `3/8`，空态 CTA = 全宽 primary button，回退态顶部为 warning Alert

### 防回归注意事项

- `src/shared/ai-types.ts` 的 `AgentType` 新增 `'attack-checklist'` 必须确保 exhaustive type check 不会在已有代码中报错（如 switch 语句需加 case）
- 新增 3 个 `review:*` IPC 频道必须同时更新：`ipc-types.ts`、`review-handlers.ts`、`preload/index.ts`、`security.test.ts`；`index.d.ts` 继续依赖 `FullPreloadApi`
- `review-handlers.ts` 的 `ReviewChannel` 类型会自动扩展（`Extract<IpcChannel, 'review:${string}'>`），新增频道只需添加到 `reviewHandlerMap` 即可
- `reviewStore` 的 `createProjectState()` 必须初始化所有新增字段，否则 partial state 会导致 undefined 访问
- `useReviewTaskMonitor` hook 需要识别 `attack-checklist` 类型的 task 完成事件并更新对应状态
- 不要修改现有 `adversarial-agent.ts` 或 `adversarial-review-agent.ts` 的行为
- 不要修改 `AdversarialReviewPanel`、`AdversarialFindingCard` 的现有行为；`AdversarialLineupDrawer` 只允许追加辅助入口，不要改变现有确认/启动评审流程
- 攻击清单条目排序使用 severity 权重（critical=0, major=1, minor=2）+ sortOrder，与 findings 排序逻辑一致
- 面板仅在 SOP 阶段 4/5 渲染，不要在其他阶段显示
- `targetSection` 链接只有在 `targetSectionLocator` 已解析时才可点击；无法稳定定位时只渲染文本，避免误跳转
- 阶段 5 右侧若已打开 `AdversarialReviewPanel`，不要并列渲染攻击清单，避免回归 Story 7.3 的评审聚焦模式

### 范围声明

**本故事范围内：**
- `attack_checklists` + `attack_checklist_items` 数据模型与 CRUD
- 攻击清单 LLM 生成（prompt + agent handler + service）
- 攻击清单侧边面板 UI（条目列表 + 展开详情 + 状态追踪 + 进度概览）
- LLM 失败时的通用 fallback 清单
- 条目状态追踪（已防御/已忽略/未处理）
- 侧边栏集成（SOP 阶段 4/5 可见）
- 持久化与恢复（SQLite）

**本故事范围外（明确排除）：**
- 攻击清单条目与 adversarial findings 的关联映射（后续增强）
- 攻击清单驱动的自动章节生成引导（后续增强）
- 攻击清单与评分仪表盘的联动（Story 7-8）
- 攻击清单 Git 同步（Story 9-3）
- 攻击清单的版本历史/对比（后续增强）
- 个性化攻击清单基于历史中标/丢标经验（Beta + 经验图谱）

### Project Structure Notes

**新增文件：**
- `src/shared/attack-checklist-types.ts`
- `src/main/db/migrations/015_create_attack_checklists.ts`（若实现分支已新增 015，则顺延到下一个可用编号）
- `src/main/db/repositories/attack-checklist-repo.ts`
- `src/main/services/attack-checklist-service.ts`
- `src/main/prompts/attack-checklist.prompt.ts`
- `src/main/services/agent-orchestrator/agents/attack-checklist-agent.ts`
- `src/renderer/src/modules/review/components/AttackChecklistPanel.tsx`
- `src/renderer/src/modules/review/components/AttackChecklistItemCard.tsx`
- `src/renderer/src/modules/review/hooks/useAttackChecklist.ts`
- `tests/unit/main/db/repositories/attack-checklist-repo.test.ts`
- `tests/unit/main/services/attack-checklist-service.test.ts`
- `tests/unit/main/services/agent-orchestrator/attack-checklist-agent.test.ts`
- `tests/unit/renderer/stores/reviewStore-attack-checklist.test.ts`
- `tests/unit/renderer/modules/review/components/AttackChecklistPanel.test.tsx`
- `tests/unit/renderer/modules/review/components/AttackChecklistItemCard.test.tsx`
- `tests/e2e/stories/story-7-5-attack-checklist.spec.ts`

**修改文件：**
- `src/main/db/schema.ts` — 新增 `AttackChecklistsTable` + `AttackChecklistItemsTable` + DB 接口
- `src/shared/ai-types.ts` — `AgentType` 新增 `'attack-checklist'`
- `src/shared/ipc-types.ts` — 新增 3 个 `review:*` 频道
- `src/main/ipc/review-handlers.ts` — `reviewHandlerMap` 新增 3 个条目
- `src/main/services/agent-orchestrator/index.ts` — 注册 `attack-checklist` agent
- `src/preload/index.ts` — 暴露 3 个新 API
- `src/renderer/src/stores/reviewStore.ts` — 扩展 `ReviewProjectState` + 新 Actions
- `src/renderer/src/modules/review/hooks/useReviewTaskMonitor.ts` — 识别 attack-checklist task 事件
- `src/renderer/src/modules/project/components/AnnotationPanel.tsx` — 集成 AttackChecklistPanel section
- `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` — 阶段 5 宿主透传 + 跨阶段章节跳转回调
- `tests/unit/preload/security.test.ts` — 新增 3 个 API 白名单
- `tests/unit/main/ipc/review-handlers.test.ts` — 追加 3 个频道测试（或新建独立文件）
- `tests/unit/renderer/project/AnnotationPanel.test.tsx` — checklist section 排序与阶段可见性
- `tests/unit/renderer/project/ProjectWorkspace.test.tsx` — stage 5 review panel precedence + targetSection 跨阶段跳转

### 禁止事项

- **禁止**修改现有 `adversarial-agent.ts`、`adversarial-review-agent.ts` 代码
- **禁止**修改 `AdversarialReviewPanel`、`AdversarialFindingCard` 的现有行为；`AdversarialLineupDrawer` 仅允许追加非强制辅助入口，不要改动既有确认/启动评审路径
- **禁止**将攻击清单条目存入 `adversarial_findings` 表（独立表，独立生命周期）
- **禁止**在 SOP 阶段 1-3 或阶段 6 显示攻击清单面板
- **禁止**将攻击清单生成放在 renderer 侧执行（必须通过 task-queue + agent-orchestrator）
- **禁止**引入额外的 task 轮询机制，必须复用 `reviewStore` 现有的 task 监听模式

### Suggested Verification

1. `pnpm test:unit -- tests/unit/main/db/repositories/attack-checklist-repo.test.ts tests/unit/main/services/attack-checklist-service.test.ts tests/unit/main/services/agent-orchestrator/attack-checklist-agent.test.ts tests/unit/preload/security.test.ts tests/unit/renderer/stores/reviewStore-attack-checklist.test.ts tests/unit/renderer/modules/review/components/AttackChecklistPanel.test.tsx tests/unit/renderer/modules/review/components/AttackChecklistItemCard.test.tsx tests/unit/renderer/project/AnnotationPanel.test.tsx tests/unit/renderer/project/ProjectWorkspace.test.tsx`
2. `pnpm typecheck:node && pnpm typecheck:web`
3. `pnpm test:e2e:prepare && playwright test tests/e2e/stories/story-7-5-attack-checklist.spec.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 7 Story 7.5, FR44]
- [Source: _bmad-output/planning-artifacts/prd.md — FR44 先评后写攻击清单, FR45-FR48 对抗评审, FR49 *项合规, NFR7 对抗评审 <5 分钟]
- [Source: _bmad-output/planning-artifacts/architecture.md — agent-orchestrator 调度, adversarial-agent 注册, task-queue 白名单, review 模块目录结构, sidecar JSON adversarialResults]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — 流程 3 对抗评审交互, SOP 阶段 5 流程, 批注五色编码 adversarial 红 #FF4D4F, 关键动效场景, 交叉火力高亮]
- [Source: _bmad-output/implementation-artifacts/7-2-dynamic-adversarial-role-generation.md — lineup service 轮询模式, JSON 解析, fallback, agent handler 模式]
- [Source: _bmad-output/implementation-artifacts/7-3-adversarial-review-execution.md — review service 执行模式, finding 排序, 条目状态管理, store 版本化刷新, UI 面板多状态]
- [Source: _bmad-output/implementation-artifacts/7-5-pre-review-attack-checklist-ux/prototype.manifest.yaml — story-level UX lookup order, frame anchors]
- [Source: _bmad-output/implementation-artifacts/7-5-pre-review-attack-checklist-ux/ux-spec.md — 320px 侧边栏、badge/progress/fallback alert 视觉约束]
- [Source: _bmad-output/implementation-artifacts/7-5-pre-review-attack-checklist-ux/prototype.pen — `LLvoh`/`4mlcJ`/`KNrIN` 结构与状态细节]
- [Source: _bmad-output/implementation-artifacts/7-5-pre-review-attack-checklist-ux/exports/LLvoh.png, 4mlcJ.png, KNrIN.png — 活跃/空态/回退视觉参考]
- [Source: src/shared/ai-types.ts — AgentType 联合类型]
- [Source: src/shared/adversarial-types.ts — FindingSeverity/FindingStatus 等共享类型]
- [Source: src/main/services/agent-orchestrator/index.ts — agent 注册入口]
- [Source: src/main/services/agent-orchestrator/agents/adversarial-agent.ts — 单模式 handler 结构]
- [Source: src/main/services/agent-orchestrator/orchestrator.ts — registerAgent/createExecutor 模式]
- [Source: src/main/ipc/review-handlers.ts — review IPC 频道注册, 当前 8 个频道]
- [Source: src/main/prompts/adversarial-role.prompt.ts — prompt context 接口 + 模板模式]
- [Source: src/main/services/adversarial-lineup-service.ts — requirements/scoring/mandatory/strategy seeds 聚合模式 + outer/inner task 边界]
- [Source: src/main/services/document-service.ts — `proposal.meta.json` / `sectionIndex` 读取]
- [Source: src/renderer/src/stores/reviewStore.ts — per-project 状态 + task 监听]
- [Source: src/renderer/src/modules/project/components/ProjectWorkspace.tsx — stage 5 宿主判定 + `handleNavigateToChapter()`]
- [Source: src/renderer/src/modules/editor/lib/scrollToHeading.ts — locator 驱动章节滚动]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-04-12: `validate-create-story` 修订
  - 为攻击清单条目补充 `targetSectionLocator`，统一对齐现有 `sectionIndex` / `scrollToHeading()` 章节导航模式
  - 修正 checklist repository 的 upsert 语义，明确禁止对父表使用 raw `INSERT OR REPLACE`
  - 将策略种子来源改为复用 `adversarial-lineup-service.ts` 的 DB 聚合逻辑，而非 `chapter-generation-service.ts` 私有 `readStrategySeed()`
  - 明确 stage 4 / stage 5 右侧宿主关系：阶段 5 仅在 `AdversarialReviewPanel` 未打开时显示 checklist，review panel 打开时保留 Story 7.3 替换关系
  - 将 renderer 侧实现边界修正为“monitor 外层任务进度，而非 store/hook 自建轮询”
  - 补充 story-level UX manifest / PNG / `.pen` frame 锚点，以及 `AnnotationPanel` / `ProjectWorkspace` 的验证与测试落点
