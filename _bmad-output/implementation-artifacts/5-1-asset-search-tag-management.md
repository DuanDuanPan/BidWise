# Story 5.1: 资产库检索与标签管理

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 通过标签和关键词快速检索资产库中的文字片段、架构图、表格和案例,
So that 我能快速找到可复用的历史素材，不用从零写起。

## Acceptance Criteria

1. **AC1 — 关键词 + 标签混合搜索**
   Given 资产库已有内容
   When 用户在搜索框输入关键词与 `#标签` 混合查询（如 `微服务 #架构图`）
   Then 搜索请求以 300ms 防抖触发，搜索框在请求进行中显示 loading，结果区显示 `找到 N 个资产`，并以卡片列表展示标题、摘要、标签、匹配度和来源项目（FR31）

2. **AC2 — 资产类型筛选**
   Given 搜索页已打开
   When 用户使用类型筛选栏
   Then 页面提供 `全部` 重置项和 `文字片段 / 架构图 / 表格 / 案例` 四类多选筛选；切换筛选时保留当前查询词并立即刷新结果

3. **AC3 — 同页标签修正持久化**
   Given 用户打开某条资产的详情态
   When 用户以内联方式新增或删除标签
   Then 标签修改立即持久化，后续搜索与筛选按新标签生效，且页面仍停留在同一 `/asset` 路由上（FR34）

4. **AC4 — 空状态引导**
   Given 当前查询与筛选组合没有命中任何资产
   When 页面渲染结果区
   Then 显示居中的空状态与文案 `未找到匹配资产。尝试：调整关键词 / 减少筛选条件 / 浏览全部资产`

5. **AC5 — Alpha 阶段性能边界**
   Given 资产库规模达到 2000+ 片段
   When 用户执行关键词 / 标签 / 类型组合检索
   Then 主进程检索链路在常见查询下应于 3 秒内返回结果，且该检索为同步本地查询，不引入 task-queue（NFR4, NFR29）

## Tasks / Subtasks

### Task 1: 数据模型、迁移与迁移链注册 (AC: #1, #2, #3, #5)

- [ ] 1.1 在 `src/main/db/schema.ts` 新增 `AssetsTable`、`TagsTable`、`AssetTagsTable`
  - `assets` 表字段：
    - `id` TEXT PK
    - `projectId` TEXT nullable
    - `title` TEXT NOT NULL
    - `summary` TEXT NOT NULL DEFAULT `''`
    - `content` TEXT NOT NULL
    - `assetType` TEXT NOT NULL，限定为 `'text' | 'diagram' | 'table' | 'case'`
    - `sourceProject` TEXT nullable
    - `sourceSection` TEXT nullable
    - `createdAt` TEXT NOT NULL
    - `updatedAt` TEXT NOT NULL
  - `tags` 表字段：
    - `id` TEXT PK
    - `name` TEXT NOT NULL
    - `normalizedName` TEXT NOT NULL UNIQUE
    - `createdAt` TEXT NOT NULL
  - `asset_tags` 表字段：
    - `assetId` TEXT NOT NULL FK → `assets.id`
    - `tagId` TEXT NOT NULL FK → `tags.id`
    - 复合主键 `(assetId, tagId)`
  - 在 `DB` 接口中注册 3 张新表
- [ ] 1.2 创建迁移文件 `src/main/db/migrations/012_create_assets_and_tags.ts`
  - 建立 `assets`、`tags`、`asset_tags` 三张表
  - 为 `assets.asset_type`、`assets.updated_at`、`assets.project_id`、`asset_tags.asset_id`、`asset_tags.tag_id` 建索引
  - 建立外部内容 FTS5 虚拟表 `assets_fts`，索引列为 `title / summary / content`
  - `assets_fts` 使用 `tokenize='trigram'`，不要继续沿用 `unicode61`
  - 为 `assets` 的 insert / update / delete 建触发器，保持 `assets_fts` 同步
  - 迁移中允许通过 Kysely `sql` 执行 FTS5 虚拟表与触发器 DDL；除此之外不要在业务代码中散落字符串 raw SQL
