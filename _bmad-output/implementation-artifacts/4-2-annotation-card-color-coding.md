# Story 4.2: 批注卡片与五色分层着色

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 批注按来源类型分层着色，一目了然知道是谁说的什么,
So that 我能快速区分 AI 建议、资产推荐、评分预警、对抗攻击和人工指导。

## Acceptance Criteria

1. **Given** 批注渲染
   **When** 查看批注卡片
   **Then** 五色变体正确应用：AI 建议蓝 `#1677FF` / 资产推荐绿 `#52C41A` / 评分预警橙 `#FAAD14` / 对抗攻击红 `#FF4D4F` / 人工批注紫 `#722ED1`（FR28, UX-DR9）
   **And** 每张卡片的左边框颜色、类型图标颜色、类型文字标签颜色均使用对应色值
   **And** `cross-role` 类型复用紫色 `#722ED1`（与 `human` 共享颜色，仅文字标签区分）

2. **Given** 每种颜色的批注卡片
   **When** 查看操作按钮
   **Then** 按类型显示专属操作按钮组：
   - 蓝色（AI 建议）：采纳 / 驳回 / 修改
   - 绿色（资产推荐）：插入 / 忽略 / 查看
   - 橙色（评分预警）：处理 / 标记待决策
   - 红色（对抗攻击）：接受并修改 / 反驳 / 请求指导
   - 紫色（人工/跨角色）：标记已处理 / 回复
   （UX-DR9）

3. **Given** 批注卡片操作
   **When** 用户点击操作按钮
   **Then** 状态流转正确：
   - "采纳"/"插入"/"处理"/"接受并修改"/"标记已处理" → `status: 'accepted'`
   - "驳回"/"忽略"/"反驳" → `status: 'rejected'`
   - "标记待决策"/"请求指导" → `status: 'needs-decision'`
   - "修改"/"查看"/"回复" → 不变更状态，触发对应 UI 交互（Alpha 阶段为 placeholder）

4. **Given** 批注导航
   **When** 用户按 `Alt+↑/↓`
   **Then** 在批注列表中上一条/下一条切换焦点，当前聚焦卡片有蓝色 2px outline
   **When** 用户按 `Alt+Enter`
   **Then** 执行当前聚焦卡片的首个正向操作（采纳/插入/处理/接受并修改/标记已处理）
   **When** 用户按 `Alt+Backspace`
   **Then** 执行当前聚焦卡片的驳回操作（驳回/忽略/反驳）
   **And** 若当前聚焦卡片类型没有 `targetStatus === 'rejected'` 的操作（评分预警、人工批注、跨角色），不变更状态并显示轻量提示
   **When** 用户按 `Alt+D`
   **Then** 将当前聚焦卡片标记为待决策
   **And** `Alt+Enter` / `Alt+Backspace` / `Alt+D` 仅对 `status === 'pending'` 的卡片变更状态；已处理卡片不重复写入状态并显示轻量提示
   （UX-DR27）

5. **Given** 批注信息传达
   **When** 渲染
   **Then** 每种批注同时有图标 + 颜色 + 文字标签三重编码，不单靠颜色区分（UX-DR24 无障碍要求）

6. **Given** 批注状态视觉
   **When** 批注已被处理（`accepted` / `rejected` / `needs-decision`）
   **Then** 卡片视觉降低透明度（opacity 0.6），操作按钮组隐藏，显示状态结果标签

7. **Given** 批注面板中的已有简化列表
   **When** 升级为完整五色卡片
   **Then** 保留 Story 4.1 的 AnnotationPanel 壳层合同（展开 320px / 折叠 40px / 紧凑 48px + flyout）、header "批注" 标题、待处理 pill 计数器、loading / empty / list / error 状态

## Tasks / Subtasks

### 共享常量与颜色定义

