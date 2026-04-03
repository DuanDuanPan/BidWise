# Story 2.9: 招标迷雾地图

Status: ready-for-dev

## Story

As a 售前工程师,
I want 需求以"迷雾地图"可视化展示确定性分级,
So that 我能聚焦模糊和风险区域进行定向确认，减少方案盲区。

## Acceptance Criteria

1. **Given** 需求清单已完成结构化抽取（Story 2.5 完成），**When** 用户在 AnalysisView 的"迷雾地图"Tab 中点击"生成迷雾地图"，**Then** 系统通过 LLM 对每条需求进行确定性分级，生成三色分类：绿色（明确 `clear`）、黄色（模糊 `ambiguous`）、红色（风险 `risky`），结果持久化到 SQLite `requirement_certainties` 表，并同步写入 `{rootPath}/tender/fog-map.json` 快照（FR18, UX-DR18）。

2. **Given** 迷雾地图已生成，**When** 用户查看迷雾地图视图，**Then** 顶部显示雾散进度条（`fogClearingPercentage = (clear + confirmed) / total * 100`）和统计摘要（明确 N / 模糊 N / 风险 N / 已确认 N），下方按三色分组展示需求卡片列表。

3. **Given** 用户查看迷雾地图，**When** 点击模糊（黄色）或风险（红色）区域的需求项，**Then** 展开详情面板，显示：模糊/风险原因 + 定向确认建议 + 原始需求描述 + 来源页码，引导用户进行定向确认。

4. **Given** 用户查看展开的模糊/风险需求项，**When** 点击"确认"按钮标记为"已确认"，**Then** 该需求保持原始 certaintyLevel 分组不变，但视觉状态从黄色/红色切换为绿色已确认态（CSS transition 动画 300ms），雾散进度条和组头已确认计数实时更新，确认状态持久化到 DB 并同步回写 `fog-map.json`。

5. **Given** 用户想批量确认，**When** 存在未确认的模糊/风险项，**Then** 底部显示"全部确认（N 项待确认）"快捷按钮，点击后批量确认所有未确认项。

6. **Given** 需求清单尚未生成（Story 2.5 未执行），**When** 用户进入迷雾地图 Tab，**Then** 显示引导空态："请先完成需求结构化抽取"，带跳转到"需求清单"Tab 的 CTA 按钮。

7. **Given** 迷雾地图已生成，**When** 用户想重新分级（例如需求更新后），**Then** 可点击"重新生成"清除所有现有分级（含已确认状态），重新执行 LLM 分级。

## Tasks / Subtasks

### Task 1: 数据层 — requirement_certainties 表与仓库 (AC: #1, #4, #5, #7)

- [ ] 1.1 在 `src/main/db/schema.ts` 中新增 `RequirementCertaintyTable` 接口
  - 字段：id (TEXT PK), projectId (TEXT FK→projects), requirementId (TEXT FK→requirements), certaintyLevel (TEXT: 'clear'|'ambiguous'|'risky'), reason (TEXT 分级原因), suggestion (TEXT 定向确认建议), confirmed (INTEGER 0/1 默认 0), confirmedAt (TEXT nullable ISO-8601), createdAt (TEXT ISO-8601), updatedAt (TEXT ISO-8601)
- [ ] 1.2 创建迁移文件 `src/main/db/migrations/007_create_requirement_certainties.ts`
  - 建表 `requirement_certainties`，索引 `project_id`，唯一约束 `(project_id, requirement_id)` 防重复
  - ON DELETE CASCADE 关联 projects 表
- [ ] 1.3 创建 `src/main/db/repositories/requirement-certainty-repo.ts`
  - `replaceByProject(projectId, items[])` — 事务内清旧 + 批量插入（参考 `MandatoryItemRepository.replaceByProject()` 模式）
  - `findByProject(projectId)` — 查询项目所有分级，按 certaintyLevel 排序（risky > ambiguous > clear）
  - `confirmItem(id)` — 设置 confirmed=1, confirmedAt=now, updatedAt=now
  - `batchConfirm(projectId)` — 批量确认该项目所有未确认项（confirmed=0 的行）
  - `deleteByProject(projectId)` — 按项目清除（重新生成前调用）
  - `findProjectId(id)` — 供 `confirmCertainty()` / 快照回写时反查项目
- [ ] 1.4 在 `src/main/db/migrator.ts` 中显式注册 `007_create_requirement_certainties`

### Task 2: 共享类型 — FogMap 类型定义 (AC: #1, #2, #3, #4, #5)

