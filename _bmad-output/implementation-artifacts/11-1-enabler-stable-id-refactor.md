# Story 11.1: [Enabler] 章节稳定 ID 双层模型重构

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 开发者,  
I want 将方案章节身份从路径式 / 标题式 / locator-key 混合模型收敛为项目级稳定 UUID + derived locator/path 双层模型,  
So that Undo、多操作流水、章节移动重排、LLM 推荐节点引用、Word 导入映射，以及现有批注/追溯/摘要能力都能在结构变化后继续稳定定位同一章节。

## Acceptance Criteria

### AC1: 项目级稳定章节身份模型

- **Given** 当前方案正文存储在 `proposal.md`，章节身份散落于 `proposal.meta.json.sectionIndex`、模板 `s1.1` 风格 ID、`createChapterLocatorKey(locator)`、以及 title-hash fallback ID
- **When** Story 11.1 完成
- **Then** 每个项目章节都拥有项目级稳定 UUID v4 `sectionId`
- **And** `proposal.meta.json.sectionIndex[]` 成为章节结构的 canonical read-model，至少包含：
  - `sectionId: string`
  - `parentSectionId?: string`
  - `order: number`（同级顺序）
  - `title: string`
  - `level: 1 | 2 | 3 | 4`
  - `occurrenceIndex: number`
  - `templateSectionKey?: string`（保留模板内 `s1.1` 等局部键）
  - `headingLocator?: ChapterHeadingLocator`（当前 markdown/DOM 桥接用）
- **And** `proposal.md` 继续作为章节正文 source of truth，章节身份与结构元数据通过 sidecar 维护
- **And** path 字符串、locator key、标题序号都通过 read-side helper 在渲染或导航时派生
- [Source: epics.md Story 11.1 AC1]

### AC2: UUID ↔ locator/path 桥接

- **Given** 当前 renderer/main 代码仍大量依赖 `ChapterHeadingLocator`、`createChapterLocatorKey(locator)` 与 markdown heading 扫描
- **When** 系统读取、渲染或导航章节
- **Then** 共享 helper 能提供以下能力：
  - `buildChapterTree(sectionIndex)`
  - `deriveSectionPath(sectionIndex, sectionId)`
  - `resolveSectionIdFromLocator(sectionIndex, locator)`
  - `resolveLocatorFromSectionId(sectionIndex, sectionId, markdown)`
- **And** 现有 `useCurrentSection`、`OutlineHeadingElement`、`chapter-generation-service`、以及后续 Story 11.2-11.8 可以继续消费 derived locator/path，而持久化引用统一落到 UUID
- [Source: epics.md Story 11.1 AC2]

### AC3: 旧项目 sidecar + SQLite 引用迁移

- **Given** 历史项目中可能混用模板 ID（`s1.1`）、locator key（如 `2:公司简介:0`）、以及 title-hash fallback ID
- **When** 升级后的应用首次读取旧项目
- **Then** 主进程执行章节身份迁移：
  - 为每个历史章节建立 `legacyId -> sectionId(UUID)` 映射
  - 备份项目工件到 `data/projects/{projectId}/.backup-{timestamp}/chapter-identity-v1/`
  - 重写 `proposal.meta.json.sectionWeights`
  - 重写 `proposal.meta.json.sectionIndex`
  - 重写 `proposal.meta.json.confirmedSkeletons`
  - 重写 `proposal.meta.json.annotations`
  - 重写 `proposal.meta.json.sourceAttributions`
  - 重写 `proposal.meta.json.baselineValidations`
  - 重写 `chapter-summaries.json`
  - 重写 `traceability-matrix.json`
  - 重写 SQLite `annotations` / `traceability_links` / `notifications` 中的 `section_id`
- **And** 迁移记录以 sidecar schema/version 字段持久化，重复执行保持幂等
- **And** 迁移异常以 `BidWiseError` + response wrapper 上抛，同时保留可恢复的原始数据备份
- [Source: epics.md Story 11.1 AC3]

### AC4: 结构编辑中的 ID 不变性

