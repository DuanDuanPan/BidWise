# Story 7.3: 对抗评审执行与结果展示

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 一键启动多维对抗评审，结果统一排序展示,
So that 我能看到方案的所有薄弱点，逐条处理攻击意见。

## Acceptance Criteria

### AC1: 一键启动多角色并行对抗评审

**Given** 对抗角色已确认（lineup.status='confirmed'）
**When** 用户点击"启动对抗评审"
**Then**

- 系统通过 task-queue 创建一个外部主任务，内部对每个角色并行调用 AI Agent 攻击方案
- Toast 逐个通知各角色进度（"技术专家攻击中…"、"合规审查官攻击中…"）
- 用户等待期间可继续编辑方案（非阻塞异步）
- 全方案对抗评审 < 5 分钟完成（NFR7）
- 返回外部 taskId，UI 通过 `task:progress` / `task:get-status` 驱动进度

### AC2: 结果统一排序展示（批量渲染，非流式）

**Given** 全部角色 Agent 返回结果
**When** 统一展示
**Then**

- 等待**所有**角色完成后，一次性处理全部结果（严禁流式逐条渲染）
- 攻击发现（findings）按优先级排序：critical > major > minor
- 同优先级内按角色 sortOrder 排序
- 矛盾检测完成：标记互相矛盾的 finding 对（设置 contradictionGroupId，为 Story 7-4 交叉火力 UI 准备数据）
- 结果持久化到 SQLite + 写入 reviewStore
- 右侧评审面板一次性展示全部红色对抗批注
- 若成功角色返回 0 条 findings，仍视为有效完成态；UI 需展示零结果空态而不是失败态

### AC3: 对抗批注三种用户操作

**Given** 红色对抗批注展示在评审面板
**When** 用户处理单条批注
**Then**

- **接受并修改**：status→'accepted'，卡片变绿色边框，用户跳转到对应章节手动修改
- **反驳**：status→'rejected'，弹出 TextArea 输入反驳理由（rebuttalReason，必填且去首尾空白后不能为空），记录理由但不修改方案，卡片变灰
- **请求指导**：status→'needs-decision'，标记为待决策，卡片变紫色边框闪烁提醒

### AC4: 部分失败容错

**Given** 某个角色 Agent 调用失败（超时/解析错误/网络异常）
**When** 其他角色正常返回
**Then**

- 已成功角色的 findings 正常处理和展示
- 失败角色在面板顶部显示警告卡片："XX角色评审失败，可单独重试"
- 单条重试按钮仅重新执行该角色，成功后结果追加合并到现有 findings
- 会话状态：全成功='completed'，部分成功='partial'，全失败='failed'
- 仅当所有角色均失败时，整体任务标记为 failed

### AC5: 评审结果持久化与恢复

**Given** 评审执行完成（completed 或 partial）
**When** 用户关闭并重新打开项目
**Then**

- 恢复最近一次评审结果（findings + 用户操作状态 + 反驳理由）
- 每个项目仅保留一次有效评审记录（project_id UNIQUE，upsert 语义）
- 重新执行评审会清除旧 findings 并覆盖新结果

## Tasks / Subtasks

