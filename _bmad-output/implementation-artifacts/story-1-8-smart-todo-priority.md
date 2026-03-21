# Story 1.8: 智能待办与优先级排序

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 多标并行时系统自动排列优先级,
So that 我知道该先处理哪个标，不会遗漏紧急任务。

## Acceptance Criteria

### AC1: 优先级排序算法

- **Given** 我有多个不同截止日和 SOP 阶段的项目
- **When** 查看智能待办面板
- **Then** 项目按截止日紧急度 × SOP 阶段优先级自动排序
- **Then** 排序规则：截止日越近权重越高（无截止日项目排最后），同等截止日紧急度下 SOP 阶段越靠后（越接近交付）权重越高
- **Then** 优先级分数（`priorityScore`）是确定性的：相同输入始终产生相同排序
- [Source: epics.md Story 1.8 AC1, FR3]

### AC2: 上下文状态恢复（零丢失）

- **Given** 我从项目 A 切换到项目 B 再切回 A
- **When** 切换回项目 A
- **Then** 系统自动恢复 SOP 阶段（已由 Story 1.6 持久化到 SQLite）
- **Then** 系统自动恢复看板上的待办展开/折叠状态（会话级缓存，非持久化）
- **Note** 编辑位置恢复依赖 Story 3.1（Plate 编辑器），本 Story 仅建立上下文恢复的 hook 骨架和 projectId 索引的状态存储模式，编辑位置字段在 Story 3.1 补充
- [Source: epics.md Story 1.8 AC2]

### AC3: 待办面板布局与展示

- **Given** 智能待办面板渲染
- **When** 查看看板布局
- **Then** 待办面板位于看板左侧（320px 宽度），与右侧项目卡片网格（弹性宽度）并排展示
- **Then** 面板标题 "智能待办"，下方按优先级降序列出各项目待办条目
- **Then** 每条待办显示：项目名称、SOP 阶段标签（状态色编码）、截止日（临近截止显示橙色警告色）、下一步动作摘要
- **Then** 点击待办条目导航到对应项目工作空间（`/project/:id`），自动定位到当前 SOP 阶段
- [Source: epics.md Story 1.8 AC3, UX-DR7]

### AC4: 面板折叠与响应式

- **Given** 智能待办面板在窗口宽度 <1280px 时
- **When** 空间不足
- **Then** 面板自动折叠为图标栏（48px），点击展开 flyout 覆盖层
- **Given** 用户手动折叠/展开面板
- **When** 操作后
- **Then** 面板状态在当前会话内保持，不被自动策略覆盖（手动 > 自动）

### AC5: 空状态与边界处理

- **Given** 系统中没有任何活跃项目
- **When** 查看智能待办面板
- **Then** 显示空状态引导："暂无待办事项。创建第一个投标项目开始。" + "新建项目"操作入口
- **Given** 所有项目均无截止日
- **When** 查看智能待办面板
- **Then** 仍按 SOP 阶段权重排序，截止日显示 "未设定"

## Tasks / Subtasks

- [ ] Task 1: 优先级计算服务 (AC: 1)
  - [ ] 1.1 创建 `src/main/services/todo-priority-service.ts` — 优先级计算逻辑
    - 导出 `calculatePriorityScore(project: ProjectRecord): number` 纯函数
    - 公式：`score = deadlineUrgency × 0.6 + sopStageWeight × 0.4`
    - `deadlineUrgency`：`max(0, 100 - daysUntilDeadline × 5)`，无截止日 = 0
    - `sopStageWeight`：not-started=0, requirements-analysis=20, solution-design=40, proposal-writing=60, cost-estimation=70, compliance-review=80, delivery=100
    - 使用原生 `Date` / 毫秒差值计算 `daysUntilDeadline`；当前主进程代码未声明 `date-fns` 直依赖，不要在 contract 中假设新库
    - 导出 `sortProjectsByPriority(projects: ProjectRecord[]): ProjectWithPriority[]` 排序函数
    - `sortProjectsByPriority()` 内部负责：过滤 `status === 'active'`、为每个项目填充 `priorityScore` + `nextAction`、按 `priorityScore` 降序排序；同分时使用 `updatedAt DESC`、`id ASC` 作为稳定 tie-breaker
    - `ProjectWithPriority` 扩展 `ProjectListItem` 添加 `priorityScore: number` 和 `nextAction: string`
  - [ ] 1.2 导出 `getNextAction(project: ProjectRecord): string` — 根据 SOP 阶段返回下一步动作摘要
    - not-started → "开始需求分析"
    - requirements-analysis → "完成招标文件解析"
    - solution-design → "生成方案骨架"
    - proposal-writing → "撰写方案内容"
    - cost-estimation → "完成成本评估"
    - compliance-review → "执行合规审查"
    - delivery → "导出交付物"

