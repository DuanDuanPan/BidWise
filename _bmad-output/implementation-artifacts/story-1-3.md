# Story 1.3: [Enabler] IPC 通信骨架与安全隔离

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 开发者,
I want 类型化的安全 IPC 通信层,
So that 渲染进程与主进程可以安全通信，遵循一致的模式，后续所有功能 Story 可以直接复用 IPC 基础设施。

## Acceptance Criteria (验收标准)

1. **AC-1: IPC Handler 分域注册与 Service 分发**
   - Given IPC 通信层已建立
   - When 渲染进程通过 `window.api.projectCreate(input)` 发起业务请求
   - Then 请求经 contextBridge → ipcMain.handle → domain handler → service 层处理，返回统一格式 `{ success: true, data }` 或 `{ success: false, error: { code, message } }` 响应

2. **AC-2: 渲染进程安全隔离**
   - Given BrowserWindow 以 `sandbox: true` 创建且 preload 使用 contextBridge
   - When 渲染进程尝试直接访问 Node.js API（如 `require('fs')`、`process.exit()`）
   - Then 访问被拒绝，只能通过 `window.api` 暴露的白名单方法通信（NFR12）

3. **AC-3: IPC 类型安全端到端**
   - Given IPC 频道类型定义在 `src/shared/ipc-types.ts` 集中管理
   - When 开发者新增一个 IPC 频道
   - Then TypeScript 编译器强制要求同步更新 handler 注册、preload 暴露、Window.api 类型声明三处，任一遗漏导致编译错误

4. **AC-4: IPC 错误处理闭环**
   - Given service 层抛出 `BidWiseError`（如 `ValidationError`、`NotFoundError`）
   - When IPC handler 捕获错误
   - Then 错误被包装为 `{ success: false, error: { code, message } }` 格式返回渲染进程，不泄露堆栈信息；非 BidWiseError 被包装为 `UNKNOWN` 错误码

5. **AC-5: 集成测试验证**
   - Given IPC 通信骨架已实现
   - When 运行 `pnpm test:unit`
   - Then IPC handler 单元测试通过：验证 handler → service 分发、错误包装、类型契约

## Tasks / Subtasks (任务分解)

