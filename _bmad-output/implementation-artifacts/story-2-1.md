# Story 2.1: [Enabler] AI 脱敏代理层与多 Provider 适配

Status: ready-for-dev

## Story

As a 开发者,
I want 所有 AI 调用经过统一的脱敏代理层并支持多 Provider 切换,
So that 敏感数据永不泄露到云端，且不被单一 API 供应商锁定。

## Acceptance Criteria

### AC1: 正则脱敏——敏感字段自动替换

- **Given** AI 调用请求发出
- **When** 请求经过 ai-proxy 服务
- **Then** 敏感字段（公司名/客户名/金额/技术参数）被正则规则自动替换为占位符（Alpha 仅正则基线，NER 模型 Beta 增强），敏感数据泄露事件为零
- [Source: epics.md Story 2.1 AC1, NFR10, NFR11]

### AC2: 响应还原——占位符自动恢复

- **Given** AI 返回响应
- **When** 响应经过 ai-proxy 还原
- **Then** 占位符被自动还原为原始敏感内容，脱敏前后映射表本地持久化（运行时内存 Map + 文件落盘，持久化为必选——epics.md 和 architecture.md 均要求"映射表本地持久化"）
- [Source: epics.md Story 2.1 AC2, architecture.md AI 脱敏代理层]

### AC3: 多 Provider 适配——Claude/OpenAI 无缝切换

- **Given** provider-adapter 已配置
- **When** 切换 Claude → OpenAI（或反向）
- **Then** 业务代码无需修改，adapter 自动适配 API 格式差异（消息格式、角色映射、token 计数）
- [Source: epics.md Story 2.1 AC3, NFR22]

### AC4: 超时重试与优雅降级

- **Given** API 调用超时
- **When** 超过 30 秒无响应
- **Then** 自动重试最多 3 次（指数退避），3 次失败后返回 `AiProxyError` 优雅降级错误
- [Source: epics.md Story 2.1 AC4, NFR23]

### AC5: AI 调用链日志

- **Given** 任何 AI 调用完成（成功或失败）
- **When** 追溯日志
- **Then** 记录脱敏后输入（完整 messages JSON）、AI 输出结果（完整 response content）、耗时、token 消耗、Provider 标识、调用者身份，日志写入 `data/logs/ai-trace/`；日志中**永不出现**未脱敏原文
- [Source: epics.md Story 2.2 AC4 前置, architecture.md AI 调用链可追溯]

## Tasks / Subtasks

- [ ] Task 1: 新增依赖 (AC: 3)
  - [ ] 1.1 安装 `@anthropic-ai/sdk`（Claude API 客户端）
  - [ ] 1.2 安装 `openai`（OpenAI API 客户端）
  - [ ] 1.3 验证两者与 Electron 41.x + Node.js 环境兼容（纯 HTTP 客户端，无 native module）

- [ ] Task 2: 脱敏服务 desensitizer.ts (AC: 1, 2)
  - [ ] 2.1 创建 `src/main/services/ai-proxy/desensitizer.ts`
  - [ ] 2.2 实现 `Desensitizer` 类：`desensitize(messages: AiChatMessage[]): Promise<DesensitizeResult>` 和 `restore(content: string, mappingId: string): Promise<string>`；desensitize 遍历 messages 数组中每条消息的 `content` 字段逐一应用正则规则，所有消息共享同一个 mappingId 和占位符计数器（确保跨消息占位符全局唯一递增）；restore 处理 AI 返回的单条 content 字符串；两方法均为 async 以对齐 mapping-store 的异步持久化
  - [ ] 2.3 Alpha 正则规则集（至少覆盖）：公司名/组织名模式、客户名/人名模式、金额（含¥/$和中文大写）、合同号/项目编号、电话号码、邮箱地址、技术参数（如 IP 地址、版本号带具体数值的模式）
  - [ ] 2.4 占位符格式：`{{ENTITY_TYPE_N}}`（如 `{{COMPANY_1}}`、`{{AMOUNT_3}}`），保证可逆且不与正常文本冲突
  - [ ] 2.5 脱敏映射表结构：`Map<mappingId, Map<placeholder, originalValue>>`，mappingId 使用 `v4 as uuidv4` from `uuid`（复用 project-repo.ts 已有模式，禁止另起 UUID 方案）
  - [ ] 2.6 映射表运行时内存持有 + 文件持久化（写入 `data/desensitize-mappings/` 目录，JSON 格式，以 mappingId 为文件名）；调用完成（还原后）自动清理内存条目和磁盘文件，避免泄漏
  - [ ] 2.7 导出 `DesensitizeResult` 类型：`{ messages: AiChatMessage[]; mappingId: string; stats: { totalReplacements: number; byType: Record<string, number> } }`（`messages` 为脱敏后的完整消息数组，结构与输入一致但 content 中敏感字段已替换为占位符）
  - [ ] 2.8 持久化 mapping store：`src/main/services/ai-proxy/mapping-store.ts`——`save(mappingId, mapping)` / `load(mappingId)` / `remove(mappingId)`，使用 `fs.promises`（异步 I/O），目录由 `ensureDataDirectories()`（`src/main/index.ts:15-23`）在启动时统一创建

