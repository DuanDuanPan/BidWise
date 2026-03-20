# Story 1.5: 投标项目创建与看板

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 创建投标项目并在看板上纵览所有进行中的标,
So that 我可以一目了然地管理所有投标工作。

## Acceptance Criteria

### AC1: 项目创建表单

- **Given** 我在项目看板页面
- **When** 点击"新建项目"
- **Then** 表单出现，包含项目名称（必填）、客户名称、行业领域、截止日期、方案类型（MVP：售前技术方案，默认选中且不可更改）字段
- [Source: epics.md Story 1.5 AC1, FR1, FR4, FR7（行业字段为筛选维度前置依赖）]

### AC2: 项目卡片看板展示

- **Given** 我已创建多个项目
- **When** 查看看板
- **Then** 所有项目以卡片形式展示：项目名 + SOP 阶段 + 截止日 + 合规状态 + 最近活动
- [Source: epics.md Story 1.5 AC2, FR2]

### AC3: 项目筛选与过滤

- **Given** 项目列表存在多个项目
- **When** 使用筛选栏
- **Then** 可以按客户、行业、状态、截止日等维度筛选和过滤
- [Source: epics.md Story 1.5 AC3, FR7]

### AC4: 数据隔离与持久化

- **Given** 多个项目同时进行
- **When** 数据存储
- **Then** 项目数据严格隔离（独立 SQLite 记录 + 独立项目文件目录 `data/projects/{id}/`），公司级数据（资产库/术语库/模板/基线）跨项目共享，项目级数据（方案/批注/对抗结果/GAP）项目内隔离，两层数据分层管理
- **Then** 项目 `rootPath` 在创建时持久化到 SQLite（值为 `data/projects/{id}/` 的绝对路径），后续通过 `ProjectRecord.rootPath` 查找项目目录
- **Then** DB 与文件系统的一致性有补偿保障：若 DB insert 成功但 mkdir 失败，service 层必须回滚 DB 记录（delete by id）并向调用方返回错误；若 DB insert 失败则不创建目录
- [Source: epics.md Story 1.5 AC4, FR6, FR8]

### AC5: 状态管理与 UI 同步

- **Given** 项目状态变更（创建/编辑/归档）
- **When** 操作完成
- **Then** Zustand projectStore 同步更新 UI，数据通过 IPC 持久化到 SQLite，无需手动刷新

## Tasks / Subtasks

- [ ] Task 1: 路由系统搭建 (AC: 全部)
  - [ ] 1.1 安装依赖：`pnpm add react-router-dom zustand`（两者当前均未安装），配置 HashRouter（Electron 兼容）
  - [ ] 1.2 创建根路由：`/` → 项目看板页，`/project/:id` → 项目工作空间（占位）
  - [ ] 1.3 创建 `src/renderer/src/App.tsx` 路由挂载，移除临时 DesignSystemDemo 首页展示
- [ ] Task 1.5: 数据库 Schema 扩展 — industry 字段 (AC: 3)
  - [ ] 1.5.1 创建 `src/main/db/migrations/002_add_industry.ts`，添加 `industry TEXT` 列
  - [ ] 1.5.2 更新 `src/main/db/schema.ts`（ProjectTable 接口添加 `industry: string | null`）
  - [ ] 1.5.2a 在 `src/main/db/migrator.ts` 的 `migrations` 对象中注册新迁移：`import * as migration002 from './migrations/002_add_industry'`，并在 Record 中添加 `'002_add_industry': migration002`（参照 001 的内联注册模式）
  - [ ] 1.5.3 更新 `src/shared/ipc-types.ts` 中的类型定义，添加 industry 字段：
    - `ProjectRecord`：添加 `industry: string | null`
    - `ProjectListItem`：Pick 字段列表中添加 `'industry'`
    - `CreateProjectInput`：添加 `industry?: string`
    - `UpdateProjectInput`：Pick 字段列表中添加 `'industry'`
  - [ ] 1.5.4 手动更新 project-repo.ts 和 project-service.ts 的类型以支持 industry 字段（NOT auto-handled by Kysely — 必须手动修改）：
    - `project-repo.ts` line 6 `CreateProjectRepoInput`：添加 `industry?: string`
    - `project-repo.ts` line 14 `UpdateProjectRepoInput`：添加 `industry?: string | null`
    - `project-repo.ts` line 25 `create()` 方法内的 project 对象：添加 `industry: input.industry ?? null`
    - `project-service.ts` line 13 `create()` 方法内的 `repo.create({...})` 调用：在传参对象中添加 `industry: input.industry`
