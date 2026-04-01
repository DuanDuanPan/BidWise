# Story 2.7: 策略种子生成与确认

Status: ready-for-dev

## Story

As a 售前工程师,
I want 从客户沟通素材中提取隐性需求生成策略种子,
So that 方案能捕获招标文件之外的"灵魂"——客户真正在意的 20%。

## Acceptance Criteria

1. **Given** 我在需求分析阶段，**When** 上传客户沟通素材（会议纪要/邮件/文本记录，支持文本粘贴 + .txt 文件上传），**Then** 系统通过 LLM 分析并生成策略种子列表（FR14），结果持久化到 SQLite `strategy_seeds` 表，并同步写入 `{rootPath}/seed.json` 快照。

2. **Given** 策略种子已生成，**When** 查看种子卡片，**Then** 每个种子展示：种子标题 + 推理依据 + 策略建议（UX-DR17），状态为"待确认"，卡片遵循 AI Output Family 视觉语言。

3. **Given** 用户查看种子列表，**When** 确认、调整或删除种子，**Then** 确认 → 状态变为"已确认"；编辑内容后保存 → 状态变为"已调整"；删除 → 从 DB 和快照中移除。确认后的种子驱动后续方案生成侧重（FR15）。

4. **Given** 无客户沟通素材，**When** 用户不上传素材并直接离开策略种子区域/继续后续流程，**Then** 系统在策略种子区域展示建议获取沟通素材的空态提示；Alpha 不新增独立"跳过"按钮，但也不阻塞后续阶段（SOP 可正常推进到阶段 3）。

5. **Given** 策略种子确认后，**When** 存储，**Then** 保存为项目级 `seed.json`（位于 `{rootPath}/seed.json`，符合架构项目文件结构），后续方案生成（Story 3.4）和对抗评审（Epic 4）可引用。

## Tasks / Subtasks

### Task 1: 数据层 — strategy_seeds 表与仓库 (AC: #1, #5)

- [ ] 1.1 在 `src/main/db/schema.ts` 中新增 `StrategySeedTable` 接口
  - 字段：id (TEXT PK), projectId (TEXT FK→projects), title (TEXT), reasoning (TEXT 推理依据), suggestion (TEXT 策略建议), sourceExcerpt (TEXT nullable 引用的沟通素材片段), confidence (REAL 0-1), status (TEXT: pending/confirmed/adjusted), createdAt (TEXT ISO-8601), updatedAt (TEXT ISO-8601)
- [ ] 1.2 创建迁移文件 `src/main/db/migrations/006_create_strategy_seeds.ts`
  - 建表 `strategy_seeds`，projectId 索引，(projectId, title) 唯一约束防重复
  - ON DELETE CASCADE 关联 projects 表
- [ ] 1.3 创建 `src/main/db/repositories/strategy-seed-repo.ts`
  - `replaceByProject(projectId, seeds[])` — 事务内清旧 + 批量插入（参考 `MandatoryItemRepository.replaceByProject()` 模式）
  - `findByProject(projectId)` — 按 confidence DESC 排序查询
  - `update(id, patch)` — 更新 title/reasoning/suggestion/status，自动设 updatedAt
  - `delete(id)` — 单条删除
  - `deleteByProject(projectId)` — 按项目清除
  - `findProjectId(id)` — 供 delete/update 后回写快照时反查项目
  - `titleExists(projectId, title)` — 手动添加/编辑时用于重复标题防护
- [ ] 1.4 在 `src/main/db/migrator.ts` 中显式注册 `006_create_strategy_seeds`

### Task 2: 共享类型 — StrategySeed 类型定义 (AC: #1, #2, #3, #5)

- [ ] 2.1 在 `src/shared/analysis-types.ts` 中新增类型：
  - `StrategySeedStatus` = `'pending' | 'confirmed' | 'adjusted'`
  - `StrategySeed` — id, title, reasoning, suggestion, sourceExcerpt (`string | null`), confidence, status, createdAt, updatedAt
  - `StrategySeedSummary` — total, confirmed, adjusted, pending (computed: total - confirmed - adjusted)
  - `StrategySeedSnapshot` — projectId, sourceMaterial (原始沟通素材文本), seeds, generatedAt, updatedAt
  - `GenerateSeedsInput` — projectId, sourceMaterial (string 沟通素材文本)
  - `GenerateSeedsResult` — taskId (异步任务 ID)
  - `GetSeedsInput` — projectId
  - `GetSeedSummaryInput` — projectId
  - `UpdateSeedInput` — id, patch: `Partial<Pick<StrategySeed, 'title' | 'reasoning' | 'suggestion' | 'status'>>`
  - `DeleteSeedInput` — id
  - `AddSeedInput` — projectId, title, reasoning, suggestion
