# Story 4.3: 智能批注面板与上下文优先级排序

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 批注面板按上下文智能排序并提供过滤,
So that 我在当前编辑位置看到最相关的批注，不被信息洪流淹没。

## Acceptance Criteria

1. **Given** 批注面板渲染 **When** 当前在 SOP 阶段 5（评审）**Then** 对抗反馈批注置顶；在阶段 4（撰写）时 AI 建议和资产推荐置顶（UX-DR10）

2. **Given** 批注过滤器 **When** 用户操作 **Then** 5 个着色圆点按钮切换批注类型显示/隐藏，待处理/已处理/待决策三标签切换状态过滤（UX-DR10）

3. **Given** 零批注场景 **When** 当前章节无待处理批注 **Then** 显示"本章节 AI 审查完毕，未发现需要您关注的问题"（非空白），而非当前的通用"本项目暂无批注"（UX-DR10）

4. **Given** 批注数超过 15 条 **When** 过载应急触发 **Then** 提供应急面板：[A] 逐条处理 [B] 补充上下文后重新生成 [C] 仅查看高优先级摘要（UX-DR10）

5. **Given** 批注面板 **When** 查看计数器 **Then** 实时显示各状态批注数量（待处理 N / 已处理 N / 待决策 N），每处理一条计数器递减

6. **Given** 用户在批注线程中想向系统提问 **When** 点击"向系统提问"入口 **Then** 输入问题后系统基于当前章节上下文给出 Streaming 风格回答
   **And** Alpha 阶段使用任务进度 + 完成后本地 progressive reveal 呈现回答，而不是 provider token-by-token streaming
   **And** 最终答案作为系统批注出现（UX-DR12）

7. **Given** 批注面板与编辑器联动 **When** 用户在编辑器中切换章节（通过大纲树点击或滚动） **Then** 批注面板自动过滤并显示当前章节关联的批注

## Tasks / Subtasks

### 上下文排序算法与章节锚点键

- [ ] Task 1: 实现章节锚点键与上下文排序（AC: #1, #7）
  - [ ] 1.1 新建 `src/shared/chapter-locator-key.ts`
    - 导出 `createChapterLocatorKey(locator: ChapterHeadingLocator): string`
    - Key 格式与现有 source attribution 保持一致：`${level}:${title}:${occurrenceIndex}`
    - **禁止**继续使用故事草稿中的 `section-3.2` / 纯 heading text / 纯章节编号 作为章节锚点键
  - [ ] 1.2 新建 `src/renderer/src/modules/annotation/lib/annotationSorter.ts`
  - [ ] 1.3 定义排序权重配置：
    ```typescript
    // 当前 Stage → 批注类型置顶映射
    const PHASE_TYPE_WEIGHTS: Record<ActiveStageKey, Partial<Record<AnnotationType, number>>> = {
      'proposal-writing': { 'ai-suggestion': 10, 'asset-recommendation': 8, 'score-warning': 6, adversarial: 4, human: 5, 'cross-role': 5 },
      'review': { adversarial: 10, 'score-warning': 8, human: 6, 'cross-role': 6, 'ai-suggestion': 4, 'asset-recommendation': 2 },
      // 其他阶段使用默认权重
    }
    ```
  - [ ] 1.4 实现 `sortAnnotations(items, context)` 纯函数：
    - 输入：`items: AnnotationRecord[]`、`context: { sopPhase: ActiveStageKey }`
    - `items` 已经是 `AnnotationPanel` 基于当前章节 scope 过滤后的子集；此函数**不再**承担跨章节过滤职责
    - 排序优先级：① pending 优先于 non-pending ② SOP 阶段类型权重 ③ createdAt DESC
    - 返回排序后的新数组（不修改原数组）
  - [ ] 1.5 单测覆盖：不同 SOP 阶段排序、pending 优先、稳定性边界、未知 stage fallback

### 类型过滤器与状态过滤器

