# Story 5.2: 资产上下文智能推荐与一键入库

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 系统基于我当前编辑的章节自动推荐相关资产，优质片段一键入库,
So that 好素材不用我主动找就能送到面前，我的好方案也能沉淀为组织资产。

## Acceptance Criteria

1. **AC1 — 上下文驱动的资产推荐**
   Given 用户正在编辑某章节且资产库已有内容
   When 推荐引擎分析当前章节标题和正文上下文
   Then 侧边栏推荐区显示绿色资产推荐卡片，每张卡片展示标题、摘要（截断 2 行）、匹配度百分比、最多 3 个可见标签（超出显示 `+N`），并提供 `[插入] [忽略] [查看详情]` 三个操作按钮（FR32）

2. **AC2 — 选中片段一键入库**
   Given 用户在编辑器中选中一段非空文本
   When 点击工具栏中的"一键入库"按钮
   Then 弹出入库对话框，预填选中内容为正文、当前 H1-H4 章节标题为默认标题（无章节标题时回退为选中文本前 50 字），用户可编辑标题并标注标签，确认后保存到资产库并显示成功 Toast（FR33）

3. **AC3 — 插入推荐资产到编辑器**
   Given 推荐列表中有匹配资产
   When 用户点击推荐卡片的 `[插入]` 按钮或详情 Drawer 中的 `插入到编辑器`
   Then 系统先通过现有 `asset:get` 读取完整资产正文，并按以下优先级插入纯文本段落：当前 selection → `lastSelectionRef` → 当前章节末尾 → 文档末尾；插入成功后推荐卡片状态变为 `已插入`

4. **AC4 — 忽略不相关推荐**
   Given 推荐列表中有不相关资产
   When 用户点击 [忽略]
   Then 该推荐从当前列表中移除，本次编辑会话内不再对当前 `sectionKey` 推荐该资产

5. **AC5 — 章节切换时推荐自动刷新**
   Given 用户从章节 A 切换到章节 B
   When 编辑器活动章节变化
   Then 推荐列表清空并基于章节 B 的上下文重新生成推荐，已忽略 / 已插入记录不跨章节继承，且章节 A 的进行中推荐响应不会覆盖章节 B 的结果

6. **AC6 — 推荐防抖与性能**
   Given 用户持续编辑章节内容
   When 编辑停顿超过 2 秒
   Then 推荐引擎触发一次上下文分析并更新推荐列表；编辑期间不触发推荐刷新，推荐请求不阻塞编辑器交互；若章节正文去 Markdown 后少于 8 个有效字符或提取不到关键词，则直接显示空状态而不发起推荐请求

## Tasks / Subtasks

### Task 1: Asset 创建能力扩展 (AC: #2)

- [ ] 1.1 在 `src/shared/asset-types.ts` 新增 `CreateAssetInput` 类型
  - `{ title: string; content: string; assetType: AssetType; summary?: string; sourceProject?: string | null; sourceSection?: string | null; tagNames: string[] }`
- [ ] 1.2 在 `src/main/db/repositories/asset-repo.ts` 新增 `create()` 方法
  - 签名: `create(input: { title: string; content: string; assetType: AssetType; summary?: string; sourceProject?: string | null; sourceSection?: string | null }): Promise<Asset>`
  - 自动生成 `id`（复用主进程 repository 现有 `uuidv4()` 模式）、`createdAt`、`updatedAt`（ISO-8601）
  - `summary` 为空时自动截取 `content` 前 200 字符
  - 新记录 `projectId` 固定写入 `null`，继续沿用 Story 5.1 已落地的主应用 SQLite（`userData/data/db/bidwise.sqlite`），**不要**额外创建 `company-data/*.sqlite`
  - FTS 索引由 migration 012 的触发器自动同步，无需手动维护
- [ ] 1.3 在 `src/main/services/asset-service.ts` 新增 `create()` 方法
  - 签名: `create(input: CreateAssetInput): Promise<AssetDetail>`
  - 流程：调用 `assetRepo.create()` → `tagRepo.findOrCreateMany(input.tagNames)` → `tagRepo.replaceAssetTags()` → 返回含 tags 的 `AssetDetail`
  - 标签名复用现有归一化逻辑（trim、折叠连续空白、去重、英文 lower-case）
  - 使用 `createLogger('asset-service')` 记录创建操作
- [ ] 1.4 在 `src/shared/ipc-types.ts` 新增 `asset:create` 频道
  - `IPC_CHANNELS` 新增 `ASSET_CREATE: 'asset:create'`
  - `IpcChannelMap` 新增 `'asset:create': { input: CreateAssetInput; output: AssetDetail }`
- [ ] 1.5 在 `src/main/ipc/asset-handlers.ts` 注册 `asset:create` handler
  - 使用 `createIpcHandler()` 模式，handler 仅做参数透传
- [ ] 1.6 确认 `src/main/ipc/index.ts` **无需**新增新的注册调用
  - 继续复用现有 `registerAssetHandlers()` 调用位
  - 资产频道的 compile-time exhaustive coverage 由 `asset-handlers.ts` 内 `AssetChannel` / `assetHandlerMap` 约束完成
- [ ] 1.7 更新 `src/preload/index.ts` 暴露 `window.api.assetCreate()`
- [ ] 1.8 更新 `src/preload/index.d.ts` 类型声明
- [ ] 1.9 在 `src/renderer/src/stores/assetStore.ts` 新增 `createAsset(input: CreateAssetInput): Promise<void>` action
  - 调用 `window.api.assetCreate()` → 成功后按当前 store 内的 `rawQuery + assetTypes` 重新执行 `assetList/assetSearch`
  - 复用 `assetStore` 现有错误清理与刷新模式，不新增路由感知分支