- [ ] 1.3 更新 `src/main/db/migrator.ts`
  - 注册 `012_create_assets_and_tags`
  - 保持与现有 001-011 手工 migration map 一致的维护方式
- [ ] 1.4 更新 `tests/unit/main/db/migrations.test.ts`
  - 迁移链数量从当前基线扩展到包含 012
  - 新增断言：`assets`、`tags`、`asset_tags`、`assets_fts`、相关索引与触发器均创建成功

### Task 2: 共享类型与 Repository 设计 (AC: #1, #2, #3, #5)

- [ ] 2.1 创建 `src/shared/asset-types.ts`
  - 导出 `AssetType`、`Asset`、`Tag`、`AssetDetail`
  - 导出 `AssetSearchQuery = { rawQuery: string; assetTypes: AssetType[] }`
  - 导出 `AssetListFilter = { assetTypes?: AssetType[] }`
  - 导出 `AssetSearchResult`
    - 包含 `id / title / summary / assetType / sourceProject / tags / matchScore`
    - `matchScore` 为 UI 展示用整数百分比 `0-100`，不是直接暴露 FTS 原始 rank
  - 导出 `AssetQueryResult = { items: AssetSearchResult[]; total: number }`
  - 导出 `UpdateAssetTagsInput = { assetId: string; tagNames: string[] }`
  - 导出 `ASSET_TYPES` 与 `ASSET_TYPE_LABELS`
- [ ] 2.2 创建 `src/main/db/repositories/asset-repo.ts`
  - `search(input: { keyword: string; tagNames: string[]; assetTypes: AssetType[] }): Promise<{ items: Asset[]; total: number; rawRanks: Record<string, number> }>`
  - `list(filter?: AssetListFilter): Promise<{ items: Asset[]; total: number }>`
  - `findById(id: string): Promise<Asset | null>`
  - `findTagsByAssetId(assetId: string): Promise<Tag[]>`
  - 约束：
    - 关键词非空时使用 `assets_fts` 检索，并以 `bm25(assets_fts)` 排序
    - 关键词长度不足 3 个字符、或解析后不适合走 `MATCH` 时，回退到 `LIKE` / `instr` 查询，保证中文短词和特殊字符查询可用
    - 纯标签 / 纯类型筛选不走 FTS，直接查基础表并按 `updatedAt DESC` 排序
    - 多个标签按 AND 语义过滤；多个资产类型按 OR 语义过滤
    - 继续遵循现有 Repository 模式：`getDb()`、路径别名、`BidWiseError` 体系、禁止手工 snake_case ↔ camelCase 映射
- [ ] 2.3 创建 `src/main/db/repositories/tag-repo.ts`
  - `findOrCreateMany(tagNames: string[]): Promise<Tag[]>`
  - `findByAssetId(assetId: string): Promise<Tag[]>`
  - `replaceAssetTags(assetId: string, tagIds: string[]): Promise<void>`
  - `deleteOrphanedTags(): Promise<void>`，供标签替换后清理无引用标签
  - 只负责标签查找、创建和映射维护；**不要**在 Story 5.1 内扩展全局 tag rename / delete 管理界面
- [ ] 2.4 明确 5.1 范围边界
  - `asset:create` / `asset:update` / `asset:delete` 不属于 Story 5.1 的 implementation scope，后续由 Story 5.2 / 5.4 处理
  - 本故事只实现搜索、默认列表、详情读取、标签集替换四条主路径

### Task 3: 主进程服务与 IPC / preload 暴露 (AC: #1, #2, #3, #5)

- [ ] 3.1 创建 `src/main/services/asset-service.ts`
  - `search(query: AssetSearchQuery): Promise<AssetQueryResult>`
  - `list(filter?: AssetListFilter): Promise<AssetQueryResult>`
  - `getById(id: string): Promise<AssetDetail>`
  - `updateTags(input: UpdateAssetTagsInput): Promise<Tag[]>`
  - 服务职责：
    - 解析 `rawQuery` 中的 `#标签` / `＃标签`
    - 统一做标签名 trim、去重、空值过滤；英文标签比较时使用 lower-case 归一化，显示仍保留用户输入的首个有效大小写
    - 通过 repo 产出的原始 rank 计算 UI 用 `matchScore`
      - 关键词检索时将当前结果集 rank 归一化为稳定的百分比区间
      - 纯标签 / 纯类型 / 默认列表时返回 `matchScore = 100`
    - 使用 `createLogger('asset-service')`