- [ ] Task 2: Zustand projectStore 实现 (AC: 5)
  - [ ] 2.1 创建 `src/renderer/src/stores/projectStore.ts`，定义 ProjectState 接口
  - [ ] 2.2 实现 actions：loadProjects / createProject / updateProject / deleteProject / archiveProject / setFilter
  - [ ] 2.3 每个 async action 内部管理 `loading` / `error` 状态
  - [ ] 2.4 导出 `useProjectStore` hook
- [ ] Task 3: IPC 调用层适配 (AC: 4, 5)
  - [ ] 3.1 确认现有 `window.api.projectCreate/List/Get/Update/Delete/Archive` 可用
  - [ ] 3.2 在 store actions 中通过 `window.api.*` 调用 IPC，处理 `ApiResponse` success/error 分支
  - [ ] 3.3 验证项目创建时自动在 `data/projects/{id}/` 下创建目录结构
- [ ] Task 4: 项目看板页面 (AC: 1, 2, 3)
  - [ ] 4.1 创建 `modules/project/components/ProjectKanban.tsx` — 看板主页面容器
  - [ ] 4.2 创建 `modules/project/components/ProjectCard.tsx` — 项目卡片组件（与 `prototypes/story-1-5.pen` 卡片版式对齐）
  - [ ] 4.2a 实现最近活动展示：clock 图标 + 相对时间 + 活动摘要（AC2）
  - [ ] 4.3 创建 `modules/project/components/ProjectCreateModal.tsx` — 新建项目模态表单
  - [ ] 4.4 创建 `modules/project/components/ProjectFilter.tsx` — 筛选栏组件（快速标签：全部/进行中/本周截止/有警告 + 高级筛选面板）
  - [ ] 4.4a 实现完整筛选维度：客户、行业、状态、截止日组合筛选（AC3/FR7）
  - [ ] 4.4b 实现智能排序：默认按截止日紧急度 + SOP 阶段权重排序，支持手动切换为按更新时间降序
  - [ ] 4.5 创建 `modules/project/components/ProjectEmptyState.tsx` — 空状态引导
  - [ ] 4.6 创建 `modules/project/hooks/useProjects.ts` — 项目数据消费 hook
  - [ ] 4.7 创建 `modules/project/types.ts` — 模块内类型定义
  - [ ] 4.8 创建 `modules/project/index.ts` — 模块导出
- [ ] Task 5: 项目编辑与归档 (AC: 1, 5)
  - [ ] 5.1 创建 `modules/project/components/ProjectEditModal.tsx` — 编辑项目表单
  - [ ] 5.2 项目卡片右上角添加操作菜单（编辑/归档/删除）
  - [ ] 5.3 删除操作使用 Modal.confirm 二次确认（不可逆操作）
  - [ ] 5.4 归档操作使用 Modal.confirm 确认
- [ ] Task 6: 项目文件目录初始化与 DB/FS 一致性 (AC: 4)
  - [ ] 6.1 在 project-service.ts 的 create 方法中，DB insert 成功后计算 rootPath（`data/projects/{id}/` 绝对路径）并写入 DB（update rootPath），然后初始化目录
  - [ ] 6.2 创建子目录：`assets/`，初始化空 `proposal.md` 和 `proposal.meta.json`
  - [ ] 6.3 实现 DB/FS 补偿逻辑：若 mkdir 或子文件创建失败，catch 中回滚 DB 记录（delete by id），向调用方抛出错误（BidWiseError），确保不出现"DB 有记录但目录不存在"的不一致状态
  - [ ] 6.4 project-service.ts 的 delete 方法中清理项目目录（先删目录再删 DB；若目录删除失败仅 log warning，不阻塞 DB 删除）