- [x] Task 1: 定义批注五色常量与操作映射（AC: #1, #2, #5）
  - [x] 1.1 新建 `src/renderer/src/modules/annotation/constants/annotation-colors.ts`
  - [x] 1.2 定义五色映射常量：
    ```typescript
    export const ANNOTATION_TYPE_COLORS: Record<AnnotationType, string> = {
      'ai-suggestion': '#1677FF',
      'asset-recommendation': '#52C41A',
      'score-warning': '#FAAD14',
      'adversarial': '#FF4D4F',
      'human': '#722ED1',
      'cross-role': '#722ED1',  // 与 human 共享紫色
    }
    ```
  - [x] 1.3 定义每种类型的操作按钮配置：
    ```typescript
    export interface AnnotationAction {
      key: string           // 如 'accept', 'reject'
      label: string         // 中文显示文案
      targetStatus?: AnnotationStatus  // 点击后的状态变更
      primary?: boolean     // 是否为主操作按钮
    }
    export const ANNOTATION_TYPE_ACTIONS: Record<AnnotationType, AnnotationAction[]>
    ```
  - [x] 1.4 定义类型标签与图标映射（整合 Story 4.1 `AnnotationPanel.tsx` 中的 `TYPE_LABELS`）
  - [x] 1.5 定义状态结果标签与颜色映射：
    ```typescript
    export const ANNOTATION_STATUS_LABELS: Record<Exclude<AnnotationStatus, 'pending'>, string> = {
      accepted: '已采纳 ✓',
      rejected: '已驳回 ✗',
      'needs-decision': '待决策 ⏳',
    }
    export const ANNOTATION_STATUS_COLORS: Record<Exclude<AnnotationStatus, 'pending'>, string> = {
      accepted: '#52C41A',
      rejected: '#FF4D4F',
      'needs-decision': '#FAAD14',
    }
    ```
  - [x] 1.6 单测验证所有 `AnnotationType` 枚举值都有颜色、标签、图标和操作定义，并验证所有已处理 `AnnotationStatus` 都有结果标签与颜色定义

### 批注卡片组件

- [x] Task 2: 创建 `AnnotationCard` 组件（AC: #1, #2, #3, #5, #6）
  - [x] 2.1 新建 `src/renderer/src/modules/annotation/components/AnnotationCard.tsx`
  - [x] 2.2 卡片布局结构：
    - 左边框 3px 宽度使用 `ANNOTATION_TYPE_COLORS[annotation.type]` 颜色
    - Header 区域：类型图标（复用 `AnnotationAiIcon` 等 Story 4.1 已建图标） + 类型文字标签 + 作者 · 相对时间
    - Content 区域：批注正文（3 行 clamp，Tooltip 查看全文）
    - Action 区域：按类型渲染专属操作按钮组（仅 `status === 'pending'` 时显示）
  - [x] 2.3 图标 + 颜色 + 文字标签三重编码实现（UX-DR24）：
    - 图标：使用 Story 4.1 创建的 `Annotation*Icon` 组件，颜色使用对应色值
    - 颜色：左边框 + 图标均使用 `ANNOTATION_TYPE_COLORS`
    - 文字标签：Ant Design `Tag` 组件显示类型名称，文字色/边框色必须使用对应 hex；背景可用浅色 tint，但不得仅依赖 Ant Design 预设色名
  - [x] 2.4 `cross-role` 类型：复用 `AnnotationHumanIcon`（暂无专属图标），文字标签区分为"跨角色"
  - [x] 2.5 已处理状态（`accepted` / `rejected` / `needs-decision`）：
    - 整体 `opacity: 0.6`
    - 隐藏操作按钮组
    - 显示状态结果标签（如"已采纳 ✓"/"已驳回 ✗"/"待决策 ⏳"）
  - [x] 2.6 操作按钮点击处理：
    - 有 `targetStatus` 的按钮：调用 `useAnnotationStore.getState().updateAnnotation({ id, status: targetStatus })` 或等价 selector action
    - 无 `targetStatus` 的按钮（修改/查看/回复）：Alpha 阶段弹出 `message.info('功能将在后续版本实现')`
  - [x] 2.7 支持 `focused` prop 控制焦点态（蓝色 2px outline）
  - [x] 2.8 支持 `ref` 转发，供键盘导航 `scrollIntoView` 使用
  - [x] 2.9 使用 `data-testid="annotation-card"` 和 `data-annotation-id={annotation.id}`

### 批注面板升级

