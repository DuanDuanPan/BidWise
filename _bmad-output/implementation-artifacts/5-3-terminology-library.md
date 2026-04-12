# Story 5.3: 行业术语库维护与自动应用

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 维护行业术语对照表，AI 生成方案时自动应用术语替换,
So that 方案用语专业精准，"设备管理"自动变成"装备全寿命周期管理"。

## Acceptance Criteria

1. **AC1 — 术语映射 CRUD**
   Given 术语库管理界面
   When 用户添加新术语对照（输入源术语和目标术语）
   Then 系统创建术语映射记录（如"设备管理"→"装备全寿命周期管理"），持久化到本地 SQLite，列表刷新显示新条目；源术语唯一约束（归一化后重复则提示"该术语已存在"）（FR35）

   Given 术语库管理界面已有术语条目
   When 用户编辑已有术语对照的目标术语、分类或说明
   Then 更新记录并即时反映在列表中

   Given 术语库管理界面已有术语条目
   When 用户删除术语对照（二次确认）
   Then 记录从数据库移除，列表刷新

2. **AC2 — 术语搜索与过滤**
   Given 术语库已有多条记录
   When 用户在搜索框输入关键词
   Then 按源术语或目标术语模糊匹配，300ms 防抖实时过滤列表

   Given 术语库已有多条记录且存在多个分类
   When 用户选择分类筛选
   Then 仅展示该分类下的术语条目

   Given 术语库中有启用和禁用的条目
   When 用户切换"仅显示启用"开关
   Then 列表按启用状态过滤

3. **AC3 — AI 生成时术语自动替换**
   Given AI 生成方案内容且术语库中有已启用的术语映射
   When 章节生成完成返回 AI 文本
   Then 系统自动扫描并替换匹配的源术语为目标术语（最长匹配优先），替换后的内容作为最终生成结果呈现在编辑器中（FR35）

   Given 术语自动替换已执行且产生了替换
   When 用户查看侧边栏批注
   Then 每个发生替换的术语映射生成一条蓝色 AI 建议批注（`ai-suggestion`）；若同一术语在本次生成中命中多次，则合并为一条批注并在内容尾部追加 `（共 {count} 处）`，author 为 `system:terminology`（FR35）

   Given 术语库为空或所有条目已禁用
   When AI 生成方案内容
   Then 生成流程正常执行，不触发任何术语替换，无额外性能开销

4. **AC4 — 批量导入**
   Given 术语库管理界面
   When 用户上传 CSV 文件（列：源术语, 目标术语, 分类, 说明）
   Then 系统解析并批量创建术语条目，跳过重复的源术语，完成后显示导入结果（成功数 / 跳过数）

5. **AC5 — Git 同步就绪**
   Given 术语库数据
   When 用户执行 JSON 导出
   Then 系统生成兼容未来 Git 同步（Story 9-3）的 JSON，导出结构至少包含 `{ version: "1.0", exportedAt, entries }`，其中每个 entry 包含 `sourceTerm`、`targetTerm`、`category`、`description`、`isActive`；导出通过主进程 save dialog 写出到用户选择的位置，取消保存不报错；未来自动写入 `company-data/terminology/` 的 Git 同步流程由 Story 9-3 实现

## Tasks / Subtasks

### Task 1: 数据模型与类型定义 (AC: #1, #5)

- [x] 1.1 创建 `src/shared/terminology-types.ts`
  - `TerminologyEntry = { id: string; sourceTerm: string; targetTerm: string; normalizedSourceTerm: string; category: string | null; description: string | null; isActive: boolean; createdAt: string; updatedAt: string }`
  - `CreateTerminologyInput = { sourceTerm: string; targetTerm: string; category?: string; description?: string; isActive?: boolean }` — UI 新建 / CSV 导入默认 `true`，JSON 导入可显式传 `false`
  - `UpdateTerminologyInput = { id: string; sourceTerm?: string; targetTerm?: string; category?: string | null; description?: string | null; isActive?: boolean }`
  - `TerminologyListFilter = { searchQuery?: string; category?: string; isActive?: boolean }`
  - `BatchCreateTerminologyInput = { entries: CreateTerminologyInput[] }`
  - `BatchCreateResult = { created: number; duplicates: string[] }`
  - `TerminologyReplacement = { sourceTerm: string; targetTerm: string; count: number }`
  - `TerminologyApplyResult = { content: string; replacements: TerminologyReplacement[]; totalReplacements: number }`
  - `TerminologyExportData = { version: "1.0"; exportedAt: string; entries: Array<{ sourceTerm: string; targetTerm: string; category: string | null; description: string | null; isActive: boolean }> }`
  - `TerminologyExportOutput = { cancelled: boolean; outputPath?: string; entryCount: number }`
  - 注意：DB 层 `isActive` 为 `number`（0/1），TS 接口层为 `boolean`；repo 负责转换

- [x] 1.2 在 `src/main/db/schema.ts` 新增 `TerminologyEntriesTable` 接口
  - 字段：`id`, `sourceTerm`, `targetTerm`, `normalizedSourceTerm`, `category`, `description`, `isActive`（integer 0/1）, `createdAt`, `updatedAt`
  - 在 `DB` 接口新增 `terminologyEntries: TerminologyEntriesTable`

- [x] 1.3 创建 `src/main/db/migrations/015_create_terminology_entries.ts`
  - 表 `terminology_entries`：
    - `id` TEXT PK
    - `source_term` TEXT NOT NULL
    - `target_term` TEXT NOT NULL
    - `normalized_source_term` TEXT NOT NULL UNIQUE（用于去重）
    - `category` TEXT
    - `description` TEXT
    - `is_active` INTEGER NOT NULL DEFAULT 1
    - `created_at` TEXT NOT NULL
    - `updated_at` TEXT NOT NULL
  - 索引：`idx_terminology_category` ON `category`，`idx_terminology_is_active` ON `is_active`
  - **注意**：检查当前最新迁移编号，若已超过 015 则使用下一个可用编号

- [x] 1.4 更新 `src/main/db/migrator.ts`
  - 将 `015_create_terminology_entries` 注册到手写 migration map
  - 保持与当前 `001-014` 一致的显式 import + map 维护方式；**不要**只创建迁移文件而漏掉注册

- [x] 1.5 更新 `tests/unit/main/db/migrations.test.ts`
  - 修正当前测试基线，使迁移链覆盖 `001-014` 的既有链路，并新增 `015_create_terminology_entries`
  - 新增断言：`terminology_entries` 表、UNIQUE(`normalized_source_term`) 约束、`category` / `is_active` 索引均创建成功