- [ ] Task 7: 单元测试 (AC: 全部)
  - [ ] 7.1 projectStore 测试：loadProjects / createProject / updateProject / deleteProject / archiveProject / filter
  - [ ] 7.2 ProjectKanban 组件渲染测试
  - [ ] 7.3 ProjectCard 组件 props 渲染测试
  - [ ] 7.4 ProjectCreateModal 表单验证测试（名称必填、提交成功/失败）
  - [ ] 7.5 ProjectFilter 筛选逻辑测试
  - [ ] 7.6 project-service 文件目录创建/清理测试
- [ ] Task 8: 集成验证 (AC: 全部)
  - [ ] 8.1 验证 IPC 全链路：UI → Store → IPC → Service → Repository → SQLite
  - [ ] 8.2 验证 lint / typecheck / build 全部通过
  - [ ] 8.3 验证冷启动时间仍 <5 秒
  - [ ] 8.4 存储一致性验证：项目创建后确认 SQLite 记录与 `data/projects/{id}/` 目录同时存在且一一对应（AC4）
  - [ ] 8.5 验证 industry 字段在创建/列表/筛选全链路正确传递

## Dev Notes

### 架构模式与约束

**核心分层架构（已由 Story 1.1-1.4 建立）：**
```
Renderer (React + Zustand) → Preload API (contextBridge) → IPC Handler (薄分发) → Service (业务逻辑) → Repository (Kysely) → SQLite
```

- IPC handler 禁止包含业务逻辑 — 只做参数解析 + 结果包装
- Service 层做业务验证（名称非空、重复检测等）
- Repository 层做数据访问（Kysely 查询，BidWiseError 包装）
- 所有错误使用 BidWiseError 类型体系，禁止 throw 裸字符串
- 所有日期使用 ISO-8601 格式
- 使用路径别名 `@main/*`、`@renderer/*`、`@shared/*`、`@modules/*`，禁止 `../../`

**Zustand Store 模式（本 Story 首次实现 Store，必须严格遵循）：**
```typescript
interface ProjectStore {
  // State
  projects: Project[]
  currentProject: Project | null
  loading: boolean        // 必须用 loading，不能用 isLoading/fetching/pending
  error: string | null
  filter: ProjectFilter
  // Actions
  loadProjects: () => Promise<void>
  createProject: (data: CreateProjectInput) => Promise<Project>
  // ...
}
```
- State + Actions 在同一 store 定义
- 异步 Action 内部管理 loading/error
- 禁止在 Action 内同步调用其他 store 的 Action
- 跨 store 数据聚合在组件层通过自定义 hooks 完成
- [Source: architecture.md Zustand Store 模式]

**统一 Response Wrapper：**
```typescript
{ success: true, data: T }
{ success: false, error: { code: string, message: string } }
```

### 已有代码资产（禁止重复创建）

以下代码已由 Story 1.1-1.4 实现，本 Story 直接复用：

| 已有文件 | 内容 | Story |
|----------|------|-------|
| `src/main/db/client.ts` | Kysely + better-sqlite3 + CamelCasePlugin 初始化 | 1.2 |
| `src/main/db/schema.ts` | DB 类型定义（ProjectTable, DB interface） | 1.2 |
| `src/main/db/migrations/001_initial_schema.ts` | projects 表 DDL | 1.2 |
| `src/main/db/repositories/project-repo.ts` | ProjectRepository（create/findById/findAll/update/delete/archive） | 1.2 |
| `src/main/services/project-service.ts` | projectService（create/get/list/update/delete/archive + 业务验证） | 1.2 |
| `src/main/ipc/create-handler.ts` | createIpcHandler 工厂函数 | 1.3 |
| `src/main/ipc/project-handlers.ts` | 6 个 project:* IPC channel handler | 1.3 |
| `src/shared/ipc-types.ts` | IpcChannelMap 类型映射（project:create/list/get/update/delete/archive） | 1.3 |
| `src/preload/index.ts` | contextBridge 白名单 API（projectCreate/List/Get/Update/Delete/Archive） | 1.3 |
| `src/main/utils/errors.ts` | BidWiseError / ValidationError / NotFoundError / DatabaseError | 1.1 |
| `src/shared/constants.ts` | ErrorCode 枚举 | 1.1 |
| `src/renderer/src/theme/antdTheme.ts` | Ant Design 主题配置 | 1.4 |
| `src/renderer/src/globals.css` | Tailwind v4 @theme tokens（颜色/间距/圆角/动画/排版） | 1.4 |
| `src/renderer/src/shared/components/icons/*.tsx` | 15 个 SVG 图标组件（批注/SOP/来源类型） | 1.4 |
| `src/renderer/src/shared/lib/platform.ts` | isMac / modKey / formatShortcut | 1.4 |