- [x] Task 3: 升级 `AnnotationPanel` 集成五色卡片与键盘导航（AC: #4, #7）
  - [x] 3.1 修改 `src/renderer/src/modules/project/components/AnnotationPanel.tsx`
  - [x] 3.2 将 Story 4.1 的简化列表渲染替换为 `AnnotationCard` 组件
  - [x] 3.3 将内联的 `TYPE_LABELS` / `TYPE_COLORS` / `STATUS_LABELS` / `STATUS_COLORS` 迁移到 Task 1 的集中常量文件，AnnotationPanel 引用常量文件
  - [x] 3.4 实现键盘导航状态管理：
    - `focusedIndex: number` 追踪当前聚焦的卡片索引；有批注时默认 `0`，无批注时为 `-1`；批注列表变化后将索引 clamp 到有效范围
    - `Alt+↑`：focusedIndex - 1（到头循环到末尾）
    - `Alt+↓`：focusedIndex + 1（到末循环到头部）
    - 聚焦卡片自动 `scrollIntoView({ block: 'nearest' })`
  - [x] 3.5 实现键盘快捷操作：
    - 仅当聚焦卡片 `status === 'pending'` 时执行会变更状态的快捷操作；已处理卡片快捷操作 no-op 并显示轻量提示
    - `Alt+Enter`：执行聚焦卡片 `ANNOTATION_TYPE_ACTIONS` 中首个 `primary: true` 且带 `targetStatus` 的操作
    - `Alt+Backspace`：执行聚焦卡片 `ANNOTATION_TYPE_ACTIONS` 中 `targetStatus === 'rejected'` 的操作；若该类型无驳回操作则 no-op 并显示轻量提示
    - `Alt+D`：将聚焦卡片状态更新为 `needs-decision`
  - [x] 3.6 键盘事件仅在标准展开面板或 compact flyout 打开且有批注时激活；当事件目标位于 `input` / `textarea` / `[contenteditable="true"]` / `[role="textbox"]` / `[data-testid="plate-editor-content"]` 内时不拦截，避免与编辑器快捷键冲突
  - [x] 3.7 保留 Story 4.1 的壳层合同：
    - 宽度 320px / 折叠 40px / 紧凑图标栏 48px + flyout
    - header "批注" 标题 + 蓝色 pill "N 待处理"
    - `data-testid="annotation-panel"`, `role="complementary"`, `aria-label="智能批注"`, `aria-live="polite"`
    - loading / empty / list / error 状态
  - [x] 3.8 更新 `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` 如需传递新 props

### 测试

- [x] Task 4: 单元测试、集成测试与 E2E（AC: #1-#7）
  - [x] 4.1 `tests/unit/renderer/modules/annotation/constants/annotation-colors.test.ts` — 颜色映射完整性、操作定义完整性
  - [x] 4.2 `tests/unit/renderer/modules/annotation/components/AnnotationCard.test.tsx` — 五色渲染、三重编码、操作按钮按类型渲染、点击状态变更、placeholder 提示、已处理降低透明度、状态标签、焦点态、`aria-label` 摘要
  - [x] 4.3 `tests/unit/renderer/project/AnnotationPanel.test.tsx` — 升级后的卡片列表渲染、键盘导航（Alt+↑/↓ 循环）、快捷操作（Alt+Enter/Alt+Backspace/Alt+D）、无 reject 操作 no-op、已处理卡片 no-op、编辑器目标不拦截、壳层合同保留
  - [x] 4.4 `tests/e2e/stories/story-4-2-annotation-card-color.spec.ts` — 预置不同类型批注 → 验证五色左边框 → 操作按钮文案 → 键盘导航 → 状态变更后卡片降低透明度
  - [x] 4.5 `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` 全部通过

## Dev Notes

### 本 Story 在 Epic 4 中的位置

```text
Story 4.1 (done): Annotation Service 基础设施、数据模型、SQLite/sidecar/IPC/store
→ Story 4.2 (本 Story): 五色批注卡片与基础交互
Story 4.3 (next): 智能批注面板排序/过滤/微对话
Story 4.4: 待决策状态与跨角色通知
```

本 Story 是批注系统的"视觉层"。Story 4.1 建好了数据管道（shared types → DB → service → IPC → store → 简化列表），本 Story 将简化列表升级为五色分层卡片，让用户一眼区分"是谁说的什么"。核心是颜色编码 + 专属操作按钮 + 键盘导航。