### Task 2: 推荐引擎服务层 (AC: #1, #5, #6)

- [ ] 2.1 创建 `src/shared/recommendation-types.ts`
  - `RecommendationContext = { sectionKey: string; sectionTitle: string; sectionContent: string; projectId: string }`
  - `AssetRecommendation = { assetId: string; title: string; summary: string; assetType: AssetType; tags: Tag[]; matchScore: number; sourceProject: string | null }`
  - `RecommendationResult = { sectionKey: string; recommendations: AssetRecommendation[] }`
  - **不要**把完整 `content` 塞进推荐列表结果；详情和插入统一复用既有 `asset:get`
- [ ] 2.2 创建 `src/main/services/recommendation-service.ts`
  - Alpha 阶段采用**纯本地 FTS 匹配**，不走 AI agent / task-queue
  - `recommend(context: RecommendationContext): Promise<RecommendationResult>`
  - 推荐流程：
    1. 对 `sectionTitle + sectionContent` 先做 Markdown 去噪与空白归一化，再取前 500 字符参与关键词提取
    2. 若归一化后的上下文少于 8 个有效字符，或 `extractKeyTerms()` 返回空串，则直接返回空推荐
    3. 调用 `assetRepo.search({ keyword, tagNames: [], assetTypes: [] })` 执行本地 FTS / fallback 检索
    4. 通过 `tagRepo.findByAssetIds()` 批量补齐标签；`matchScore` 复用 `asset-service` 的现有归一化规则（必要时抽成共享 helper，**不要**在两处实现两套百分比算法）
    5. 排除与当前章节内容明显重叠的候选：若归一化后的 `asset.content` 完整包含于当前章节文本中，或其前 80 个非空白字符已出现在当前章节文本中，则视为已存在内容并过滤
    6. 按 `matchScore`/repo 排序顺序取 Top 8，去重后返回
  - 内部方法 `extractKeyTerms(title: string, content: string): string`
    - 合并标题和内容
    - 以中文标点（。！？；，、）和英文标点分句
    - 按空格和标点分词，过滤长度 ≤1 的 token 和常见停用词（的/了/是/在/和/有/为/等/个/一/不/对/与/中/到）
    - 按长度降序取前 5 个不重复词组，用空格拼接为搜索串
  - 使用 `createLogger('recommendation-service')`
- [ ] 2.3 在 `src/shared/ipc-types.ts` 新增 `asset:recommend` 频道
  - `IPC_CHANNELS` 新增 `ASSET_RECOMMEND: 'asset:recommend'`
  - `IpcChannelMap` 新增 `'asset:recommend': { input: RecommendationContext; output: RecommendationResult }`
- [ ] 2.4 在 `src/main/ipc/asset-handlers.ts` 注册 `asset:recommend` handler
- [ ] 2.5 确认 `src/main/ipc/index.ts` 现有 `registerAssetHandlers()` 注册位保持不变
- [ ] 2.6 更新 `src/preload/index.ts` 暴露 `window.api.assetRecommend()`
- [ ] 2.7 更新 `src/preload/index.d.ts`

### Task 3: 推荐状态管理 (AC: #1, #3, #4, #5, #6)

- [ ] 3.1 创建 `src/renderer/src/stores/recommendationStore.ts`
  - State：
    - `currentSectionKey: string | null`
    - `recommendations: AssetRecommendation[]`
    - `ignoredAssetIds: Set<string>` — 当前章节已忽略的资产 ID
    - `acceptedAssetIds: Set<string>` — 当前章节已插入的资产 ID
    - `loading: boolean`
    - `error: string | null`
    - 内部请求序号 / nonce（用于丢弃过期响应，可不对外导出）
  - Actions：
    - `fetchRecommendations(context: RecommendationContext): Promise<void>` — 调用 `window.api.assetRecommend()`，仅当响应对应的 `sectionKey + requestNonce` 仍为当前值时才提交到 store；提交前必须过滤当前 `ignoredAssetIds`，并对命中的 `acceptedAssetIds` 保持“已插入”态，避免同章节刷新把用户刚忽略/已采纳的卡片带回来
    - `ignoreRecommendation(assetId: string): void` — 加入 `ignoredAssetIds`，从 `recommendations` 中移除
    - `acceptRecommendation(assetId: string): void` — 加入 `acceptedAssetIds`（卡片变为"已插入"态，保留在列表中）
    - `clearForSection(sectionKey: string): void` — 设置 `currentSectionKey`，清空 `ignoredAssetIds`/`acceptedAssetIds`/`recommendations`
    - `clearError(): void`
  - 约束：
    - `loading: boolean` 命名
    - 推荐数据为内存态，不持久化
- [ ] 3.2 在 `src/renderer/src/stores/index.ts` 导出 `useRecommendationStore`
- [ ] 3.3 创建 `src/renderer/src/modules/asset/hooks/useAssetRecommendation.ts`
  - **不要**重新发明 DOM 章节探测逻辑；扩展现有 `useCurrentSection` 为可配置 heading range，并同步更新 `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx` 让 H1 也能输出稳定的 locator key / data attrs
  - 保持 Story 4.3 的默认 H2-H4 批注行为不变；仅推荐 / 一键入库场景显式以 `minLevel: 1, maxLevel: 4` 启用 H1-H4，确保 H1 场景（如“1. 项目概述”）也能触发推荐
  - 用 `useDocumentStore` 当前文档内容 + `extractMarkdownSectionContent()` 生成当前章节正文
  - 章节变化时调用 `clearForSection()` + `fetchRecommendations()`
  - 内容编辑防抖：使用 `setTimeout`/`clearTimeout` 实现 2000ms debounce，编辑停顿后触发推荐刷新
  - 返回 `{ currentSection, recommendations, loading, ignore, accept, acceptedAssetIds, clearError }`
  - unmount 时清理定时器

