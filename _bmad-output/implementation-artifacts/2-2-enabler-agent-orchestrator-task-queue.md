# Story 2.2: [Enabler] Agent 编排层与异步任务队列

Status: ready-for-dev

## Story

As a 开发者,
I want 统一的 Agent 编排层和异步任务队列,
So that 所有 AI Agent 按一致模式调度，长时间任务不阻塞 UI。

## Acceptance Criteria

### AC1: 编排层统一调度——脱敏→调用→日志→还原→重试/降级

- **Given** Agent 编排层已初始化
- **When** 调用 `agentOrchestrator.execute({ agentType, context, options })`
- **Then** 编排层同步返回 `{ taskId }`，并在后台统一处理：task-queue 入队 → 脱敏 → ai-proxy 调用 → 日志 → 还原 → 重试/降级；最终结果通过 `getAgentStatus(taskId)` 查询或 `task:progress` 事件感知，全流程对调用者透明
- [Source: epics.md Story 2.2 AC1, architecture.md Agent 编排层设计原则]

### AC2: 任务队列——持久化/进度推送/取消/重试/断点恢复

- **Given** 白名单异步操作（AI 调用/OCR/批量导入）触发
- **When** 任务进入 task-queue
- **Then** 任务状态持久化到 SQLite（tasks 表），进度通过 IPC 事件推送到渲染进程，支持取消/重试/断点恢复
- [Source: epics.md Story 2.2 AC2, architecture.md 异步任务白名单, NFR2, NFR15]

### AC3: Agent 注册表——可插拔 Agent 类型

- **Given** ParseAgent 已注册
- **When** 调用 `registerAgent('parse', handler)` 后通过 `execute({ agentType: 'parse', context })` 执行
- **Then** Agent 类型可通过统一接口调用，`execute()` 入队即返回 `{ taskId }`，支持 `getAgentStatus(taskId)` 查询任务状态/进度/最终结果
- [Source: epics.md Story 2.2 AC3, architecture.md Alpha 注册 ParseAgent/GenerateAgent]

### AC4: AI 调用链日志——追溯每次 Agent 调用

- **Given** AI 调用完成（通过 agent-orchestrator 触发）
- **When** 追溯日志
- **Then** 日志通过 ai-proxy 的 ai-trace-logger 自动记录（Story 2.1 已实现），orchestrator 额外记录 agentType 到 caller 字段（格式 `{agentType}-agent`），确保追溯粒度到具体 Agent 类型
- [Source: epics.md Story 2.2 AC4, architecture.md AI 调用链可追溯]

## Tasks / Subtasks

- [ ] Task 1: 共享类型扩展 (AC: 1, 2, 3)
  - [ ] 1.1 在 `src/shared/ai-types.ts` 新增 Agent 编排层类型：
    - `AgentType = 'parse' | 'generate'`（Alpha 阶段，后续 Beta 扩展 `'seed' | 'adversarial' | 'scoring' | 'gap'`）
    - `AgentExecuteRequest = { agentType: AgentType; context: Record<string, unknown>; options?: AgentExecuteOptions }`
    - `AgentExecuteOptions = { priority?: TaskPriority; timeoutMs?: number }`（默认超时由 task-queue 控制，调用方可按请求可选覆盖；retry 次数仍由 task-queue 控制，不暴露给调用方——见 retry 归属说明）
    - `AgentExecuteResponse = { taskId: string }`（`execute()` 直接返回类型，入队即返回）
    - `AgentExecuteResult = { content: string; usage: TokenUsage; latencyMs: number }`（任务最终完成后的结果类型）
    - `AgentStatus = { taskId: string; status: TaskStatus; progress: number; agentType: AgentType; createdAt: string; updatedAt: string; result?: AgentExecuteResult; error?: { code: string; message: string } }`
  - [ ] 1.1b 扩展 `AiProxyRequest` 新增可选字段（cancel 传播链基础）：
    - `signal?: AbortSignal` — 外部取消信号，传播到 Provider SDK 调用层
    - `timeoutMs?: number` — 单次调用超时，由上游传入（task-queue 创建任务时默认 `900_000` ms / 15 分钟）；ai-proxy / provider-adapter 自身不设默认值，仅透传
  - [ ] 1.1c 在 `src/main/services/ai-proxy/index.ts` 提升 signal/timeoutMs 传播改造为本 Story 正式 Task（AC: 1, 2 前置）：
    - `aiProxy.call()` 调用 Provider 时传递 `{ signal, timeoutMs }`
    - `timeoutMs` 透传 `request.timeoutMs`（不设本地默认值；默认 900_000 由 task-queue 在入队时设定）
    - 这是 task-queue 取消链路和长任务超时控制的前置，不得仅停留在 Dev Notes
  - [ ] 1.1d 在 `src/main/services/ai-proxy/provider-adapter.ts` 提升 signal/timeoutMs 传播改造为本 Story 正式 Task（AC: 1, 2 前置）：
    - `AiProvider.chat(request, options?: { signal?: AbortSignal; timeoutMs?: number })`
    - Claude/OpenAI SDK 调用显式接收 `signal` + `timeout: options.timeoutMs`（移除硬编码 `30_000` 默认值；超时完全由上游 task-queue 控制）
    - 替换现有硬编码 `30_000` 的调用路径，provider-adapter 自身不再设默认超时
  - [ ] 1.2 在 `src/shared/ai-types.ts` 新增 task-queue 类型：
    - `TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'`
    - `TaskPriority = 'low' | 'normal' | 'high'`
    - `TaskCategory = 'ai-agent' | 'ocr' | 'import' | 'export' | 'git-sync' | 'semantic-search'`（白名单类别）
    - `TaskProgressEvent = { taskId: string; progress: number; message?: string }`
    - `TaskRecord = { id: string; category: TaskCategory; agentType?: AgentType; status: TaskStatus; priority: TaskPriority; progress: number; input: string; output?: string; error?: string; retryCount: number; maxRetries: number; checkpoint?: string; createdAt: string; updatedAt: string; completedAt?: string }`
  - [ ] 1.3 在 `src/shared/ipc-types.ts` 扩展 IPC 通道：
    - `IPC_CHANNELS` 常量新增：`AGENT_EXECUTE: 'agent:execute'`, `AGENT_STATUS: 'agent:status'`, `TASK_LIST: 'task:list'`, `TASK_CANCEL: 'task:cancel'`
    - `IpcChannelMap` 新增四个通道的 input/output 类型对，其中 `agent:execute` 输出类型为 `AgentExecuteResponse`
    - 新增 `TASK_PROGRESS_EVENT: 'task:progress'` 常量（用于 webContents.send 单向推送，不加入 IpcChannelMap）
    - 新增 `IpcEventPayloadMap = { 'task:progress': TaskProgressEvent }` 事件通道类型映射（与请求式 `IpcChannelMap` 分离，专供 `webContents.send` / `ipcRenderer.on` 单向推送的类型安全）
  - [ ] 1.4 在 `src/shared/constants.ts` ErrorCode 枚举新增：
    - `AGENT_NOT_FOUND = 'AGENT_NOT_FOUND'`
    - `AGENT_EXECUTE = 'AGENT_EXECUTE'`
    - `AGENT_TIMEOUT = 'AGENT_TIMEOUT'`
    - `TASK_QUEUE = 'TASK_QUEUE'`
    - `TASK_NOT_FOUND = 'TASK_NOT_FOUND'`
    - `TASK_CANCELLED = 'TASK_CANCELLED'`