- [ ] 2.2 在 `src/shared/constants.ts` 中新增 `ErrorCode.SEED_GENERATION_FAILED`
- [ ] 2.3 在 `src/shared/ipc-types.ts` 中：
  - 在 `IPC_CHANNELS` 常量对象中新增：
    - `ANALYSIS_GENERATE_SEEDS: 'analysis:generate-seeds'`
    - `ANALYSIS_GET_SEEDS: 'analysis:get-seeds'`
    - `ANALYSIS_GET_SEED_SUMMARY: 'analysis:get-seed-summary'`
    - `ANALYSIS_UPDATE_SEED: 'analysis:update-seed'`
    - `ANALYSIS_DELETE_SEED: 'analysis:delete-seed'`
    - `ANALYSIS_ADD_SEED: 'analysis:add-seed'`
  - 在 `IpcChannelMap` 中新增频道类型映射：
    - `'analysis:generate-seeds'` → GenerateSeedsInput → GenerateSeedsResult
    - `'analysis:get-seeds'` → GetSeedsInput → `StrategySeed[] | null`
    - `'analysis:get-seed-summary'` → GetSeedSummaryInput → `StrategySeedSummary | null`
    - `'analysis:update-seed'` → UpdateSeedInput → StrategySeed
    - `'analysis:delete-seed'` → DeleteSeedInput → void
    - `'analysis:add-seed'` → AddSeedInput → StrategySeed
- [ ] 2.4 在 `src/shared/ai-types.ts` 中将 `AgentType` 扩展为 `'parse' | 'generate' | 'extract' | 'seed'`

### Task 3: AI Prompt — generate-seed.prompt.ts (AC: #1)

- [ ] 3.1 创建 `src/main/prompts/generate-seed.prompt.ts`
  - 导出类型化函数 `(context: GenerateSeedPromptContext) => string`
  - Context 类型：`{ communicationMaterial: string; requirements: RequirementItem[]; scoringModel: ScoringModel | null; mandatoryItems: MandatoryItem[] | null }`
  - Prompt 策略（洞察优先）：
    - 角色：资深售前工程师，擅长从客户沟通中捕捉隐性需求
    - 分析维度：客户痛点/焦虑、决策者偏好、竞对差异化机会、未明说的技术/业务约束、项目成功标准隐性定义、评分高权重项的深层关注
    - 交叉引用已有需求和评分模型，避免重复显性需求
    - 输出 JSON 数组：每项含 title（10-30 字）、reasoning（推理依据 50-200 字）、suggestion（策略建议 50-200 字）、sourceExcerpt（引用原文片段）、confidence（0-1）
    - 生成 3-10 个策略种子
    - 明确指令：聚焦"灵魂"级隐性需求，不要重复招标文件中已明确的内容
    - 当 requirements / scoringModel / mandatoryItems 缺失时优雅降级，仍可仅基于沟通素材生成
  - 参考已有 `extract-requirements.prompt.ts` 的 JSON 约束风格

### Task 4: Agent — seed-agent.ts (AC: #1)

- [ ] 4.1 创建 `src/main/services/agent-orchestrator/agents/seed-agent.ts`
  - 导出 `seedAgentHandler: AgentHandler`
  - 接收 context: `{ communicationMaterial, requirements, scoringModel, mandatoryItems }`
  - 调用 `generateSeedPrompt(context)` 构建 prompt
  - 返回 `AiRequestParams`：system message（资深售前架构师角色）+ user message（prompt 内容）+ maxTokens: 8192 + temperature: 0.5（需要创造性洞察，略高于 extract 的 0.3）
- [ ] 4.2 在 agent-orchestrator 初始化时注册 seed-agent handler：`orchestrator.registerAgent('seed', seedAgentHandler)`
  - 注册位置：参考 `extract-agent` 的现有接线方式，在 `src/main/services/agent-orchestrator/index.ts` 的 agent 注册入口中新增

### Task 5: 后端服务 — StrategySeedGenerator (AC: #1, #3, #5)