### Task 4: 推荐面板与卡片组件 (AC: #1, #3, #4)

- [ ] 4.1 创建 `src/renderer/src/modules/asset/components/RecommendationPanel.tsx`
  - 位于项目工作空间右侧 320px rail 内，作为现有 `AnnotationPanel` shell 里的独立 section
  - 保持 `annotation-panel` 外层宽度 / 折叠 / flyout 行为不变，**不要**新增第二个 right aside，也不要引入不存在的 tab 结构
  - 标题：`资产推荐` + 当前推荐数量 badge
  - 推荐为空时显示居中文案：`当前章节暂无推荐资产`
  - 加载中显示轻量 Spin（不阻塞编辑器）
  - 可折叠/展开
- [ ] 4.2 创建 `src/renderer/src/modules/asset/components/RecommendationCard.tsx`
  - 绿色视觉风格：边框 `#52C41A`，背景 `#f6ffed`
  - 卡片内容：标题（单行截断）、摘要（2 行截断）、匹配度百分比、标签列表（Ant Design `Tag`，最多展示 3 个，其余汇总为 `+N`）
  - 操作按钮行：`插入`（primary）、`忽略`（text）、`查看详情`（text）
  - 已采纳状态：卡片变灰 + 左上角"已插入"标记，操作按钮隐藏
  - `查看详情` 点击打开 `RecommendationDetailDrawer`
- [ ] 4.3 创建 `src/renderer/src/modules/asset/components/RecommendationDetailDrawer.tsx`
  - Ant Design `Drawer` 从右侧滑出
  - 宽度 `480px`
  - 展示：标题、资产类型标签、来源项目、可选来源章节、匹配度、全部标签、完整正文内容
  - 底部操作：`插入到编辑器`（primary）、`关闭`
- [ ] 4.4 在 `RecommendationPanel` / `RecommendationDetailDrawer` 中复用现有 `window.api.assetGet({ id })`
  - `查看详情` 与 `插入` 均通过既有 `asset:get` 获取完整 `AssetDetail`
  - **不要**新增 `asset:recommend-detail` 频道，也**不要**复用 `assetStore.selectedAsset` 这一面向 `/asset` 页的全局详情状态

### Task 5: 一键入库交互 (AC: #2)

- [ ] 5.1 创建 `src/renderer/src/modules/asset/components/AssetImportDialog.tsx`
  - Ant Design `Modal` 对话框，标题：`一键入库`，宽度 `520px`，`maskClosable: true`
  - 表单字段：
    - 标题（`Input`，必填，预填章节标题或选中文本前 50 字去换行）
    - 内容预览（`Input.TextArea`，必填，预填选中文本，可编辑）
    - 资产类型（`Select`，默认 `text`，选项：文字片段/架构图/表格/案例）
    - 标签（复用 `TagEditor` 组件，初始为空）
  - 隐式字段：`sourceProject`（自动填充 `projectStore.currentProject.name`，缺失时写 `null`）、`sourceSection`（自动填充当前章节标题，缺失时写 `null`）
  - 操作：`入库`（primary，校验通过后提交）、`取消`
  - 入库成功后 Ant Design `message.success('资产已入库')` + 关闭对话框
  - `TagEditor` 仍沿用 `Tag[] + onAdd/onRemove` 接口；对话框内部维护本地 draft tags 适配层，提交时再转换为 `tagNames: string[]`
- [ ] 5.2 创建 `src/renderer/src/modules/asset/hooks/useAssetImport.ts`
  - 管理对话框 open/close 状态
  - `openImport(context: { selectedText: string; sectionTitle: string; sourceProject: string | null })` — 打开对话框并预填
  - `submitImport(input: CreateAssetInput): Promise<void>` — 调用 `assetStore.createAsset()` + 关闭
  - 返回 `{ isOpen, importContext, openImport, closeImport, submitImport }`
- [ ] 5.3 在编辑器工具栏添加"一键入库"按钮
  - 修改文件：`src/renderer/src/modules/editor/components/EditorToolbar.tsx`
  - 按钮仅在选区锚点/焦点位于 `[data-testid="plate-editor-content"]` 内且 `window.getSelection()?.toString().trim().length > 0` 时 enabled；不要把侧边栏/toolbar 文本选区误判为可入库内容
  - 保留现有 toolbar `onMouseDown={preventDefault}` 模式，避免点击按钮时丢失选区
  - 点击时获取编辑器选中文本和当前 H1-H4 章节标题，调用 `openImport()`
  - 按钮图标：使用 Ant Design `ImportOutlined` 或 `SaveOutlined`
  - Tooltip：`将选中片段保存到资产库`
- [ ] 5.4 更新 `src/renderer/src/modules/editor/components/EditorView.tsx`
  - 接收来自 `ProjectWorkspace` 的 `currentSection`（H1-H4）信息
  - 管理 `AssetImportDialog` 的打开 / 关闭与提交
  - 将 toolbar 的“一键入库”点击桥接到 `useAssetImport`

### Task 6: 编辑器资产插入集成 (AC: #3)

