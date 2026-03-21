# Story 1.7: 项目工作空间三栏布局壳子

Status: ready-for-dev

## Story

As a 售前工程师,
I want 进入项目后看到清晰的三栏工作空间框架,
So that 后续的编辑器、批注、大纲等模块有统一的承载壳层。

## Acceptance Criteria

### AC1: 三栏布局渲染

- **Given** 进入项目工作空间（`/project/:id`）
- **When** 布局渲染
- **Then** 展示三栏布局壳子：文档大纲树（左侧 240px 可折叠）+ 主内容区（弹性宽度 min 600px）+ 侧边栏（右侧 320px 可折叠）+ 状态栏（底部 32px）
- [Source: epics.md Story 1.7 AC1, UX-DR6, ux-design-specification.md §工作空间布局]

### AC2: 面板折叠快捷键

- **Given** 用户在项目工作空间内
- **When** 按 `Cmd/Ctrl+B`
- **Then** 切换右侧侧边栏的展开/折叠
- **When** 按 `Cmd/Ctrl+\`
- **Then** 切换左侧大纲树的展开/折叠
- [Source: epics.md Story 1.7 AC2, UX-DR27, ux-design-specification.md §快捷键体系]

### AC3: 紧凑模式自动响应

- **Given** 窗口宽度 <1440px
- **When** 紧凑模式触发
- **Then** 大纲折叠，侧边栏折叠为图标+Badge 模式
- **Then** 用户手动展开的面板状态优先于自动策略（手动 > 自动）
- [Source: epics.md Story 1.7 AC3, UX-DR25, ux-design-specification.md §断点策略]

### AC4: 主内容区限宽

- **Given** 主内容区渲染
- **When** 布局渲染
- **Then** 内容限宽 800px（阅读舒适宽度），两侧留白自然吸收；宽表格自动可横滚
- [Source: epics.md Story 1.7 AC4, UX-DR6, ux-design-specification.md §大屏优化]

## Tasks / Subtasks

- [ ] Task 1: 三栏布局容器组件 (AC: 1)
  - [ ] 1.1 创建 `src/renderer/src/modules/project/components/WorkspaceLayout.tsx` — 三栏布局容器
    - 接收 `left`、`center`、`right`、`statusBar` 四个 ReactNode slot
    - 使用 CSS flexbox：左面板固定 240px + 主内容区 `flex:1 min-w-[600px]` + 右面板固定 320px
    - 面板折叠时宽度过渡动画使用 `--duration-panel`（300ms）+ `--ease-in-out`（面板过渡类动效统一使用 ease-in-out，见 ux-design-specification.md §动效规范）
  - [ ] 1.2 修改 `ProjectWorkspace.tsx` — 将当前单栏布局替换为 `<WorkspaceLayout>`
    - `left` slot → `<OutlinePanel />`
    - `center` slot → 当前的 `<StageGuidePlaceholder />`（包裹在 800px 限宽容器内）
    - `right` slot → `<AnnotationPanel />`
    - `statusBar` slot → `<StatusBar />`
    - 保持现有 header + SopProgressBar 不变

- [ ] Task 2: 左侧大纲面板占位 (AC: 1)
  - [ ] 2.1 创建 `src/renderer/src/modules/project/components/OutlinePanel.tsx` — 左侧面板壳子
    - 宽度 240px，背景色 `--color-bg-sidebar`（`#f5f5f5`）
    - 顶部标题栏："文档大纲" + 折叠按钮（`MenuFoldOutlined`/`MenuUnfoldOutlined`）
    - 内容区 Alpha 阶段显示占位文案："大纲内容将在编辑器模块（Story 3.2）中加载"
    - 折叠态：宽度收缩为 0（完全隐藏），通过 CSS transition 平滑过渡
  - [ ] 2.2 折叠/展开受 `useWorkspaceLayout` hook 控制（见 Task 4）