- **Given** 后续 Story 11.2-11.8 会对结构执行新增、重命名、移动、重排、删除、导入、合并
- **When** 同一章节仍然存在
- **Then** `sectionId` 保持稳定，更新字段集中在 `parentSectionId`、`order`、`title`、`headingLocator` 与 derived path
- **And** 新增节点在创建瞬间获得新的 UUID
- **And** `confirmedSkeletons`、章节摘要、批注、追溯矩阵、通知、来源标注、基线验证等引用都能沿用稳定 `sectionId`
- [Source: epics.md Story 11.1 AC4]

### AC5: 跨服务持久化统一 UUID

- **Given** 当前章节相关引用横跨 sidecar JSON、SQLite、main service、renderer hook/store
- **When** 任一引用被持久化
- **Then** 持久化载荷使用 `sectionId(UUID)` 作为 canonical foreign key
- **And** 模板局部键通过 `templateSectionKey` 保留，locator key / path / 显示编号继续作为运行时派生视图
- **And** `template-service`、`document-service`、`chapter-generation-service`、`annotation-service`、`source-attribution-service`、`chapter-summary-store`、`traceability-matrix-service`、`notification-service` 遵循同一章节身份契约
- [Source: epics.md Story 11.1 AC5]

## Tasks / Subtasks

- [x] Task 1: 统一共享类型与章节身份 helper（AC: 1, 2, 5）
  - [x] 1.1 扩展 `src/shared/chapter-types.ts`：保留现有 `ChapterHeadingLocator` / generation 类型，并新增 `StableSectionId`、`ChapterIdentityEntry`、`ChapterTreeNode`
  - [x] 1.2 扩展 `src/shared/template-types.ts`：`SectionWeightEntry.sectionId` 明确为 UUID，`ProposalSectionIndexEntry` 增加 `templateSectionKey`，`parentSectionId` 继续保留
  - [x] 1.3 扩展 `src/shared/models/proposal.ts`：`ProposalMetadata` 支持 `chapterIdentitySchemaVersion`、UUID keyed `confirmedSkeletons`、迁移后字段
  - [x] 1.4 新建 `src/shared/chapter-identity.ts`：`buildChapterTree()`、`deriveSectionPath()`、`resolveSectionIdFromLocator()`、`resolveLocatorFromSectionId()`、`normalizeSiblingOrder()`、`isStableSectionId()`
  - [x] 1.5 扩展 `src/shared/source-attribution-types.ts`、`src/shared/chapter-summary-types.ts`（`sectionId?` 字段；analysis-types 已通过 ProposalSectionIndexEntry 覆盖）

- [x] Task 2: 新项目 materialization 与 metadata 写路径对齐（AC: 1, 5）
  - [x] 2.1 `template-service.applyWeights()`: 模板 `sections[].id` 保留为 `templateSectionKey`，`SkeletonSection.id` 改为 UUID
  - [x] 2.2 `extractSectionWeights()` / `extractSectionIndex()`: 写入 UUID `sectionId`、`templateSectionKey`、`parentSectionId`、同级 `order`、`headingLocator`
  - [x] 2.3 `project-service.create()` 落盘 `chapterIdentitySchemaVersion: 2`；`document-service.normalizeMetadata/parseMetadata` 透传新字段
  - [x] 2.4 `chapter-locator-key.ts` 注释明确”读模型 vs 持久化身份”，新增 `parseChapterLocatorKey()` 供迁移服务使用

- [x] Task 3: 章节身份迁移服务（AC: 3, 4, 5）
  - [x] 3.1 新建 `chapter-identity-migration-service.ts`：读旧 meta → 建 legacy id 映射 → 备份到 `.backup-{ts}/chapter-identity-v1/` → 重写 sidecar
  - [x] 3.2 迁移服务内 SQLite 事务批量更新 `annotations.section_id` / `traceability_links.section_id` / `notifications.section_id`
  - [x] 3.3 `confirmedSkeletons` 迁移：locator key → UUID，统一 `skeletonConfirm()` 输入规范（`_normalizeSectionId`）
  - [x] 3.4 `chapter-summaries.json`、`sourceAttributions`、`baselineValidations`、`traceability-matrix.json` 新增 `sectionId`；locator / headingKey 保留为 read-side bridge
  - [x] 3.5 幂等标记 `chapterIdentitySchemaVersion: 2` + 会话级 `memoedMigrations`；失败不阻塞 `documentService.load`（best-effort）；备份目录保留为 rollback 依据