- [ ] 6.1 在 PlateEditor 中新增资产插入回调
  - 遵循现有 `onInsertDrawioReady` / `onInsertMermaidReady` 回调暴露模式
  - 新增 `InsertAssetFn = (content: string, options?: { targetSection?: ChapterHeadingLocator | null }) => boolean`
  - 新增 `onInsertAssetReady?: (insertFn: InsertAssetFn | null) => void` prop
  - 插入逻辑：
    1. 获取当前 selection（优先）或 `lastSelectionRef`（回退）
    2. 将资产 content 字符串拆分为段落（按 `\n\n` 分割）
    3. 构造 `paragraph` 类型的 Slate 节点数组
    4. 若存在可用 selection，则调用 `editor.tf.insertNodes(nodes, { at })`
    5. 若 selection 均为空但 `targetSection` 可解析，则把内容追加到该章节末尾
    6. 仅当章节定位也失败时才回退到文档末尾
  - 资产以纯文本段落插入，不需要 Void Element 包装（区别于 draw.io iframe）
- [ ] 6.2 更新 `src/renderer/src/modules/editor/components/EditorView.tsx`
  - 新增 `onInsertAssetReady?: (fn: InsertAssetFn | null) => void` prop
  - 将 `PlateEditor` 提供的 insertAsset 注册结果继续向上传递，模式与现有 draw.io / mermaid 保持一致
  - **不要**破坏现有 `onInsertDrawioReady` / `onInsertMermaidReady` 行为
- [ ] 6.3 连接推荐卡片 `[插入]` 与编辑器
  - `ProjectWorkspace` 持有 `insertAssetRef`
  - `RecommendationCard` / `RecommendationDetailDrawer` 先调用 `window.api.assetGet({ id: assetId })` 取回完整 `content`
  - 再调用 `insertAssetRef.current?.(detail.content, { targetSection: currentSection?.locator ?? null })`
  - 仅在插入成功后调用 `recommendationStore.acceptRecommendation(assetId)`

### Task 7: 侧边栏集成 (AC: #1)

- [ ] 7.1 将 `RecommendationPanel` 集成到项目工作空间侧边栏
  - 推荐面板仅在编辑器 SOP 阶段（方案编写阶段）显示
  - 修改文件：`src/renderer/src/modules/project/components/ProjectWorkspace.tsx`、`src/renderer/src/modules/project/components/AnnotationPanel.tsx`
  - 位于现有 `AnnotationPanel` shell 内部，作为独立可折叠 section；在右侧 rail 完全折叠时不渲染正文，在 compact flyout / 展开态中可见
  - expanded / flyout 两种正文态都采用与原型一致的纵向 section stack：上方是默认折叠的 `批注` section，下方是默认展开的 `资产推荐` section；展开 `批注` 时继续复用现有 AnnotationPanel 的 filters / list / thread 逻辑，**不要**把旧批注能力裁掉
  - **不要**假设当前存在 tab 设计；当前仓库右侧栏只有 `AnnotationPanel`
- [ ] 7.2 章节感知连接
  - `ProjectWorkspace` 继续负责 `currentSection` 的顶层派发：一份传给 `AnnotationPanel`，一份传给 `EditorView`
  - 通过 `useAssetRecommendation` hook 连接编辑器当前活动章节，章节变化和内容编辑停顿自动触发推荐刷新

### Task 8: 测试矩阵 (AC: #1, #2, #3, #4, #5, #6)

- [ ] 8.1 更新 `tests/unit/main/db/repositories/asset-repo.test.ts`
  - 新增 `create()` 测试：默认 summary 截取、FTS 触发器同步验证（创建后可搜到）、必填字段校验
- [ ] 8.2 更新 `tests/unit/main/services/asset-service.test.ts`
  - 新增 `create()` 测试：标签创建与映射、sourceProject/sourceSection 填充、日志记录
- [ ] 8.3 新建 `tests/unit/main/services/recommendation-service.test.ts`
  - 覆盖：
    - `extractKeyTerms()` 从中文标题和内容提取关键词
    - `recommend()` 返回排序后的推荐列表
    - 空内容 / 短标题返回空推荐
    - 结果上限 8 条
    - 停用词过滤
    - 与当前章节内容重叠的候选被过滤
    - `sourceProject` / tags / matchScore 正确映射
- [ ] 8.4 更新 `tests/unit/main/ipc/asset-handlers.test.ts`
  - 新增 `asset:create` 和 `asset:recommend` 频道注册、透传与错误包装测试
- [ ] 8.5 更新 `tests/unit/preload/security.test.ts`
  - 新增 `assetCreate` 和 `assetRecommend` 到 preload 白名单断言
- [ ] 8.6 新建 `tests/unit/renderer/stores/recommendationStore.test.ts`
  - 覆盖：获取推荐、忽略（从列表移除）、采纳（保留但标记）、同章节刷新时已忽略项不回流、同章节刷新时已插入项保持 accepted、章节切换清空、loading/error 状态、过期响应丢弃
- [ ] 8.7 新建 `tests/unit/renderer/modules/asset/components/RecommendationCard.test.tsx`
  - 覆盖：绿色样式渲染、三个操作按钮点击回调、标签溢出 `+N`、已采纳态视觉变化
- [ ] 8.8 新建 `tests/unit/renderer/modules/asset/components/RecommendationPanel.test.tsx`
  - 覆盖：asset:get 详情加载、Drawer 打开/关闭、插入成功后标记已插入、忽略后列表移除
- [ ] 8.9 新建 `tests/unit/renderer/modules/asset/components/AssetImportDialog.test.tsx`
  - 覆盖：预填内容正确、标签编辑交互、提交成功后关闭并显示 Toast、取消关闭、必填校验
- [ ] 8.10 更新 `tests/unit/renderer/modules/editor/components/EditorToolbar.test.tsx`
  - 覆盖："一键入库"按钮渲染、仅编辑器内选区可 enabled、非编辑器选区保持 disabled、点击回调