- [ ] Task 3: 右侧批注面板占位 (AC: 1)
  - [ ] 3.1 创建 `src/renderer/src/modules/project/components/AnnotationPanel.tsx` — 右侧面板壳子
    - 宽度 320px，背景色 `--color-bg-content`（`#ffffff`），左边框 `--color-border`
    - 顶部标题栏："智能批注" + 折叠按钮 + Badge 计数占位（`0`）
    - 内容区 Alpha 阶段显示占位文案："批注面板将在批注模块（Epic 4）中加载"
    - 折叠态：
      - 标准模式（≥1440px）：宽度收缩为 0
      - 紧凑模式（<1440px）：折叠为 48px 图标栏，显示批注图标（`CommentOutlined`）+ Badge 计数
        - **图标栏行为**：图标按钮可聚焦，hover 显示 tooltip "智能批注"
        - **点击展开 flyout**：点击图标栏弹出浮层面板（宽度 320px，`position: absolute; right: 48px; top: 0; z-index: 10`），覆盖在主内容区之上而不挤压布局
        - **flyout 关闭**：点击面板外区域或再次点击图标栏关闭 flyout；按 `Escape` 关闭 flyout
        - **flyout 动效**：水平滑入 `transform: translateX(100%) → translateX(0)` + `--duration-panel` + `--ease-in-out`
        - Alpha 阶段 flyout 内容同占位文案
    - 参考：ux-design-specification.md §断点策略 :1163 — "批注折叠为图标+Badge，点击展开浮层"
  - [ ] 3.2 折叠/展开受 `useWorkspaceLayout` hook 控制（见 Task 4）

- [ ] Task 4: 面板状态管理 hook (AC: 1, 2, 3)
  - [ ] 4.1 创建 `src/renderer/src/modules/project/hooks/useWorkspaceLayout.ts`
    - 状态：`outlineCollapsed: boolean`、`sidebarCollapsed: boolean`
    - 动作：`toggleOutline()`、`toggleSidebar()`
    - 紧凑模式检测：监听 `window` resize 事件（节流 200ms），当宽度 <1440px 自动折叠两侧面板
    - 手动覆盖逻辑：用户手动操作后设置 `manualOverride` 标志，自动策略不再覆盖，直到窗口宽度跨越断点时重置
    - 初始状态：`window.innerWidth >= 1440 ? false : true`（即宽屏默认展开，窄屏默认折叠）