### Task 2: Repository 层 (AC: #1, #2, #4)

- [x] 2.1 创建 `src/main/db/repositories/terminology-repo.ts`
  - 签名遵循 `asset-repo.ts` 模式：`getDb()` + Kysely 查询 + `BidWiseError` 错误
  - `list(filter?: TerminologyListFilter): Promise<TerminologyEntry[]>`
    - 支持 `searchQuery`（对 `source_term` 和 `target_term` 做 LIKE `%keyword%`）
    - 支持 `category` 精确匹配
    - 支持 `isActive` 过滤
    - 默认按 `updated_at` DESC 排序
  - `findById(id: string): Promise<TerminologyEntry | null>`
  - `findByNormalizedSourceTerm(normalized: string): Promise<TerminologyEntry | null>` — 用于创建时去重检查
  - `create(input: { sourceTerm: string; targetTerm: string; normalizedSourceTerm: string; category: string | null; description: string | null; isActive?: number }): Promise<TerminologyEntry>`
    - 自动生成 `id`（`uuidv4()`）、`createdAt`、`updatedAt`（ISO-8601）
    - `isActive` 缺省时默认 1；允许 JSON 导入场景显式传 0 以保留禁用条目
  - `update(id: string, fields: Partial<{ sourceTerm: string; targetTerm: string; normalizedSourceTerm: string; category: string | null; description: string | null; isActive: number }>): Promise<TerminologyEntry>`
    - 自动更新 `updatedAt`
    - 若 `sourceTerm` 变更则同步更新 `normalizedSourceTerm`
  - `delete(id: string): Promise<void>`
  - `findActive(): Promise<TerminologyEntry[]>` — 仅返回 `isActive = 1` 的条目，按 `source_term` 长度 DESC 排序（最长匹配优先）
  - `count(filter?: TerminologyListFilter): Promise<number>` — 可选，用于分页
  - DB↔TS 转换由 `CamelCasePlugin` 自动完成，`isActive` 的 number↔boolean 在 repo 层手动转换

### Task 3: 术语服务层 (AC: #1, #2, #4, #5)

- [x] 3.1 创建 `src/main/services/terminology-service.ts`
  - 使用 `createLogger('terminology-service')`
  - 归一化函数 `normalizeSourceTerm(term: string): string` — `term.trim().replace(/\s+/g, ' ').toLowerCase()`
  - `list(filter?: TerminologyListFilter): Promise<TerminologyEntry[]>` — 透传 repo
  - `create(input: CreateTerminologyInput): Promise<TerminologyEntry>`
    - 归一化 sourceTerm → normalizedSourceTerm
    - 检查 `findByNormalizedSourceTerm()` 是否已存在，存在则抛出 `BidWiseError(ErrorCode.DUPLICATE, '该术语已存在（已有映射：{existingTarget}）')`
    - `isActive` 默认 `true`
    - 调用 `repo.create()`
  - `update(input: UpdateTerminologyInput): Promise<TerminologyEntry>`
    - 若 `sourceTerm` 变更，检查归一化后是否与其他条目冲突
    - 调用 `repo.update()`
  - `delete(id: string): Promise<void>` — 调用 `repo.delete()`
  - `batchCreate(entries: CreateTerminologyInput[]): Promise<BatchCreateResult>`
    - 逐条归一化并检查重复（DB 内已有 + 本批次内去重）
    - 重复的跳过并记入 `duplicates` 列表
    - CSV 导入场景对 `isActive` 缺省值一律按 `true` 处理
    - 返回 `{ created, duplicates }`
  - `getActiveEntries(): Promise<TerminologyEntry[]>` — 调用 `repo.findActive()`，结果缓存于内存（带 TTL 或脏标记，entry 变更时清除缓存）
  - `buildExportData(): Promise<TerminologyExportData>` — 导出**所有**条目（含禁用项）为未来 Git sync 兼容的 JSON 数据；不要只导出启用项
  - `exportToFile(): Promise<TerminologyExportOutput>`
    - 内部调用 `buildExportData()`
    - 使用 Electron `dialog.showSaveDialog()` 打开保存对话框，并写出 JSON
    - 默认文件名 `terminology-export.json`；若现有 `app.getPath('userData')/company-data/terminology/` 或 `app.getAppPath()/company-data/terminology/` 目录存在，可将其作为 `defaultPath`
    - 用户取消时返回 `{ cancelled: true, entryCount }`，不抛错
  - `importFromJson(data: TerminologyExportData): Promise<BatchCreateResult>` — 从 JSON 导入并保留 `isActive` 值

### Task 4: 术语替换引擎 (AC: #3)

- [x] 4.1 创建 `src/main/services/terminology-replacement-service.ts`
  - 使用 `createLogger('terminology-replacement-service')`
  - `applyReplacements(text: string, entries: TerminologyEntry[]): TerminologyApplyResult`
    - **输入**：待替换文本 + 已启用的术语列表（已按 `sourceTerm` 长度 DESC 排序）
    - **算法**（Alpha 阶段，简洁可靠）：
      1. 对每个 entry 的 `sourceTerm`，转义正则特殊字符后构建正则：`new RegExp(escapedTerm, 'g')`
      2. 按 sourceTerm 长度**降序**遍历（最长匹配优先），逐个执行全局替换
      3. 已被替换的区域用占位符保护，防止链式替换（如 A→B 后 B→C 的意外替换）
      4. 记录每个术语的替换次数
      5. 还原占位符，返回 `{ content, replacements, totalReplacements }`
    - **占位符保护策略**：使用 Unicode Private Use Area 字符（如 `\uE000`）+ 索引作为临时占位，替换全部完成后还原
    - 若 `entries` 为空或 `text` 为空，直接返回原文 + 空替换列表（零开销）
  - `buildPromptContext(entries: TerminologyEntry[]): string`
    - 格式化术语列表为 AI prompt 可消费的文本：
      ```
      【行业术语规范】请在生成内容时优先使用以下标准术语：
      - "设备管理" → "装备全寿命周期管理"
      - "系统" → "信息化平台"
      ...
      ```
    - 若无启用术语则返回空字符串

### Task 5: IPC 通道与预加载 (AC: #1, #2, #4, #5)