- [ ] 5.1 创建 `src/main/services/document-parser/strategy-seed-generator.ts`
  - 类 `StrategySeedGenerator`（单例模式，参考 ScoringExtractor / MandatoryItemDetector）
  - `generate(input: GenerateSeedsInput)` 方法：
    1. 验证 sourceMaterial 非空
    2. 尽力加载已有 requirements（通过 RequirementRepository；缺失时降级为 `[]`）
    3. 尽力加载已有 scoringModel（通过 ScoringModelRepository；缺失时降级为 `null`）
    4. 尽力加载已有 mandatoryItems（通过 MandatoryItemRepository；缺失时降级为 `[]` / `null`）
    5. 以 `taskQueue.enqueue({ category: 'import', input: { projectId, rootPath } })` 创建外层任务，保持与 ScoringExtractor / MandatoryItemDetector 一致的 fire-and-forget 模式；**不要**把原始沟通素材文本写入 task queue 的持久化 input
    6. `taskQueue.execute(taskId, executor)` 内部：
       - 构建 prompt 上下文
       - 调用 `agentOrchestrator.execute({ agentType: 'seed', context: { communicationMaterial, requirements, scoringModel, mandatoryItems }, options: { timeoutMs: 180000 } })`（策略生成比提取更耗时，超时 3 分钟）
       - 轮询任务状态（复用 POLL_INTERVAL_MS=1000, TIMEOUT_MS=300000）
       - 解析 LLM 返回的 JSON；复用/抽取现有 helper 时必须同时支持 code fence、裸 JSON array、以及包裹在对象键（如 `items` / `seeds`）中的数组结果
       - 验证每个 seed 的必填字段：title, reasoning, suggestion
       - 清除旧数据 + 批量写入 DB（事务包裹）
       - 写入 `{rootPath}/seed.json` 快照（含 sourceMaterial 原文）；即使 0 个种子也要写空快照
    7. 返回 `{ taskId }`
  - `getSeeds(projectId)` — 从 DB 读取；`null` = 从未生成；`[]` = 已生成但 0 个种子
  - `getSummary(projectId)` — 对"未执行"返回 `null`；对"已执行但 0 个"返回 `{ total: 0, ... }`；统计可直接基于 `getSeeds()` / `findByProject()` 计算，不要求 repository 额外维护 summary query
  - `updateSeed(id, patch)` — 更新内容或状态：
    - 若修改了 title/reasoning/suggestion 且当前状态为 `pending`/`confirmed`，自动变为 `adjusted`
    - 若仅修改 status 为 `confirmed`，保持 `confirmed`
    - 若 title 与同项目已有种子重复，抛出 `BidWiseError(ErrorCode.DUPLICATE, ...)`，避免把 DB 唯一约束错误直接暴露给 UI
    - 更新后同步回写 `seed.json`
  - `deleteSeed(id)` — 删除后同步回写 `seed.json`
  - `addSeed(input: AddSeedInput)` — 手动添加种子（`status='confirmed'`, `confidence=1.0`）；插入前做重复 title 防护，并同步回写 `seed.json`
  - 私有方法 `syncSnapshot(projectId)` — 从 DB 读取最新种子列表 + 原有 sourceMaterial → 重写 `seed.json`
- [ ] 5.2 在 `src/main/services/document-parser/index.ts` 导出单例：`export const strategySeedGenerator = new StrategySeedGenerator()`

### Task 6: IPC Handler 注册 (AC: #1, #3)

- [ ] 6.1 在 `src/main/ipc/analysis-handlers.ts` 中注册 6 个新频道：
  - `analysis:generate-seeds` → strategySeedGenerator.generate()
  - `analysis:get-seeds` → strategySeedGenerator.getSeeds()
  - `analysis:get-seed-summary` → strategySeedGenerator.getSummary()
  - `analysis:update-seed` → `strategySeedGenerator.updateSeed(input.id, input.patch)`
  - `analysis:delete-seed` → `strategySeedGenerator.deleteSeed(input.id)`
  - `analysis:add-seed` → strategySeedGenerator.addSeed()
  - 遵循薄分发模式：参数解析 → 调用服务 → 包装 `{ success, data }` / `{ success: false, error }`
- [ ] 6.2 在 `src/preload/index.ts` 中新增对应的 preload API 方法（参考已有的 analysis 频道暴露模式）

### Task 7: Store 扩展 — analysisStore 策略种子状态 (AC: #1, #2, #3, #4)

- [ ] 7.1 在 `src/renderer/src/stores/analysisStore.ts` 的 per-project state 中新增字段：
  - `seeds: StrategySeed[] | null`（`null` = 从未生成；`[]` = 已生成但 0 个种子）
  - `seedSummary: StrategySeedSummary | null`
  - `seedGenerationTaskId: string | null`
  - `seedGenerationProgress: number`
  - `seedGenerationMessage: string`
  - `seedGenerationLoading: boolean`
  - `seedGenerationError: string | null`