- [ ] Task 2: IPC 通道扩展 (AC: 1, 3)
  - [ ] 2.1 在 `src/shared/ipc-types.ts` 中同时添加：
    - `IPC_CHANNELS.PROJECT_LIST_WITH_PRIORITY = 'project:list-with-priority'`
    - `IpcChannelMap['project:list-with-priority']` — Input: `void`，Output: `ProjectWithPriority[]`
  - [ ] 2.2 在 `src/shared/ipc-types.ts` 中添加类型定义：
    - `ProjectWithPriority`：扩展 `ProjectListItem` 添加 `priorityScore: number` 和 `nextAction: string`
  - [ ] 2.3 在 `src/main/ipc/project-handlers.ts` 中注册新 handler：
    - `project:list-with-priority` → 调用 `projectService.list()` → `todoPriorityService.sortProjectsByPriority(projects)` → 返回
    - handler 保持薄分发；活跃项目过滤、`nextAction` 填充和排序 tie-breaker 全部在 service 内完成
  - [ ] 2.4 在 `src/preload/index.ts` 中添加 preload 方法：
    - `projectListWithPriority()` → `typedInvoke(IPC_CHANNELS.PROJECT_LIST_WITH_PRIORITY)`
    - `PreloadApi` 方法名由 `IpcChannelMap` 推导；无需手改 `src/preload/index.d.ts`

- [ ] Task 3: 智能待办 Zustand Store (AC: 1, 2, 3)
  - [ ] 3.1 创建 `src/renderer/src/stores/todoStore.ts` — 待办面板专用 store
    - State：`todoItems: ProjectWithPriority[]`、`loading: boolean`、`error: string | null`
    - Actions：`loadTodos()` — 调用 `window.api.projectListWithPriority()`
    - Actions：`clearError()`
    - 布局折叠状态放在 `useTodoPanel()`，不要与 store 双重持有
  - [ ] 3.2 在 `src/renderer/src/stores/index.ts` 中导出 `useTodoStore`

- [ ] Task 4: 上下文恢复 Hook 骨架 (AC: 2)
  - [ ] 4.1 创建 `src/renderer/src/modules/project/hooks/useContextRestore.ts`
    - 使用 `Map<string, ProjectContext>` 缓存每个项目的上下文状态（会话级，非持久化）
    - 在 hook 内本地声明 `type RestorableStageKey = Exclude<SopStageKey, 'not-started'>`
    - `ProjectContext` 接口：`{ sopStage: RestorableStageKey, lastVisitedAt: string }`（编辑位置字段 Story 3.1 补充）
    - 不要直接 import `useSopNavigation.ts` 内部的 `ActiveStageKey`，该类型当前是文件私有别名
    - 导出 `saveContext(projectId, context)` — 在离开项目时调用
    - 导出 `restoreContext(projectId): ProjectContext | null` — 在进入项目时调用
  - [ ] 4.2 在 `ProjectWorkspace.tsx` 中集成 `useContextRestore`：
    - `useEffect` cleanup 中调用 `saveContext` 保存当前 SOP 阶段快照
    - 进入项目时调用 `restoreContext(projectId)` 读取会话缓存，为后续编辑器定位等字段预留 hydration 入口
    - 当前 Story 不修改 `useSopNavigation(projectId, sopStage)` 的签名，也不绕过 Story 1.6 已有的 DB 恢复 / 默认阶段逻辑

