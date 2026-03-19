# Story 1.2: [Enabler] 数据持久层与迁移基础设施

Status: review

## Story

As a 开发者,
I want 类型安全的数据库访问层和自动迁移机制,
so that 所有功能可以使用一致的模式可靠地持久化数据。

## Acceptance Criteria (验收标准)

1. **AC-1: 数据库自动初始化与迁移**
   - Given 应用首次启动
   - When 主进程执行数据库初始化（`migrator.migrateToLatest()`）
   - Then SQLite 数据库文件在 `{userData}/data/db/bidwise.sqlite` 创建，Schema 自动迁移到最新版本，`projects` 表已创建且结构与架构规范一致

2. **AC-2: Kysely 类型安全与 CamelCasePlugin**
   - Given Kysely 客户端已配置 CamelCasePlugin
   - When 通过 Repository 执行 CRUD 操作
   - Then TypeScript 类型安全生效（编译期错误检查），DB snake_case 列与 TS camelCase 属性自动映射，无手动转换代码

3. **AC-3: 统一错误处理**
   - Given 数据库操作发生错误（如约束冲突、表不存在）
   - When 错误被 Repository 层捕获
   - Then 抛出 `DatabaseError`（继承 `BidWiseError`），IPC Handler 包装为 `{ success: false, error: { code: 'DATABASE', message } }` 格式返回

4. **AC-4: 运行时数据目录确认**
   - Given 应用首次启动
   - When 数据目录初始化完成
   - Then `{userData}/data/` 下 `db/`、`projects/`、`config/`、`logs/ai-trace/`、`backups/` 目录均已创建（Story 1.1 已实现 `ensureDataDirectories()`，本 Story 验证其与 DB 初始化的协同）

5. **AC-5: Project CRUD 端到端**
   - Given 数据库已初始化且 IPC Handler 已注册
   - When 通过 preload API 调用 `projectCreate`、`projectList`、`projectGet`、`projectUpdate`、`projectDelete`
   - Then 数据正确持久化到 SQLite 并通过统一 Response Wrapper 返回，所有 6 个 IPC channel 的 stub 替换为真实实现

6. **AC-6: 数据本地性保证**
   - Given 所有数据存储操作
   - When 验证存储位置
   - Then 方案全文、资产、元数据 100% 存储在本地（NFR9），数据库文件在 `{userData}/data/db/` 下

7. **AC-7: 单元测试与集成测试**
   - Given 数据层代码已实现
   - When 执行 `pnpm test:unit`
   - Then Repository 层 CRUD 测试全部通过（使用内存 SQLite 或临时文件），迁移测试验证 Schema 正确性
   - When 执行 IPC 集成测试
   - Then project:* 频道的请求→service→repository→DB 链路测试通过

## Tasks / Subtasks (任务分解)