- [x] 5.1 在 `src/shared/ipc-types.ts` 新增术语 IPC 频道
  - `IPC_CHANNELS` 新增：
    - `TERMINOLOGY_LIST: 'terminology:list'`
    - `TERMINOLOGY_CREATE: 'terminology:create'`
    - `TERMINOLOGY_UPDATE: 'terminology:update'`
    - `TERMINOLOGY_DELETE: 'terminology:delete'`
    - `TERMINOLOGY_BATCH_CREATE: 'terminology:batch-create'`
    - `TERMINOLOGY_EXPORT: 'terminology:export'`
  - `IpcChannelMap` 新增对应 6 个频道的 input/output 类型映射
  - `terminology:export` 的 input 为 `void`，output 为 `TerminologyExportOutput`

- [x] 5.2 创建 `src/main/ipc/terminology-handlers.ts`
  - 遵循 `asset-handlers.ts` 模式：`TerminologyChannel` 类型 + `terminologyHandlerMap` + `registerTerminologyHandlers()`
  - 6 个 handler 均使用 `createIpcHandler()` 模式，仅做参数透传
  - `terminology:export` 直接透传到 `terminologyService.exportToFile()`

- [x] 5.3 在 `src/main/ipc/index.ts` 注册 `registerTerminologyHandlers()`
  - 在已有的 handler 注册列表中新增一行调用

- [x] 5.4 更新 `src/preload/index.ts` 暴露 6 个术语 API
  - `window.api.terminologyList()` / `terminologyCreate()` / `terminologyUpdate()` / `terminologyDelete()` / `terminologyBatchCreate()` / `terminologyExport()`
  - 遵循现有 `typedInvoke()` 模式

- [x] 5.5 更新 `src/preload/index.d.ts` 类型声明

### Task 6: 状态管理 (AC: #1, #2)

- [x] 6.1 创建 `src/renderer/src/stores/terminologyStore.ts`
  - State：
    - `entries: TerminologyEntry[]`
    - `searchQuery: string`
    - `categoryFilter: string | null`
    - `activeOnly: boolean`（默认 `true`）
    - `loading: boolean`
    - `error: string | null`
  - Actions：
    - `loadEntries(): Promise<void>` — 调用 `window.api.terminologyList()` with current filters
    - `createEntry(input: CreateTerminologyInput): Promise<void>` — 创建后刷新列表
    - `updateEntry(input: UpdateTerminologyInput): Promise<void>` — 更新后刷新列表
    - `deleteEntry(id: string): Promise<void>` — 删除后刷新列表
    - `batchCreate(input: BatchCreateTerminologyInput): Promise<BatchCreateResult>` — 批量导入后刷新列表，返回结果
    - `exportJson(): Promise<TerminologyExportOutput | null>` — 调用 `window.api.terminologyExport()`；成功时返回结果，失败时写入 `error`
    - `setSearchQuery(query: string): void`
    - `setCategoryFilter(category: string | null): void`
    - `setActiveOnly(active: boolean): void`
    - `clearError(): void`
  - 约束：`loading: boolean` 命名，异步 Action 自行管理 loading/error

- [x] 6.2 在 `src/renderer/src/stores/index.ts` 导出 `useTerminologyStore`

### Task 7: 术语库管理界面 (AC: #1, #2, #4, #5)

- [x] 7.1 创建 `src/renderer/src/modules/asset/components/TerminologyPage.tsx`
  - 布局：与 `AssetSearchPage` 同级的页面组件
  - 顶部：搜索框（`Input.Search`，300ms 防抖）+ 分类筛选（`Select`，选项从当前条目 category 动态提取）+ "仅显示启用"开关（`Switch`，默认开）
  - 右上角：`添加术语`（primary Button）+ `批量导入`（default Button）+ `导出 JSON`（default Button）
  - 主体：Ant Design `Table` 组件
    - 列：源术语、目标术语、分类、状态（启用/禁用 `Switch`）、操作（编辑/删除）
    - 空状态：`术语库暂无条目。点击"添加术语"创建第一条行业术语映射。`
    - 支持行内状态切换（点击 Switch 直接调用 `updateEntry`）
    - 分页使用 Ant Design Table 的**前端分页**（`pageSize = 20`），基于当前已加载的过滤结果做客户端分页；本 Story 不新增服务端分页协议
  - 删除操作需 `Popconfirm` 二次确认
  - `导出 JSON` 按钮调用 store `exportJson()`；用户取消保存时不提示错误，成功后显示包含导出路径的 success message

- [x] 7.2 创建 `src/renderer/src/modules/asset/components/TerminologyEntryForm.tsx`
  - Ant Design `Modal` 对话框，标题：添加时为 `添加术语映射`，编辑时为 `编辑术语映射`
  - 表单字段：
    - 源术语（`Input`，必填，placeholder: `如"设备管理"`）
    - 目标术语（`Input`，必填，placeholder: `如"装备全寿命周期管理"`）
    - 分类（`AutoComplete`，可选，从已有分类自动补全，placeholder: `如"军工装备"、"信息化"`）
    - 说明（`Input.TextArea`，可选，最多 200 字）
  - 操作：`确定`（primary）、`取消`
  - 提交后若返回 `ErrorCode.DUPLICATE` 错误，在源术语字段下方显示红色提示：`该术语已存在（已有映射：{existingTarget}）`

- [x] 7.3 创建 `src/renderer/src/modules/asset/components/TerminologyImportDialog.tsx`
  - Ant Design `Modal`，标题：`批量导入术语`，宽度 `600px`
  - Step 1：文件上传区（`Upload.Dragger`，接受 `.csv`）+ 模板下载链接
  - Step 2：解析后预览表格（源术语 / 目标术语 / 分类 / 说明），最多预览 20 行
  - Step 3：点击 `导入` 执行，完成后显示结果：`成功导入 N 条，跳过 M 条重复`
  - CSV 解析：优先使用轻量手写解析器（处理 BOM / `\r\n` / `\n` / 引号包裹字段）；**不要**为了本 Story 仅引入 `Papa Parse`
  - CSV 格式：`源术语,目标术语,分类,说明`（分类和说明可选为空）

- [x] 7.4 资产模块导航集成
  - 在 `src/renderer/src/modules/asset/` 中添加 `TerminologyPage` 与 `AssetModuleContainer` 导出
  - 新增轻量容器组件 `src/renderer/src/modules/asset/components/AssetModuleContainer.tsx`，在 `/asset` 路由内使用 `Segmented` 组件切换 `资产库` | `术语库`
  - 保留现有 `/asset` 路由与命令面板入口；修改 `src/renderer/src/App.tsx` 让 `/asset` 渲染 `AssetModuleContainer`
  - `AssetModuleContainer` 内保留 `AssetSearchPage` 与 `TerminologyPage` 两个子页面实例，切换时不重新挂载，以保持现有资产搜索状态

