# Story 1.6: SOP 导航与阶段引导

Status: ready-for-dev

## Story

As a 售前工程师,
I want SOP 6 阶段进度条引导我完成投标全流程,
So that 我始终知道自己在哪个阶段、下一步该做什么。

## Acceptance Criteria

### AC1: SOP 进度条渲染与状态显示

- **Given** 进入项目工作空间（`/project/:id`）
- **When** SOP 进度条渲染
- **Then** 6 个阶段按正确状态显示：未开始（灰色空心圆 `#D9D9D9`）、进行中（蓝色脉冲动画 `#1677FF`）、已完成（绿色勾选 `#52C41A`）、有警告（橙色感叹号 `#FAAD14`）
- **Then** 进度条固定在工作空间顶部（48px 高度），紧凑布局不占用过多垂直空间
- **Then** Alpha 阶段使用白色背景（`#FFFFFF`）基础样式
- [Source: epics.md Story 1.6 AC1, FR5, UX-DR8, UX-DR28]

### AC2: 阶段引导式占位符

- **Given** 某阶段状态为"未开始"
- **When** 用户导航到该阶段
- **Then** 主内容区展示引导式占位符：阶段目标说明 + 开始操作入口（CTA 按钮）
- **Then** 6 个阶段分别有各自的引导文案和操作入口（如：需求分析→"本阶段目标：理解甲方要什么。请上传招标文件"）
- [Source: epics.md Story 1.6 AC2, UX-DR29, ux-design-specification.md 空状态设计]

### AC3: 阶段跳转与约束提示

- **Given** 用户点击一个未来阶段（跳过中间阶段）
- **When** 跳转发生
- **Then** 系统显示约束提示（如"前置阶段'需求分析'尚未完成，建议先完成再进入当前阶段"），但**仍允许**导航（可跳转但带约束的混合模式）
- [Source: epics.md Story 1.6 AC3, FR5, ux-design-specification.md SOP导航即培训]

### AC4: SOP 快捷键导航

- **Given** 用户在项目工作空间内
- **When** 按下 `Alt+2` ~ `Alt+6`
- **Then** 分别跳转到对应的 SOP 阶段 2~6（阶段 1 为进入工作空间时的默认激活阶段）
- [Source: epics.md Story 1.6 AC4, UX-DR27]

### AC5: SOP 阶段状态持久化

- **Given** 项目的 SOP 阶段状态变更（如从"未开始"变为"进行中"）
- **When** 用户首次导航到某个"未开始"阶段
- **Then** 该阶段自动更新为"进行中"，通过 `project:update` IPC 持久化到 SQLite
- **Then** 页面刷新或重新进入项目时，SOP 状态从数据库恢复

### AC6: 模态策略合规

- **Given** 产品中的弹窗/面板/通知交互
- **When** 渲染
- **Then** 遵循模态策略：侧边面板用于不打断主编辑流的操作，内联展开用于章节级操作，模态对话框仅用于不可逆/高风险操作，Toast 用于异步非阻塞提醒
- [Source: epics.md Story 1.6 AC6, UX-DR30]

### AC7: 无障碍支持

- **Given** SOP 进度条渲染
- **When** 验证无障碍
- **Then** 使用 `role="navigation"` + `aria-current="step"` 标注，支持键盘 Tab 导航聚焦各阶段节点
- [Source: ux-design-specification.md ARIA标注重点]

## Tasks / Subtasks

- [ ] Task 1: 项目工作空间壳层组件 (AC: 1, 2)
  - [ ] 1.1 创建 `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` — 工作空间顶层容器，加载项目数据并渲染 SOP 进度条 + 主内容区占位
  - [ ] 1.2 修改 `src/renderer/src/App.tsx` — 将 `/project/:id` 路由从占位 div 替换为 `<ProjectWorkspace />`
  - [ ] 1.3 在 `projectStore` 中添加 `loadProject(id)` action（调用 `window.api.projectGet(id)` 加载当前项目完整数据到 `currentProject`）
  - [ ] 1.4 创建 `src/renderer/src/modules/project/hooks/useCurrentProject.ts` — 封装从路由 param 获取 id → 加载 project → 返回 currentProject + loading/error 的 hook