- [ ] Task 2: 创建过滤器 UI 组件（AC: #2, #5）
  - [ ] 2.1 新建 `src/renderer/src/modules/annotation/components/AnnotationFilters.tsx`
  - [ ] 2.2 实现类型过滤器：
    - 5 个着色圆点按钮（蓝/绿/橙/红/紫），使用 `ANNOTATION_TYPE_COLORS` 常量
    - 紫色按钮同时控制 `human` + `cross-role` 两种类型；Tooltip 文案为 `人工 / 跨角色`
    - 每个按钮为 toggle 状态（选中/未选中），默认全部选中
    - 选中态：实心圆点 + 外圈高亮；未选中态：空心圆点 + 透明度 0.4
    - Tooltip 显示分组名称；蓝/绿/橙/红四个按钮复用 `ANNOTATION_TYPE_LABELS`
  - [ ] 2.3 实现状态过滤器：
    - 三个标签按钮：`待处理`（默认选中）/ `已处理`（覆盖 accepted + rejected）/ `待决策`
    - 每个标签显示对应数量 Badge（如"待处理 5"）
    - 标签使用 Ant Design `Segmented` 组件或自定义 radio-style 按钮
  - [ ] 2.4 过滤器状态管理：
    - 使用 `useState` 管理 5 色分组集合 `Set<AnnotationFilterGroup>` 和状态过滤 `'pending' | 'processed' | 'needs-decision'`
    - 导出 `useAnnotationFilters` hook 供 AnnotationPanel 使用
    - 过滤逻辑为纯函数 `filterAnnotations(items, typeFilter, statusFilter)`
    - 三个状态 Badge 数量按“当前章节 scope + 当前类型过滤”实时计算，再映射到当前选中的状态页签
  - [ ] 2.5 样式：使用 Tailwind CSS，与面板宽度 320px 适配，过滤器区域固定在列表上方
  - [ ] 2.6 单测覆盖：按钮渲染、toggle 交互、filter 逻辑、Badge 计数

### 章节联动与 section 感知

- [ ] Task 3: 实现编辑器章节与批注面板联动（AC: #7, #3）
  - [ ] 3.1 新建 `src/renderer/src/modules/annotation/hooks/useCurrentSection.ts`
  - [ ] 3.2 修改 `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx`
    - 为编辑器 heading wrapper 补充 `data-heading-level`、`data-heading-occurrence`、`data-heading-locator-key`
    - H2/H3/H4 使用 `createChapterLocatorKey(locator)` 输出稳定键；H1 可保留无 locator key
    - 这样 `useCurrentSection` 无需仅靠 heading 文本猜测章节
  - [ ] 3.3 实现章节追踪 hook：
    - 从 `documentStore` 获取当前方案内容
    - 监听编辑器滚动容器（`data-editor-scroll-container="true"`）和 selection 相关 DOM 事件（如 `selectionchange` / `keyup` / `mouseup`）
    - 根据最近可见 heading marker 推导当前章节 `ChapterHeadingLocator`
    - 返回 `{ locator, sectionKey, label }`，其中 `sectionKey = createChapterLocatorKey(locator)`
    - 当无法解析 H2-H4 章节时返回 `null`，由面板退回项目级空态/禁用 ask-system
  - [ ] 3.4 修改 AnnotationPanel 接收 `currentSection` prop
    - 结构：`{ locator: ChapterHeadingLocator; sectionKey: string; label: string } | null`
    - 当 `currentSection` 存在时，面板默认以该章节为 scope：列表、计数器、过载检测、零批注消息都只针对当前章节子集
    - 其他 section 与 `project-root` 批注不在默认章节视图中展示，避免重新引入信息洪流
  - [ ] 3.5 渲染当前章节标签行：`当前章节: {label}`，位置在过滤器区域下方，视觉对齐 Story 4.3 UX Screen 1/3
  - [ ] 3.6 更新零批注状态：当 `currentSection` 存在且该章节无待处理批注时，显示"本章节 AI 审查完毕，未发现需要您关注的问题"
  - [ ] 3.7 单测覆盖：locator 推导、章节联动、零批注状态切换、section 变化时列表更新

### 过载应急面板

- [ ] Task 4: 实现批注过载应急策略（AC: #4）
  - [ ] 4.1 新建 `src/renderer/src/modules/annotation/components/AnnotationOverloadPanel.tsx`
  - [ ] 4.2 实现过载检测：仅当 `statusFilter === 'pending'` 且当前章节 scope 下、当前类型过滤后的 pending 批注数 > 15 时触发
  - [ ] 4.3 应急面板 UI：
    - 横幅提示："本章节有 {N} 条待处理批注"
    - 三个选项卡片（Ant Design `Card` 样式）：
      - [A] "逐条处理" — 关闭应急面板，恢复标准列表视图
      - [B] "补充上下文后重新生成" — Alpha 阶段显示 `message.info('功能将在后续版本实现')` 占位，**不**触发任何 agent / 状态重置
      - [C] "仅查看高优先级摘要" — 进入局部 `summary` 模式，只显示 `adversarial + score-warning` 的 pending Top 5（继续沿用 `sortAnnotations` 排序）
    - 应急面板显示在列表上方，可关闭（用户选择后消失）
  - [ ] 4.4 单测覆盖：阈值触发、选项点击、summary 模式、面板显示/关闭