- [ ] Task 3: Provider 适配层 provider-adapter.ts (AC: 3, 4)
  - [ ] 3.1 创建 `src/main/services/ai-proxy/provider-adapter.ts`
  - [ ] 3.2 定义 `AiProvider` 接口：`chat(request: AiChatRequest): Promise<AiChatResponse>`
  - [ ] 3.3 定义统一请求/响应类型 `AiChatRequest`（messages, model, temperature, maxTokens）和 `AiChatResponse`（content, usage: { promptTokens, completionTokens }, model, finishReason）
  - [ ] 3.4 实现 `ClaudeProvider`：将统一格式转换为 Anthropic Messages API 格式（role 映射、system message 提取、response 转换）
  - [ ] 3.5 实现 `OpenAiProvider`：将统一格式转换为 OpenAI Chat Completions API 格式
  - [ ] 3.6 实现 `createProvider(config: ProviderConfig): AiProvider` 工厂函数，根据 config.provider 返回对应实例
  - [ ] 3.7 超时处理：每个 Provider 内置 AbortController，30 秒超时
  - [ ] 3.8 重试逻辑：指数退避（1s → 2s → 4s），最多 3 次，仅对可重试错误（timeout、5xx、rate limit）重试

- [ ] Task 4: AI Proxy 服务入口 index.ts (AC: 1, 2, 3, 4, 5)
  - [ ] 4.1 创建 `src/main/services/ai-proxy/index.ts`，导出 `aiProxy` 单例
  - [ ] 4.2 实现 `aiProxy.call(request: AiProxyRequest): Promise<AiProxyResponse>` 核心方法，编排完整流程：脱敏 → Provider 调用 → **日志（脱敏后输入 + 输出）** → 还原 → 返回（日志必须在还原之前，确保永不记录原文）
  - [ ] 4.3 `AiProxyRequest` 类型：`{ messages, model?, temperature?, maxTokens?, caller: string }`（caller 为调用者身份标识，如 'parse-agent'）
  - [ ] 4.4 `AiProxyResponse` 类型：`{ content: string, usage: TokenUsage, model: string, provider: string, latencyMs: number }`
  - [ ] 4.5 aiProxy 初始化时通过 `src/main/config/app-config.ts` 统一读取 Provider 配置（禁止在 ai-proxy/index.ts 中直接读取环境变量或自行实现配置加载）；Alpha 阶段在 app-config.ts 中新增 `getAiProxyConfig(): AiProxyConfig`，底层从本地 AES-256 加密配置文件读取（架构决策 D3b：加密密钥派生自机器标识，跨机器不可解密）；加密配置文件路径 `data/config/ai-provider.enc`，由 Story 9.2 管理员向导写入，Alpha 阶段提供 `setupAiConfig()` CLI 辅助函数引导首次配置写入
  - [ ] 4.6 配置类型 `AiProxyConfig`：`{ provider: 'claude' | 'openai', anthropicApiKey?, openaiApiKey?, defaultModel?, desensitizeEnabled: boolean }`（类型定义在 `src/shared/ai-types.ts`，配置读取在 `app-config.ts`）；`getAiProxyConfig()` 负责读取并解密 `data/config/ai-provider.enc`，返回明文 config 对象，ai-proxy 仅消费解密后的配置；加密/解密工具函数放在 `src/main/config/crypto-config.ts`（AES-256-CBC，密钥派生使用 Node.js `crypto.scryptSync` + 机器标识作为 salt）