- [ ] Task 2: 数据库迁移——tasks 表 (AC: 2)
  - [ ] 2.1 创建 `src/main/db/migrations/003_create_tasks.ts`
  - [ ] 2.2 tasks 表结构（snake_case，Kysely CamelCasePlugin 自动转换）：
    ```sql
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,          -- 'ai-agent' | 'ocr' | 'import' | 'export' | 'git-sync' | 'semantic-search'
      agent_type TEXT,                 -- 'parse' | 'generate' | null（非 AI 任务时 null）
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'normal',
      progress REAL NOT NULL DEFAULT 0,
      input TEXT NOT NULL,             -- JSON 序列化的任务输入
      output TEXT,                     -- JSON 序列化的任务输出
      error TEXT,                      -- 失败时的错误信息
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      checkpoint TEXT,                 -- JSON 序列化的断点数据（断点恢复用）
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )
    ```
  - [ ] 2.3 在 `src/main/db/schema.ts` 的 `DB` 接口中新增 `tasks: TaskTable`，定义 `TaskTable` 接口（camelCase 字段名）
  - [ ] 2.4 在 `src/main/db/migrator.ts` 的 migrations 中注册 `003_create_tasks`

- [ ] Task 3: Task Repository (AC: 2)
  - [ ] 3.1 创建 `src/main/db/repositories/task-repo.ts`
  - [ ] 3.2 实现 `TaskRepository` 类：
    - `create(input: CreateTaskInput): Promise<TaskTable>` — 生成 UUID（复用 `import { v4 as uuidv4 } from 'uuid'` 模式），设置 createdAt/updatedAt
    - `findById(id: string): Promise<TaskTable>` — 未找到抛 `NotFoundError`
    - `findAll(filter?: TaskFilter): Promise<TaskTable[]>` — 支持按 status/category/agentType 过滤，按 createdAt DESC 排序
    - `update(id: string, input: UpdateTaskInput): Promise<TaskTable>` — 更新 status/progress/output/error/checkpoint/retryCount/completedAt，自动刷新 updatedAt
    - `delete(id: string): Promise<void>` — 物理删除
    - `findPending(): Promise<TaskTable[]>` — 断点恢复用：查找 status='pending' 或 status='running' 的任务（崩溃恢复场景）
  - [ ] 3.3 使用 Kysely 查询构建器（禁止 raw SQL），复用 `getDb()` 获取数据库实例

- [ ] Task 4: Task Queue 服务 (AC: 2)
  - [ ] 4.1 创建 `src/main/services/task-queue/queue.ts`
  - [ ] 4.2 实现 `TaskQueueService` 类：
    - `enqueue(request: EnqueueRequest): Promise<string>` — 创建任务记录，返回 taskId；EnqueueRequest = `{ category, agentType?, input, priority?, maxRetries? }`
    - `execute(taskId: string, executor: TaskExecutor): Promise<TaskRecord>` — 更新状态为 running → 执行 executor → 成功则 completed，失败时按 retry 归属策略处理（见下方"Retry 归属与 Abort 传播"说明）
    - `cancel(taskId: string): Promise<void>` — 将状态更新为 cancelled，触发该任务的 AbortController.abort()，信号沿 executor → orchestrator → `aiProxy.call({ signal })` → Provider SDK 逐层传播，确保 in-flight HTTP 请求被中止
    - `retry(taskId: string): Promise<string>` — 重置 status 为 pending，retryCount+1
    - `getStatus(taskId: string): Promise<TaskRecord>` — 查询任务当前状态
    - `listTasks(filter?: TaskFilter): Promise<TaskRecord[]>` — 列出任务（支持过滤）
    - `updateProgress(taskId: string, progress: number, message?: string): Promise<void>` — 更新进度并通过 progress-emitter 推送
    - `recoverPendingTasks(): Promise<void>` — 启动时调用，将崩溃前 running 状态的任务重置为 pending（断点恢复基础）
  - [ ] 4.3 `TaskExecutor` 类型：`(context: { taskId: string; input: unknown; signal: AbortSignal; updateProgress: (progress: number, message?: string) => void; setCheckpoint: (data: unknown) => Promise<void>; checkpoint?: unknown }) => Promise<unknown>` — `setCheckpoint` 将断点数据持久化到 tasks 表 checkpoint 字段（通过 `TaskRepository.update()`），断点恢复时上次写入的 checkpoint 通过 `checkpoint` 参数回传
  - [ ] 4.4 内部使用 `Map<string, AbortController>` 管理活跃任务的取消控制器
  - [ ] 4.5 并发限制：Alpha 阶段默认最大并发 3 个任务（可配置），超出排队等待