- [ ] 3.2 创建 `src/main/ipc/asset-handlers.ts`
  - 注册 4 个频道：
    - `asset:search`
    - `asset:list`
    - `asset:get`
    - `asset:update-tags`
  - 使用 `createIpcHandler()`，handler 仅做参数透传
- [ ] 3.3 更新 `src/main/ipc/index.ts`
  - 注册 `registerAssetHandlers()`
  - 将 `RegisteredAssetChannels` 纳入 compile-time exhaustive check
- [ ] 3.4 更新 `src/shared/ipc-types.ts`
  - `IPC_CHANNELS` 新增：
    - `ASSET_SEARCH: 'asset:search'`
    - `ASSET_LIST: 'asset:list'`
    - `ASSET_GET: 'asset:get'`
    - `ASSET_UPDATE_TAGS: 'asset:update-tags'`
  - `IpcChannelMap` 新增对应 input / output
  - 频道 action 统一使用 kebab-case；不要写成 `asset:updateTags`
- [ ] 3.5 更新 `src/preload/index.ts` 与 `src/preload/index.d.ts`
  - 暴露 `window.api.assetSearch()`
  - 暴露 `window.api.assetList()`
  - 暴露 `window.api.assetGet()`
  - 暴露 `window.api.assetUpdateTags()`
- [ ] 3.6 更新 `tests/unit/preload/security.test.ts`
  - 将新增 4 个 asset API 纳入 preload 白名单断言

### Task 4: Renderer Store 与 300ms 搜索 Hook (AC: #1, #2, #3, #4)

- [ ] 4.1 创建 `src/renderer/src/stores/assetStore.ts`
  - State：
    - `rawQuery`
    - `assetTypes`
    - `results`
    - `total`
    - `loading`
    - `error`
    - `selectedAssetId`
    - `selectedAsset`
  - Actions：
    - `loadInitialAssets(): Promise<void>` — 首次进入页面时调用 `window.api.assetList()`
    - `search(rawQuery?: string): Promise<void>` — 使用当前筛选条件调用 `window.api.assetSearch()`
    - `toggleAssetType(type: AssetType): void`
    - `resetAssetTypes(): void` — 对应 `全部`
    - `selectAsset(id: string | null): Promise<void>`
    - `updateAssetTags(input: UpdateAssetTagsInput): Promise<void>`
    - `clearError(): void`
  - 约束：
    - 保持 `loading: boolean` 命名
    - 该 store 是全局公司级状态，不做 per-project state 包装
    - 任何新的搜索或筛选动作都必须清空 `selectedAssetId`，恢复结果列表态
- [ ] 4.2 在 `src/renderer/src/stores/index.ts` 中导出 `useAssetStore`
- [ ] 4.3 创建 `src/renderer/src/modules/asset/hooks/useAssetSearch.ts`
  - 用 `setTimeout` / `clearTimeout` 实现 300ms 请求防抖
  - 如需 `useDeferredValue`，仅用于输入渲染平滑，**不能**替代 300ms 的实际 IPC 防抖
  - Hook 接管 query 变化、类型筛选变化与搜索触发

### Task 5: 资产搜索页 UI 与原型对齐 (AC: #1, #2, #3, #4)

- [ ] 5.1 创建 `src/renderer/src/modules/asset/components/AssetSearchPage.tsx`
  - 对齐 story 级 UX 原型的 3 个状态：结果页 / 标签编辑详情 / 空状态
  - 页面包含：
    - Header：`资产库` + 描述文案
    - Search Bar：`Input.Search`
    - Results state：类型筛选栏 + 结果数量 + 卡片列表
    - Detail state：搜索框 + 单条扩展卡片
  - 路由为独立页面 `/asset`，不是 `ProjectWorkspace` 内的新 SOP 阶段