- [ ] 7.2 新增 Actions：
  - `generateSeeds(projectId, sourceMaterial)` — 调用 IPC，设置 taskId 和 loading 状态
  - `fetchSeeds(projectId)` — 加载已生成的种子列表
  - `fetchSeedSummary(projectId)` — 加载摘要统计
  - `updateSeed(id, patch)` — 更新内容/状态并刷新列表
  - `deleteSeed(id)` — 删除种子并刷新列表
  - `addSeed(projectId, title, reasoning, suggestion)` — 手动添加
  - `updateSeedGenerationProgress(projectId, progress, message?)` — 进度回调
  - `setSeedGenerationCompleted(projectId)` — 生成完成时获取 seeds + summary
  - 保持与现有 store 模式一致：组件内直接调用 store actions，不额外引入必须的新业务 store
- [ ] 7.3 扩展 `setError(projectId, error, taskKind)` 的 `taskKind` 联合类型与分支逻辑，新增 `'seed'`，确保 seed 失败只落到 `seedGenerationError`，不污染 import / extraction / mandatory 状态
- [ ] 7.4 在 `EMPTY_ANALYSIS_PROJECT_STATE` 中初始化新字段默认值
- [ ] 7.5 扩展 `findAnalysisProjectIdByTaskId()`，把 `seedGenerationTaskId` 纳入映射，避免 `useAnalysisTaskMonitor()` 丢失第四类任务

### Task 8: UI 组件 — StrategySeedCard + StrategySeedList + MaterialInputModal (AC: #2, #3, #4)

- [ ] 8.1 创建 `src/renderer/src/modules/analysis/components/StrategySeedCard.tsx`
  - 卡片布局（Ant Design Card），遵循 AI Output Family 视觉语言：
    - 标题区：种子标题（加粗）+ 置信度标签（Badge）+ 状态标签（Tag：pending=蓝色 `#1677FF`、confirmed=绿色 `#52C41A`、adjusted=橙色 `#FAAD14`）
    - 推理依据区：带引号样式展示推理依据文本，来源标注标签
    - 策略建议区：策略建议文本，带 AI 来源图标
    - 引用区：`sourceExcerpt` 存在时才渲染折叠区（Collapse），展示引用的沟通素材原文
    - 操作区：确认按钮（CheckOutlined）、编辑按钮（EditOutlined）、删除按钮（DeleteOutlined，Popconfirm 确认）
  - 编辑模式：点击编辑后，title/reasoning/suggestion 变为可编辑（Input/TextArea），保存后状态自动变为 `adjusted`
  - 已确认卡片显示绿色左边框（`border-left: 3px solid #52C41A`），待确认显示蓝色左边框
  - Props：`seed: StrategySeed`, `onUpdate(id, patch)`, `onDelete(id)`, `onConfirm(id)`
  - 加入稳定 `data-testid`：seed-card, seed-confirm, seed-edit, seed-delete
- [ ] 8.2 创建 `src/renderer/src/modules/analysis/components/StrategySeedList.tsx`
  - 种子卡片列表（垂直排列，间距 `space-md` = 16px）
  - 顶部统计栏：`共 X 个种子 | 已确认 Y | 已调整 Z | 待确认 W`；容器对齐原型使用 success-tinted 背景/边框（参考 PNG / `.pen` 的 SummaryBar）
  - 顶部操作栏：「重新生成」按钮 + 「手动添加」按钮（可带 `+` icon，但按钮文案对齐原型）
  - 生成中状态：Progress 进度条 + 消息文本
  - 错误状态：Alert 组件 + 重试按钮
  - 空状态需区分两类：
    - 从未生成（`seeds === null`）：显示"尚未生成策略种子"提示 + CTA 按钮"上传沟通素材"，下方附提示文字说明策略种子的价值
    - 已生成但 0 个（`seeds === []`）：显示"未识别出隐性需求，请提供更多沟通素材或手动添加" + 「重新生成」/ 「手动添加」按钮
  - 底部全部确认按钮：当有 pending 种子时显示「全部确认（N 个待确认）」快捷按钮
  - 加入稳定 `data-testid`：seed-list, seed-summary, seed-generate, seed-add-manual, seed-confirm-all
