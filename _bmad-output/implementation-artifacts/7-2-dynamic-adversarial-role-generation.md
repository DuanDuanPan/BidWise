# Story 7.2: LLM 动态对抗角色生成

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 系统根据招标文件动态生成对抗评审角色阵容,
So that 每个标都有针对性的攻击阵容，而非千篇一律的固定维度。

## Acceptance Criteria

1. **AC1 — 异步生成对抗角色阵容**
   Given 当前项目已完成需求抽取与评分标准提取（`requirements` 非空且 `scoringModel` 存在）
   When 用户进入 `compliance-review`（阶段 5：评审打磨）或在项目工作空间内主动触发“生成对抗阵容”
   Then 系统通过 `taskQueue` 异步启动角色生成外层任务，并在 Drawer 加载态中显示实时进度文案；任务完成后持久化 3-6 个角色，每个角色包含名称、视角描述、攻击焦点列表、攻击强度（高/中/低）与角色简述（FR45）

2. **AC2 — 角色阵容查看、编辑与确认**
   Given 对抗角色阵容已生成
   When 用户在角色阵容 Drawer 中查看角色列表
   Then 用户可以查看每个角色的详细信息（视角 + 攻击焦点 + 强度 + 简述）、调整角色强度、编辑角色攻击焦点、删除非保护角色、手动新增自定义角色，并在点击“确认阵容”后将阵容锁定为只读；锁定后的阵容只能通过显式“重新生成”替换（FR46）

3. **AC3 — 合规审查角色硬性保底**
   Given 任何对抗阵容配置
   When 系统归一化或校验角色阵容
   Then 阵容中始终存在且仅存在一个受保护的合规审查角色；该角色不可删除，且若 LLM 输出缺失或标记错误，服务层必须自动补齐默认合规审查角色（FR47）

4. **AC4 — LLM 失败时降级为保底阵容**
   Given 角色生成过程中出现 LLM 调用失败、超时或返回 JSON 不可解析
   When 系统执行降级策略
   Then 系统应持久化默认保底阵容（合规审查官 + 评标专家 + 竞对分析官），并以“生成成功但来源为 fallback”的完成态结束外层任务；渲染层显示 Toast：`AI 生成失败，已加载默认阵容，您可手动调整`
   And 仅当生成前置条件缺失、或 fallback 自身持久化失败时，才进入 Drawer error 态

5. **AC5 — 单项目单阵容持久化与恢复**
   Given 用户已生成、调整或确认角色阵容
   When 阵容数据保存并在后续重新打开项目
   Then SQLite 中每个项目只保留一条当前有效阵容记录；项目重新打开后可恢复上次生成/确认的阵容，重新生成会原位覆盖当前阵容而不是新增历史记录

## Out of Scope

- Story 7.3：真正执行多角色对抗评审、产出对抗批注、进度 Toast 聚合
- Story 7.4：交叉火力冲突检测与决策卡片
- Story 7.5：先评后写攻击清单
- Story 7.8 / 7.9：评分仪表盘与评分影响联动
- 对抗结果写入 `proposal.meta.json`、批注创建或编辑器正文改写
- 新的独立评审中心页；本故事只在现有 `ProjectWorkspace` 上以 Drawer / Modal 方式叠加

## Tasks / Subtasks

### Task 1: 共享类型与保底常量 (AC: #1, #2, #3, #4, #5)

- [ ] 1.1 创建 `src/shared/adversarial-types.ts`
  - `AdversarialIntensity = 'low' | 'medium' | 'high'`
  - `AdversarialGenerationSource = 'llm' | 'fallback'`
  - `GeneratedAdversarialRoleDraft`
    - `name: string`
    - `perspective: string`
    - `attackFocus: string[]`
    - `intensity: AdversarialIntensity`
    - `description: string`
    - `isComplianceRole?: boolean`
  - `AdversarialRole`
    - `id: string`
    - `name: string`
    - `perspective: string`
    - `attackFocus: string[]`
    - `intensity: AdversarialIntensity`
    - `isProtected: boolean`
    - `description: string`
    - `sortOrder: number`
  - `AdversarialLineupStatus = 'generated' | 'confirmed'`
  - `AdversarialLineup`
    - `id: string`
    - `projectId: string`
    - `roles: AdversarialRole[]`
    - `status: AdversarialLineupStatus`
    - `generationSource: AdversarialGenerationSource`
    - `warningMessage: string | null`
    - `generatedAt: string`
    - `confirmedAt: string | null`
  - `GenerateRolesInput = { projectId: string }`
  - `GenerateRolesTaskResult = { taskId: string }`
  - `GetLineupInput = { projectId: string }`
  - `UpdateLineupInput = { lineupId: string; roles: AdversarialRole[] }`
  - `ConfirmLineupInput = { lineupId: string }`
  - `INTENSITY_LABELS: Record<AdversarialIntensity, string>` — `{ low: '低', medium: '中', high: '高' }`
  - `DEFAULT_COMPLIANCE_ROLE: Omit<AdversarialRole, 'id'>`
  - `DEFAULT_FALLBACK_ROLES: Omit<AdversarialRole, 'id'>[]`
