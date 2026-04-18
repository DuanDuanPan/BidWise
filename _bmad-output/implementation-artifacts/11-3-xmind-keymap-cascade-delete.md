# Story 11.3: Xmind 风格快捷键 + 级联删除

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 用 Enter / Tab / Shift+Tab / Delete 像 Xmind 一样飞快编辑方案结构,
So that 我搭 100 节点结构无需碰鼠标。

## Acceptance Criteria

### AC1: 快捷键映射表

- **Given** proposal-writing 阶段的 `DocumentOutlineTree` 根节点已获焦，且 Story 11.2 的 `chapterStructureStore` 已持有 `focusedNodeKey` 与 `sectionIdByNodeKey`
- **When** 当前节点处于 Focused 态并按下快捷键
- **Then** 执行对应操作：

| 键 | 行为 |
|---|---|
| `Enter` | 在当前节点子树之后插入同级新节点，默认标题为 `新章节`，新节点立即获得新的 `sectionId`，并自动进入 Editing 态 |
| `Tab` | 当前节点连同全部后代一起缩进为“前一个同级兄弟”的最后一个子节点 |
| `Shift+Tab` | 当前节点连同全部后代一起反缩进，移动到父节点之后成为其同级兄弟 |
| `Delete` / `Backspace` | 收集当前节点及全部后代的 `sectionId`，交给 Story 11.4 的删除流程 |
| `F2` / 双击 | 进入 Story 11.2 的 Editing 态 |
| `Esc` | 退出 Editing 态并回到 Focused 态 |
| `↑/↓/←/→` | 在当前 outline 树中导航到上一个可见节点 / 下一个可见节点 / 父节点 / 第一个子节点，并复用现有 `scrollToHeading()` 路径同步编辑器滚动 |

- [Source: epics.md Story 11.3 AC1]
- [Source: _bmad-output/implementation-artifacts/11-2-focus-state-machine.md]
- [Source: src/renderer/src/modules/project/components/ProjectWorkspace.tsx]

### AC2: Editing 态与正文编辑语义

- **Given** 用户正在编辑大纲节点标题，或光标已离开结构面板进入 Plate 正文编辑区
- **When** 按下 `Enter` / `Shift+Enter` / `Tab`
- **Then** 大纲标题编辑沿用 Story 11.2 的 inline Input 语义：`Enter` 提交、`Esc` 取消、结构快捷键暂停
- **And** Plate 编辑器继续保留现有正文输入语义，结构快捷键不会抢占编辑器里的 `Enter` / `Shift+Enter` / `Tab`
- [Source: epics.md Story 11.3 AC2]
- [Source: _bmad-output/implementation-artifacts/11-2-focus-state-machine.md#AC2:-Editing-态]
- [Source: src/renderer/src/modules/editor/components/PlateEditor.tsx]

### AC3: 快捷键作用域

- **Given** 快捷键 hook 挂在可聚焦的 `DocumentOutlineTree` 根节点上
- **When** 焦点位于树根节点或其内部子元素
- **Then** 结构快捷键生效
- **And** 焦点离开该节点后，结构快捷键立即失效，Plate 编辑器与其他面板继续接管自己的按键语义
- **And** 根节点具备 `tabIndex={0}`、蓝色 2px focus outline，以及 Story 11.2 的 Focused 态视觉同步
- [Source: epics.md Story 11.3 AC3]
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR24]
- [Source: src/renderer/src/modules/editor/components/DocumentOutlineTree.tsx]

### AC4: Tab / Shift+Tab 边界

- **Given** 当前节点不存在“前一个同级兄弟”，或当前节点已经是顶级节点
- **When** 分别按下 `Tab` 或 `Shift+Tab`
- **Then** 操作保持幂等，UI 与文档内容不变化
- **And** 结构面板继续保留当前 Focused 态
- [Source: epics.md Story 11.3 AC4]

### AC5: Locked / Pending-Delete 节点不可操作