- [ ] Task 5: AI 调用链日志 (AC: 5)
  - [ ] 5.1 创建 `src/main/services/ai-proxy/ai-trace-logger.ts`
  - [ ] 5.2 实现 `AiTraceLogger`：每次调用追加写入 JSONL 文件到 `data/logs/ai-trace/YYYY-MM-DD.jsonl`
  - [ ] 5.3 日志条目结构：`{ timestamp, caller, provider, model, desensitizedInput: messages[], outputContent: string | null, inputTokens, outputTokens, latencyMs, status: 'success'|'error', errorCode?, errorMessage?, desensitizeStats }`；成功时 `outputContent` 为 AI 返回的原始 content（脱敏态）；失败时：若 Provider 已返回部分响应则记录该内容，若请求在 Provider 响应前失败（如脱敏阶段错误、网络不可达、配置缺失）则 `outputContent` 为 `null`，`errorCode` 和 `errorMessage` 记录失败原因；`inputTokens`/`outputTokens` 在无 Provider 响应时为 0
  - [ ] 5.4 `desensitizedInput` 记录脱敏后的完整 messages，`outputContent` 记录 AI 原始返回内容（此时尚未还原，内容本身不含敏感数据），失败且无 Provider 响应时为 `null`——永不记录还原后的原文
  - [ ] 5.5 日志目录由 `ensureDataDirectories()`（`src/main/index.ts:15-23`）在应用启动时统一创建（该函数已包含 `logs/ai-trace`），ai-trace-logger 不得自行 `mkdirSync`；若运行时需防御性检查，使用 `fs.promises.mkdir` 异步操作
  - [ ] 5.6 使用已有 `createLogger('ai-proxy')` 做运行时 console 日志

- [ ] Task 6: 错误类型扩展 (AC: 4)
  - [ ] 6.1 在 `src/main/utils/errors.ts` 新增 `AiProxyError extends BidWiseError`（使用已有 `ErrorCode.AI_PROXY`）
  - [ ] 6.2 区分错误子类型：`AI_PROXY_TIMEOUT`、`AI_PROXY_RATE_LIMIT`、`AI_PROXY_AUTH`、`AI_PROXY_PROVIDER`
  - [ ] 6.3 在 `src/shared/constants.ts` 的 `ErrorCode` 枚举中补充 AI 代理层细粒度错误码

- [ ] Task 7: 共享类型导出 (AC: 3)
  - [ ] 7.1 创建 `src/shared/ai-types.ts`：导出 `AiChatRequest`、`AiChatResponse`、`AiProxyRequest`、`AiProxyResponse`、`ProviderConfig`、`TokenUsage` 类型
  - [ ] 7.2 类型设计需为 Story 2.2（agent-orchestrator）预留扩展点：orchestrator 将在 `AiProxyRequest` 基础上包装 `AgentExecuteRequest`