- [ ] Task 5: SmartTodoPanel 组件 (AC: 3, 4, 5)
  - [ ] 5.1 创建 `src/renderer/src/modules/project/components/SmartTodoPanel.tsx` — 智能待办面板
    - 宽度 320px，背景色 `--color-bg-sidebar`（`#f5f5f5`）
    - 顶部标题栏："智能待办" + 项目计数 Badge + 折叠按钮（`MenuFoldOutlined`/`MenuUnfoldOutlined`）
    - 内容区：按 `priorityScore` 降序列出待办条目
    - 每条待办使用 `TodoItem` 子组件（见 Task 5.2）
    - 折叠态：标准模式收缩为 0px；紧凑模式（<1280px）收缩为 48px 图标栏 + flyout
    - 折叠过渡：`transition: width var(--duration-panel) var(--ease-in-out)`
    - 尊重 `prefers-reduced-motion`
  - [ ] 5.2 创建 `TodoItem` 子组件（内联在 SmartTodoPanel 或同文件导出）
    - 项目名称（14px, 500 weight，单行截断 `text-ellipsis`）
    - SOP 阶段标签（圆点 8px + 文字 12px，使用 SOP 状态色：灰/蓝/绿/橙）
    - 截止日（calendar 图标 + 日期 12px，临近 ≤3 天显示 `--color-warning` 橙色，已过期显示 `--color-danger` 红色）
    - 下一步动作摘要（12px, `text-text-tertiary` 或等价 token）
    - 点击整条 → `navigate(\`/project/${id}\`)`
    - hover 效果：背景色 `--color-bg-content`（`#ffffff`）+ 圆角 `--radius-md`
  - [ ] 5.3 空状态组件（内联）
    - 图标 + "暂无待办事项" + "创建第一个投标项目开始" + "新建项目"按钮
    - "新建项目"点击触发 `ProjectCreateModal` 的显示（通过回调 prop 传递）

- [ ] Task 6: 看板布局改造 (AC: 3, 4)
  - [ ] 6.1 修改 `src/renderer/src/modules/project/components/ProjectKanban.tsx`
    - 在 page content 区域添加水平 flex 布局：`<SmartTodoPanel />` + 项目卡片网格
    - SmartTodoPanel 固定 320px + 项目网格 `flex: 1`
    - 面板折叠时项目网格自然扩展占满全宽
  - [ ] 6.2 创建 `src/renderer/src/modules/project/hooks/useTodoPanel.ts` — 面板状态管理 hook
    - 状态：`collapsed: boolean`
    - 紧凑模式检测：监听 `window` resize（节流 200ms），当宽度 <1280px 自动折叠
    - 手动覆盖逻辑：用户手动操作后设置 `manualOverride` 标志，自动策略不再覆盖；窗口跨越 1280px 断点时重置（对齐 `useWorkspaceLayout.ts` 现有模式）
    - 初始状态：`window.innerWidth >= 1280 ? false : true`
  - [ ] 6.3 待办数据加载：`ProjectKanban` 挂载时调用 `useTodoStore().loadTodos()`
  - [ ] 6.4 待办数据刷新：项目创建/编辑/删除/归档后，自动重新加载待办列表（通过组件层 `useEffect` 监听 `projectStore.projects` 变化并触发 `todoStore.loadTodos()`）
    - 不在 `projectStore` action 内直接调用 `todoStore` action（遵循 architecture.md 的跨 store 约束）

- [ ] Task 7: 无障碍支持 (AC: 3, 4)
  - [ ] 7.1 面板整体 `role="complementary"` + `aria-label="智能待办"`
  - [ ] 7.2 折叠按钮 `aria-expanded="true|false"` + `aria-controls="todo-panel"`
  - [ ] 7.3 待办列表 `role="list"`，每条待办 `role="listitem"`
  - [ ] 7.4 每条待办可 Tab 聚焦 + Enter 导航到项目
  - [ ] 7.5 紧凑模式 flyout `role="dialog"` + `aria-label="智能待办面板"`
  - [ ] 7.6 焦点管理：flyout 打开时焦点移入，关闭时焦点返回触发按钮