- [ ] 1.2 约束补充
  - `GeneratedAdversarialRoleDraft.isComplianceRole` 仅用于 LLM 输出归一化，不能直接信任为最终受保护标记
  - `DEFAULT_COMPLIANCE_ROLE.sortOrder = 0`
  - UUID 生成沿用仓库既有 `uuid` 包（`uuidv4()`），不要在本故事混入 `crypto.randomUUID()`

### Task 2: 数据库迁移与 Repository (AC: #3, #4, #5)

- [ ] 2.1 创建 `src/main/db/migrations/013_create_adversarial_lineups.ts`
  - `adversarial_lineups` 表：
    - `id` TEXT PK
    - `project_id` TEXT NOT NULL UNIQUE
    - `roles` TEXT NOT NULL（JSON 数组，存储 `AdversarialRole[]`）
    - `status` TEXT NOT NULL DEFAULT `'generated'`
    - `generation_source` TEXT NOT NULL DEFAULT `'llm'`
    - `warning_message` TEXT
    - `generated_at` TEXT NOT NULL
    - `confirmed_at` TEXT
    - `created_at` TEXT NOT NULL
    - `updated_at` TEXT NOT NULL
  - 索引：`adversarial_lineups_project_id_idx`（unique）
  - 外键：`project_id` → `projects(id)`
- [ ] 2.2 在 `src/main/db/schema.ts` 新增 `AdversarialLineupsTable` 并注册到 `DB`
- [ ] 2.3 更新 `src/main/db/migrator.ts` 显式注册 migration `013_create_adversarial_lineups`
- [ ] 2.4 创建 `src/main/db/repositories/adversarial-lineup-repo.ts`
  - `findByProjectId(projectId: string): Promise<AdversarialLineup | null>`
  - `save(input: { projectId: string; roles: AdversarialRole[]; status: AdversarialLineupStatus; generationSource: AdversarialGenerationSource; warningMessage: string | null; confirmedAt?: string | null }): Promise<AdversarialLineup>`
    - 语义：若项目已有阵容则原位 update；否则 insert
  - `update(id: string, patch: { roles?: AdversarialRole[]; status?: AdversarialLineupStatus; warningMessage?: string | null; generationSource?: AdversarialGenerationSource; confirmedAt?: string | null }): Promise<AdversarialLineup>`
  - 约束：继续沿用 `getDb()`、`DatabaseError` / `NotFoundError` 模式；`roles` 用 `JSON.stringify` / `JSON.parse`

### Task 3: Prompt 与 LLM 输出归一化 (AC: #1, #3, #4)

- [ ] 3.1 创建 `src/main/prompts/adversarial-role.prompt.ts`
  - 导出 `adversarialRolePrompt(context: AdversarialRolePromptContext): string`
  - `AdversarialRolePromptContext`
    - `requirements: string`
    - `scoringCriteria: string`
    - `strategySeeds?: string`
    - `proposalType?: string`
    - `mandatoryItems?: string`
  - Prompt 要求 LLM 输出严格 JSON 数组，每项仅包含：
    - `name`
    - `perspective`
    - `attackFocus`（字符串数组）
    - `intensity`（`low | medium | high`）
    - `description`
    - `isComplianceRole`（布尔值；仅一个角色可为 `true`）
  - Prompt 明确要求：
    - 生成 3-6 个差异化角色
    - 必须覆盖合规/评标/竞对等核心视角，但不为不适用维度硬凑角色
    - 角色名称、描述与攻击焦点全部使用中文