### AnnotationPanel 升级集成

- [ ] Task 5: 升级 AnnotationPanel 集成排序、过滤、section 联动（AC: #1-#5, #7）
  - [ ] 5.1 修改 `src/renderer/src/modules/project/components/AnnotationPanel.tsx`
  - [ ] 5.2 集成变更：
    - 新建 `src/renderer/src/modules/annotation/lib/annotationSectionScope.ts`，封装章节 scope 过滤、状态计数和 overload summary 辅助逻辑
    - 导入 `AnnotationFilters` 组件，放置在 header 下方、列表上方
    - 基于 `currentSection?.sectionKey` 先收敛到章节 scope，再应用类型/状态过滤与 `sortAnnotations`
    - 导入 `sortAnnotations` 排序函数，替换当前的 `createdAt DESC` 默认排序
    - 导入 `filterAnnotations` 过滤函数，应用类型 + 状态过滤
    - 接收 `sopPhase` 和 `currentSection` props（从 ProjectWorkspace 传入）
    - 传递 scope/filter/sort 后的列表给 `ListContent`
  - [ ] 5.3 集成 `AnnotationOverloadPanel`：在当前章节 scope 的 pending 数量超过阈值时显示
  - [ ] 5.4 更新 `EmptyContent`：
    - 当有 `currentSection` 时显示章节级零批注消息
    - 当无 `currentSection` 时保留现有项目级空状态
  - [ ] 5.5 更新 `PendingPill`：增强为显示当前过滤视图下的计数（非总计数）
  - [ ] 5.6 保持 compact icon bar / collapsed strip 的几何与可访问性合同不变；图标栏 Badge 仍显示项目级 pending 总数，不绑定面板局部过滤状态
  - [ ] 5.7 保持 Story 4.1/4.2 建立的 shell 合同不变：320px/40px/48px、键盘导航、3 种布局模式
  - [ ] 5.8 单测覆盖：集成排序/过滤、章节 scope、props 传递、shell 合同保持

### "向系统提问"微对话

- [ ] Task 6: 实现批注内"向系统提问"入口（AC: #6）
  - [ ] 6.1 新建 `src/renderer/src/modules/annotation/components/AskSystemDialog.tsx`
  - [ ] 6.2 实现 UI：
    - 面板底部固定"向系统提问"按钮（Ant Design `Button` + `QuestionCircleOutlined` 图标）
    - 点击后展开输入区域：`Input.TextArea` + "提交"按钮 + 关闭入口
    - 当 `currentSection === null` 时按钮禁用，并提示"进入具体章节后可向系统提问"
    - 提交后显示生成进度 + 渐进式回答区域
  - [ ] 6.3 实现提问逻辑：
    - 提交问题时构建 context：当前 `projectId` + `currentSection.locator` + `currentSection.sectionKey` + `extractMarkdownSectionContent(documentStore.content, currentSection.locator)` + 用户问题文本
    - 通过 IPC 调用 `agent:execute`（使用已有的 agentOrchestrator 基础设施）
    - agent type 使用已有的 `generate` agent，context 中标记 `mode: 'ask-system'`
    - **必须**同步修改 `src/main/services/agent-orchestrator/agents/generate-agent.ts`，在 `ask-system` 模式下走独立 prompt 分支
    - 新增 `src/main/prompts/ask-system.prompt.ts`（或同级等价 prompt 模块），遵守架构约束：所有 AI prompt 以 `.prompt.ts` 导出类型化函数
    - `task:progress` 只用于进度阶段显示；当前事件负载不包含 token 增量文本
  - [ ] 6.4 实现回答展示：
    - Alpha 阶段使用“完成后本地 progressive reveal”来匹配 UX 的 Streaming 风格，而不是扩展 provider 层 token streaming
    - 完成后，回答内容自动创建一条 `ai-suggestion` 类型批注（author: `agent:ask-system`，`sectionId = currentSection.sectionKey`）
    - 新批注通过 `annotationStore.createAnnotation()` 添加，自动出现在面板中
  - [ ] 6.5 Alpha 阶段边界：
    - 不依赖产品能力基线和资产库（Epic 5 未实现），仅基于当前方案上下文回答
    - 不实现多轮对话，每次独立提问
    - 不新增新的 `AgentType`、不修改 IPC channel 名称、不中途扩展 `TaskProgressEvent` schema
  - [ ] 6.6 单测覆盖：按钮渲染、禁用态、输入交互、IPC 调用 mock、progressive reveal、批注创建

