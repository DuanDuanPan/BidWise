# Story 1.9: 命令面板（Cmd+K）与全局快捷键

Status: ready-for-dev

## Story

As a 售前工程师,
I want 通过 Cmd/Ctrl+K 打开命令面板快速跳转到任何功能、章节或项目,
So that 高频操作不用层层导航，键盘效率最大化。

## Acceptance Criteria

### AC1: 命令面板模糊搜索

- **Given** 用户按 Cmd/Ctrl+K
- **When** 命令面板打开
- **Then** 显示模糊搜索输入框，支持章节名跳转、项目切换、功能触发（导出/对抗/资产库）
- [Source: epics.md Story 1.9 AC1, UX-DR27]

### AC2: 自动保存快捷键拦截

- **Given** 用户按 Cmd/Ctrl+S
- **When** 快捷键触发
- **Then** 拦截默认行为并显示"已自动保存"微提示（Toast 2 秒消失）
- [Source: epics.md Story 1.9 AC2, UX-DR27]

### AC3: 快速导出快捷键

- **Given** 用户按 Cmd/Ctrl+E
- **When** 快捷键触发
- **Then** 快速进入导出流程（Alpha 阶段：显示"导出功能即将推出"提示，因为 Epic 8 尚未实现）
- [Source: epics.md Story 1.9 AC3, UX-DR27]

## Tasks / Subtasks

- [ ] Task 1: 命令注册表与数据模型 (AC: 1)
  - [ ] 1.1 创建 `src/renderer/src/shared/command-palette/types.ts` — 命令类型定义
    - `Command` 接口：`id: string`, `label: string`, `category: CommandCategory`, `keywords: string[]`, `icon?: ReactNode`, `shortcut?: string`, `action: () => void`, `when?: () => boolean`（条件可见性）, `disabled?: boolean`（true 时命令项灰色不可执行）, `badge?: string`（右侧标签文本，如 "Coming Soon"）
    - `CommandCategory` 枚举：`'navigation'`（导航）, `'project'`（项目）, `'action'`（操作）, `'stage'`（SOP 阶段）
  - [ ] 1.2 创建 `src/renderer/src/shared/command-palette/command-registry.ts` — 命令注册中心
    - `registerCommand(command: Command)` — 注册单个命令
    - `registerCommands(commands: Command[])` — 批量注册
    - `unregisterCommand(id: string)` — 注销命令
    - `getCommands(): Command[]` — 获取所有可用命令（过滤 `when` 条件）
    - 使用 `Map<string, Command>` 内部存储，单例模式
  - [ ] 1.3 创建 `src/renderer/src/shared/command-palette/default-commands.ts` — Alpha 阶段默认命令集
    - **导航类**：跳转到各 SOP 阶段（requirements-analysis / solution-design / proposal-writing / cost-estimation / compliance-review / delivery）
    - **项目类**：返回项目看板、切换项目（从 `projectStore` 动态读取项目列表，每个项目一条命令）
    - **操作类**：导出文档（占位）、切换批注侧边栏、切换大纲面板
    - **章节跳转类**（AC1 "章节名跳转"）：`command-palette:jump-to-section` — **功能性 stub（非 disabled）**。如 Story 1-7 已合并：从 `useWorkspaceLayout` 暴露的 heading 列表动态注册子命令（每个 heading 一条，`action` 触发编辑器滚动到对应位置）；如 1-7 未合并：注册单条 disabled 占位命令 + badge "1.7 合并后可用"，`action` 显示 `message.info('章节跳转将在 Story 1.7 合并后可用', 2)`。**设计决策**：heading 数据来自前端大纲树 DOM/编辑器状态，**无需后端支持**，属于纯前端能力，不受 Epic 2-7 未实现影响
    - **项目切换类**（AC1 "项目切换"）：`command-palette:switch-project:{id}` — 从 `useProjectStore` 的 `projects` 列表动态注册，每个项目一条命令（label 为项目名），`action` 调用 `navigate('/project/${id}')`。**设计决策**：项目列表已在 `projectStore` 中可用（Story 1.5 建立），**无需后端支持**，直接读取前端 store
    - **对抗类**（AC1 "功能触发"）：`command-palette:start-adversarial-review` — Alpha 阶段 disabled，`action` 显示 `message.info('对抗评审需要 Epic 5 模块就绪', 2)`，右侧 badge "需要 Epic 5"。**设计决策 — Intentional Scope Boundary**：对抗评审依赖 Epic 5 review 模块（尚未实现），Alpha 阶段无可用后端，注册为 disabled 命令是渐进交付的合理做法，后续 Epic 5 实现后替换为真实 action
    - **资产库类**（AC1 "功能触发"）：`command-palette:search-assets` — Alpha 阶段 disabled，`action` 显示 `message.info('资产库搜索需要 Epic 6 模块就绪', 2)`，右侧 badge "需要 Epic 6"。**设计决策 — Intentional Scope Boundary**：同上，资产库搜索依赖 Epic 6 asset 模块，Alpha 阶段注册为 disabled 是渐进交付
    - 每个命令包含中文 label + 中文 keywords + 对应 Ant Design 图标
    - **Badge 标签样式**（适用于 "需要 Epic X" / "1.7 合并后可用" 等状态标签）：`text-text-tertiary text-caption bg-[var(--color-bg-hover)] rounded px-1.5 py-0.5`，与快捷键标签并排显示

