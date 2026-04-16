---
title: 'Skill Engine - AI Agent 技能扩展引擎'
slug: 'skill-engine'
created: '2026-04-15'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'Node.js (Electron main)', 'Vitest', 'child_process']
files_to_modify:
  - 'src/shared/constants.ts'
  - 'src/shared/ai-types.ts'
  - 'src/main/services/skill-engine/types.ts'
  - 'src/main/services/skill-engine/skill-loader.ts'
  - 'src/main/services/skill-engine/skill-executor.ts'
  - 'src/main/services/skill-engine/index.ts'
  - 'src/main/services/agent-orchestrator/agents/skill-agent.ts'
  - 'src/main/services/agent-orchestrator/index.ts'
  - 'src/main/index.ts'
  - 'electron-builder.yml'
  - 'tests/unit/main/services/skill-engine/skill-loader.test.ts'
  - 'tests/unit/main/services/skill-engine/skill-executor.test.ts'
  - 'tests/unit/main/services/agent-orchestrator/agents/skill-agent.test.ts'
code_patterns:
  - 'AgentHandler: (context, {signal, updateProgress, aiProxy}) => Promise<AiRequestParams | AgentHandlerResult>'
  - 'Service singleton: export const fooService = new FooService()'
  - 'Error: BidWiseError(ErrorCode.XXX, message)'
  - 'Prompt: (context: T) => string 纯函数'
  - 'Abort: throwIfAborted(signal, message)'
  - 'Path resolution: app.getAppPath() for dev, process.resourcesPath for packaged'
test_patterns:
  - 'Vitest: describe/it/expect/vi.fn/vi.mock'
  - 'Mock electron, logger, task-queue, ai-proxy'
  - 'Test handler返回的messages结构'
  - 'Test错误场景用rejects.toThrow'
---

# Tech-Spec: Skill Engine - AI Agent 技能扩展引擎

**Created:** 2026-04-15

## Overview

### Problem Statement

BidWise 需要利用市场上丰富的第三方 skill（如 fireworks-tech-graph 等）来增强 AI agent 的能力，更好地生成图表、文字等内容。当前缺少 skill 加载和执行机制来消费这些 skill。

### Solution

构建精简 skill 引擎，兼容社区 SKILL.md 格式，让第三方 skill 能够被加载并通过 agent-orchestrator 执行，快速获得图表生成、文档写作等扩展能力。

### Scope

**In Scope:**
- SKILL.md frontmatter 解析（name、description、arguments、argument-hint、model、shell 等）
- 单固定目录（`src/main/skills/`）启动时扫描加载并缓存
- 参数替换（$ARGUMENTS、$0/$1、命名参数）
- 变量替换（${CLAUDE_SKILL_DIR}、${CLAUDE_SESSION_ID}）
- 内联 shell 命令执行（`` !`cmd` `` 和 ` ```! ``` ` 语法）+ 超时保护
- 统一 `skill` AgentHandler 集成到 agent-orchestrator
- 标准 AgentExecuteResult 输出
- Electron 打包配置（extraResources）

**Out of Scope:**
- 插件市场（marketplace）
- 权限控制（permissions）
- 沙盒（sandbox）
- 多级目录扫描（managed/user/project/add-dir）
- 动态发现（文件操作时的目录遍历）
- 条件激活（paths 字段）
- fork 子 agent 模式（context: fork）
- MCP skill
- Legacy commands 兼容（.claude/commands/）
- user-invocable / disable-model-invocation 可见性控制
- Skill 列表注入到 system-reminder

## Context for Development

### Codebase Patterns