- [ ] 8.3 创建 `src/renderer/src/modules/analysis/components/MaterialInputModal.tsx`
  - Ant Design Modal，标题："上传客户沟通素材"
  - 内容区：
    - TextArea（autoSize, minRows=8, maxRows=20）用于粘贴文本
    - Upload 组件（accept=".txt"，单文件，读取后填充到 TextArea）
    - 提示文字："支持粘贴会议纪要、邮件、沟通记录等文本内容，或上传 .txt 文件"
  - 文件读取：使用 HTML5 FileReader API 在 renderer 端读取 .txt 文件内容（UTF-8）
  - 确认按钮："开始生成"（sourceMaterial 非空时可用）
  - Props：`open`, `onGenerate(sourceMaterial: string)`, `onCancel`
  - `data-testid`：material-modal, material-textarea, material-upload, material-generate

### Task 9: 集成到 AnalysisView + 任务监控 Hook 扩展 (AC: #2, #4)

- [ ] 9.1 在 `AnalysisView.tsx` 的 Tabs 中新增"策略种子"标签页
  - Tab 标签带 Badge 显示待确认数量（pending count），全部处理完显示绿色 ✓
  - Tab 位置：在"*项检测"之后
  - 内容区渲染 `<StrategySeedList />`
  - AnalysisView 延续当前直接消费 `analysisStore` 的模式：mount 时拉取 `fetchSeeds(projectId)` / `fetchSeedSummary(projectId)`，并以本地 UI state 控制 `<MaterialInputModal />`
- [ ] 9.2 在 `src/renderer/src/modules/analysis/hooks/useAnalysis.ts` 中：
  - 扩展 `TaskKind = 'import' | 'extraction' | 'mandatory' | 'seed'`
  - 扩展 `useAnalysisTaskMonitor` 监听 seedGenerationTaskId 的进度事件和终态轮询
  - 终态处理对齐现有 import / extraction / mandatory 模式：成功后刷新 seeds + summary 并弹 success toast；失败时走 `setError(projectId, error, 'seed')`
  - 扩展 `findAnalysisProjectIdByTaskId()` 中 `seedGenerationTaskId` 的查找分支

### Task 10: 单元测试与集成测试 (AC: #1-#5)

- [ ] 10.1 `tests/unit/main/services/document-parser/strategy-seed-generator.test.ts`
  - 测试 JSON 解析逻辑（正常 JSON、JSON fence、格式异常降级）
  - 测试边界：空沟通素材、无 requirements 时降级、无 scoringModel 时降级
  - 验证 `seed.json` 在 generate/update/delete/add 后保持与 DB 一致
  - 验证 0 个种子时仍落空快照
  - 验证 updateSeed 修改内容时自动切换状态为 `adjusted`
- [ ] 10.2 `tests/unit/main/db/repositories/strategy-seed-repo.test.ts`
  - CRUD 操作测试
  - replaceByProject 事务原子性测试
  - 重复 title 防护测试
  - `findProjectId()` / `titleExists()` 辅助查询正确性
- [ ] 10.3 `tests/unit/renderer/analysis/StrategySeedCard.test.tsx`
  - 渲染测试：卡片正确显示标题、推理、建议、状态标签
  - 交互测试：确认 / 编辑 / 删除操作
  - 编辑模式切换和保存
- [ ] 10.4 `tests/unit/renderer/analysis/StrategySeedList.test.tsx`
  - 列表渲染测试
  - 空状态渲染（未生成 / 已生成但 0 个 两种）
  - 生成中进度状态渲染
  - 错误状态渲染
- [ ] 10.5 `tests/unit/main/prompts/generate-seed.prompt.test.ts`
  - 验证 prompt 函数输出包含关键指令（隐性需求、JSON 格式要求等）
  - 验证不同 context 输入生成正确的 prompt
  - 验证无 scoringModel/mandatoryItems 时 prompt 优雅降级
- [ ] 10.6 `tests/unit/main/services/agent-orchestrator/agents/seed-agent.test.ts`
  - 验证 seed-agent handler 正确构建 AiRequestParams
  - 验证 temperature 设置为 0.5
- [ ] 10.7 `tests/unit/main/db/migrations.test.ts`
  - 验证 `006_create_strategy_seeds` 被 migrator 注册，且 `strategy_seeds` 表字段/索引存在
- [ ] 10.8 `tests/unit/main/ipc/analysis-handlers.test.ts`
  - 验证 6 个 seed 频道已注册，并正确分发到 `strategySeedGenerator`
- [ ] 10.9 `tests/unit/renderer/stores/analysisStore.seed.test.ts`
  - 验证 generate/fetch/update/delete/add 种子动作与 seed summary/seed error 状态更新
- [ ] 10.10 `tests/unit/renderer/analysis/useAnalysisTaskMonitor.test.tsx`
  - 验证 `useAnalysisTaskMonitor()` 能处理 seedGenerationTaskId 的 progress / completed / failed 分支