- [ ] 3.2 解析约束
  - 复用当前仓库对 code fence / 裸 JSON / 包装对象的提取策略
  - `intensity` 非法值回退到 `medium`
  - 只要 `isComplianceRole` 缺失、全为 `false`，或多于一个 `true`，都必须在服务层重新归一化

### Task 4: Agent Handler — 纯 Prompt Builder (AC: #1)

- [ ] 4.1 创建 `src/main/services/agent-orchestrator/agents/adversarial-agent.ts`
  - 实现 `adversarialAgentHandler: AgentHandler`
  - 输入 context 直接使用服务层传入的 prompt-ready 字段：
    - `requirements`
    - `scoringCriteria`
    - `strategySeeds`
    - `proposalType`
    - `mandatoryItems`
  - 职责仅限：
    1. `throwIfAborted(signal)`
    2. `updateProgress(10, '正在整理对抗角色提示词...')`
    3. 调用 `adversarialRolePrompt(context)`
    4. 返回 `AiRequestParams`
  - **禁止**在 agent handler 内直接查询 Repository；这与现有 `seed-agent.ts` / `fog-map-agent.ts` 的职责边界不一致
- [ ] 4.2 在 `src/shared/ai-types.ts` 的 `AgentType` 中新增 `'adversarial'`
- [ ] 4.3 在 `src/main/services/agent-orchestrator/index.ts` 注册 `adversarialAgentHandler`

### Task 5: 外层任务服务 — 生成、fallback、持久化 (AC: #1, #3, #4, #5)

- [ ] 5.1 创建 `src/main/services/adversarial-lineup-service.ts`
  - 使用 `createLogger('adversarial-lineup-service')`
  - 依赖：
    - `ProjectRepository`
    - `RequirementRepository`
    - `ScoringModelRepository`
    - `MandatoryItemRepository`
    - `StrategySeedRepository`
    - `AdversarialLineupRepository`
    - `agentOrchestrator`
    - `taskQueue`
  - 导出方法：
    - `generate(input: GenerateRolesInput): Promise<GenerateRolesTaskResult>`
    - `getLineup(projectId: string): Promise<AdversarialLineup | null>`
    - `updateRoles(input: UpdateLineupInput): Promise<AdversarialLineup>`
    - `confirmLineup(input: ConfirmLineupInput): Promise<AdversarialLineup>`
- [ ] 5.2 `generate()` 采用“外层 task + 内层 agent”模式，参照 `strategy-seed-generator.ts` / `source-attribution-service.ts`
  - 预检查：
    - 项目存在
    - `requirements.length > 0`
    - `scoringModel !== null`
    - 缺失前置条件时抛出 `ValidationError('请先完成需求抽取与评分标准提取后再生成对抗阵容')`
  - 可选上下文：
    - `strategySeeds` 仅取 `confirmed` / `adjusted`；若两者都没有，再回退 `pending` 的前若干条摘要
    - `mandatoryItems` 仅取 `confirmed` 项；没有则允许为空
    - `proposalType` 取 `project.proposalType`
  - 任务流程：
    1. `taskQueue.enqueue({ category: 'ai', input: { projectId } })`
    2. 外层 executor 调用 `agentOrchestrator.execute({ agentType: 'adversarial', context })`
    3. 外层任务轮询 `agentOrchestrator.getAgentStatus(taskId)`，并将进度映射到外层任务（例如 20→80）
    4. AI 成功时解析 `GeneratedAdversarialRoleDraft[]`
    5. 调用归一化逻辑生成最终 `AdversarialRole[]`
    6. `repo.save(...)` 持久化为 `generationSource='llm'`, `warningMessage=null`
    7. 外层任务成功完成
- [ ] 5.3 fallback 语义必须在服务层内闭环完成，不能留给 IPC handler
  - 触发条件：LLM 调用失败 / 超时 / 返回 JSON 不可解析 / 结果为空
  - 行为：
    - 使用 `DEFAULT_FALLBACK_ROLES`
    - `repo.save(...)` 持久化为 `generationSource='fallback'`
    - `warningMessage='AI 生成失败，已加载默认阵容，您可手动调整'`
    - 外层任务返回 success，而不是 failed
  - 仅当 fallback 持久化本身失败时，外层任务才进入 failed
- [ ] 5.4 `updateRoles()` / `confirmLineup()` 约束
  - `isProtected` 角色不可删除
  - 阵容至少保留 1 个角色（保底合规角色）
  - 更新时重排 `sortOrder`
  - `status='confirmed'` 的阵容不可继续编辑；必须先重新生成进入新的 `generated` 状态