- [ ] Task 5: Progress Emitter (AC: 2)
  - [ ] 5.1 创建 `src/main/services/task-queue/progress-emitter.ts`
  - [ ] 5.2 实现 `ProgressEmitter` 类：
    - `emit(event: TaskProgressEvent): void` — 通过 `BrowserWindow.getAllWindows()` 获取所有渲染窗口，调用 `webContents.send('task:progress', event)` 推送进度
    - 节流策略：同一 taskId 的进度推送最小间隔 200ms（避免频繁 IPC 消息）
  - [ ] 5.3 导出单例 `progressEmitter`

- [ ] Task 6: Task Queue 入口 (AC: 2)
  - [ ] 6.1 创建 `src/main/services/task-queue/index.ts`
  - [ ] 6.2 导出 `taskQueue` 单例（`TaskQueueService` 实例）
  - [ ] 6.3 导出 `progressEmitter`
  - [ ] 6.4 导出所有 task-queue 公共类型

- [ ] Task 7: Agent Orchestrator 核心 (AC: 1, 3, 4)
  - [ ] 7.1 创建 `src/main/services/agent-orchestrator/orchestrator.ts`
  - [ ] 7.2 实现 `AgentOrchestrator` 类：
    - `registerAgent(type: AgentType, handler: AgentHandler): void` — 注册 Agent 处理器到内部 Map
    - `execute(request: AgentExecuteRequest): Promise<AgentExecuteResponse>` — 两阶段编排入口，入队即返回：
      1. 查找已注册 Agent handler（未找到抛 `BidWiseError(AGENT_NOT_FOUND)`）
      2. 通过 task-queue 入队（`taskQueue.enqueue({ category: 'ai-agent', agentType: request.agentType, input: request.context, priority: request.options?.priority ?? 'normal' })`）并获取 `taskId`
      3. 以 fire-and-forget 方式启动 `taskQueue.execute(taskId, executor)` 后台执行
      4. task-queue executor 内部流程：
         a. 调用 handler(context, { signal, updateProgress }) → handler 返回 `AiRequestParams`（messages + model config）
         b. orchestrator 构造 `AiProxyRequest`：将 handler 返回的参数 + caller 字段 (`{agentType}-agent`) + signal（来自 task-queue 的 AbortController）+ timeoutMs（来自 `request.options?.timeoutMs` 或 task-queue 默认值）合并
         c. 调用 `aiProxy.call(proxyRequest)` 完成 脱敏→调用→日志→还原
         d. 将最终结果写回任务记录，供 `getAgentStatus(taskId)` 返回
         e. Alpha 阶段：handler 纯粹构建 prompt；Beta 阶段扩展点：orchestrator 在步骤 b 前注入经验图谱上下文
      5. 同步返回 `AgentExecuteResponse = { taskId }`
    - `getAgentStatus(taskId: string): Promise<AgentStatus>` — 通过 task-queue 查询任务状态
    - `cancelAgent(taskId: string): Promise<void>` — 通过 task-queue 取消任务
  - [ ] 7.3 类型定义：
    - `AiRequestParams = { messages: AiChatMessage[]; model?: string; maxTokens?: number; temperature?: number }` — handler 返回的 AI 请求参数（不含 caller/signal，由 orchestrator 补充）
    - `AgentHandler = (context: Record<string, unknown>, options: { signal: AbortSignal; updateProgress: (progress: number, message?: string) => void }) => Promise<AiRequestParams>` — handler **只负责构建 prompt 和模型参数**，不调用 ai-proxy
  - [ ] 7.4 职责边界（强制规则）：handler 返回 `AiRequestParams` → orchestrator 合并 `{ ...params, caller: '{agentType}-agent', signal, timeoutMs }` 构造 `AiProxyRequest` → 调用 `aiProxy.call()` —— 保证所有 AI 调用统一经过 ai-proxy。handler 内禁止导入或调用 aiProxy
  - [ ] 7.5 caller 字段格式：`${agentType}-agent`（如 `parse-agent`、`generate-agent`），传入 `aiProxy.call({ caller })`

- [ ] Task 8: Alpha Agent 骨架注册 (AC: 3)
  - [ ] 8.1 创建 `src/main/services/agent-orchestrator/agents/parse-agent.ts`
    - 导出 `parseAgentHandler: AgentHandler`
    - Alpha 阶段为骨架：接收 `{ rfpContent: string }` 上下文，构建 prompt（调用 `src/main/prompts/parse-rfp.prompt.ts`——该 prompt 文件在本 Story 中创建占位），返回 `{ messages, maxTokens: 4096 }`
  - [ ] 8.2 创建 `src/main/services/agent-orchestrator/agents/generate-agent.ts`
    - 导出 `generateAgentHandler: AgentHandler`
    - Alpha 阶段为骨架：接收 `{ chapterTitle: string; requirements: string }` 上下文，构建 prompt（调用 `src/main/prompts/generate-chapter.prompt.ts`——占位），返回 `{ messages, maxTokens: 8192 }`
  - [ ] 8.3 创建 `src/main/prompts/parse-rfp.prompt.ts`
    - Alpha 占位实现：导出 `parseRfpPrompt(context: { rfpContent: string; language?: string }): string`
    - 返回基础 prompt 模板（后续 Story 2.3 填充完整）
  - [ ] 8.4 创建 `src/main/prompts/generate-chapter.prompt.ts`
    - Alpha 占位实现：导出 `generateChapterPrompt(context: { chapterTitle: string; requirements: string; language?: string }): string`
    - 返回基础 prompt 模板（后续 Story 3.4 填充完整）