- [ ] Task 5: 面板快捷键 (AC: 2)
  - [ ] 5.1 创建 `src/renderer/src/modules/project/hooks/useWorkspaceKeyboard.ts`
    - `Cmd/Ctrl+B` → `toggleSidebar()`（切换右侧批注面板）
    - `Cmd/Ctrl+\` → `toggleOutline()`（切换左侧大纲面板）
    - 使用 `useEffect` + `keydown` 监听，检测 `metaKey`（macOS）或 `ctrlKey`（Windows）
    - `preventDefault()` 阻止浏览器默认行为
  - [ ] 5.2 在 `ProjectWorkspace` 中挂载此 hook，仅在 `/project/:id` 路由下激活

- [ ] Task 6: 底部状态栏 (AC: 1)
  - [ ] 6.1 创建 `src/renderer/src/modules/project/components/StatusBar.tsx`
    - 固定底部 32px 高度，背景色 `--color-bg-content`，上边框 `--color-border`
    - Alpha 阶段显示三个占位指标（均为灰色禁用态）：
      - 合规分：`"合规 --"` + `CheckCircleOutlined` 图标
      - 质量分：`"质量 --"` + `DashboardOutlined` 图标
      - 字数：`"字数 --"` + `FileTextOutlined` 图标
    - 右侧显示当前 SOP 阶段名称（从 props 接收）
    - 使用 `text-caption`（12px）字号，`text-text-tertiary` 颜色

- [ ] Task 7: 主内容区 800px 限宽容器 (AC: 4)
  - [ ] 7.1 在 `WorkspaceLayout` 的 center slot 内创建限宽包装：
    - `max-width: 800px`，`margin: 0 auto`，左右 `padding: --spacing-lg`（24px）
    - 宽表格（`<table>`）设置 `overflow-x: auto` 允许横滚
    - 不影响 `StageGuidePlaceholder` 的居中布局（placeholder 本身已 flex 居中）

- [ ] Task 8: 单元测试 (AC: 全部)
  - [ ] 8.1 `WorkspaceLayout` 组件测试：三栏正确渲染、面板折叠/展开切换、折叠动画类名切换
  - [ ] 8.2 `OutlinePanel` 组件测试：渲染标题和占位内容、折叠按钮触发回调
  - [ ] 8.3 `AnnotationPanel` 组件测试：渲染标题和 Badge、折叠按钮触发回调、紧凑模式图标栏渲染、紧凑模式点击图标打开 flyout、flyout 外点击关闭、Escape 关闭 flyout
  - [ ] 8.4 `StatusBar` 组件测试：三个占位指标正确渲染、SOP 阶段名称显示
  - [ ] 8.5 `useWorkspaceLayout` hook 测试：初始状态、toggleOutline/toggleSidebar、resize 触发紧凑模式、手动覆盖逻辑
  - [ ] 8.6 `useWorkspaceKeyboard` hook 测试：Cmd/Ctrl+B 触发 toggleSidebar、Cmd/Ctrl+\ 触发 toggleOutline
  - [ ] 8.7 `ProjectWorkspace` 集成测试：三栏布局渲染、面板折叠后主内容区宽度正确扩展
  - [ ] 8.8 无障碍测试：面板折叠按钮 `aria-expanded` 切换、侧栏 `role="complementary"` 存在、状态栏 `role="status"` 存在、键盘 Tab 可遍历所有可交互元素

- [ ] Task 9: 集成验证 (AC: 全部)
  - [ ] 9.1 验证全链路：看板卡片 → 进入工作空间 → 三栏布局 + SOP 进度条 + 状态栏均正确渲染
  - [ ] 9.2 验证面板折叠：Cmd/Ctrl+B 和 Cmd/Ctrl+\ 正确切换对应面板
  - [ ] 9.3 验证紧凑模式：手动调整窗口宽度 <1440px → 两侧面板自动折叠；手动展开后不被自动策略覆盖
  - [ ] 9.4 验证内容限宽：主内容区内容不超过 800px，两侧留白自然吸收
  - [ ] 9.5 验证 `lint && typecheck && build` 全部通过
  - [ ] 9.6 验证与 Story 1.6 功能无回归：SOP 导航、阶段跳转、快捷键、状态持久化均正常

## Dev Notes

### 架构模式与约束

**核心分层架构（已由 Story 1.1-1.5 建立）：**
```
Renderer (React + Zustand) → Preload API (contextBridge) → IPC Handler (薄分发) → Service (业务逻辑) → Repository (Kysely) → SQLite
```

- IPC handler 禁止包含业务逻辑 — 只做参数解析 + 结果包装
- 所有错误使用 BidWiseError 类型体系，禁止 throw 裸字符串
- 使用路径别名 `@main/*`、`@renderer/*`、`@shared/*`、`@modules/*`，禁止 `../../`
- Store loading 状态字段统一用 `loading: boolean`

### 关键约束：本 Story 是纯前端布局壳子

- **不涉及 IPC / 主进程 / 数据库** — 所有变更限于 `src/renderer/` 内
- **不涉及新 Zustand store** — 面板折叠状态用组件级 hook（`useWorkspaceLayout`）管理，非全局状态
- **不涉及 AI/异步任务** — 无 task-queue 需求

### 已有代码资产（禁止重复创建）

| 已有文件 | 内容 | Story |
|----------|------|-------|
| `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` | 工作空间顶层容器（header + SOP bar + 单栏内容） | 1.6 |
| `src/renderer/src/modules/project/components/SopProgressBar.tsx` | SOP 6 阶段进度条 | 1.6 |
| `src/renderer/src/modules/project/components/StageGuidePlaceholder.tsx` | 各阶段引导占位符 | 1.6 |
| `src/renderer/src/modules/project/hooks/useCurrentProject.ts` | 加载当前项目 hook | 1.6 |
| `src/renderer/src/modules/project/hooks/useSopNavigation.ts` | SOP 导航逻辑 hook | 1.6 |
| `src/renderer/src/modules/project/hooks/useSopKeyboardNav.ts` | Alt+2~6 快捷键 hook | 1.6 |
| `src/renderer/src/modules/project/types.ts` | `SopStageKey`、`SopStageStatus`、`SOP_STAGES`、`deriveSopStageStatuses` | 1.5/1.6 |
| `src/renderer/src/stores/projectStore.ts` | `useProjectStore`（含 currentProject、updateProject） | 1.5 |
| `src/renderer/src/globals.css` | CSS 变量（SOP 色、间距、圆角、阴影、动效时长、脉冲动画） | 1.4 |
| `src/renderer/src/theme/tokens.ts` | TS design tokens（与 globals.css 同步） | 1.4 |
| `src/renderer/src/modules/project/index.ts` | barrel export（需添加新组件导出） | 1.6 |
| `src/renderer/src/shared/lib/platform.ts` | 平台检测工具 | 1.4 |
| `src/renderer/src/App.tsx` | HashRouter 路由（`/` + `/project/:id`） | 1.5 |

### 修改清单（仅修改、不重建）

| 文件 | 变更 |
|------|------|
| `ProjectWorkspace.tsx` | 将 `<div className="flex flex-1 overflow-hidden"><StageGuidePlaceholder /></div>` 替换为 `<WorkspaceLayout>` 组件，传入 left/center/right/statusBar 四个 slot |
| `modules/project/index.ts` | 添加新组件导出：`WorkspaceLayout`、`OutlinePanel`、`AnnotationPanel`、`StatusBar` |

### 新建文件清单

| 文件 | 用途 |
|------|------|
| `src/renderer/src/modules/project/components/WorkspaceLayout.tsx` | 三栏布局容器 |
| `src/renderer/src/modules/project/components/OutlinePanel.tsx` | 左侧大纲面板占位 |
| `src/renderer/src/modules/project/components/AnnotationPanel.tsx` | 右侧批注面板占位 |
| `src/renderer/src/modules/project/components/StatusBar.tsx` | 底部状态栏 |
| `src/renderer/src/modules/project/hooks/useWorkspaceLayout.ts` | 面板折叠/响应式状态 |
| `src/renderer/src/modules/project/hooks/useWorkspaceKeyboard.ts` | 面板快捷键 |

### UX 布局规格（来自 ux-design-specification.md §工作空间布局）

```
┌─────────────────────────────────────────────────────────┐
│  Header（56px）+ SOP 进度条（48px）← 已有，不动          │
├────────┬──────────────────────────────┬─────────────────┤
│ 文档   │                              │ 智能批注         │
│ 大纲树 │     主内容区（编辑器）          │ 侧边栏          │
│ 240px  │     弹性宽度 (min 600px)     │ 320px           │
│ 可折叠 │     内容限宽 800px            │ 可折叠           │
├────────┴──────────────────────────────┴─────────────────┤
│  状态栏（32px）合规分 | 质量分 | 字数 | SOP阶段          │
└─────────────────────────────────────────────────────────┘
```

### 响应式断点策略

| 断点 | 宽度 | 行为 |
|------|------|------|
| 紧凑 | <1440px | 大纲折叠（宽度→0）；侧边栏折叠为 48px 图标栏 |
| 标准 | 1440-1920px | 三栏正常展示 |
| 宽屏 | >1920px | 三栏不变，多余空间为主内容区两侧留白 |

### 面板折叠过渡动画

- 使用 CSS `transition: width var(--duration-panel) var(--ease-in-out)`（300ms，ease-in-out）— 面板过渡属于"面板过渡"类动效，使用 `--ease-in-out`（`cubic-bezier(0.4, 0, 0.2, 1)`），与 UX 规范 §动效规范 和 `globals.css:84` 中已有 token 对齐
- 折叠时内容 `overflow: hidden` 防止溢出
- 尊重 `prefers-reduced-motion`：降级为 `transition: none`

### 无障碍要求（WCAG 2.1 AA — 参考 ux-design-specification.md §无障碍策略 :1181）

**键盘可达性：**
- 所有面板折叠/展开按钮必须可通过 Tab 键到达并通过 Enter/Space 触发
- 紧凑模式图标栏按钮同样可 Tab 聚焦、Enter 展开 flyout
- flyout 打开时，焦点自动移入 flyout 内部；关闭时焦点返回触发按钮

**焦点可见性：**
- 所有可交互元素（折叠按钮、图标栏按钮、状态栏指标）在键盘聚焦时显示蓝色 2px outline（`outline: 2px solid var(--color-primary); outline-offset: 2px`）
- 不覆盖浏览器默认焦点样式，仅增强可见性

**ARIA 标注：**
- 左侧大纲面板：`role="complementary"` + `aria-label="文档大纲"`
- 右侧批注面板：`role="complementary"` + `aria-label="智能批注"` + `aria-live="polite"`（批注计数变化时播报）
- 面板折叠按钮：`aria-expanded="true|false"` + `aria-controls="{panelId}"`
- 底部状态栏：`role="status"` + `aria-label="项目状态栏"`
- 紧凑模式 flyout：`role="dialog"` + `aria-label="智能批注面板"`

**减少动效：**
- 已在面板折叠过渡动画中处理 `prefers-reduced-motion`

### 后续 Story 对接点

本 Story 建立的壳层将被后续 Story 填充：
- **左面板** → Story 3.2（编辑器工作空间与文档大纲）将替换 `OutlinePanel` 占位内容为 Ant Design `Tree` 组件
- **主内容区** → Story 3.1（Plate 编辑器）将嵌入三栏布局主内容区，替换 `StageGuidePlaceholder`
- **右面板** → Epic 4 Stories（批注系统）将替换 `AnnotationPanel` 占位内容
- **状态栏** → Story 7.8（实时评分仪表盘）将填充合规分/质量分/字数实际数据

### 快捷键冲突规避

已注册快捷键（Story 1.6）：`Alt+2` ~ `Alt+6`（SOP 阶段跳转）
本 Story 新增：`Cmd/Ctrl+B`（侧边栏）、`Cmd/Ctrl+\`（大纲树）
后续 Story 将注册：`Cmd/Ctrl+K`（命令面板, Story 1.9）、`Cmd/Ctrl+S`（自动保存, Story 1.9）
无冲突。

### Ant Design 图标使用

- 大纲面板折叠按钮：`MenuFoldOutlined` / `MenuUnfoldOutlined`
- 侧边栏折叠按钮：`RightOutlined` / `LeftOutlined`（或自定义 SVG）
- 状态栏图标：`CheckCircleOutlined`、`DashboardOutlined`、`FileTextOutlined`
- 侧边栏紧凑态图标：`CommentOutlined`（批注占位）

### References

- [Source: _bmad-output/planning-artifacts/epics.md Story 1.7 — 三栏布局 AC]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md §工作空间布局（Electron 窗口内）]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md §断点策略]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md §快捷键体系 — Cmd/Ctrl+B, Cmd/Ctrl+\]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md §动效规范 — --duration-panel 300ms]
- [Source: _bmad-output/planning-artifacts/architecture.md §代码组织结构]
- [Source: CLAUDE.md — 路径别名、命名约定、Anti-Patterns]
- [Source: story-1-6-sop-navigation.md — 前序 Story 实现细节]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