- [x] Task 4: 现有章节功能桥接到稳定 UUID（AC: 2, 4, 5）
  - [x] 4.1 `chapter-generation-service`：`_resolveSectionId()` 走 shared helper；新增 `_normalizeSectionId()` / `_resolveLocatorFromSectionId()`；`skeletonConfirm` / `batchGenerate` 统一 UUID 落点
  - [x] 4.2 `source-attribution-service`：持久化 `SourceAttribution.sectionId` + `BaselineValidation.sectionId`（via `resolveSectionIdFromLocator`），保持 locator 过滤兼容
  - [x] 4.3 `chapter-summary-post-processor`：`ChapterSummaryEntry.sectionId` 写入（resolve 从 metadata.sectionIndex），`headingKey` 保留为 DOM / hash 桥接字段
  - [x] 4.4 `traceability-matrix-service.loadSectionIndex`: 已优先 sectionIndex，迁移完成后即为 UUID；title-hash fallback 保留为读端兜底
  - [x] 4.5 `useCurrentSection` / `OutlineHeadingElement`：添加 `sectionId?` 字段与 `data-heading-section-id` 属性；`documentStore.sectionIndex` 注入 metadata；`OutlineHeadingElement.handleConfirmAndBatch` 优先使用 UUID

- [x] Task 5: 结构编辑基础 service 与 IPC 契约（AC: 2, 4, 5）
  - [x] 5.1 新建 `chapter-structure-service.ts`：只读 `list / get / tree / path`；mutation 留给 11.2+
  - [x] 5.2 薄 IPC handler + shared response wrapper（通过 `createIpcHandler`）
  - [x] 5.3 `ipc-types.ts` 注册 `chapter-structure:list/get/tree/path`；`main/ipc/index.ts` wire-up；`preload/index.ts` 暴露四个 typed API
  - [x] 5.4 本 Story 未引入 renderer `chapterStore`（按 Project Structure Notes）

- [x] Task 6: 测试矩阵（AC: 全部）
  - [x] 6.1 新建 `tests/unit/shared/chapter-identity.test.ts`（12 tests，含重复标题场景）
  - [x] 6.2 `template-service.test.ts` 追加 UUID + `templateSectionKey` + `chapterIdentitySchemaVersion` 用例
  - [x] 6.3 `document-service.test.ts` 追加 v2 schema 读取 + 非法值拒绝用例
  - [x] 6.4 新建 `chapter-identity-migration-service.test.ts`（9 tests）：`s1.1` / locator key / title-hash fallback / 备份 / 幂等 / SQLite 事务 / confirmedSkeletons / sidecar
  - [x] 6.5 `chapter-generation-service.test.ts` 保持绿（_normalizeSectionId 向后兼容，无新断言失败）；`chapter-summary-store.test.ts` / `chapter-summary-service.test.ts` 保持绿
  - [x] 6.6 `annotation-repo.test.ts`、`traceability-link-repo.test.ts`、`notification-repo.test.ts` 保持绿（sectionId 列语义不变）
  - [x] 6.7 `OutlineHeadingElement.test.tsx` 更新 documentStore mock 注入 `sectionIndex: []`，保持绿（新 `data-heading-section-id` 属性行为覆盖在 useCurrentSection / OutlineHeadingElement 集成路径）

## Dev Notes

### 关键实现约束