### Task 8: AI 生成术语集成 (AC: #3)

- [x] 8.1 在 `src/main/services/agent-orchestrator/orchestrator.ts` 扩展后处理能力
  - 新增可选 `AgentPostProcessor` 类型：
    ```typescript
    type AgentPostProcessor = (
      result: AgentExecuteResult,
      context: Record<string, unknown>,
      signal: AbortSignal
    ) => Promise<AgentExecuteResult>
    ```
  - `registerAgent(type, handler, postProcessor?)` — 存储 postProcessor
  - `this.agents` 改为存储 `{ handler, postProcessor }`
  - `execute()` 中创建 per-task executor 时，也必须从已注册 agent 定义中取出同一个 `postProcessor`；不能只在 `registerAgent()` 时接入
  - 在 `createExecutor()` 中，AI 响应返回后、result 返回前调用 postProcessor（如果已注册）：
    ```typescript
    let result = { content: response.content, ... }
    if (postProcessor) {
      result = await postProcessor(result, ctx.input, ctx.signal)
    }
    return result
    ```
  - 这是非破坏性扩展：无 postProcessor 的 agent 行为不变

- [x] 8.2 创建 `src/main/services/agent-orchestrator/post-processors/terminology-post-processor.ts`
  - 仅对章节生成模式（非 `ask-system`、非 `annotation-feedback`）执行
  - 流程：
    1. 调用 `terminologyService.getActiveEntries()` 获取启用术语（带缓存）
    2. 若无启用术语，直接返回原 result
    3. 调用 `terminologyReplacementService.applyReplacements(result.content, entries)`
    4. 若有替换发生，为每个发生替换的术语映射创建批注：
       - `projectId` 直接复用章节生成上下文中的 `context.projectId`
       - `sectionId` 使用 `createChapterLocatorKey(context.target as ChapterHeadingLocator)` 生成稳定 section key；**不要**只写章节标题
       - 复用现有 `annotationService.create()`，不要扩展 `CreateAnnotationInput.status`
       - `type: 'ai-suggestion'`，`author: 'system:terminology'`
       - `content`: `已将「${sourceTerm}」替换为「${targetTerm}」（术语库自动应用）`；若 `count > 1` 再追加 `（共 ${count} 处）`
       - 创建后保持默认 `pending` 状态，以确保批注在侧边栏中以蓝色 `ai-suggestion` 样式可见（与 AC3 保持一致）
    5. 返回修改后的 result（content 已替换）

- [x] 8.3 在 `src/main/services/agent-orchestrator/index.ts` 注册 generate agent 的 postProcessor
  - 在 `registerAgent('generate', generateAgentHandler)` 调用中追加 `terminologyPostProcessor` 参数

- [x] 8.4 在 `generate-agent.ts` 的 `handleChapterGeneration()` 中注入术语上下文到 prompt
  - 在构建 `GenerateChapterContext` 之前，先调用 `terminologyService.getActiveEntries()` 获取当前启用术语，再调用 `terminologyReplacementService.buildPromptContext(entries)` 生成术语提示文本
  - 将术语提示文本作为新字段 `terminologyContext` 传入 prompt context
  - 更新 `src/main/prompts/generate-chapter.prompt.ts` 的 `GenerateChapterContext` 接口和 prompt 模板，在适当位置注入术语上下文
  - 若术语为空则不注入（不影响现有 prompt 结构）

### Task 9: 测试矩阵 (AC: #1, #2, #3, #4, #5)

- [x] 9.1 新建 `tests/unit/main/db/repositories/terminology-repo.test.ts`
  - 覆盖：`create()` 成功 + `normalizedSourceTerm` 自动填充、`findByNormalizedSourceTerm()` 精确查找、`list()` 搜索/分类/状态过滤、`findActive()` 按长度 DESC 排序、`update()` 自动更新 `updatedAt`、`delete()` 成功移除、重复 `normalizedSourceTerm` 触发 UNIQUE 约束错误

- [x] 9.2 新建 `tests/unit/main/services/terminology-service.test.ts`
  - 覆盖：`create()` 正常创建 + 归一化、`create()` 重复源术语抛 `BidWiseError(ErrorCode.DUPLICATE)`、`update()` 含 sourceTerm 变更时的冲突检测、`batchCreate()` 批量导入 + 去重统计、`getActiveEntries()` 缓存行为（连续调用只查一次 DB）、`buildExportData()` 数据结构正确、`exportToFile()` 取消保存与成功写出两条路径

- [x] 9.3 新建 `tests/unit/main/services/terminology-replacement-service.test.ts`
  - 覆盖：
    - 单个术语替换：`"设备管理"→"装备全寿命周期管理"` 在文本中正确替换
    - 多术语替换：多个不同术语同时替换
    - 最长匹配优先：`"设备管理系统"` 和 `"设备管理"` 同时存在时，优先匹配更长的
    - 链式替换保护：A→B 且 B→C 时，原文中的 A 只替换为 B，不会继续变成 C
    - 空输入：entries 为空 → 返回原文 + 空替换列表
    - 空文本：text 为空 → 直接返回
    - 替换计数准确：同一术语出现多次时 `count` 正确
    - `buildPromptContext()` 格式正确、空列表返回空字符串
    - 正则特殊字符的 sourceTerm（如含 `.` `(` 等）正确转义

- [x] 9.4 新建 `tests/unit/main/ipc/terminology-handlers.test.ts`
  - 覆盖：6 个频道注册、参数透传与错误包装

- [x] 9.5 更新 `tests/unit/preload/security.test.ts`
  - 新增 `terminologyList`、`terminologyCreate`、`terminologyUpdate`、`terminologyDelete`、`terminologyBatchCreate`、`terminologyExport` 到 preload 白名单断言

- [x] 9.6 新建 `tests/unit/renderer/stores/terminologyStore.test.ts`
  - 覆盖：loadEntries、createEntry（含 duplicate 错误处理）、updateEntry、deleteEntry、batchCreate、搜索/过滤状态管理、loading/error 状态

- [x] 9.7 新建 `tests/unit/renderer/modules/asset/components/TerminologyPage.test.tsx`
  - 覆盖：表格渲染、搜索防抖、分类筛选、状态开关切换、添加按钮触发对话框、删除确认

- [x] 9.8 新建 `tests/unit/renderer/modules/asset/components/TerminologyEntryForm.test.tsx`
  - 覆盖：添加模式 / 编辑模式预填、必填校验、重复错误提示、提交成功后关闭