### Task 6: IPC / Preload 注册 (AC: #1, #2, #5)

- [ ] 6.1 在 `src/shared/ipc-types.ts` 新增频道：
  - `REVIEW_GENERATE_ROLES: 'review:generate-roles'` → `{ input: GenerateRolesInput; output: GenerateRolesTaskResult }`
  - `REVIEW_GET_LINEUP: 'review:get-lineup'` → `{ input: GetLineupInput; output: AdversarialLineup | null }`
  - `REVIEW_UPDATE_ROLES: 'review:update-roles'` → `{ input: UpdateLineupInput; output: AdversarialLineup }`
  - `REVIEW_CONFIRM_LINEUP: 'review:confirm-lineup'` → `{ input: ConfirmLineupInput; output: AdversarialLineup }`
- [ ] 6.2 创建 `src/main/ipc/review-handlers.ts`
  - 使用 `createIpcHandler()` + handler-map 模式
  - `review:generate-roles` 仅透传 `adversarialLineupService.generate()`
  - **不要**在 IPC 层吞掉错误或临时拼 fallback
- [ ] 6.3 更新 `src/main/ipc/index.ts`
  - 注册 `registerReviewHandlers()`
  - 将 `RegisteredReviewChannels` 纳入 compile-time exhaustive check
- [ ] 6.4 更新 `src/preload/index.ts`
  - 暴露 `window.api.reviewGenerateRoles()`
  - 暴露 `window.api.reviewGetLineup()`
  - 暴露 `window.api.reviewUpdateRoles()`
  - 暴露 `window.api.reviewConfirmLineup()`
- [ ] 6.5 **不修改** `src/preload/index.d.ts`
  - 当前 `window.api` 类型由 `src/shared/ipc-types.ts` 的 `FullPreloadApi` 自动派生
  - 只需保证 `IpcChannelMap` 与 `src/preload/index.ts` 同步即可

### Task 7: Review Store 扩展 — 阵容状态与任务状态 (AC: #1, #2, #4, #5)

- [ ] 7.1 在 `src/renderer/src/stores/reviewStore.ts` 的 `ReviewProjectState` 中新增：
  - `lineup: AdversarialLineup | null`
  - `lineupLoaded: boolean`
  - `lineupLoading: boolean`
  - `lineupError: string | null`
  - `lineupTaskId: string | null`
  - `lineupProgress: number`
  - `lineupMessage: string | null`
- [ ] 7.2 新增 actions：
  - `startLineupGeneration(projectId: string): Promise<void>` — 调用 `window.api.reviewGenerateRoles()`，只保存 `taskId`
  - `loadLineup(projectId: string): Promise<void>` — 调用 `window.api.reviewGetLineup()`
  - `updateRoles(input: UpdateLineupInput): Promise<void>`
  - `confirmLineup(input: ConfirmLineupInput): Promise<void>`
  - `setLineupProgress(projectId: string, progress: number, message?: string): void`
  - `setLineupTaskError(projectId: string, error: string): void`
  - `clearLineupError(projectId: string): void`
- [ ] 7.3 约束
  - 保持 Story 7.1 的 `compliance` 域字段与行为不回归
  - `lineupLoading` 仅表示对抗阵容相关异步任务，不能挤占 7.1 的 `loading`

### Task 8: Renderer 任务监控与 Drawer 编排 Hook (AC: #1, #2, #4, #5)

- [ ] 8.1 创建 `src/renderer/src/modules/review/hooks/useReviewTaskMonitor.ts`
  - 在 App 根部挂载，模式对齐 `useAnalysisTaskMonitor()`
  - 监听 `window.api.onTaskProgress()`
  - 基于 `reviewStore.projects[projectId].lineupTaskId` 识别任务归属
  - 使用 `window.api.taskGetStatus({ taskId })` 做终态轮询与兜底
  - 任务完成时：
    - 调用 `loadLineup(projectId)`
    - 若 `lineup.generationSource === 'fallback'` 且 `warningMessage` 非空，则 `message.warning(warningMessage)`
  - 任务失败 / 取消时：
    - 更新 `lineupError`
    - 允许用户在 Drawer error 态点击“重新生成”
- [ ] 8.2 更新 `src/renderer/src/App.tsx`
  - 在现有 `useAnalysisTaskMonitor()` 旁挂载 `useReviewTaskMonitor()`