- [ ] 10.11 `tests/e2e/stories/story-2-7-strategy-seed-generation.spec.ts`
  - 以 Story 2.5/2.6 的 seeded analysis 模式预置 requirements、scoringModel、mandatoryItems
  - 覆盖：空态启动 → 输入沟通素材 → 生成种子 → 查看卡片 → 确认/编辑/删除 → 重启应用后状态保持
  - 覆盖：不生成策略种子直接继续后续流程（无独立 Skip 按钮，但空态不阻塞）

## Dev Notes

### 核心设计决策

- **独立 seed-agent vs 扩展 extract-agent：** 选择新建 `seed-agent.ts` 而非在 extract-agent 中加 mode，原因：
  1. 架构明确规划 `seed-agent.ts` 作为独立 agent（Beta 注册，但 Alpha 可提前实现）
  2. 输入上下文形状完全不同：extract-agent 处理招标文件（sections/rawText/totalPages），seed-agent 处理客户沟通素材（communicationMaterial）
  3. 更清晰的关注点分离，符合架构 Agent 编排层设计原则
  4. 需要更高的 temperature（0.5 vs extract 的隐含 0.3），因为策略种子需要创造性洞察

- **seed.json 位置：** `seed.json` 放在项目根目录 `{rootPath}/seed.json`，不放在 `tender/` 子目录；它与当前已落地的 `tender/tender-parsed.json`、`tender/scoring-model.json`、`tender/mandatory-items.json` 分离，因为策略种子来自客户沟通素材而非招标文件。

- **卡片式 UI vs 表格 UI：** 选择卡片布局而非 Table 组件，原因：
  1. 种子数量少（3-10 个），卡片布局更适合内容密集的展示
  2. 每个种子有三段文字（title + reasoning + suggestion），表格无法良好承载
  3. UX 规范明确定义"策略种子卡片"（Component #9）为独立组件
  4. 编辑模式需要 inline 切换，卡片布局更自然

- **沟通素材输入方式：** Alpha 阶段支持文本粘贴 + .txt 文件上传。使用 HTML5 FileReader API 在 renderer 端读取文件，避免额外的 IPC 调用。不支持 .docx（可作为后续增强，mammoth 已在项目中）。

- **空态语义：** 与 Story 2-6 保持一致：
  1. `seeds === null` / `summary === null` → 从未生成策略种子
  2. `seeds === []` + `summary.total === 0` → 已生成但未识别出隐性需求
  3. 引入 `seed.json` 快照区分"未执行"与"已执行 0 结果"

- **“跳过”语义：** AC #4 中的“跳过策略种子步骤”指用户不上传沟通素材、直接离开该 Tab 或推进后续流程；Alpha 不新增独立 Skip 按钮，避免在原型之外凭空扩展交互。

- **sourceMaterial 存储：** 原始沟通素材文本不单独建表，而是存储在 `seed.json` 快照中。重新生成时覆盖旧快照；同时不要把原始全文复制进 task queue 持久化 input，避免在 `tasks` 表中额外保留大段敏感文本。

### 关键复用点（禁止重复造轮子）

| 已有组件 | 复用方式 |
|---------|---------|
| `ScoringExtractor` / `MandatoryItemDetector` 的 fire-and-forget 模式 | 复用 `taskQueue.enqueue()` + `execute()` 异步模式和轮询结构 |
| JSON fence 解析逻辑 | 复用 MandatoryItemDetector 中的 JSON 提取（code fence / 裸 JSON array），若已提取为公共 helper 则直接调用 |
| `analysisStore` 的 per-project state 模式 | 在同一 store 中扩展，不创建新 store |
| `RequirementRepository` / `MandatoryItemRepository` 的 CRUD 模式 | StrategySeedRepo 遵循相同仓库模式 |
| `MandatoryItemsList.tsx` 的空态/进度/错误 UI 模式 | StrategySeedList 遵循相同的三态 UI 模式 |
| `extract-requirements.prompt.ts` 的 JSON 输出约束风格 | 保持一致的 JSON 格式约束 |
| `useAnalysisTaskMonitor` 的任务监听模式 | 扩展监听 seedGenerationTaskId，并同步扩展 `findAnalysisProjectIdByTaskId()` |
| `createIpcHandler` 工具函数 | IPC handler 注册使用相同的包装器 |
| `MandatoryItemDetector.syncSnapshot()` 的快照同步模式 | 复用读 DB → 重写 JSON 的同步模式 |

### 架构约束（必须遵守）