- [ ] 2.1 在 `src/shared/analysis-types.ts` 中新增类型：
  - `CertaintyLevel` = `'clear' | 'ambiguous' | 'risky'`
  - `RequirementCertainty` — id, requirementId, certaintyLevel, reason, suggestion, confirmed (boolean), confirmedAt (string | null), createdAt, updatedAt
  - `FogMapItem` — RequirementCertainty & `{ requirement: Pick<RequirementItem, 'id' | 'sequenceNumber' | 'description' | 'sourcePages' | 'category' | 'priority'> }` (UI 展示用的联合类型)
  - `FogMapSummary` — total, clear, ambiguous, risky, confirmed, fogClearingPercentage (number 0-100)
  - `FogMapSnapshot` — projectId, items（每项包含 requirementSequenceNumber / requirementDescription / sourcePages / category / priority / certaintyLevel / reason / suggestion / confirmed / confirmedAt）, summary, generatedAt, updatedAt
  - `GenerateFogMapInput` — projectId
  - `GenerateFogMapResult` — taskId (异步任务 ID)
  - `GetFogMapInput` — projectId
  - `GetFogMapSummaryInput` — projectId
  - `ConfirmCertaintyInput` — id (单条确认)
  - `BatchConfirmCertaintyInput` — projectId (批量确认)
- [ ] 2.2 在 `src/shared/constants.ts` 中新增 `ErrorCode.FOG_MAP_GENERATION_FAILED`、`ErrorCode.FOG_MAP_NO_REQUIREMENTS`
- [ ] 2.3 在 `src/shared/ipc-types.ts` 中：
  - 在 `IPC_CHANNELS` 常量对象中新增：
    - `ANALYSIS_GENERATE_FOG_MAP: 'analysis:generate-fog-map'`
    - `ANALYSIS_GET_FOG_MAP: 'analysis:get-fog-map'`
    - `ANALYSIS_GET_FOG_MAP_SUMMARY: 'analysis:get-fog-map-summary'`
    - `ANALYSIS_CONFIRM_CERTAINTY: 'analysis:confirm-certainty'`
    - `ANALYSIS_BATCH_CONFIRM_CERTAINTY: 'analysis:batch-confirm-certainty'`
  - 在 `IpcChannelMap` 中新增频道类型映射：
    - `'analysis:generate-fog-map'` → GenerateFogMapInput → GenerateFogMapResult
    - `'analysis:get-fog-map'` → GetFogMapInput → `FogMapItem[] | null`
    - `'analysis:get-fog-map-summary'` → GetFogMapSummaryInput → `FogMapSummary | null`
    - `'analysis:confirm-certainty'` → ConfirmCertaintyInput → RequirementCertainty
    - `'analysis:batch-confirm-certainty'` → BatchConfirmCertaintyInput → void
- [ ] 2.4 在 `src/shared/ai-types.ts` 中将 `AgentType` 扩展追加 `'fog-map'`

### Task 3: AI Prompt — classify-certainty.prompt.ts (AC: #1)

- [ ] 3.1 创建 `src/main/prompts/classify-certainty.prompt.ts`
  - 导出类型化函数 `(context: ClassifyCertaintyPromptContext) => string`
  - Context 类型：`{ requirements: RequirementItem[]; scoringModel: ScoringModel | null; mandatoryItems: MandatoryItem[] | null; tenderSections: TenderSection[] | null }`
  - Prompt 策略（确定性分析优先）：
    - 角色：资深招标分析师，擅长识别招标文件中的模糊地带和风险区域
    - 分类维度（判断依据）：
      - **绿色（明确 clear）**：需求描述具体、可量化、有明确标准或规范引用、无歧义
      - **黄色（模糊 ambiguous）**：用词笼统（如"良好的""适当的""先进的"）、无量化指标、缺少验收标准、可多种解读
      - **红色（风险 risky）**：自相矛盾、超出常规能力范围、隐含陷阱条款、与其他需求冲突、极高标准但无评分权重
    - 每条需求必须输出：certaintyLevel、reason；其中 ambiguous / risky 必须输出 50-200 字的 `reason` 与 50-200 字的 `suggestion`，clear 允许 `suggestion` 为空字符串或 `"无需补充确认"`
    - 输出 JSON 数组，每项含 requirementId、certaintyLevel、reason、suggestion
    - 交叉引用评分模型（高权重项中的模糊需求应标记为 risky 而非 ambiguous）
    - 交叉引用*项（*项中的模糊需求自动标记为 risky）
    - 当 scoringModel / mandatoryItems / tenderSections 缺失时优雅降级
  - 参考已有 `extract-requirements.prompt.ts` 的 JSON 约束风格

### Task 4: Agent — fog-map-agent.ts (AC: #1)

- [ ] 4.1 创建 `src/main/services/agent-orchestrator/agents/fog-map-agent.ts`
  - 导出 `fogMapAgentHandler: AgentHandler`
  - 接收 context: `{ requirements, scoringModel, mandatoryItems, tenderSections }`
  - 调用 `classifyCertaintyPrompt(context)` 构建 prompt
  - 返回 `AiRequestParams`：system message（资深招标分析师角色）+ user message（prompt 内容）+ maxTokens: 8192 + temperature: 0.3（分类任务需要一致性，低于 seed 的 0.5）
- [ ] 4.2 在 agent-orchestrator 初始化时注册 fog-map-agent handler：`orchestrator.registerAgent('fog-map', fogMapAgentHandler)`
  - 注册位置：在 `src/main/services/agent-orchestrator/index.ts` 的 agent 注册入口中新增

### Task 5: 后端服务 — FogMapClassifier (AC: #1, #4, #5, #7)