- [ ] Task 2: SOP 进度条组件 (AC: 1, 3, 7)
  - [ ] 2.1 创建 `src/renderer/src/modules/project/components/SopProgressBar.tsx` — SOP 6 阶段进度条组件
  - [ ] 2.2 每个阶段节点包含：SOP 图标（复用 `SopAnalysisIcon` 等 6 个图标）+ 阶段名称 + 状态指示
  - [ ] 2.3 实现 4 种状态视觉：
    - 未开始：灰色空心圆（`--color-sop-idle`），图标灰色
    - 进行中：蓝色实心圆（`--color-sop-active`）+ CSS 脉冲动画，图标蓝色
    - 已完成：绿色实心勾选（`--color-sop-done`），图标绿色
    - 有警告：橙色实心感叹号（`--color-sop-warning`），图标橙色
  - [ ] 2.4 阶段之间使用连接线，线色跟随左侧阶段状态色（已完成→绿色线，其余→灰色线）
  - [ ] 2.5 固定在工作空间顶部 48px 高度，白色背景（Alpha），水平排列 6 个阶段节点
  - [ ] 2.6 点击阶段节点触发导航（可跳转），如果跳过中间阶段则弹出 message.warning 提示
  - [ ] 2.7 无障碍：`role="navigation"` + `aria-label="SOP 进度条"` + 各节点 `aria-current="step"`（当前活跃阶段）

- [ ] Task 3: SOP 阶段状态管理 (AC: 1, 5)
  - [ ] 3.1 扩展 `modules/project/types.ts`：
    - 定义 `SopStageStatus = 'not-started' | 'in-progress' | 'completed' | 'warning'` 类型
    - 定义 `SOP_STAGES` 常量数组（6 个阶段的 key/label/icon 映射，复用 `SopStageKey`）
    - 定义 `SopStageInfo` 接口（key, label, status, description, ctaLabel）
  - [ ] 3.2 扩展 `UpdateProjectInput`（`@shared/ipc-types.ts`）：确认已包含 `sopStage` 字段（**注意：当前 `UpdateProjectInput` 的 Pick 不包含 `sopStage`**，需要添加）
  - [ ] 3.3 创建 `src/renderer/src/modules/project/hooks/useSopNavigation.ts` — 封装 SOP 导航逻辑：
    - `currentStageKey`: 当前激活阶段 key（本地 UI 状态，初始值从 `currentProject.sopStage` 读取）
    - `stageStatuses`: 6 个阶段的状态映射（派生计算）
    - `navigateToStage(key)`: 跳转阶段 + 约束检查 + 自动更新"未开始"→"进行中"
    - `updateStageInDb(key)`: 通过 `project:update` IPC 持久化 sopStage 变更

- [ ] Task 4: 阶段引导占位符 (AC: 2)
  - [ ] 4.1 创建 `src/renderer/src/modules/project/components/StageGuidePlaceholder.tsx` — 各阶段引导式占位符组件
  - [ ] 4.2 定义 6 个阶段的引导内容常量：
    - 需求分析："本阶段目标：理解甲方要什么。请上传招标文件和客户沟通素材。" / CTA: "上传招标文件"
    - 方案设计："本阶段目标：确定方案骨架。选择模板并生成方案大纲。" / CTA: "选择方案模板"
    - 方案撰写："本阶段目标：完成方案正文。AI 辅助生成内容，逐章编辑打磨。" / CTA: "开始撰写方案"
    - 成本评估："本阶段目标：识别 GAP 并估算成本。对比方案需求与产品基线。" / CTA: "启动 GAP 分析"
    - 评审打磨："本阶段目标：多维对抗评审，发现方案薄弱点。" / CTA: "启动对抗评审"
    - 交付归档："本阶段目标：合规校验后一键导出 docx。" / CTA: "检查合规状态"
  - [ ] 4.3 视觉设计：居中布局，SOP 阶段图标（48px 灰色）+ 阶段名称（text-h2）+ 目标说明（text-body, text-secondary）+ CTA 按钮（Ant Design Button type="primary"）
  - [ ] 4.4 CTA 按钮 Alpha 阶段仅展示，click 事件暂不跳转到实际功能（后续 Story 接入）