- [ ] Task 8: 单元测试 (AC: 全部)
  - [ ] 8.1 `todo-priority-service` 测试：
    - `calculatePriorityScore` 测试各种截止日 + SOP 阶段组合
    - 无截止日项目的分数始终低于有截止日项目
    - 同截止日下 SOP 阶段越靠后分数越高
    - `sortProjectsByPriority` 排序正确性
    - `getNextAction` 各阶段返回正确文案
  - [ ] 8.2 `todoStore` 测试：
    - `loadTodos` 成功加载
    - `loadTodos` 失败设置 error
    - loading 状态管理
    - `clearError` 清除错误
  - [ ] 8.3 `SmartTodoPanel` 组件测试：
    - 正确渲染待办列表
    - 空状态渲染
    - 折叠/展开切换
    - 点击待办条目导航
    - 截止日临近警告色
    - ARIA 属性正确
  - [ ] 8.4 `useTodoPanel` hook 测试：
    - 初始状态根据窗口宽度
    - resize 触发紧凑模式
    - 手动覆盖逻辑
    - 跨越 1280px 断点时重置 `manualOverride`
  - [ ] 8.5 `useContextRestore` hook 测试：
    - save/restore 上下文
    - 未保存项目返回 null
    - 多项目独立缓存
  - [ ] 8.6 `ProjectKanban` 集成测试：
    - 待办面板 + 项目网格并排渲染
    - 面板折叠后网格扩展
  - [ ] 8.7 IPC handler 测试：
    - `project:list-with-priority` 返回带优先级分数的项目列表

- [ ] Task 9: 集成验证 (AC: 全部)
  - [ ] 9.1 验证全链路：IPC → Service → 排序算法 → Store → UI 渲染
  - [ ] 9.2 验证优先级排序：创建 3 个项目（不同截止日 + 不同 SOP 阶段），待办面板排序符合预期
  - [ ] 9.3 验证上下文恢复：进入项目 A → 切换 SOP 阶段 → 返回看板 → 再进入项目 A → SOP 阶段恢复
    - SOP 阶段恢复依赖 Story 1.6 的 SQLite 持久化；`useContextRestore` 的会话缓存不与其冲突
  - [ ] 9.4 验证面板折叠：手动折叠/展开 + 窗口缩小触发紧凑模式 + 手动覆盖不被自动策略冲突
  - [ ] 9.5 验证导航：点击待办条目跳转到正确项目工作空间
  - [ ] 9.6 验证 `lint && typecheck && build` 全部通过
  - [ ] 9.7 验证与 Story 1.5/1.6/1.7/1.9 功能无回归

## Dev Notes

### 架构模式与约束

**核心分层架构（已由 Story 1.1-1.7 建立）：**
```
Renderer (React + Zustand) → Preload API (contextBridge) → IPC Handler (薄分发) → Service (业务逻辑) → Repository (Kysely) → SQLite
```

- IPC handler 禁止包含业务逻辑 — 只做参数解析 + 结果包装
- Service 层做业务验证和数据转换
- 所有错误使用 BidWiseError 类型体系，禁止 throw 裸字符串
- 使用路径别名 `@main/*`、`@renderer/*`、`@shared/*`、`@modules/*`，禁止 `../../`
- Store loading 状态字段统一用 `loading: boolean`

### 关键约束：本 Story 跨主进程和渲染进程

- **主进程变更**：新增 `todo-priority-service.ts`（纯计算，不涉及 DB 新表）、扩展 `project-handlers.ts`
- **渲染进程变更**：新增 `todoStore.ts`、`SmartTodoPanel.tsx`、`useTodoPanel.ts`、`useContextRestore.ts`；修改 `ProjectKanban.tsx`
- **不新增 DB 表**：优先级计算基于现有 `projects` 表的 `deadline` + `sopStage` 字段实时计算，不持久化 `priorityScore`
- **不涉及 task-queue**：优先级计算是同步纯函数，不属于长耗时异步操作

### 已有代码资产（禁止重复创建）