### 数据流

```
已有 Story 4.1 数据流（不变）：
  annotationStore.loadAnnotations(projectId)
    → IPC: annotation:list → annotationService.list()
    → SQLite query → AnnotationRecord[]
    → store.projects[projectId].items 更新

本 Story 新增的交互流：
  AnnotationPanel 渲染 AnnotationCard 列表
    ↓
  用户点击操作按钮（如"采纳"）
    ↓
  annotationStore.updateAnnotation({ id, status: 'accepted' })
    ↓
  IPC: annotation:update → annotationService.update()
    ↓
  SQLite 更新 + sidecar 镜像同步
    ↓
  store 本地缓存更新 → 卡片 re-render（opacity 降低、操作按钮隐藏）
```

```
键盘导航流：
  面板展开 + 有批注
    ↓
  Alt+↑/↓ → focusedIndex 变化 → AnnotationCard focused prop 更新 → 蓝色 outline + scrollIntoView
    ↓
  Alt+Enter → pending 卡片：查找 primary action → 执行状态变更；已处理卡片 no-op
  Alt+Backspace → pending 卡片：查找 reject action → 执行状态变更；无 reject action 或已处理卡片 no-op
  Alt+D → pending 卡片：直接更新为 needs-decision；已处理卡片 no-op
```

### 已有基础设施（禁止重复实现）

| 组件 | 位置 | 用途 |
|------|------|------|
| AnnotationType / AnnotationStatus | `src/shared/annotation-types.ts` | 类型与状态枚举 |
| AnnotationRecord | `src/shared/annotation-types.ts` | 批注数据模型 |
| annotationStore | `src/renderer/src/stores/annotationStore.ts` | Zustand 状态管理，含 CRUD actions |
| useProjectAnnotations | `src/renderer/src/modules/annotation/hooks/useAnnotation.ts` | 按项目读取批注 hook |
| usePendingAnnotationCount | `src/renderer/src/modules/annotation/hooks/useAnnotation.ts` | 待处理计数 hook |
| AnnotationPanel | `src/renderer/src/modules/project/components/AnnotationPanel.tsx` | 面板壳层 + 简化列表（本 Story 升级） |
| AnnotationAiIcon | `src/renderer/src/shared/components/icons/AnnotationAiIcon.tsx` | AI 建议图标（蓝） |
| AnnotationAssetIcon | `src/renderer/src/shared/components/icons/AnnotationAssetIcon.tsx` | 资产推荐图标（绿） |
| AnnotationScoreIcon | `src/renderer/src/shared/components/icons/AnnotationScoreIcon.tsx` | 评分预警图标（橙） |
| AnnotationAttackIcon | `src/renderer/src/shared/components/icons/AnnotationAttackIcon.tsx` | 对抗攻击图标（红） |
| AnnotationHumanIcon | `src/renderer/src/shared/components/icons/AnnotationHumanIcon.tsx` | 人工批注图标（紫） |
| formatRelativeTime | `src/renderer/src/shared/lib/format-time.ts` | 相对时间格式化 |
| annotationService | `src/main/services/annotation-service.ts` | 主进程 CRUD + sidecar 镜像 |
| annotation IPC handlers | `src/main/ipc/annotation-handlers.ts` | IPC 薄分发 |
| ProjectWorkspace | `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` | 工作空间集成点 |

### 关键实现决策

**1. 五色使用精确 hex 值，不依赖 Ant Design 预设颜色名**

- Story 4.1 的 `TYPE_COLORS` 使用了 Ant Design Tag 的颜色名（`'blue'`, `'green'` 等），不够精确，且 `cross-role` 当前为 `cyan`，与五色规范冲突
- 本 Story 使用 UX 规范指定的精确 hex 值作为权威色值
- 左边框颜色、图标颜色直接使用 hex 值
- 类型 `Tag` 的文字色和边框色必须直接使用 hex 值；背景可用同色浅 tint（例如 `rgba`/透明 hex），不得仅使用 Ant Design 预设色名

**2. 操作按钮组按类型差异化，不是通用 CRUD**