- [ ] 5.2 创建 `src/renderer/src/modules/asset/components/AssetResultList.tsx`
  - 渲染 `找到 N 个资产`
  - 结果区采用桌面 3 列卡片网格，与参考 PNG 保持一致
  - 结果为空时渲染 Ant Design `Empty` 与 AC4 文案
- [ ] 5.3 创建 `src/renderer/src/modules/asset/components/AssetResultCard.tsx`
  - 展示标题、摘要、标签、匹配度、来源项目
  - 摘要截断 2 行
  - 卡片 hover / selected 视觉与原型一致：默认灰边，选中态蓝色边框
  - 点击卡片进入详情态
- [ ] 5.4 创建 `src/renderer/src/modules/asset/components/AssetDetailCard.tsx`
  - 同页展开显示标题、类型标签、匹配度、来源项目、正文内容、标签编辑区
  - 不要做 modal；保留在同一路由和同一页组件内切换状态
- [ ] 5.5 创建 `src/renderer/src/modules/asset/components/TagEditor.tsx`
  - 展示当前标签，支持新增 / 删除
  - 提示文案与原型一致：`按 Enter 添加标签，点击 × 删除标签`
  - 修改成功后刷新详情态与当前结果列表标签
- [ ] 5.6 结果页交互细节
  - 类型筛选栏文案为 `资产类型：`
  - `全部` 为重置态，不与具体类型同时保持选中
  - 搜索请求进行中时，在搜索框显示 loading，而不是整页阻塞 Spin

### Task 6: 路由与命令面板集成 (AC: #1)

- [ ] 6.1 创建 `src/renderer/src/modules/asset/index.ts`
  - 统一导出页面、组件与 hook
- [ ] 6.2 更新 `src/renderer/src/App.tsx`
  - 新增 `<Route path="/asset" element={<AssetSearchPage />} />`
- [ ] 6.3 更新 `src/renderer/src/shared/command-palette/default-commands.tsx`
  - 将 `command-palette:search-assets` 从 disabled 占位命令改为真实导航：`navigate('/asset')`
  - 移除当前错误的 `需要 Epic 6` badge / Toast 文案
  - 该入口是 Story 5.1 的首个导航入口
- [ ] 6.4 范围声明
  - Story 5.1 **不**修改 `SOP_STAGES`
  - Story 5.1 **不**把资产页嵌入 `ProjectWorkspace` 三栏中心区域
  - Story 5.1 **不**实现资产推荐侧栏；那是 Story 5.2 的范围

### Task 7: 测试矩阵与落点修正 (AC: #1, #2, #3, #4, #5)

- [ ] 7.1 更新 `tests/unit/main/db/migrations.test.ts`
  - 覆盖 012 迁移链
  - 断言 `assets_fts` 与触发器存在
- [ ] 7.2 新建 `tests/unit/main/db/repositories/asset-repo.test.ts`
  - 覆盖：
    - 中文关键词检索
    - `#标签` 解析后的标签 AND 过滤
    - 类型筛选
    - 短关键词 fallback
    - 默认列表排序
- [ ] 7.3 新建 `tests/unit/main/services/asset-service.test.ts`
  - 覆盖：
    - `rawQuery` 解析
    - `#` / `＃` 标签兼容
    - 标签名归一化与去重
    - `matchScore` 归一化逻辑
    - `updateTags()` 持久化后再查可见
- [ ] 7.4 新建 `tests/unit/main/ipc/asset-handlers.test.ts`
  - 覆盖 4 个 channel 注册、透传与错误包装
- [ ] 7.5 更新 `tests/unit/preload/security.test.ts`
  - 覆盖新增 asset preload API
- [ ] 7.6 新建 `tests/unit/renderer/stores/assetStore.test.ts`
  - 覆盖初始加载、搜索、筛选、详情加载、标签修改后的状态刷新、错误状态
- [ ] 7.7 新建 renderer 组件测试
  - `tests/unit/renderer/modules/asset/components/AssetSearchPage.test.tsx`
  - `tests/unit/renderer/modules/asset/components/TagEditor.test.tsx`
  - 重点验证：结果态 / 空态 / 详情态切换、`全部` 筛选行为、300ms debounce 触发