- [ ] 8.11 更新 `tests/unit/renderer/modules/editor/components/EditorView.test.tsx`
  - 覆盖：`currentSection` 传入后可打开导入对话框、`onInsertAssetReady` 向上传递
- [ ] 8.12 更新 `tests/unit/renderer/modules/editor/components/PlateEditor.test.tsx`
  - 覆盖：`onInsertAssetReady` 注册、selection / lastSelection / section fallback / 文档末尾 fallback
- [ ] 8.13 更新 `tests/unit/renderer/project/AnnotationPanel.test.tsx` 与 `tests/unit/renderer/project/ProjectWorkspace.test.tsx`
  - 覆盖：RecommendationPanel 在 proposal-writing 阶段渲染、右侧 rail 在 expanded / flyout 下呈现“批注折叠 section + 推荐展开 section”结构、`currentSection` 同时传给 `AnnotationPanel` 与 `EditorView`
- [ ] 8.14 新建 `tests/e2e/stories/story-5-2-asset-recommendation-import.spec.ts`
  - 种入资产数据到测试 SQLite
  - 覆盖：
    - 打开编辑器后推荐面板显示匹配资产
    - 点击 [插入] 将资产内容添加到编辑器
    - 点击 [忽略] 从列表移除
    - 选中编辑器文本后工具栏"一键入库"可用
    - 完成入库后资产库中可搜索到新资产

## Dev Notes

### 架构要点

- **Alpha 推荐引擎策略**：纯本地 FTS 匹配，**不走 AI agent / task-queue**。Beta 引入 Graphiti 语义检索后再升级推荐质量，因此本故事的推荐请求不属于 task-queue 白名单操作。
- **数据真实落点**：推荐与一键入库继续复用 Story 5.1 已上线的主应用 SQLite（`app.getPath('userData')/data/db/bidwise.sqlite`）。虽然 architecture.md 的目标态提到 `company-data/` 与 Annotation Service 统一语义，但 **Story 5.2 当前实现以已落地代码为准**。
- **推荐数据非持久化**：推荐结果仅存储在 `recommendationStore`（内存态），不写入 sidecar JSON、不写入 `annotationStore`、不创建 `annotation:create/update` 记录。这与持久批注是两套独立状态。
- **同章节会话保持规则**：`ignoredAssetIds` / `acceptedAssetIds` 只在当前 `sectionKey` 的内存会话内生效；同章节重新推荐时必须继续过滤已忽略项并保留已采纳态，切换章节后再整体清空。
- **详情 / 插入复用既有资产详情链路**：推荐列表只承载摘要信息；`查看详情` 与 `插入` 统一复用现有 `asset:get`，不要为推荐再发明新的 detail IPC。
- **H1-H4 章节感知**：Story 4.3 的 `useCurrentSection` 默认只服务 H2-H4 批注 scope；本故事需要把它扩展为可配置范围，并同步更新 `OutlineHeadingElement` 的 locator/data-attr 输出，在推荐 / 入库场景启用 H1-H4，避免“1. 项目概述”这类顶级章节失效。

### 与 Story 5.1 的关系

Story 5.1 已建立完整的资产基础设施，本故事在此基础上扩展：

| 能力 | 5.1 已完成 | 5.2 新增 |
|---|---|---|
| 数据模型 | `assets` / `tags` / `asset_tags` 三表 + FTS5 | 无变更 |
| Repository | `asset-repo`（search/list/findById）、`tag-repo` | `asset-repo.create()` |
| Service | `asset-service`（search/list/getById/updateTags） | `asset-service.create()`、`recommendation-service`（新文件） |
| IPC | `asset:search` / `asset:list` / `asset:get` / `asset:update-tags` | `asset:create`、`asset:recommend` |
| Store | `assetStore`（搜索/筛选/详情/标签修改） | `assetStore.createAsset()`、`recommendationStore`（新文件） |
| UI | AssetSearchPage / AssetResultCard / TagEditor | RecommendationPanel / RecommendationCard / AssetImportDialog |

### 前一 Story（5.1）关键学习

1. **资产数据已经落在主应用 SQLite**：Story 5.1 的 E2E 直接向 `userData/data/db/bidwise.sqlite` 种数，本故事必须沿用，不再引入第二套 DB
2. **`assetStore` 最近刚修过错误刷新链路**：最新提交 `d220ede` / `9500a7b` 已收敛 `updateAssetTags()` 的 stale error 与 toast 行为；`createAsset()` 必须沿用同一错误处理风格
3. **标签补全与 matchScore 已有稳定模式**：`tagRepo.findByAssetIds()`、`assetService` 百分比归一化、`TagEditor` 交互都已存在，本故事应复用而不是重写
4. **`/asset` 页状态不要被项目工作区污染**：推荐详情查看可以复用 `asset:get` 返回结构，但不要劫持 `assetStore.selectedAsset` 来驱动项目工作区 Drawer

### 关键词提取算法（Alpha）

```
输入：`sectionTitle + stripMarkdown(sectionContent)`（前 500 字符）
1. 合并标题和正文纯文本为一个字符串
2. 以中文标点（。！？；，、：）和英文标点（.!?;,:）分割为句子
3. 每个句子按空格和标点进一步分词
4. 过滤：长度 ≤1 的 token、纯数字、常见停用词（的/了/是/在/和/有/为/等/个/一/不/对/与/中/到）
5. 按长度降序排列，取前 5 个不重复的词组
6. 用空格拼接为搜索查询串，传入 assetRepo.search()
```

不需要外部分词库。FTS5 trigram tokenizer 会处理中文子串匹配。关键词提取只是粗粒度缩窄搜索范围。

### 编辑器插入链路