- [ ] 5.1 创建 `src/main/services/document-parser/fog-map-classifier.ts`
  - 类 `FogMapClassifier`（单例模式，参考 ScoringExtractor / MandatoryItemDetector / StrategySeedGenerator）
  - `generate(input: GenerateFogMapInput)` 方法：
    1. 通过 `ProjectRepository.findById(projectId)` 加载项目并验证 `rootPath` 存在；后续读取快照/parsed tender 与写入 `fog-map.json` 都依赖该路径
    2. 加载已有 requirements（通过 RequirementRepository）；若无需求，抛出 `BidWiseError(ErrorCode.FOG_MAP_NO_REQUIREMENTS, ...)`
    3. 尽力加载已有 scoringModel（通过 ScoringModelRepository；缺失时降级为 `null`）
    4. 尽力加载已有 mandatoryItems（通过 MandatoryItemRepository；缺失时降级为 `null`）
    5. 直接读取 `{rootPath}/tender/tender-parsed.json` 提取 tender sections；不存在或无法解析时降级为 `null`，不要反向调用 `TenderImportService`
    6. 以 `taskQueue.enqueue({ category: 'import', input: { projectId, rootPath } })` 创建外层任务
    7. `taskQueue.execute(taskId, executor)` 内部：
       - 构建 prompt 上下文
       - 调用 `agentOrchestrator.execute({ agentType: 'fog-map', context, options: { timeoutMs: 180000 } })`
       - 轮询任务状态（复用 POLL_INTERVAL_MS=1000, TIMEOUT_MS=300000）
       - 解析 LLM 返回的 JSON；复用现有 JSON 提取 helper（code fence / 裸 JSON array / 对象键包裹）
       - 验证每条结果的 requirementId 对应存在的需求（过滤掉无效 ID）
       - 为每条需求自动补充未分类的结果：若 LLM 遗漏某些需求，默认标记为 `ambiguous`，并写入 fallback `reason` / `suggestion`，避免出现空字段
       - 清除旧数据 + 批量写入 DB（事务包裹）
       - 写入 `{rootPath}/tender/fog-map.json` 快照
    8. 返回 `{ taskId }`
  - `getFogMap(projectId)` — 从 DB 读取 certainties 并 JOIN requirements 信息组装 `FogMapItem[]`；`null` = 从未生成或已被上游重抽取失效
  - `getSummary(projectId)` — 对"未执行"返回 `null`；已执行则基于 `getFogMap()` / `findByProject()` 计算统计（含 fogClearingPercentage）
  - `confirmCertainty(id)` — 确认单条，保持原 `certaintyLevel` 不变，仅更新 confirmed/confirmedAt，并同步回写快照
  - `batchConfirm(projectId)` — 批量确认所有未确认项，更新后同步回写快照
  - 私有方法 `syncSnapshot(projectId)` — 从 DB 读取最新分级列表 + requirements 信息 → 重写 `tender/fog-map.json`；clear 统计仅计 LLM 原始 clear 项，confirmed 仅计用户确认的 ambiguous/risky 项
- [ ] 5.2 在 `src/main/services/document-parser/index.ts` 导出单例：`export const fogMapClassifier = new FogMapClassifier()`
- [ ] 5.3 在 `src/main/services/document-parser/scoring-extractor.ts` 中补充需求重抽取回归防护
  - 在 requirements/scoringModel 重写前，清除 `requirement_certainties` 数据并删除/重写失效的 `{rootPath}/tender/fog-map.json`
  - 目标：一旦 Story 2.5 重新抽取需求，迷雾地图必须回到“未生成”状态，禁止遗留旧 requirements 对应的过期 fog-map snapshot

### Task 6: IPC Handler 注册 (AC: #1, #4, #5)

- [ ] 6.1 在 `src/main/ipc/analysis-handlers.ts` 中注册 5 个新频道：
  - `analysis:generate-fog-map` → fogMapClassifier.generate()
  - `analysis:get-fog-map` → fogMapClassifier.getFogMap()
  - `analysis:get-fog-map-summary` → fogMapClassifier.getSummary()
  - `analysis:confirm-certainty` → fogMapClassifier.confirmCertainty()
  - `analysis:batch-confirm-certainty` → fogMapClassifier.batchConfirm()
  - 遵循薄分发模式：参数解析 → 调用服务 → 包装 `{ success, data }` / `{ success: false, error }`
- [ ] 6.2 在 `src/preload/index.ts` 中新增对应的 preload API 方法（参考已有的 analysis 频道暴露模式）

### Task 7: Store 扩展 — analysisStore 迷雾地图状态 (AC: #1, #2, #3, #4, #5, #6)

- [ ] 7.1 在 `src/renderer/src/stores/analysisStore.ts` 的 per-project state 中新增字段：
  - `fogMap: FogMapItem[] | null`（`null` = 从未生成）
  - `fogMapSummary: FogMapSummary | null`
  - `fogMapTaskId: string | null`
  - `fogMapProgress: number`
  - `fogMapMessage: string`
  - `fogMapLoading: boolean`
  - `fogMapError: string | null`