- [ ] 8.3 创建 `src/renderer/src/modules/review/hooks/useAdversarialLineup.ts`
  - 负责 Drawer 可见性与阶段内 orchestration，而不是承担底层 task monitoring
  - mount 时 `loadLineup(projectId)`
  - 当 `currentStageKey === 'compliance-review'` 且当前项目没有 `lineup`、没有进行中的 `lineupTaskId` 时：
    - 自动打开 Drawer
    - 调用 `startLineupGeneration(projectId)`
  - 暴露：
    - `drawerOpen`
    - `openDrawer()`
    - `closeDrawer()`
    - `triggerGenerate()`
    - `updateRoles()`
    - `confirmLineup()`

### Task 9: Drawer / Card / Modal UI (AC: #1, #2, #3, #4)

- [ ] 9.1 创建 `src/renderer/src/modules/review/components/AdversarialLineupDrawer.tsx`
  - Ant Design `Drawer`，宽度 480px，从右侧滑出
  - 标题：`对抗角色阵容`
  - 状态：
    - `lineupLoading=true`：全区域 Spin + `lineupMessage ?? '正在生成对抗角色阵容...'`
    - `lineupError`：Alert + `重新生成` 按钮
    - `lineup=null && !lineupLoading`：空态 + `生成对抗阵容` 按钮
    - `lineup.status='generated'`：角色列表 + 底部 `确认阵容` / `重新生成` / `添加角色`
    - `lineup.status='confirmed'`：角色列表只读 + header `已确认` 标记 + 底部仅 `重新生成`
  - **注意**：`generationSource='fallback'` 仍属于 generated 成功态，不走 error 态
- [ ] 9.2 创建 `src/renderer/src/modules/review/components/AdversarialRoleCard.tsx`
  - 红色调卡片：边框 `#FF4D4F`，背景 `#fff2f0`
  - 强度 Badge：高=红、中=橙、低=蓝
  - `isProtected=true` 时：锁图标 + `合规保底` Badge，删除按钮隐藏
  - 仅在 `lineup.status='generated'` 下允许编辑 / 删除
- [ ] 9.3 创建 `src/renderer/src/modules/review/components/AddRoleModal.tsx`
  - 标题：`添加自定义角色`
  - 字段：角色名称、视角描述、攻击焦点、攻击强度
  - 用户新增角色固定 `isProtected=false`

### Task 10: 入口接入 — ProjectWorkspace、命令面板与阶段 CTA (AC: #1, #2)