**关键提醒：**
- `project-service.ts` 和 `project-repo.ts` 已有完整 CRUD，本 Story 在其基础上扩展文件目录创建逻辑
- `projectStore.ts` 尚未实现（`stores/index.ts` 为空占位），本 Story 首次创建
- **新增 industry 字段**：需创建 `002_add_industry.ts` 迁移文件，在 projects 表中添加 `industry TEXT` 列；同步更新 `schema.ts`（ProjectTable）、`ipc-types.ts`（ProjectRecord/ProjectListItem/CreateProjectInput/UpdateProjectInput）、`migrator.ts`（注册到内联 migrations Record）、`project-repo.ts`、`project-service.ts`
- Tailwind v4 不使用 `tailwind.config.ts`，所有配置在 CSS `@theme` 块中
- Ant Design 5.29.3，层叠顺序 `@layer theme, base, antd, components, utilities`
- React 19.2.1，所有组件必须 React 19 兼容

### 现有数据库 Schema

**projects 表（已存在，由 001_initial_schema.ts 创建）：**

| 列名 (DB) | TS 属性 | 类型 | 说明 |
|-----------|---------|------|------|
| id | id | TEXT PK | UUID v4 |
| name | name | TEXT NOT NULL | 项目名称 |
| customer_name | customerName | TEXT | 客户名称 |
| deadline | deadline | TEXT | 截止日期 ISO-8601 |
| proposal_type | proposalType | TEXT DEFAULT 'presale-technical' | 方案类型 |
| sop_stage | sopStage | TEXT DEFAULT 'not-started' | SOP 阶段 |
| status | status | TEXT DEFAULT 'active' | 项目状态 |
| root_path | rootPath | TEXT | 项目文件根路径 |
| created_at | createdAt | TEXT NOT NULL | 创建时间 |
| updated_at | updatedAt | TEXT NOT NULL | 更新时间 |

**⚠️ 以下字段当前不存在，由本 Story 通过 002_add_industry 迁移添加：**

| 列名 (DB) | TS 属性 | 类型 | 说明 |
|-----------|---------|------|------|
| industry | industry | TEXT | 行业领域（如军工、医疗、能源等，用于 FR7 筛选） |

**DB↔TS 映射由 Kysely CamelCasePlugin 自动完成，禁止手动转换。**

### IPC 通道映射（已注册）

| Channel | Input | Output | Preload 方法 |
|---------|-------|--------|-------------|
| `project:create` | `CreateProjectInput` | `ProjectRecord` | `window.api.projectCreate(input)` |
| `project:list` | `void` | `ProjectListItem[]` | `window.api.projectList()` |
| `project:get` | `string` | `ProjectRecord` | `window.api.projectGet(id)` |
| `project:update` | `{ projectId, input }` | `ProjectRecord` | `window.api.projectUpdate(projectId, input)` |
| `project:delete` | `string` | `void` | `window.api.projectDelete(id)` |
| `project:archive` | `string` | `ProjectRecord` | `window.api.projectArchive(id)` |

### UX 设计规范

**看板布局（第一层）：**
```
┌─────────────────────────────────────────────────────┐
│  顶部导航（Logo + 全局搜索占位 + 设置，高度 56px）       │
├──────────────────────┬──────────────────────────────┤
│  智能待办面板         │  项目卡片网格                     │
│  （左侧，宽度 320px） │  （弹性宽度）                    │
│  ⚠️ Story 1.8 实现   │  每张卡片显示：                   │
│  本 Story 先占位      │  项目名 + SOP 阶段 + 截止日       │
│                      │  + 合规状态 + 最近活动             │
└──────────────────────┴──────────────────────────────┘
```
- [Source: ux-design-specification.md 项目看板布局]