- [ ] 7.2 新增 Actions：
  - `generateFogMap(projectId)` — 调用 IPC，设置 taskId 和 loading 状态
  - `fetchFogMap(projectId)` — 加载分级列表（FogMapItem[]）
  - `fetchFogMapSummary(projectId)` — 加载摘要统计
  - `confirmCertainty(id)` — 确认单条，乐观更新本地状态（立即变绿，但仍保留在原 risk/ambiguous 分组），同时调用 IPC 持久化；失败时回滚
  - `batchConfirmCertainty(projectId)` — 批量确认，乐观更新后调用 IPC；失败时回滚
  - `updateFogMapProgress(projectId, progress, message?)` — 进度回调
  - `setFogMapCompleted(projectId)` — 生成完成时获取 fogMap + summary
- [ ] 7.3 扩展 `setError(projectId, error, taskKind)` 的 `taskKind` 联合类型，新增 `'fog-map'`
- [ ] 7.4 在 `EMPTY_ANALYSIS_PROJECT_STATE` 中初始化新字段默认值
- [ ] 7.5 扩展 `findAnalysisProjectIdByTaskId()`，把 `fogMapTaskId` 纳入映射

### Task 8: UI 组件 — FogMapView + FogMapCard + FogMapBadge (AC: #2, #3, #4, #5, #6, #7)

- [ ] 8.1 创建 `src/renderer/src/modules/analysis/components/FogMapView.tsx`
  - 主容器，三段式布局：
    - **雾散进度条**（顶部）：自定义 header（标题 + 百分比）+ Ant Design Progress 组件 + stats row，stats row 显示 `明确 N / 模糊 N / 风险 N / 已确认 N`
      - 颜色映射：0-50% 红色 → 50-80% 橙色 → 80-100% 绿色
    - **三色分组列表**（中部）：三个 Collapse 面板，分别为"风险需求"（红色 header）、"模糊需求"（黄色 header）、"明确需求"（绿色 header，默认折叠）
      - 面板 header 显示该组数量和已确认数量（例如 `模糊需求 (7 | 已确认 2)`）
      - ambiguous / risky 项被确认后保持原 certaintyLevel 分组不变，只把卡片左边框和标签切换为绿色已确认态；`明确需求` 组只展示 LLM 直接判定为 clear 的项
    - **底部操作栏**：有待确认项时显示"全部确认（N 项待确认）"按钮
  - 生成中状态：Progress 进度条 + 消息文本（与 StrategySeedList 一致的进度态 UI）
  - 错误状态：Alert 组件 + 重试按钮
  - 空状态需区分三类：
    - 需求未生成（`requirements === null`）：显示"请先完成需求结构化抽取" + 跳转"需求清单"Tab 的按钮
    - 需求已生成但迷雾地图未生成（`fogMap === null`）：显示"点击生成迷雾地图"CTA + 价值说明
    - 已生成且 0 条需求被分级（理论上不会发生，但防御性处理）
  - 首次生成只使用 Empty State B 中居中的"生成迷雾地图" CTA；已生成后右上角操作栏只显示"重新生成"
  - 首次教育提示：首次渲染时显示 Ant Design Tour/Popover 引导："绿色=明确需求，黄色=模糊需求（建议确认），红色=风险区域"
  - `data-testid`：fog-map-view, fog-map-progress, fog-map-generate, fog-map-regenerate, fog-map-confirm-all, fog-map-empty-no-requirements, fog-map-empty-not-generated
- [ ] 8.2 创建 `src/renderer/src/modules/analysis/components/FogMapCard.tsx`
  - 可展开的需求分级卡片（自定义样式卡片；可使用 Ant Design 基础能力但不能直接套默认 Card/Collapse 皮肤）：
    - 折叠态：需求编号 + 需求描述摘要（截断 80 字）+ 确定性标签（Tag：clear=绿色、ambiguous=黄色/橙色、risky=红色）+ 确认状态
    - 展开态：
      - 完整需求描述
      - 分级原因（reason）— 用 Alert 组件展示，type 根据 certaintyLevel 映射
      - 定向确认建议（suggestion）— 用引号样式（blockquote）展示
      - 来源页码（sourcePages）
      - 需求分类（category）和优先级（priority）
    - 操作按钮：未确认项显示"确认"按钮（CheckOutlined），已确认项显示绿色"已确认 ✓"标签；confirmed 仅改变视觉状态，不改 certaintyLevel
  - 确认时颜色过渡动画：`transition: border-color 300ms ease, background-color 300ms ease`
  - 左边框颜色：clear/confirmed=绿色 `#52C41A`、ambiguous=黄色 `#FAAD14`、risky=红色 `#FF4D4F`
  - Props：`item: FogMapItem`, `onConfirm(id: string)`, `expanded: boolean`, `onToggle(id: string)`
  - `data-testid`：fog-map-card, fog-map-card-confirm, fog-map-card-detail