- [ ] 10.1 更新 `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
  - 集成 `useAdversarialLineup(projectId, currentStageKey)`
  - 渲染 `AdversarialLineupDrawer`
  - 进入 `compliance-review` 阶段时自动恢复/触发阵容生成
- [ ] 10.2 更新 `src/renderer/src/modules/project/components/StageGuidePlaceholder.tsx`
  - 增加可选 props：
    - `ctaLabel?: string`
    - `onPrimaryAction?: () => void`
    - `primaryActionLoading?: boolean`
    - `primaryActionDisabled?: boolean`
  - `ProjectWorkspace` 在 `currentStageKey === 'compliance-review'` 时传入：
    - 无阵容：`ctaLabel='生成对抗阵容'`
    - 已有阵容：`ctaLabel='打开对抗阵容'`
- [ ] 10.3 更新 `src/renderer/src/shared/command-palette/default-commands.tsx`
  - 将 `command-palette:start-adversarial-review` 从“Epic 5 未实现”的错误占位文案修正为“需在项目工作空间内使用”的通用提示
  - 默认命令保持可覆盖占位，不直接读取项目上下文
- [ ] 10.4 在 `ProjectWorkspace` 中注册 route-aware override
  - 模式对齐现有 `export-document` / stage jump 覆盖
  - 工作空间挂载时用真实 action 覆盖 `command-palette:start-adversarial-review`
  - action：打开 Drawer；若无阵容则触发生成

### Task 11: 测试矩阵 (AC: #1, #2, #3, #4, #5)

- [ ] 11.1 更新 `tests/unit/main/db/migrations.test.ts`
  - 迁移链数量扩展到包含 013
  - 断言 `adversarial_lineups` 表、`project_id` 唯一约束 / 索引、`generation_source` 与 `warning_message` 字段存在
- [ ] 11.2 新建 `tests/unit/main/db/repositories/adversarial-lineup-repo.test.ts`
  - 覆盖：save(insert/update)、findByProjectId、update、roles JSON 序列化/反序列化、单项目单记录语义
- [ ] 11.3 新建 `tests/unit/main/prompts/adversarial-role-prompt.test.ts`
  - 覆盖：严格 JSON 输出要求、中文角色内容、`isComplianceRole` 字段约束
- [ ] 11.4 新建 `tests/unit/main/services/agent-orchestrator/agents/adversarial-agent.test.ts`
  - 覆盖：prompt-ready context → `AiRequestParams`
  - 覆盖：`updateProgress()` 被调用
- [ ] 11.5 新建 `tests/unit/main/services/adversarial-lineup-service.test.ts`
  - 覆盖：
    - prerequisites 缺失时报错
    - AI 返回有效 JSON → 归一化 → 持久化
    - 缺失合规角色 → 自动补齐默认合规角色
    - LLM 失败 / JSON 解析失败 → fallback 成功并以 completed 结束
    - fallback 持久化失败 → 任务失败
    - `confirmed` 阵容不可编辑
- [ ] 11.6 新建 `tests/unit/main/ipc/review-handlers.test.ts`
  - 覆盖 4 个频道注册、透传与错误包装
- [ ] 11.7 更新 `tests/unit/preload/security.test.ts`
  - 将新增 4 个 review API 纳入白名单断言
- [ ] 11.8 更新 `tests/unit/renderer/stores/reviewStore.test.ts`
  - 覆盖 lineup state / taskId / progress / error / load / update / confirm 生命周期
- [ ] 11.9 新建 `tests/unit/renderer/modules/review/hooks/useReviewTaskMonitor.test.ts`
  - 覆盖 progress 监听、终态轮询、fallback warning toast、failed/cancelled 分支
- [ ] 11.10 新建 `tests/unit/renderer/modules/review/hooks/useAdversarialLineup.test.ts`
  - 覆盖进入 `compliance-review` 自动触发、已有 lineup 仅恢复不重复生成、Drawer 开关
- [ ] 11.11 新建组件测试
  - `tests/unit/renderer/modules/review/components/AdversarialLineupDrawer.test.tsx`
  - `tests/unit/renderer/modules/review/components/AdversarialRoleCard.test.tsx`
  - `tests/unit/renderer/modules/review/components/AddRoleModal.test.tsx`
  - 重点验证：loading / error / empty / generated / confirmed、confirmed 态无“添加角色”、protected 角色不可删
- [ ] 11.12 更新 `tests/unit/renderer/project/ProjectWorkspace.test.tsx`
  - 覆盖 Stage 5 CTA 点击打开 / 生成 Drawer
  - 覆盖 workspace command override 注册
- [ ] 11.13 更新 `tests/e2e/stories/story-1-9-command-palette.spec.ts`
  - 对抗评审命令从错误 disabled 占位变为 workspace 内真实可触发
- [ ] 11.14 新建 `tests/e2e/stories/story-7-2-adversarial-role-generation.spec.ts`
  - mock task progress + 最终 lineup 结果
  - 覆盖：
    - 进入阶段 5 自动触发角色生成
    - command palette 触发打开 Drawer
    - fallback 阵容 warning toast
    - 合规审查角色不可删除
    - 编辑角色攻击焦点和强度
    - 手动新增自定义角色
    - 确认阵容后进入只读态
    - 重新生成覆盖当前阵容

## Dev Notes

### 架构要点

- **必须采用外层 task + 内层 agent 模式**：当前仓库所有“需要主进程持久化 + AI 内层任务”的能力（如 `strategy-seed-generator.ts`、`source-attribution-service.ts`）都不是让 renderer 直接等待 `agentOrchestrator.execute()` 结果。7.2 必须沿用同一模式，先返回外层 `taskId`，再由 renderer 通过 `task:progress` / `task:get-status` 驱动 UI。
- **Agent handler 只负责构造 prompt**：不要在 `adversarial-agent.ts` 内查询 DB。Repository 读取、前置条件校验、fallback、持久化都应放在 `adversarial-lineup-service.ts`。
- **fallback 是完成态，不是错误态**：AI 失败时仍要给用户一个可编辑的默认阵容，这是业务成功降级；只有前置条件缺失或 fallback 保存失败才算真正失败。
- **每项目仅一条有效阵容**：`adversarial_lineups.project_id` 使用唯一约束，避免 delete + create 带来的多记录与竞态问题。
- **Stage 5 当前真实 key 是 `compliance-review`**：评审打磨阶段的入口接入必须对齐这个 key，而不是写成新的路由或虚构阶段。
- **preload 类型无需手写追加**：`src/preload/index.d.ts` 仅声明 `window.api: FullPreloadApi`；新增 request API 的唯一真实源是 `src/shared/ipc-types.ts`。

### 与 Story 7.1 的关系

Story 7.1 已经落地了 review 领域的第一个垂直 slice：

| 领域能力 | Story 7.1 已有 | Story 7.2 新增 |
|---|---|---|
| Store | `reviewStore` 的 `compliance` 域 | `lineup` 域 + `lineupTaskId/progress/message` |
| Hook | `useComplianceAutoRefresh()` | `useReviewTaskMonitor()` + `useAdversarialLineup()` |
| IPC | `compliance:check` / `compliance:export-gate` | `review:generate-roles` / `review:get-lineup` / `review:update-roles` / `review:confirm-lineup` |
| UI | `ComplianceGateModal` | `AdversarialLineupDrawer` / `AdversarialRoleCard` / `AddRoleModal` |
| Workspace 集成 | `ProjectWorkspace` 已消费 reviewStore | 同一入口继续挂载 Drawer、阶段 CTA 与命令覆盖 |

### 关键实现流

```text
进入 compliance-review
  → useAdversarialLineup(projectId, currentStageKey)
    → loadLineup(projectId)
    → 若 lineup 为空：openDrawer() + startLineupGeneration(projectId)