- [x] 9.9 新建 `tests/unit/renderer/modules/asset/components/TerminologyImportDialog.test.tsx`
  - 覆盖：CSV 上传解析、预览表格、导入结果显示、格式错误提示

- [x] 9.10 新建 `tests/unit/main/services/agent-orchestrator/terminology-post-processor.test.ts`
  - 覆盖：有术语时替换并创建批注、无术语时跳过、非章节生成模式跳过、`annotationService.create` 收到 `projectId` + stable `sectionId`、`annotationService.create` 后跟 `annotationService.update({ status: 'accepted' })`

- [x] 9.11 新建 `tests/e2e/stories/story-5-3-terminology-library.spec.ts`
  - 种入术语数据到测试 SQLite
  - 覆盖：
    - 打开术语库页面，添加术语映射，列表显示新条目
    - 编辑术语映射，修改后列表刷新
    - 删除术语映射（确认后移除）
    - 搜索术语列表过滤正确
    - 章节生成后文本中术语已替换 + 对应批注出现

- [x] 9.12 更新 `tests/unit/main/db/migrations.test.ts`
  - 覆盖 `015_create_terminology_entries` 注册与迁移链执行成功

- [x] 9.13 更新 `tests/unit/main/services/agent-orchestrator/agents/generate-agent.test.ts` 与 `tests/unit/main/prompts/generate-chapter.prompt.test.ts`
  - 覆盖：有启用术语时 `terminologyContext` 被注入 prompt，无术语时 prompt 结构保持不变

- [x] 9.14 更新 `tests/unit/main/services/agent-orchestrator/orchestrator.test.ts`
  - 覆盖：`registerAgent(..., postProcessor)` 后，`execute()` 的实际 task executor 也会调用同一个 postProcessor；无 postProcessor 时行为保持不变

## Dev Notes

### 架构要点

- **数据落点**：术语条目存储在主应用 SQLite（`app.getPath('userData')/data/db/bidwise.sqlite`），与 Story 5.1/5.2 的资产数据一致。**不要**创建独立的 `company-data/*.sqlite`。Git 同步（将 SQLite 数据导出为 JSON 写入 `company-data/terminology/`）延迟到 Story 9-3 实现。
- **导出边界**：5.3 的 `导出 JSON` 是人工触发的 save dialog 导出，不是自动 Git sync。若 `company-data/terminology/` 已存在，可作为默认保存目录；真正的自动落盘 / pull / push 逻辑仍属于 Story 9-3。
- **术语替换时机**：替换发生在 AI 响应返回之后、任务结果存储之前（orchestrator 后处理器）。Renderer 接收到的内容已是替换后的版本。
- **Prompt 双保险**：① 术语上下文注入 AI prompt（引导模型优先使用正确术语）→ ② 后处理器做确定性文本替换（兜底保障）。两步互补，任一步骤失败不影响另一步。
- **替换引擎 Alpha 策略**：基于正则的逐条替换 + 占位符保护。不引入外部分词库或 Aho-Corasick。术语量 <500 条时性能无瓶颈。
- **缓存策略**：`terminologyService.getActiveEntries()` 内存缓存活跃术语列表，CRUD 操作时清除缓存。避免每次章节生成都查 DB。
- **导出数据语义**：未来 Git sync 需要完整保留启用/禁用状态，因此导出 JSON 必须包含全部条目及 `isActive` 字段，而不是只导出启用项。

### 与 Story 5.1/5.2 的关系

| 能力 | 5.1/5.2 已完成 | 5.3 新增 |
|---|---|---|
| 数据模型 | `assets` / `tags` / `asset_tags` | `terminology_entries`（独立表，不依赖 asset 表） |
| Repository | `asset-repo`、`tag-repo` | `terminology-repo`（新文件） |
| Service | `asset-service`、`recommendation-service` | `terminology-service`、`terminology-replacement-service`（新文件） |
| IPC | `asset:*`（6 个频道） | `terminology:*`（6 个频道） |
| Store | `assetStore`、`recommendationStore` | `terminologyStore`（新文件） |
| UI | AssetSearchPage / RecommendationPanel | TerminologyPage / TerminologyEntryForm / TerminologyImportDialog / AssetModuleContainer |
| AI 集成 | 无 | orchestrator postProcessor + generate-agent prompt 注入 |

### 前一 Story（5.2）关键学习

1. **IPC 频道全栈更新清单**：每新增一个 IPC 频道必须同时更新 4 个文件 — `ipc-types.ts`、handler 文件、`preload/index.ts` + `index.d.ts`、`security.test.ts`。再加上 `ipc/index.ts` 的注册调用。
2. **Store 模式一致性**：`loading: boolean` 命名，异步 Action 自行管理 loading/error，通过 `stores/index.ts` 导出。
3. **`createIpcHandler()` 模式**：handler 只做参数透传，不包含业务逻辑。
4. **`createLogger()` 标准**：每个 service 文件创建独立 logger 实例。
5. **Kysely `CamelCasePlugin`**：DB snake_case ↔ TS camelCase 自动转换。但 `isActive` 的 number↔boolean 需要在 repo 层手动处理。
6. **`/asset` 路由基线已存在**：不要重建资产页路由；继续让命令面板导航到 `/asset`，只是在该路由内引入 `AssetModuleContainer` 做 `资产库 | 术语库` 切换。

### 术语替换算法详细设计（Alpha）

```
输入：text (待替换文本)，entries (按 sourceTerm 长度 DESC 排序的活跃术语列表)
输出：{ content, replacements[], totalReplacements }

1. 若 entries 为空 或 text 为空 → 直接返回原文 + 空列表
2. 初始化 replacementMap: Map<string, { targetTerm, count }>
3. workingText = text
4. placeholderIndex = 0
5. placeholderMap: Map<string, string> = {} // placeholder → targetTerm 原文
6. FOR EACH entry IN entries (长→短):
   a. escapedSource = escapeRegExp(entry.sourceTerm)
   b. regex = new RegExp(escapedSource, 'g')
   c. matchCount = 0
   d. workingText = workingText.replace(regex, (match) => {
        const placeholder = `\uE000${placeholderIndex++}\uE001`
        placeholderMap[placeholder] = entry.targetTerm
        matchCount++
        return placeholder
      })
   e. 若 matchCount > 0 → replacementMap.set(entry.sourceTerm, { targetTerm: entry.targetTerm, count: matchCount })
7. FOR EACH [placeholder, target] IN placeholderMap:
   workingText = workingText.replace(placeholder, target)
8. 构建 replacements[] 从 replacementMap
9. 返回 { content: workingText, replacements, totalReplacements: sum(count) }
```