- [ ] Task 8: 单元测试 (AC: 全部)
  - [ ] 8.1 `tests/unit/main/services/ai-proxy/desensitizer.test.ts`：
    - 公司名/金额/电话/邮箱/合同号等正则覆盖
    - 多种敏感字段混合脱敏 + 完整还原
    - 空文本/无敏感信息文本不变
    - 映射表生命周期：创建→还原→清理
    - 占位符不与正常文本冲突
  - [ ] 8.2 `tests/unit/main/services/ai-proxy/provider-adapter.test.ts`：
    - Claude Provider：请求格式转换、system message 提取、response 映射
    - OpenAI Provider：请求格式转换、response 映射
    - 工厂函数根据 config 返回正确 Provider
    - Mock SDK 客户端（`vi.mock('@anthropic-ai/sdk')` / `vi.mock('openai')`）
    - Provider 选择逻辑：无效 provider 名称抛出 AiProxyError、缺少对应 API Key 时报错
  - [ ] 8.3 `tests/unit/main/services/ai-proxy/ai-proxy.test.ts`：
    - 完整流程：脱敏 → 调用 → **日志（验证 desensitizedInput 和 outputContent 字段存在）** → 还原 → 返回
    - 验证日志记录发生在 restore 之前（spy 调用顺序断言）
    - 超时重试 3 次后返回 AiProxyError
    - 可重试错误（timeout、5xx、429）触发重试
    - 不可重试错误（401/403、400）立即抛出 AiProxyError，不重试
    - Provider 切换不影响业务逻辑
    - desensitizeEnabled=false 时跳过脱敏
    - AiProxyError 错误码映射验证：timeout→AI_PROXY_TIMEOUT、rate limit→AI_PROXY_RATE_LIMIT、auth failure→AI_PROXY_AUTH、provider error→AI_PROXY_PROVIDER
    - 请求在 Provider 响应前失败时日志 outputContent 为 null
  - [ ] 8.4 `tests/unit/main/services/ai-proxy/ai-trace-logger.test.ts`：
    - JSONL 文件写入格式验证（含 desensitizedInput 和 outputContent 字段）
    - 不自行创建目录（依赖 ensureDataDirectories）
    - 不记录未脱敏原文
  - [ ] 8.5 `tests/unit/main/services/ai-proxy/mapping-store.test.ts`：
    - save/load/remove 完整生命周期
    - 使用 `fs.promises`（异步 I/O）
    - 并发写入安全性
  - [ ] 8.6 `tests/unit/main/config/app-config.test.ts`：
    - getAiProxyConfig() 正常解密并返回完整 AiProxyConfig 对象
    - 加密配置文件不存在时抛出 AiProxyError 并附带引导信息
    - 配置文件损坏或解密失败时的错误处理
    - 配置缺少必填字段（如 provider）时的校验

- [ ] Task 9: ensureDataDirectories 异步化 + 补充 desensitize-mappings 目录 (AC: 2)
  - [ ] 9.1 将 `src/main/index.ts` 中 `ensureDataDirectories()` 的 `mkdirSync` 调用全部替换为 `await fs.promises.mkdir(path, { recursive: true })`，函数签名改为 `async ensureDataDirectories(): Promise<void>`，调用处使用 `await`
  - [ ] 9.2 在 `ensureDataDirectories()` 的子目录列表中新增 `desensitize-mappings` 和 `config`（确保 `data/desensitize-mappings/` 和 `data/config/` 目录在应用启动时创建）
  - [ ] 9.3 验证所有调用 `ensureDataDirectories()` 的位置已适配 async/await（避免目录尚未创建就被后续代码使用）

- [ ] Task 10: 集成验证 (AC: 全部)
  - [ ] 10.1 验证 `pnpm lint && pnpm typecheck && pnpm build` 全部通过
  - [ ] 10.2 验证新增依赖不影响 Electron 打包（无 native module 冲突）
  - [ ] 10.3 验证冷启动时间仍 <5 秒

## Dev Notes

### 架构模式与约束

**本 Story 在架构中的位置：**
```
Renderer → IPC → agent-orchestrator(Story 2.2) → ai-proxy(本 Story) → Claude/OpenAI API
                                                    ├── desensitizer.ts（脱敏/还原）
                                                    ├── provider-adapter.ts（双 Provider 适配）
                                                    ├── ai-trace-logger.ts（调用链日志）
                                                    └── index.ts（编排入口）
```

- ai-proxy 是内部服务，**不直接暴露 IPC 通道**——由 agent-orchestrator（Story 2.2）消费
- 本 Story 不涉及渲染进程、UI、IPC handler，纯主进程 service 层
- 架构强制规则：所有 AI 调用经过 agent-orchestrator → ai-proxy，禁止绕过