- [ ] 7.8 更新 `tests/e2e/stories/story-1-9-command-palette.spec.ts`
  - 资产搜索命令从 disabled 占位改为可导航到 `/asset`
- [ ] 7.9 新建 `tests/e2e/stories/story-5-1-asset-search-tag-management.spec.ts`
  - 使用现有 E2E 模式直接向 `userData/data/db/bidwise.sqlite` 种入资产、标签和映射数据
  - 覆盖：
    - 中文关键词 + `#标签` 搜索
    - `全部` / 多选类型筛选
    - 空状态
    - 点击卡片进入详情态
    - 标签新增 / 删除后重新搜索可命中

## Dev Notes

### 架构要点

- **Alpha 阶段的数据落点**：Story 5.1 直接复用现有应用主 SQLite：`app.getPath('userData')/data/db/bidwise.sqlite`。**不要**在本故事再发明第二个 `company-data/*.sqlite`。
- **公司级同步边界**：Epic 9 Story 9.3 才负责把公司级数据与 Git 同步；5.1 只实现本地共享元数据检索与标签修正，不做 Git、文件同步或冲突解决。
- **检索执行方式**：本故事的检索是主进程同步本地查询，不属于 task-queue 白名单操作。未来语义检索（Graphiti / Kuzu）再进入异步队列。
- **路由边界**：当前应用只有 `/` 与 `/project/:id` 两条真实路由；5.1 必须显式新增 `/asset`。不要写成“集成到 SOP 侧边栏或其他入口二选一”的模糊指令。

### 搜索与标签规则

- 搜索框支持关键词与 `#标签` 混合输入：
  - `微服务架构` → 关键词检索
  - `#架构图 #案例` → 标签 AND 过滤
  - `微服务 #架构图` → 关键词 + 标签组合
- 标签解析接受半角 `#` 与全角 `＃`
- 标签名归一化规则：
  - trim 首尾空白
  - 折叠中间连续空白为单个空格
  - 英文部分比较使用 lower-case
  - 展示名称保留用户第一次输入的有效形式
- 资产类型筛选与标签搜索是两套独立条件：
  - 标签来自搜索框内的 `#标签`
  - 类型来自下方筛选栏

### SQLite FTS5 方案

```sql
CREATE VIRTUAL TABLE assets_fts USING fts5(
  title,
  summary,
  content,
  content='assets',
  content_rowid='rowid',
  tokenize='trigram'
);
```

- 当前仓库的 `better-sqlite3@12.8.0` 本地已验证为 SQLite `3.51.3`，支持 FTS5 `trigram` tokenizer
- 不再使用 `unicode61`；`unicode61` 对中文连续文本的检索体验不足，和 AC 示例 `微服务` 不匹配
- `bm25(assets_fts)` 只作为内部排序依据；渲染层看到的 `matchScore` 必须是服务层计算后的百分比整数

### Kysely 与 raw SQL 例外说明

- 架构规则要求数据库操作走 Kysely；本故事允许的例外只有：
  - migration 中创建 FTS5 virtual table / trigger
  - repository 中通过 Kysely `sql` 嵌入 `MATCH` / `bm25()`
- 除上述两类场景外，不要散落字符串拼接 raw SQL

### 现有代码模式参考

| 层 | 参考文件 | 关键模式 |
|---|---|---|
| Repository | `src/main/db/repositories/annotation-repo.ts` | `getDb()`、错误包装、Kysely 查询写法 |
| Service | `src/main/services/annotation-service.ts` | `createLogger()`、轻服务 + repo 组合 |
| IPC Handler | `src/main/ipc/annotation-handlers.ts` | `createIpcHandler()` + channel map |
| IPC 注册 | `src/main/ipc/index.ts` | compile-time exhaustive check |
| Preload | `src/preload/index.ts` | `typedInvoke()` + 派生 camelCase 方法名 |
| Store | `src/renderer/src/stores/annotationStore.ts` | Zustand + `subscribeWithSelector` |
| Route | `src/renderer/src/App.tsx` | `HashRouter` + 顶层 `Routes` |
| 命令面板 | `src/renderer/src/shared/command-palette/default-commands.tsx` | 默认命令注册与导航入口 |
| Company-data 路径模式 | `src/main/services/template-service.ts`、`src/main/services/writing-style-service.ts`、`src/main/services/source-attribution-service.ts` | `app.getAppPath()` / `app.getPath('userData')` 双候选查找 |