| 已有文件 | 内容 | Story |
|----------|------|-------|
| `src/main/db/schema.ts` | DB 类型定义（ProjectTable 含 deadline, sopStage） | 1.2 |
| `src/main/db/repositories/project-repo.ts` | ProjectRepository（findAll 返回所有项目） | 1.2 |
| `src/main/services/project-service.ts` | projectService（list 返回 ProjectRecord[]） | 1.2 |
| `src/main/ipc/create-handler.ts` | createIpcHandler 工厂函数 | 1.3 |
| `src/main/ipc/project-handlers.ts` | project:* IPC handlers | 1.3 |
| `src/shared/ipc-types.ts` | IpcChannelMap + ProjectRecord/ProjectListItem 类型 | 1.3 |
| `src/preload/index.ts` | contextBridge 白名单 API | 1.3 |
| `src/main/utils/errors.ts` | BidWiseError / ValidationError / NotFoundError | 1.1 |
| `src/renderer/src/stores/projectStore.ts` | useProjectStore（projects, filter, sortMode） | 1.5 |
| `src/renderer/src/modules/project/components/ProjectKanban.tsx` | 看板主页面 | 1.5 |
| `src/renderer/src/modules/project/components/ProjectCard.tsx` | 项目卡片 | 1.5 |
| `src/renderer/src/modules/project/components/ProjectCreateModal.tsx` | 创建表单 | 1.5 |
| `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` | 工作空间容器 | 1.6 |
| `src/renderer/src/modules/project/hooks/useSopNavigation.ts` | SOP 导航逻辑 | 1.6 |
| `src/renderer/src/modules/project/hooks/useCurrentProject.ts` | 加载当前项目 | 1.6 |
| `src/renderer/src/modules/project/hooks/useWorkspaceLayout.ts` | 面板折叠/响应式 | 1.7 |
| `src/renderer/src/modules/project/types.ts` | SopStageKey, SOP_STAGES 等 | 1.5/1.6 |
| `src/renderer/src/globals.css` | CSS 变量（SOP 色、间距、动效时长） | 1.4 |
| `src/renderer/src/theme/tokens.ts` | TS design tokens | 1.4 |
| `src/renderer/src/shared/lib/platform.ts` | isMac / modKey | 1.4 |

**关键提醒：**
- `useProjects.ts` 已在 renderer 层实现看板卡片的 smart 排序（截止日 + SOP 阶段权重）；本 Story 的智能待办排序是独立的主进程聚合视图，不替换现有卡片排序
- `ProjectRepository.findAll()` / `projectService.list()` 返回所有项目（含 `archived`，按 `updatedAt DESC`）；`todo-priority-service` 必须显式过滤 `status === 'active'`
- `useWorkspaceLayout.ts` 的面板折叠模式（断点检测 + 手动覆盖 + flyout）已在 Story 1.7 建立 — 本 Story 的 `useTodoPanel` 应复用相同模式
- `IPC_CHANNELS`、`IpcChannelMap`、`PreloadApi` 在 `src/shared/ipc-types.ts` / `src/preload/index.ts` 中是联动约束；新增 channel 不能只改类型不改 preload 实现
- `ProjectKanban.tsx` 当前是 header + filter + 单列 grid 布局，没有现成待办占位，需要直接改造 main content 区域
- `useSopNavigation.ts` 内部的 `ActiveStageKey` 当前未导出；新 hook 不能直接依赖该私有类型名

### 现有数据库 Schema（不变更）

**projects 表：**

| 列名 (DB) | TS 属性 | 类型 | 与本 Story 的关系 |
|-----------|---------|------|------------------|
| id | id | TEXT PK | 待办条目的项目标识 |
| name | name | TEXT NOT NULL | 待办条目显示项目名 |
| deadline | deadline | TEXT | 优先级计算因子（截止日紧急度） |
| sop_stage | sopStage | TEXT | 优先级计算因子（SOP 阶段权重） |
| status | status | TEXT | 筛选活跃项目（仅 'active' 参与排序） |
| customer_name | customerName | TEXT | 待办条目可选显示 |
| updated_at | updatedAt | TEXT | 数据变更检测 |

**不新增 DB 表或迁移** — 优先级分数在服务层实时计算，不持久化。

### IPC 通道映射（已注册 + 本 Story 新增）

| Channel | 状态 | Input | Output |
|---------|------|-------|--------|
| `project:list` | 已有 | `void` | `ProjectListItem[]` |
| `project:list-with-priority` | **新增** | `void` | `ProjectWithPriority[]` |

### UX 设计规范

**看板布局（含智能待办面板）：**
```
┌─────────────────────────────────────────────────────┐
│  顶部导航（Logo + 全局搜索占位 + 设置，高度 56px）       │
├──────────────────────┬──────────────────────────────┤
│  智能待办面板         │  项目卡片网格                     │
│  （左侧，宽度 320px） │  （弹性宽度）                    │
│  按优先级排列         │  每张卡片显示：                   │
│  今日关键待办         │  项目名 + SOP 阶段 + 截止日       │
│                      │  + 合规状态 + 最近活动             │
└──────────────────────┴──────────────────────────────┘
```
- [Source: ux-design-specification.md 项目看板布局 UX-DR7]