- [ ] Task 9: Agent Orchestrator 入口 (AC: 1, 3)
  - [ ] 9.1 创建 `src/main/services/agent-orchestrator/index.ts`
  - [ ] 9.2 创建 `AgentOrchestrator` 单例 `agentOrchestrator`
  - [ ] 9.3 在初始化时注册 Alpha Agent：
    ```typescript
    agentOrchestrator.registerAgent('parse', parseAgentHandler)
    agentOrchestrator.registerAgent('generate', generateAgentHandler)
    ```
  - [ ] 9.4 导出 `agentOrchestrator` 单例和所有公共类型

- [ ] Task 10: IPC Handler 层 (AC: 1, 2, 3)
  - [ ] 10.1 创建 `src/main/ipc/agent-handlers.ts`
  - [ ] 10.2 导出 `registerAgentHandlers()` + `RegisteredAgentChannels`，注册两个 agent 通道（使用 `createIpcHandler` 工厂）：
    - `agent:execute` → `agentOrchestrator.execute(input)` — 返回 `AgentExecuteResponse`
    - `agent:status` → `agentOrchestrator.getAgentStatus(input)` — 返回 `AgentStatus`
  - [ ] 10.3 创建 `src/main/ipc/task-handlers.ts`
  - [ ] 10.4 导出 `registerTaskHandlers()` + `RegisteredTaskChannels`，注册两个 task 通道（使用 `createIpcHandler` 工厂）：
    - `task:list` → `taskQueue.listTasks(input)` — 返回 `TaskRecord[]`
    - `task:cancel` → `taskQueue.cancel(input)` — 返回 `void`
  - [ ] 10.5 在 `src/main/ipc/index.ts` 中显式调用 `registerAgentHandlers()` 和 `registerTaskHandlers()`，并将 `_AllRegistered` 扩展为 `RegisteredProjectChannels | RegisteredAgentChannels | RegisteredTaskChannels`，保持现有类型穷举校验模式
  - [ ] 10.6 handler 只做参数解析和结果包装——业务逻辑在 service 层

- [ ] Task 11: Preload 扩展 (AC: 1, 2, 3)
  - [ ] 11.1 更新 `src/preload/index.ts`：新增 `agentExecute`、`agentStatus`、`taskList`、`taskCancel` 方法，其中 `agentExecute` 返回 `AgentExecuteResponse`
  - [ ] 11.2 新增 `onTaskProgress(callback: (event: TaskProgressEvent) => void): () => void` 监听器——使用 `ipcRenderer.on('task:progress', callback)` 接收单向进度推送，返回 unlisten 函数（调用 `ipcRenderer.removeListener`），类型从 `IpcEventPayloadMap` 派生
  - [ ] 11.3 更新 `src/preload/index.d.ts` 类型声明——包含 `onTaskProgress` 方法签名
  - [ ] 11.4 确保编译时类型安全——新增通道未实现会触发编译错误

- [ ] Task 12: 错误类型扩展 (AC: 1, 2)
  - [ ] 12.1 在 `src/main/utils/errors.ts` 新增：
    - `TaskQueueError extends BidWiseError` — 构造函数 `(code: string, message: string, cause?: unknown)`
    - Agent 编排层错误直接使用 `BidWiseError`（搭配 `AGENT_NOT_FOUND` / `AGENT_EXECUTE` / `AGENT_TIMEOUT` 错误码），不创建独立子类

- [ ] Task 13: 启动集成 (AC: 1, 2)
  - [ ] 13.1 在 `src/main/index.ts` 启动流程中：
    - 迁移执行后调用 `taskQueue.recoverPendingTasks()` 恢复崩溃前中断的任务
    - `agentOrchestrator` 通过 import 自动初始化（模块级单例）
    - 确保 `ensureDataDirectories()` 已包含所需目录
  - [ ] 13.2 启动顺序：`ensureDataDirectories()` → DB 迁移 → `taskQueue.recoverPendingTasks()` → IPC handler 注册 → 窗口创建