- [ ] Task 5: 快捷键绑定 (AC: 4)
  - [ ] 5.1 创建 `src/renderer/src/modules/project/hooks/useSopKeyboardNav.ts` — 监听 `Alt+2` ~ `Alt+6` 全局键盘事件
  - [ ] 5.2 在 `ProjectWorkspace` 中挂载此 hook，确保仅在 `/project/:id` 路由下激活
  - [ ] 5.3 快捷键触发时调用 `useSopNavigation.navigateToStage(key)` 跳转对应阶段
  - [ ] 5.4 `Alt+2` = 需求分析，`Alt+3` = 方案设计，`Alt+4` = 方案撰写，`Alt+5` = 成本评估，`Alt+6` = 评审打磨（交付阶段无快捷键，需显式点击）

- [ ] Task 6: 阶段间约束与跳转提示 (AC: 3)
  - [ ] 6.1 在 `useSopNavigation` 的 `navigateToStage` 中实现约束检查：
    - 如果目标阶段之前存在"未开始"的阶段，使用 `message.warning()` 提示
    - 提示文案："前置阶段 '{stage.label}' 尚未开始，建议按序完成后再进入当前阶段"
    - 提示后**仍然执行跳转**（非阻塞）
  - [ ] 6.2 脉冲动画使用 CSS `@keyframes` + `animation`，尊重 `prefers-reduced-motion`（降级为静态蓝色实心圆）

- [ ] Task 7: 单元测试 (AC: 全部)
  - [ ] 7.1 `SopProgressBar` 组件测试：6 个阶段正确渲染、状态色正确、点击触发导航回调、aria 属性正确
  - [ ] 7.2 `StageGuidePlaceholder` 组件测试：各阶段引导文案和 CTA 正确渲染
  - [ ] 7.3 `useSopNavigation` hook 测试：阶段跳转、约束检查、状态自动更新逻辑
  - [ ] 7.4 `useSopKeyboardNav` hook 测试：Alt+2~6 键盘事件正确触发对应阶段导航
  - [ ] 7.5 `ProjectWorkspace` 组件测试：加载项目数据、渲染 SOP 进度条和阶段内容
  - [ ] 7.6 `useCurrentProject` hook 测试：路由 param 获取 id → 加载数据 → 返回正确状态

- [ ] Task 8: 集成验证 (AC: 全部)
  - [ ] 8.1 验证全链路：项目看板卡片点击 → 导航到 `/project/:id` → 加载项目 → SOP 进度条渲染正确状态
  - [ ] 8.2 验证 SOP 阶段跳转后 sopStage 持久化到 SQLite（刷新页面后状态恢复）
  - [ ] 8.3 验证 `lint && typecheck && build` 全部通过
  - [ ] 8.4 验证 Alt+2~6 快捷键在工作空间内正常工作
  - [ ] 8.5 验证 `prefers-reduced-motion` 时脉冲动画降级为静态

## Dev Notes

### 架构模式与约束

**核心分层架构（已由 Story 1.1-1.5 建立）：**
```
Renderer (React + Zustand) → Preload API (contextBridge) → IPC Handler (薄分发) → Service (业务逻辑) → Repository (Kysely) → SQLite
```

- IPC handler 禁止包含业务逻辑 — 只做参数解析 + 结果包装
- 所有错误使用 BidWiseError 类型体系，禁止 throw 裸字符串
- 所有日期使用 ISO-8601 格式
- 使用路径别名 `@main/*`、`@renderer/*`、`@shared/*`、`@modules/*`，禁止 `../../`
- Store loading 状态字段统一用 `loading: boolean`

### 已有代码资产（禁止重复创建）