**待办条目设计：**
- 条目垂直列表，每条 padding `space-sm`（8px）上下 + `space-md`（16px）左右
- 分割线 1px `--color-border` 分隔
- 截止日临近（≤3天）：日期文字使用 `--color-warning`（橙色 `#FAAD14`）
- 截止日已过期：日期文字使用 `--color-danger`（红色 `#FF4D4F`）
- 无截止日：显示"未设定"，使用 `text-text-tertiary` 颜色

**面板折叠规格（复用 Story 1.7 模式）：**
- 标准模式（≥1280px）：面板展开 320px
- 紧凑模式（<1280px）：折叠为 48px 图标栏，点击展开 flyout
- flyout 动效：水平滑入 `translateX(100%) → translateX(0)` + `--duration-panel` + `--ease-in-out`
- 尊重 `prefers-reduced-motion`

**Ant Design 组件使用：**

| 组件 | 用途 | 定制程度 |
|------|------|---------|
| Badge | 面板标题待办计数 | 低 |
| Tag | SOP 阶段标签 | 中（状态色编码） |
| Empty | 空状态 | 中（自定义描述和按钮） |
| Button | 折叠按钮、新建项目 | 低 |
| Tooltip | 紧凑模式图标栏 hover | 低 |

**间距参考（8px 基准）：**
- 面板内间距：`space-md`（16px）
- 条目间 padding：`space-sm`（8px）上下
- 标题栏高度：48px
- 面板与卡片网格间距：`space-md`（16px）

**Prototype References（开发查找顺序）：**
- 项目级标准母版: `_bmad-output/implementation-artifacts/prototypes/prototype.pen`
- Manifest: `_bmad-output/implementation-artifacts/prototypes/prototype-manifest.yaml`
- Story-bound `.pen`: `_bmad-output/implementation-artifacts/prototypes/story-1-8.pen`
- Story screenshots: `_bmad-output/implementation-artifacts/prototypes/story-1-8/8c0vm.png` / `ErK6n.png` / `NjHR3.png`
- 全局风格基线: `story-1-4-color-system.png` / `story-1-4-typography.png` / `story-1-4-spacing-grid.png` / `story-1-4-icon-set.png`
- 还原原则：优先以 story-bound `.pen` + story screenshots 为准，其次参考 UX 规范文档与全局风格基线

### 优先级算法详细设计

```typescript
// 截止日紧急度（0-100）
const MS_PER_DAY = 24 * 60 * 60 * 1000

function deadlineUrgency(deadline: string | null): number {
  if (!deadline) return 0 // 无截止日 = 最低紧急度
  const deadlineMs = new Date(deadline).getTime()
  if (Number.isNaN(deadlineMs)) return 0
  const daysLeft = Math.floor((deadlineMs - Date.now()) / MS_PER_DAY)
  if (daysLeft <= 0) return 100 // 已过期 = 最高紧急度
  return Math.max(0, 100 - daysLeft * 5) // 20天后趋近于0
}

// SOP 阶段权重（0-100）
const SOP_STAGE_WEIGHTS: Record<SopStageKey, number> = {
  'not-started': 0,
  'requirements-analysis': 20,
  'solution-design': 40,
  'proposal-writing': 60,
  'cost-estimation': 70,
  'compliance-review': 80,
  'delivery': 100,
}

// 综合优先级分数
function calculatePriorityScore(project: ProjectRecord): number {
  const urgency = deadlineUrgency(project.deadline)
  const stageWeight = SOP_STAGE_WEIGHTS[project.sopStage as SopStageKey] ?? 0
  return urgency * 0.6 + stageWeight * 0.4
}

type ProjectWithPriority = ProjectListItem & {
  priorityScore: number
  nextAction: string
}

function sortProjectsByPriority(projects: ProjectRecord[]): ProjectWithPriority[] {
  return projects
    .filter((project) => project.status === 'active')
    .map((project) => ({
      id: project.id,
      name: project.name,
      customerName: project.customerName,
      industry: project.industry,
      deadline: project.deadline,
      sopStage: project.sopStage,
      status: project.status,
      updatedAt: project.updatedAt,
      priorityScore: calculatePriorityScore(project),
      nextAction: getNextAction(project),
    }))
    .sort(
      (a, b) =>
        b.priorityScore - a.priorityScore ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() ||
        a.id.localeCompare(b.id)
    )
}
```