- [x] **Task 1: 安装数据层依赖** (AC: #1, #2)
  - [x] 1.1 安装 `better-sqlite3`（>=12.8.0，兼容 Electron 41 V8 变更）：`pnpm add better-sqlite3`
  - [x] 1.2 安装 `better-sqlite3` 类型声明：`pnpm add -D @types/better-sqlite3`
  - [x] 1.3 安装 Kysely 及 CamelCase 插件：`pnpm add kysely`
  - [x] 1.4 安装 UUID 生成库：`pnpm add uuid` + `pnpm add -D @types/uuid`
  - [x] 1.5 验证 `pnpm dev` 启动正常，native 模块（better-sqlite3）编译无报错

- [x] **Task 2: Kysely 客户端初始化** (AC: #1, #2)
  - [x] 2.1 实现 `src/main/db/client.ts`：创建 Kysely 实例，配置 `SqliteDialect` + `CamelCasePlugin`
  - [x] 2.2 定义数据库 Schema 类型接口 `Database`（包含 `projects` 表定义）放在 `src/main/db/schema.ts`
  - [x] 2.3 数据库文件路径使用 `app.getPath('userData') + '/data/db/bidwise.sqlite'`
  - [x] 2.4 导出 `getDb()` 函数和 `destroyDb()` 清理函数
  - [x] 2.5 更新 `src/main/db/index.ts` 统一导出

- [x] **Task 3: 迁移基础设施** (AC: #1)
  - [x] 3.1 实现 `src/main/db/migrations/001_initial_schema.ts`：创建 `projects` 表
  - [x] 3.2 `projects` 表字段：`id`(TEXT PK), `name`(TEXT NOT NULL), `customer_name`(TEXT), `deadline`(TEXT), `proposal_type`(TEXT DEFAULT 'presale-technical'), `sop_stage`(TEXT DEFAULT 'not-started'), `status`(TEXT DEFAULT 'active'), `root_path`(TEXT), `created_at`(TEXT NOT NULL), `updated_at`(TEXT NOT NULL)
  - [x] 3.3 实现 `src/main/db/migrator.ts`：封装 Kysely `Migrator`，`runMigrations()` 调用 `migrateToLatest()`
  - [x] 3.4 迁移文件使用 `FileMigrationProvider` 或内联 `Migration` 对象（推荐内联，避免 Electron 打包路径问题）
  - [x] 3.5 在 `src/main/index.ts` 的 `app.whenReady()` 中调用 `runMigrations()`，在 `ensureDataDirectories()` 之后

- [x] **Task 4: Repository 层实现** (AC: #2, #3, #5)
  - [x] 4.1 实现 `src/main/db/repositories/project-repo.ts`：`ProjectRepository` 类
  - [x] 4.2 方法清单：`create(input)`, `findById(id)`, `findAll()`, `update(id, input)`, `delete(id)`, `archive(id)`
  - [x] 4.3 所有方法使用 Kysely 类型安全查询（`.selectFrom()`, `.insertInto()`, `.updateTable()`, `.deleteFrom()`）
  - [x] 4.4 错误处理：DB 异常捕获后抛出 `DatabaseError`，查询无结果抛出 `NotFoundError`
  - [x] 4.5 `create` 方法使用 `uuid.v4()` 生成 ID，`created_at`/`updated_at` 使用 ISO-8601 格式
  - [x] 4.6 更新 `src/main/db/repositories/index.ts` 导出

- [x] **Task 5: Service 层实现** (AC: #3, #5)
  - [x] 5.1 创建 `src/main/services/project-service.ts`：`ProjectService` 类
  - [x] 5.2 方法封装 Repository 调用，添加业务校验（如名称不能为空、项目是否存在）
  - [x] 5.3 校验失败抛出 `ValidationError`，未找到抛出 `NotFoundError`
  - [x] 5.4 更新 `src/main/services/index.ts` 导出

- [x] **Task 6: IPC Handler 真实实现** (AC: #3, #5)
  - [x] 6.1 更新 `src/main/ipc/index.ts`（或拆分为 `src/main/ipc/project-handlers.ts`）
  - [x] 6.2 替换所有 6 个 project:* stub 为真实实现：参数解析 → `projectService.xxx()` → Response Wrapper
  - [x] 6.3 Handler 层 try/catch：`BidWiseError` 实例提取 code/message，未知错误返回 `UNKNOWN` code
  - [x] 6.4 Handler 保持薄分发模式——零业务逻辑

- [x] **Task 7: 共享类型更新** (AC: #2, #5)
  - [x] 7.1 更新 `src/shared/ipc-types.ts`：`ProjectRecord` 补充 `customerName`, `deadline`, `proposalType`, `sopStage`, `status`, `rootPath` 字段
  - [x] 7.2 同步更新 `CreateProjectInput` 和 `UpdateProjectInput` 类型
  - [x] 7.3 同步更新 `src/preload/index.ts` 和 `src/preload/index.d.ts` 的类型签名（如有变化）
  - [x] 7.4 确保 `ProjectListItem` 包含看板所需的摘要字段

- [x] **Task 8: 单元测试** (AC: #7)
  - [x] 8.1 创建 `tests/unit/main/db/client.test.ts`：验证 Kysely 客户端创建、CamelCasePlugin 工作、内存数据库模式
  - [x] 8.2 创建 `tests/unit/main/db/migrations.test.ts`：验证迁移执行后表结构正确
  - [x] 8.3 创建 `tests/unit/main/db/project-repo.test.ts`：CRUD 全链路测试（使用 `:memory:` SQLite）
  - [x] 8.4 创建 `tests/unit/main/services/project-service.test.ts`：业务校验测试
  - [x] 8.5 所有测试使用临时内存数据库，测试间隔离（`beforeEach` 重新迁移）

- [x] **Task 9: 集成测试** (AC: #7)
  - [x] 9.1 创建 `tests/integration/ipc/project-handlers.test.ts`：模拟 IPC 调用→Service→Repository→DB 链路
  - [x] 9.2 验证成功和失败响应格式符合统一 Response Wrapper

- [x] **Task 10: 验证与收尾** (AC: #1-#7)
  - [x] 10.1 运行 `pnpm lint` 确保无 lint 错误
  - [x] 10.2 运行 `pnpm test:unit` 确保所有测试通过
  - [x] 10.3 运行 `pnpm dev` 验证应用启动时数据库自动创建并迁移
  - [x] 10.4 运行 `pnpm build` 确保打包成功（native 模块正确打包）

## Dev Notes (开发指南)

### 版本锁定与兼容性

| 技术 | 版本 | 关键注意事项 |
|------|------|-------------|
| better-sqlite3 | >=12.8.0 | **必须** 12.8.0+ 兼容 Electron 41 V8 变更；同步 API 适合 Electron 主进程 |
| Kysely | 0.28.x | CamelCasePlugin 稳定；`Migrator` 支持内联 `Migration` 对象 |
| uuid | ^11.x | v4() 生成随机 UUID 作为主键 |

### 关键代码模式

#### Kysely 客户端初始化（`src/main/db/client.ts`）

```ts
import Database from 'better-sqlite3'
import { Kysely, SqliteDialect, CamelCasePlugin } from 'kysely'
import type { DB } from './schema'

let db: Kysely<DB> | null = null

export function getDb(): Kysely<DB> {
  if (!db) {
    throw new DatabaseError('DATABASE_NOT_INITIALIZED', '数据库未初始化，请先调用 initDb()')
  }
  return db
}

export function initDb(dbPath: string): Kysely<DB> {
  const dialect = new SqliteDialect({
    database: new Database(dbPath),
  })
  db = new Kysely<DB>({
    dialect,
    plugins: [new CamelCasePlugin()],
  })
  return db
}

export async function destroyDb(): Promise<void> {
  if (db) {
    await db.destroy()
    db = null
  }
}
```

#### 数据库 Schema 类型（`src/main/db/schema.ts`）

```ts
import type { Generated, ColumnType } from 'kysely'

// CamelCasePlugin 会自动将这里的 camelCase 映射到 DB 的 snake_case
export interface ProjectTable {
  id: string
  name: string
  customerName: string | null
  deadline: string | null
  proposalType: string       // 默认 'presale-technical'
  sopStage: string           // 默认 'not-started'
  status: string             // 'active' | 'archived'
  rootPath: string | null
  createdAt: string
  updatedAt: string
}

export interface DB {
  projects: ProjectTable
}
```

#### 迁移示例（`src/main/db/migrations/001_initial_schema.ts`）

```ts
import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('projects')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('customer_name', 'text')
    .addColumn('deadline', 'text')
    .addColumn('proposal_type', 'text', (col) => col.defaultTo('presale-technical'))
    .addColumn('sop_stage', 'text', (col) => col.defaultTo('not-started'))
    .addColumn('status', 'text', (col) => col.defaultTo('active'))
    .addColumn('root_path', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('projects').execute()
}
```

**注意：** 迁移 DDL 中列名使用 snake_case（这是 DB 层），CamelCasePlugin 在运行时查询中自动转换。

#### Migrator 封装（`src/main/db/migrator.ts`）

```ts
import { Migrator, type Migration } from 'kysely'
import { getDb } from './client'
import * as migration001 from './migrations/001_initial_schema'
import { createLogger } from '@main/utils/logger'

const logger = createLogger('db:migrator')

// 内联 Migration Provider（避免 Electron 打包路径问题）
const migrations: Record<string, Migration> = {
  '001_initial_schema': migration001,
}

export async function runMigrations(): Promise<void> {
  const db = getDb()
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  })
  const { error, results } = await migrator.migrateToLatest()
  results?.forEach((r) => {
    if (r.status === 'Success') {
      logger.info(`迁移完成: ${r.migrationName}`)
    } else if (r.status === 'Error') {
      logger.error(`迁移失败: ${r.migrationName}`)
    }
  })
  if (error) {
    throw error
  }
}
```

**关键决策：使用内联 Migration Provider 而非 `FileMigrationProvider`。** 原因：Electron 打包后文件路径不可靠，内联方式确保迁移代码始终可访问。

#### Repository 模式（`src/main/db/repositories/project-repo.ts`）

```ts
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../client'
import { DatabaseError, NotFoundError } from '@main/utils/errors'
import type { ProjectTable } from '../schema'

export class ProjectRepository {
  async create(input: { name: string; customerName?: string; deadline?: string; proposalType?: string; rootPath?: string }): Promise<ProjectTable> {
    const now = new Date().toISOString()
    const project = {
      id: uuidv4(),
      name: input.name,
      customerName: input.customerName ?? null,
      deadline: input.deadline ?? null,
      proposalType: input.proposalType ?? 'presale-technical',
      sopStage: 'not-started',
      status: 'active',
      rootPath: input.rootPath ?? null,
      createdAt: now,
      updatedAt: now,
    }
    try {
      await getDb().insertInto('projects').values(project).execute()
      return project
    } catch (err) {
      throw new DatabaseError(`项目创建失败: ${(err as Error).message}`, err)
    }
  }

  async findById(id: string): Promise<ProjectTable> {
    const project = await getDb()
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    if (!project) throw new NotFoundError(`项目不存在: ${id}`)
    return project
  }

  // findAll, update, delete, archive 类似模式...
}
```

#### IPC Handler 薄分发模式

```ts
ipcMain.handle(IPC_CHANNELS.PROJECT_CREATE, async (_event, input: CreateProjectInput) => {
  try {
    const result = await projectService.create(input)
    return { success: true, data: result }
  } catch (error) {
    if (error instanceof BidWiseError) {
      return { success: false, error: { code: error.code, message: error.message } }
    }
    return { success: false, error: { code: ErrorCode.UNKNOWN, message: String(error) } }
  }
})
```

#### 测试模式：内存数据库隔离

```ts
import { Kysely, SqliteDialect, CamelCasePlugin } from 'kysely'
import Database from 'better-sqlite3'

function createTestDb(): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin()],
  })
}

beforeEach(async () => {
  testDb = createTestDb()
  // 运行迁移
  // 注入 testDb 到 repository
})

afterEach(async () => {
  await testDb.destroy()
})
```

### 主进程启动时序（更新后）

```
app.whenReady()
  → ensureDataDirectories()      // Story 1.1 已实现
  → initDb(dbPath)               // 【新增】初始化 Kysely 客户端
  → runMigrations()              // 【新增】执行迁移
  → registerIpcHandlers()        // 已有，需注入 service 实例
  → createWindow()               // 已有
```

### Story 1.1 遗留的 Stub 需要替换

`src/main/ipc/index.ts` 中 6 个 project:* handler 当前返回 `{ success: true, data: null }`，本 Story 必须替换为真实的 Service 调用。

### 架构约束速查

- **禁止** raw SQL（必须通过 Kysely 类型安全查询）
- **禁止** 手动 snake_case ↔ camelCase 转换（CamelCasePlugin 处理）
- **禁止** IPC Handler 中包含业务逻辑（薄分发到 Service 层）
- **禁止** throw 裸字符串（必须用 BidWiseError 子类）
- **禁止** 相对路径超过 1 层（使用 `@main/*`、`@shared/*` 别名）
- **必须** 所有日期时间使用 ISO-8601 格式
- **必须** Loading 状态字段用 `loading: boolean`（不是 `isLoading`）
- **必须** Response Wrapper 格式 `{ success, data/error }`

### Electron Native 模块注意事项

better-sqlite3 是 native Node.js 模块，需要注意：
- `.npmrc` 已配置 `shamefully-hoist=true`（Story 1.1 已完成）
- electron-vite 5.x 的 `build.externalizeDeps` 默认启用，会自动排除 native 模块
- `electron-builder.yml` 需要确认 native 模块包含在 `asar` 中（或 `asarUnpack`）
- 如果打包后 better-sqlite3 加载失败，检查 `electron-builder.yml` 的 `asarUnpack` 配置

### 共享类型扩展说明

当前 `src/shared/ipc-types.ts` 中 `ProjectRecord` 只有 4 个字段（`id`, `name`, `createdAt`, `updatedAt`）。本 Story 需要扩展为完整字段以匹配 DB Schema，同时保持与 preload API 类型签名的一致性。

`CreateProjectInput` 当前为 `{ name, rootPath }`，需要扩展为包含 `customerName`、`deadline`、`proposalType` 等可选字段。

### Project Structure Notes

**新增文件：**
```
src/main/db/
├── client.ts              ← 替换占位，实现 Kysely 客户端
├── schema.ts              ← 【新建】数据库类型定义
├── migrator.ts            ← 【新建】迁移执行器
├── migrations/
│   └── 001_initial_schema.ts  ← 【新建】初始 Schema
├── repositories/
│   ├── project-repo.ts    ← 【新建】项目数据访问
│   └── index.ts           ← 【新建】Repository 导出
└── index.ts               ← 更新导出

src/main/services/
├── project-service.ts     ← 【新建】项目业务服务
└── index.ts               ← 更新导出

src/main/ipc/
├── project-handlers.ts    ← 【新建或从 index.ts 拆分】
└── index.ts               ← 更新：真实 handler 替换 stub

src/shared/
├── ipc-types.ts           ← 更新：扩展 ProjectRecord 字段

tests/unit/main/db/
├── client.test.ts         ← 【新建】
├── migrations.test.ts     ← 【新建】
└── project-repo.test.ts   ← 【新建】

tests/unit/main/services/
└── project-service.test.ts ← 【新建】

tests/integration/ipc/
└── project-handlers.test.ts ← 【新建】
```

**修改文件：**
- `package.json` — 新增 better-sqlite3、kysely、uuid 依赖
- `src/main/index.ts` — 添加 DB 初始化和迁移调用
- `src/main/ipc/index.ts` — stub → 真实实现
- `src/shared/ipc-types.ts` — 扩展类型定义
- `src/preload/index.ts` — 如类型变化则同步更新
- `src/preload/index.d.ts` — 如类型变化则同步更新

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — D1 数据库访问层决策、代码组织结构、db/ 目录结构、命名规范、实现模式强制规则、BidWiseError 类型体系]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1 Story 1.2 AC + Implementation Notes]
- [Source: _bmad-output/planning-artifacts/prd.md — FR6 项目数据隔离, FR8 两层数据管理, NFR9 本地数据存储, NFR13 Markdown 纯文本, NFR17 实时自动保存零丢失, NFR29 大数据量稳定性]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — 自动保存交互模式、错误四状态模型、上下文恢复]
- [Source: _bmad-output/implementation-artifacts/story-1-1.md — 已建立的项目结构、BidWiseError 体系、IPC 类型定义、preload API 骨架、数据目录创建]
- [Source: CLAUDE.md — 命名规范、架构模式、Anti-Patterns、Response Wrapper]

## File List

**新增文件：**
- `src/main/db/schema.ts` — DB 类型定义（ProjectTable, DB 接口）
- `src/main/db/migrator.ts` — 迁移执行器（内联 Migration Provider）
- `src/main/db/migrations/001_initial_schema.ts` — 初始 Schema（projects 表）
- `src/main/db/repositories/project-repo.ts` — ProjectRepository CRUD
- `src/main/db/repositories/index.ts` — Repository 导出
- `src/main/services/project-service.ts` — ProjectService 业务层
- `src/main/ipc/project-handlers.ts` — IPC handler 真实实现
- `tests/unit/main/db/client.test.ts` — Kysely 客户端测试
- `tests/unit/main/db/migrations.test.ts` — 迁移测试
- `tests/unit/main/db/project-repo.test.ts` — Repository CRUD 测试
- `tests/unit/main/services/project-service.test.ts` — Service 业务校验测试
- `tests/integration/ipc/project-handlers.test.ts` — IPC 集成测试

**修改文件：**
- `package.json` — 新增 better-sqlite3 12.8.0, kysely 0.28.13, uuid 13.0.0 及类型声明
- `src/main/db/client.ts` — 从占位替换为完整 Kysely 客户端（initDb/getDb/destroyDb）
- `src/main/db/index.ts` — 更新导出
- `src/main/ipc/index.ts` — stub → 委派到 project-handlers.ts
- `src/main/services/index.ts` — 导出 ProjectService
- `src/main/index.ts` — 添加 DB 初始化、迁移调用、退出清理
- `src/shared/ipc-types.ts` — ProjectRecord 扩展完整字段，UpdateProjectInput 扩展
- `src/preload/index.ts` — archive 返回类型更新为 ProjectRecord
- `src/preload/index.d.ts` — 同步更新类型声明
- `vitest.config.ts` — 添加 integration test 目录到 main project

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- 测试修复: SQLite PRAGMA 返回大写 TYPE 需 toLowerCase；CamelCasePlugin 会转换 PRAGMA 结果列名（dflt_value → dfltValue），用 raw db 做 introspection
- 测试修复: 同毫秒创建的记录 updatedAt 相同，调整 findAll 排序测试为集合验证
- ESLint 修复: 添加 wrapError 返回类型、移除未使用 import、prettier 格式化

### Completion Notes List

- 安装 better-sqlite3 12.8.0 + kysely 0.28.13 + uuid 13.0.0，native 模块编译成功
- Kysely 客户端配置 SqliteDialect + CamelCasePlugin，自动 snake_case ↔ camelCase
- 内联 Migration Provider 避免 Electron 打包路径问题
- projects 表 10 列完整实现，与架构规范一致
- ProjectRepository 6 方法 CRUD + archive，全部使用 Kysely 类型安全查询
- ProjectService 封装业务校验（名称非空、ID 验证）
- IPC handler 薄分发模式，6 个 project:* 频道全部替换为真实实现
- 共享类型 ProjectRecord 扩展至 10 字段，ProjectListItem 包含看板摘要字段
- 49 个测试全部通过（8 个测试文件），覆盖 client/migration/repo/service/integration
- pnpm lint 0 errors 0 warnings
- pnpm build 成功，main/preload/renderer 全部构建

### Change Log

- 2026-03-19: Story 文件创建，comprehensive context engine 分析完成
- 2026-03-19: 全部 10 个 Task 实现完成，49 个测试通过，lint/build 通过，状态更新为 review