review:generate-roles
  → adversarialLineupService.generate()
    → taskQueue.enqueue(category='ai')
    → 外层任务调用 agentOrchestrator.execute('adversarial')
    → 轮询 inner task
    → 成功：解析 + 归一化 + repo.save(generationSource='llm')
    → 失败：repo.save(DEFAULT_FALLBACK_ROLES, generationSource='fallback')

App mount
  → useReviewTaskMonitor()
    → 监听 task:progress
    → 任务完成后 loadLineup(projectId)
    → fallback 时 message.warning(...)
```

### 合规角色归一化规则

- 优先使用 LLM 输出的 `isComplianceRole === true`
- 如果没有合法 compliance 标记，则按角色名归一化兜底识别：
  - `合规审查官`
  - `合规审查角色`
  - `合规审查`
- 归一化结束后必须保证：
  - 最终仅一个 `isProtected === true`
  - 它位于 `sortOrder = 0`
  - 若 LLM 输出多个 compliance 角色，只保留第一个，其他角色降为普通角色

### Drawer / 命令面板接入约束

- `default-commands.tsx` 里的 `command-palette:start-adversarial-review` 只能是“工作空间内可用”的占位实现；真实 action 需要像导出命令一样由 `ProjectWorkspace` 覆盖注册。
- `StageGuidePlaceholder` 当前 CTA 没有业务动作，7.2 不能只改文案不接事件；必须把 Stage 5 的 CTA 真正接到 Drawer 打开 / 阵容生成。
- 7.2 只交付“阵容生成与确认”，不要把按钮行为偷跑成 Story 7.3 的“执行对抗评审”。

### Project Structure Notes

**新增文件：**
- `src/shared/adversarial-types.ts`
- `src/main/db/migrations/013_create_adversarial_lineups.ts`
- `src/main/db/repositories/adversarial-lineup-repo.ts`
- `src/main/prompts/adversarial-role.prompt.ts`
- `src/main/services/agent-orchestrator/agents/adversarial-agent.ts`
- `src/main/services/adversarial-lineup-service.ts`
- `src/main/ipc/review-handlers.ts`
- `src/renderer/src/modules/review/components/AdversarialLineupDrawer.tsx`
- `src/renderer/src/modules/review/components/AdversarialRoleCard.tsx`
- `src/renderer/src/modules/review/components/AddRoleModal.tsx`
- `src/renderer/src/modules/review/hooks/useReviewTaskMonitor.ts`
- `src/renderer/src/modules/review/hooks/useAdversarialLineup.ts`
- `tests/unit/main/db/repositories/adversarial-lineup-repo.test.ts`
- `tests/unit/main/prompts/adversarial-role-prompt.test.ts`
- `tests/unit/main/services/agent-orchestrator/agents/adversarial-agent.test.ts`
- `tests/unit/main/services/adversarial-lineup-service.test.ts`
- `tests/unit/main/ipc/review-handlers.test.ts`
- `tests/unit/renderer/modules/review/hooks/useReviewTaskMonitor.test.ts`
- `tests/unit/renderer/modules/review/hooks/useAdversarialLineup.test.ts`
- `tests/unit/renderer/modules/review/components/AdversarialLineupDrawer.test.tsx`
- `tests/unit/renderer/modules/review/components/AdversarialRoleCard.test.tsx`
- `tests/unit/renderer/modules/review/components/AddRoleModal.test.tsx`
- `tests/e2e/stories/story-7-2-adversarial-role-generation.spec.ts`

**修改文件：**
- `src/main/db/schema.ts`
- `src/main/db/migrator.ts`
- `src/shared/ai-types.ts`
- `src/shared/ipc-types.ts`
- `src/main/services/agent-orchestrator/index.ts`
- `src/main/ipc/index.ts`
- `src/preload/index.ts`
- `src/renderer/src/stores/reviewStore.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
- `src/renderer/src/modules/project/components/StageGuidePlaceholder.tsx`
- `src/renderer/src/shared/command-palette/default-commands.tsx`
- `tests/unit/main/db/migrations.test.ts`
- `tests/unit/preload/security.test.ts`
- `tests/unit/renderer/stores/reviewStore.test.ts`
- `tests/unit/renderer/project/ProjectWorkspace.test.tsx`
- `tests/e2e/stories/story-1-9-command-palette.spec.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 7 Story 7.2]
- [Source: _bmad-output/planning-artifacts/prd.md — FR45, FR46, FR47]
- [Source: _bmad-output/planning-artifacts/architecture.md — FR44-52 目录映射 / `agents/adversarial-agent.ts` / `prompts/adversarial-role.prompt.ts` 规划]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — 流程 3：对抗评审 + 交叉火力决策 / Drawer 模态策略]
- [Source: _bmad-output/implementation-artifacts/7-1-mandatory-item-compliance-engine.md — reviewStore / ProjectWorkspace / review 模块既有接入方式]
- [Source: _bmad-output/implementation-artifacts/7-2-dynamic-adversarial-role-generation-ux/ux-spec.md]
- [Source: _bmad-output/implementation-artifacts/7-2-dynamic-adversarial-role-generation-ux/prototype.manifest.yaml]
- [Source: _bmad-output/implementation-artifacts/7-2-dynamic-adversarial-role-generation-ux/prototype.pen]
- [Source: src/main/services/agent-orchestrator/orchestrator.ts — `execute()` 返回 taskId 的异步合同]
- [Source: src/main/services/document-parser/strategy-seed-generator.ts — 外层 task + 内层 agent 模式]
- [Source: src/main/services/source-attribution-service.ts — task polling + progress 驱动模式]
- [Source: src/renderer/src/App.tsx — `useAnalysisTaskMonitor()` 的挂载位置]
- [Source: src/renderer/src/modules/analysis/hooks/useAnalysis.ts — renderer 侧 progress 监听 / 终态轮询模式]
- [Source: src/renderer/src/modules/project/components/ProjectWorkspace.tsx — workspace command override 模式]
- [Source: src/renderer/src/modules/project/components/StageGuidePlaceholder.tsx — Stage CTA 当前无动作]
- [Source: src/renderer/src/modules/project/types.ts — `compliance-review` 阶段定义]

## Change Log

- 2026-04-11: `validate-create-story` 复核修订
  - 将 `review:generate-roles` 从“同步返回 lineup”收紧为符合现有架构的“外层 task 返回 taskId”
  - 把 DB / Repository 语义收敛为“单项目单阵容记录”，避免 delete + create 多记录竞态
  - 将 fallback 从 IPC 层临时兜底改为服务层内闭环完成，并补回 `generationSource` / `warningMessage` 契约
  - 修正 agent handler 职责边界：只做 prompt 构造，不直接读 Repository
  - 修正命令面板接入路径：默认命令保留占位，由 `ProjectWorkspace` route-aware override 提供真实 action
  - 补回 Stage 5 CTA 的真实动作接入与 `App.tsx` 级 `useReviewTaskMonitor()` 挂载要求
  - 去除对 `src/preload/index.d.ts` 的错误手工更新要求，改为遵循 `FullPreloadApi` 自动派生合同
  - 明确 confirmed 态为只读，不再允许“已确认后继续添加角色”

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