**排序规则验证案例（PRD Journey 2 场景）：**
| 项目 | 截止日 | SOP 阶段 | urgency | stageWeight | score |
|------|--------|----------|---------|-------------|-------|
| A标 | 明天（1天后） | delivery | 95 | 100 | 97 |
| B标 | 3天后 | compliance-review | 85 | 80 | 83 |
| C标 | 未设定 | requirements-analysis | 0 | 20 | 8 |

排序结果：A标(97) > B标(83) > C标(8) ✓ 符合 PRD 用户旅程预期

### Project Structure Notes

**新增文件：**
```
src/main/
└── services/
    └── todo-priority-service.ts          ← 新建：优先级计算

src/renderer/src/
├── stores/
│   └── todoStore.ts                     ← 新建：待办面板 store
├── modules/project/
│   ├── components/
│   │   └── SmartTodoPanel.tsx           ← 新建：智能待办面板
│   └── hooks/
│       ├── useTodoPanel.ts             ← 新建：面板折叠/响应式
│       └── useContextRestore.ts        ← 新建：上下文恢复骨架

tests/
├── unit/main/services/
│   └── todo-priority-service.test.ts    ← 新建
├── unit/renderer/stores/
│   └── todoStore.test.ts               ← 新建
├── unit/renderer/project/
│   ├── SmartTodoPanel.test.tsx          ← 新建
│   ├── useTodoPanel.test.ts            ← 新建
│   └── useContextRestore.test.ts       ← 新建
```

**修改文件：**
- `src/shared/ipc-types.ts` — 添加 `IPC_CHANNELS.PROJECT_LIST_WITH_PRIORITY` + `IpcChannelMap['project:list-with-priority']` + `ProjectWithPriority` 类型
- `src/main/ipc/project-handlers.ts` — 注册 `project:list-with-priority` handler
- `src/preload/index.ts` — 添加 `projectListWithPriority` preload 方法
- `src/renderer/src/modules/project/components/ProjectKanban.tsx` — 添加 SmartTodoPanel 到看板布局
- `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` — 集成 useContextRestore
- `src/renderer/src/modules/project/index.ts` — 添加新组件/hook 导出
- `src/renderer/src/stores/index.ts` — 导出 useTodoStore
- `tests/unit/main/ipc/project-handlers.test.ts` — 为第 7 个 `project:*` channel 添加断言
- `tests/unit/renderer/project/ProjectKanban.test.tsx` — 扩展看板布局 + 智能待办面板断言

### 技术决策记录

**不新增 DB 表的理由：** 优先级分数是 `deadline × sopStage` 的确定性函数，实时计算成本极低（<1ms for 100 projects），持久化反而引入数据一致性维护负担。

**独立 todoStore 而非扩展 projectStore 的理由：** 待办面板关注的是跨项目的优先级聚合视图，与 projectStore 的单项目 CRUD + 看板筛选职责不同。独立 store 避免 projectStore 膨胀，且符合"per-domain stores"原则。

**todoStore 不持有 `panelCollapsed` 的理由：** 面板折叠属于局部布局状态；现有代码用 `useWorkspaceLayout()` 这类 hook 管理布局，而不是在 Zustand 中保存。`useTodoPanel()` 应复用这一模式，避免 store / hook 双写。

**优先使用原生 Date 的理由：** 现有主进程 / renderer 代码以 `Date` 为主（仅 Ant Design `DatePicker` 适配处使用 `dayjs`）；本 Story 不应隐含引入新的日期库依赖。

**断点选择 1280px 而非 1440px：** 看板页面比工作空间页面信息密度低（无三栏布局），320px 待办面板 + 卡片网格在 1280px 仍可舒适展示。工作空间的 1440px 断点保持不变。

### 前序 Story 开发经验