- [ ] 8.3 创建 `src/renderer/src/modules/analysis/components/FogMapBadge.tsx`
  - Tab 标签 Badge：
    - 迷雾地图未生成 → 不显示 Badge
    - 有待确认项 → 红色 Badge 显示待确认数量（ambiguous + risky 未确认数）
    - 全部明确/已确认 → 绿色 ✓
  - Props：`summary: FogMapSummary | null`
  - `data-testid`：fog-map-badge

### Task 9: 集成到 AnalysisView + 任务监控 Hook 扩展 (AC: #2, #6)

- [ ] 9.1 在 `AnalysisView.tsx` 的 Tabs 中新增"迷雾地图"标签页
  - Tab 标签带 `<FogMapBadge />` 显示状态
  - Tab 位置：在"策略种子"之后（最后一个 Tab）
  - 内容区渲染 `<FogMapView />`
  - mount 时拉取 `fetchFogMap(projectId)` / `fetchFogMapSummary(projectId)`
- [ ] 9.2 在 `src/renderer/src/modules/analysis/hooks/useAnalysis.ts` 中：
  - 扩展 `TaskKind` 联合类型新增 `'fog-map'`
  - 扩展 `useAnalysisTaskMonitor` 监听 fogMapTaskId 的进度事件和终态轮询
  - 终态处理对齐现有模式：成功后刷新 fogMap + summary 并弹 success toast；失败走 `setError(projectId, error, 'fog-map')`
  - 扩展 `findAnalysisProjectIdByTaskId()` 中 `fogMapTaskId` 的查找分支

### Task 10: 单元测试与集成测试 (AC: #1-#7)

- [ ] 10.1 `tests/unit/main/services/document-parser/fog-map-classifier.test.ts`
  - 测试 JSON 解析逻辑（正常 JSON、JSON fence、格式异常降级）
  - 测试无需求时抛出 FOG_MAP_NO_REQUIREMENTS 错误
  - 测试 LLM 遗漏需求时的自动补充逻辑（默认标记 ambiguous，且 fallback `reason` / `suggestion` 被补齐）
  - 验证 fog-map.json 在 generate/confirm/batchConfirm 后保持与 DB 一致
  - 验证重新生成时清除旧数据（含已确认状态）
- [ ] 10.2 `tests/unit/main/db/repositories/requirement-certainty-repo.test.ts`
  - CRUD 操作测试
  - replaceByProject 事务原子性测试
  - confirmItem / batchConfirm 状态更新测试
  - findProjectId 查询正确性
  - (projectId, requirementId) 唯一约束防护测试
- [ ] 10.3 `tests/unit/renderer/analysis/FogMapCard.test.tsx`
  - 渲染测试：卡片正确显示需求描述、确定性标签、分级原因
  - 交互测试：展开/折叠、确认操作
  - 确认后颜色变化验证
- [ ] 10.4 `tests/unit/renderer/analysis/FogMapView.test.tsx`
  - 列表渲染测试（三色分组正确）
  - 空状态渲染（需求未生成 / 迷雾地图未生成 两种）
  - 生成中进度状态渲染
  - 批量确认操作
  - 雾散进度条百分比计算
- [ ] 10.5 `tests/unit/main/prompts/classify-certainty.prompt.test.ts`
  - 验证 prompt 输出包含关键指令（三色分类、JSON 格式、交叉引用）
  - 验证不同 context 输入生成正确的 prompt
  - 验证无 scoringModel/mandatoryItems 时 prompt 优雅降级
- [ ] 10.6 `tests/unit/main/services/agent-orchestrator/agents/fog-map-agent.test.ts`
  - 验证 fog-map-agent handler 正确构建 AiRequestParams
  - 验证 temperature 设置为 0.3
- [ ] 10.7 `tests/unit/main/db/migrations.test.ts`
  - 验证 `007_create_requirement_certainties` 被 migrator 注册，且表字段/索引存在
- [ ] 10.8 `tests/unit/main/ipc/analysis-handlers.test.ts`
  - 验证 5 个 fog-map 频道已注册，并正确分发到 `fogMapClassifier`
- [ ] 10.9 `tests/unit/renderer/stores/analysisStore.fogMap.test.ts`
  - 验证 generate/fetch/confirm/batchConfirm 动作与 fogMap/summary/error 状态更新
  - 验证乐观更新逻辑（confirm 后立即本地变绿，但仍停留在原 risk/ambiguous 分组）
- [ ] 10.10 扩展 `tests/unit/renderer/analysis/useAnalysisTaskMonitor.test.tsx`
  - 验证 `useAnalysisTaskMonitor()` 能处理 fogMapTaskId 的 progress / completed / failed 分支
- [ ] 10.11 `tests/e2e/stories/story-2-9-fog-map.spec.ts`
  - 以 Story 2.5 / 2.6 的 seeded analysis 模式预置 requirements、scoringModel、mandatoryItems
  - 覆盖：需求未生成空态 → 需求已生成但迷雾地图未生成空态 → 生成迷雾地图 → 查看三色分组 → 展开详情 → 确认单条 → 批量确认 → 全绿状态
  - 覆盖：重新生成迷雾地图（清除已确认状态）
  - 覆盖：重启应用后状态保持