- [ ] Task 2: 模糊搜索引擎 (AC: 1)
  - [ ] 2.1 安装 `fuse.js` — 轻量模糊搜索库（~5KB gzip，无 native 依赖）
    - `pnpm add fuse.js`
  - [ ] 2.2 创建 `src/renderer/src/shared/command-palette/use-command-search.ts` — 搜索 hook
    - 输入：`query: string`
    - 使用 Fuse.js 搜索 `label` + `keywords` 字段，阈值 0.4
    - 返回排序后的匹配结果（最多 20 条）
    - 空 query 时返回全部命令（按 category 分组）

- [ ] Task 3: 命令面板 UI 组件 (AC: 1)
  - [ ] 3.1 创建 `src/renderer/src/shared/command-palette/CommandPalette.tsx` — 命令面板组件
    - 使用 Ant Design `Modal` 组件 + 自定义样式，居中偏上（top: 20%）
    - 搜索输入框：`Input` + `SearchOutlined` 图标 + 右侧 `Esc` 标签
    - 命令列表：分组渲染（navigation / project / action / stage），每组带灰色标题
    - 每个命令项：图标 + 标签 + 右侧快捷键标签（如有）+ badge 标签（如有，如 "需要 Epic 5"）
    - `disabled` 命令项：文字颜色 `text-text-tertiary`，不可点击/Enter 执行，键盘导航可高亮但 Enter 无效
    - 键盘导航：`↑↓` 移动高亮、`Enter` 执行、`Esc` 关闭
    - 点击命令项也可执行
    - 空状态："无匹配命令"
    - 高亮项样式：`bg-[var(--color-bg-hover)]` 背景
    - Modal 无标题栏、无页脚，无遮罩阴影（轻量面板感）
    - `maskClosable={true}` — 点击面板外关闭
  - [ ] 3.2 键盘导航逻辑：
    - `selectedIndex` 状态跟踪当前高亮行
    - `ArrowDown` → index + 1（循环到顶部）
    - `ArrowUp` → index - 1（循环到底部）
    - `Enter` → 执行 `commands[selectedIndex].action()`，关闭面板
    - 搜索内容变化时 reset `selectedIndex = 0`
  - [ ] 3.3 面板尺寸与样式：
    - 宽度 560px，最大高度 60vh
    - 圆角 `var(--radius-lg)`（12px）
    - 阴影 `var(--shadow-modal)`
    - 搜索框高度 48px，命令项高度 40px
    - 使用 Tailwind + CSS 变量，与现有设计系统一致