- **所有 AI 调用经 agentOrchestrator**，禁止直接调用 API。策略种子使用新 `agentType: 'seed'`
- **IPC handler 薄分发**，业务逻辑在 StrategySeedGenerator 服务中
- **统一 Response Wrapper**：`{ success: true, data }` / `{ success: false, error: { code, message } }`
- **BidWiseError** 错误类型体系，禁止 throw 裸字符串
- **Kysely CamelCasePlugin** 自动处理 snake_case ↔ camelCase，禁止手动映射
- **异步种子生成必须走 task-queue**，支持进度推送和取消
- **outer task 类别**：沿用 `category: 'import'`，与 ScoringExtractor / MandatoryItemDetector 保持一致
- **ISO-8601 日期格式**
- **路径别名**：`@main/*`, `@shared/*`, `@renderer/*`, `@modules/*`，禁止 `../../`
- **Prompt 文件**：以 `.prompt.ts` 结尾，导出 `(context: T) => string` 类型化函数，集中在 `src/main/prompts/`
- **Store 模式**：State + Actions 同一 store，`loading: boolean`（非 isLoading），async actions 自管 loading/error

### 文件结构与命名

| 新建文件 | 路径 |
|---------|------|
| 迁移文件 | `src/main/db/migrations/006_create_strategy_seeds.ts` |
| 仓库 | `src/main/db/repositories/strategy-seed-repo.ts` |
| 种子生成服务 | `src/main/services/document-parser/strategy-seed-generator.ts` |
| Prompt | `src/main/prompts/generate-seed.prompt.ts` |
| Seed Agent | `src/main/services/agent-orchestrator/agents/seed-agent.ts` |
| UI 卡片组件 | `src/renderer/src/modules/analysis/components/StrategySeedCard.tsx` |
| UI 列表组件 | `src/renderer/src/modules/analysis/components/StrategySeedList.tsx` |
| 素材输入 Modal | `src/renderer/src/modules/analysis/components/MaterialInputModal.tsx` |
| Store 测试 | `tests/unit/renderer/stores/analysisStore.seed.test.ts` |
| E2E 测试 | `tests/e2e/stories/story-2-7-strategy-seed-generation.spec.ts` |

| 修改文件 | 路径 |
|---------|------|
| DB Schema | `src/main/db/schema.ts` |
| DB Migrator | `src/main/db/migrator.ts` |
| 共享类型 | `src/shared/analysis-types.ts` |
| AI 类型 | `src/shared/ai-types.ts` |
| 错误码常量 | `src/shared/constants.ts` |
| IPC 类型 | `src/shared/ipc-types.ts` |
| IPC 处理器 | `src/main/ipc/analysis-handlers.ts` |
| Preload | `src/preload/index.ts` |
| Agent 注册入口 | `src/main/services/agent-orchestrator/index.ts` |
| Store | `src/renderer/src/stores/analysisStore.ts` |
| AnalysisView | `src/renderer/src/modules/analysis/components/AnalysisView.tsx` |
| useAnalysis Hook | `src/renderer/src/modules/analysis/hooks/useAnalysis.ts` |
| document-parser index | `src/main/services/document-parser/index.ts` |

### UX 规范

- 策略种子卡片属于 **AI Output Family**，共享 AI 产出物视觉语言：来源标注 + Streaming 进度 + 可追溯性标记
- 状态 Tag 颜色：pending=蓝色（`#1677FF`）、confirmed=绿色（`#52C41A`）、adjusted=橙色（`#FAAD14`）
- 已确认卡片左边框：`border-left: 3px solid #52C41A`
- 待确认卡片左边框：`border-left: 3px solid #1677FF`
- 已调整卡片左边框：`border-left: 3px solid #FAAD14`
- 卡片间距：`space-md` = 16px
- 推理依据区使用引号样式（blockquote 风格），强调"有据可依"的洞察感
- 情感设计目标："原来客户真正在意这个"——洞察感 + 价值认同
- 空态 CTA 设计应传达策略种子的价值，引导用户上传沟通素材
- 侧边面板显示策略种子确认（UX 规范原文），但本 Story 实现在 AnalysisView 的 Tab 中——编辑器侧边面板集成属于后续 Story（Epic 3/4）

### 迁移文件编号

已确认现有迁移：`001_initial_schema.ts`, `002_add_industry.ts`, `003_create_tasks.ts`, `004_create_requirements_scoring.ts`, `005_create_mandatory_items.ts`。新迁移使用 `006`。

### 数据流总览