- 不同类型的批注代表不同的上下文语义，操作选项必须匹配语义
- AI 建议的"采纳"≠ 资产推荐的"插入"，虽然最终都是 `status: 'accepted'`
- 用独立的常量映射表管理每种类型的操作列表，而非写死 if-else
- 人工批注 / 跨角色紫色卡片以"标记已处理"作为 primary 正向操作、"回复"作为 placeholder；这与 4.2 UX spec / prototype 保持一致，并覆盖 epics 中"回复 / 标记已处理"的早期顺序表述

**3. 键盘导航仅在面板展开时激活**

- `Alt+↑/↓/Enter/Backspace/D` 仅在 AnnotationPanel 标准展开或 compact flyout 打开且有批注列表时响应
- 面板折叠或编辑器/输入控件聚焦时不拦截这些快捷键
- 聚焦索引有批注时默认第一张卡片；批注列表变化后保持在有效范围内
- `Alt+Backspace` 仅对存在 rejected 操作的类型生效（AI 建议、资产推荐、对抗攻击）；评分预警、人工批注、跨角色无驳回按钮时 no-op 并提示
- 已处理卡片（`accepted` / `rejected` / `needs-decision`）不响应状态变更类快捷键，避免重复写入
- 使用 `useEffect` 注册/注销 keydown listener，依赖面板展开状态

**4. "修改"/"查看"/"回复"操作 Alpha 阶段为 placeholder**

- 这些操作需要更复杂的 UI 交互（内联编辑、详情弹出、线程回复），属于 Story 4.3/4.4 范畴
- Alpha 阶段点击后显示 `message.info('功能将在后续版本实现')`
- 操作配置中 `targetStatus` 为 `undefined` 的按钮即为 placeholder

**5. `cross-role` 类型复用紫色和 human 图标**

- UX-DR9 只定义了五色，`cross-role` 没有专属色
- `cross-role` 和 `human` 共享紫色 `#722ED1` 和 `AnnotationHumanIcon`
- 仅通过文字标签区分（"人工批注" vs "跨角色"）
- Story 4.4 可能为 `cross-role` 增加专属图标和交互

**6. 已处理批注降低视觉权重而非完全隐藏**

- `accepted`/`rejected`/`needs-decision` 的卡片 `opacity: 0.6`，仍在列表中可见
- 操作按钮隐藏，替换为状态结果标签
- 后续 Story 4.3 的过滤器可按状态隐藏/显示

### 项目结构对齐

```
src/renderer/src/modules/annotation/
  constants/
    annotation-colors.ts       ← 新增：五色常量、操作映射、标签映射
  components/
    AnnotationCard.tsx         ← 新增：五色批注卡片组件
  hooks/
    useAnnotation.ts           ← 已有：Story 4.1 hooks

src/renderer/src/modules/project/components/
  AnnotationPanel.tsx          ← 修改：集成 AnnotationCard + 键盘导航

src/renderer/src/shared/components/icons/
  AnnotationAiIcon.tsx         ← 已有：Story 4.1
  AnnotationAssetIcon.tsx      ← 已有
  AnnotationScoreIcon.tsx      ← 已有
  AnnotationAttackIcon.tsx     ← 已有
  AnnotationHumanIcon.tsx      ← 已有
```

### Story 4.2 UX 原型查阅顺序

本 Story 的视觉与交互细节以 story 级 UX 原型为准。实现前按以下顺序核对：

1. 先读本 Story 的 Dev Notes 与关键实现决策
2. 读取 `_bmad-output/implementation-artifacts/4-2-annotation-card-color-coding-ux/prototype.manifest.yaml`
3. 对照 PNG 导出：
   - `_bmad-output/implementation-artifacts/4-2-annotation-card-color-coding-ux/exports/Je7Wk.png` — Screen 1 五色批注卡片（待处理态）
   - `_bmad-output/implementation-artifacts/4-2-annotation-card-color-coding-ux/exports/r8InM.png` — Screen 2 聚焦态 + 已处理态
   - `_bmad-output/implementation-artifacts/4-2-annotation-card-color-coding-ux/exports/3jnJs.png` — Screen 3 键盘导航与五色映射