**设计方向：** 项目看板使用 B（纯净画布）方向 — 白色背景 `#FFFFFF`，卡片式项目列表，留白舒适
- [Source: ux-design-specification.md 设计方向综合]

**Prototype References（开发查找顺序）：**
- 项目级标准母版: `_bmad-output/implementation-artifacts/prototypes/prototype.pen`
- Manifest: `_bmad-output/implementation-artifacts/prototypes/prototype-manifest.yaml`
- Story-bound `.pen`: `_bmad-output/implementation-artifacts/prototypes/story-1-5.pen`
- Reference PNG 目录: `_bmad-output/implementation-artifacts/prototypes/story-1-5/`
- Reference PNG 文件:
  - `pD0Gs.png` — 项目看板页面
  - `cQWId.png` — 新建项目表单
  - `xTWbW.png` — 项目卡片组件
- 全局风格基线: `story-1-4-color-system.png` / `story-1-4-typography.png` / `story-1-4-spacing-grid.png` / `story-1-4-icon-set.png`
- 还原原则：先看 reference PNG 做像素级静态还原，再打开 story-bound `.pen` 查看结构和交互细节；若需要确认共享标准组件/节奏，再回看 `prototype.pen`；若局部与全局风格基线冲突，以全局风格基线为准，除非 story 明确说明偏离

**项目卡片内容（与 `prototypes/story-1-5.pen` / 对应 reference PNG 对齐）：**
- 卡片头部：项目名称（16px, 600 weight）+ 右上角操作菜单（⋯ ellipsis 图标，编辑/归档/删除）
- 方案类型副标题（11px, text-secondary，如"售前技术方案"）
- SOP 阶段标签（圆点 8px + 文字 12px 500 weight，使用 SOP 状态色：灰/蓝/绿/橙）
- 元信息行：客户名称（building-2 图标 + 名称, 12px）| 截止日期（calendar 图标 + 日期, 12px）— 临近截止显示橙色警告色
- 合规状态行：标签"合规状态" + 占位"--"（12px, text-secondary，后续 Story 填充实际数据）
- 分割线（1px, border 色）
- 最近活动（clock 图标 + 时间描述, 12px, text-secondary）

**项目创建表单：**
- 垂直布局（标签在输入框上方），必填项标签前加红色星号 `*`
- 字段：项目名称（Input，必填）、客户名称（Input）、行业领域（Input，如军工/医疗/能源/金融等）、截止日期（DatePicker）、方案类型（Select disabled，MVP 固定 "售前技术方案"）
- 验证：实时验证 — 项目名称失焦时检查非空
- 提交验证 — 点击确认时校验全部
- 模态对话框（Modal），主操作按钮在右下
- [Source: ux-design-specification.md 表单布局与验证策略]

**筛选功能（与 `prototypes/story-1-5.pen` / 对应 reference PNG 对齐）：**
- 快速筛选：顶部水平标签（全部 / 进行中 / 本周截止 / 有警告），圆角背景 `$bg-global`，选中态白色背景 `$bg-content`
- 高级筛选：下拉面板按客户/行业/状态/截止日组合筛选（FR7 完整维度，需补充原型设计）
- 排序：默认智能排序（截止日紧急度 + SOP 阶段权重），可手动切换为按更新时间降序（arrow-up-down 图标 + 排序标签, 13px, text-secondary）
- [Source: ux-design-specification.md 项目看板筛选 — 快速筛选标签与智能排序]
- [Source: ux-design-specification.md 项目看板筛选, epics.md AC3]

**空状态设计：**
- 无项目时显示引导式占位符：说明文字 + "新建项目"操作入口
- [Source: ux-design-specification.md 空状态设计]

**交互反馈：**
- 创建成功：Toast 绿色 3 秒 "项目创建成功"
- 删除成功：Toast 信息 3 秒 "项目已删除"
- 归档成功：Toast 信息 3 秒 "项目已归档"
- 操作失败：内联错误条 + Toast 红色 5 秒
- [Source: ux-design-specification.md 反馈模式]