| 已有文件 | 内容 | Story |
|----------|------|-------|
| `src/renderer/src/shared/components/icons/SopAnalysisIcon.tsx` | 需求分析阶段图标 | 1.4 |
| `src/renderer/src/shared/components/icons/SopDesignIcon.tsx` | 方案设计阶段图标 | 1.4 |
| `src/renderer/src/shared/components/icons/SopWritingIcon.tsx` | 方案撰写阶段图标 | 1.4 |
| `src/renderer/src/shared/components/icons/SopCostIcon.tsx` | 成本评估阶段图标 | 1.4 |
| `src/renderer/src/shared/components/icons/SopReviewIcon.tsx` | 评审打磨阶段图标 | 1.4 |
| `src/renderer/src/shared/components/icons/SopDeliveryIcon.tsx` | 交付归档阶段图标 | 1.4 |
| `src/renderer/src/theme/tokens.ts` | sopColors（idle/active/done/warning） | 1.4 |
| `src/renderer/src/globals.css` | `--color-sop-idle/active/done/warning` CSS 变量 | 1.4 |
| `src/renderer/src/modules/project/types.ts` | `SopStageKey` 类型 + `SOP_STAGE_CONFIG` 映射 | 1.5 |
| `src/renderer/src/stores/projectStore.ts` | `useProjectStore`（含 currentProject、loadProjects） | 1.5 |
| `src/renderer/src/modules/project/components/ProjectCard.tsx` | 卡片含 SOP 阶段显示 + `onClick` 导航 | 1.5 |
| `src/renderer/src/App.tsx` | HashRouter 路由（`/` 和 `/project/:id`） | 1.5 |
| `src/shared/ipc-types.ts` | IPC 类型定义（含 `ProjectRecord.sopStage`） | 1.3 |
| `src/preload/index.ts` | preload API 白名单（含 `projectGet`/`projectUpdate`） | 1.3 |
| `src/main/services/project-service.ts` | projectService（含 update 方法） | 1.2 |
| `src/main/ipc/project-handlers.ts` | project:update handler（已注册） | 1.3 |

### 关键提醒：UpdateProjectInput 需要扩展

**当前 `UpdateProjectInput` 不包含 `sopStage`：**
```typescript
// 当前定义（src/shared/ipc-types.ts）
export type UpdateProjectInput = Partial<
  Pick<ProjectRecord, 'name' | 'customerName' | 'industry' | 'deadline' | 'proposalType' | 'rootPath'>
>
```

**本 Story 需要在 Pick 中添加 `'sopStage'`**，使渲染进程可通过 `project:update` IPC 更新 SOP 阶段。无需新增 IPC channel、handler 或 service 方法 — 已有的 `project:update` 完整支持。

### 现有 DB Schema — sopStage 字段

**projects 表已有 `sop_stage` 列**（TEXT DEFAULT 'not-started'），Kysely CamelCasePlugin 自动映射为 `sopStage`。

**当前 sopStage 的 DB 值**：存储的是整个项目的"当前活跃阶段"（`SopStageKey` 值之一），**不是** 6 个阶段各自的独立状态。

**SOP 阶段状态的派生策略**：
- 项目的 `sopStage` 字段标识"当前活跃阶段"
- 前序阶段自动标记为"已完成"（completed）
- 当前阶段标记为"进行中"（in-progress）
- 后续阶段标记为"未开始"（not-started）
- "有警告"状态需要外部数据驱动（如合规检查未通过），Alpha 阶段暂不实现自动 warning 逻辑，仅支持手动传入

### SOP 阶段配置

**已有的 `SOP_STAGE_CONFIG`（`modules/project/types.ts`）需要扩展**。当前只有 label + color，本 Story 需要添加 description、ctaLabel、icon 映射。建议新建 `SOP_STAGES` 常量数组保持有序：

```typescript
export const SOP_STAGES = [
  { key: 'requirements-analysis', label: '需求分析', shortLabel: '需求', altKey: 2 },
  { key: 'solution-design', label: '方案设计', shortLabel: '设计', altKey: 3 },
  { key: 'proposal-writing', label: '方案撰写', shortLabel: '撰写', altKey: 4 },
  { key: 'cost-estimation', label: '成本评估', shortLabel: '成本', altKey: 5 },
  { key: 'compliance-review', label: '评审打磨', shortLabel: '评审', altKey: 6 },
  { key: 'delivery', label: '交付归档', shortLabel: '交付', altKey: null },
] as const
```

### SOP 进度条视觉规范

**Alpha 阶段布局（白色基础版）：**
```
┌──────────────────────────────────────────────────────────────────────┐
│  ○ 需求分析 ─── ○ 方案设计 ─── ○ 方案撰写 ─── ○ 成本估算 ─── ○ 评审打磨 ─── ○ 交付  │  48px
└──────────────────────────────────────────────────────────────────────┘
```
- 高度固定 48px，白色背景 `#FFFFFF`，底部 1px border `#F0F0F0`
- 6 个阶段节点水平均匀分布，`display: flex; justify-content: space-between`
- 节点：圆形图标容器（32px）+ 阶段名称（12px, font-medium）
- 节点间连接线：实线，2px 宽，色跟随左节点状态