实现时遵循现有 draw.io / mermaid 的 callback 暴露模式，但推荐插入要补齐 **跨组件桥接**：

1. `PlateEditor.tsx` 暴露 `onInsertAssetReady`
2. `EditorView.tsx` 把 insert 回调继续向上传给 `ProjectWorkspace`
3. `ProjectWorkspace.tsx` 同时掌握：
   - 中间编辑器的 insert 回调
   - 右侧 `RecommendationPanel` 的插入按钮事件
4. `RecommendationPanel` / `RecommendationDetailDrawer` 先通过 `asset:get` 拿到正文，再调用 workspace 持有的 insert 回调

插入优先级必须是：

1. 当前 `editor.selection`
2. `lastSelectionRef`
3. 当前章节末尾（通过 `targetSection`/章节 locator 解析）
4. 文档末尾

资产内容以纯文本段落插入，不需要 Void Element 包装（区别于 draw.io iframe）。

### 一键入库对话框规格

| 字段 | 组件 | 默认值 | 必填 |
|---|---|---|---|
| 标题 | `Input` | 章节标题或选中文本前 50 字（去换行） | 是 |
| 内容 | `Input.TextArea`（6 行） | 选中文本 | 是 |
| 资产类型 | `Select` | `text` | 是 |
| 标签 | `TagEditor`（复用 5.1 组件） | 空 | 否 |
| 来源项目 | 隐式 | `projectStore.currentProject.name` | — |
| 来源章节 | 隐式 | 当前 H1-H4 章节标题 | — |

### 推荐面板 UX 规格

| 属性 | 值 |
|---|---|
| 位置 | 项目工作空间右侧侧边栏，批注面板下方独立 section |
| 卡片颜色 | 边框 `#52C41A`，背景 `#f6ffed`（资产推荐绿） |
| 最大推荐数 | 8 条 |
| 标签展示 | 最多 3 个，超出显示 `+N` |
| 空状态文案 | `当前章节暂无推荐资产` |
| 加载状态 | 轻量 Spin，不阻塞编辑器 |
| 防抖间隔 | 2000ms（编辑停顿后触发） |
| 章节切换 | 立即清空旧推荐 → 触发新推荐 |
| 折叠状态 | 可折叠/展开，默认展开 |

### 现有代码模式参考

| 层 | 参考文件 | 关键模式 |
|---|---|---|
| Repository create | `src/main/db/repositories/annotation-repo.ts` | `getDb()` + Kysely 插入 + `BidWiseError` |
| Service create | `src/main/services/asset-service.ts` | `createLogger()` + repo 组合 + 标签归一化 |
| IPC handler | `src/main/ipc/asset-handlers.ts` | `createIpcHandler()` + channel map |
| 章节正文提取 | `src/shared/chapter-markdown.ts` | `extractMarkdownSectionContent()` / Markdown 去噪 |
| 当前章节感知 | `src/renderer/src/modules/annotation/hooks/useCurrentSection.ts` | 可扩展的 heading range 检测 |
| Heading marker 输出 | `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx` | H1-H4 locator key / `data-heading-*` 标记 |
| Preload | `src/preload/index.ts` | `typedInvoke()` + 派生 camelCase 方法名 |
| Store | `src/renderer/src/stores/assetStore.ts` | Zustand + `loading: boolean` |
| 编辑器插入 | `src/renderer/src/modules/editor/components/PlateEditor.tsx` | `editor.tf.insertNodes()` / `lastSelectionRef` / `onInsertDrawioReady` 回调 |
| EditorView 桥接 | `src/renderer/src/modules/editor/components/EditorView.tsx` | toolbar / dialog / insert callback 中转 |
| 工具栏按钮 | `src/renderer/src/modules/editor/components/EditorToolbar.tsx` | draw.io / mermaid 插入按钮模式 |
| 右侧栏宿主 | `src/renderer/src/modules/project/components/AnnotationPanel.tsx` | 现有右侧 rail shell / collapse / flyout |
| Tag 编辑 | `src/renderer/src/modules/asset/components/TagEditor.tsx` | Enter 新增 / × 删除 |
| 资产详情展示 | `src/renderer/src/modules/asset/components/AssetDetailCard.tsx` | `asset:get` 返回结构消费模式 |

### 防回归注意事项

- 新增 IPC 频道 `asset:create` 和 `asset:recommend` 必须同时更新以下 4 个文件：
  1. `src/shared/ipc-types.ts`（频道常量 + IpcChannelMap）
  2. `src/main/ipc/asset-handlers.ts`（handler 注册）
  3. `src/preload/index.ts` + `index.d.ts`（preload 暴露）
  4. `tests/unit/preload/security.test.ts`（白名单断言）
- `src/main/ipc/index.ts` 的 `registerAssetHandlers()` 调用已存在；除非编译报错，默认不需要再改这个文件
- 编辑器插入功能不能破坏现有 draw.io / mermaid 的插入流程
- `recommendationStore` 是新 store，必须在 `stores/index.ts` 导出
- 推荐引擎的 FTS 查询复用 `assetRepo.search()`，不要重复实现 FTS 逻辑
- `asset:create` 和 `asset:recommend` 频道名使用 kebab-case（不要 camelCase）
- Story 5.1 的 `AssetSearchPage` 与一键入库无直接关联，不要修改搜索页面行为
- `RecommendationPanel` 必须丢弃过期请求结果，避免章节 A 的返回覆盖章节 B
- H1 顶级章节是本故事有效推荐范围；不要只改 `useCurrentSection` 而忘记同步补齐 `OutlineHeadingElement` 的 H1 locator/data attrs
- 同章节重新推荐时，`ignoredAssetIds` / `acceptedAssetIds` 必须继续生效；不要把用户已忽略或已插入的卡片重新带回列表
- "一键入库"按钮只响应编辑器正文选区；不要把侧边栏、Drawer、Toolbar 文本选中误判为有效入库输入
- 推荐详情 / 插入复用 `asset:get`，不要把完整资产正文塞进推荐列表 IPC 结果