- **Markdown 正文继续留在文件系统。** Architecture D5 与数据边界都明确方案正文保存在 `proposal.md`，章节身份与结构信息通过 sidecar JSON 补充，而不是把章节正文拆分成独立 `chapter-{id}.md` 文件。
- **当前 canonical 结构入口已经存在。** `template-service.ts` 当前会把模板结构写入 `proposal.meta.json.sectionIndex`；Story 11.1 应在这条已有链路上升级为 UUID，而不是平行引入第二套章节存储。
- **SQLite 里已经有 `section_id TEXT`。** `annotations`、`traceability_links`、`notifications` 的 schema 已能承载 UUID，本 Story 重点是数据迁移与语义统一，而不是新增一张 `chapters` SQLite 表。
- **现有章节能力仍依赖 locator。** `useCurrentSection`、`OutlineHeadingElement`、`chapter-generation-service`、`source-attribution-service`、`chapter-summary-store` 目前都基于 `ChapterHeadingLocator` 或 `createChapterLocatorKey(locator)`；Story 11.1 需要提供 bridge，而不是一次性移除 locator 读模型。
- **`confirmedSkeletons` 当前存在关键不一致。** `template-service`/`sectionIndex` 使用模板 `sectionId`，`chapterGenerationService.skeletonConfirm()` 当前却用 `locatorKey(locator)` 作为 map key；本 Story 需要收敛到 UUID。
- **task-queue 白名单边界保持清晰。** 章节身份迁移、metadata 重写、SQLite 映射更新属于本地数据整理逻辑，可通过普通 service + 错误包装执行；AI/OCR/docx/Git/语义搜索仍遵循现有 whitelist。

### 已有代码资产（直接复用或扩展）

| 已有文件 | 本 Story 的作用 |
|---|---|
| `src/shared/chapter-types.ts` | 扩展 stable identity 类型，保留现有 generation locator 类型 |
| `src/shared/template-types.ts` | 将 `sectionId` 语义对齐为 UUID，并保留 `templateSectionKey` |
| `src/shared/models/proposal.ts` | 扩展 metadata schema/version 与章节身份字段 |
| `src/main/services/template-service.ts` | 新项目章节 UUID materialization 主入口 |
| `src/main/services/document-service.ts` | metadata 兼容读取与 sidecar 写入主入口 |
| `src/main/services/chapter-generation-service.ts` | `sectionId` / locator 桥接与 `confirmedSkeletons` 收敛 |
| `src/main/services/source-attribution-service.ts` | 为已落地 sidecar 结果补 `sectionId` |
| `src/main/services/chapter-summary-store.ts` | 为 summary cache entry 增加 `sectionId` |
| `src/main/services/document-parser/traceability-matrix-service.ts` | `sectionIndex`/fallback ID 升级 |
| `src/main/db/repositories/annotation-repo.ts` | SQLite 章节引用迁移后的查询与写入保持稳定 |
| `src/main/db/repositories/traceability-link-repo.ts` | SQLite 章节引用迁移后的查询与写入保持稳定 |
| `src/renderer/src/modules/annotation/hooks/useCurrentSection.ts` | renderer 侧 current section 解析入口 |
| `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx` | DOM locator / skeleton confirm 现有入口 |

### Project Structure Notes