**核心编排流程（aiProxy.call）：**
```
收到请求 → desensitize(messages) → provider.chat(desensitizedRequest) → traceLog(desensitizedInput, output) → restore(response) → return
                                         ↑ 超时/错误 → retry(指数退避) → 3次失败 → AiProxyError
```

**⚠️ 安全关键：日志记录必须在 restore 之前执行。** 这确保日志中只有脱敏后的内容。还原仅发生在返回给调用方的最后一步。

### 已有代码资产（禁止重复创建）

| 已有文件 | 内容 | Story |
|----------|------|-------|
| `src/main/utils/errors.ts` | BidWiseError / ValidationError / NotFoundError / DatabaseError | 1.1 |
| `src/shared/constants.ts` | ErrorCode 枚举（已含 `AI_PROXY`） | 1.1 |
| `src/main/utils/logger.ts` | `createLogger(module)` 工厂函数 | 1.1 |
| `src/main/config/app-config.ts` | 应用配置统一入口（本 Story 需扩展 AI 配置读取） | 1.1 |
| `src/main/index.ts:15-23` | `ensureDataDirectories()` 启动时创建 `data/logs/ai-trace` 等目录 | 1.1 |
| `src/main/db/repositories/project-repo.ts` | `v4 as uuidv4` from `uuid`（UUID 生成标准模式） | 1.2 |
| `src/main/ipc/create-handler.ts` | `createIpcHandler` 工厂（本 Story 不直接使用） | 1.3 |
| `src/shared/ipc-types.ts` | ApiResponse / IpcChannelMap / PreloadApi（本 Story 不扩展） | 1.3 |

**关键提醒：**
- `ErrorCode.AI_PROXY` 已存在于 `constants.ts`，直接复用
- `createLogger('ai-proxy')` 用于运行时 console 日志
- 本 Story 不新增 IPC 通道——IPC 扩展由 Story 2.2（agent-orchestrator + agent-handlers.ts）负责
- 不要创建 `src/main/ipc/ai-proxy-handlers.ts`
- `ensureDataDirectories()` 已在启动时创建 `data/logs/ai-trace` 和其他子目录——禁止在 ai-proxy 中重复创建
- UUID 生成统一使用 `import { v4 as uuidv4 } from 'uuid'`（参照 project-repo.ts）
- Provider 配置读取必须通过 `app-config.ts` 集中管理，ai-proxy 仅消费配置对象

### 脱敏规则设计（Alpha 正则基线）

**占位符格式规范：** `{{ENTITY_TYPE_N}}`

| 实体类型 | 正则模式示例 | 占位符示例 |
|---------|-------------|-----------|
| COMPANY | 公司名后缀（有限公司/集团/股份等）+ 前方 2-10 个中文字 | `{{COMPANY_1}}` |
| PERSON | 中文姓名（2-4 字，常见姓氏开头） | `{{PERSON_1}}` |
| AMOUNT | ¥/$/￥ + 数字 + 万/亿/元 | `{{AMOUNT_1}}` |
| PHONE | 11 位手机号 / 区号+座机 | `{{PHONE_1}}` |
| EMAIL | 标准邮箱格式 | `{{EMAIL_1}}` |
| CONTRACT | 合同号/项目编号（字母+数字混合，如 HT-2026-001） | `{{CONTRACT_1}}` |
| IDCARD | 18 位身份证号 | `{{IDCARD_1}}` |
| TECHPARAM | IP 地址、端口号、密码字段值等 | `{{TECHPARAM_1}}` |

**正则设计原则：**
- 宁可误报（替换了不需要替换的）不可漏报（泄露敏感数据）——安全优先
- 占位符全局唯一递增（跨类型不重复序号），保证还原无歧义
- 正则规则可配置（Alpha 硬编码默认集，后续 Story 9.2 开放管理员配置界面）
- 中文敏感实体的正则比英文复杂，需要特别注意边界匹配

### Provider 适配设计

**Claude Messages API vs OpenAI Chat Completions API 差异：**