**脉冲动画（进行中状态）：**
```css
@keyframes sop-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(22, 119, 255, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(22, 119, 255, 0); }
}
```
- `@media (prefers-reduced-motion: reduce)` 时禁用动画，改为静态蓝色实心圆

**Beta 升级预留**：后续 Beta 阶段将背景切换为深色 `#0C1D3A`，文字改为白色。本 Story 的组件应使用 CSS 变量而非硬编码颜色，便于 Beta 替换。

### 与 Story 1.7 的边界

- **本 Story（1.6）** 实现：SOP 进度条 + 阶段引导占位符 + 简易工作空间壳层（进度条 + 单一内容区）
- **Story 1.7** 实现：完整三栏布局（文档大纲树 240px + 主内容区 min 600px + 侧边栏 320px + 状态栏 32px）
- 本 Story 的 `ProjectWorkspace` 组件结构应**预留**三栏布局的插入点，但不实现。建议使用 `<div className="flex-1">` 作为主内容区，后续 1.7 在此容器外层包裹三栏 layout

### ProjectCard onClick 导航

**已有代码**（`ProjectKanban.tsx`）在卡片点击时使用 `useNavigate()` 跳转到 `/project/${id}`。确认此导航链路不需要修改。

### 路由返回

在 `ProjectWorkspace` 中需要提供返回看板的导航入口（如面包屑或返回按钮），使用 `useNavigate()` 跳转回 `/`。

### UX 设计规范

**设计方向**：混合方向 — A 的深色 SOP 顶栏 + B 的白色极简内容区（但 Alpha 先用全白基础版）

**间距参考（8px 基准）：**
- 进度条内间距：`space-md`（16px）水平，`space-sm`（8px）垂直
- 阶段节点间距：自适应（flex space-between）
- 引导占位符内间距：`space-xl`（32px）

**动画时长参考：**
- 阶段切换过渡：300ms ease-out（`--duration-panel`）
- 脉冲动画：1.5s infinite（不受 duration token 控制）
- 引导内容切换：300-400ms ease-out（`--duration-content`）

**Ant Design 组件使用：**
| 组件 | 用途 | 定制程度 |
|------|------|---------|
| message | 阶段跳转约束提示 | 低 |
| Button | 引导占位符 CTA | 低 |
| Spin | 项目数据加载状态 | 低 |
| Result | 项目加载失败状态 | 低 |

**不使用 Ant Design Steps 组件**：Steps 组件的定制成本高（自定义图标+连接线+脉冲动画），且 Beta 深色主题改造困难。自定义实现更可控。

### Prototype References（开发查找顺序）

- 项目级标准母版: `_bmad-output/implementation-artifacts/prototypes/prototype.pen`
- Manifest: `_bmad-output/implementation-artifacts/prototypes/prototype-manifest.yaml`
- Story-bound `.pen`: 如已存在 `story-1-6.pen`，查看其中 SOP 进度条设计画板
- 全局风格基线: `story-1-4-color-system.png` / `story-1-4-typography.png` / `story-1-4-spacing-grid.png` / `story-1-4-icon-set.png`
- 还原原则：先看 reference PNG 做静态还原，再打开 `.pen` 查看结构和交互细节

### Project Structure Notes

**新增文件预期：**
```
src/renderer/src/
├── modules/project/
│   ├── components/
│   │   ├── ProjectWorkspace.tsx       ← 新建：项目工作空间容器
│   │   ├── SopProgressBar.tsx         ← 新建：SOP 6 阶段进度条
│   │   └── StageGuidePlaceholder.tsx  ← 新建：阶段引导占位符
│   ├── hooks/
│   │   ├── useCurrentProject.ts       ← 新建：当前项目加载 hook
│   │   ├── useSopNavigation.ts        ← 新建：SOP 导航状态与逻辑
│   │   └── useSopKeyboardNav.ts       ← 新建：SOP 快捷键绑定

tests/unit/renderer/
├── project/
│   ├── SopProgressBar.test.tsx        ← 新建
│   ├── StageGuidePlaceholder.test.tsx ← 新建
│   ├── ProjectWorkspace.test.tsx      ← 新建
│   ├── useSopNavigation.test.ts       ← 新建
│   └── useSopKeyboardNav.test.ts      ← 新建
```