1. **AgentHandler 签名**：`(context: Record<string, unknown>, options: { signal, updateProgress, aiProxy, setCheckpoint, checkpoint }) => Promise<AiRequestParams | AgentHandlerResult>`
2. **AiRequestParams 结构**：`{ messages: AiChatMessage[], model?, maxTokens?, temperature? }`，其中 `AiChatMessage = { role: 'system'|'user'|'assistant', content: string }`
3. **Agent 注册**：在 `agent-orchestrator/index.ts` 静态 import handler → `agentOrchestrator.registerAgent(type, handler, postProcessor?)`
4. **Service 单例**：`export const xxxService = new XxxService()` 或直接 export 实例
5. **错误处理**：`BidWiseError(ErrorCode.XXX, message, cause?)`，abort 检查用 `throwIfAborted(signal, msg)`
6. **Prompt 模式**：每个 `.prompt.ts` 导出 `interface XxxContext` + `function xxxPrompt(ctx): string` + `const XXX_SYSTEM_PROMPT`
7. **日志**：`const logger = createLogger('module-name')`
8. **Handler 直接返回结果**：复杂 agent（如 generate-agent）可以通过 `{ kind: 'result', value: AgentExecuteResult }` 跳过 orchestrator 的 aiProxy 调用
9. **路径解析**：开发环境用 `app.getAppPath()`（返回项目根目录），打包后用 `process.resourcesPath`（参见 `docx-bridge/process-manager.ts:28,33`、`writing-style-service.ts:64`）
10. **应用启动**：`src/main/index.ts` 在 `app.whenReady()` 中按顺序初始化：DB → migrations → agentOrchestrator（side-effect import）→ taskQueue.recoverPendingTasks → registerIpcHandlers → docxBridgeService.start
11. **aiProxy model 回退**：`aiProxy.call()` 内部有 `request.model ?? config.defaultModel ?? getDefaultModel(provider)` 回退链（见 `ai-proxy/index.ts:100`），frontmatter 不指定 model 时安全回退到配置默认值

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/main/services/agent-orchestrator/orchestrator.ts` | AgentHandler/AiRequestParams 类型定义，createExecutor 执行链 |
| `src/main/services/agent-orchestrator/index.ts` | Agent 注册模式参考 |
| `src/main/services/agent-orchestrator/agents/extract-agent.ts` | 最简洁的 handler 参考（单次调用模式） |
| `src/shared/ai-types.ts` | AgentType 联合类型、AiChatMessage、AgentExecuteResult |
| `src/shared/constants.ts` | ErrorCode 枚举 |
| `src/main/index.ts` | 应用启动顺序，skill 引擎初始化插入点 |
| `src/main/services/docx-bridge/process-manager.ts:22-35` | `app.getAppPath()` + `process.resourcesPath` 路径解析参考 |
| `src/main/services/writing-style-service.ts:64` | `app.getAppPath()` 资源路径参考 |
| `electron-builder.yml` | extraResources 配置参考 |
| `src/main/db/migrations/003_create_tasks.ts` | tasks 表 `agent_type` 为纯 `text` 列，无 CHECK 约束，无需 migration |
| `tests/unit/main/services/agent-orchestrator/orchestrator.test.ts` | 测试 mock 模式参考 |

### Technical Decisions

1. **Skill 与 Agent 关系**：注册一个统一的 `'skill'` AgentType，skill handler 内部按 skillName 路由到对应 SKILL.md，而非每个 skill 注册为独立 AgentHandler。
2. **Prompt 来源**：SKILL.md body 直接作为 prompt 内容，经变量替换和 shell 命令执行后组装为 AiRequestParams。现有 `.prompt.ts` 模式继续服务硬编码 agent，两套共存。
3. **Shell 命令执行**：整个 skill 执行链天然在 task-queue 内（通过 agent-orchestrator）。使用 `child_process.exec` 的回调形式（**不用 `promisify`**），捕获返回的 `ChildProcess` 引用。传入 `{ timeout: 30_000, maxBuffer: 1_048_576 }`。通过 `AbortSignal` 监听 abort 事件调用 `child.kill('SIGTERM')` 杀子进程。失败时用 `err.killed === true` 区分超时和普通错误。
4. **输出消费**：复用标准 AgentExecuteResult，renderer 可展示，也可作为其他 agent 的输入。
5. **跨平台**：不依赖 bash/python，skill 附带脚本推荐使用 Node.js。shell frontmatter 字段保留但不影响执行（统一走系统默认 shell）。
6. **Frontmatter 解析**：自行实现轻量 YAML frontmatter 解析器。支持单行 `key: value`、多行 `>-` 折叠标量（后续缩进行用空格连接，strip 尾部空白）、内联数组 `[a, b]`、空格分隔字符串。**不支持** YAML block array（`- item` 语法），`arguments` 字段统一使用空格分隔字符串（如 `arguments: $file $style`）或内联数组（如 `arguments: ['$file', '$style']`）。
7. **Skill 缓存**：`Map<string, ParsedSkill>` 内存缓存，启动时一次性加载，不做热更新。
8. **路径解析**：沿用 `docx-bridge/process-manager.ts` 模式 — 开发环境 `join(app.getAppPath(), 'src', 'main', 'skills')`，打包后 `join(process.resourcesPath, 'skills')`。使用 `@electron-toolkit/utils` 的 `is.dev` 判断环境（与 `src/main/index.ts:58` 一致）。
9. **System prompt 策略**：skill 的 system prompt 使用模板 `"你是一个专业的 AI 助手。以下是你的专业领域：\n\n{description}"` 当 description 非空时；description 为空时使用通用 system prompt `"你是一个专业的 AI 助手，请根据以下指令完成任务。"`。
10. **Model 字段**：frontmatter `model` 传递给 AiRequestParams。为 `undefined` 时 aiProxy 安全回退到 `config.defaultModel`（已验证 `ai-proxy/index.ts:100`）。Skill 作者应使用完整 model ID（如 `claude-sonnet-4-5`），不支持别名解析。
11. **参数替换顺序**（防二次替换）：① `${CLAUDE_SKILL_DIR}` / `${CLAUDE_SESSION_ID}` → ② 命名参数 `$file` / `$style` → ③ `$ARGUMENTS` / `$0` / `$1` → ④ shell 命令执行。
12. **位置参数索引**：`$0` = 第一个参数（0-based），`$1` = 第二个参数。`$ARGUMENTS[0]` 等价于 `$0`。命名参数和位置参数可以在同一 body 中共存，它们在不同替换阶段处理（命名在 ② 位置在 ③）。如 `arguments: ['$file']`，则 `$file` 和 `$0` 都指向第一个参数。
13. **sessionId 为空时**：`${CLAUDE_SESSION_ID}` 替换为空字符串，不产生 `"undefined"`。
14. **Skills 基础目录不存在时**：`loadAll()` 静默返回空 Map + warn 日志，不抛错。`initSkillEngine()` 契约：永不 reject，所有异常内部捕获并 warn 日志。
15. **重名 skill 检测**：frontmatter name 覆盖导致重名时，warn 日志，后者覆盖前者。
16. **Task 编译依赖**：Task 1（AgentType 扩展）是所有后续 Task（2-12）的编译前置。在 worktree 并行开发中，Task 1 必须先合入 main 或在 worktree 内先完成，否则 TypeScript 编译报错。

## Implementation Plan

### Tasks

- [x] Task 1: 新增 ErrorCode 和 AgentType
  - File: `src/shared/constants.ts`
  - Action: 在 `ErrorCode` 枚举末尾新增 `SKILL_NOT_FOUND = 'SKILL_NOT_FOUND'`、`SKILL_LOAD_FAILED = 'SKILL_LOAD_FAILED'`、`SKILL_EXECUTE_FAILED = 'SKILL_EXECUTE_FAILED'`
  - File: `src/shared/ai-types.ts`
  - Action: 在 `AgentType` 联合类型末尾追加 `| 'skill'`
  - Notes: tasks 表 `agent_type` 列为纯 `text`（无 CHECK 约束，见 migration 003），无需 DB migration

- [x] Task 2: 定义 Skill 类型
  - File: `src/main/services/skill-engine/types.ts`（新建）
  - Action: 定义以下接口：
    ```typescript
    /** SKILL.md frontmatter 解析结果 */
    export interface SkillFrontmatter {
      name: string                    // skill 名称（默认取目录名）
      description: string             // 一行描述（默认空字符串）
      arguments?: string[]            // 命名参数列表，如 ['$file', '$style']
      argumentHint?: string           // 参数提示，如 '[file] [style]'
      model?: string                  // 模型覆盖，须用完整 model ID
      shell?: 'bash' | 'powershell'   // shell 类型（保留字段）
      maxTokens?: number              // AI 最大 token 数
      temperature?: number            // AI 温度
    }

    /** 解析后的完整 skill */
    export interface ParsedSkill {
      name: string                    // skill 名称
      dirPath: string                 // skill 目录绝对路径
      frontmatter: SkillFrontmatter   // 解析后的 frontmatter
      body: string                    // SKILL.md body（frontmatter 之后的内容）
    }

    /** skill agent 执行上下文（通过 AgentExecuteRequest.context 传入） */
    export interface SkillExecuteContext {
      skillName: string               // 要执行的 skill 名称
      args?: string                   // 参数字符串
      userMessage?: string            // 用户附加消息
      sessionId?: string              // 会话 ID
    }
    ```

- [x] Task 3: 实现 Skill Loader
  - File: `src/main/services/skill-engine/skill-loader.ts`（新建）
  - Action: 实现 `SkillLoader` 类
  - 方法：`loadAll()`, `getSkill(name)`, `listSkills()`, `parseFrontmatter(content)`
  - 路径解析：`is.dev ? join(app.getAppPath(), 'src', 'main', 'skills') : join(process.resourcesPath, 'skills')`
  - Frontmatter 解析器：正则提取 `---` 块 → 逐行 `key: value` → 支持 `>-` 多行折叠 + 内联数组 `[a,b]` + 空格分隔字符串。不支持 YAML block array
  - 容错：目录不存在 → warn + 空返回；无 SKILL.md → warn + 跳过；解析失败 → warn + 跳过；重名 → warn + 后者覆盖

- [x] Task 4: 实现 Skill Executor
  - File: `src/main/services/skill-engine/skill-executor.ts`（新建）
  - Action: 实现 `SkillExecutor` 类，核心方法签名：
    ```typescript
    /** 展开 skill prompt：变量替换 → 命名参数 → 位置参数 → shell 执行 */
    async expandPrompt(skill: ParsedSkill, args?: string, sessionId?: string): Promise<string>

    /** 执行单条 shell 命令，返回 stdout 或错误描述字符串 */
    async executeShellCommand(command: string, cwd: string, signal?: AbortSignal): Promise<string>

    /** 组装 AiChatMessage 数组 */
    buildMessages(expandedPrompt: string, userMessage?: string, skill?: ParsedSkill): AiChatMessage[]
    ```
  - `expandPrompt` 替换顺序：① 变量替换 → ② 命名参数 → ③ 位置参数 → ④ 无占位符追加 → ⑤ shell 命令执行
  - `executeShellCommand` 实现（**使用回调形式捕获 ChildProcess 引用，不用 promisify**）：
    ```typescript
    async executeShellCommand(command: string, cwd: string, signal?: AbortSignal): Promise<string> {
      return new Promise((resolve) => {
        const child = exec(
          command,
          { cwd, timeout: 30_000, maxBuffer: 1_048_576 },
          (err, stdout) => {
            if (err) {
              resolve(err.killed
                ? '[Shell error: Command timed out after 30000ms]'
                : `[Shell error: ${err.message}]`)
              return
            }
            resolve(stdout.trim())
          }
        )
        if (signal) {
          const onAbort = (): void => { child.kill('SIGTERM') }
          signal.addEventListener('abort', onAbort, { once: true })
          child.on('exit', () => signal.removeEventListener('abort', onAbort))
        }
      })
    }
    ```
  - `buildMessages`：description 非空 → 模板 system prompt；空 → 通用 system prompt。user 消息 = expandedPrompt + 可选 userMessage
  - 参数分词正则：`/[^\s"']+|"([^"]*)"|'([^']*)'/g`
  - Shell 正则（TypeScript 字符串字面量）：
    - 代码块：`const BLOCK_PATTERN = /```!\s*\n?([\s\S]*?)\n?```/g`
    - 内联：`const INLINE_PATTERN = /(?<=^|\s)!`([^`]+)`/gm`
    - 预过滤：仅当 `body.includes('!`') || body.includes('```!')` 时扫描（两种语法都检查，避免遗漏代码块语法）

- [x] Task 5: 实现 Skill Engine 入口 + initSkillEngine
  - File: `src/main/services/skill-engine/index.ts`（新建）
  - Action: 导出 `skillLoader`、`skillExecutor` 单例 + `initSkillEngine()` 异步函数（调用 `skillLoader.loadAll()` + 日志输出加载数量）

- [x] Task 6: 实现 Skill AgentHandler
  - File: `src/main/services/agent-orchestrator/agents/skill-agent.ts`（新建）
  - Action: 实现 `skillAgentHandler`，流程：提取 context → throwIfAborted → getSkill（抛 SKILL_NOT_FOUND）→ expandPrompt → throwIfAborted → buildMessages → 返回 AiRequestParams
  - 默认值：maxTokens = `frontmatter.maxTokens ?? 8192`，temperature = `frontmatter.temperature ?? 0.3`

- [x] Task 7: 注册 Skill Agent
  - File: `src/main/services/agent-orchestrator/index.ts`
  - Action:
    1. 在现有 import 块末尾（`import { attackChecklistAgentHandler }` 之后）添加：`import { skillAgentHandler } from './agents/skill-agent'`
    2. 在现有注册列表末尾（`agentOrchestrator.registerAgent('attack-checklist', ...)` 之后）添加：`agentOrchestrator.registerAgent('skill', skillAgentHandler)`

- [x] Task 8: 应用启动时初始化 Skill Engine
  - File: `src/main/index.ts`
  - Action: 在 `app.whenReady()` 内，`void agentOrchestrator`（第 79 行）之后、`await taskQueue.recoverPendingTasks()`（第 80 行）**之前**添加：
    ```typescript
    import { initSkillEngine } from '@main/services/skill-engine'
    // ...在 app.whenReady() 内：
    void agentOrchestrator
    await initSkillEngine()   // 必须在 recoverPendingTasks 之前，避免恢复的 skill 任务找不到缓存
    await taskQueue.recoverPendingTasks()
    ```
  - Notes: 使用 `await`（非 `void`），因为 `initSkillEngine` 契约为永不 reject（内部 try/catch + warn），且必须在 `recoverPendingTasks` 之前完成以避免竞态——恢复的 `'skill'` 任务需要 skill 缓存已加载

- [x] Task 9: 创建 skills 目录 + 配置 electron-builder extraResources
  - File: `src/main/skills/.gitkeep`（新建空文件，确保目录存在于 git 仓库中）
  - File: `electron-builder.yml`
  - Action: 在 `extraResources` 数组末尾新增：
    ```yaml
    # Ship skills as Resources/skills/ so SKILL.md and scripts are available at runtime
    - from: src/main/skills/
      to: skills/
      filter:
        - '**/*'
        - '!**/*.test.*'
        - '!.gitkeep'
    ```

- [x] Task 10: 编写 skill-loader 单元测试
  - File: `tests/unit/main/services/skill-engine/skill-loader.test.ts`（新建）
  - 12 个用例：frontmatter 解析（单行/多行 `>-`/内联数组/空格分隔/无 frontmatter）、目录扫描（正常/无 SKILL.md/目录不存在/重名）、缓存读取
  - Mock：`fs/promises`、`electron` (`app.getAppPath()`)、`@electron-toolkit/utils` (`is.dev`)

- [x] Task 11: 编写 skill-executor 单元测试
  - File: `tests/unit/main/services/skill-engine/skill-executor.test.ts`（新建）
  - 15 个用例：替换顺序验证、各类参数替换、shell 执行/失败/超时/abort、消息组装（有/无 description、有/无 userMessage）
  - Mock：`child_process.exec`

- [x] Task 12: 编写 skill-agent 单元测试
  - File: `tests/unit/main/services/agent-orchestrator/agents/skill-agent.test.ts`（新建）
  - 6 个用例：正常调用、SKILL_NOT_FOUND、abort、frontmatter 参数传递、model undefined 回退、maxTokens/temperature 默认值
  - Mock：`skill-engine`（skillLoader、skillExecutor）

### Acceptance Criteria

- [x] AC 1: Given `src/main/skills/test-skill/SKILL.md` 存在且包含有效 frontmatter，when 调用 `skillLoader.loadAll()`，then `skillLoader.getSkill('test-skill')` 返回正确解析的 `ParsedSkill`（name、dirPath、frontmatter 字段、body 内容）
- [x] AC 2: Given 一个 ParsedSkill 的 body 包含 `$ARGUMENTS`、`$0`、`${CLAUDE_SKILL_DIR}`，when 调用 `skillExecutor.expandPrompt(skill, 'arch style-1')`，then `$ARGUMENTS` → `'arch style-1'`，`$0` → `'arch'`，`${CLAUDE_SKILL_DIR}` → skill 绝对目录路径
- [x] AC 3: Given frontmatter `arguments: ['$file', '$style']`，body 含 `$file` 和 `$style`，when 调用 `expandPrompt(skill, 'arch style-1')`，then `$file` → `'arch'`，`$style` → `'style-1'`
- [x] AC 4: Given body 包含 `` !`echo hello` ``，when 调用 `expandPrompt`，then 该模式被替换为 `'hello'`
- [x] AC 5: Given body 包含一个会超时的 shell 命令，when 调用 `expandPrompt`，then 该位置替换为 `'[Shell error: Command timed out after 30000ms]'` 且不阻断后续处理
- [x] AC 6: Given `context = { skillName: 'test-skill', args: 'my-arg' }`，when 直接调用 `skillAgentHandler(context, options)`，then 返回的 `AiRequestParams.messages` 包含正确 system + user 消息，`model`/`maxTokens`/`temperature` 正确
- [x] AC 7: Given `context = { skillName: 'nonexistent' }`，when 调用 `skillAgentHandler`，then 抛出 `BidWiseError(SKILL_NOT_FOUND)`
- [x] AC 8: Given skills 目录下有 3 个子目录（1 个缺少 SKILL.md），when `loadAll()`，then 加载 2 个 skill + warn 日志，不抛错
- [x] AC 9: Given frontmatter `model: 'claude-sonnet-4-5'` + `maxTokens: 16384`，when 调用 handler，then `AiRequestParams.model` = `'claude-sonnet-4-5'`，`maxTokens` = `16384`
- [x] AC 10: Given skills 基础目录不存在，when `loadAll()`，then 不抛错 + warn 日志 + `listSkills()` 返回空数组

## Additional Context

### Dependencies

- 无新增 npm 依赖
- 使用 Node.js 内置 `child_process.exec`、`fs/promises`、`path`
- 复用项目现有：`BidWiseError`、`createLogger`、`throwIfAborted`、`isAbortError`
- 使用 `@electron-toolkit/utils` 的 `is.dev` 判断环境（已有依赖）
- 使用 Electron `app.getAppPath()` 和 `process.resourcesPath`

### Testing Strategy

**单元测试（Vitest）：**
- `skill-loader.test.ts`：12 个用例
- `skill-executor.test.ts`：15 个用例
- `skill-agent.test.ts`：6 个用例
- 总计 33 个用例

**手动测试：**
1. 在 `src/main/skills/` 下创建测试 skill（纯 prompt），通过 IPC `agent:execute { agentType: 'skill', context: { skillName: 'test' } }` 验证端到端
2. 创建含 `` !`node -e "console.log('ok')"` `` 的 skill，验证 shell 命令执行

### Notes

- 首个目标 skill：fireworks-tech-graph（需 Node.js 重写其 bash/python 脚本，属于后续独立任务）
- extract-agent.ts（95 行）是 handler 模式参考 — skill-agent 应保持类似简洁度
- 现有 IPC 通道 `agent:execute` 接受 `AgentExecuteRequest { agentType, context }`，新增 `'skill'` 到 AgentType 后天然可用，无需新建 IPC handler
- 未来扩展点：可增加 `skill:list` IPC handler 让 renderer 展示可用 skill 列表
- tasks 表 `agent_type` 为纯 `text`（无 CHECK 约束），无需 DB migration

### Adversarial Review Findings — Disposition

**第一轮（F1-F20）：**

| Finding | 处置 |
|---------|------|
| F1 (Critical) SQLite migration | **降级为 Note** — 已验证 `agent_type` 是纯 `text` 列，无约束 |
| F2 (Critical) initSkillEngine 未接入启动 | **已修复** — Task 8 修改 `src/main/index.ts` |
| F3 (Critical) 路径解析错误 | **已修复** — TD 8 明确 `is.dev` + `app.getAppPath()`；Task 9 配置 extraResources |
| F4 (Critical) Shell 命令注入 + AbortSignal | **已修复** — Task 4 明确回调形式 + child.kill() |
| F5 (High) System prompt 太弱 | **已修复** — TD 9 定义模板 |
| F6 (High) model undefined | **已修复** — TD 10 + Pattern 11 明确 aiProxy 回退链 |
| F7 (High) YAML array 解析 | **已修复** — TD 6 不支持 block array |
| F8 (High) 命名参数未覆盖 AC | **已修复** — AC 3 覆盖命名参数 |
| F9 (High) initSkillEngine 架构违规 | **已修复** — 移到 skill-engine/index.ts |
| F10 (High) AC 5 不可测 | **已修复** — AC 6 直接调用 handler |
| F11-F20 | 全部已修复 |

**第二轮（F21-F32）：**

| Finding | 处置 |
|---------|------|
| F21 (Critical) exec + AbortSignal: promisify 导致 child 引用丢失 | **已修复** — Task 4 明确使用回调形式，提供完整代码模板 |
| F22 (High) Task 1 编译依赖未显式声明 | **已修复** — TD 16 明确 Task 1 是所有后续 Task 的编译前置 |
| F23 (High) 正则 backtick 渲染歧义 | **已修复** — Task 4 提供 TypeScript 变量名形式的正则定义 |
| F24 (High) maxBuffer 单位歧义 | **已修复** — Task 4 代码模板中使用精确值 `1_048_576` |
| F25 (High) initSkillEngine 与 recoverPendingTasks 竞态 | **已修复** — Task 8 改为 `await initSkillEngine()` 置于 recoverPendingTasks 之前 |
| F26 (High) Task 2 无类型定义 | **已修复** — Task 2 内联完整 TypeScript interface 定义 |
| F27 (Medium) $0 索引基础未定义 | **已修复** — TD 12 定义 0-based + 命名/位置可共存 |
| F28 (Medium) Shell 预过滤漏掉代码块语法 | **已修复** — Task 4 预过滤改为检查两种子串 |
| F29 (Medium) initSkillEngine 永不 reject 契约 | **已修复** — TD 14 明确契约 |
| F30 (Medium) expandPrompt 签名缺失 | **已修复** — Task 4 提供完整方法签名 |
| F31 (Low) skills 目录未创建 | **已修复** — Task 9 创建 `.gitkeep` |
| F32 (Low) Task 7 插入位置不明 | **已修复** — Task 7 指定具体行位置 |