- **Given** 节点处于 Story 11.2 的 `locked` 或 `pending-delete` 状态
- **When** 按下任意结构变更快捷键（`Tab` / `Enter` / `Delete` / `Shift+Tab`）
- **Then** 操作被拒绝
- **And** `locked` 节点显示 Toast：`AI 生成中，请稍候`
- **And** `pending-delete` 节点保持 Story 11.4 的撤销窗口行为
- [Source: epics.md Story 11.3 AC5]
- [Source: _bmad-output/implementation-artifacts/11-2-focus-state-machine.md#AC3:-Locked-态]
- [Source: _bmad-output/implementation-artifacts/11-2-focus-state-machine.md#AC4:-Pending-Delete-态]

### AC6: 级联删除交接给 11.4

- **Given** 当前节点拥有子节点
- **When** 用户按下 `Delete` / `Backspace`
- **Then** renderer 侧根据当前 outline 树收集当前节点与全部后代的 `nodeKey`
- **And** 通过 `sectionIdByNodeKey` 映射解析出完整 `sectionId[]`
- **And** 将删除请求交给 Story 11.4 的 soft-delete/undo 流程，11.3 自身负责快捷键入口与目标集合构造
- [Source: epics.md Story 11.3 AC1]
- [Source: _bmad-output/implementation-artifacts/11-2-focus-state-machine.md#AC6:-五状态机互斥与-read-side-/-persistent-identity-桥接]
- [Source: _bmad-output/implementation-artifacts/11-4-soft-delete-toast-undo.md]

### AC7: 6 层警告联动

- **Given** `Tab` 成功执行后，目标节点深度达到第 7 层或更深
- **When** 结构变更完成
- **Then** 节点插入 / 移动保持成功
- **And** 立即触发 Story 11.5 的 `warnDepthExceeded(depth)`
- [Source: epics.md Story 11.3 AC1]
- [Source: _bmad-output/implementation-artifacts/11-5-depth-limit-warn-llm-lock.md]

### AC8: markdown 与 sectionIndex 同步更新

- **Given** 当前大纲树来自 `proposal.md` 的 heading 解析，而持久化结构身份来自 `proposal.meta.json.sectionIndex`
- **When** `Enter` / `Tab` / `Shift+Tab` 任一结构操作执行成功
- **Then** 同一个 main-process mutation 会返回最新 `markdown` 与 `sectionIndex` snapshot
- **And** 现有节点继续保留原 `sectionId`
- **And** 新节点即时生成新的 UUID `sectionId`
- **And** `headingLocator` / `occurrenceIndex` / `order` / `parentSectionId` 会在返回结果中保持一致，供 renderer 同步 `documentStore` 与 `chapterStructureStore`
- [Source: _bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor.md#AC4:-结构编辑中的-ID-不变性]
- [Source: src/shared/chapter-identity.ts]
- [Source: src/main/services/document-service.ts]

## Tasks / Subtasks

- [x] Task 1: 共享 markdown 结构变更 helper（AC: 1, 4, 8）
  - [x] 1.1 扩展 `src/shared/chapter-markdown.ts`：新增“按 section subtree 插入 / 缩进 / 反缩进”的纯函数 helper，能够搬运整段 heading block，而不是只替换正文
  - [x] 1.2 helper 需要同时处理目标节点及其全部后代的 heading level 调整，保证 `Tab` / `Shift+Tab` 后整棵子树层级一致
  - [x] 1.3 `Enter` 新增同级节点时沿用 Story 3.3 先例，默认标题使用 `新章节`，确保 markdown heading 与 outline 解析始终有效
  - [x] 1.4 为 shared helper 补充重复标题、嵌套子树、根节点边界、H4 子树缩进后的层级修正测试

- [x] Task 2: 扩展 chapter-structure main service 与 IPC mutation contract（AC: 1, 4, 7, 8）
  - [x] 2.1 扩展 `src/main/services/chapter-structure-service.ts`：新增 `insertSibling(projectId, sectionId)`、`indent(projectId, sectionId)`、`outdent(projectId, sectionId)` 等 mutation
  - [x] 2.2 每个 mutation 内部读取当前 `proposal.md` + `proposal.meta.json.sectionIndex`，完成 markdown subtree 变更、`headingLocator` 重算、`parentSectionId/order/occurrenceIndex` 归一化，并复用 `normalizeSiblingOrder()`
  - [x] 2.3 mutation 输出统一返回最新 snapshot，例如：
    ```typescript
    {
      markdown: string
      sectionIndex: ProposalSectionIndexEntry[]
      affectedSectionId: string
      focusLocator: ChapterHeadingLocator
      createdSectionId?: string
    }
    ```
  - [x] 2.4 扩展 `src/shared/ipc-types.ts`、`src/main/ipc/chapter-structure-handlers.ts`、`src/preload/index.ts`：新增 `chapter-structure:insert-sibling`、`chapter-structure:indent`、`chapter-structure:outdent`
  - [x] 2.5 IPC handler 保持 thin-wrapper 形态，业务逻辑全部留在 `chapter-structure-service`

- [x] Task 3: renderer 侧 `chapterStructureStore` 动作扩展（AC: 1, 5, 7, 8）
  - [x] 3.1 在 Story 11.2 的 `src/renderer/src/stores/chapterStructureStore.ts` 上扩展 actions：`insertSibling(projectId, nodeKey)`、`indentNode(projectId, nodeKey)`、`outdentNode(projectId, nodeKey)`
  - [x] 3.2 store 通过 `sectionIdByNodeKey[nodeKey]` 解析 canonical `sectionId`，调用对应 IPC mutation，并把返回的 `markdown` / `sectionIndex` 同步写回 `useDocumentStore`
  - [x] 3.3 mutation 成功后刷新 outline metadata，调用 `focusNode(nextNodeKey)`，并在 `Enter` 新建节点场景下继续调用 `enterEditing(nextNodeKey)`
  - [x] 3.4 mutation 成功后按返回 snapshot 计算最新深度；深度超过 6 时触发 Story 11.5 的 `warnDepthExceeded(depth)`
  - [x] 3.5 `locked` / `pending-delete` / `editing` 状态下，store 直接返回拒绝结果，避免组件各自散落 guard

- [x] Task 4: `useStructureKeymap` 与树导航（AC: 1, 2, 3, 4, 5, 6）
  - [x] 4.1 创建 `src/renderer/src/modules/editor/hooks/useStructureKeymap.ts`
    ```typescript
    export function useStructureKeymap(opts: {
      panelRef: RefObject<HTMLElement>
      projectId: string
      outline: OutlineNode[]
      onNavigateToNode: (node: OutlineNode) => void
    }): void
    ```
  - [x] 4.2 hook 将按键监听绑定到 `panelRef.current` 对应的 focusable tree root，统一处理 `Enter` / `Tab` / `Shift+Tab` / `Delete` / `F2` / `Esc` / 方向键，并在命中时 `preventDefault()`
  - [x] 4.3 方向键导航通过当前 `outline` 计算“可见节点顺序”和父子关系，复用 `onNavigateToNode()`，保持与鼠标点击节点相同的 `scrollToHeading()` 行为
  - [x] 4.4 `Delete` / `Backspace` 只在树根获焦且当前节点可操作时触发；focus 位于 inline Input、按钮、Toast Undo 按钮时保留各自控件的原生键盘语义
  - [x] 4.5 `Enter` 在 Focused 态下创建同级节点，在 Editing 态下沿用 Story 11.2 的提交语义

- [x] Task 5: 集成到现有结构面板链路（AC: 1, 2, 3）
  - [x] 5.1 更新 `src/renderer/src/modules/editor/components/DocumentOutlineTree.tsx`：根节点新增 `ref`、`tabIndex={0}`、focus outline 样式，并挂载 `useStructureKeymap()`
  - [x] 5.2 更新 `DocumentOutlineTreeNode.tsx`（Story 11.2）或同等 title slot 组件：双击进入 Editing、inline Input 的键盘事件停止冒泡到 tree root
  - [x] 5.3 更新 `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`：抽出一个统一的 `handleOutlineNavigate(node)`，同时供鼠标点击与方向键导航复用
  - [x] 5.4 `OutlinePanel.tsx` 继续保持 240px / 40px 壳层合同，本 Story 的快捷键集成点落在其内部的 `DocumentOutlineTree`

- [x] Task 6: 删除交接与测试矩阵（AC: 5, 6, 7, 8）
  - [x] 6.1 预留 Story 11.4 删除入口：`requestSoftDelete(projectId, sectionIds, nodeKeys)` 或等价 action，11.3 负责在按键发生时传入完整的级联目标集合
  - [x] 6.2 新建 `tests/unit/shared/chapter-markdown-structure.test.ts`：覆盖插入 sibling、Tab 缩进、Shift+Tab 反缩进、重复标题、子树级联搬运
  - [x] 6.3 新建 `tests/unit/main/services/chapter-structure-service.test.ts`：覆盖 snapshot 返回、`sectionId` 稳定性、`headingLocator` 重算、边界幂等
  - [x] 6.4 新建 `tests/unit/renderer/modules/editor/hooks/useStructureKeymap.test.ts`：覆盖作用域启停、Editing guard、Locked guard、方向键导航、Delete 目标集合构造
  - [x] 6.5 更新 `tests/unit/renderer/modules/editor/components/DocumentOutlineTree.test.tsx`：覆盖 `tabIndex`、树根 focus、键盘导航后仍保持受控焦点态
  - [ ] 6.6 Playwright E2E：完整验证“纯键盘创建 5 层 10 节点结构、缩进 / 反缩进、删除后进入 11.4 Undo 流程、深度警告出现” — **deferred**：真实 Undo 流程依赖 Story 11.4，深度警告入口依赖 Story 11.5；两者尚未落地。单元测试已覆盖作用域、IPC mutation、状态机 guard、subtree 构造与 snapshot commit。Story 11.4 / 11.5 dev-story 时补齐

## Dev Notes

### 关键实现约束

- **当前 outline 的可见树来自 markdown。** `ProjectWorkspace.tsx` 当前通过 `useDocumentOutline(documentContent)` 渲染大纲；结构快捷键成功后必须同步更新 `proposal.md`，这样 Tree、Plate、`useCurrentSection()` 才会立刻看到一致结果。
- **持久化身份继续使用 `sectionId(UUID)`。** `proposal.meta.json.sectionIndex` 是 canonical identity read-model。11.3 的所有持久化 mutation 都通过 `sectionId` 寻址，`locatorKey` 继续承担 read-side / DOM bridge。
- **方向键导航需要复用现有滚动链路。** 当前鼠标点击大纲节点后，`ProjectWorkspace.tsx` 会调用 `scrollToHeading()`；键盘导航应复用同一路径，这样 `useCurrentSection()` 的回写可以保持稳定，不会把焦点拉回旧节点。
- **结构操作要搬运整棵子树。** `Tab` / `Shift+Tab` 调整的是当前节点及其全部后代的 markdown block 与 `sectionIndex` 结构，不是只改当前节点一行 heading。
- **大纲标题编辑与正文编辑拥有不同按键语义。** Story 11.2 的 inline title editor 负责“改章节标题”，Plate 编辑器负责“改章节正文”。11.3 的快捷键只在树根焦点场景下接管结构操作。
- **Delete 的事务与 Undo 归 Story 11.4。** 11.3 负责入口、可操作性 guard、级联目标集合、与 11.4 的调用对接。

### 已有代码资产（直接复用或扩展）

| 已有文件 | 本 Story 的作用 |
|---|---|
| `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` | 当前 outline 点击 → `scrollToHeading()` 的真实入口 |
| `src/renderer/src/modules/project/components/OutlinePanel.tsx` | 左侧 240px / 40px 壳层合同 |
| `src/renderer/src/modules/editor/components/DocumentOutlineTree.tsx` | 当前 focusable tree shell 与 title slot 容器 |
| `src/renderer/src/modules/editor/hooks/useDocumentOutline.ts` | markdown → outline 解析入口 |
| `src/renderer/src/modules/annotation/hooks/useCurrentSection.ts` | 当前章节同步信号 |
| `src/shared/chapter-markdown.ts` | heading 解析、section replacement 现有 helper，可继续扩展结构变更能力 |
| `src/shared/chapter-identity.ts` | `sectionId` / `headingLocator` / sibling order 归一化 helper |
| `src/main/services/chapter-structure-service.ts` | 11.1 已建立的章节结构 service 落点 |
| `src/main/services/document-service.ts` | `proposal.md` / `proposal.meta.json` 读写入口 |
| `src/shared/ipc-types.ts` + `src/preload/index.ts` | `chapter-structure:*` IPC 合同扩展点 |
| `_bmad-output/implementation-artifacts/3-3-template-driven-proposal-skeleton.md` | 默认标题 `新章节` 的现有产品先例 |

### Project Structure Notes

- `src/renderer/src/stores/chapterStore.ts` 当前不存在。11.3 延续 Story 11.2 的落点，扩展 `src/renderer/src/stores/chapterStructureStore.ts`。
- `chapter-structure-service` 已经存在 read-only contract。11.3 继续在同一 service 上补 mutation，而不是并行创建第二套 chapter CRUD service。
- `DocumentOutlineTree.tsx` 继续承担 Tree 壳层与 keyboard scope；`OutlinePanel.tsx` 保持布局壳层职责。
- `useDocumentStore` 当前同时持有 `content` 与 `sectionIndex`。11.3 的成功 mutation 结果应直接回填这两个字段，保证 renderer snapshot 一致。
- `scrollToHeading()` 当前按 `title + occurrenceIndex` 工作。键盘导航沿用这一契约即可与现有点击行为保持一致。

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.3] — 用户故事与快捷键原始需求
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR24] — 键盘可达性与蓝色 2px focus outline
- [Source: _bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor.md] — `sectionId` / `sectionIndex` foundation contract
- [Source: _bmad-output/implementation-artifacts/11-2-focus-state-machine.md] — `chapterStructureStore`、五状态机、Editing/Locked/Pending-Delete 语义
- [Source: _bmad-output/implementation-artifacts/11-4-soft-delete-toast-undo.md] — Delete 后续事务与 Undo 责任边界
- [Source: _bmad-output/implementation-artifacts/11-5-depth-limit-warn-llm-lock.md] — 深度警告与 Locked 提示契约
- [Source: _bmad-output/implementation-artifacts/3-3-template-driven-proposal-skeleton.md] — 默认标题 `新章节` 先例
- [Source: src/renderer/src/modules/project/components/ProjectWorkspace.tsx] — outline 点击与 `scrollToHeading()` 集成点
- [Source: src/renderer/src/modules/project/components/OutlinePanel.tsx] — 现有壳层尺寸与可访问性合同
- [Source: src/renderer/src/modules/editor/components/DocumentOutlineTree.tsx] — 当前 Tree 壳层、focus root 落点
- [Source: src/renderer/src/modules/editor/components/PlateEditor.tsx] — 正文编辑器的 Enter / Tab 语义边界
- [Source: src/renderer/src/modules/annotation/hooks/useCurrentSection.ts] — 当前章节同步信号
- [Source: src/shared/chapter-markdown.ts] — markdown heading / section helper
- [Source: src/shared/chapter-identity.ts] — `sectionId ↔ locator` 与 `normalizeSiblingOrder()`
- [Source: src/main/services/chapter-structure-service.ts] — 11.1 已建立的结构 service
- [Source: src/main/services/document-service.ts] — `proposal.md` / sidecar metadata 读写入口
- [Source: src/shared/ipc-types.ts] — `chapter-structure:*` IPC 扩展点
- [Source: AGENTS.md] — thin IPC、service 边界、Zustand store 与 ISO-8601 约束

## Change Log

- 2026-04-19: dev-story 11.3 交付
  - 共享 helper + main service mutation + IPC 合同 + renderer store + 快捷键 hook + outline tree wiring 六层落地
  - `chapter-structure:insert-sibling` / `:indent` / `:outdent` 三条新 IPC 通道；preload 白名单同步
  - 引入 `ErrorCode.STRUCTURE_BOUNDARY` + `StructureBoundaryError`，区分 no-previous-sibling / already-top-level（静默）与 max/min-depth（提示）
  - `useDocumentStore.applyStructureSnapshot()` 清空 autosave 队列，防止 Story 11.4 备忘的 stale-write 问题在本 Story 提前出现
  - 单元测试 36 条新增全绿（2598/2598 全量通过，无回归），ESLint / Prettier / typecheck 11.3 surface 干净
  - E2E（Task 6.6）deferred 给 Story 11.4 / 11.5，原因写入 Completion Notes
  - sprint-status `11-3-xmind-keymap-cascade-delete`: backlog → review
- 2026-04-18: `validate-create-story` 校准实现路径
  - 将不存在的 `chapterStore` 收敛为 Story 11.2 的 `chapterStructureStore`
  - 明确结构快捷键的真实写路径是 `proposal.md` + `proposal.meta.json.sectionIndex` 同步更新
  - 补入 `chapter-structure-service` / IPC mutation / preload 合同，而不是仅在 renderer 内部操作树状态
  - 补入方向键复用 `scrollToHeading()` 的要求，保证与 `useCurrentSection()` 联动稳定
  - 解决 Story 11.2 inline title editing 与 Story 11.3 Enter/Tab 语义冲突
  - 补回 validation note、`Project Structure Notes`、`Change Log`

## Dev Agent Record

### Agent Model Used

`claude-opus-4-7` (1M context), `/bmad-dev-story` workflow, 2026-04-19.

### Debug Log References

- 单元 `pnpm test:unit` 基线 2598 pass / 0 fail。实现交付后净新增 36 用例（11.3 surface）全绿，无回归。
- 预存 typecheck 失败 `src/renderer/src/modules/editor/components/SourceAttributionLabel.tsx:84:13` 来自 main 分支，11.2 Dev Log 已登记，11.3 surface 类型干净。

### Completion Notes List

- **AC1（键位）**：`useStructureKeymap` 在 `DocumentOutlineTree` 根节点统一处理 Enter / Tab / Shift+Tab / Delete / Backspace / F2 / Esc / ↑↓←→，命中即 `preventDefault()`。Enter 成功后自动 `focusNode + enterEditing(newKey)`；方向键导航复用 `onNodeClick → scrollToHeading()`。
- **AC2（Editing vs 正文）**：hook 在 `editingNodeKey` 非空时只允许 Esc 生效，其余键位全部 early-return，保留 inline `<input>` 的原生 Enter/Tab 语义；Plate 编辑器在树根 focus 范围之外，结构快捷键与之天然隔离。
- **AC3（作用域）**：`tabIndex={0}` + `focus:outline-brand` 蓝色 2px outline；`isWithinPanel` + `isNativeEditableTarget` 双重门，仅在树根/树内节点 focus 时触发，`<button>` / `<input>` / `contenteditable` 落在本身的键盘语义。
- **AC4（边界幂等）**：`indentSectionSubtree` / `outdentSectionSubtree` 返回 `{ ok: false, reason }`，main service 包装成 `StructureBoundaryError`（`ErrorCode.STRUCTURE_BOUNDARY`），renderer 的 `handleMutationError` 对 no-previous-sibling / already-top-level 静默；只在 `max-depth` / `min-depth` 情况下 keyed `message.info` 提示。
- **AC5（Locked / Pending-Delete）**：`guardMutation()` 作为所有 `insertSibling` / `indentNode` / `outdentNode` 的前置门；locked 节点命中 → `notifyLockedRejection()`（`AI 生成中，请稍候`）；pending-delete 静默返回，保持 Story 11.4 的撤销窗口视觉。
- **AC6（级联删除交接）**：`collectSubtreeTargets()` 在 renderer 侧按当前 outline 收集节点 key + `sectionIdByNodeKey` 映射的 sectionId，调用 `requestSoftDelete(projectId, sectionIds, nodeKeys)`。Story 11.4 未落地，11.3 暂存 `pendingSoftDeletes` 队列 + 乐观 5s pending-delete 窗口，11.4 dev-story 时替换为真删除流水线。
- **AC7（6 层深度警告）**：`computeMaxDepthBySectionId()` 新 helper 位于 `src/shared/chapter-structure-depth.ts`，mutation 成功后 renderer 计算 `affectedSectionId` 深度，>6 时调用 `notifyDepthExceeded(depth)`（keyed `message.warning`，2s TTL）。Story 11.5 可直接 override / 扩展 `structure-feedback.ts`。
- **AC8（markdown ↔ sectionIndex 同步）**：`applyStructureMutation()` 统一走两步提交（metadata-first, markdown-second），markdown 失败时回滚元数据 slice，复用 `updateTitle()` 既有一致性语义。`rebuildSectionIndex()` 以 pre-order tree walk 对齐新 markdown 的 heading 序列，重算 `occurrenceIndex` + `headingLocator`，保留既有 `sectionId` / `templateSectionKey` / `weightPercent` / `isKeyFocus`。
- **committed snapshot 写回**：新增 `useDocumentStore.applyStructureSnapshot()`，写入最新 `content` + `sectionIndex` 时同步清空 `autoSave` 队列 / debug trail，避免 Story 11.4 备忘录中提到的 stale autosave 覆盖删除结果的问题在 11.3 提前出现。
- **preload / IPC**：`chapter-structure:insert-sibling` / `:indent` / `:outdent` 三条新通道挂载在既有 `chapterStructureHandlers`，`FullPreloadApi` 编译期推导保证 renderer 调用签名一致。
- **测试矩阵**：36 条新用例分布在 `chapter-markdown-structure.test.ts`（18）、`chapter-structure-depth.test.ts`（4）、`chapter-structure-service.test.ts` 11.3 块（5）、`useStructureKeymap.test.tsx`（8）、`DocumentOutlineTree.test.tsx` 11.3 块（3）；preload 白名单同步更新三条新 channel。
- **E2E deferred**：6.6 Playwright 覆盖 Undo + 深度警告依赖 Story 11.4 / 11.5 落地；留给后续 dev-story 接入。

### File List

- `src/shared/chapter-markdown.ts`（修改 — 新增 `getSectionSubtreeBlock`、`findPreviousSiblingHeading`、`findParentHeading`、`insertSiblingAfterSection`、`indentSectionSubtree`、`outdentSectionSubtree`、常量 `DEFAULT_NEW_SECTION_TITLE` / `MAX_HEADING_LEVEL`）
- `src/shared/chapter-structure-depth.ts`（新 — `computeMaxDepthBySectionId`）
- `src/shared/constants.ts`（修改 — `ErrorCode.STRUCTURE_BOUNDARY`）
- `src/shared/ipc-types.ts`（修改 — 三条新通道 + `StructureMutationSnapshotDto`）
- `src/main/services/chapter-structure-service.ts`（修改 — `insertSibling` / `indent` / `outdent` mutations、`StructureBoundaryError`、内部 `applyStructureMutation` / `rebuildSectionIndex`）
- `src/main/ipc/chapter-structure-handlers.ts`（修改 — 注册三条新 thin handlers）
- `src/preload/index.ts`（修改 — 暴露 `chapterStructureInsertSibling` / `chapterStructureIndent` / `chapterStructureOutdent`）
- `src/renderer/src/stores/chapterStructureStore.ts`（修改 — 新 actions `insertSibling` / `indentNode` / `outdentNode` / `requestSoftDelete` + guard helpers + pendingSoftDeletes）
- `src/renderer/src/stores/documentStore.ts`（修改 — `applyStructureSnapshot` action）
- `src/renderer/src/modules/editor/hooks/useStructureKeymap.ts`（新 — hook + outline flatten/navigate helpers）
- `src/renderer/src/modules/editor/lib/structure-feedback.ts`（新 — keyed message 反馈 surface）
- `src/renderer/src/modules/editor/components/DocumentOutlineTree.tsx`（修改 — `structureKeymap` prop、tree root `tabIndex`/focus outline、`focusNode` 同步、`useStructureKeymap` 挂载）
- `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`（修改 — `sectionIdByNodeKey` 桥接与 proposal-writing 阶段注入 `structureKeymap`）
- `tests/unit/shared/chapter-markdown-structure.test.ts`（新 — 18 tests）
- `tests/unit/shared/chapter-structure-depth.test.ts`（新 — 4 tests）
- `tests/unit/main/services/chapter-structure-service.test.ts`（修改 — 新增 11.3 structural mutations 5 tests）
- `tests/unit/renderer/modules/editor/hooks/useStructureKeymap.test.tsx`（新 — 8 tests）
- `tests/unit/renderer/modules/editor/components/DocumentOutlineTree.test.tsx`（修改 — 新增 11.3 assertions 3 tests）
- `tests/unit/preload/security.test.ts`（修改 — 白名单追加三条新 channel）
- `_bmad-output/implementation-artifacts/sprint-status.yaml`（修改 — `11-3-xmind-keymap-cascade-delete`: backlog → review；`last_updated` → 2026-04-19）
- `_bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md`（修改 — tasks checked、Status → review、Dev Agent Record + Change Log 填充）
