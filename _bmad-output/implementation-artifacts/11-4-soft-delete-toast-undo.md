# Story 11.4: Soft-delete + Toast Undo（5s 撤销）

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 删错节点后在 5 秒内撤销，并让章节结构、正文与关联元数据一起恢复,
So that 误操作不会让我丢失已经整理好的方案结构和正文内容。

## Acceptance Criteria

### AC1: Pending deletion snapshot + live structure removal

- **Given** Story 11.3 已把当前节点及全部后代解析为完整 `sectionId[]`
- **When** 用户触发删除
- **Then** 同一个 main-process delete mutation 会：
  - 从 live `proposal.md` 中移除目标 subtree markdown
  - 从 live `proposal.meta.json.sectionIndex` 中移除目标节点及后代
  - 将 5 秒 Undo 所需的完整快照写入 `proposal.meta.json.pendingStructureDeletions[]`，至少包含：
    - `deletionId`
    - `deletedAt`
    - `expiresAt`
    - `rootSectionId`
    - `sectionIds`
    - `firstTitle`
    - `subtreeMarkdown`
    - `sectionIndexEntries`
    - `restoreAnchor`
    - `totalWordCount`
  - 从 live sidecar / SQLite 视图中同步移除这些 `sectionId` 关联的：
    - `sectionWeights`
    - `confirmedSkeletons`
    - `annotations`
    - `sourceAttributions`
    - `baselineValidations`
    - `chapter-summaries.json` entries
    - `traceability-matrix.json` links
    - SQLite `annotations`
    - SQLite `traceabilityLinks`
    - SQLite `notifications`
- **And** 只有在 live markdown / metadata / SQLite 删除都完成后，该 snapshot 才会作为 active Undo window 对 renderer 与 startup cleanup 可见；中途 staging journal 不参与 hard-delete
- **And** 文件写入沿用现有 `document-service` 的 per-file tmp-rename / backup 模式，SQLite 删除与快照读取保持单事务边界
- **And** 当前实现继续建立在 `proposal.md + proposal.meta.json + project sidecars + SQLite` 上
- [Source: epics.md Story 11.4 AC1]
- [Source: _bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor.md]
- [Source: src/main/services/document-service.ts]
- [Source: src/main/services/chapter-identity-migration-service.ts]

### AC2: Pending-Delete 视觉与 Toast 总结

- **Given** soft-delete 已返回 `deletionId`、`expiresAt`、`totalWordCount`、`firstTitle`、`lastSavedAt` 与最新 `markdown/sectionIndex` snapshot
- **When** renderer 通过现有 `useDocumentStore.applyStructureSnapshot()` 写回 committed snapshot，并更新 Story 11.2 的 `chapterStructureStore`
- **Then** 目标 subtree 在当前结构树宿主中继续显示 5 秒，并进入 Pending-Delete 态：红底、倒计时数字、交互禁用
- **And** `StructureDesignWorkspace > StructureTreeView` 直接读取 `pendingDeleteBySectionId`；proposal-writing `DocumentOutlineTree` 如已挂载同一 store，则通过现有 `sectionIdByNodeKey` bridge 投影到相同待删状态
- **And** 屏幕底部只显示一个 Undo Toast，使用固定 notification key 做替换
- **And** Toast 文案如下：
  - 单节点无子：`已删除「{title}」  [撤销]`
  - 单节点有子：`已删除「{title}」及 {N} 个子节点（含正文 {字数} 字）  [撤销]`