4. 查阅 `_bmad-output/implementation-artifacts/4-2-annotation-card-color-coding-ux/prototype.pen` 获取结构与交互细节

与早期 epics/UX 通用文档有细节差异时，以本 story 文件、`ux-spec.md`、PNG 导出和 `.pen` 的一致结论为准；例如紫色人工/跨角色卡片的 primary 操作为"标记已处理"，"回复"为 Alpha placeholder。

### 前一 Story（4-1）关键学习

1. **annotationStore 是 per-project 分桶**：`store.projects[projectId]` 结构，CRUD action 需要 projectId
2. **TYPE_COLORS/TYPE_LABELS 已存在但不够精确**：`AnnotationPanel.tsx` 中的内联常量使用 Ant Design 颜色名，本 Story 应升级为精确 hex 值并集中管理
3. **壳层几何合同严格**：展开 320px / 折叠 40px / 紧凑图标栏 48px + flyout，不可更改
4. **Header 合同**：标题"批注"+ 蓝色 pill "N 待处理"（N=0 时隐藏 pill），不可更改
5. **`formatRelativeTime`** 已提取到 `src/renderer/src/shared/lib/format-time.ts`，直接复用
6. **5 个图标组件已创建**：`AnnotationAiIcon` 等已存在，`cross-role` 暂无专属图标，复用 `AnnotationHumanIcon`
7. **sidecar 镜像由 `annotationService` 在写操作后自动完成**：渲染层不关心 sidecar 同步，只通过 store action 调用 IPC
8. **E2E 测试模式**：通过 `window.api.annotationCreate(...)` 预置测试数据，而非 UI 操作创建

### 禁止事项

- **禁止**修改 AnnotationPanel 壳层几何尺寸（320px/40px/48px 由 Story 1.7 固定）
- **禁止**修改 header 标题或 pill 计数器逻辑（Story 4.1 合同）
- **禁止**新建 Zustand store（使用已有 `annotationStore`）
- **禁止**新增 IPC 通道（使用 Story 4.1 已有的 `annotation:update`）
- **禁止**在卡片组件中直接调用 IPC（通过 `annotationStore` action）
- **禁止**为颜色值使用 CSS 变量或 Tailwind 自定义色（使用精确 hex 常量）
- **禁止**实现批注过滤器或排序逻辑（Story 4.3 范畴）
- **禁止**实现批注线程回复或内联编辑（Story 4.3/4.4 范畴）
- **禁止**实现跨角色通知或指导人选择（Story 4.4 范畴）
- **禁止**使用 `../../` 以上的相对导入路径（使用 `@renderer/`、`@modules/`、`@shared/` 别名）
- **禁止**throw 裸字符串（使用 `BidWiseError`）

### Alpha 阶段边界说明