```
用户进入 AnalysisView 的 "策略种子" Tab
  → analysisStore.fetchSeeds(projectId) + fetchSeedSummary(projectId)
    → 若返回 null → 渲染空态 CTA
    → 若返回 [] / summary.total=0 → 渲染"未识别出隐性需求"结果态
    → 若返回 seeds → 渲染卡片列表
  → 用户点击"上传沟通素材"
    → 打开 MaterialInputModal
    → 用户粘贴文本或上传 .txt 文件
    → 点击"开始生成"
      → analysisStore.generateSeeds(projectId, sourceMaterial)
        → IPC: analysis:generate-seeds
          → StrategySeedGenerator.generate()
            → 加载 requirements + scoringModel + mandatoryItems
            → taskQueue.enqueue(category='import', input={ projectId, rootPath })
            → taskQueue.execute() 内部：
              → agentOrchestrator.execute({ agentType: 'seed', context: { communicationMaterial, requirements, scoringModel, mandatoryItems } })
              → 轮询 inner task，向 outer task 推进度
              → LLM 返回 JSON → 解析 + 验证
              → StrategySeedRepo.replaceByProject() 批量写入 DB
              → 写入 {rootPath}/seed.json 快照（含 sourceMaterial）
        → useAnalysisTaskMonitor 拉取 seeds + summary
          → StrategySeedList 渲染卡片
          → Tab Badge 更新 pending 数量
  → 用户确认/编辑/删除种子
    → analysisStore.updateSeed / deleteSeed
      → IPC → StrategySeedGenerator → DB + seed.json 同步
```

### 下游消费说明

`seed.json` 快照格式如下，后续 Story 3.4（AI 方案章节生成）和 Epic 4（对抗评审）将直接读取此文件：

```json
{
  "projectId": "proj-1",
  "sourceMaterial": "客户沟通素材原文...",
  "seeds": [
    {
      "id": "seed-uuid",
      "title": "高可用架构是隐性核心需求",
      "reasoning": "客户在第二次沟通中提到'上次系统宕机导致全线停产'...",
      "suggestion": "方案第4章技术架构应重点阐述双活/容灾方案...",
      "sourceExcerpt": "上次系统宕机导致全线停产，被集团通报批评",
      "confidence": 0.92,
      "status": "confirmed"
    }
  ],
  "generatedAt": "2026-04-01T10:00:00.000Z",
  "updatedAt": "2026-04-01T10:30:00.000Z"
}
```

### Project Structure Notes

- 与统一项目结构完全对齐：服务在 `document-parser/`，prompt 在 `prompts/`，agent 在 `agent-orchestrator/agents/`，UI 在 `modules/analysis/components/`
- 遵循已有模式：StrategySeedGenerator 参考 ScoringExtractor / MandatoryItemDetector，StrategySeedRepo 参考 RequirementRepository / MandatoryItemRepository
- seed.json 位置遵循架构定义的项目文件结构（`{rootPath}/seed.json`），与 tender/ 子目录区分
- 无结构冲突或偏差

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2 Story 2.7]
- [Source: _bmad-output/planning-artifacts/prd.md#FR14 导入客户沟通素材生成策略种子]
- [Source: _bmad-output/planning-artifacts/prd.md#FR15 策略种子确认驱动方案生成]
- [Source: _bmad-output/planning-artifacts/prd.md#创新 2 策略种子系统]
- [Source: _bmad-output/planning-artifacts/architecture.md#seed-agent.ts Agent 类型]
- [Source: _bmad-output/planning-artifacts/architecture.md#项目文件结构 seed.json]
- [Source: _bmad-output/planning-artifacts/architecture.md#Agent 编排层设计原则]
- [Source: _bmad-output/planning-artifacts/architecture.md#prompts/generate-seed.prompt.ts]
- [Source: _bmad-output/planning-artifacts/architecture.md#异步任务白名单]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#策略种子卡片 Component #9]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#AI Output Family 视觉语言]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#情感设计 原来客户真正在意这个]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#侧边面板策略种子确认]
- [Source: _bmad-output/implementation-artifacts/2-6-mandatory-item-detection.md#全 Story 模式参考]
- [Source: src/main/services/document-parser/scoring-extractor.ts#fire-and-forget 异步模式]
- [Source: src/main/services/document-parser/mandatory-item-detector.ts#JSON 解析和快照同步]
- [Source: src/main/services/agent-orchestrator/index.ts#agent 注册入口]
- [Source: src/shared/analysis-types.ts#已有类型定义]
- [Source: src/shared/ai-types.ts#AgentType 定义]
- [Source: src/renderer/src/stores/analysisStore.ts#per-project state 模式]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