- [ ] Task 14: 单元测试 (AC: 全部)
  - [ ] 14.1 `tests/unit/main/services/task-queue/queue.test.ts`：
    - 入队创建任务记录并返回 taskId
    - 执行更新状态 pending → running → completed
    - 失败任务自动重试（retryCount < maxRetries）
    - 超过最大重试次数标记为 failed
    - 取消正在执行的任务（AbortController 触发，signal.aborted=true → 状态 cancelled，不重试）
    - 真实超时（signal.aborted=false + AI_PROXY_TIMEOUT → 按 retryCount 决定重试或 failed）
    - 取消已完成/已取消的任务抛出 TaskQueueError
    - 进度更新触发 progressEmitter
    - 并发限制：第 4 个任务排队等待
    - recoverPendingTasks 将 running 状态重置为 pending
    - executor 调用 `setCheckpoint(data)` 时断点数据持久化到 tasks 表
    - 断点恢复时 checkpoint 通过 executor context 回传
    - Mock TaskRepository（不依赖真实 SQLite）
  - [ ] 14.2 `tests/unit/main/services/task-queue/progress-emitter.test.ts`：
    - 通过 webContents.send 推送到所有窗口
    - 同一 taskId 的推送节流（200ms 内不重复推送）
    - Mock BrowserWindow.getAllWindows
  - [ ] 14.3 `tests/unit/main/services/agent-orchestrator/orchestrator.test.ts`：
    - 注册 Agent 后可通过 execute 调用
    - 未注册 Agent 类型抛出 `BidWiseError(AGENT_NOT_FOUND)`
    - execute 通过 task-queue 入队后**立即返回** `AgentExecuteResponse { taskId }`
    - execute 以后台方式触发 `taskQueue.execute(taskId, executor)`
    - executor 调用 handler 获取 AI 请求 → 调用 `aiProxy.call()` → 最终结果写回任务状态
    - caller 字段格式为 `{agentType}-agent`
    - getAgentStatus 返回任务状态
    - cancelAgent 触发 task-queue 取消
    - handler 抛出异常时包装为 `BidWiseError(AGENT_EXECUTE)`
    - Mock aiProxy 和 taskQueue
  - [ ] 14.4 `tests/unit/main/services/agent-orchestrator/agents/parse-agent.test.ts`：
    - 接收 rfpContent 上下文
    - 返回 `AiRequestParams`（含 messages + maxTokens），不含 caller 字段（caller 由 orchestrator 设置，不是 handler 职责）
    - 返回的 messages 使用 `parseRfpPrompt()` 生成的内容
  - [ ] 14.5 `tests/unit/main/services/agent-orchestrator/agents/generate-agent.test.ts`：
    - 接收 chapterTitle + requirements 上下文
    - 返回 `AiRequestParams`（含 messages + maxTokens），不含 caller 字段
  - [ ] 14.6 `tests/unit/main/db/repositories/task-repo.test.ts`：
    - CRUD 完整生命周期
    - findAll 过滤条件组合
    - findPending 返回 pending + running 任务
    - 未找到任务抛出 NotFoundError
    - Mock Kysely 查询构建器
  - [ ] 14.7 `tests/unit/main/ipc/agent-handlers.test.ts`：
    - `agent:execute` / `agent:status` 两个通道正确派发到对应 service
    - 异常包装为 ApiResponse error 格式
    - 使用 `createIpcHandler` 工厂
  - [ ] 14.8 `tests/unit/main/ipc/task-handlers.test.ts`：
    - `task:list` / `task:cancel` 两个通道正确派发到对应 service
    - 异常包装为 ApiResponse error 格式
    - 使用 `createIpcHandler` 工厂
  - [ ] 14.9 补充既有 ai-proxy 测试（AC: 1, 2 前置改造）：
    - `tests/unit/main/services/ai-proxy/ai-proxy.test.ts` 断言 `signal` / `timeoutMs` 从 `AiProxyRequest` 传递到 Provider 调用
    - `tests/unit/main/services/ai-proxy/provider-adapter.test.ts` 断言 Anthropic/OpenAI SDK 调用接收 `signal` + `timeout`，且不再有硬编码 30 秒默认值（超时完全由上游传入）

- [ ] Task 15: 集成验证 (AC: 全部)
  - [ ] 15.1 `pnpm lint && pnpm typecheck && pnpm build` 全部通过
  - [ ] 15.2 IPC 类型完整性验证——新增通道在 IpcChannelMap、preload、handler 三处一致
  - [ ] 15.3 迁移 003 在全新数据库上正确执行
  - [ ] 15.4 冷启动时间仍 <5 秒（NFR1）

## Dev Notes

### 架构模式与约束

**本 Story 在架构中的位置：**
```
Renderer → IPC(agent-handlers.ts / task-handlers.ts) → agent-orchestrator(本 Story) → ai-proxy(Story 2.1) → Claude/OpenAI API
                                          ├── orchestrator.ts（编排核心：注册/执行/状态）
                                          ├── agents/parse-agent.ts（招标解析 Agent 骨架）
                                          ├── agents/generate-agent.ts（章节生成 Agent 骨架）
                                          └── index.ts（单例入口 + Alpha Agent 注册）

Renderer ←── IPC 事件推送(task:progress) ←── task-queue(本 Story)
                                                ├── queue.ts（任务生命周期管理）
                                                ├── progress-emitter.ts（IPC 进度推送）
                                                └── index.ts（单例入口）
```

**调用链路（含 signal 传播）：**
```
renderer.agentExecute(request)
  → IPC agent:execute
    → agentOrchestrator.execute(request)
      → taskQueue.enqueue({ category='ai-agent', agentType, input, priority }) => taskId
      → void taskQueue.execute(taskId, executor)     // AbortController 创建于此，后台执行
      → return { taskId }

后台执行链路：
taskQueue.execute(taskId, executor)
  → handler(context, { signal, updateProgress })          // handler 构建 AiRequestParams
  → aiProxy.call({ ...params, caller, signal, timeoutMs }) // signal + timeoutMs 传递到 ai-proxy
    → provider.chat(request, { signal, timeoutMs })        // signal + timeoutMs 传递到 Provider SDK HTTP 层
  → result 持久化到 tasks.output / AgentStatus.result

取消链路（反向）：
renderer.taskCancel(taskId) → IPC task:cancel → taskQueue.cancel(taskId)
  → abortController.abort() → signal 触发 → Provider SDK HTTP 请求中止 → handler Promise reject → executor catch → 检查 signal.aborted=true → task status='cancelled'（不重试）
```

**关键架构决策：**
- agent-orchestrator 不直接调用 SDK——所有 AI 调用必须经过 `aiProxy.call()`（架构强制规则 #1）
- task-queue 管理任务生命周期和状态持久化——orchestrator 委托 task-queue 执行实际任务，`execute()` 自身只负责入队并返回 `taskId`
- handler 只负责构建 AI 请求参数（messages/model/maxTokens），orchestrator 负责编排和 ai-proxy 调用
- Alpha 阶段无经验图谱注入——handler 直接返回 prompt；Beta 阶段在 orchestrator 层添加经验查询+注入
- 进度推送使用 `webContents.send()`（单向推送），不走 request-response IPC

**Retry 归属与 Abort 传播（BLOCKER 修正）：**

三层各自的职责明确分离，禁止嵌套重试：