### ProjectWorkspace 集成

- [ ] Task 7: 在 ProjectWorkspace 中传递 SOP 阶段和 section 信息（AC: #1, #7）
  - [ ] 7.1 修改 `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
  - [ ] 7.2 复用 `useSopNavigation` 的 `currentStageKey` 作为 `sopPhase` 来源，而不是再次读取 `projectStore.currentProject?.sopStage`
  - [ ] 7.3 在 `proposal-writing` 阶段挂接 `useCurrentSection()` 获取 `currentSection`
  - [ ] 7.4 将 `sopPhase` 和 `currentSection` 传递给 `AnnotationPanel`
  - [ ] 7.5 单测覆盖：props 传递正确性

### 测试

- [ ] Task 8: 单元测试、集成测试与 E2E（AC: #1-#7）
  - [ ] 8.1 `tests/unit/shared/chapter-locator-key.test.ts` — locator key 格式与冒号标题边界
  - [ ] 8.2 `tests/unit/renderer/modules/annotation/lib/annotationSorter.test.ts` — 排序算法
  - [ ] 8.3 `tests/unit/renderer/modules/annotation/components/AnnotationFilters.test.tsx` — 过滤器交互、5 色对 6 类型映射、Badge 计数
  - [ ] 8.4 `tests/unit/renderer/modules/annotation/components/AnnotationOverloadPanel.test.tsx` — 过载面板与 summary 模式
  - [ ] 8.5 `tests/unit/renderer/modules/annotation/components/AskSystemDialog.test.tsx` — 提问对话、禁用态、progressive reveal、批注创建
  - [ ] 8.6 `tests/unit/renderer/modules/annotation/hooks/useCurrentSection.test.ts` — locator 推导与 scroll/selection 联动
  - [ ] 8.7 `tests/unit/renderer/modules/editor/components/OutlineHeadingElement.test.tsx` — heading marker data attrs
  - [ ] 8.8 `tests/unit/main/services/agent-orchestrator/agents/generate-agent.test.ts` — `ask-system` 分支 prompt 组装
  - [ ] 8.9 `tests/unit/renderer/project/AnnotationPanel.test.tsx` — 扩展：排序/过滤/章节 scope/过载/ask-system 集成
  - [ ] 8.10 `tests/unit/renderer/project/ProjectWorkspace.test.tsx` — `currentStageKey` / `currentSection` props 传递
  - [ ] 8.11 `tests/e2e/stories/story-4-3-smart-annotation-panel.spec.ts` — 类型过滤→状态过滤→排序验证→过载触发→向系统提问→批注创建
  - [ ] 8.12 `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` 全部通过

## Dev Notes

### 本 Story 在 Epic 4 中的位置

```
Story 4.1 (done): [Enabler] Annotation Service 基础架构与批注数据模型
Story 4.2 (done): 批注卡片与五色分层着色
→ Story 4.3 (本 Story): 智能批注面板与上下文优先级排序
Story 4.4 (next): 待决策标记与跨角色批注通知
```

Story 4.1 建立了完整的批注 CRUD 基础设施（annotationStore、annotationService、SQLite + sidecar 持久化）。Story 4.2 建立了批注卡片的五色着色、操作按钮、键盘导航。本 Story 在此基础上将面板从“项目级平铺列表”升级为“章节 scope + 上下文排序”的智能面板，并交付 Ask System 的 Alpha 单轮问答切片。

### 数据流

```
用户在编辑器中编辑 H2/H3/H4 章节
  ↓
`useCurrentSection()` 基于 heading marker + scroll/selection 推导当前 `ChapterHeadingLocator`
  ↓