### AI 生成集成链路

章节生成当前流程（`chapter-generation-service.ts` → `agent-orchestrator` → `generate-agent.ts`）：

```
用户触发生成 → chapter:generate IPC → chapterGenerationService.generateChapter()
  → 构建上下文（需求/评分/必答项/文风/相邻章节/策略种子）
  → agentOrchestrator.execute({ agentType: 'generate', context: {...} })
    → task-queue 调度执行：
      1. generate-agent handler 构建 prompt
      2. aiProxy.call() 发送到 AI
      3. [新增] terminologyPostProcessor 后处理：替换术语 + 创建批注
      4. 返回 AgentExecuteResult
  → 返回 { taskId }
用户通过 task 状态轮询获取结果
```

**集成点 1**（prompt 注入）：在 `generate-agent.ts` 的 `handleChapterGeneration()` 中，构建 `GenerateChapterContext` 时新增 `terminologyContext` 字段。需要同步修改 `generate-chapter.prompt.ts` 的接口和模板。

**集成点 2**（后处理器）：在 `orchestrator.ts` 的 `createExecutor()` 中，AI 响应后调用注册的 `postProcessor`。`terminology-post-processor.ts` 负责文本替换和批注创建。

**集成点 3**（批注锚点）：术语批注必须把 `context.target` 转成 `createChapterLocatorKey(locator)` 写入 `sectionId`，这样 `AnnotationPanel` 的分章节过滤与当前章节定位才能命中；单纯写章节标题会导致当前 UI 无法按章节看到这些批注。
同时，`annotationService.create()` 所需的 `projectId` 直接来自 `chapterGenerationService` 传入 orchestrator context 的 `projectId`，不要在 post-processor 中自行推导。

### 现有代码模式参考

| 层 | 参考文件 | 关键模式 |
|---|---|---|
| Migration | `src/main/db/migrations/012_create_assets_and_tags.ts` | Kysely schema builder + 索引创建 |
| Repository | `src/main/db/repositories/asset-repo.ts` | `getDb()` + Kysely 查询 + 类型映射 |
| Repository (去重) | `src/main/db/repositories/tag-repo.ts` | `normalizedName` 唯一约束 + `findOrCreateMany()` |
| Service | `src/main/services/asset-service.ts` | `createLogger()` + repo 组合 + 归一化 |
| IPC handler | `src/main/ipc/asset-handlers.ts` | `createIpcHandler()` + channel map + 类型约束 |
| IPC 注册 | `src/main/ipc/index.ts` | handler 注册调用点 |
| Preload | `src/preload/index.ts` | `typedInvoke()` + camelCase 方法名 |
| Store | `src/renderer/src/stores/assetStore.ts` | Zustand + `loading: boolean` + async Action |
| 页面组件 | `src/renderer/src/modules/asset/components/AssetSearchPage.tsx` | 搜索 + 过滤 + 列表 |
| Agent handler | `src/main/services/agent-orchestrator/agents/generate-agent.ts` | 多模式分支 + prompt 构建 |
| Orchestrator | `src/main/services/agent-orchestrator/orchestrator.ts` | `registerAgent()` + `createExecutor()` |
| Chapter service | `src/main/services/chapter-generation-service.ts` | 上下文构建 + orchestrator dispatch |
| Prompt 模板 | `src/main/prompts/generate-chapter.prompt.ts` | `GenerateChapterContext` 接口 + 模板函数 |
| Annotation 创建 | `src/main/services/annotation-service.ts` | `create(input: CreateAnnotationInput)` |
| Annotation 类型 | `src/shared/annotation-types.ts` | `AnnotationType` / `CreateAnnotationInput` |
| Section Key | `src/shared/chapter-locator-key.ts` | `createChapterLocatorKey(locator)` 生成稳定章节锚点 |

### 防回归注意事项

- 新增 6 个 IPC 频道必须同时更新：`ipc-types.ts`、`terminology-handlers.ts`、`ipc/index.ts`、`preload/index.ts` + `index.d.ts`、`security.test.ts`
- 新增迁移时必须同时更新：`schema.ts`、迁移文件、`migrator.ts`、`tests/unit/main/db/migrations.test.ts`
- `orchestrator.ts` 的 `registerAgent()` 签名扩展必须**向后兼容**（`postProcessor` 为可选参数），不影响已有 agent 的注册
- `generate-chapter.prompt.ts` 的 `GenerateChapterContext` 新增 `terminologyContext?` 为可选字段，确保无术语时 prompt 输出与当前完全一致
- 不要修改 `asset-handlers.ts`、`assetStore.ts`、`AssetSearchPage` 等已有资产代码
- 术语替换的占位符必须使用 Unicode Private Use Area（`\uE000-\uF8FF`），避免与正常文本冲突
- `terminologyService.getActiveEntries()` 的缓存在任何 CRUD 操作后必须清除，否则章节生成会使用过期术语列表
- 批注的 `sectionId` 必须使用 `createChapterLocatorKey(locator)` 生成的 stable key；**不要**只写章节标题
- 术语批注创建必须沿用生成上下文中的 `projectId`；不要在 post-processor 中额外查 project 或硬编码
- CSV 解析需处理 BOM、不同换行符（`\r\n` / `\n`）、引号包裹的字段
- 当前 `tests/unit/main/db/migrations.test.ts` 基线尚未覆盖 `014_create_adversarial_reviews`；5.3 落地时需顺手把基线修正后再加 015，避免把既有遗漏继续带进新 story

### 范围声明

**本故事范围内：**
- `terminology_entries` 数据模型与完整 CRUD
- 术语库管理界面（搜索/过滤/添加/编辑/删除/批量导入/导出）
- 术语替换引擎（正则 + 占位符保护）
- AI 章节生成的术语 prompt 注入 + 后处理替换 + 批注创建
- 资产模块导航集成（`资产库` | `术语库` 切换）
- JSON 导出功能（Git 同步就绪）

**本故事范围外（明确排除）：**
- Git 同步机制实现（Story 9-3）
- 编辑器内联术语查找/高亮（可作为后续增强）
- 术语冲突可视化解决界面（Story 9-3 Git 冲突解决）
- Aho-Corasick 或高级分词匹配引擎（Beta 优化）
- 个性化术语推荐排序（V1.0）
- 对抗评审中的术语检查（Story 7.x）
- 文风模板中的术语规则整合（已有文风系统独立运作）

### Project Structure Notes