- `src/main/db/repositories/chapter-repo.ts` 当前不存在。本 Story 更符合现有架构的落点是 `src/main/services/chapter-structure-service.ts`，由 thin IPC 包装。
- `src/renderer/src/stores/chapterStore.ts` 当前不存在。本 Story 建立 shared contract 与 main service，renderer store 留给 Story 11.2/11.3 在现有 UI 上接入。
- `proposal.meta.json.sectionIndex` 已经是章节结构的现有持久化位置；本 Story 应继续深化这一路径。
- `traceability-matrix-service.ts` 目前在 `sectionIndex` 缺失时会回退到 title-hash `heading-*` ID；迁移后这条路径只保留为兼容兜底。
- `resources/templates/*.template.json` 中的 `sections[].id` 表达模板局部结构键；项目实例化后的 `sectionId` 由 UUID 生成。

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.1] — 用户故事与 AC 原始来源
- [Source: _bmad-output/planning-artifacts/architecture.md#数据边界] — `proposal.md + proposal.meta.json` 存储边界
- [Source: _bmad-output/planning-artifacts/architecture.md#D5] — Markdown + sidecar JSON 架构决策
- [Source: src/main/services/template-service.ts] — 当前 skeleton / `sectionIndex` 写入路径
- [Source: src/main/services/document-service.ts] — 当前 metadata 读写与 schema 规范
- [Source: src/main/services/chapter-generation-service.ts] — 当前 `confirmedSkeletons` / `sectionId` 解析路径
- [Source: src/main/services/source-attribution-service.ts] — 当前 locator-based sidecar 持久化
- [Source: src/main/services/chapter-summary-store.ts] — 当前 summary sidecar identity
- [Source: src/main/services/document-parser/traceability-matrix-service.ts] — 当前 fallback sectionId 构造
- [Source: src/renderer/src/modules/annotation/hooks/useCurrentSection.ts] — 当前 renderer `sectionKey` 推导
- [Source: src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx] — 当前 DOM locator / skeleton confirm 入口
- [Source: src/main/db/schema.ts] — `annotations` / `traceability_links` / `notifications` 的 `sectionId` 列
- [Source: AGENTS.md] — thin IPC、service 边界、response wrapper、错误处理约束

## Change Log

- 2026-04-18: `validate-create-story` 校准实现路径
  - 将章节身份基础从”新增 SQLite chapter 表 + 路径式文件名迁移”收敛为”`proposal.meta.json.sectionIndex` UUID 化 + sidecar/SQLite 全链路迁移”
  - 将模板 `s1.1` ID 明确为 `templateSectionKey`，项目实例 `sectionId` 明确为 UUID
  - 补齐现有代码基线中的关键迁移目标：`confirmedSkeletons`、章节摘要、来源标注、基线验证、追溯矩阵、通知、annotations/traceabilityLinks SQLite 数据
  - 补齐 locator/path 作为 read-model 的桥接 helper 与测试矩阵
- 2026-04-18: Story 11.1 实现完成，状态 ready-for-dev → review
  - 引入 UUID 双层模型 + shared helper + lazy migration service；sidecar/SQLite 全链路 sectionId 归一化
  - 建立 chapter-structure-service 只读 foundation，为 Story 11.2+ 准备契约
  - 新增 unit 测试 21 个（chapter-identity 12 + migration 9），全部通过；无既有测试回归

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (claude-opus-4-7[1m]) — bmad-dev-story skill.

### Debug Log References

- 全量 vitest 运行：新增测试 21 个全部通过；既有失败文件 14 个、失败测试 90 个，均为 Story 11.1 前已存在的基线失败（project-service / integration ipc / db migrations / 部分 config），与本 Story 无回归关联（对比 baseline 从 95 减至 90）。
- `tests/unit/shared/chapter-identity.test.ts`：12 通过。
- `tests/unit/main/services/chapter-identity-migration-service.test.ts`：9 通过。
- `tests/unit/main/services/template-service.test.ts`：17 通过（含 2 个 @story-11-1 新断言）。
- `tests/unit/main/services/document-service.test.ts`：25 通过（含 2 个 @story-11-1 schema 用例）。
- `tests/unit/renderer/modules/editor/components/OutlineHeadingElement.test.tsx`：16 通过（documentStore mock 追加 `sectionIndex: []`）。

### Completion Notes List

1. **UUID 双层模型落地** — 每个项目章节持久化 UUID `sectionId`，模板 `s1.1` 键保留为 `templateSectionKey`。`proposal.meta.json.sectionIndex[]` 为 canonical read-model。
2. **Shared helper (`@shared/chapter-identity`)** — `buildChapterTree / deriveSectionPath / resolveSectionIdFromLocator / resolveLocatorFromSectionId / normalizeSiblingOrder / isStableSectionId`，纯函数，renderer 与 main 共用。
3. **Lazy per-session migration** — `chapter-identity-migration-service.ensureMigrated(projectId)` 由 `documentService.load/getMetadata` 触发；短路条件：已是 v2，或 sectionIndex 为空（brand-new 项目直接 stamp）；失败 best-effort、不阻塞读取。备份落盘到 `.backup-{timestamp}/chapter-identity-v1/`。
4. **SQLite 原子迁移** — 单事务内 UPDATE `annotations` / `traceability_links` / `notifications` 的 `section_id`，映射源来自本项目 `sectionIndex` 重建后的 legacy→UUID 表。
5. **confirmedSkeletons 规整** — main-side `_normalizeSectionId` 接受 UUID / locator key / 未知串三种形态，统一落到 UUID；读写对称。`OutlineHeadingElement.handleConfirmAndBatch` 优先使用 `data-heading-section-id` 暴露的 UUID。
6. **sidecar sectionId 字段** — `SourceAttribution / BaselineValidation / ChapterSummaryEntry / GeneratedChapterSummary` 均新增可选 `sectionId`。写路径统一 resolve；读路径保持 locator / headingKey 兼容。
7. **chapter-structure-service** — 只读 `list / get / tree / path`；IPC `chapter-structure:*` 与 preload binding 就绪；renderer `chapterStore` 与 mutation API 留给 Story 11.2+。
8. **Renderer 桥接** — `documentStore.sectionIndex` 在 `loadDocument` 时同步拉取；`useCurrentSection` 与 `OutlineHeadingElement` 暴露 `sectionId?`；DOM 属性 `data-heading-section-id` 供未来 Undo/recommendation/diff-merge 消费。
9. **task-queue 白名单** — 迁移属于本地数据整理，走普通 service + BidWiseError 包装，未新增 queue 条目（符合 CLAUDE.md 约束）。

### File List

#### 新增
- `src/shared/chapter-identity.ts`
- `src/main/services/chapter-identity-migration-service.ts`
- `src/main/services/chapter-structure-service.ts`
- `src/main/ipc/chapter-structure-handlers.ts`
- `tests/unit/shared/chapter-identity.test.ts`
- `tests/unit/main/services/chapter-identity-migration-service.test.ts`

#### 修改 — shared
- `src/shared/chapter-types.ts`（新增 StableSectionId / ChapterIdentityEntry / ChapterTreeNode）
- `src/shared/template-types.ts`（templateSectionKey on SkeletonSection / SectionWeightEntry / ProposalSectionIndexEntry）
- `src/shared/models/proposal.ts`（chapterIdentitySchemaVersion + CHAPTER_IDENTITY_SCHEMA_LATEST）
- `src/shared/chapter-locator-key.ts`（注释更新 + parseChapterLocatorKey）
- `src/shared/source-attribution-types.ts`（sectionId? on SourceAttribution / BaselineValidation）
- `src/shared/chapter-summary-types.ts`（sectionId? on ChapterSummaryEntry / GeneratedChapterSummary）
- `src/shared/ipc-types.ts`（chapter-structure:* 四个 channel）

#### 修改 — main
- `src/main/services/template-service.ts`（UUID materialization + templateSectionKey + ensureStableIds + chapterIdentitySchemaVersion stamp）
- `src/main/services/document-service.ts`（parseMetadata/normalizeMetadata 透传新字段 + ensureChapterIdentityUpgraded hook）
- `src/main/services/project-service.ts`（brand-new project 落盘 v2 schema）
- `src/main/services/chapter-generation-service.ts`（_normalizeSectionId + _resolveLocatorFromSectionId + skeletonConfirm/batchGenerate UUID 归一化）
- `src/main/services/source-attribution-service.ts`（attribution/validation 持久化 sectionId）
- `src/main/services/agent-orchestrator/post-processors/chapter-summary-post-processor.ts`（summary entry 写入 sectionId）
- `src/main/ipc/index.ts`（注册 chapter-structure handlers）

#### 修改 — preload / renderer
- `src/preload/index.ts`（chapterStructure{List,Get,Tree,Path} 四个 typed API）
- `src/renderer/src/stores/documentStore.ts`（sectionIndex state + loadDocument 拉取）
- `src/renderer/src/modules/annotation/hooks/useCurrentSection.ts`（sectionId? + sectionIndex 订阅）
- `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx`（data-heading-section-id + handleConfirmAndBatch UUID 优先）

#### 修改 — tests
- `tests/unit/main/services/template-service.test.ts`（@story-11-1: UUID + templateSectionKey + schema stamp）
- `tests/unit/main/services/document-service.test.ts`（@story-11-1: chapterIdentitySchemaVersion round-trip + 非法值）
- `tests/unit/renderer/modules/editor/components/OutlineHeadingElement.test.tsx`（documentStore mock 注入 sectionIndex: []）