| 差异点 | Claude | OpenAI |
|--------|--------|--------|
| system message | 独立 `system` 参数 | `messages[0].role = 'system'` |
| 模型名 | `claude-sonnet-4-20250514` | `gpt-4o` |
| token 字段 | `input_tokens` / `output_tokens` | `prompt_tokens` / `completion_tokens` |
| 停止原因 | `stop_reason: 'end_turn'` | `finish_reason: 'stop'` |
| 最大 token 参数 | `max_tokens`（必填） | `max_tokens`（可选） |

**统一接口抹平差异：** `AiChatRequest` / `AiChatResponse` 使用 Provider 无关的字段名，各 Provider 实现内部做转换。

### 超时重试策略

```
第 1 次调用：30s 超时
失败 → 等待 1s
第 2 次重试：30s 超时
失败 → 等待 2s
第 3 次重试：30s 超时
失败 → 抛出 AiProxyError(AI_PROXY_TIMEOUT)
```

**可重试错误：** timeout、HTTP 5xx、HTTP 429 (rate limit)
**不可重试错误：** HTTP 401/403 (auth)、HTTP 400 (bad request)、网络不可达

### AI 调用链日志格式

```jsonl
{"timestamp":"2026-03-20T10:30:00.000Z","caller":"parse-agent","provider":"claude","model":"claude-sonnet-4-20250514","desensitizedInput":[{"role":"user","content":"请分析{{COMPANY_1}}的投标方案，预算{{AMOUNT_1}}"}],"outputContent":"根据分析，{{COMPANY_1}}的方案...","inputTokens":1500,"outputTokens":800,"latencyMs":2340,"status":"success","desensitizeStats":{"totalReplacements":5,"byType":{"COMPANY":2,"AMOUNT":3}}}
```

- JSONL 格式（每行一条 JSON），便于追加写入和流式处理
- 按日期分文件：`data/logs/ai-trace/2026-03-20.jsonl`
- Alpha 阶段仅写入，不清理（积累数据供 Beta 经验图谱构建）
- **严禁记录未脱敏原文**——日志记录必须在 `restore()` 之前执行
- `desensitizedInput` 字段：记录发送给 AI 的脱敏后 messages 数组
- `outputContent` 字段：记录 AI 返回的原始 content（此时响应中的占位符尚未还原，本身不含敏感数据）

### Project Structure Notes

**新增文件预期：**
```
src/main/services/ai-proxy/
├── desensitizer.ts         ← 新建：正则脱敏/还原服务
├── mapping-store.ts        ← 新建：脱敏映射表持久化（async fs）
├── provider-adapter.ts     ← 新建：Claude/OpenAI 双 Provider 适配
├── ai-trace-logger.ts      ← 新建：AI 调用链 JSONL 日志
└── index.ts                ← 新建：aiProxy 单例入口

src/shared/
└── ai-types.ts             ← 新建：AI 代理层共享类型

tests/unit/main/services/ai-proxy/
├── desensitizer.test.ts    ← 新建
├── provider-adapter.test.ts ← 新建
├── ai-proxy.test.ts        ← 新建
└── ai-trace-logger.test.ts ← 新建
```

**新增配置加密文件：**
```
src/main/config/
└── crypto-config.ts        ← 新建：AES-256-CBC 加密/解密工具（密钥派生自机器标识）
```

**修改文件预期：**
- `src/main/utils/errors.ts` — 新增 `AiProxyError`
- `src/shared/constants.ts` — ErrorCode 枚举补充细粒度 AI 错误码
- `src/main/config/app-config.ts` — 新增 `getAiProxyConfig()` 配置读取（从加密配置文件解密）
- `src/main/index.ts` — `ensureDataDirectories()` 异步化 + subdirs 补充 `desensitize-mappings` 和 `config`
- `package.json` — 添加 `@anthropic-ai/sdk` 和 `openai` 依赖

### 前序 Story 开发经验

**Story 1.3 关键经验（IPC 模式参考）：**
- `createIpcHandler<C>()` 工厂函数自动包装 try/catch → ApiResponse（本 Story 不直接用，但 ai-proxy 内部错误处理遵循同样模式）
- vi.hoisted() 解决 mock 初始化顺序问题——mock SDK 时可能需要