**新增文件：**
- `src/shared/terminology-types.ts`
- `src/main/db/migrations/015_create_terminology_entries.ts`
- `src/main/db/repositories/terminology-repo.ts`
- `src/main/services/terminology-service.ts`
- `src/main/services/terminology-replacement-service.ts`
- `src/main/ipc/terminology-handlers.ts`
- `src/main/services/agent-orchestrator/post-processors/terminology-post-processor.ts`
- `src/renderer/src/stores/terminologyStore.ts`
- `src/renderer/src/modules/asset/components/AssetModuleContainer.tsx`
- `src/renderer/src/modules/asset/components/TerminologyPage.tsx`
- `src/renderer/src/modules/asset/components/TerminologyEntryForm.tsx`
- `src/renderer/src/modules/asset/components/TerminologyImportDialog.tsx`
- `tests/unit/main/db/repositories/terminology-repo.test.ts`
- `tests/unit/main/services/terminology-service.test.ts`
- `tests/unit/main/services/terminology-replacement-service.test.ts`
- `tests/unit/main/ipc/terminology-handlers.test.ts`
- `tests/unit/renderer/stores/terminologyStore.test.ts`
- `tests/unit/renderer/modules/asset/components/TerminologyPage.test.tsx`
- `tests/unit/renderer/modules/asset/components/TerminologyEntryForm.test.tsx`
- `tests/unit/renderer/modules/asset/components/TerminologyImportDialog.test.tsx`
- `tests/unit/main/services/agent-orchestrator/terminology-post-processor.test.ts`
- `tests/e2e/stories/story-5-3-terminology-library.spec.ts`

**修改文件：**
- `src/main/db/schema.ts` — 新增 `TerminologyEntriesTable` + DB 接口
- `src/main/db/migrator.ts` — 注册 `015_create_terminology_entries`
- `src/shared/ipc-types.ts` — 新增 6 个 `terminology:*` 频道
- `src/main/ipc/index.ts` — 注册 `registerTerminologyHandlers()`
- `src/preload/index.ts` + `index.d.ts` — 暴露 6 个术语 API
- `src/renderer/src/stores/index.ts` — 导出 `useTerminologyStore`
- `src/main/services/agent-orchestrator/orchestrator.ts` — `registerAgent()` 新增可选 `postProcessor` 参数
- `src/main/services/agent-orchestrator/index.ts` — 注册 generate agent 时传入 `terminologyPostProcessor`
- `src/main/services/agent-orchestrator/agents/generate-agent.ts` — `handleChapterGeneration()` 注入术语上下文
- `src/main/prompts/generate-chapter.prompt.ts` — `GenerateChapterContext` 新增 `terminologyContext?` + prompt 模板更新
- `src/renderer/src/App.tsx` — `/asset` 路由改为 `AssetModuleContainer`
- `src/renderer/src/modules/asset/index.ts` — 导出 `AssetModuleContainer` / `TerminologyPage`
- 资产模块入口/容器组件 — 新增 `资产库 | 术语库` Segmented 切换
- `tests/unit/main/db/migrations.test.ts` — 迁移链扩展到 015 并修正当前基线
- `tests/unit/main/services/agent-orchestrator/agents/generate-agent.test.ts` — 术语 prompt 注入回归
- `tests/unit/main/prompts/generate-chapter.prompt.test.ts` — `terminologyContext` 模板回归
- `tests/unit/main/services/agent-orchestrator/orchestrator.test.ts` — postProcessor 透传回归
- `tests/unit/preload/security.test.ts` — 新增 6 个 API 白名单

### 禁止事项

- **禁止**在 `company-data/` 下创建 SQLite 数据库文件
- **禁止**修改 orchestrator 的已有 agent 注册行为（postProcessor 必须可选）
- **禁止**在术语替换中修改 Markdown 结构标记（如 `#`、`**`、`- `）
- **禁止**让术语替换阻塞编辑器交互（替换在 main process 异步执行）
- **禁止**将术语 CRUD 操作放入 task-queue（CRUD 是同步快速操作，不属于白名单）
- **禁止**修改已有的 `asset:*` IPC 频道或 `assetStore` 行为
- **禁止**在替换引擎中引入外部 NLP/分词依赖（Alpha 用正则足够）

### Suggested Verification