| 层                     | 重试策略                                                                                     | 备注                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Provider Adapter**   | 指数退避重试 3 次（仅 retryable 错误：timeout/aborted/429/5xx）                              | 已有实现（`provider-adapter.ts` `withRetry`），本 Story 不修改     |
| **ai-proxy**           | 无额外重试——透传 Provider Adapter 的结果或异常                                               | 不变                                                               |
| **task-queue**         | **业务级**重试：executor 抛出非 retryable 错误（如 AGENT_EXECUTE）时，根据 `retryCount < maxRetries` 决定是否重新入队 | task-queue 重试的是整个 executor（含 handler + aiProxy.call），不是单个 HTTP 请求 |
| **Agent handler**      | **禁止重试**——handler 抛出异常，由 task-queue 决定是否重新执行                               | handler 只构建参数，不包含 try/catch 重试逻辑                      |

重试归类规则：
- **瞬态故障**（网络超时、429、5xx）→ Provider Adapter 层自动重试（3 次指数退避），对上层透明
- **Provider 重试耗尽后仍失败** → 抛 `AiProxyError` → task-queue 捕获 → 根据 `retryCount` 决定整体重新入队（整个 executor 重跑）或标记 `failed`
- **非瞬态故障**（401 认证、prompt 过大、handler 逻辑错误）→ Provider Adapter 不重试 → `AiProxyError` / `BidWiseError` 直接传播 → task-queue 标记 `failed`，不重试

Abort/Signal 传播链实现要求：
1. `AiProxyRequest` 新增 `signal?: AbortSignal`（Task 1.1b）
2. `AiProxyService.call()` 将 `request.signal` 传递给 `provider.chat()` 的 SDK 调用选项（如 Anthropic SDK 的 `{ signal }`, OpenAI SDK 的 `{ signal }`）
3. `AiProxyRequest` 新增 `timeoutMs?: number`，透传给 Provider SDK 的 `timeout` 参数；默认值 `900_000` 由 task-queue 在入队时设定，ai-proxy / provider-adapter 自身不设默认值（移除原硬编码 `30_000`）
4. `taskQueue.cancel()` → `abortController.abort()` → signal 传播到 Provider SDK → HTTP 请求中止
5. Cancel 与 Timeout 区分：task-queue 的 `execute()` 在 catch 中检查 `signal.aborted`——若为 `true`，标记任务状态为 `cancelled`（错误码 `TASK_CANCELLED`），不触发重试；若 `signal.aborted` 为 `false` 但错误类型为 `AI_PROXY_TIMEOUT`，则视为真实超时，按正常重试逻辑处理。Provider Adapter 层的 `AbortError` 仍分类为 `AI_PROXY_TIMEOUT`，cancel 语义由 task-queue 层根据 signal 状态覆盖判定

### 已有代码资产（禁止重复创建）

| 已有文件 | 内容 | Story |
|----------|------|-------|
| `src/main/services/ai-proxy/index.ts` | `aiProxy` 单例——`call(request)` 编排脱敏→调用→日志→还原 | 2.1 |
| `src/shared/ai-types.ts` | `AiProxyRequest`/`AiProxyResponse`/`AiChatMessage` 等类型（本 Story 扩展） | 2.1 |
| `src/shared/constants.ts` | `ErrorCode` 枚举（含 `AI_PROXY*` 系列，本 Story 扩展 AGENT/TASK 系列） | 1.1/2.1 |
| `src/main/utils/errors.ts` | `BidWiseError`/`AiProxyError` 错误体系（本 Story 扩展 TaskQueueError） | 1.1/2.1 |
| `src/main/utils/logger.ts` | `createLogger(module)` 工厂函数 | 1.1 |
| `src/main/ipc/create-handler.ts` | `createIpcHandler<C>()` 工厂（本 Story 用于注册 agent/task 通道） | 1.3 |
| `src/shared/ipc-types.ts` | `IpcChannelMap`/`PreloadApi`/`ApiResponse`（本 Story 扩展 4 个通道） | 1.3 |
| `src/main/db/client.ts` | `getDb()` 数据库连接 + CamelCasePlugin | 1.2 |
| `src/main/db/migrator.ts` | 内联迁移 Provider（本 Story 注册 003 迁移） | 1.2 |
| `src/main/db/schema.ts` | `DB` 接口（本 Story 扩展 `tasks` 表类型） | 1.2 |
| `src/main/db/repositories/project-repo.ts` | `v4 as uuidv4` from `uuid`（UUID 生成标准模式——本 Story 复用） | 1.2 |
| `src/main/index.ts` | `ensureDataDirectories()` + 启动流程（本 Story 在启动流程中加入 task 恢复） | 1.1 |
| `src/preload/index.ts` | contextBridge 暴露 IPC 方法（本 Story 扩展 4 个方法 + 1 个事件监听） | 1.3 |

**关键提醒：**
- `aiProxy.call()` 已包含完整的脱敏→调用→日志→还原流程——orchestrator **不需要**再实现脱敏/日志逻辑
- orchestrator 的 caller 字段（如 `parse-agent`）会传入 `aiProxy.call()`，ai-trace-logger 自动记录
- 本 Story 需扩展 `AiProxyService.call()` 以支持 `signal` 和 `timeoutMs` 字段传递到 Provider SDK 层（`provider.chat()` 的 SDK 调用选项）——这是 cancel 传播链的关键桥梁，且必须体现在正式 Task 中
- `createIpcHandler<C>()` 自动包装 try/catch → ApiResponse 格式——agent-handlers / task-handlers 直接使用
- DB 迁移必须注册到 `migrator.ts` 的 `migrations` 对象中（内联 Provider 模式）
- IPC 通道新增后必须同步更新 `IpcChannelMap`、`IPC_CHANNELS`、`preload/index.ts`、`preload/index.d.ts`，并在 `ipc/index.ts` 中扩展 `Registered*Channels` 穷举校验——编译器会强制检查

### task-queue 设计细节

**任务状态机：**
```
pending ──→ running ──→ completed
  │           │
  │           ├──→ failed（retryCount >= maxRetries）
  │           │
  │           └──→ cancelled（用户取消）
  │
  └──→ cancelled（入队后取消）
```