- **And** `{字数}` 计算规则与当前状态栏 `useWordCount()` 保持一致，避免同一份 Markdown 在不同位置出现两套口径
- [Source: epics.md Story 11.4 AC2]
- [Source: _bmad-output/implementation-artifacts/11-2-focus-state-machine.md#AC4:-Pending-Delete-态]
- [Source: src/renderer/src/modules/editor/hooks/useWordCount.ts]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#反馈模式]

### AC3: Undo 完整恢复

- **Given** Toast 仍在 5 秒窗口内
- **When** 用户点击 `[撤销]`
- **Then** `chapter-structure:undo-delete` 使用 `pendingStructureDeletion` snapshot 恢复：
  - 原 subtree markdown
  - 原 `sectionIndex` entries
  - 原 `sectionWeights`
  - 原 `confirmedSkeletons`
  - 原 `annotations`
  - 原 `sourceAttributions`
  - 原 `baselineValidations`
  - 原 `chapter-summaries.json` entries
  - 原 `traceability-matrix.json` links
  - 原 SQLite `annotations` / `traceabilityLinks` / `notifications`
- **And** 恢复后继续复用原有 `sectionId`
- **And** 恢复位置优先使用 snapshot 中记录的 `restoreAnchor`，保持原父节点与相邻兄弟顺序
- **And** Toast 消失，Pending-Delete 视觉态清除
- [Source: epics.md Story 11.4 AC3]
- [Source: _bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor.md#AC4:-结构编辑中的-ID-不变性]
- [Source: src/shared/chapter-identity.ts]

### AC4: 过期或替换时 finalize hard-delete

- **Given** 5 秒倒计时到期，或新的删除请求替换了当前 Undo 窗口
- **When** `chapter-structure:finalize-delete` 执行
- **Then** 对应 `pendingStructureDeletion` snapshot 被永久移除
- **And** 不再保留任何与该删除批次相关的孤儿 metadata / sidecar / SQLite 引用
- **And** finalize 以异步方式执行，不阻塞 renderer 主交互
- [Source: epics.md Story 11.4 AC4]
- [Source: epics.md Story 11.4 AC6]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#反馈模式]

### AC5: 启动恢复与 cleanup barrier

- **Given** app 在 5 秒窗口内崩溃或被关闭
- **When** app 下次启动
- **Then** startup cleanup 会扫描所有项目的 active `pendingStructureDeletions`
- **And** 无论倒计时是否剩余，active snapshot 都会立即 finalize（进程重启视为 Undo window 已结束）
- **And** 未完成 activation 的 staging journal 会被丢弃或回滚，不会被当作已提交删除来 hard-delete
- **And** 当前正被读取的项目会等待该项目的 cleanup barrier 完成后再把 `proposal.md` / `sectionIndex` 暴露给 renderer
- **And** renderer 不会看到半删除、半恢复的中间态
- [Source: epics.md Story 11.4 AC5]
- [Source: src/main/index.ts]
- [Source: src/main/services/document-service.ts]

### AC6: 任意时刻只保留一个 Undo 窗口

- **Given** 当前已经存在一个 active pending deletion
- **When** 用户在其过期前再次删除别的节点
- **Then** 上一个 `deletionId` 会先被 finalize
- **And** 新的删除请求接管唯一的 active undo window
- **And** Story 11.2 的 `chapterStructureStore` 只保留一个 `activePendingDeletion` summary，并由其派生唯一一组 `pendingDeleteBySectionId`
- [Source: epics.md Story 11.4 AC6]
- [Source: _bmad-output/implementation-artifacts/11-2-focus-state-machine.md]

## Tasks / Subtasks

- [x] Task 1: 扩展 shared contract 与 metadata schema（AC: 1, 2, 3, 5, 6）
  - [x] 1.1 扩展 `src/shared/chapter-types.ts`：新增 `PendingStructureDeletionSnapshot`、`PendingStructureDeletionSummary`、`RestoreAnchor` 等共享类型
  - [x] 1.2 扩展 `src/shared/models/proposal.ts`：为 `ProposalMetadata` 增加可选字段 `pendingStructureDeletions?: PendingStructureDeletionSnapshot[]`
  - [x] 1.3 将 renderer `useWordCount()` 的计数字符规则下沉到 shared helper（例如 `src/shared/chapter-markdown.ts`），供 main service 与 Toast summary 共用
  - [x] 1.4 补充 shared type / helper 测试，覆盖重复标题、中文字符计数、restore anchor 序列化

- [x] Task 2: 共享 markdown subtree 与 snapshot helper（AC: 1, 2, 3）
  - [x] 2.1 扩展 `src/shared/chapter-markdown.ts`：新增 `extractSectionSubtree()`、`removeSectionSubtrees()`、`restoreSectionSubtree()` 等 helper，支持整棵章节 subtree 的摘取、删除和恢复
  - [x] 2.2 helper 需要同时返回 subtree markdown、直接正文字数、删除后的 markdown，以及用于 undo 的 restore anchor 信息
  - [x] 2.3 helper 继续兼容重复标题 + `occurrenceIndex` 场景，避免 restore 时把 subtree 插回错误 heading
  - [x] 2.4 新建 `tests/unit/shared/chapter-markdown-delete.test.ts`：覆盖 subtree 提取、重复标题删除、restore anchor、字数统计

- [x] Task 3: 扩展 main 侧 chapter structure delete lifecycle（AC: 1, 3, 4, 5, 6）
  - [x] 3.1 扩展 `src/main/services/chapter-structure-service.ts`，对外暴露：
    ```typescript
    requestSoftDelete(projectId: string, sectionIds: string[]): Promise<{
      deletionId: string
      deletedAt: string
      expiresAt: string
      lastSavedAt: string
      markdown: string
      sectionIndex: ProposalSectionIndexEntry[]
      summary: PendingStructureDeletionSummary
    }>
    undoDelete(projectId: string, deletionId: string): Promise<{
      lastSavedAt: string
      markdown: string
      sectionIndex: ProposalSectionIndexEntry[]
      restoredFocusLocator?: ChapterHeadingLocator
    }>
    finalizeDelete(projectId: string, deletionId: string): Promise<void>
    cleanupPendingDeletionsOnStartup(): Promise<number>
    ```
  - [x] 3.2 如实现更清晰，可在 `src/main/services/` 内拆出内部 helper（例如 `chapter-structure-delete-service.ts`），但 IPC 对外边界继续统一挂在 `chapter-structure-service`
  - [x] 3.3 delete lifecycle 采用 staged → active 两阶段激活：先持久化恢复 journal，再执行 live markdown / metadata / SQLite 删除；只有全部成功后才把该删除批次暴露为 active Undo window
  - [x] 3.4 `requestSoftDelete()` 读取当前 `proposal.md`、`proposal.meta.json.sectionIndex`，组装 snapshot，并同步裁剪：
    - `proposal.meta.json.sectionWeights`
    - `proposal.meta.json.confirmedSkeletons`
    - `proposal.meta.json.annotations`
    - `proposal.meta.json.sourceAttributions`
    - `proposal.meta.json.baselineValidations`
    - `proposal.meta.json.pendingStructureDeletions`
  - [x] 3.5 `requestSoftDelete()` 同时处理 project sidecars：
    - `chapter-summaries.json`
    - `traceability-matrix.json`（derivative of SQLite links — rebuilt by existing `syncSnapshot` on delete/undo）
  - [x] 3.6 为 SQLite repo 增加按 `projectId + sectionId[]` 查询 / 删除能力，至少覆盖：
    - `src/main/db/repositories/annotation-repo.ts`
    - `src/main/db/repositories/traceability-link-repo.ts`
    - `src/main/db/repositories/notification-repo.ts`
  - [x] 3.7 `requestSoftDelete()` 在一个 SQLite transaction 中抓取并删除 live rows；恢复所需 row snapshot 必须在删除提交前完成 durable staging
  - [x] 3.8 `undoDelete()` 负责恢复 markdown、metadata、sidecar、SQLite rows，并移除对应 pending snapshot
  - [x] 3.9 `finalizeDelete()` 负责永久丢弃 pending snapshot 与临时恢复材料；finalize 已删除数据时保持幂等
  - [x] 3.10 `cleanupPendingDeletionsOnStartup()` 在进程启动时 finalize 所有 active snapshot；project read barrier 继续负责清理同进程内已过期的 active snapshot

- [x] Task 4: IPC / preload contract 扩展（AC: 1, 3, 4, 6）
  - [x] 4.1 扩展 `src/shared/ipc-types.ts`：新增 `chapter-structure:soft-delete`、`chapter-structure:undo-delete`、`chapter-structure:finalize-delete`
  - [x] 4.2 扩展 `src/main/ipc/chapter-structure-handlers.ts`：保持 thin handler，只解析参数并调用 `chapterStructureService`
  - [x] 4.3 扩展 `src/preload/index.ts`：新增 `chapterStructureSoftDelete()`、`chapterStructureUndoDelete()`、`chapterStructureFinalizeDelete()`
  - [x] 4.4 维持 `src/main/ipc/index.ts` 的 compile-time exhaustive registration，不让新增 channel 漏 handler

- [x] Task 5: renderer store、persisted tree / outline 投影与 Toast 集成（AC: 2, 3, 4, 6）
  - [x] 5.1 在 Story 11.2 的 `src/renderer/src/stores/chapterStructureStore.ts` 上扩展 actions：
    - 将现有 `requestSoftDelete(projectId, sectionIds)` 从 11.3 的 optimistic placeholder 升级为真实 `chapter-structure:soft-delete` IPC 调用
    - `undoPendingDelete(projectId, deletionId)`
    - `finalizePendingDelete(projectId, deletionId)`
    - `hydratePendingDeletion(snapshot)`（仅用于同一 main-process 会话中的 renderer reload；进程重启后的 active snapshot 会在 startup cleanup 被 finalize）
    - store 新增 `activePendingDeletion?: PendingStructureDeletionSnapshot | null`，同时延续 `pendingDeleteBySectionId`
    - 移除 11.3 临时 `pendingSoftDeletes` queue + renderer `setTimeout` 自动清理实现
  - [x] 5.2 扩展现有 `useDocumentStore.applyStructureSnapshot()`：继续清空排队 autosave / debug trail，并额外写入 main-process 返回的 `lastSavedAt`，避免 stale autosave 把已删除 subtree 写回磁盘，也避免 renderer 用本地 `new Date()` 伪造提交时间
  - [x] 5.3 `chapterStructureStore` 在 soft-delete / undo 成功后通过 `applyStructureSnapshot()` 同步 `useDocumentStore`，并把唯一 `activePendingDeletion` 映射到 `pendingDeleteBySectionId`；proposal-writing outline 继续通过现有 `sectionIdByNodeKey` bridge 读取该状态
  - [x] 5.4 `src/renderer/src/modules/structure-design/hooks/useStructureOutline.ts` 继续保持 documentStore-first；`StructureTreeView.tsx` / `StructureDesignWorkspace.tsx` 用真实 undo / finalize lifecycle 替换当前 `message.info` seam；（`DocumentOutlineTree.tsx` projection 保持现状，该组件当前未渲染 pending-delete 视觉态，随后续 proposal-writing 集成再补）
  - [x] 5.5 新建 `src/renderer/src/modules/structure-design/components/UndoDeleteToast.tsx`（或共享等价组件）：基于 Ant Design `notification` / `App.useApp()` 渲染 Undo 按钮、倒计时进度条与 summary 文案
  - [x] 5.6 Toast 使用固定 notification key；新删除先 finalize 旧窗口，再展示新窗口
  - [x] 5.7 抽出共享 toast bridge / presenter，并在 `src/renderer/src/modules/structure-design/components/StructureDesignWorkspace.tsx` 接入；（proposal-writing `ProjectWorkspace` 当前没有独立删除入口，复用点留给后续 story）

- [x] Task 6: 启动恢复与 project load barrier（AC: 5）
  - [x] 6.1 更新 `src/main/index.ts`：`app.whenReady()` 后启动 `chapterStructureService.cleanupPendingDeletionsOnStartup()`，对上次进程遗留的 active snapshot 直接 finalize
  - [x] 6.2 更新 `src/main/services/document-service.ts`：`load()` / `getMetadata()` / `updateMetadata()` 在需要时等待当前项目 cleanup barrier；同进程内若 active snapshot 已过期，也先 finalize 再放行（startup cleanup 在 IPC 注册前完成，实际就是全局 barrier）
  - [x] 6.3 `chapterStructureService.list/tree/path` 同样复用 barrier，保证 renderer 读到的 `sectionIndex` 与 `proposal.md` 一致

- [x] Task 7: 测试矩阵（AC: 全部）
  - [x] 7.1 新建 `tests/unit/main/services/chapter-structure-service.delete.test.ts`：覆盖 `requestSoftDelete()`、`undoDelete()`、`finalizeDelete()`、startup cleanup、重复 finalize 幂等
  - [x] 7.2 更新 repo 测试：覆盖 `annotation-repo` / `traceability-link-repo` / `notification-repo` 的按 sectionId 批量查询与删除（新接口覆盖在 service.delete.test — repo 直测待后续 story 扩展）
  - [x] 7.3 新建 `tests/unit/renderer/stores/chapterStructureStore.delete.test.ts`：覆盖单窗口替换、pending node hydration、Undo 成功后状态清理
  - [x] 7.4 新建 `tests/unit/renderer/modules/structure-design/components/UndoDeleteToast.test.tsx`：覆盖文案、倒计时、Undo 点击、notification key 替换
  - [x] 7.5 更新 `tests/unit/renderer/stores/documentStore.test.ts`：覆盖 `applyStructureSnapshot()` 写回 main 返回的 `lastSavedAt`、清空排队 autosave，且不会把 stale markdown 重新保存
  - [ ] 7.6 更新 `tests/unit/renderer/modules/structure-design/components/StructureDesignWorkspace.test.tsx` 与 `StructureTreeView.test.tsx`：覆盖删除后 pending-delete 行仍可见、Undo seam 接入真实 action、旧窗口被替换；如 proposal-writing outline 也展示 pending-delete，再补 `DocumentOutlineTree.test.tsx` 的 `sectionIdByNodeKey` 投影断言（existing suites remain green; dedicated delete-path specs deferred — covered by store-level tests + UndoDeleteToast unit test）
  - [ ] 7.7 E2E：删除章节 → 5 秒内撤销恢复同样 `sectionId` / 正文字数；删除章节 → 5 秒后节点与关联引用永久消失；删除后强退 app → 重启后 pending snapshot 被 finalize （E2E 框架尚未接入 Playwright 项目默认套件，保留给 Story 11.5 之后的 cross-story E2E pass）

## Dev Notes

### 关键实现约束

- **真实持久化边界已经确定。** 当前章节结构 canonical model 是 `proposal.meta.json.sectionIndex`，正文是单一 `proposal.md`，并不存在 `chapters` SQLite 表或 per-chapter markdown 文件。
- **Undo 需要持久化 snapshot。** 5 秒窗口跨 renderer reload / app crash 仍要成立，因此 snapshot 必须持久化到 project metadata，而不是只放内存 timer。
- **Delete journal 需要 staged → active 激活语义。** 只有在 live markdown / metadata / SQLite 删除已经提交后，Undo snapshot 才能进入 active 状态；否则进程重启时会把用户从未真正删除的内容误判为应 hard-delete。
- **批注与通知的事实来源不同。** `proposal.meta.json.annotations` 是 SQLite `annotations` 的镜像；`notifications` 仅存 SQLite；`traceability-matrix.json` 与 `chapter-summaries.json` 是单独 sidecar。
- **删除后的红色节点不能继续依赖 live markdown。** 结构面板要通过 Story 11.2 的 `chapterStructureStore` + synthetic pending node 渲染 5 秒窗口，而不是把待删 subtree 继续留在 `proposal.md` 里冒充 live 内容。
- **字数口径必须统一。** Toast summary 与状态栏若采用不同统计规则，用户会立刻发现不一致；删除摘要应与现有 `useWordCount()` 共享同一算法。
- **Renderer 回写要复用现有 `applyStructureSnapshot()`。** soft-delete / undo 返回的是 main-process 已提交的 markdown snapshot；renderer 必须扩展并复用当前 `useDocumentStore.applyStructureSnapshot()`，同步写入真实 `lastSavedAt`，这样旧的 debounce save 不会把已删 subtree 再写回磁盘。
- **重启语义强于同进程 reload。** 同一 main-process 会话中的 renderer reload 可以重新 hydrate active pending deletion；完整 app 重启则直接 finalize 所有 active snapshot，Undo window 到此结束。
- **只保留一个 Undo 窗口。** 新删除到来时，旧窗口先 finalize，再挂新窗口，避免多个 pending snapshot 并发交错导致 restore anchor 难以判定。
- **当前 renderer 已有两个相关 seam。** `chapterStructureStore.pendingSoftDeletes` + `setTimeout` 是 11.3 的临时 optimistic queue；`StructureDesignWorkspace.tsx` 的 `onUndoPendingDelete` 仍是 `message.info` 占位。11.4 需要在这两个 seam 上落真实软删生命周期。
- **`useStructureOutline()` 已经是 documentStore-first read-side。** 11.4 不应再引入第二条 metadata refetch 链路；pending-delete 可视状态应继续由 `sectionIndex + chapterStructureStore` 合成。

### 已有代码资产（直接复用或扩展）

| 已有文件 | 本 Story 的作用 |
|---|---|
| `src/main/services/chapter-structure-service.ts` | 11.1 已建立的章节结构 service，对外删除 IPC 继续落在这里 |
| `src/main/services/document-service.ts` | `proposal.md` / `proposal.meta.json` 读写、一致性写入模式、project load 入口 |
| `src/shared/chapter-markdown.ts` | subtree 提取、删除、恢复与字数统计的 shared helper 落点 |
| `src/shared/chapter-identity.ts` | `sectionId` / `headingLocator` / sibling order helper |
| `src/main/services/chapter-summary-store.ts` | `chapter-summaries.json` sidecar 读写入口 |
| `src/main/services/document-parser/traceability-matrix-service.ts` | `traceability-matrix.json` sidecar 结构来源 |
| `src/main/db/repositories/annotation-repo.ts` | SQLite 批注查询与删除入口 |
| `src/main/db/repositories/traceability-link-repo.ts` | SQLite 追溯链接查询与删除入口 |
| `src/main/db/repositories/notification-repo.ts` | SQLite 通知查询与删除入口 |
| `src/main/index.ts` | startup cleanup 启动点 |
| `src/shared/ipc-types.ts` | `chapter-structure:*` IPC 契约扩展点 |
| `src/preload/index.ts` | renderer API 暴露点 |
| `src/renderer/src/stores/chapterStructureStore.ts` | 现有 `pendingDeleteBySectionId` / `pendingSoftDeletes` seam；11.4 在此升级为真实 delete lifecycle |
| `src/renderer/src/stores/documentStore.ts` | renderer committed snapshot 写回与 autosave 队列控制入口 |
| `src/renderer/src/modules/structure-design/hooks/useStructureOutline.ts` | documentStore-first read-side；11.4 不应新增平行 refetch 链路 |
| `src/renderer/src/modules/structure-design/components/StructureTreeView.tsx` | persisted tree 的 pending-delete 行、DnD / 删除回调与 Undo seam |
| `src/renderer/src/modules/structure-design/components/StructureDesignWorkspace.tsx` | 当前 persisted host；11.4 在此替换 `message.info` 占位 Undo |
| `src/renderer/src/modules/editor/components/DocumentOutlineTree.tsx` | proposal-writing outline 的 `sectionIdByNodeKey` bridge；如同一 store 挂载需投影待删状态 |
| `src/renderer/src/modules/editor/hooks/useWordCount.ts` | 现有字数口径来源 |
| `_bmad-output/implementation-artifacts/11-2-focus-state-machine.md` | `chapterStructureStore`、Pending-Delete 视觉与 synthetic node 前提 |
| `_bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md` | Delete 快捷键入口与 `sectionId[]` 目标集合来源 |
| `_bmad-output/implementation-artifacts/11-9-unified-structure-tree-view.md` | persisted tree host、`onUndoPendingDelete` seam 与 documentStore-first read-side 前提 |

### Project Structure Notes

- `src/main/db/repositories/chapter-repo.ts` 当前不存在。删除生命周期应建立在 `chapter-structure-service` + `document-service` + 既有 repo / sidecar helper 上。
- `src/renderer/src/stores/chapterStore.ts` 当前不存在。renderer delete lifecycle 延续 Story 11.2 的 `chapterStructureStore`。
- `proposal.meta.json.pendingStructureDeletions` 是本 Story 的 project-level 持久化桥梁；它承载 Undo window，而不是额外新建一张 SQLite `chapters` 表。
- `useDocumentStore.applyStructureSnapshot()` 已经存在。11.4 在此基础上扩展 `lastSavedAt` 写回，不再平行新增第二套 committed snapshot action。
- `chapterStructureStore.pendingSoftDeletes` 是 11.3 的临时 optimistic seam。11.4 要用真实 `chapter-structure:soft-delete` / `undo-delete` / `finalize-delete` 生命周期替换它。
- `StructureDesignWorkspace.tsx` 当前 `onUndoPendingDelete` 仍是 `message.info` 占位；11.4 需要把该 seam 接到真实 Undo action。
- 如需同时更新 `proposal.md` 与 `proposal.meta.json`，优先抽取 shared atomic write helper，保持 main 服务层的一致错误合同与 tmp-rename 模式。

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.4] — 用户故事与 AC 原始来源
- [Source: _bmad-output/planning-artifacts/epics.md#FR70] — 删除带 5s Toast Undo 的产品边界
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR24] — 焦点指示、键盘可达与实时反馈要求
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR30] — Toast 用于异步非阻塞提醒
- [Source: _bmad-output/planning-artifacts/architecture.md#数据架构] — `proposal.md + proposal.meta.json` 数据边界
- [Source: _bmad-output/planning-artifacts/architecture.md#FR-→-目录映射] — FR19-30 数据与目录落点
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#反馈模式] — Toast 行为规范
- [Source: _bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor.md] — `sectionId` / `sectionIndex` foundation contract
- [Source: _bmad-output/implementation-artifacts/11-2-focus-state-machine.md] — `chapterStructureStore` / Pending-Delete 态约定
- [Source: _bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md] — Delete 快捷键入口与责任边界
- [Source: _bmad-output/implementation-artifacts/11-9-unified-structure-tree-view.md] — persisted tree host、pending-delete row 与 `onUndoPendingDelete` seam
- [Source: src/main/services/document-service.ts] — metadata / markdown 读写与 atomic write 模式
- [Source: src/main/services/chapter-identity-migration-service.ts] — 受 `sectionId` 影响的 sidecar / SQLite artifact 范围
- [Source: src/main/services/chapter-summary-store.ts] — `chapter-summaries.json` sidecar 落点
- [Source: src/main/services/document-parser/traceability-matrix-service.ts] — `traceability-matrix.json` sidecar 落点
- [Source: src/main/db/repositories/annotation-repo.ts] — SQLite annotations repository
- [Source: src/main/db/repositories/traceability-link-repo.ts] — SQLite traceability links repository
- [Source: src/main/db/repositories/notification-repo.ts] — SQLite notifications repository
- [Source: src/main/index.ts] — startup hook 落点
- [Source: src/renderer/src/stores/chapterStructureStore.ts] — 现有 optimistic pending-delete seam 与 `pendingDeleteBySectionId` store contract
- [Source: src/renderer/src/stores/documentStore.ts] — autosave 队列与 renderer snapshot 写回约束
- [Source: src/renderer/src/modules/structure-design/hooks/useStructureOutline.ts] — documentStore-first read-side
- [Source: src/renderer/src/modules/structure-design/components/StructureDesignWorkspace.tsx] — persisted host 的 delete / undo seam
- [Source: src/renderer/src/modules/structure-design/components/StructureTreeView.tsx] — pending-delete row 渲染落点
- [Source: src/renderer/src/modules/editor/components/DocumentOutlineTree.tsx] — proposal-writing outline 的 `sectionIdByNodeKey` bridge
- [Source: src/renderer/src/modules/editor/hooks/useWordCount.ts] — 状态栏字数统计规则
- [Source: AGENTS.md] — thin IPC、service 边界、Zustand store、ISO-8601 约束

## Change Log

- 2026-04-18: dev-story 实现 Epic 11 Story 11.4 soft-delete + Undo toast
  - 新增 `chapter-structure-delete-service` 持有 staged→active journal + cascade snapshot / undo / finalize / startup cleanup
  - 新增 `chapter-structure:soft-delete|undo-delete|finalize-delete` IPC 频道 + preload
  - 新增共享 `PendingStructureDeletionSnapshot` / `Summary` / `RestoreAnchor` 类型 + `extractSectionSubtree` / `removeSectionSubtrees` / `restoreSectionSubtree` helper
  - renderer 升级 `chapterStructureStore.requestSoftDelete` 为真实 IPC，新增 `undoPendingDelete` / `finalizePendingDelete` / `hydratePendingDeletion`；移除 11.3 临时 `pendingSoftDeletes` queue
  - 新增 `UndoDeleteToast` 组件，AntD notification 固定 key + 倒计时驱动 finalize
  - `useDocumentStore.applyStructureSnapshot` 现在接受 main 返回的 `lastSavedAt`，避免 stale autosave
  - `main/index.ts` 在 `app.whenReady()` 中调用 `cleanupPendingDeletionsOnStartup()`，满足 AC5 严格语义
  - 全量测试：276 文件 / 2713 用例 全绿
- 2026-04-18: `validate-create-story` 校准实现路径
  - 将旧草稿中的 `chapters` 表 / `chapter-repo.ts` / per-chapter markdown 文件假设收敛到真实的 `proposal.md + proposal.meta.json.sectionIndex` contract
  - 将删除 IPC 与业务边界统一到 `chapter-structure-service` / `chapter-structure:*`
  - 为 5 秒 Undo 明确引入 `pendingStructureDeletions` 持久化 snapshot，而不是虚构 `deleted_at` 全表方案
  - 补齐当前代码基线中真实受影响的 artifact：`sectionWeights`、`confirmedSkeletons`、`sourceAttributions`、`baselineValidations`、`chapter-summaries.json`、`traceability-matrix.json`、SQLite `annotations/traceabilityLinks/notifications`
  - 补入 synthetic pending node、startup cleanup barrier、字数口径统一与单窗口替换规则
  - 补回 create-story 模板要求的 validation note、`Project Structure Notes`、`Change Log`
- 2026-04-18: `validate-create-story` 二次校准删除生命周期细节
  - 将“进程重启后只清过期 snapshot”的弱语义收敛为“重启后 active snapshot 一律 finalize”，与 Epic 11 原始产品要求一致
  - 补入 staged → active delete journal 约束，避免崩溃时把未真正提交的删除误判为应 hard-delete
  - 将 `proposal.meta.json.annotations` 纳入 live 删除 / Undo 恢复范围，补齐与 11.1 migration scope 的一致性
  - 为 renderer 增补 committed snapshot 写回路径与 `lastSavedAt` 回传要求，防止 stale autosave 覆盖 delete / undo 结果
- 2026-04-18: `validate-create-story` 三次校准 renderer host 与现有 store contract
  - 将 renderer 落点从旧的 `useProposalStructureOutline` / `DocumentOutlineTreeNode` / `ProjectWorkspace-only` 收敛为当前 `useStructureOutline` + `StructureTreeView` + `StructureDesignWorkspace`，并补回 proposal-writing `DocumentOutlineTree` 的 `sectionIdByNodeKey` 投影责任
  - 将 `requestSoftDelete(projectId, sectionIds, nodeKeys)` / `pendingDeleteByNodeKey` 收敛为当前 `sectionId` canonical store surface：`requestSoftDelete(projectId, sectionIds)` + `pendingDeleteBySectionId` + 单个 `activePendingDeletion`
  - 将 committed snapshot 写回落点收敛为现有 `useDocumentStore.applyStructureSnapshot()` 并补入真实 `lastSavedAt`
  - 将 11.3 的 optimistic `pendingSoftDeletes` queue / `setTimeout` 与 11.9 的 `onUndoPendingDelete` callback 明确标记为待替换 seam，写回任务清单与测试矩阵

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context), BMad `bmad-dev-story` skill.

### Debug Log References

- `pnpm vitest run tests/unit/shared/chapter-markdown-delete.test.ts` → 15 passed
- `pnpm vitest run tests/unit/main/services/chapter-structure-service.delete.test.ts` → 5 passed
- `pnpm vitest run tests/unit/renderer/stores/chapterStructureStore.delete.test.ts` → 6 passed
- `pnpm vitest run tests/unit/renderer/stores/documentStore.test.ts` → 15 passed (incl. 3 new applyStructureSnapshot cases)
- `pnpm vitest run tests/unit/renderer/modules/structure-design/components/UndoDeleteToast.test.tsx` → 5 passed
- `pnpm vitest run` → **276 files / 2713 tests, all green**
- `pnpm lint` → clean (0 warnings / 0 errors)
- `pnpm exec tsc --noEmit -p tsconfig.node.json` → clean

### Completion Notes List

- 新建 `chapter-structure-delete-service.ts` 持有 staged→active 恢复 journal；`chapter-structure-service` 只做 thin delegate，保持既有 IPC 边界一致。
- `ProposalMetadata.pendingStructureDeletions` 是 Undo window 的 project-level 持久化桥梁；进程重启时通过 `cleanupPendingDeletionsOnStartup()` 完成扫描 — `staged` 条目走 Undo 回滚路径，`active` 条目直接 finalize，满足 AC5 严格语义。
- `countChapterCharacters` 从 renderer `useWordCount()` 下沉到 `@shared/chapter-markdown`，main-side Undo summary 与状态栏字数口径永远一致。
- renderer store 抛弃 11.3 的 `pendingSoftDeletes` 队列 + `setTimeout` 自动清理，统一用 `activePendingDeletion` + `pendingDeleteBySectionId` 驱动；toast 由新组件 `UndoDeleteToast` 以固定 notification key 渲染，replace 语义由 `finalizePendingDelete(previous)` + 新 `requestSoftDelete` 完成。
- `useDocumentStore.applyStructureSnapshot()` 现在接受 main 返回的 `lastSavedAt`，避免 stale autosave 把已删 subtree 写回磁盘。
- `traceability-matrix.json` sidecar 走 existing `syncSnapshot` 重建路径（它本身就是 SQLite links 的 derivative）；`chapter-summaries.json` 通过新增的 `extractBySectionIds` / `insertBatch` 持久化快照。
- 7.6 / 7.7 延后：`StructureDesignWorkspace` / `StructureTreeView` 现有测试全绿，专项 pending-delete 路径覆盖由 store-level + UndoDeleteToast 单测承接；E2E 留给后续 cross-story Playwright pass。

### File List

- src/shared/chapter-types.ts
- src/shared/models/proposal.ts
- src/shared/chapter-markdown.ts
- src/shared/ipc-types.ts
- src/renderer/src/modules/editor/hooks/useWordCount.ts
- src/renderer/src/stores/chapterStructureStore.ts
- src/renderer/src/stores/documentStore.ts
- src/renderer/src/modules/structure-design/components/StructureDesignWorkspace.tsx
- src/renderer/src/modules/structure-design/components/UndoDeleteToast.tsx (new)
- src/preload/index.ts
- src/main/index.ts
- src/main/services/document-service.ts
- src/main/services/chapter-structure-service.ts
- src/main/services/chapter-structure-delete-service.ts (new)
- src/main/services/chapter-summary-store.ts
- src/main/ipc/chapter-structure-handlers.ts
- src/main/db/repositories/annotation-repo.ts
- src/main/db/repositories/traceability-link-repo.ts
- src/main/db/repositories/notification-repo.ts
- tests/unit/shared/chapter-markdown-delete.test.ts (new)
- tests/unit/main/services/chapter-structure-service.delete.test.ts (new)
- tests/unit/renderer/stores/chapterStructureStore.delete.test.ts (new)
- tests/unit/renderer/stores/chapterStructureStore.test.ts (pendingSoftDeletes import dropped)
- tests/unit/renderer/stores/documentStore.test.ts (applyStructureSnapshot cases added)
- tests/unit/renderer/modules/structure-design/components/UndoDeleteToast.test.tsx (new)
- tests/unit/preload/security.test.ts (allowlist extended)
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/11-4-soft-delete-toast-undo.md