1. `pnpm test:unit -- tests/unit/main/db/repositories/terminology-repo.test.ts tests/unit/main/services/terminology-service.test.ts tests/unit/main/services/terminology-replacement-service.test.ts tests/unit/main/ipc/terminology-handlers.test.ts tests/unit/preload/security.test.ts tests/unit/renderer/stores/terminologyStore.test.ts tests/unit/renderer/modules/asset/components/TerminologyPage.test.tsx tests/unit/renderer/modules/asset/components/TerminologyEntryForm.test.tsx tests/unit/renderer/modules/asset/components/TerminologyImportDialog.test.tsx tests/unit/main/services/agent-orchestrator/terminology-post-processor.test.ts`
2. `pnpm test:unit -- tests/unit/main/db/migrations.test.ts tests/unit/main/services/agent-orchestrator/orchestrator.test.ts tests/unit/main/services/agent-orchestrator/agents/generate-agent.test.ts tests/unit/main/prompts/generate-chapter.prompt.test.ts`
3. `pnpm typecheck:node && pnpm typecheck:web`
4. `BIDWISE_E2E_AI_MOCK=true BIDWISE_E2E_AI_MOCK_DELAY_MS=100 pnpm test:e2e:prepare && playwright test tests/e2e/stories/story-5-3-terminology-library.spec.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5 Story 5.3, FR35]
- [Source: _bmad-output/planning-artifacts/prd.md — FR35 术语库维护与自动应用, FR8 公司级/项目级数据分层, FR61 Git 同步, NFR9 数据本地存储, NFR24 Git 同步冲突率]
- [Source: _bmad-output/planning-artifacts/architecture.md — company-data/terminology/ 目录结构, Zustand store 模式, IPC 频道命名, agent-orchestrator 调度, Beta 阶段 asset 模块, 经验知识图谱 6 类经验（术语修正）]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — 行业术语替换无摩擦交互, 批注五色编码 ai-suggestion 蓝 #1677FF, AI 生成阶段进度, 原则 6 越用越聪明, 张总旅程 4 经验传承]
- [Source: _bmad-output/implementation-artifacts/5-2-asset-recommendation-one-click-import.md — 前置 Story IPC/Store/测试模式]
- [Source: src/shared/constants.ts — 统一错误码枚举（含 `DUPLICATE`）]
- [Source: src/main/ipc/create-handler.ts — renderer 可见错误码 / message 合同]
- [Source: src/shared/chapter-locator-key.ts — 章节 stable key 生成规则]
- [Source: src/renderer/src/modules/annotation/lib/annotationSectionScope.ts — 批注 sectionId 过滤规则]
- [Source: src/renderer/src/App.tsx — `/asset` 现有路由入口]
- [Source: src/main/db/schema.ts — DB 接口定义, 当前所有表]
- [Source: src/main/db/migrator.ts — 当前手写 migration 注册链]
- [Source: src/main/services/chapter-generation-service.ts — 章节生成上下文构建, orchestrator.execute() 调用]
- [Source: src/main/services/agent-orchestrator/orchestrator.ts — registerAgent/createExecutor 模式]
- [Source: src/main/services/agent-orchestrator/agents/generate-agent.ts — handleChapterGeneration prompt 构建]
- [Source: src/main/ipc/chapter-handlers.ts — chapter IPC 频道注册模式]
- [Source: src/shared/annotation-types.ts — AnnotationType/CreateAnnotationInput 接口]
- [Source: src/main/services/annotation-service.ts — annotation create() 方法]

## Change Log

- 2026-04-12: 实现完成，9 个 Task 共 42 个子任务全部完成。219/219 测试文件通过，1957/1957 测试用例零回归。新增 22 个文件，修改 18 个文件。
- 2026-04-12: 按 `validate-create-story` 工作流回写 implementation-ready 修正：补齐 migration 注册/测试链、将 duplicate 错误合同对齐到现有 `ErrorCode.DUPLICATE`、将术语批注锚点改为 `createChapterLocatorKey(locator)`、把 JSON 导出拆分为”构建导出数据 + save dialog 写文件”两层、明确 `/asset` 路由使用 `AssetModuleContainer` 集成术语库、补充 orchestrator / generate-agent / prompt / migration 回归测试要求。术语批注保持默认 `pending` 状态以保证侧边栏可见性（与 AC3 一致）。

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Migration test baseline fixed: added missing 014_create_adversarial_reviews + new 015_create_terminology_entries
- terminologyService cache invalidation requires explicit clearing between tests (module-scoped state)

### Completion Notes List

- Task 1: 创建 `terminology-types.ts` 类型定义、`TerminologyEntriesTable` schema、015 迁移、迁移注册、迁移测试基线修正
- Task 2: `TerminologyRepository` 实现 CRUD + list/findActive/count，isActive number↔boolean 转换在 repo 层完成
- Task 3: `terminologyService` 实现归一化、去重检查、批量导入、缓存管理、导出 JSON（含 save dialog）
- Task 4: `terminologyReplacementService` 实现占位符保护的正则替换引擎 + prompt 上下文生成
- Task 5: 6 个 `terminology:*` IPC 频道、handler、preload 暴露、类型安全编译通过
- Task 6: `terminologyStore` Zustand 状态管理，搜索/过滤/CRUD/导出 actions
- Task 7: `TerminologyPage` 表格+搜索+过滤+CRUD UI、`TerminologyEntryForm` 模态框、`TerminologyImportDialog` CSV 导入、`AssetModuleContainer` 切换容器
- Task 8: orchestrator `registerAgent()` 扩展可选 `postProcessor`、`terminologyPostProcessor` 术语替换+批注创建、generate-agent prompt 注入 `terminologyContext`
- Task 9: 219/219 测试文件通过，1957/1957 测试用例通过，零回归

### File List

**新增文件：**
- src/shared/terminology-types.ts
- src/main/db/migrations/015_create_terminology_entries.ts
- src/main/db/repositories/terminology-repo.ts
- src/main/services/terminology-service.ts
- src/main/services/terminology-replacement-service.ts
- src/main/ipc/terminology-handlers.ts
- src/main/services/agent-orchestrator/post-processors/terminology-post-processor.ts
- src/renderer/src/stores/terminologyStore.ts
- src/renderer/src/modules/asset/components/AssetModuleContainer.tsx
- src/renderer/src/modules/asset/components/TerminologyPage.tsx
- src/renderer/src/modules/asset/components/TerminologyEntryForm.tsx
- src/renderer/src/modules/asset/components/TerminologyImportDialog.tsx
- tests/unit/main/db/repositories/terminology-repo.test.ts
- tests/unit/main/services/terminology-service.test.ts
- tests/unit/main/services/terminology-replacement-service.test.ts
- tests/unit/main/ipc/terminology-handlers.test.ts
- tests/unit/renderer/stores/terminologyStore.test.ts
- tests/unit/renderer/modules/asset/components/TerminologyPage.test.tsx
- tests/unit/renderer/modules/asset/components/TerminologyEntryForm.test.tsx
- tests/unit/renderer/modules/asset/components/TerminologyImportDialog.test.tsx
- tests/unit/main/services/agent-orchestrator/terminology-post-processor.test.ts
- tests/e2e/stories/story-5-3-terminology-library.spec.ts

**修改文件：**
- src/main/db/schema.ts — 新增 TerminologyEntriesTable + DB 接口
- src/main/db/migrator.ts — 注册 015_create_terminology_entries
- src/shared/ipc-types.ts — 新增 6 个 terminology:* 频道
- src/main/ipc/index.ts — 注册 registerTerminologyHandlers()
- src/preload/index.ts — 暴露 6 个术语 API
- src/renderer/src/stores/index.ts — 导出 useTerminologyStore
- src/main/services/agent-orchestrator/orchestrator.ts — registerAgent() 新增可选 postProcessor
- src/main/services/agent-orchestrator/index.ts — 注册 generate agent 时传入 terminologyPostProcessor
- src/main/services/agent-orchestrator/agents/generate-agent.ts — handleChapterGeneration() 注入术语上下文
- src/main/prompts/generate-chapter.prompt.ts — GenerateChapterContext 新增 terminologyContext + 模板更新
- src/renderer/src/App.tsx — /asset 路由改为 AssetModuleContainer
- src/renderer/src/modules/asset/index.ts — 导出新组件
- tests/unit/main/db/migrations.test.ts — 迁移链扩展到 015 并修正 014 基线
- tests/unit/main/services/agent-orchestrator/agents/generate-agent.test.ts — 术语 prompt 注入回归
- tests/unit/main/prompts/generate-chapter.prompt.test.ts — terminologyContext 模板回归
- tests/unit/main/services/agent-orchestrator/orchestrator.test.ts — postProcessor 透传回归
- tests/unit/preload/security.test.ts — 新增 6 个 API 白名单
- _bmad-output/implementation-artifacts/sprint-status.yaml — 状态更新