- [ ] 10.12 扩展 `tests/unit/main/services/document-parser/scoring-extractor.test.ts`
  - 验证 requirement 重抽取时会清除 `requirement_certainties` 并删除/失效旧 `tender/fog-map.json`

## Dev Notes

### 核心设计决策

- **独立表 vs 扩展 requirements 表：** 选择新建 `requirement_certainties` 表而非在 requirements 表上加列，原因：
  1. 遵循项目既有模式——每个功能创建独立表（mandatory_items、strategy_seeds）
  2. 重新生成时 `replaceByProject()` 清除+插入语义更清晰，不需要 NULL 清洗
  3. 与 requirements 表解耦，不影响 Story 2.5 的既有查询和类型

- **独立 fog-map-agent vs 复用 extract-agent：** 新建 `fog-map-agent.ts`，原因：
  1. 输入上下文不同：分类需要 requirements 列表作为输入，而非原始招标文件
  2. 输出格式不同：按 requirementId 输出分级，而非抽取新条目
  3. temperature 0.3（分类任务需一致性），低于 seed 的 0.5

- **fog-map.json 位置：** 放在 `{rootPath}/tender/fog-map.json`，与 tender-parsed.json、scoring-model.json、mandatory-items.json 同目录，因为迷雾地图是招标需求的分析产物。

- **RequirementCertainty 共享类型不带 projectId：** 与当前 `MandatoryItem` / `StrategySeed` 等 item DTO 一致，只暴露 UI/IPC 真正需要的字段；项目归属通过 repo 内部 `findProjectId()` 反查用于快照同步。

- **FogMapItem 联合类型：** UI 需要同时展示 requirement 原始信息和 certainty 分级信息。`getFogMap()` 服务方法负责 JOIN 组装，避免前端多次查询。

- **乐观更新（Optimistic Update）：** 确认操作立即更新本地 store 状态（卡片变绿，但仍停留在原 risk/ambiguous 分组），同时异步调用 IPC 持久化。若 IPC 失败则回滚本地状态。这保证了"迷雾消散"的即时视觉反馈。

- **fogClearingPercentage 计算：** `(clear_count + confirmed_count) / total * 100`，其中 clear_count 是 LLM 直接判定为明确的需求数，confirmed_count 是用户手动确认的模糊/风险需求数。

- **首次教育提示：** 使用 Ant Design Tour 组件，通过 `localStorage` 标记是否已展示过。只在 fog-map Tab 首次渲染且有数据时触发。

- **空态语义：** 与 Story 2-6/2-7 保持一致：
  1. 需求未生成 → 引导空态，跳转需求清单 Tab
  2. `fogMap === null` / `summary === null` → 需求已生成但迷雾地图从未生成，显示 CTA
  3. `fogMap.length === 0` → 防御性处理（理论上不会发生，LLM 应对所有需求分级）

- **上游重抽取失效策略：** requirement/scoring model 一旦重新抽取，旧迷雾地图必须立即失效；DB 层通过 FK / 显式 delete 清理，文件层同步删除/重写 `tender/fog-map.json`，避免下游读取过期分析结果。

### 关键复用点（禁止重复造轮子）

| 已有组件 | 复用方式 |
|---------|---------|
| `ScoringExtractor` / `MandatoryItemDetector` / `StrategySeedGenerator` 的 fire-and-forget 模式 | 复用 `taskQueue.enqueue()` + `execute()` 异步模式和轮询结构 |
| JSON fence 解析逻辑 | 复用 MandatoryItemDetector 中的 JSON 提取 helper |
| `analysisStore` 的 per-project state 模式 | 在同一 store 中扩展，不创建新 store |
| `MandatoryItemRepository.replaceByProject()` 模式 | RequirementCertaintyRepo 遵循相同仓库模式 |
| `MandatoryItemsList.tsx` / `StrategySeedList.tsx` 的空态/进度/错误 UI 模式 | FogMapView 遵循相同的三态 UI 模式 |
| `extract-requirements.prompt.ts` 的 JSON 输出约束风格 | 保持一致的 JSON 格式约束 |
| `useAnalysisTaskMonitor` 的任务监听模式 | 扩展监听 fogMapTaskId |
| `createIpcHandler` 工具函数 | IPC handler 注册使用相同的包装器 |
| `StrategySeedGenerator.syncSnapshot()` 的快照同步模式 | 复用读 DB → 重写 JSON 的同步模式 |
| `ScoringExtractor.extract()` 的“重抽取前清旧快照”模式 | 同步清除失效 fog-map 派生产物，避免 requirements 重建后残留旧文件 |

### 架构约束（必须遵守）