`createChapterLocatorKey(locator)` → `sectionKey = "${level}:${title}:${occurrenceIndex}"`
  ↓
ProjectWorkspace 传递 `sopPhase + currentSection` 给 AnnotationPanel
  ↓
AnnotationPanel 内部流程：
  1. useProjectAnnotations(projectId) → 获取全部批注
  2. `scopeItems = items.filter((item) => item.sectionId === currentSection.sectionKey)`
  3. filterAnnotations(scopeItems, typeFilter, statusFilter) → 应用 5 色分组 + 状态过滤
  4. sortAnnotations(filtered, { sopPhase }) → 阶段感知排序
  5. 过载检测：`statusFilter === 'pending' && pendingCount > 15` ? → 显示 OverloadPanel
  6. 渲染排序后的 AnnotationCard 列表
  ↓
用户点击"向系统提问"
  ↓
AskSystemDialog → 输入问题 → 提交
  ↓
`extractMarkdownSectionContent(documentStore.content, currentSection.locator)` → 当前章节正文
  ↓
IPC: `agent:execute` → `agentOrchestrator` → `generate` agent (`mode: 'ask-system'`)
  ↓
`task:progress` 事件 → 显示阶段性进度
  ↓
任务完成 → renderer 本地 progressive reveal 最终回答
  ↓
回答完成 → `annotationStore.createAnnotation({ type: 'ai-suggestion', author: 'agent:ask-system', sectionId: currentSection.sectionKey, ... })`
  ↓