**Ant Design 组件使用：**
| 组件 | 用途 | 定制程度 |
|------|------|---------|
| Card | 项目卡片 | 中（自定义内容布局） |
| Modal | 新建/编辑/删除确认 | 低 |
| Form + Input + DatePicker + Select | 项目表单 | 低 |
| Tag | SOP 阶段标签 | 中（状态色编码） |
| Badge | 合规状态占位 | 低 |
| message (Toast) | 操作反馈 | 低 |
| Dropdown + Menu | 卡片操作菜单 | 低 |
| Empty | 空状态 | 中（自定义描述和按钮） |
| Tabs | 快速筛选标签 | 低 |
| Spin | 加载状态 | 低 |

**间距参考（8px 基准）：**
- 卡片内间距：`space-md`（16px）
- 卡片间距：`space-md`（16px）
- 页面级外边距：`space-lg`（24px）
- 按钮组间距：`space-sm`（8px）

**动画时长参考：**
- 按钮点击/状态切换：150-200ms ease-out
- 模态弹出/面板过渡：300ms ease-in-out
- 内容过渡：300-400ms ease-out

### Project Structure Notes

**新增文件预期：**
```
src/renderer/src/
├── stores/
│   └── projectStore.ts          ← 新建：首个 Zustand store
├── modules/project/
│   ├── components/
│   │   ├── ProjectKanban.tsx    ← 新建：看板主页面
│   │   ├── ProjectCard.tsx      ← 新建：项目卡片
│   │   ├── ProjectCreateModal.tsx ← 新建：创建表单
│   │   ├── ProjectEditModal.tsx  ← 新建：编辑表单
│   │   ├── ProjectFilter.tsx    ← 新建：筛选栏
│   │   └── ProjectEmptyState.tsx ← 新建：空状态
│   ├── hooks/
│   │   └── useProjects.ts       ← 新建：项目数据 hook
│   ├── types.ts                 ← 新建：模块类型
│   └── index.ts                 ← 新建：模块导出

tests/unit/renderer/
├── stores/
│   └── projectStore.test.ts     ← 新建
├── project/
│   ├── ProjectKanban.test.tsx   ← 新建
│   ├── ProjectCard.test.tsx     ← 新建
│   ├── ProjectCreateModal.test.tsx ← 新建
│   └── ProjectFilter.test.tsx   ← 新建
```

**修改文件预期：**
- `src/renderer/src/App.tsx` — 添加路由配置，移除 DesignSystemDemo 首页
- `src/main/services/project-service.ts` — 添加文件目录创建/清理逻辑 + DB/FS 补偿
- `src/main/db/schema.ts` — ProjectTable 添加 industry 字段
- `src/main/db/migrator.ts` — 注册 002_add_industry 迁移
- `src/shared/ipc-types.ts` — ProjectRecord/ProjectListItem/CreateProjectInput/UpdateProjectInput 添加 industry
- `package.json` — 添加 react-router-dom + zustand 依赖
- `src/renderer/src/stores/index.ts` — 导出 projectStore

### 技术决策记录

**路由方案：** HashRouter（非 BrowserRouter），因为 Electron 加载本地文件使用 `file://` 协议，BrowserRouter 需要服务端支持。HashRouter 使用 URL hash 部分进行路由，与 Electron 完全兼容。

**卡片网格布局：** 使用 CSS Grid `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))`，自适应列数。不使用 Ant Design Grid 的 Row/Col 以获得更灵活的自适应。

**智能待办面板：** 本 Story 左侧面板为占位（Story 1.8 实现），看板卡片区域占满全宽。后续 Story 1.8 添加左侧面板时不应修改 ProjectKanban 组件结构，只需在外层容器添加左侧面板。

**方案类型字段：** MVP 阶段固定为 "售前技术方案"，Select 组件 disabled 状态。字段保留在表单中让用户知道未来会有更多类型。

### 前序 Story 开发经验

**Story 1.4 关键经验：**
- Tailwind v4 不再使用 `tailwind.config.ts`，所有配置在 CSS `@theme` 块
- `@ant-design/cssinjs` + `StyleProvider layer` 解决 Ant Design 与 Tailwind 样式冲突
- 图标组件使用 SVG React 组件，线性风格 1.5px 线宽圆角端点
- DesignSystemDemo 页面为临时 UAT 页面，本 Story 替换为路由首页