### 防回归注意事项

- 新增 IPC 频道必须同时更新：
  - `src/shared/ipc-types.ts`
  - `src/main/ipc/asset-handlers.ts`
  - `src/main/ipc/index.ts`
  - `src/preload/index.ts`
  - `tests/unit/preload/security.test.ts`
- `src/main/db/migrator.ts` 当前采用手工 map，不会自动发现 `012_*`
- `asset:update-tags` 必须保持 kebab-case，不能写成 camelCase channel
- `useDeferredValue` 不是时间防抖；不能单独拿来满足 300ms AC
- Story 5.1 不要顺手实现 asset CRUD、批量导入、语义推荐或 Git sync

### Project Structure Notes

- Renderer 资产模块目录：`src/renderer/src/modules/asset/`
- Store：`src/renderer/src/stores/assetStore.ts`
- Shared types：`src/shared/asset-types.ts`
- IPC handler：`src/main/ipc/asset-handlers.ts`
- Repository：`src/main/db/repositories/asset-repo.ts` / `tag-repo.ts`
- Migration：`src/main/db/migrations/012_create_assets_and_tags.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5 Story 5.1]
- [Source: _bmad-output/planning-artifacts/prd.md — FR31, FR34, NFR4, NFR29]
- [Source: _bmad-output/planning-artifacts/architecture.md — 数据架构 / 命名规则 / 路由与目录映射 / 异步任务白名单]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — 资产库搜索 UX 模式 / 命令面板入口]
- [Source: _bmad-output/implementation-artifacts/5-1-asset-search-tag-management-ux/ux-spec.md]
- [Source: _bmad-output/implementation-artifacts/5-1-asset-search-tag-management-ux/prototype.manifest.yaml]
- [Source: _bmad-output/implementation-artifacts/5-1-asset-search-tag-management-ux/exports/JqlJ9.png]
- [Source: _bmad-output/implementation-artifacts/5-1-asset-search-tag-management-ux/exports/j4wNb.png]
- [Source: _bmad-output/implementation-artifacts/5-1-asset-search-tag-management-ux/exports/vG8ud.png]
- [Source: _bmad-output/implementation-artifacts/5-1-asset-search-tag-management-ux/prototype.pen]
- [Source: src/main/index.ts — SQLite 初始化位置]
- [Source: src/main/db/migrator.ts — migration 注册方式]
- [Source: src/renderer/src/App.tsx — 当前顶层路由基线]
- [Source: src/renderer/src/shared/command-palette/default-commands.tsx — `command-palette:search-assets` 当前占位实现]
- [Source: package.json — `better-sqlite3@12.8.0`]
- [Source: https://sqlite.org/fts5.html#the_trigram_tokenizer — 官方 FTS5 trigram tokenizer]

## Change Log

- 2026-04-11: `validate-create-story` 复核修订
  - 补回 create-story 模板必需的 validation note
  - 收紧故事范围到搜索 / 列表 / 详情 / 标签替换，移除 5.1 不需要的 asset CRUD 与全局 tag 管理
  - 将中文检索方案从 `unicode61` 改为可直接落地的 FTS5 `trigram`，并补充短关键词 fallback 约束
  - 明确 `/asset` 独立路由与命令面板入口，移除“集成到 SOP 侧边栏或独立入口”的模糊描述
  - 补齐 `migrator.ts`、`migrations.test.ts`、`ipc/index.ts`、preload security test、命令面板回归测试等真实代码链上的必改项
  - 补充 `全部` 筛选、结果计数、同页详情态、loading 表现与标签归一化规则

## Dev Agent Record

### Agent Model Used

(待开发填写)

### Debug Log References

### Completion Notes List

### File List