新批注出现在当前章节 scope 的面板中
```

### 已有基础设施（禁止重复实现）

| 组件 | 位置 | 用途 |
|------|------|------|
| annotationStore | `src/renderer/src/stores/annotationStore.ts` | Zustand store：loadAnnotations、createAnnotation、updateAnnotation、deleteAnnotation、reset |
| useProjectAnnotations | `src/renderer/src/modules/annotation/hooks/useAnnotation.ts` | 获取项目级批注状态 |
| useAnnotationsForSection | `src/renderer/src/modules/annotation/hooks/useAnnotation.ts` | 按 section 过滤（shallow memo） |
| usePendingAnnotationCount | `src/renderer/src/modules/annotation/hooks/useAnnotation.ts` | pending 批注计数 |
| AnnotationCard | `src/renderer/src/modules/annotation/components/AnnotationCard.tsx` | 五色卡片组件（forwardRef），含操作按钮、处理态、focusable |
| AnnotationPanel | `src/renderer/src/modules/project/components/AnnotationPanel.tsx` | 面板容器：3 种布局模式（compact+collapsed/standard+collapsed/expanded），键盘导航，loading/empty/error/list 状态 |
| ANNOTATION_TYPE_COLORS | `src/renderer/src/modules/annotation/constants/annotation-colors.ts` | 五色 hex 常量 |
| ANNOTATION_TYPE_LABELS | `src/renderer/src/modules/annotation/constants/annotation-colors.ts` | 类型中文标签 |
| ANNOTATION_TYPE_ICONS | `src/renderer/src/modules/annotation/constants/annotation-colors.ts` | 类型图标组件映射 |
| ANNOTATION_TYPE_ACTIONS | `src/renderer/src/modules/annotation/constants/annotation-colors.ts` | 类型操作按钮配置 |
| ANNOTATION_STATUS_LABELS | `src/renderer/src/modules/annotation/constants/annotation-colors.ts` | 已处理状态标签 |
| ANNOTATION_STATUS_COLORS | `src/renderer/src/modules/annotation/constants/annotation-colors.ts` | 已处理状态颜色 |
| annotation-types.ts | `src/shared/annotation-types.ts` | AnnotationType、AnnotationStatus、AnnotationRecord、CRUD 输入输出类型 |
| annotationService | `src/main/services/annotation-service.ts` | 批注 CRUD + sidecar 同步 |
| annotation-handlers | `src/main/ipc/annotation-handlers.ts` | IPC 薄分发 |
| agentOrchestrator | `src/main/services/agent-orchestrator/orchestrator.ts` | agent 执行，本 Story 用于"向系统提问" |
| projectStore | `src/renderer/src/stores/projectStore.ts` | 项目状态（含 sopStage） |
| documentStore | `src/renderer/src/stores/documentStore.ts` | 方案文档状态 |
| extractMarkdownSectionContent | `src/shared/chapter-markdown.ts` | 从当前 Markdown 提取章节正文，供 Ask System 构造上下文 |
| useSopNavigation | `src/renderer/src/modules/project/hooks/useSopNavigation.ts` | `currentStageKey` 才是 workspace 当前生效的 SOP 阶段 |
| OutlineHeadingElement | `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx` | 已有 heading wrapper，可安全补充 data attributes 供 section 跟踪 |
| createSourceSectionKey | `src/renderer/src/modules/editor/hooks/useSourceAttribution.ts` | 现有章节 key 约定，可作为 `createChapterLocatorKey()` 的行为对照 |
| createIpcHandler | `src/main/ipc/create-handler.ts` | IPC handler 工厂函数 |
| BidWiseError | `src/main/utils/errors.ts` | 类型化错误基类 |
| formatRelativeTime | `src/renderer/src/shared/lib/format-time.ts` | 相对时间格式化 |

### 关键实现决策

**1. 章节 scope 先于排序；排序仍在渲染侧完成**

- `annotationStore` 保持 `createdAt DESC` 默认排序（数据层排序）
- `AnnotationPanel` 先基于 `currentSection.sectionKey` 收敛到当前章节子集，再应用类型/状态过滤与 `sortAnnotations`
- `sortAnnotations` 是纯函数，每次渲染时根据 `sopPhase` 重新计算
- 这样 `annotationStore` / `annotationService` / 其他消费者不受章节视图逻辑影响

**2. 5 个过滤按钮对应 5 个颜色分组，不是 6 个一对一类型**

- 紫色按钮同时控制 `human` + `cross-role`
- 过滤状态是 UI 视图偏好，不写入 store / metadata / projectStore
- 不持久化到 annotationStore 或 documentStore
- 切换项目或关闭面板时重置为默认值
- 默认值：全部类型选中，状态过滤为"待处理"

**3. Section 感知通过 heading locator key 推导，不用纯文本猜测**

- 章节定位必须使用 `ChapterHeadingLocator` + `createChapterLocatorKey(locator)`
- `sectionId === headingText` 不足以处理重复标题、不同级别标题、含冒号标题等边界
- 通过 `OutlineHeadingElement` 上新增的 `data-heading-level` / `data-heading-occurrence` / `data-heading-locator-key` 与 scroll/selection 事件推导当前章节
- 这是纯渲染侧操作，无需主进程参与，也无需新增 IPC

**4. "向系统提问"复用已有 agent-orchestrator，但需要独立 prompt 分支**

- 使用已有的 `agent:execute` IPC 通道
- 在 context 中添加 `mode: 'ask-system'` 标识
- 继续使用 `generate` agent type，但必须在 `generate-agent.ts` 中显式分支到问答 prompt，而不是复用章节生成 prompt 直接硬塞字段
- `task:progress` 事件当前只携带 `{ taskId, progress, message }`，不包含 token 增量文本
- Alpha 以“任务进度 + 完成后本地 progressive reveal”实现 Streaming 风格反馈；不在本 Story 扩展 provider streaming
- Alpha 阶段仅基于当前方案上下文，不依赖 Epic 5 的资产库/基线

**5. 过载阈值硬编码为 15，且仅在当前章节 pending 视图中触发**

- UX 规范明确指定 15 条阈值
- 不引入额外配置项
- 选项 B（重新生成）在 Alpha 阶段为占位，使用 `message.info` 提示
- 选项 C 使用局部 summary 模式，不改写全局过滤器状态

**6. 保持 Story 4.1/4.2 shell 合同不变**

- 面板宽度 320px（expanded）/ 40px（collapsed）/ 48px（compact）不变
- 键盘导航（Alt+↑/↓/Enter/Backspace/D）逻辑不变，在排序/过滤后的列表上操作
- 3 种布局模式（compact flyout / standard collapsed / expanded）不变
- 过滤器和过载面板嵌入到现有 header 与 list 之间

### 项目结构对齐

```
src/renderer/src/
  modules/annotation/
    lib/
      annotationSectionScope.ts     ← 新增：当前章节子集与 overload summary 辅助函数
      annotationSorter.ts          ← 新增：上下文排序算法
    components/
      AnnotationCard.tsx           ← 已有：五色卡片（不修改）
      AnnotationFilters.tsx        ← 新增：类型/状态过滤器
      AnnotationOverloadPanel.tsx  ← 新增：过载应急面板
      AskSystemDialog.tsx          ← 新增：向系统提问对话
    hooks/
      useAnnotation.ts             ← 已有：项目/section/pending hooks
      useCurrentSection.ts         ← 新增：编辑器 section 追踪
    constants/
      annotation-colors.ts         ← 已有：五色常量（不修改）

  modules/project/components/
    AnnotationPanel.tsx            ← 修改：集成排序/过滤/section/过载
    ProjectWorkspace.tsx           ← 修改：传递 sopPhase + currentSection

  modules/editor/components/
    OutlineHeadingElement.tsx      ← 修改：补充 heading locator data attrs