### 范围声明

**本故事范围内：**
- `asset:create` IPC 和完整服务链路
- 本地 FTS 推荐引擎（`recommendation-service`）
- 推荐面板 UI（绿色卡片 + 详情 Drawer）
- 一键入库对话框 + 编辑器工具栏按钮
- 编辑器资产内容插入
- 侧边栏推荐区域集成

**本故事范围外（明确排除）：**
- AI 语义推荐（Beta + Graphiti）
- 资产删除/编辑管理界面（Story 5.4 批量导入时统一处理）
- 推荐结果持久化到 sidecar JSON
- 推荐数据写入 annotationStore
- 个性化推荐排序（V1.0 引入行为数据驱动）
- 资产库 Git 同步（Epic 9 Story 9.3）
- 右键上下文菜单入口（工具栏按钮足够，避免引入 Plate 上下文菜单的额外复杂度）

### Project Structure Notes

**新增文件：**
- `src/shared/recommendation-types.ts`
- `src/main/services/recommendation-service.ts`
- `src/renderer/src/stores/recommendationStore.ts`
- `src/renderer/src/modules/asset/hooks/useAssetRecommendation.ts`
- `src/renderer/src/modules/asset/hooks/useAssetImport.ts`
- `src/renderer/src/modules/asset/components/RecommendationPanel.tsx`
- `src/renderer/src/modules/asset/components/RecommendationCard.tsx`
- `src/renderer/src/modules/asset/components/RecommendationDetailDrawer.tsx`
- `src/renderer/src/modules/asset/components/AssetImportDialog.tsx`
- `tests/unit/main/services/recommendation-service.test.ts`
- `tests/unit/renderer/stores/recommendationStore.test.ts`
- `tests/unit/renderer/modules/asset/components/RecommendationCard.test.tsx`
- `tests/unit/renderer/modules/asset/components/RecommendationPanel.test.tsx`
- `tests/unit/renderer/modules/asset/components/AssetImportDialog.test.tsx`
- `tests/e2e/stories/story-5-2-asset-recommendation-import.spec.ts`

**修改文件：**
- `src/shared/asset-types.ts` — 新增 `CreateAssetInput`
- `src/shared/ipc-types.ts` — 新增 2 个频道
- `src/main/db/repositories/asset-repo.ts` — 新增 `create()`
- `src/main/services/asset-service.ts` — 新增 `create()`
- `src/main/ipc/asset-handlers.ts` — 新增 2 个 handler
- `src/preload/index.ts` + `index.d.ts` — 新增 2 个 API
- `src/renderer/src/stores/assetStore.ts` — 新增 `createAsset()`
- `src/renderer/src/stores/index.ts` — 导出 `useRecommendationStore`
- `src/renderer/src/modules/asset/index.ts` — 导出新组件和 hook
- `src/renderer/src/modules/annotation/hooks/useCurrentSection.ts` — 扩展为可配置 heading range
- `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx` — 扩展 H1 locator key / `data-heading-*` 输出
- `src/shared/chapter-markdown.ts` — 复用 `extractMarkdownSectionContent()`；如需共享 helper 可在此补充纯文本提取辅助函数
- `src/renderer/src/modules/editor/components/EditorToolbar.tsx` — 新增"一键入库"按钮
- `src/renderer/src/modules/editor/components/EditorView.tsx` — 传递 `currentSection`、管理导入对话框、向上传递 insertAsset 回调
- `src/renderer/src/modules/editor/components/PlateEditor.tsx` — 新增 `onInsertAssetReady` 回调
- `src/renderer/src/modules/project/components/AnnotationPanel.tsx` — 集成 `RecommendationPanel` 宿主 section
- `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` — 同时向 `EditorView` / `AnnotationPanel` 传递 `currentSection`，并持有 insertAssetRef
- `tests/unit/main/db/repositories/asset-repo.test.ts` — 新增 create 测试
- `tests/unit/main/services/asset-service.test.ts` — 新增 create 测试
- `tests/unit/main/ipc/asset-handlers.test.ts` — 新增 2 个频道测试
- `tests/unit/preload/security.test.ts` — 新增 2 个 API 白名单
- `tests/unit/renderer/modules/editor/components/EditorToolbar.test.tsx` — 扩展一键入库按钮测试
- `tests/unit/renderer/modules/editor/components/EditorView.test.tsx` — 扩展导入 / insert 回调桥接测试
- `tests/unit/renderer/modules/editor/components/OutlineHeadingElement.test.tsx` — 扩展 H1 locator 标记测试
- `tests/unit/renderer/modules/editor/components/PlateEditor.test.tsx` — 扩展 insertAsset fallback 测试
- `tests/unit/renderer/project/AnnotationPanel.test.tsx` — 扩展推荐 section 渲染测试
- `tests/unit/renderer/project/ProjectWorkspace.test.tsx` — 扩展 currentSection / insertAsset 传参测试

### 禁止事项