**Story 1.2 关键经验（测试模式参考）：**
- 测试使用内存级 mock，不依赖真实 API 调用
- `beforeEach` 重置所有 mock 保证隔离

**Story 1.1 关键经验（错误体系参考）：**
- 所有错误继承 `BidWiseError`，构造函数 `(code, message, cause?)`
- ErrorCode 枚举集中管理

### 测试规范

- **单元测试：** Vitest（Node.js 环境，非 jsdom）
- **SDK Mock 策略：** `vi.mock('@anthropic-ai/sdk')` / `vi.mock('openai')`，模拟 API 响应，不做真实网络调用
- **文件系统 Mock：** ai-trace-logger 测试中 mock `fs` 模块，验证写入格式
- **脱敏测试重点：** 覆盖所有实体类型的正则、混合场景、边界场景（空文本、超长文本、嵌套占位符格式文本）
- **超时测试：** 使用 `vi.useFakeTimers()` 模拟超时场景

### 反模式清单（禁止）

- ❌ 渲染进程直接调用 ai-proxy（必须经 agent-orchestrator → ai-proxy）
- ❌ 记录未脱敏原文到日志或任何持久化存储
- ❌ 硬编码 API Key 在源码中或从环境变量读取（架构决策 D3b 要求从 AES-256 加密配置文件读取，经 `app-config.ts` 解密）
- ❌ 创建 IPC handler 文件（ai-proxy 无直接 IPC 通道）
- ❌ 直接 `import Anthropic from '@anthropic-ai/sdk'` 在 provider-adapter.ts 以外的地方（SDK 引用仅限 Provider 实现内部）
- ❌ throw 裸字符串（使用 AiProxyError）
- ❌ 相对路径 import 超过 1 层（禁止 `../../`）
- ❌ 在 desensitizer 中引入 NER 模型依赖（Alpha 仅正则，NER 为 Beta 增强）
- ❌ 同步 I/O 操作阻塞主进程（日志写入使用 `fs.promises.appendFile`，映射表持久化使用 `fs.promises.writeFile/readFile/unlink`，禁止 `mkdirSync`/`writeFileSync` 等同步 API）
- ❌ 在 restore 之前写入日志以外的操作（安全时序：desensitize → call → **traceLog** → restore → return）
- ❌ 在 ai-proxy/index.ts 中直接读取环境变量或自行实现配置加载（必须通过 `app-config.ts`）

### 与后续 Story 的接口契约

**Story 2.2（agent-orchestrator）将消费 ai-proxy：**
```typescript
import { aiProxy } from '@main/services/ai-proxy'
// orchestrator 调用：
const response = await aiProxy.call({
  messages: [{ role: 'user', content: prompt }],
  caller: 'parse-agent',
  maxTokens: 4096,
})
```

**Story 9.2（管理员配置）将配置 ai-proxy：**
- API Key 存储/解密
- 脱敏规则自定义
- Provider 切换

本 Story 需为这两个消费者预留接口扩展性，但不提前实现。

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1 AI 脱敏代理层]
- [Source: _bmad-output/planning-artifacts/architecture.md#AI 脱敏代理层]
- [Source: _bmad-output/planning-artifacts/architecture.md#Agent 编排层设计原则]
- [Source: _bmad-output/planning-artifacts/architecture.md#核心架构决策 D3a]
- [Source: _bmad-output/planning-artifacts/architecture.md#AI Agent 调用模式]
- [Source: _bmad-output/planning-artifacts/architecture.md#强制规则]
- [Source: _bmad-output/planning-artifacts/architecture.md#代码组织结构 ai-proxy/]
- [Source: _bmad-output/planning-artifacts/architecture.md#跨切面映射 AI 脱敏代理]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR10 AI 调用脱敏]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR11 敏感数据泄露事件]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR22 AI API 兼容性]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR23 AI API 超时处理]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### Change Log

- 2026-03-20 — Story 文件创建，包含完整 AI 脱敏代理层开发上下文

### File List