- [ ] **Task 1: IPC 类型体系重构** (AC: #3)
  - [ ] 1.1 重构 `src/shared/ipc-types.ts`：建立 `IpcChannelMap` 类型映射（频道名 → `{ input, output }` 类型对），替代当前松散的 `IPC_CHANNELS` 常量
  - [ ] 1.2 定义泛型 `IpcHandler<C extends keyof IpcChannelMap>` 类型，约束 handler 的参数和返回值与 `IpcChannelMap` 一致
  - [ ] 1.3 保留现有 `ApiResponse<T>`、`ProjectRecord`、`CreateProjectInput` 等类型不变（Story 1.1 已建立的契约）
  - [ ] 1.4 新增 `IpcError` 类型导出（`{ code: string, message: string }`），供 renderer 端消费

- [ ] **Task 2: IPC Handler 分域拆分与 Service 分发** (AC: #1, #4)
  - [ ] 2.1 创建 `src/main/ipc/project-handlers.ts`：将 project 域 6 个频道从 `index.ts` 中拆出，每个 handler 接收参数 → 调用 service → 包装响应
  - [ ] 2.2 创建 `src/main/ipc/create-handler.ts`：`createIpcHandler<C>(channel, serviceFn)` 工厂函数，统一处理 try/catch → BidWiseError 识别 → ApiResponse 包装 → 未知错误兜底
  - [ ] 2.3 重构 `src/main/ipc/index.ts`：`registerIpcHandlers()` 改为调用各域的 `registerXxxHandlers()` 函数
  - [ ] 2.4 创建 `src/main/services/project-service.ts`：placeholder service（方法签名匹配 IpcChannelMap 定义，实现为 `throw new NotFoundError('Not implemented')`），为 Story 1.2 数据层接入预留接口

- [ ] **Task 3: 渲染进程安全加固** (AC: #2)
  - [ ] 3.1 在 `src/main/index.ts` 的 `BrowserWindow` webPreferences 中显式设置 `sandbox: true`
  - [ ] 3.2 验证 preload 脚本在 sandbox 模式下正常工作（contextBridge + ipcRenderer.invoke 仍可用）
  - [ ] 3.3 审查 `src/renderer/index.html` CSP 策略，确认 `script-src 'self'` 阻止内联脚本注入
  - [ ] 3.4 确认 preload 中**不暴露**泛型 `ipcRenderer.invoke` / `ipcRenderer.send` / `ipcRenderer.on`，仅暴露白名单方法

- [ ] **Task 4: Preload API 可扩展重构** (AC: #3)
  - [ ] 4.1 重构 `src/preload/index.ts`：基于 `IpcChannelMap` 自动或手动生成类型安全的 API 方法，保持每个频道对应独立方法的白名单模式
  - [ ] 4.2 同步更新 `src/preload/index.d.ts`：`Window.api` 类型声明与 preload 实现保持一致
  - [ ] 4.3 确保新增域时只需在 `ipc-types.ts` 加频道定义 + 在 preload 加方法 + 在 handler 文件注册——三步完成

- [ ] **Task 5: 测试** (AC: #5)
  - [ ] 5.1 创建 `tests/unit/main/ipc/create-handler.test.ts`：测试 `createIpcHandler` 工厂函数——成功路径返回 `{ success: true, data }`、BidWiseError 路径返回 `{ success: false, error: { code, message } }`、未知错误返回 UNKNOWN 错误码
  - [ ] 5.2 创建 `tests/unit/main/ipc/project-handlers.test.ts`：mock service 验证 handler 分发调用和响应包装
  - [ ] 5.3 确保 `pnpm test:unit` 全部通过（包括 Story 1.1 已有测试）
  - [ ] 5.4 确保 `pnpm lint` 和 `pnpm typecheck` 通过

## Dev Notes (开发指南)

### 现有代码基线（Story 1.1 产出）

Story 1.1 已建立 IPC 骨架的初始版本，本 Story 在其基础上**重构升级**而非从零开始：

| 文件 | 现状 | 本 Story 操作 |
|------|------|-------------|
| `src/shared/ipc-types.ts` | 有 `ApiResponse<T>` + `IPC_CHANNELS` 常量 + Project 类型 | 新增 `IpcChannelMap` 类型映射，保留现有类型 |
| `src/main/ipc/index.ts` | 6 个 stub handler 直接返回 `{ success: true, data: null }` | 重构为域注册调度器 |
| `src/preload/index.ts` | 完整 project 域 contextBridge API | 保持模式，确保可扩展 |
| `src/preload/index.d.ts` | `Window.api` 类型声明 | 同步更新 |
| `src/main/utils/errors.ts` | `BidWiseError` + `ValidationError` + `NotFoundError` + `DatabaseError` | 不修改，直接使用 |
| `src/shared/constants.ts` | `ErrorCode` 枚举 | 不修改，直接使用 |
| `src/main/index.ts` | BrowserWindow 未设置 `sandbox: true` | 加上 |

### 关键实现模式

#### 1. IpcChannelMap 类型映射（推荐模式）

```typescript
// src/shared/ipc-types.ts
export type IpcChannelMap = {
  'project:create': { input: CreateProjectInput; output: ProjectRecord }
  'project:list': { input: void; output: ProjectListItem[] }
  'project:get': { input: string; output: ProjectRecord }
  'project:update': { input: { projectId: string; input: UpdateProjectInput }; output: ProjectRecord }
  'project:delete': { input: string; output: void }
  'project:archive': { input: string; output: void }
  // 后续域在此追加
}

export type IpcChannel = keyof IpcChannelMap
```

#### 2. createIpcHandler 工厂函数

```typescript
// src/main/ipc/create-handler.ts
import { ipcMain } from 'electron'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import type { ApiResponse, IpcChannelMap } from '@shared/ipc-types'

export function createIpcHandler<C extends keyof IpcChannelMap>(
  channel: C,
  handler: (input: IpcChannelMap[C]['input']) => Promise<IpcChannelMap[C]['output']>
): void {
  ipcMain.handle(channel, async (_event, input) => {
    try {
      const data = await handler(input)
      return { success: true, data } as ApiResponse<IpcChannelMap[C]['output']>
    } catch (error) {
      if (error instanceof BidWiseError) {
        return {
          success: false,
          error: { code: error.code, message: error.message },
        } as ApiResponse<IpcChannelMap[C]['output']>
      }
      return {
        success: false,
        error: {
          code: ErrorCode.UNKNOWN,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      } as ApiResponse<IpcChannelMap[C]['output']>
    }
  })
}
```

#### 3. 域 Handler 注册模式

```typescript
// src/main/ipc/project-handlers.ts
import { createIpcHandler } from './create-handler'
import { projectService } from '@main/services/project-service'

export function registerProjectHandlers(): void {
  createIpcHandler('project:create', (input) => projectService.create(input))
  createIpcHandler('project:list', () => projectService.list())
  createIpcHandler('project:get', (projectId) => projectService.get(projectId))
  createIpcHandler('project:update', ({ projectId, input }) =>
    projectService.update(projectId, input)
  )
  createIpcHandler('project:delete', (projectId) => projectService.delete(projectId))
  createIpcHandler('project:archive', (projectId) => projectService.archive(projectId))
}
```

```typescript
// src/main/ipc/index.ts
import { registerProjectHandlers } from './project-handlers'

export function registerIpcHandlers(): void {
  registerProjectHandlers()
  // registerAnalysisHandlers()  ← 后续 Story 添加
  // registerAgentHandlers()     ← 后续 Story 添加
}
```

#### 4. Placeholder Service 模式

```typescript
// src/main/services/project-service.ts
import { NotFoundError } from '@main/utils/errors'
import type { ... } from '@shared/ipc-types'

export const projectService = {
  async create(input: CreateProjectInput): Promise<ProjectRecord> {
    // Story 1.2 实现：接入 Kysely + SQLite
    throw new NotFoundError('project-service.create not implemented — waiting for Story 1.2 data layer')
  },
  // ...其余方法同理
}
```

#### 5. Sandbox 安全设置

```typescript
// src/main/index.ts — BrowserWindow webPreferences
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: true,   // ← 必须显式开启
}
```

electron-vite 5.x / Electron 41 下 `sandbox: true` 是推荐配置。contextBridge 和 `ipcRenderer.invoke` 在 sandbox 模式下完全正常工作。

### 依赖关系

| 依赖项 | 状态 | 影响 |
|--------|------|------|
| Story 1.1 工程骨架 | done | 本 Story 在其 IPC 骨架基础上重构 |
| Story 1.2 数据持久层 | backlog | service 层暂用 placeholder，1.2 完成后接入真实实现。**本 Story 可与 1.2 并行开发** |

### 与 Story 1.2 的接口约定

Story 1.2 需要在 `src/main/services/project-service.ts` 中实现以下接口（本 Story 定义接口，1.2 填充实现）：

```typescript
create(input: CreateProjectInput): Promise<ProjectRecord>
list(): Promise<ProjectListItem[]>
get(projectId: string): Promise<ProjectRecord>
update(projectId: string, input: UpdateProjectInput): Promise<ProjectRecord>
delete(projectId: string): Promise<void>
archive(projectId: string): Promise<void>
```

### 测试策略

| 测试层 | 工具 | 测试内容 |
|--------|------|---------|
| 单元测试 | Vitest (node env) | `createIpcHandler` 工厂函数、`project-handlers` 分发 |
| 类型测试 | `pnpm typecheck` | IpcChannelMap ↔ handler ↔ preload 类型一致性 |

**注意**：IPC 集成测试（通过 Electron 真实 IPC 通信验证）属于 E2E 范畴。本 Story 的 AC-5 聚焦单元测试层面；E2E IPC 测试由 Story 1.1 已有的 Playwright 冒烟测试覆盖基本通路。

### 测试 Mock 方式

```typescript
// tests/unit/main/ipc/create-handler.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock electron ipcMain
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

// 测试成功路径
it('wraps successful result in ApiResponse', async () => {
  const handler = vi.fn().mockResolvedValue({ id: '1', name: 'test' })
  createIpcHandler('project:create', handler)
  // 从 ipcMain.handle mock 中取出注册的回调并执行
  const registeredCallback = (ipcMain.handle as Mock).mock.calls[0][1]
  const result = await registeredCallback({}, { name: 'test', rootPath: '/tmp' })
  expect(result).toEqual({ success: true, data: { id: '1', name: 'test' } })
})
```

### 禁止事项（Anti-Patterns）

- **禁止** 在 preload 中暴露泛型 `ipcRenderer.invoke(channel, ...args)` — 必须每个频道独立方法
- **禁止** 在 IPC handler 中写业务逻辑 — handler 只做参数透传 + 响应包装
- **禁止** throw 裸字符串 — 必须用 `BidWiseError` 子类
- **禁止** 在错误响应中泄露堆栈信息（`error.stack`）
- **禁止** 手动 try/catch 每个 handler — 必须用 `createIpcHandler` 工厂统一处理
- **禁止** 渲染进程直接 import Node.js 模块
- **禁止** `../../` 以上的相对路径 import

### Project Structure Notes

本 Story 涉及的文件变更：

```
src/
├── shared/
│   └── ipc-types.ts              ← 重构：新增 IpcChannelMap，保留现有类型
├── main/
│   ├── index.ts                  ← 修改：BrowserWindow 加 sandbox: true
│   ├── ipc/
│   │   ├── index.ts              ← 重构：改为域注册调度器
│   │   ├── create-handler.ts     ← 新增：IPC handler 工厂函数
│   │   └── project-handlers.ts   ← 新增：project 域 handler
│   └── services/
│       └── project-service.ts    ← 新增：placeholder service 接口
├── preload/
│   ├── index.ts                  ← 可能微调：确保与 IpcChannelMap 类型对齐
│   └── index.d.ts                ← 同步更新
tests/
└── unit/
    └── main/
        └── ipc/
            ├── create-handler.test.ts   ← 新增
            └── project-handlers.test.ts ← 新增
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — IPC Handler 模式、通信架构、安全架构、反模式]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1 Story 1.3 AC + Implementation Notes]
- [Source: _bmad-output/planning-artifacts/prd.md — NFR12 IPC contextBridge 隔离、NFR9 数据本地存储]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — 错误反馈模式（Toast/内联）、Loading 状态规范]
- [Source: src/shared/ipc-types.ts — 现有 ApiResponse + IPC_CHANNELS + Project 类型]
- [Source: src/main/ipc/index.ts — 现有 stub handler 实现]
- [Source: src/preload/index.ts — 现有 contextBridge 白名单 API]
- [Source: src/main/utils/errors.ts — 现有 BidWiseError 层次结构]
- [Source: _bmad-output/implementation-artifacts/story-1-1.md — Story 1.1 产出与代码模式]

## Dev Agent Record

### Agent Model Used

(待开发时填写)

### Debug Log References

### Completion Notes List

### Change Log

- 2026-03-19: Story 文件创建，comprehensive context engine 分析完成