**修改文件预期：**
- `src/renderer/src/App.tsx` — `/project/:id` 路由替换为 `<ProjectWorkspace />`
- `src/shared/ipc-types.ts` — `UpdateProjectInput` 的 Pick 添加 `'sopStage'`
- `src/renderer/src/modules/project/types.ts` — 添加 `SOP_STAGES` 常量、`SopStageStatus` 类型
- `src/renderer/src/stores/projectStore.ts` — 添加 `loadProject(id)` action
- `src/renderer/src/modules/project/index.ts` — 导出新组件

### 前序 Story 开发经验

**Story 1.5 关键经验：**
- `useProjectStore` 已实现完整 CRUD 和 filter/sort，本 Story 在其基础上添加 `loadProject` 不改变已有接口
- `ProjectCard` 的 `onClick` 已导航到 `/project/:id`，无需修改
- HashRouter 路由在 Electron `file://` 协议下工作正常
- Ant Design + Tailwind CSS 层叠顺序：`@layer theme, base, antd, components, utilities`
- React 19.2.1 兼容性——所有组件必须 React 19 兼容

**Story 1.4 关键经验：**
- Tailwind v4 不使用 `tailwind.config.ts`，所有配置在 CSS `@theme` 块
- 图标组件使用 SVG React 组件，线性风格 1.5px 线宽圆角端点
- `@ant-design/cssinjs` + `StyleProvider layer` 解决样式冲突

**Story 1.3 关键经验：**
- `createIpcHandler<C>()` 工厂函数自动包装 try/catch → ApiResponse
- Preload API 使用 typedInvoke 内部辅助 + 白名单模式

### 测试规范

- **单元测试：** Vitest + @testing-library/react（jsdom 环境）
- **组件测试：** render + fireEvent/userEvent，验证 DOM 输出
- **Hook 测试：** renderHook + act，验证状态变更
- **Mock 策略：** Mock `window.api.*` IPC 方法 + `useNavigate`/`useParams`
- **测试 setup：** `tests/unit/renderer/setup.ts` 已配置 matchMedia / getComputedStyle mock
- **动画测试：** 验证 CSS class 存在而非动画效果；`prefers-reduced-motion` 通过 matchMedia mock 验证

### 反模式清单（禁止）

- ❌ 使用 Ant Design `Steps` 组件做 SOP 进度条（定制成本太高，Beta 深色改造困难）
- ❌ 渲染进程直接 import Node.js 模块
- ❌ 相对路径 import 超过 1 层（禁止 `../../`）
- ❌ throw 裸字符串（必须用 BidWiseError）
- ❌ 硬编码颜色值（必须使用 CSS 变量 `var(--color-sop-*)` 或 tokens.ts）
- ❌ 创建新的 IPC channel 来更新 sopStage（已有 `project:update` 支持）
- ❌ 在 store Action 内同步调用其他 store 的 Action
- ❌ 为每个 SOP 阶段创建独立路由（阶段切换是组件内状态，不是路由切换）
- ❌ 使用 `isLoading` / `fetching` / `pending`（统一用 `loading: boolean`）
- ❌ 创建 `tailwind.config.ts`（Tailwind v4 CSS-based only）

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.6 SOP 导航与阶段引导]
- [Source: _bmad-output/planning-artifacts/architecture.md#代码组织结构]
- [Source: _bmad-output/planning-artifacts/architecture.md#Zustand Store 模式]
- [Source: _bmad-output/planning-artifacts/architecture.md#强制执行规则]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#信息架构骨架]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#SOP 阶段状态色]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#设计方向综合]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#实施方案（Phase1/2/3）]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#SOP 导航快捷键]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#ARIA 标注重点]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#引导式占位符]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#模态策略原则]
- [Source: _bmad-output/planning-artifacts/prd.md#FR5 SOP 6 阶段引导]
- [Source: _bmad-output/implementation-artifacts/story-1-5-project-crud-kanban.md]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### Change Log

- 2026-03-20 — Story 文件创建，包含完整开发上下文

### File List