- [ ] Task 1: 扩展类型定义 (AC: #1, #2, #3, #4, #5)
  - [ ] 1.1 在 `src/shared/adversarial-types.ts` 中追加评审执行类型：
    - `AdversarialFinding`：单条攻击发现（id, sessionId, roleId, roleName, severity, sectionRef, sectionLocator, content, suggestion, reasoning, status, rebuttalReason, contradictionGroupId, sortOrder, createdAt, updatedAt）
      - `sectionRef` 继续作为 UI 展示文案
      - `sectionLocator?: ChapterHeadingLocator | null` 复用 `src/shared/chapter-types.ts`，供点击章节引用时稳定跳转（避免仅靠标题字符串匹配）
    - `FindingSeverity`: `'critical' | 'major' | 'minor'`
    - `FindingStatus`: `'pending' | 'accepted' | 'rejected' | 'needs-decision'`
    - `AdversarialReviewSession`：执行会话（id, projectId, lineupId, status, findings[], roleResults[], startedAt, completedAt）
    - `ReviewSessionStatus`: `'running' | 'completed' | 'partial' | 'failed'`
    - `RoleReviewResult`：单角色结果（roleId, roleName, status: 'pending'|'running'|'success'|'failed', findingCount, error?, latencyMs）
      - 运行期 `roleResults[]` 需按 confirmed lineup 初始化，供 running 面板显示 waiting / running / completed / failed
    - `HandleFindingAction`: `'accepted' | 'rejected' | 'needs-decision'`
  - [ ] 1.2 在 `src/shared/ipc-types.ts` 中新增 4 个 IPC 通道：
    - `review:start-execution` → `{ projectId }` → `{ taskId }`
    - `review:get-review` → `{ projectId }` → `AdversarialReviewSession | null`
    - `review:handle-finding` → `{ findingId, action, rebuttalReason? }` → `AdversarialFinding`
      - 当 `action === 'rejected'` 时 `rebuttalReason` 必填；其他 action 会清空既有 `rebuttalReason`
    - `review:retry-role` → `{ projectId, roleId }` → `{ taskId }`
  - [ ] 1.3 在 `src/shared/ai-types.ts` 的 AgentType 中追加 `'adversarial-review'`（与已有 `'adversarial'` 区分）

- [ ] Task 2: 数据库迁移 (AC: #5)
  - [ ] 2.1 创建 `src/main/db/migrations/014_create_adversarial_reviews.ts`：
    - `adversarial_review_sessions` 表：id(TEXT PK), project_id(TEXT UNIQUE NOT NULL), lineup_id(TEXT NOT NULL), status(TEXT NOT NULL), role_results(TEXT/JSON), started_at(TEXT), completed_at(TEXT), created_at(TEXT), updated_at(TEXT)
    - `adversarial_findings` 表：id(TEXT PK), session_id(TEXT NOT NULL FK→sessions.id), role_id(TEXT NOT NULL), role_name(TEXT NOT NULL), severity(TEXT NOT NULL), section_ref(TEXT), section_locator(TEXT/JSON), content(TEXT NOT NULL), suggestion(TEXT), reasoning(TEXT), status(TEXT NOT NULL DEFAULT 'pending'), rebuttal_reason(TEXT), contradiction_group_id(TEXT), sort_order(INTEGER NOT NULL), created_at(TEXT), updated_at(TEXT)
    - `adversarial_findings` 上建索引：session_id, contradiction_group_id
  - [ ] 2.2 在 `src/main/db/schema.ts` 注册 `AdversarialReviewSessionsTable` 和 `AdversarialFindingsTable` 类型
  - [ ] 2.3 在 `src/main/db/migrator.ts` 注册 migration 014

- [ ] Task 3: 数据访问层 (AC: #2, #3, #5)
  - [ ] 3.1 创建 `src/main/db/repositories/adversarial-review-repo.ts`：
    - `saveSession(session)`: upsert（基于 project_id UNIQUE 约束）
    - `findSessionByProjectId(projectId)`: 查询 session + 关联的全部 findings（JOIN 或分步查询）
    - `saveFindings(findings[])`: 批量插入 findings
    - `updateFinding(id, patch: { status, rebuttalReason })`: 更新单条 finding 状态
    - `deleteFindingsBySessionId(sessionId)`: 重新执行前清理旧 findings
    - `updateSessionStatus(sessionId, status, roleResults?)`: 更新会话状态
    - JSON 字段（roleResults / sectionLocator）序列化/反序列化使用 `JSON.stringify` / `JSON.parse`

- [ ] Task 4: 评审执行 Prompt 模板 (AC: #1)
  - [ ] 4.1 创建 `src/main/prompts/adversarial-review.prompt.ts`：
    - 导出 `buildAdversarialReviewPrompt(context: AdversarialReviewPromptContext) => string`
    - 输入 context：role（名称/视角/攻击焦点/强度/描述）、proposalContent（方案全文或分章节内容）、scoringCriteria（评分标准）、mandatoryItems（*项列表）
    - 系统指令：扮演该角色（名称 + 视角），从攻击焦点出发审查方案
    - 输出格式：严格 JSON 数组，每条含 `{ severity, sectionRef, content, suggestion, reasoning }`
    - 强度映射策略：high → temperature 0.8, 激进攻击, 发现数量不限; medium → temperature 0.6, 平衡审查; low → temperature 0.4, 仅关键问题
    - maxTokens: 4096（单角色输出上限）

- [ ] Task 5: 矛盾检测 Prompt 模板 (AC: #2)
  - [ ] 5.1 创建 `src/main/prompts/contradiction-detection.prompt.ts`：
    - 导出 `buildContradictionDetectionPrompt(context: { findings: FindingSummary[] }) => string`
    - 输入：全部 findings 的摘要（id, roleId, roleName, content, sectionRef）
    - 输出格式：严格 JSON 数组 `[{ findingIdA, findingIdB, contradictionReason }]`
    - 指令：识别不同角色之间对同一主题提出矛盾观点的 finding 对（如"建议增加微服务" vs "运维复杂度太高"）
    - Temperature: 0.3（精确判断），maxTokens: 2048

- [ ] Task 6: 评审执行 Agent (AC: #1)
  - [ ] 6.1 创建 `src/main/services/agent-orchestrator/agents/adversarial-review-agent.ts`：
    - 纯 prompt 构建器（不访问 DB，不做校验）
    - 接收 `{ role, proposalContent, scoringCriteria, mandatoryItems }` → 返回 `AiRequestParams`
    - 调用 `adversarial-review.prompt.ts` 构建 prompt
    - 与 `adversarial-agent.ts`（角色**生成** agent）完全分离
  - [ ] 6.2 在 `src/main/services/agent-orchestrator/index.ts` 注册 `'adversarial-review'` agent

- [ ] Task 7: 评审执行服务 — 核心编排 (AC: #1, #2, #4, #5)
  - [ ] 7.1 创建 `src/main/services/adversarial-review-service.ts`：
    - **`startExecution(projectId: string): Promise<{ taskId: string }>`**
      1. 校验前置条件：lineup 存在且 status='confirmed'；方案内容非空
      2. 沿用 `adversarial-lineup-service.ts` 的外层任务模式，通过 `taskQueue.enqueue({ category: 'ai' })` 创建外部主任务；`ai-agent` 仅用于 agent-orchestrator 内部任务
      3. Executor 内部流程：
         a. updateProgress("准备评审上下文…", 5%)
         b. 通过 `documentService.load(projectId)` 加载方案全文，并通过 `documentService.getMetadata(projectId)` 读取 `sectionIndex`
         c. 通过既有 repository / service 读取评分标准、confirmed `mandatoryItems`、confirmed lineup；不要新建原始文件读取分支
         d. 基于 confirmed lineup 初始化 `roleResults[]`（全部 `pending`），并立即 upsert `session.status='running'`
         e. 为每个角色调用 `adversarial-review-agent` 构建 `AiRequestParams`
         f. **Promise.allSettled** 并行调用 `aiProxy.call()`（每个角色独立调用；`aiProxy` 已内建 desensitize → provider call → restore 管线）
         g. 角色开始时将对应 `roleResults[i].status` 置为 `running`；角色完成或失败时更新为 `success` / `failed`，并按完成数刷新 `updateProgress("角色 X/N 完成", percentage)`
         h. 解析各角色返回的 JSON findings，执行输出归一化：非法 `severity` 回退 `major`、空 `content` 丢弃、`suggestion` / `reasoning` 允许为空、同角色内保留原始顺序
         i. 使用 `proposal.meta.json sectionIndex` 将 `sectionRef` 解析为 `sectionLocator`；无法稳定定位时保留 `sectionRef` 并写入 `sectionLocator=null`
         j. 合并全部成功角色的 findings → 按 severity(critical=0,major=1,minor=2) + role.sortOrder + 原始顺序 排序 → 分配 sortOrder
         k. 仅当成功 findings 来自至少 2 个角色且总数 ≥ 2 时才调用矛盾检测；否则跳过 AI 矛盾检测并保持 `contradictionGroupId=null`
         l. 若至少 1 个角色成功：先删除旧 findings，再 upsert session + 批量插入新 findings；会话状态按 completed / partial 写入
         m. 若所有角色均失败：先持久化 `session.status='failed'` 和失败 `roleResults[]`，再让外部 task 进入 failed，供 renderer 恢复失败态面板
         n. 非全失败时 updateProgress("评审完成", 100%)
      4. 返回外部 taskId
    - **`getReview(projectId: string): Promise<AdversarialReviewSession | null>`**：从 DB 恢复完整评审会话（含 findings）
    - **`handleFinding(findingId: string, action: HandleFindingAction, rebuttalReason?: string): Promise<AdversarialFinding>`**：更新 finding 状态和反驳理由；当 action='rejected' 且理由为空时抛出 `ValidationError`
    - **`retryRole(projectId: string, roleId: string): Promise<{ taskId: string }>`**：
      1. 读取当前 session，取出目标失败角色
      2. 单独执行该角色的 AI 调用，并将该角色 `roleResults.status` 置为 `running`
      3. 成功后：追加 findings 到现有 session，重新排序，按需重新运行矛盾检测，更新 DB
      4. 如果重试后没有失败角色了，session.status → 'completed'；否则保持 'partial'
      5. 若该次重试再次失败：保留既有成功 findings，不删除其他角色结果，并让 retry task 进入 failed
  - [ ] 7.2 进度上报粒度（通过 executor 的 updateProgress）：
    - 5%: "准备评审上下文…"
    - 10%-80%: "角色 1/N 攻击中…" → "角色 2/N 完成…"（按角色完成动态更新）
    - 85%: "整理评审结果…"
    - 90%: "矛盾检测中…"
    - 100%: "评审完成"

- [ ] Task 8: IPC Handler 扩展 (AC: #1, #2, #3, #4)
  - [ ] 8.1 在 `src/main/ipc/review-handlers.ts` 追加 4 个 handler：
    - `review:start-execution` → `adversarialReviewService.startExecution(input.projectId)`
    - `review:get-review` → `adversarialReviewService.getReview(input.projectId)`
    - `review:handle-finding` → `adversarialReviewService.handleFinding(input.findingId, input.action, input.rebuttalReason)`
    - `review:retry-role` → `adversarialReviewService.retryRole(input.projectId, input.roleId)`
  - [ ] 8.2 在 `src/preload/index.ts` 暴露 4 个新 API 方法（camelCase 命名，FullPreloadApi 自动派生类型）
  - [ ] 8.3 不要手动编辑 `src/preload/index.d.ts`

- [ ] Task 9: reviewStore 扩展 (AC: #1, #2, #3)
  - [ ] 9.1 在 `src/renderer/src/stores/reviewStore.ts` 扩展 ReviewProjectState：
    - 新增字段：`reviewSession`, `reviewLoaded`, `reviewLoading`, `reviewError`, `reviewTaskId`, `reviewProgress`, `reviewMessage`
    - 遵循已有 lineup 域的 per-project state 模式（`projects: Record<string, ReviewProjectState>`）
    - 扩展任务查找 helper（如 `findReviewProjectIdByTaskId`）以识别 `reviewTaskId`；必要时返回 `taskKind: 'lineup' | 'review'`
  - [ ] 9.2 新增 actions：
    - `startReview(projectId)`: 调用 IPC，存储 taskId
    - `loadReview(projectId)`: 从 main 加载完整评审会话并返回是否存在 session
    - `handleFinding(projectId, findingId, action, rebuttalReason?)`: 调用 IPC 更新 finding，本地乐观更新
    - `retryRole(projectId, roleId)`: 调用 IPC，存储 retry taskId
    - `updateReviewProgress(projectId, progress, message)`: 进度更新
    - `clearReviewError(projectId)`: 清除错误状态

- [ ] Task 10: 评审结果 UI 组件 (AC: #1, #2, #3, #4)
  - [ ] 10.1 创建 `src/renderer/src/modules/review/components/AdversarialReviewPanel.tsx`：
    - 五种状态渲染：
      - **idle**：未执行，显示提示"请先确认对抗阵容后启动评审"
      - **running**：进度条 + 各角色状态指示器（Spin/Check/Close 图标）
      - **completed**：findings 列表（按排序后的 sortOrder）；当 findings 为空时显示成功空态"本轮对抗评审未发现需要处理的问题"
      - **partial**：findings 列表 + 顶部失败角色警告区（含重试按钮）
      - **failed**：错误提示 + 重新启动按钮
    - 固定在右侧面板区域；**Story 7.3 明确采用“替换 AnnotationPanel”方案**，即 `compliance-review` 阶段右侧只渲染 ReviewPanel，不引入 Tab 切换
    - 顶部统计栏：`N 条攻击发现 | critical: X | major: Y | minor: Z`
    - 筛选器：按 severity / 角色 / 状态过滤
  - [ ] 10.2 创建 `src/renderer/src/modules/review/components/AdversarialFindingCard.tsx`：
    - 红色主题卡片（`#FF4D4F` 左边框）
    - 显示：角色名标签、severity badge（critical=红底、major=橙底、minor=灰底）、攻击内容、改进建议、章节引用链接
    - 章节链接优先使用 `sectionLocator` 调用既有 `scrollToHeading()`；当 `sectionLocator=null` 时仅展示文本，不触发跳转
    - 矛盾标记：如有 contradictionGroupId 则显示 ⚡ 矛盾标签（为 7-4 预留视觉提示）
    - 三个操作按钮：
      - 「接受并修改」→ status='accepted'，卡片边框变绿
      - 「反驳」→ 展开 TextArea 输入理由，提交后 status='rejected'，卡片变灰
      - 「请求指导」→ status='needs-decision'，卡片边框变紫闪烁
    - 已处理的卡片折叠显示（仅标题 + 状态 badge）
  - [ ] 10.3 创建 `src/renderer/src/modules/review/components/ReviewExecutionTrigger.tsx`：
    - 在 AdversarialLineupDrawer confirmed 态底部显示"启动对抗评审"主按钮
    - 点击后 Popconfirm 二次确认："确认对 N 个角色启动方案评审？"
    - 执行后按钮变为 disabled + loading 态，文案"评审进行中…"
    - `completed` / `partial` 后按钮变为"查看评审结果"，点击打开 ReviewPanel
    - `failed` 后按钮恢复为"重新启动评审"；若项目重开时已恢复 `completed` / `partial` session，则直接显示"查看评审结果"
  - [ ] 10.4 创建 `src/renderer/src/modules/review/components/FailedRoleAlert.tsx`：
    - 失败角色警告卡片：角色名 + 错误摘要 + 「重试」按钮
    - 重试中显示 Spin

- [ ] Task 11: Hook 扩展 (AC: #1, #2)
  - [ ] 11.1 扩展 `src/renderer/src/modules/review/hooks/useReviewTaskMonitor.ts`：
    - 新增监听 review execution 类型的 task progress（与 lineup generation 区分）
    - `completed` / `partial` 任务完成时自动 `loadReview(projectId)` 刷新 store
    - 外层 task `failed` 时仍需调用一次 `loadReview(projectId)`，以恢复已持久化的 failed session 并展示失败态面板
    - partial 完成时 `message.warning("N个角色评审失败，可单独重试")`
    - 全部失败时 `message.error("对抗评审失败") + 显示重试提示`
  - [ ] 11.2 创建 `src/renderer/src/modules/review/hooks/useAdversarialReview.ts`：
    - 管理评审面板开关状态
    - 项目打开时自动恢复已有评审结果（调用 loadReview）
    - 评审进入 `completed` / `partial` / `failed` 终态后自动打开结果/失败面板
    - 提供 startReview / retryRole 的封装调用

- [ ] Task 12: Workspace 集成 (AC: #1, #2)
  - [ ] 12.1 修改 `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`：
    - Stage 5（compliance-review）下集成 AdversarialReviewPanel 到右侧面板区域，**替换当前 AnnotationPanel**
    - `proposal-writing` 等其他阶段继续保留现有 AnnotationPanel 行为，不回归 Story 4.x
    - 集成 useAdversarialReview hook
  - [ ] 12.2 修改 `src/renderer/src/modules/review/components/AdversarialLineupDrawer.tsx`：
    - confirmed 态底部嵌入 ReviewExecutionTrigger 组件

- [ ] Task 13: 测试 (AC: #1-#5)
  - [ ] 13.1 Unit: adversarial-review-repo（saveSession upsert、findByProject 含 findings、updateFinding、deleteFindingsBySession、JSON 序列化）
  - [ ] 13.2 Unit: adversarial-review.prompt（prompt 结构、角色注入、强度→temperature 映射、输出格式约束）
  - [ ] 13.3 Unit: contradiction-detection.prompt（输入格式、矛盾对输出解析、空 findings 处理）
  - [ ] 13.4 Unit: adversarial-review-agent（context → AiRequestParams 转换、agent 注册验证）
  - [ ] 13.5 Unit: adversarial-review-service（前置条件校验拒绝未确认 lineup、并行执行 mock、部分失败容错、全失败 failed-session 持久化、结果排序验证、sectionRef→sectionLocator 解析、矛盾检测集成、retryRole 追加合并、重复执行 upsert 覆盖旧数据）
  - [ ] 13.6 Unit: review-handlers（新增 4 通道路由、参数校验、错误包装）
  - [ ] 13.7 Unit: reviewStore（execution 域生命周期：idle → running → completed/partial/failed、findingAction 乐观更新、reviewLoaded / progress 更新、taskId→projectId 映射）
  - [ ] 13.8 Unit: useAdversarialReview hook（自动恢复、面板切换、startReview 调用链）
  - [ ] 13.9 Component: AdversarialReviewPanel（5 状态切换渲染、筛选器交互、零结果空态）
  - [ ] 13.10 Component: AdversarialFindingCard（3 操作按钮、状态样式切换、反驳输入展开收起、矛盾标记显示、sectionLocator 导航/降级）
  - [ ] 13.11 Component: ReviewExecutionTrigger（Popconfirm 确认、loading 禁用态、completed/partial/failed 文案切换）
  - [ ] 13.12 Component: FailedRoleAlert（重试按钮、loading 态）
  - [ ] 13.13 E2E: 完整用户旅程（已确认 lineup → 启动评审 → 等待进度 → 查看结果 → 处理 finding（三种操作各一次）→ 关闭重开恢复结果）

## Dev Notes

### 关键架构模式

#### 外部任务 + 内部并行 Agent 调用（核心与 7-2 的差异）

7-2 是"一个任务 → 一次 AI 调用"；7-3 是"一个任务 → N 次并行 AI 调用 + 1 次矛盾检测调用"。

- 沿用 7-2 的外部任务模式：`adversarial-review-service.startExecution()` → `taskQueue.enqueue({ category: 'ai' })` → 返回外部 taskId
- Executor 内部对 N 个角色使用 `Promise.allSettled` 并行调用 `aiProxy.call()`
- 每个角色的 AI 调用仍走 desensitize→call→restore 管线；该管线已封装在 `src/main/services/ai-proxy/index.ts`
- 参考 `adversarial-lineup-service.ts` 的 task 创建和进度上报模式
- 进度上报：每个角色开始/完成时 `updateProgress()`

#### 复用既有服务与数据源（避免重复造轮子）

- 方案正文与章节索引直接复用 `documentService.load(projectId)` / `documentService.getMetadata(projectId)`，不要新增文件系统读取分支
- confirmed lineup 直接复用 `adversarialLineupService.getLineup(projectId)` 或对应 repository 查询
- 评分标准、*项列表复用既有 `ScoringModelRepository` / `MandatoryItemRepository`
- 章节跳转复用现有 `ChapterHeadingLocator` + `scrollToHeading()`，不要新造章节定位协议

#### Agent 职责分离（关键区分）

| Agent | 用途 | 文件 | Story |
|---|---|---|---|
| `adversarial-agent.ts` | 角色**生成**（生成 lineup） | 已有 | 7-2 |
| `adversarial-review-agent.ts` | 评审**执行**（攻击方案） | 新增 | 7-3 |

两者都是纯 prompt 构建器，不访问 DB。Service 层负责编排、校验、持久化、容错。

#### 结果聚合模式（AC2 核心约束）

**严禁流式逐条渲染**。必须等全部角色返回 → 排序 → 矛盾检测 → 一次性写入 store → 一次性渲染。

排序规则：
1. severity 权重：critical=0, major=1, minor=2
2. 同 severity 按 role.sortOrder 升序
3. 同角色按 finding 在 AI 返回中的原始顺序

矛盾检测是独立 AI 调用，在排序之后、持久化之前执行。contradictionGroupId 相同的 findings 属于同一矛盾对，为 Story 7-4 交叉火力决策卡片 UI 准备数据。

#### 部分失败容错（AC4）

- `Promise.allSettled` 确保单角色失败不阻塞其他角色
- 成功角色的 findings 正常处理
- 失败角色记录到 `roleResults[]`（status='failed', error message）
- 会话状态判定：全成功='completed'，至少一个成功但有失败='partial'，全部失败='failed'
- 当全部失败时，先持久化 `session.status='failed'`，再让外部 task 标记为 failed；renderer 通过 `loadReview()` 恢复失败态面板

#### 单项目单记录模型

- `adversarial_review_sessions.project_id` UNIQUE 约束（与 lineup 表一致）
- 重新执行评审 = 先 deleteFindingsBySessionId → 再 upsert 新 session + 新 findings
- 不保留历史评审记录
- retryRole 是追加模式（不删除已有成功角色的 findings）

#### Finding 独立于 annotationStore

- Finding 是本 Story 的核心数据实体，独立持久化到 `adversarial_findings` 表
- UI 展示复用右侧面板位置；在 `compliance-review` 阶段直接替换 AnnotationPanel，但数据流经 reviewStore（不经 annotationStore）
- 三种操作直接更新 finding 的 status 字段
- 暂不与 Story 4-x 的 annotationStore 打通，保持 review 域独立性
- 后续如需打通，可建立 finding → annotation 的映射桥接

### UX 实施锚点（已按 manifest / PNG / `.pen` 复核）

- Story 级 UX 入口工件：
  - `_bmad-output/implementation-artifacts/7-3-adversarial-review-execution-ux/prototype.manifest.yaml`
  - `_bmad-output/implementation-artifacts/7-3-adversarial-review-execution-ux/ux-spec.md`
  - `_bmad-output/implementation-artifacts/7-3-adversarial-review-execution-ux/prototype.pen`
- `.pen` 主 frame：
  - `7Pbmy`：Screen 1 — confirmed Drawer 底部 `ReviewExecutionTrigger`
  - `9IyPA`：Screen 2 — completed ReviewPanel
  - `UlfNE`：Screen 3 — partial ReviewPanel + rebuttal expanded
- 右侧评审面板宽度固定 480px；Header / Stats Bar / Filters / Findings List 四段式结构与 `.pen` 一致
- 当前原型导出覆盖 trigger / completed / partial；running / failed 态以 `ux-spec.md` 为准实现
- confirmed Drawer 底部按钮文案、统计栏格式、失败告警卡片配色、以及反驳输入展开结构已在 `.pen` 中落锚，不要自行改写交互文案

### 与 7-2 已有代码的衔接

| 已有资产（7-2 产出） | 本 Story 扩展方式 |
|---|---|
| `src/shared/adversarial-types.ts` | 追加 Finding/Session/RoleResult 类型 |
| `src/main/ipc/review-handlers.ts`（4 通道） | 追加 4 个 execution 域 handler |
| `src/renderer/src/stores/reviewStore.ts`（lineup 域） | 追加 execution 域 state + actions |
| `useReviewTaskMonitor.ts`（监听 lineup 任务） | 扩展监听 execution 类型任务 |
| `AdversarialLineupDrawer.tsx`（confirmed 态） | confirmed 态底部嵌入 ReviewExecutionTrigger |
| `adversarial-lineup-service.ts` | 新 service 调用 `getLineup()` 获取 confirmed lineup |
| `agent-orchestrator/index.ts`（注册 adversarial） | 追加注册 `'adversarial-review'` agent |
| `ProjectWorkspace.tsx`（Drawer 集成） | 追加 ReviewPanel 集成 |

### Preload 类型合约

- **不要**手动编辑 `src/preload/index.d.ts`
- 单一真相来源：`src/shared/ipc-types.ts` → `FullPreloadApi`（自动派生）
- 在 `src/preload/index.ts` 中按 camelCase 暴露新方法即可

### UI 颜色规范

| Finding 状态 | 卡片样式 |
|---|---|
| pending | 红色左边框 `#FF4D4F`，白色背景 |
| accepted | 绿色左边框 `#52C41A`，浅绿背景 |
| rejected | 灰色左边框 `#D9D9D9`，浅灰背景 |
| needs-decision | 紫色左边框 `#722ED1`，脉冲闪烁动效 |

Severity badge：
- critical: 红底白字
- major: 橙底白字
- minor: 灰底深色字

### 反模式警告

- ❌ 不要在 Agent 中访问 DB（纯 prompt 构建器）
- ❌ 不要流式逐条渲染 findings（等全部完成后批量处理）
- ❌ 不要手动编辑 `src/preload/index.d.ts`（FullPreloadApi 自动派生）
- ❌ 不要在 IPC handler 中放业务逻辑（thin dispatch only）
- ❌ 不要把矛盾检测放到 renderer 层（在 service 层完成，renderer 只读 contradictionGroupId）
- ❌ 不要跳过 desensitize→call→restore 管线（即使是并行多次调用）
- ❌ 不要绕过 task-queue 直接执行 AI 调用
- ❌ 不要在 retryRole 时删除其他角色的已有 findings

### Project Structure Notes

- 所有新文件遵循已有目录结构：`src/main/services/`, `src/main/prompts/`, `src/renderer/src/modules/review/`
- IPC 通道沿用 `review:` 域前缀，与 7-2 的 4 通道共存
- Store 扩展在同一 `reviewStore.ts` 中新增 execution 域（不新建 store）
- Migration 编号 014 紧接 7-2 的 013
- 无命名冲突或路径偏差

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 7, Story 7.3 AC 定义]
- [Source: _bmad-output/planning-artifacts/architecture.md — Agent Orchestrator 管线、Task Queue、Annotation Service 类型]
- [Source: _bmad-output/planning-artifacts/prd.md — FR45(动态角色), FR46(确认执行), FR47(合规保底), FR48(矛盾检测), NFR7(< 5分钟)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Stage 5 流程、五色编码、批注处理循环、交叉火力交互模式]
- [Source: _bmad-output/implementation-artifacts/7-3-adversarial-review-execution-ux/prototype.manifest.yaml — 7-3 UX artifact lookup order / primary frames]
- [Source: _bmad-output/implementation-artifacts/7-3-adversarial-review-execution-ux/ux-spec.md — 7-3 story-level panel / trigger / failure UX]
- [Source: _bmad-output/implementation-artifacts/7-3-adversarial-review-execution-ux/prototype.pen — frame IDs 7Pbmy / 9IyPA / UlfNE]
- [Source: _bmad-output/implementation-artifacts/7-1-mandatory-item-compliance-engine.md — reviewStore 模式、compliance IPC 模式、StatusBar 集成]
- [Source: _bmad-output/implementation-artifacts/7-2-dynamic-adversarial-role-generation.md — lineup service 模式、task 监听、agent 注册、Drawer 状态、FullPreloadApi 合约]

## Change Log

- 2026-04-12: `validate-create-story` 复核修订
  - 补回 create-story 模板要求的 validation note
  - 修正外层任务类别为 `ai`，与当前 `task-queue` / `agent-orchestrator` 基线一致
  - 明确全失败时“先持久化 failed session，再让外层 task failed”，消除 AC 与 Dev Notes 矛盾
  - 为 finding 补充 `sectionLocator`，对齐现有 `ChapterHeadingLocator` / `scrollToHeading()` 导航协议
  - 明确 `RoleReviewResult` 运行态、右侧面板“替换 AnnotationPanel”决策、零结果空态、触发器终态文案、以及 `reviewStore` 的 `reviewLoaded` / task 映射要求
  - 加入 story 级 UX 工件引用与 `.pen` frame 锚点，确保实现与原型一致

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