- [ ] Task 4: 全局快捷键管理 hook (AC: 1, 2, 3)
  - [ ] 4.1 创建 `src/renderer/src/shared/command-palette/use-global-shortcuts.ts` — 全局快捷键 hook
    - `Cmd/Ctrl+K` → 打开命令面板（`setOpen(true)`）
    - `Cmd/Ctrl+S` → 拦截默认行为 + `message.info('已自动保存', 2)` 微提示
    - `Cmd/Ctrl+E` → Alpha 阶段 `message.info('导出功能即将推出', 2)`
    - 使用 `useEffect` + `window.addEventListener('keydown')`，cleanup 移除监听
    - 使用 `platform.ts` 的 `isMac` 检测 `metaKey`（macOS）或 `ctrlKey`（Windows/Linux）
    - `preventDefault()` + `stopPropagation()` 阻止浏览器默认行为
  - [ ] 4.2 与已注册快捷键无冲突：
    - Story 1.6 已注册：`Alt+2~6`（SOP 阶段跳转）
    - Story 1.7 将注册：`Cmd/Ctrl+B`（侧边栏）、`Cmd/Ctrl+\`（大纲面板）
    - 本 Story 新增：`Cmd/Ctrl+K`、`Cmd/Ctrl+S`、`Cmd/Ctrl+E`
    - 面板打开时应阻止其他快捷键触发（`e.stopPropagation()`）

- [ ] Task 5: 根级挂载与 Context 桥接 (AC: 1, 2, 3)
  - [ ] 5.1 创建 `src/renderer/src/shared/command-palette/CommandPaletteProvider.tsx` — 命令面板上下文
    - 通过 React Context 提供 `open: boolean`、`setOpen`、`registerCommand`、`unregisterCommand`
    - 在 `App.tsx` 根级挂载 `<CommandPaletteProvider>`，确保在所有路由之上
    - `useGlobalShortcuts` hook 在 Provider 内调用
    - `<CommandPalette>` 组件在 Provider 内渲染
  - [ ] 5.2 创建 `src/renderer/src/shared/command-palette/use-command-palette.ts` — 消费 hook
    - `useCommandPalette()` — 返回 `{ open, setOpen, registerCommand, unregisterCommand }`
    - 供各模块在 mount 时注册上下文相关命令（如项目工作空间内注册 SOP 跳转命令）
  - [ ] 5.3 创建 `src/renderer/src/shared/command-palette/index.ts` — barrel export

- [ ] Task 6: 路由感知命令注册 (AC: 1)
  - [ ] 6.1 修改 `src/renderer/src/modules/project/components/ProjectKanban.tsx`
    - 在组件内注册看板级命令（如"创建项目"）
    - **项目切换命令**（AC1 "项目切换"）：从 `useProjectStore` 读取 `projects` 列表，为每个项目动态注册 `command-palette:switch-project:{id}` 命令，`action` 调用 `navigate('/project/${id}')`；项目列表变化时自动更新注册
    - 使用 `useCommandPalette().registerCommand` + `useEffect` cleanup
  - [ ] 6.2 修改 `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
    - 注册工作空间级命令：SOP 阶段跳转（复用 `useSopNavigation` 的 `goToStage`）
    - 注册面板切换命令：
      - **如 Story 1.7 已合并**：直接调用 `useWorkspaceLayout` 的 `toggleSidebar()`/`toggleOutline()`
      - **如 Story 1.7 未合并**（并行开发场景）：注册为 disabled + badge "1.7 合并后可用" 的占位命令，`action` 显示 `message.info('面板切换功能将在 Story 1.7 合并后可用', 2)`。代码中通过检测 `useWorkspaceLayout` hook 是否存在（try-import 或 feature flag）动态决定
      - 快捷键标签仍显示 `⌘B` / `⌘\`，仅 action 行为有差异
  - [ ] 6.3 ProjectKanban 搜索按钮集成
    - 现有 `SearchOutlined` 按钮（tooltip "即将推出"）改为点击打开命令面板
    - tooltip 改为 `formatShortcut('Cmd+K')`

- [ ] Task 7: 单元测试 (AC: 全部)
  - [ ] 7.1 `command-registry` 测试：注册/注销命令、`when` 条件过滤、重复 id 覆盖、disabled 命令仍可搜索到
  - [ ] 7.2 `use-command-search` 测试：模糊搜索匹配、空 query 返回全部、阈值过滤
  - [ ] 7.3 `CommandPalette` 组件测试：
    - 渲染搜索输入框和命令列表
    - 键盘导航（↑↓ 移动高亮、Enter 执行、Esc 关闭）
    - 搜索过滤实时更新列表
    - 点击命令项执行并关闭
    - disabled 命令项显示 badge 标签（如 "需要 Epic 5"）、不可执行（Enter 无效、click 无效）
    - disabled 命令项渲染灰色文字样式
    - 章节跳转命令（1-7 已合并时）为 enabled 状态，可执行
  - [ ] 7.4 `use-global-shortcuts` 测试：
    - Cmd/Ctrl+K 打开面板
    - Cmd/Ctrl+S 显示自动保存提示
    - Cmd/Ctrl+E 显示导出占位提示
    - 面板打开时 Escape 关闭
  - [ ] 7.5 `CommandPaletteProvider` 集成测试：Context 正确提供、跨组件注册/注销命令

- [ ] Task 8: 集成验证 (AC: 全部)
  - [ ] 8.1 验证 Cmd/Ctrl+K 在任何页面（看板/工作空间）均可打开命令面板
  - [ ] 8.2 验证模糊搜索：输入"需求"能匹配"需求分析"阶段、输入项目名能匹配项目
  - [ ] 8.3 验证键盘全流程：Cmd+K → 输入搜索 → ↓ 选择 → Enter 执行 → 面板关闭 → 导航生效
  - [ ] 8.4 验证 Cmd/Ctrl+S 拦截并显示"已自动保存"微提示
  - [ ] 8.5 验证 Cmd/Ctrl+E 显示导出占位提示
  - [ ] 8.6 验证与已有快捷键无冲突：Alt+2~6（SOP）、Cmd/Ctrl+B（侧边栏，1.7 Owner）、Cmd/Ctrl+\（大纲，1.7 Owner）
  - [ ] 8.9 验证章节跳转命令：搜索"章节"能匹配到章节跳转命令；如 1-7 已合并，命令为 enabled 状态且可触发编辑器滚动；如 1-7 未合并，显示 "1.7 合并后可用" badge 和 disabled 状态
  - [ ] 8.10 验证对抗、资产库命令以 disabled + badge（"需要 Epic 5" / "需要 Epic 6"）状态出现在命令列表中，点击/Enter 显示提示信息
  - [ ] 8.11 验证项目切换命令：搜索项目名能匹配到对应项目命令，点击/Enter 导航到该项目工作空间
  - [ ] 8.7 验证 `lint && typecheck && build` 全部通过
  - [ ] 8.8 验证与 Story 1.6 功能无回归：SOP 导航、阶段跳转、快捷键、状态持久化均正常

## Dev Notes

### 架构模式与约束

**核心分层架构（已由 Story 1.1-1.6 建立）：**
```
Renderer (React + Zustand) → Preload API (contextBridge) → IPC Handler (薄分发) → Service (业务逻辑) → Repository (Kysely) → SQLite
```

- IPC handler 禁止包含业务逻辑 — 只做参数解析 + 结果包装
- 所有错误使用 BidWiseError 类型体系，禁止 throw 裸字符串
- 使用路径别名 `@main/*`、`@renderer/*`、`@shared/*`、`@modules/*`，禁止 `../../`
- Store loading 状态字段统一用 `loading: boolean`

### 关键约束：本 Story 以纯前端为主

- **不涉及新 IPC 通道** — 命令面板纯前端，命令注册/搜索/执行均在 Renderer 进程内完成
- **不涉及数据库** — 无新建表或迁移
- **不涉及新 Zustand store** — 使用 React Context 管理面板状态（命令面板是 UI 层瞬态，不需要全局持久化状态）
- **不涉及 AI/异步任务** — 无 task-queue 需求
- **新增 1 个外部依赖** — `fuse.js`（模糊搜索，~5KB gzip，纯 JS 无 native）

### AC1 Alpha 范围设计决策（Intentional Scope Boundary）

AC1 原文要求"支持章节名跳转、项目切换、功能触发（导出/对抗/资产库）"。Alpha 阶段的实现策略：

| AC1 子能力 | Alpha 实现 | 理由 | 后续完善 Story |
|-----------|-----------|------|---------------|
| **章节名跳转** | **功能性 stub** — 从 1-7 大纲树读取 heading 列表，无需后端 | heading 数据来自前端编辑器/DOM，纯 renderer 能力 | Story 3.2 接入真实编辑器 |
| **项目切换** | **完整实现** — 从 projectStore 读取项目列表，路由跳转 | 项目 CRUD 已由 Story 1.5 建立，数据已在前端 store 中 | — |
| **导出触发** | **Cmd+E 占位提示** | Epic 8（导出模块）尚未实现，无可调用后端 | Story 8.3 替换为真实导出 |
| **对抗评审** | **disabled + badge "需要 Epic 5"** | Epic 5（review 模块）尚未实现 | Epic 5 story 激活命令 |
| **资产库搜索** | **disabled + badge "需要 Epic 6"** | Epic 6（asset 模块）尚未实现 | Epic 6 story 激活命令 |

**这不是遗漏，而是 Alpha 渐进交付的设计选择**：有前端数据源的能力（章节跳转、项目切换）提供功能性实现；依赖未实现后端模块的能力注册为 disabled 命令，通过 badge 明确告知用户所需模块，并在对应 Epic 实现后自动激活。命令注册表架构支持后续 Story 通过 `registerCommand()` 无缝扩展。

### 已有代码资产（禁止重复创建）

| 已有文件 | 内容 | Story |
|----------|------|-------|
| `src/renderer/src/modules/project/hooks/useSopKeyboardNav.ts` | Alt+2~6 SOP 阶段快捷键（**参考键盘监听模式**） | 1.6 |
| `src/renderer/src/shared/lib/platform.ts` | `isMac`、`modKey`、`formatShortcut()` 平台检测（**直接复用**） | 1.4 |
| `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` | 工作空间顶层容器 | 1.6 |
| `src/renderer/src/modules/project/components/ProjectKanban.tsx` | 项目看板（含搜索按钮占位） | 1.5 |
| `src/renderer/src/modules/project/hooks/useSopNavigation.ts` | SOP 导航逻辑（`goToStage` 供命令面板调用） | 1.6 |
| `src/renderer/src/modules/project/types.ts` | `SopStageKey`、`SOP_STAGES` 常量（供命令注册使用） | 1.5/1.6 |
| `src/renderer/src/stores/projectStore.ts` | `useProjectStore`（命令面板获取项目列表用） | 1.5 |
| `src/renderer/src/globals.css` | CSS 变量（间距、圆角、阴影、动效时长） | 1.4 |
| `src/renderer/src/theme/tokens.ts` | TS design tokens | 1.4 |
| `src/renderer/src/App.tsx` | HashRouter 路由（`/` + `/project/:id`）— **挂载 CommandPaletteProvider** | 1.5 |

### 修改清单（仅修改、不重建）

| 文件 | 变更 |
|------|------|
| `src/renderer/src/App.tsx` | 在根级 `<HashRouter>` 下包裹 `<CommandPaletteProvider>` |
| `src/renderer/src/modules/project/components/ProjectKanban.tsx` | 搜索按钮改为打开命令面板 + 注册看板级命令 |
| `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` | 注册工作空间级命令（SOP 跳转、面板切换） |

### 新建文件清单

| 文件 | 用途 |
|------|------|
| `src/renderer/src/shared/command-palette/types.ts` | 命令类型定义 |
| `src/renderer/src/shared/command-palette/command-registry.ts` | 命令注册中心 |
| `src/renderer/src/shared/command-palette/default-commands.ts` | Alpha 默认命令集 |
| `src/renderer/src/shared/command-palette/use-command-search.ts` | Fuse.js 模糊搜索 hook |
| `src/renderer/src/shared/command-palette/CommandPalette.tsx` | 命令面板 UI 组件 |
| `src/renderer/src/shared/command-palette/use-global-shortcuts.ts` | 全局快捷键 hook |
| `src/renderer/src/shared/command-palette/CommandPaletteProvider.tsx` | Context Provider |
| `src/renderer/src/shared/command-palette/use-command-palette.ts` | 消费 hook |
| `src/renderer/src/shared/command-palette/index.ts` | barrel export |

### 键盘事件处理模式（参考 useSopKeyboardNav.ts）

```typescript
// 已验证可用的键盘监听模式
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    const mod = isMac ? e.metaKey : e.ctrlKey
    if (mod && e.key === 'k') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(true)
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])
```

### UX 规格

**命令面板视觉布局：**
```
┌─────────────────────────────────────────┐
│  🔍  搜索命令...                    Esc  │
├─────────────────────────────────────────┤
│  导航                                    │
│  ├ 📋 需求分析阶段           Alt+2      │
│  ├ 📐 方案设计阶段           Alt+3      │
│  ├ ✏️ 方案撰写阶段           Alt+4      │
│  ├ 💰 成本评估阶段           Alt+5      │
│  └ ✅ 合规评审阶段           Alt+6      │
│                                          │
│  项目                                    │
│  ├ 🏠 返回项目看板                       │
│  └ 📁 某某投标项目                       │
│                                          │
│  操作                                    │
│  ├ 📤 导出文档              ⌘E          │
│  ├ 💬 切换批注面板          ⌘B          │
│  └ 📑 切换大纲面板          ⌘\          │
└─────────────────────────────────────────┘
```

**面板样式：**
- 宽度 560px，最大高度 60vh，圆角 12px
- 居中偏上（top: 20%）— 类似 VS Code / Raycast 命令面板位置
- 无标题栏、无页脚，轻量感
- 遮罩：半透明黑色（`rgba(0,0,0,0.3)`），点击可关闭
- 打开/关闭动画：fade + scale（150ms），尊重 `prefers-reduced-motion`

**Cmd/Ctrl+S 微提示规格：**
- 使用 Ant Design `message.info('已自动保存', 2)` — 2 秒后自动消失
- 不打断用户操作，不抢焦点

### 快捷键冲突矩阵

| 快捷键 | 功能 | Story | 键盘监听 Owner | 冲突 |
|--------|------|-------|----------------|------|
| Alt+2~6 | SOP 阶段跳转 | 1.6 | `useSopKeyboardNav` | 无 |
| Cmd/Ctrl+B | 切换批注侧边栏 | 1.7 | `useWorkspaceKeyboard`（1.7 独占） | 无 — 1.9 不重复注册，仅提供命令面板搜索入口 |
| Cmd/Ctrl+\ | 切换大纲面板 | 1.7 | `useWorkspaceKeyboard`（1.7 独占） | 无 — 同上 |
| **Cmd/Ctrl+K** | **命令面板** | **1.9** | `use-global-shortcuts` | 无 |
| **Cmd/Ctrl+S** | **自动保存拦截** | **1.9** | `use-global-shortcuts` | 无 |
| **Cmd/Ctrl+E** | **导出流程** | **1.9** | `use-global-shortcuts` | 无 |

### Fuse.js 配置建议

```typescript
const fuse = new Fuse(commands, {
  keys: [
    { name: 'label', weight: 0.7 },
    { name: 'keywords', weight: 0.3 }
  ],
  threshold: 0.4,        // 模糊度（0=精确，1=匹配所有）
  includeScore: true,
  minMatchCharLength: 1,  // 中文单字即可匹配
})
```

### Story 1-7 并行开发依赖处理

Story 1-7（三栏布局）和 1-9（命令面板）在同一 batch 并行开发。面板切换快捷键 `Cmd/Ctrl+B` 和 `Cmd/Ctrl+\` 的键盘监听在两个 Story 中均涉及：

- **1-7** 在 `useWorkspaceKeyboard.ts` 中实现键盘监听 + 面板切换逻辑
- **1-9** 在 `use-global-shortcuts.ts` 中注册全局快捷键

**合并策略：**
1. 1-9 的 `use-global-shortcuts.ts` 中 **不重复注册** `Cmd/Ctrl+B` 和 `Cmd/Ctrl+\` — 这两个快捷键由 1-7 的 `useWorkspaceKeyboard` 独占处理
2. 1-9 仅在命令面板中注册这两个命令的可搜索入口（label + keywords），action 委托给 1-7 的 hook
3. 如果 1-9 先合并到 main，面板切换命令注册为 disabled 占位；1-7 合并后在 `ProjectWorkspace.tsx` 中激活
4. 快捷键冲突矩阵中 `Cmd/Ctrl+B` 和 `Cmd/Ctrl+\` 标注为 "Owner: Story 1-7"

### 后续 Story 对接点

本 Story 建立的命令面板基础设施将被后续 Story 扩展：
- **Story 3.2**（编辑器工作空间）→ 注册章节跳转命令
- **Epic 4**（批注系统）→ 注册批注导航命令（Alt+↑↓、采纳/驳回）
- **Epic 5**（资产管理）→ 注册资产库搜索命令
- **Story 8.3**（导出）→ 替换 Cmd+E 占位为真实导出流程
- **Story 1.10**（无障碍）→ 命令面板 ARIA 标签、焦点管理增强

### Ant Design 组件使用

- 命令面板主体：`Modal`（`footer={null}`, `title={null}`, `closable={false}`, `centered={false}`）
- 搜索输入：`Input` + `SearchOutlined`
- 微提示：`message.info()`
- 命令图标：`@ant-design/icons` 系列（`FileSearchOutlined`、`ProjectOutlined`、`ExportOutlined` 等）

### 无障碍基线（Story 1.10 前置准备）

- 命令面板搜索框自动获取焦点（`autoFocus`）
- 命令列表使用 `role="listbox"` + `role="option"`
- 高亮项使用 `aria-selected="true"`
- `Escape` 关闭后焦点恢复到之前活动元素
- 搜索框 `aria-label="搜索命令"`

### References

- [Source: _bmad-output/planning-artifacts/epics.md Story 1.9 — 命令面板 AC]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md §快捷键体系 — UX-DR27]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md §无障碍合规 — UX-DR24]
- [Source: _bmad-output/planning-artifacts/architecture.md §代码组织结构]
- [Source: _bmad-output/planning-artifacts/architecture.md §命名约定]
- [Source: CLAUDE.md — 路径别名、命名约定、Anti-Patterns]
- [Source: story-1-7-workspace-layout-shell.md — 前序 Story 快捷键注册]
- [Source: story-1-6-sop-navigation.md — useSopKeyboardNav 键盘监听模式]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