src/main/
  prompts/
    ask-system.prompt.ts           ← 新增：Ask System 问答 prompt
  services/agent-orchestrator/agents/
    generate-agent.ts              ← 修改：增加 `mode: 'ask-system'` 分支

src/shared/
  chapter-locator-key.ts          ← 新增：统一章节 locator key helper
```

### 前一 Story（4-2）关键学习

1. **AnnotationCard 使用 forwardRef**：面板通过 `cardRefs` Map 管理卡片引用，用于键盘导航滚动
2. **键盘导航与编辑器冲突避免**：Alt+key 仅在非 `contenteditable`/`input`/`textarea`/`[data-testid="plate-editor-content"]` 区域生效
3. **shouldShowLoadingState 逻辑**：`loaded` 为 true 时永不显示 loading，避免闪烁
4. **PendingPill 与 HeaderSpinner**：已有轻量状态指示器，本 Story 增强为多状态计数
5. **PanelBody 组件**：封装了 loading/empty/error/list 四态逻辑，本 Story 在 list 前插入过滤器
6. **处理态批注 opacity 0.6**：已在 AnnotationCard 中实现，过滤器的"已处理"标签需配合
7. **Store 使用 subscribeWithSelector**：annotationStore 已启用选择性订阅，性能友好

### 排序算法详细说明

```typescript
// 排序优先级（从高到低）：
// 1. status: pending > non-pending
// 2. type weight: 根据 sopPhase 查 PHASE_TYPE_WEIGHTS 映射
// 3. createdAt: DESC（最新的排最前）
//
// 注意：是否属于“当前章节”不在这个函数里判断，调用方需先做 scope 过滤