**断点恢复机制：**
- executor 在执行过程中可通过 `updateProgress(progress, message?)` 保存中间进度
- executor 也可将关键中间状态写入 `checkpoint` 字段（JSON 序列化）
- 应用崩溃重启后，`recoverPendingTasks()` 查找 status='running' 的任务，重置为 'pending'
- 重新执行时，executor 接收 `checkpoint` 参数，可从断点继续

**并发控制：**
- 使用简单的计数器 + 队列（Alpha 阶段不需要优先级队列）
- 默认最大并发 3，通过配置可调整
- 排队的任务在有空闲 slot 时自动执行

**进度推送协议：**
- 通道名称：`task:progress`（常量定义在 `IPC_CHANNELS`）
- 方向：主进程 → 渲染进程（单向 `webContents.send`，不走 `ipcMain.handle`）
- 渲染进程通过 `window.api.onTaskProgress(callback)` 监听
- `agent:execute` 不等待最终结果，仅返回 `{ taskId }`
- 节流：同一 taskId 200ms 内最多推送一次

### Provider 适配说明

**orchestrator 的 AI 调用通过 ai-proxy 统一处理，不直接接触 Provider SDK。**

Agent handler 返回的是通用 `AiChatMessage[]`，orchestrator 通过 `aiProxy.call()` 自动适配到正确的 Provider。

### Project Structure Notes

**新增文件预期：**
```
src/main/services/agent-orchestrator/
├── orchestrator.ts              ← 新建：Agent 编排核心（注册/执行/状态查询）
├── agents/
│   ├── parse-agent.ts           ← 新建：ParseAgent handler 骨架
│   └── generate-agent.ts        ← 新建：GenerateAgent handler 骨架
└── index.ts                     ← 新建：单例入口 + Alpha Agent 注册

src/main/services/task-queue/
├── queue.ts                     ← 新建：任务队列核心（入队/执行/取消/重试/恢复）
├── progress-emitter.ts          ← 新建：IPC 进度推送（节流）
└── index.ts                     ← 新建：单例入口

src/main/ipc/
├── agent-handlers.ts            ← 新建：registerAgentHandlers() + RegisteredAgentChannels
└── task-handlers.ts             ← 新建：registerTaskHandlers() + RegisteredTaskChannels

src/main/db/
├── migrations/
│   └── 003_create_tasks.ts      ← 新建：tasks 表迁移
└── repositories/
    └── task-repo.ts             ← 新建：任务数据访问层

src/main/prompts/
├── parse-rfp.prompt.ts          ← 新建：招标解析 prompt 占位
└── generate-chapter.prompt.ts   ← 新建：章节生成 prompt 占位

tests/unit/main/
├── services/task-queue/
│   ├── queue.test.ts            ← 新建
│   └── progress-emitter.test.ts ← 新建
├── services/agent-orchestrator/
│   ├── orchestrator.test.ts     ← 新建
│   └── agents/
│       ├── parse-agent.test.ts  ← 新建
│       └── generate-agent.test.ts ← 新建
├── db/repositories/
│   └── task-repo.test.ts        ← 新建
└── ipc/
    ├── agent-handlers.test.ts   ← 新建
    └── task-handlers.test.ts    ← 新建
```

**修改文件预期：**
- `src/shared/ai-types.ts` — 新增 Agent/Task 类型定义 + `AiProxyRequest` 扩展 `signal`/`timeoutMs` 字段
- `src/shared/constants.ts` — ErrorCode 枚举扩展 AGENT/TASK 错误码
- `src/shared/ipc-types.ts` — IPC 通道新增 4 个 + 1 个事件常量 + `IpcEventPayloadMap` 事件类型映射
- `src/main/services/ai-proxy/index.ts` — `call()` 将 `signal`/`timeoutMs` 传递给 `provider.chat()`
- `src/main/services/ai-proxy/provider-adapter.ts` — `AiProvider.chat()` 接口新增可选 `options?: { signal?: AbortSignal; timeoutMs?: number }` 参数，各 Provider 实现传递到 SDK 调用层
- `src/main/utils/errors.ts` — 新增 TaskQueueError（Agent 编排层直接使用 BidWiseError + 错误码）
- `src/main/db/schema.ts` — DB 接口新增 tasks 表
- `src/main/db/migrator.ts` — 注册 003 迁移
- `src/main/ipc/index.ts` — 显式调用 `registerAgentHandlers()` / `registerTaskHandlers()` 并扩展 RegisteredChannels 穷举校验
- `src/main/index.ts` — 启动流程加入 task 恢复
- `src/preload/index.ts` — 新增 4 个方法 + 1 个事件监听
- `src/preload/index.d.ts` — 类型声明同步

### 前序 Story 开发经验

**Story 2.1 关键经验（直接上游依赖）：**
- `aiProxy.call()` 当前接受 `AiProxyRequest { messages, model?, temperature?, maxTokens?, caller }`，本 Story 需扩展为支持 `signal?` / `timeoutMs?`
- caller 字段用于追溯日志——orchestrator 传入 `{agentType}-agent` 格式
- ai-proxy 的 Provider Adapter 层处理瞬态重试（指数退避 3 次）——orchestrator / handler **不需要**对 ai-proxy 调用做额外重试；task-queue 只做业务级整体重新入队
- ai-proxy 返回 `AiProxyResponse { content, usage, model, provider, latencyMs }`
- Provider 不可用时抛 `AiProxyError`——orchestrator catch 并转为 `BidWiseError`

**Story 1.3 关键经验（IPC 模式参考）：**
- `createIpcHandler<C>()` 自动包装 try/catch + ApiResponse，handler 只需返回数据或抛 BidWiseError
- IPC 通道新增流程：`IpcChannelMap` → `IPC_CHANNELS` → `preload/index.ts` → `preload/index.d.ts` → `registerXHandlers()` 实现 → `ipc/index.ts` 显式注册 + 穷举校验
- 编译器穷举检查保证通道一致性——遗漏任何一处会报编译错误