- **禁止**把推荐结果存进 `annotationStore` 或走 `annotation:create/update`
- **禁止**新建 `asset:recommend-detail`、`asset:insert` 之类重复 IPC；详情读取统一复用 `asset:get`
- **禁止**修改 `WorkspaceLayout` 列宽合同，或新增第二个 right aside
- **禁止**假设当前右侧栏存在 tab 模式；仓库当前只有 `AnnotationPanel`
- **禁止**直接复用 `assetStore.selectedAsset` 去驱动项目工作区 Drawer
- **禁止**忽略 H1 章节；推荐 / 一键入库必须覆盖 H1-H4
- **禁止**把过期的推荐响应直接写回 store
- **禁止**破坏现有 draw.io / mermaid toolbar 与插入能力

### Suggested Verification

1. `pnpm test:unit -- tests/unit/main/db/repositories/asset-repo.test.ts tests/unit/main/services/asset-service.test.ts tests/unit/main/services/recommendation-service.test.ts tests/unit/main/ipc/asset-handlers.test.ts tests/unit/preload/security.test.ts tests/unit/renderer/stores/recommendationStore.test.ts tests/unit/renderer/modules/asset/components/RecommendationCard.test.tsx tests/unit/renderer/modules/asset/components/RecommendationPanel.test.tsx tests/unit/renderer/modules/asset/components/AssetImportDialog.test.tsx tests/unit/renderer/modules/editor/components/EditorToolbar.test.tsx tests/unit/renderer/modules/editor/components/EditorView.test.tsx tests/unit/renderer/modules/editor/components/PlateEditor.test.tsx tests/unit/renderer/project/AnnotationPanel.test.tsx tests/unit/renderer/project/ProjectWorkspace.test.tsx`
2. `pnpm typecheck:node && pnpm typecheck:web`
3. `pnpm test:e2e:prepare && playwright test tests/e2e/stories/story-5-2-asset-recommendation-import.spec.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5 Story 5.2]
- [Source: _bmad-output/planning-artifacts/prd.md — FR32, FR33, NFR4]
- [Source: _bmad-output/planning-artifacts/architecture.md — 数据架构 / 批注类型 asset-recommendation / Agent 编排 / 异步任务白名单 / 目录结构]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — 资产推荐绿 #52C41A / 绿色资产推荐交互 / 侧边面板模式 / 交互力学五阶段]
- [Source: _bmad-output/implementation-artifacts/5-1-asset-search-tag-management.md — 前置 Story 完整上下文与代码模式]
- [Source: _bmad-output/implementation-artifacts/5-2-asset-recommendation-one-click-import-ux/prototype.manifest.yaml] — story-level UX lookup order
- [Source: _bmad-output/implementation-artifacts/5-2-asset-recommendation-one-click-import-ux/ux-spec.md] — Screen 1/2/3 细节
- [Source: _bmad-output/implementation-artifacts/5-2-asset-recommendation-one-click-import-ux/prototype.pen] — 结构与交互细节（Screen IDs: `mSt7P`, `SEpRU`, `sKS6C`）
- [Source: src/main/db/schema.ts — AssetsTable / TagsTable / AssetTagsTable 定义]
- [Source: src/main/db/repositories/asset-repo.ts — search/list/findById 现有方法]
- [Source: src/main/db/repositories/tag-repo.ts — findOrCreateMany / replaceAssetTags]
- [Source: src/main/services/asset-service.ts — 现有服务层模式与标签归一化]
- [Source: src/main/ipc/asset-handlers.ts — 现有 4 个 asset handler]
- [Source: src/shared/ipc-types.ts — 现有频道定义与 IpcChannelMap]
- [Source: src/renderer/src/stores/assetStore.ts — 现有 store 模式]
- [Source: src/shared/chapter-markdown.ts — `extractMarkdownSectionContent()` / Markdown section helpers]
- [Source: src/renderer/src/modules/annotation/hooks/useCurrentSection.ts — 当前章节感知逻辑]
- [Source: src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx — 当前 heading locator/data attrs 输出]
- [Source: src/renderer/src/modules/editor/components/EditorToolbar.tsx — toolbar 按钮模式]
- [Source: src/renderer/src/modules/editor/components/EditorView.tsx — draw.io / mermaid callback 中转模式]
- [Source: src/renderer/src/modules/editor/components/PlateEditor.tsx — `editor.tf.insertNodes()` / `lastSelectionRef` / `onInsertDrawioReady` 回调模式]
- [Source: src/renderer/src/modules/project/components/AnnotationPanel.tsx — 当前右侧 rail shell 合同]
- [Source: src/renderer/src/modules/asset/components/AssetDetailCard.tsx — 资产详情展示模式]
- [Source: src/renderer/src/modules/asset/components/TagEditor.tsx — 标签编辑组件]

### Change Log

- 2026-04-11: `validate-create-story` 修订
  - 将章节上下文主键从模糊的 `sectionId` 收敛为当前仓库真实使用的 `sectionKey`
  - 明确推荐 / 一键入库必须支持 H1-H4，并要求同时扩展 `useCurrentSection` 与 `OutlineHeadingElement`，而不是重造 DOM 探测
  - 修正推荐详情与插入链路：统一复用既有 `asset:get`，不再让推荐列表 IPC 携带完整正文
  - 修正编辑器桥接合同：补入 `EditorView` / `ProjectWorkspace` / `AnnotationPanel` 的真实接点，移除“不存在的 tab 侧栏假设”
  - 修正 `src/main/ipc/index.ts` 误导性任务：当前只需保持既有 `registerAssetHandlers()`，编译时穷举检查发生在 `asset-handlers.ts`
  - 补齐过期响应丢弃、同章节刷新状态保持、章节切换清空、H1 顶级章节、对话框尺寸与 draft tags 适配、编辑器内选区限制、插入 fallback 顺序等实现细节
  - 扩展测试矩阵到 `EditorToolbar` / `EditorView` / `PlateEditor` / `AnnotationPanel` / `ProjectWorkspace`

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