**Story 1.3 关键经验：**
- `createIpcHandler<C>()` 工厂函数自动包装 try/catch → ApiResponse
- Preload API 使用 typedInvoke 内部辅助 + 白名单模式
- vi.hoisted() 解决 mock 初始化顺序问题

**Story 1.2 关键经验：**
- 测试使用 `:memory:` SQLite 数据库，beforeEach 重跑 migration 保证隔离
- CamelCasePlugin 自动映射后，PRAGMA 内省查询需用原始 db（不经过 plugin）
- `numUpdatedRows` 是 BigInt 类型（`0n` 比较）
- 同毫秒创建的记录排序需用集合比较而非顺序比较

### 测试规范

- **单元测试：** Vitest + @testing-library/react（jsdom 环境）
- **Store 测试：** 直接调用 store actions，mock `window.api.*` IPC 方法
- **组件测试：** render + fireEvent/userEvent，验证 DOM 输出
- **集成测试：** 如需要，在 `tests/integration/` 下创建
- **Mock 策略：** Mock preload API（`window.api.*`），不 mock 内部 store 逻辑
- **测试 setup：** `tests/unit/renderer/setup.ts` 已配置 matchMedia / getComputedStyle mock

### 反模式清单（禁止）

- ❌ 渲染进程直接 import Node.js 模块（如 fs、path）
- ❌ IPC handler 中写业务逻辑
- ❌ 手动 snake_case ↔ camelCase 转换（Kysely CamelCasePlugin 自动处理）
- ❌ 相对路径 import 超过 1 层（禁止 `../../`）
- ❌ throw 裸字符串（必须用 BidWiseError）
- ❌ Store Action 内同步调用其他 store 的 Action
- ❌ 创建 `tailwind.config.ts`（Tailwind v4 CSS-based only）
- ❌ 使用 `isLoading` / `fetching` / `pending`（统一用 `loading: boolean`）
- ❌ 重复创建已存在的 service / repository / IPC handler 代码

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5 投标项目创建与看板]
- [Source: _bmad-output/planning-artifacts/architecture.md#代码组织结构]
- [Source: _bmad-output/planning-artifacts/architecture.md#Zustand Store 模式]
- [Source: _bmad-output/planning-artifacts/architecture.md#IPC Handler 模式]
- [Source: _bmad-output/planning-artifacts/architecture.md#统一 Response Wrapper]
- [Source: _bmad-output/planning-artifacts/architecture.md#强制执行规则]
- [Source: _bmad-output/planning-artifacts/architecture.md#FR→目录映射]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#项目看板布局]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#设计方向综合]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#表单布局与验证策略]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#项目看板筛选]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#反馈模式]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#间距系统]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Ant Design 组件定制清单]
- [Source: _bmad-output/planning-artifacts/prd.md#FR1-FR8 投标项目管理]
- [Source: _bmad-output/implementation-artifacts/1-4-ui-framework-design-system.md]
- [Source: _bmad-output/implementation-artifacts/story-1-3.md]
- [Source: _bmad-output/implementation-artifacts/story-1-2.md]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### Change Log

- 2026-03-19 — Story 文件创建，包含完整开发上下文
- 2026-03-19 — 修复 codex 验证问题：AC3 补充行业筛选维度、DB 补充 industry 字段、AC4 补充数据隔离分层描述、补充过滤/活动/一致性任务、卡片和筛选 UI 描述与 story-bound prototype 对齐
- 2026-03-20 — 修复 6 项验证发现：①industry 字段补全到 ProjectRecord/ProjectListItem/UpdateProjectInput 类型 ②002_add_industry 需注册到 migrator.ts 内联 migrations Record ③Task 1 补充 zustand 依赖安装 ④快速筛选标签对齐 UX 规范（全部/进行中/本周截止/有警告 + 智能排序）⑤AC4 增加 rootPath 持久化策略和 DB/FS 部分失败补偿逻辑 ⑥Schema 表拆分为现有列和待添加列，明确 industry 由 002 迁移新增

### File List