- **所有 AI 调用经 agentOrchestrator**，禁止直接调用 API。迷雾地图使用 `agentType: 'fog-map'`
- **IPC handler 薄分发**，业务逻辑在 FogMapClassifier 服务中
- **统一 Response Wrapper**：`{ success: true, data }` / `{ success: false, error: { code, message } }`
- **BidWiseError** 错误类型体系，禁止 throw 裸字符串
- **Kysely CamelCasePlugin** 自动处理 snake_case ↔ camelCase，禁止手动映射
- **异步迷雾地图生成必须走 task-queue**，支持进度推送和取消
- **outer task 类别**：沿用 `category: 'import'`，与 ScoringExtractor / MandatoryItemDetector / StrategySeedGenerator 保持一致
- **ISO-8601 日期格式**
- **路径别名**：`@main/*`, `@shared/*`, `@renderer/*`, `@modules/*`，禁止 `../../`
- **Prompt 文件**：以 `.prompt.ts` 结尾，导出 `(context: T) => string` 类型化函数，集中在 `src/main/prompts/`
- **Store 模式**：State + Actions 同一 store，`loading: boolean`（非 isLoading），async actions 自管 loading/error
- **confirmed 不改 certaintyLevel**：确认是用户对 ambiguous/risky 的人工消雾动作，不改变模型原始分类；组头已确认计数与绿色视觉态共同表达“已处理”

### 文件结构与命名

| 新建文件 | 路径 |
|---------|------|
| 迁移文件 | `src/main/db/migrations/007_create_requirement_certainties.ts` |
| 仓库 | `src/main/db/repositories/requirement-certainty-repo.ts` |
| 迷雾地图分类服务 | `src/main/services/document-parser/fog-map-classifier.ts` |
| Prompt | `src/main/prompts/classify-certainty.prompt.ts` |
| Fog Map Agent | `src/main/services/agent-orchestrator/agents/fog-map-agent.ts` |
| UI 迷雾地图视图 | `src/renderer/src/modules/analysis/components/FogMapView.tsx` |
| UI 分级卡片 | `src/renderer/src/modules/analysis/components/FogMapCard.tsx` |
| UI Tab 徽章 | `src/renderer/src/modules/analysis/components/FogMapBadge.tsx` |
| Store 测试 | `tests/unit/renderer/stores/analysisStore.fogMap.test.ts` |
| E2E 测试 | `tests/e2e/stories/story-2-9-fog-map.spec.ts` |

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
| 需求重抽取服务 | `src/main/services/document-parser/scoring-extractor.ts` |
| Store | `src/renderer/src/stores/analysisStore.ts` |
| AnalysisView | `src/renderer/src/modules/analysis/components/AnalysisView.tsx` |
| useAnalysis Hook | `src/renderer/src/modules/analysis/hooks/useAnalysis.ts` |
| document-parser index | `src/main/services/document-parser/index.ts` |

### UX 规范

- 迷雾地图是**自定义组件**（Tailwind 构建），不属于 Ant Design 内置组件
- 三色编码：明确=绿色 `#52C41A`、模糊=黄色/橙色 `#FAAD14`、风险=红色 `#FF4D4F`
- 确认后颜色过渡：CSS transition 300ms ease，"迷雾消散"效果
- 卡片左边框：clear/confirmed=`border-left: 3px solid #52C41A`、ambiguous=`border-left: 3px solid #FAAD14`、risky=`border-left: 3px solid #FF4D4F`
- 首次进入引导：Tour/Popover 说明三色含义，localStorage 控制只展示一次
- 雾散进度条使用渐变色：红(0-50%) → 橙(50-80%) → 绿(80-100%)
- 情感设计目标：从"不确定"到"确信"——聚焦并消除模糊，降低方案盲区焦虑
- 分级原因使用 Alert 组件（type: warning/error），定向建议使用 blockquote 样式
- 原型对齐：confirmed ambiguous/risky 卡片留在原组内，仅边框/标签变绿；clear 组只承载原始 clear 项

### 迁移文件编号

已确认现有迁移：`001_initial_schema.ts`, `002_add_industry.ts`, `003_create_tasks.ts`, `004_create_requirements_scoring.ts`, `005_create_mandatory_items.ts`, `006_create_strategy_seeds.ts`。新迁移使用 `007`。

### 数据流总览

```
用户进入 AnalysisView 的 "迷雾地图" Tab
  → analysisStore.fetchFogMap(projectId) + fetchFogMapSummary(projectId)
    → 若 requirements === null → 渲染引导空态："请先完成需求抽取"
    → 若返回 null (fogMap 未生成) → 渲染 CTA："生成迷雾地图"
    → 若返回 FogMapItem[] → 渲染三色分组列表 + 雾散进度条
  → 用户点击"生成迷雾地图"
    → analysisStore.generateFogMap(projectId)
      → IPC: analysis:generate-fog-map
        → FogMapClassifier.generate()
          → 加载 requirements + scoringModel + mandatoryItems + tenderSections
          → 验证 requirements 非空
          → taskQueue.enqueue(category='import', input={ projectId, rootPath })
          → taskQueue.execute() 内部：
            → agentOrchestrator.execute({ agentType: 'fog-map', context })
            → 轮询 inner task，向 outer task 推进度
            → LLM 返回 JSON → 解析 + 验证 requirementId
            → 自动补充遗漏需求（默认 ambiguous）
            → RequirementCertaintyRepo.replaceByProject() 批量写入 DB
            → 写入 {rootPath}/tender/fog-map.json 快照
      → useAnalysisTaskMonitor 拉取 fogMap + summary
        → FogMapView 渲染三色分组
        → Tab Badge 更新待确认数量
  → 用户确认模糊/风险需求
    → analysisStore.confirmCertainty(id)
      → 乐观更新：本地状态立即变绿，但仍保留在原 risk/ambiguous 分组
      → IPC: analysis:confirm-certainty → DB + fog-map.json 同步
      → 雾散进度条与组头已确认计数实时更新
  → 用户重新抽取 requirements / scoring model
    → ScoringExtractor 清除 requirement_certainties + 删除/失效 fog-map.json
      → 迷雾地图回到“未生成”空态，等待用户重新生成
```