**Story 1.2 关键经验（DB 模式参考）：**
- 迁移文件 `up/down` 函数，`down` 用 `dropTable`
- `getDb()` 获取数据库连接（CamelCasePlugin 自动转换）
- Repository 方法全部 `async`，使用 Kysely 链式查询构建器
- UUID 生成：`import { v4 as uuidv4 } from 'uuid'`

**Story 1.1 关键经验（错误体系参考）：**
- 错误继承 `BidWiseError(code, message, cause?)`
- 自定义错误类设置 `this.name` 便于 instanceof 检查
- ErrorCode 枚举集中在 `src/shared/constants.ts`

### 测试规范

- **单元测试：** Vitest（Node.js 环境）
- **Mock 策略：**
  - `vi.mock('@main/services/ai-proxy')` — Mock aiProxy.call()
  - `vi.mock('@main/db/repositories/task-repo')` — Mock TaskRepository
  - `vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: vi.fn() } }))` — Mock 窗口列表
  - 测试之间 `beforeEach` 重置所有 mock
  - `vi.hoisted()` 处理 mock 初始化顺序
- **异步测试：** 使用 `vi.useFakeTimers()` 测试节流和超时
- **数据库测试：** Mock Kysely 查询构建器，不依赖真实 SQLite

### 反模式清单（禁止）

- ❌ orchestrator 直接调用 Provider SDK（必须经 `aiProxy.call()`）
- ❌ orchestrator 自行实现脱敏/还原/日志（ai-proxy 已包含完整流程）
- ❌ handler 内直接调用 `aiProxy.call()`（handler 只返回 `AiRequestParams`，orchestrator 调用 ai-proxy）
- ❌ handler 内实现 try/catch 重试逻辑（handler 抛出异常，重试由 task-queue 决策）
- ❌ task-queue 和 Provider Adapter 都对同一个 HTTP 失败做重试，形成嵌套重试循环
- ❌ 白名单操作（AI/OCR/导入/导出/Git同步/语义检索）绕过 task-queue 直接执行
- ❌ IPC handler 中写业务逻辑（handler 只做参数解析 → 调用 service → 包装结果）
- ❌ 调用 `aiProxy.call()` 时不传递 signal（取消无法中止 in-flight 请求）
- ❌ 渲染进程直接 import agent-orchestrator 或 task-queue（必须经 IPC）
- ❌ throw 裸字符串（使用 BidWiseError / TaskQueueError）
- ❌ 相对路径 import 超过 1 层（禁止 `../../`）
- ❌ 同步 I/O 操作阻塞主进程
- ❌ 手动 snake_case ↔ camelCase 转换（Kysely CamelCasePlugin 自动处理）
- ❌ task-queue 中使用 raw SQL（必须用 Kysely 查询构建器）
- ❌ 创建独立的 AI trace logger（复用 ai-proxy 内的 ai-trace-logger）
- ❌ 在 orchestrator 中实现经验图谱查询（Alpha 阶段不引入，Beta 扩展点已预留）
- ❌ Loading 状态使用 `isLoading`/`fetching`/`pending`（统一用 `loading: boolean`）

### 与后续 Story 的接口契约

**Story 2.3（招标文件导入与异步解析）将消费 orchestrator：**
```typescript
import { agentOrchestrator } from '@main/services/agent-orchestrator'
const { taskId } = await agentOrchestrator.execute({
  agentType: 'parse',
  context: { rfpContent: '...' },
  options: { timeoutMs: 900000 }  // 15 分钟，NFR2
})
const status = await agentOrchestrator.getAgentStatus(taskId)
```

**Story 3.4（AI 章节生成）将消费 orchestrator：**
```typescript
const { taskId } = await agentOrchestrator.execute({
  agentType: 'generate',
  context: { chapterTitle: '技术方案', requirements: '...' },
  options: { timeoutMs: 120000 }  // 2 分钟，NFR3
})
const status = await agentOrchestrator.getAgentStatus(taskId)
```

**Beta 阶段扩展——经验图谱注入（Story 10.x）：**
```typescript
// orchestrator.execute 内部扩展点（Beta）：
// 1. 查询经验图谱 → 获取相关经验
// 2. 注入经验上下文到 handler
// 3. Agent 执行后捕获经验
```

**渲染进程消费进度事件：**
```typescript
window.api.onTaskProgress((event: TaskProgressEvent) => {
  // 更新 UI 进度条
  taskStore.updateProgress(event.taskId, event.progress, event.message)
})
```

本 Story 需为这些消费者预留接口扩展性，但不提前实现。

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2 Agent 编排层与异步任务队列]
- [Source: _bmad-output/planning-artifacts/architecture.md#Agent 编排层设计原则]
- [Source: _bmad-output/planning-artifacts/architecture.md#异步任务白名单]
- [Source: _bmad-output/planning-artifacts/architecture.md#AI Agent 调用模式]
- [Source: _bmad-output/planning-artifacts/architecture.md#强制规则]
- [Source: _bmad-output/planning-artifacts/architecture.md#代码组织结构 agent-orchestrator/ task-queue/]
- [Source: _bmad-output/planning-artifacts/architecture.md#跨切面映射 异步任务管理]
- [Source: _bmad-output/planning-artifacts/architecture.md#通信架构 IPC handler agent:execute]
- [Source: _bmad-output/planning-artifacts/architecture.md#数据架构 Kysely 迁移策略]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR1 冷启动时间]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR2 解析时间+异步进度]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR15 AI 生成请求成功率]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR20 章节级容错]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR23 AI API 超时处理]
- [Source: _bmad-output/implementation-artifacts/story-2-1.md#与后续 Story 的接口契约]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### Change Log

- 2026-03-20 — Story 文件创建，包含完整 Agent 编排层与异步任务队列开发上下文

### File List