- 本 Story 实现五色卡片的视觉呈现和基础操作（状态变更类按钮生效）
- "修改"、"查看"、"回复"三类操作为 placeholder，Alpha 阶段仅显示提示
- 不实现过滤器、智能排序、过载应急（Story 4.3）
- 不实现待决策协作流程和跨角色通知（Story 4.4）
- 键盘导航为基础版：上下切换 + 快捷采纳/驳回/待决策；更复杂的键盘操作可在后续迭代

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.2] — 批注卡片与五色分层着色原始需求
- [Source: _bmad-output/planning-artifacts/prd.md#FR28] — 批注按来源分层着色
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR9] — 批注卡片组件设计规范（五色变体 + 专属操作按钮组）
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR24] — 无障碍三重编码（图标+颜色+文字标签不单靠颜色）
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR27] — 批注导航快捷键（Alt+↑↓/Enter/Backspace/D）
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#批注五色编码] — 精确色值定义
- [Source: _bmad-output/implementation-artifacts/4-2-annotation-card-color-coding-ux/prototype.manifest.yaml] — Story 4.2 UX 查阅入口与 frame/export 清单
- [Source: _bmad-output/implementation-artifacts/4-2-annotation-card-color-coding-ux/ux-spec.md] — 五色卡片、操作按钮、键盘导航、无障碍与壳层合同的 story 级规格
- [Source: _bmad-output/implementation-artifacts/4-2-annotation-card-color-coding-ux/exports/Je7Wk.png] — 待处理态五色卡片视觉参考
- [Source: _bmad-output/implementation-artifacts/4-2-annotation-card-color-coding-ux/exports/r8InM.png] — 聚焦态与已处理态视觉参考
- [Source: _bmad-output/implementation-artifacts/4-2-annotation-card-color-coding-ux/exports/3jnJs.png] — 键盘导航与五色映射参考
- [Source: _bmad-output/implementation-artifacts/4-2-annotation-card-color-coding-ux/prototype.pen] — 原型结构与交互细节
- [Source: _bmad-output/implementation-artifacts/4-1-enabler-annotation-service.md] — Story 4.1 完整实现记录
- [Source: src/shared/annotation-types.ts] — 批注类型与状态定义
- [Source: src/renderer/src/stores/annotationStore.ts] — 批注 Zustand store
- [Source: src/renderer/src/modules/annotation/hooks/useAnnotation.ts] — 批注 hooks
- [Source: src/renderer/src/modules/project/components/AnnotationPanel.tsx] — 当前面板实现
- [Source: src/renderer/src/shared/components/icons/Annotation*Icon.tsx] — 5 个批注图标组件
- [Source: src/renderer/src/shared/lib/format-time.ts] — 相对时间格式化

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- jsdom converts hex colors to rgb in style assertions — used `hexToRgb()` helper in tests
- `scrollIntoView` not available in jsdom — used optional chaining `el?.scrollIntoView?.()`
- `window` object as `e.target` in keyboard events lacks `getAttribute` — added `instanceof HTMLElement` guard
- React lint rule `react-hooks/set-state-in-effect` — replaced `useEffect` + `setFocusedIndex` with derived `clampIndex()` on render

### Completion Notes List

- ✅ Task 1: 五色常量文件完成，含 6 个导出映射表（颜色、标签、图标、操作、状态标签、状态颜色），20 个单测全绿
- ✅ Task 2: AnnotationCard 组件完成，含 forwardRef、三重编码、操作按钮、已处理态、焦点态，32 个单测全绿
- ✅ Task 3: AnnotationPanel 升级完成，AnnotationItem 替换为 AnnotationCard，键盘导航 hook（Alt+↑↓/Enter/Backspace/D），编辑器冲突规避，壳层合同保留，36 个单测全绿
- ✅ Task 4: E2E 测试编写完成，Story 4.1 E2E 中的 `annotation-item` 更新为 `annotation-card`
- ✅ 全套 renderer 测试 72 文件 620 测试全通过，零回归
- ✅ ESLint 0 warning 0 error，TypeScript 无新增类型错误
- 注意：`main` 项目测试因 worktree 中 better-sqlite3 native module 问题而失败，属 pre-existing，非本 Story 引入

### File List

新增：
- `src/renderer/src/modules/annotation/constants/annotation-colors.ts`
- `src/renderer/src/modules/annotation/components/AnnotationCard.tsx`
- `tests/unit/renderer/modules/annotation/constants/annotation-colors.test.ts`
- `tests/unit/renderer/modules/annotation/components/AnnotationCard.test.tsx`
- `tests/e2e/stories/story-4-2-annotation-card-color.spec.ts`

修改：
- `src/renderer/src/modules/project/components/AnnotationPanel.tsx`
- `tests/unit/renderer/project/AnnotationPanel.test.tsx`
- `tests/e2e/stories/story-4-1-annotation-service.spec.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-04-07: Story 4.2 实现完成 — 五色批注卡片、类型专属操作按钮、键盘导航、状态变更交互
- 2026-04-07: `validate-create-story` 修订
  - 对齐 4.2 UX spec / PNG / `.pen` 中紫色人工/跨角色卡片的操作顺序：`标记已处理` 为 primary，`回复` 为 placeholder
  - 补齐键盘快捷键边界：无 reject 操作 no-op、已处理卡片 no-op、编辑器/输入控件目标不拦截
  - 明确类型标签必须使用精确 hex 文字/边框色，不再沿用 Story 4.1 Ant Design 预设色名
  - 补齐 story 级 UX 原型查阅顺序与 References，避免 dev 忽略 manifest、PNG 导出和 `.pen`