### 下游消费说明

`tender/fog-map.json` 快照格式如下，后续 Story 3.5（来源归因基线验证）和 Epic 7（质量保障）可引用此数据来判断需求确定性：

```json
{
  "projectId": "proj-1",
  "items": [
    {
      "id": "cert-uuid",
      "requirementId": "req-uuid",
      "requirementSequenceNumber": 12,
      "requirementDescription": "系统应支持高可用部署架构...",
      "requirementCategory": "technical",
      "sourcePages": [3, 8],
      "priority": "high",
      "certaintyLevel": "clear",
      "reason": "需求描述具体，明确要求 99.9% 可用性和双活架构",
      "suggestion": "无需补充确认",
      "confirmed": false,
      "confirmedAt": null
    },
    {
      "id": "cert-uuid-2",
      "requirementId": "req-uuid-2",
      "requirementSequenceNumber": 15,
      "requirementDescription": "系统应具备良好的可扩展性...",
      "requirementCategory": "technical",
      "sourcePages": [5, 12],
      "priority": "high",
      "certaintyLevel": "ambiguous",
      "reason": "'良好的可扩展性'用词笼统，未定义具体的扩展指标（如并发用户数、数据量增长）",
      "suggestion": "建议向客户确认：1) 预期的系统规模增长范围 2) 是否有具体的性能指标要求 3) 是否需要支持水平扩展",
      "confirmed": false,
      "confirmedAt": null
    }
  ],
  "summary": {
    "total": 20,
    "clear": 10,
    "ambiguous": 7,
    "risky": 3,
    "confirmed": 0,
    "fogClearingPercentage": 50
  },
  "generatedAt": "2026-04-01T10:00:00.000Z",
  "updatedAt": "2026-04-01T10:00:00.000Z"
}
```

### Project Structure Notes

- 与统一项目结构完全对齐：服务在 `document-parser/`，prompt 在 `prompts/`，agent 在 `agent-orchestrator/agents/`，UI 在 `modules/analysis/components/`
- 遵循已有模式：FogMapClassifier 参考 ScoringExtractor / MandatoryItemDetector / StrategySeedGenerator，RequirementCertaintyRepo 参考 MandatoryItemRepository
- fog-map.json 位于 `{rootPath}/tender/` 子目录，与其他招标分析产物同级
- requirements 重抽取时需要同步清理 fog-map 派生产物，因此 `scoring-extractor.ts` 属于本 Story 的直接修改面
- 无结构冲突或偏差

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2 Story 2.9]
- [Source: _bmad-output/planning-artifacts/prd.md#FR18 迷雾地图需求确定性可视化]
- [Source: _bmad-output/planning-artifacts/architecture.md#modules/analysis/ 迷雾地图]
- [Source: _bmad-output/planning-artifacts/architecture.md#FR9-18 招标分析模块映射]
- [Source: _bmad-output/planning-artifacts/architecture.md#analysisStore.ts 解析结果+评分模型]
- [Source: _bmad-output/planning-artifacts/architecture.md#Agent 编排层设计原则]
- [Source: _bmad-output/planning-artifacts/architecture.md#异步任务白名单]
- [Source: _bmad-output/planning-artifacts/architecture.md#IPC handler 薄分发模式]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR18 迷雾地图组件]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#自定义组件 迷雾地图]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#首次教育策略 迷雾地图引导]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#三色着色方案]
- [Source: _bmad-output/implementation-artifacts/2-7-strategy-seed-generation.md#全 Story 模式参考]
- [Source: src/main/services/document-parser/strategy-seed-generator.ts#fire-and-forget 异步模式]
- [Source: src/main/services/document-parser/mandatory-item-detector.ts#JSON 解析和快照同步]
- [Source: src/main/services/agent-orchestrator/index.ts#agent 注册入口]
- [Source: src/shared/analysis-types.ts#已有类型定义 RequirementItem]
- [Source: src/shared/ai-types.ts#AgentType 定义]
- [Source: src/renderer/src/stores/analysisStore.ts#per-project state 模式]
- [Source: src/renderer/src/modules/analysis/components/AnalysisView.tsx#Tabs 集成]
- [Source: src/renderer/src/modules/analysis/hooks/useAnalysis.ts#useAnalysisTaskMonitor]
- [Source: src/main/db/repositories/mandatory-item-repo.ts#replaceByProject 模式]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