function sortAnnotations(
  items: AnnotationRecord[],
  context: { sopPhase: ActiveStageKey }
): AnnotationRecord[] {
  const weights = PHASE_TYPE_WEIGHTS[context.sopPhase] ?? DEFAULT_WEIGHTS
  return [...items].sort((a, b) => {
    // 1. pending 优先
    const pendingA = a.status === 'pending' ? 1 : 0
    const pendingB = b.status === 'pending' ? 1 : 0
    if (pendingA !== pendingB) return pendingB - pendingA
    // 2. 类型权重
    const wA = weights[a.type] ?? 0
    const wB = weights[b.type] ?? 0
    if (wA !== wB) return wB - wA
    // 3. 时间
    return b.createdAt.localeCompare(a.createdAt)
  })
}
```

### 禁止事项

- **禁止**修改 `annotationStore` 的默认排序逻辑（排序在视图层完成）
- **禁止**修改 `AnnotationCard` 组件（Story 4.2 成果，本 Story 只消费）
- **禁止**修改 `annotation-colors.ts` 常量（Story 4.2 成果）
- **禁止**把当前章节锚点继续定义为纯 heading text 或 `section-3.2` 之类的临时字符串
- **禁止**在 IPC handler 中放置业务逻辑（委托给 service）
- **禁止**在 renderer 直接读写文件系统（统一经 main-process IPC）
- **禁止**使用 `../../` 以上的相对导入路径（使用 `@main/`、`@renderer/`、`@shared/`、`@modules/` 别名）
- **禁止**破坏 Story 4.1/4.2 建立的面板 shell 合同（宽度、布局模式、键盘导航）
- **禁止**在 Action 内同步调用其他 store 的 Action（使用 subscribeWithSelector + 组件层 hooks）
- **禁止**throw 裸字符串（使用 `BidWiseError`）
- **禁止**手动 snake_case ↔ camelCase 转换（Kysely CamelCasePlugin 处理）
- **禁止**将过滤器状态持久化到 store 或 metadata（UI 本地状态）
- **禁止**新建独立的"问答 Agent"（复用 generate agent + askSystem mode 标识）

### Alpha 阶段边界说明

- "向系统提问"仅基于当前方案上下文回答，不依赖产品能力基线（Epic 5）和资产库（Epic 5）
- 过载选项 B（补充上下文后重新生成）为 Alpha 占位，显示"功能将在后续版本实现"
- 交叉火力决策卡片（UX-DR11）不在本 Story 范围，属于 Story 4.4 或 Epic 7
- 多轮对话不在本 Story 范围，每次"向系统提问"为独立问答
- 跨角色通知（FR30）不在本 Story 范围，属于 Story 4.4
- Provider token streaming / `TaskProgressEvent` schema 扩展不在本 Story 范围，Alpha 仅交付 Streaming 风格展示

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.3] — 智能批注面板与上下文优先级排序原始需求
- [Source: _bmad-output/planning-artifacts/prd.md#FR27] — 批注式双向人机协作
- [Source: _bmad-output/planning-artifacts/prd.md#FR28] — 批注按来源分层着色
- [Source: _bmad-output/planning-artifacts/architecture.md#D4] — Annotation Service: Zustand annotationStore + 订阅模式
- [Source: _bmad-output/planning-artifacts/architecture.md#Annotation Service] — 独立跨切面架构组件，6 种来源语义
- [Source: _bmad-output/planning-artifacts/architecture.md#Store 跨读] — subscribeWithSelector + 组件层 hooks
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR10] — 智能批注面板组件规范
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR12] — 批注内微对话组件
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR9] — 批注卡片五色变体
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR27] — 快捷键体系
- [Source: _bmad-output/implementation-artifacts/4-1-enabler-annotation-service.md] — Annotation Service 基础架构
- [Source: _bmad-output/implementation-artifacts/4-2-annotation-card-color-coding.md] — 批注卡片五色着色
- [Source: _bmad-output/implementation-artifacts/4-3-smart-annotation-panel-ux/prototype.manifest.yaml] — UX lookup order 与原型工件索引
- [Source: _bmad-output/implementation-artifacts/4-3-smart-annotation-panel-ux/ux-spec.md] — Story 4.3 story-level UX 规格
- [Source: _bmad-output/implementation-artifacts/4-3-smart-annotation-panel-ux/exports/5EgWg.png] — 默认态视觉对齐
- [Source: _bmad-output/implementation-artifacts/4-3-smart-annotation-panel-ux/exports/dtCEl.png] — 过载应急态视觉对齐
- [Source: _bmad-output/implementation-artifacts/4-3-smart-annotation-panel-ux/exports/wcfhw.png] — 零批注态与问答入口视觉对齐
- [Source: _bmad-output/implementation-artifacts/4-3-smart-annotation-panel-ux/exports/Sy9e0.png] — Ask System Streaming 风格回答视觉对齐
- [Source: _bmad-output/implementation-artifacts/4-3-smart-annotation-panel-ux/prototype.pen] — 结构与交互细节

### Change Log

- 2026-04-07: `validate-create-story` 修订
  - 补回模板 validation note，并新增 Change Log 以便追溯
  - 修正章节联动契约：从错误的“heading text/section-3.2”改为 `ChapterHeadingLocator` + 统一 locator key
  - 修正面板语义：当前章节默认 scope 过滤，而不是仅做跨章节排序置顶
  - 修正 5 色过滤器与 6 类型的映射：紫色按钮同时控制 `human` + `cross-role`
  - 修正 Ask System 边界：复用 `generate` agent，但新增问答 prompt 分支；Alpha 使用任务进度 + 完成后本地 progressive reveal，而非 provider token stream
  - 修正 `ProjectWorkspace` 传参说明：使用 `useSopNavigation().currentStageKey`，不重新读取过期 `projectStore.currentProject?.sopStage`
  - 修正已有基础设施路径：`formatRelativeTime` 位于 `src/renderer/src/shared/lib/format-time.ts`
  - 修正测试矩阵：补入 `generate-agent` ask-system 分支、`OutlineHeadingElement` marker attrs、`ProjectWorkspace` 传参与正确的 `tests/unit/renderer/project/AnnotationPanel.test.tsx` 路径

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