**Story 1.7 关键经验（面板折叠模式）：**
- `useWorkspaceLayout.ts` 中的断点检测 + 手动覆盖 + flyout 模式可作为 `useTodoPanel` 的参考实现
- flyout 动画使用 `@keyframes` + `prefers-reduced-motion` 降级已在 `globals.css` 中建立
- 紧凑模式图标栏行为：hover tooltip、click 展开 flyout、外部点击/Escape 关闭

**Story 1.5 关键经验（看板布局）：**
- `ProjectKanban.tsx` 使用 CSS Grid `repeat(auto-fill, minmax(320px, 1fr))`
- 项目创建后自动刷新列表
- 筛选逻辑在 `useProjects` hook 中处理

**Story 1.6 关键经验（SOP 导航）：**
- SOP 阶段通过 `project:update` IPC 持久化到 SQLite
- `useSopNavigation` 管理当前激活阶段
- 阶段跳转有约束提示（可跳但带警告）

### 测试规范

- **单元测试：** Vitest + @testing-library/react（jsdom 环境）
- **Store 测试：** 直接调用 store actions，mock `window.api.*` IPC 方法
- **组件测试：** render + fireEvent/userEvent，验证 DOM 输出
- **Service 测试：** 纯函数测试（`todo-priority-service` 不依赖 DB mock）
- **Mock 策略：** Mock preload API（`window.api.*`），不 mock 内部 store 逻辑
- **测试 setup：** `tests/unit/renderer/setup.ts` 已配置 matchMedia / getComputedStyle mock
- **jsdom 注意：** `window.innerWidth` 在 jsdom 中默认 0，测试前需 `Object.defineProperty(window, 'innerWidth', { value: 1600 })` 设置初始宽度

### 反模式清单（禁止）

- ❌ 渲染进程直接 import Node.js 模块
- ❌ IPC handler 中写业务逻辑（优先级计算在 service 层）
- ❌ 手动 snake_case ↔ camelCase 转换
- ❌ 相对路径 import 超过 1 层（禁止 `../../`）
- ❌ throw 裸字符串（必须用 BidWiseError）
- ❌ Store Action 内同步调用其他 store 的 Action（todoStore 不直接调用 projectStore）
- ❌ 使用 `isLoading` / `fetching` / `pending`（统一用 `loading: boolean`）
- ❌ 将 priorityScore 持久化到 DB（实时计算即可）
- ❌ 在 renderer 层做日期计算（优先级计算在主进程 service 完成）

### 快捷键冲突规避

已注册快捷键：`Alt+2~6`（SOP 阶段, 1.6）、`Cmd/Ctrl+B`（侧边栏, 1.7）、`Cmd/Ctrl+\`（大纲, 1.7）、`Cmd/Ctrl+K`（命令面板, 1.9）
本 Story 不新增快捷键。

### References

- [Source: _bmad-output/planning-artifacts/epics.md Story 1.8 — 智能待办与优先级排序 AC]
- [Source: _bmad-output/planning-artifacts/prd.md FR3 — 多项目待办优先级自动排列]
- [Source: _bmad-output/planning-artifacts/prd.md FR6 — 项目数据隔离上下文互不干扰]
- [Source: _bmad-output/planning-artifacts/prd.md Journey 2 — 多标并行管理]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md UX-DR7 — 项目看板布局]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md §情感旅程 — 焦虑→安心：优先级已排好]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md §信息架构 — 第一层：项目看板+智能待办排序]
- [Source: _bmad-output/planning-artifacts/architecture.md §Zustand Store 模式]
- [Source: _bmad-output/planning-artifacts/architecture.md §IPC Handler 模式]
- [Source: CLAUDE.md — 路径别名、命名约定、Anti-Patterns]
- [Source: src/renderer/src/modules/project/hooks/useProjects.ts — renderer 侧看板 smart sort 已实现]
- [Source: src/renderer/src/modules/project/hooks/useSopNavigation.ts — `ActiveStageKey` 当前为文件私有类型别名]
- [Source: src/renderer/src/globals.css — `--color-danger` / `--color-text-tertiary` / `flyout-slide-in`]
- [Source: story-1-7-workspace-layout-shell.md — 面板折叠/响应式模式参考]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### Change Log

- 2026-03-21 — Story 文件创建，包含完整开发上下文

### File List
