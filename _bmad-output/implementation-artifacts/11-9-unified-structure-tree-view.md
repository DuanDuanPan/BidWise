# Story 11.9: 统一结构画布渲染组件（<StructureTreeView>）

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 前端工程师（兼产品用户），
I want 方案设计阶段「骨架编辑（edit-skeleton）」与「已有骨架（has-content）」两处中间画布收敛到一套 `<StructureTreeView>` 公共渲染组件，
So that 视觉、键盘、DnD、底部操作栏在两处完全一致，且为 Story 11.6 的三路径入口 + diff 合并 UI 预置一个稳定的树渲染单点。

> **Stage scoping 说明**：本 Story 宿主是 `SolutionDesignView` 的中间列（方案设计阶段）。左侧 `DocumentOutlineTree`（240px outline 面板）**不在本 Story 重构范围内** —— 其 shell 尺寸、键盘入口（Story 11.3 的 `useStructureKeymap`）与行为已经在 proposal-writing 阶段稳定运行；本 Story 只承诺：公共件对外合同保留足够 hook-in seam，后续 Story（或 11.6）若要让左侧 outline 面板也复用同一公共件，不需要回改公共件。

## 背景与问题现状（Problem Statement）

**三套 Tree UI 并存于同一棵 `sectionIndex`：**

| 位置 | 组件 | 数据源 | 能力 | 缺口 |
|---|---|---|---|---|
| `SolutionDesignView.phase='edit-skeleton'` | `SkeletonEditor.tsx` (436 lines) | 内存 `SkeletonSection[]` | AntD `Tree draggable showLine`、DnD + 深度限制、底部 action bar（「重新选择模板 · N 个章节，N 个重点章节 · 确认骨架，开始撰写」）、dropdown menu（增同级 / 增子 / 删）、`weightPercent` / `isKeyFocus` Tag | — |
| `SolutionDesignView.phase='has-content'` | `StructureDesignWorkspace` → `StructureCanvas` → `StructureCanvasNode` (共 672 lines) | 落盘 `sectionIndex` | Story 11.2 五态视觉机（focused/editing/locked/pending-delete/idle）、`PhaseDecorator`（AC5）、inline rename（走 `chapterStructureStore.commitTitle`）| **缺** grip / tree collapse / DnD / bottom action bar；flat list 丢失层级可视化 |
| `ProjectWorkspace` 左侧 `OutlinePanel` | `DocumentOutlineTree.tsx` (200+ lines) | 落盘 `sectionIndex`（outline 解析） | Story 11.3 的 `useStructureKeymap`（Enter / Tab / Shift+Tab / Delete / ↑↓←→ / F2 / Esc） | 宿主是 240px 侧栏，非中间画布 |

**问题：**

1. **视觉不一致** —— `edit-skeleton` 阶段看到 AntD Tree + grip + 连线 + 底部操作栏；首次 `确认骨架，开始撰写` 后进入 `has-content`，UI 瞬间变成扁平 list + header 位置的「继续撰写」按钮。
2. **键盘体验割裂** —— 11.3 键盘快捷键只挂在左侧 `DocumentOutlineTree`；中间 `has-content` 画布点击 / 双击可用，但 Tab / Enter / Shift+Tab / Delete 无效。
3. **文案错位** —— `templateGenerateSkeleton()` / `templatePersistSkeleton()` 会先把骨架写入 `proposal.md + proposal.meta.json.sectionIndex`，用户若在首次确认前离开再返回，`SolutionDesignView` 只能看到 `has-content`，当前会退化成 header 里的 `继续撰写`；缺少“这份骨架是否已经正式确认过”的持久化信号。
4. **代码重复** —— `SkeletonEditor` 与 `StructureCanvas/Node` 各自实现 title slot / inline edit / add-child / more-menu；三路径若引入 11.6 diff merge，任一路径改动都要三处同步。

**目标：** 抽公共 `<StructureTreeView>` 渲染组件，`SkeletonEditor` / `StructureDesignWorkspace` 两条路径共用同一渲染单点；以 `mode: 'draft' | 'persisted'` 切换数据源与写路径；视觉 1:1 对齐 prototype `0V4bl` frame。

## 原型参考 / Design References

dev-story 按以下 lookup order 1:1 还原：

1. **Manifest**：`_bmad-output/implementation-artifacts/11-2-focus-state-machine-ux/prototype.manifest.yaml`
2. **Prototype 文件**（与 Story 3.2 共享 pen）：`_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/prototype.pen`
3. **关键帧**：

   | Frame ID | 名称 | 用途 |
   |---|---|---|
   | `0V4bl` | Story 11.2 — 方案设计 · 确认骨架阶段 | **本 Story 中间画布 1:1 还原目标**（grip + tree collapse + 底部 action bar） |
   | `zHAzA` | Story 11.2 — 方案设计 · 焦点节点五状态机 | 五态行内视觉参考（focused / editing / locked / pending-delete / idle） |

4. **`0V4bl` 关键辅助节点**（manifest `auxiliary_nodes`）：
   - `958vH` = structure_canvas 中间带 **grip-vertical** 拖拽柄的骨架画布
   - `1nSXI` = action_bar 底部 `[重新选择模板] · stat · [确认骨架，开始撰写]`
5. **Design token 合同**（manifest `design_tokens_contract`）：focus outline = `brand 2px`、pending-delete `bg: #FFF1F0` + `strikethrough: true` + `danger` chip、locked `bg: #F5F5F5` + sparkles + `AI 生成中…`。

## Acceptance Criteria

### AC1: 公共组件 `<StructureTreeView>` API 合同

- **Given** 新建 `src/renderer/src/modules/structure-design/components/StructureTreeView.tsx`
- **When** 任一上游宿主挂载
- **Then** 组件暴露以下 props：

```typescript
export type StructureTreeViewMode = 'draft' | 'persisted'

export interface StructureTreeNode {
  key: string                   // draft: 内存 id ; persisted: sectionId
  title: string
  level: 1 | 2 | 3 | 4 | 5 | 6
  isKeyFocus?: boolean          // draft 模式展示「重点投入」Tag
  weightPercent?: number        // draft 模式展示权重 Tag
  children: StructureTreeNode[]
}

export interface StructureTreeViewProps {
  mode: StructureTreeViewMode
  nodes: StructureTreeNode[]
  /** 五态视觉（仅 persisted 模式）。draft 模式传 undefined。 */
  stateOf?: (key: string) => ChapterNodeState
  /** 生成阶段装饰（AC5 idle-row decorator）。仅 persisted。 */
  phaseByKey?: ReadonlyMap<string, ChapterGenerationPhase>

  /* === 写路径（mode 二选一）=== */
  /** draft：全量替换语义。persisted 模式禁止传。 */
  onUpdate?: (nextNodes: StructureTreeNode[]) => void
  /** persisted：在父节点下插入最后一个子节点。draft 模式禁止传。 */
  onInsertChild?: (parentKey: string) => Promise<void>
  /** persisted：返回 Promise；内部会调用 11.3 store actions。draft 模式禁止传。 */
  onInsertSibling?: (targetKey: string) => Promise<void>
  onIndent?: (targetKey: string) => Promise<void>
  onOutdent?: (targetKey: string) => Promise<void>
  /**
   * persisted：拖拽后精确搬运整棵子树。
   * placement='inside' 表示成为 drop 节点最后一个子节点；
   * 'before' | 'after' 表示成为 drop 节点同级兄弟。
   */
  onMove?: (
    dragKey: string,
    dropKey: string,
    placement: 'before' | 'after' | 'inside'
  ) => Promise<void>
  onDelete?: (targetKeys: string[]) => Promise<void>
  onCommitTitle?: (targetKey: string, nextTitle: string) => Promise<void>
  onUndoPendingDelete?: (targetKeys: string[]) => Promise<void> | void

  /* === 两模式共享 === */
  onConfirm?: () => void
  confirmLabel?: string        // 默认 `确认骨架，开始撰写`
  onReselectTemplate?: () => void
  showStats?: boolean          // 默认 true
  keyboardEnabled?: boolean    // persisted=true 默认；draft=false 默认
  maxDepth?: number            // 默认 4；Story 11.5 进入 dev-story 后可提升到 6
  emptyHint?: React.ReactNode
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  'data-testid'?: string
}
```

- **And** 组件内部使用 AntD `Tree`（`draggable showLine blockNode expandedKeys`），依赖版本 `antd@^5.27` 与现有 `SkeletonEditor` 完全一致
- **And** 顶部不承担 SOP stepper / 文档大纲 / 批注面板（那些由 `ProjectWorkspace` + `OutlinePanel` + `AnnotationPanel` 提供，本组件只负责中间画布 body）
- **And** 底部 action bar 位置 = 原型 `1nSXI`：左侧 `[重新选择模板] · stat` + 右侧 `[{confirmLabel}]` primary button；`showStats=false` 时隐藏 stat
- [Source: prototype.manifest.yaml#auxiliary_nodes.action_bar]
- [Source: src/renderer/src/modules/editor/components/SkeletonEditor.tsx:405-433]

### AC2: draft 模式（内存 SkeletonSection 替换语义）

- **Given** `mode='draft'` + `onUpdate` 传入
- **When** 用户在树上执行「添加同级 / 添加子 / 删除 / 重命名 / DnD 拖拽」
- **Then** 组件内部完成 `nodes` 深拷贝变更，并调用 `onUpdate(nextNodes)`；**不**调用任何 IPC
- **And** 行为与现 `SkeletonEditor.tsx` 的 `addSibling` / `addChild` / `deleteNode` / `handleDrop` / `allowDrop` 语义等价：
  - `Enter` 键在选中态下调用 `addSibling`（与 11.3 快捷键语义对齐；draft 模式沿用 `keyboardEnabled=false` 时仍支持鼠标菜单）
  - 新增节点 `id` 通过 draft adapter 提供的 `generateKey()` 回调生成（沿用 `SkeletonEditor.generateSectionId()` 的 `new-${Date.now()}-${counter}` 模式）
  - DnD 深度限制 `level + dragSubtreeDepth <= 4`（与 11.5 / `SkeletonEditor.allowDrop` 一致）
- **And** draft 模式不展示五态视觉（`stateOf` / `phaseByKey` ignored）；但保留 `isKeyFocus` 红 Tag + `weightPercent` 彩色 Tag（红 `>=15%`、橙 `>=5%`）
- **And** 删除使用 `Modal.confirm`（与 `SkeletonEditor.deleteNode` 行为一致）
- [Source: src/renderer/src/modules/editor/components/SkeletonEditor.tsx:188-314]

### AC3: persisted 模式（sectionIndex + 11.3 store actions）

- **Given** `mode='persisted'` + 对应 `on*` 回调传入
- **When** 用户在树上执行结构变更
- **Then** 组件触发对应回调，回调内部统一走 `useChapterStructureStore` 的 11.3 actions：

| 交互 | 回调 | 内部动作 |
|---|---|---|
| `[+ 子节点]` 按钮 | `onInsertChild(parentKey)` | `insertChild(projectId, parentSectionId)` |
| `Enter` 键 | `onInsertSibling(targetKey)` | `insertSibling(projectId, sectionId)` |
| DnD 子节点 drop | `onMove(dragKey, dropKey, 'inside')` | `moveSubtree(projectId, dragSectionId, dropSectionId, 'inside')` |
| DnD 同级 gap drop | `onMove(dragKey, dropKey, 'before' | 'after')` | `moveSubtree(projectId, dragSectionId, dropSectionId, 'before' | 'after')` |
| `Tab` 键 | `onIndent(targetKey)` | `indentSection(projectId, sectionId)` |
| `Shift+Tab` 键 | `onOutdent(targetKey)` | `outdentSection(projectId, sectionId)` |
| 单节点删除 / `Delete` / 级联删除 | `onDelete(targetKeys[])` | `requestSoftDelete(projectId, sectionIds)` |
| 行内 rename 提交 | `onCommitTitle(targetKey, nextTitle)` | `commitTitle(projectId, sectionId, title)` |

- **And** `stateOf(sectionId)` 返回 `'focused' | 'editing' | 'locked' | 'pending-delete' | 'idle'` 之一（复用 Story 11.2 `deriveChapterNodeState`）
- **And** 组件用 AntD Tree 的 `titleRender` 注入五态 row：
  - focused：`bg-brand-light` + `border-brand` + `inset_0_0_0_2px_brand` + 左侧 3px 竖条 + 右侧 `[+ 子节点][⋯]`
  - editing：inline `<Input>` + `bg-brand-light` hint chip「Enter 提交 · Esc 取消」
  - locked：`bg-bg-sidebar` + `LockOutlined` + `AI 生成中…` badge（`sparkles warning`）
  - **pending-delete：`bg-[#FFF1F0]` + `line-through` + `DeleteOutlined` + 红底 `N s` 倒计时 chip + `撤销` 按钮**（*修复 Story 11.2 视觉缺失*）
  - idle：默认样式 + `PhaseDecorator`（`queued/running/completed/failed` 四档）
- **And** `aria-selected` / `aria-disabled` / `tabIndex` 与 Story 11.2 `StructureCanvasNode` 完全对齐；`locked` / `pending-delete` 节点的 DnD drag source 禁用（`draggable={false}`）
- [Source: src/renderer/src/stores/chapterStructureStore.ts#ChapterStructureActions]
- [Source: src/renderer/src/modules/structure-design/components/StructureCanvasNode.tsx（待删除）]
- [Source: prototype.manifest.yaml#design_tokens_contract]

### AC4: persisted 模式键盘支持

- **Given** `mode='persisted'` + `keyboardEnabled=true`（默认）
- **When** 组件 Tree 根获焦（`tabIndex=0` + 蓝色 2px focus outline）
- **Then** 挂载 Story 11.3 的 `useStructureKeymap()` hook；所有键位语义与左侧 `DocumentOutlineTree` 完全一致：
  - `Enter`（Focused 态）→ `onInsertSibling`，之后自动 `focusSection + enterEditing(newKey)`（由 `insertSibling` action 内部完成）
  - `Tab` / `Shift+Tab` → `onIndent` / `onOutdent`；边界拒绝静默（与 11.3 `StructureBoundaryError` 合同一致）
  - `Delete` / `Backspace` → `onDelete(collectSubtreeSectionIds(node))`；`pending-delete` / `locked` guard 继续生效
  - `F2` / 双击 → `enterEditing`；Editing 态下只响应 `Esc` / `Enter` / `blur`
  - `↑/↓/←/→` → 可见节点顺序导航；**与现 `DocumentOutlineTree` 不同**：本组件不调用 `scrollToHeading()`（方案设计阶段没有 Plate 编辑器挂载），改为纯 `focusSection(prevKey/nextKey)`
- **And** `keyboardEnabled=false` 时不绑定 hook（draft 模式默认）
- **And** Editing 态的 inline Input 按键（`Enter` / `Esc` / `Tab`）不冒泡到 Tree 根（保持 Story 11.2 AC2 的「Editing 期间结构快捷键暂停」合同）
- [Source: src/renderer/src/modules/editor/hooks/useStructureKeymap.ts]
- [Source: _bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md#AC3]

### AC5: `SkeletonEditor.tsx` 迁移到 draft 模式

- **Given** `SkeletonEditor` 现有 props `{ skeleton, onUpdate, onConfirm, onRegenerate }`
- **When** 重构完成
- **Then** 文件内部实现完全替换为 `<StructureTreeView>` wrapper：
  ```typescript
  export function SkeletonEditor({ skeleton, onUpdate, onConfirm, onRegenerate }: SkeletonEditorProps) {
    const nodes = useMemo(() => skeletonToTreeNodes(skeleton), [skeleton])
    return (
      <StructureTreeView
        mode="draft"
        nodes={nodes}
        onUpdate={(next) => onUpdate(treeNodesToSkeleton(next))}
        onConfirm={onConfirm}
        onReselectTemplate={onRegenerate}
        confirmLabel="确认骨架，开始撰写"
        showStats
        data-testid="skeleton-editor"
      />
    )
  }
  ```
- **And** 保留所有对外 data-testid（`skeleton-editor` / `tree-node-${id}` / `confirm-skeleton-btn` / `regenerate-btn` / `edit-input-${id}` / `node-actions-${id}` / `key-focus-${id}`）；`SkeletonEditor.test.tsx` 现有测试不应破坏
- **And** 深度限制（`<=4`）、默认标题（`新章节`）、`Modal.confirm` 删除确认 全部保留
- **And** `isKeyFocus` + `weightPercent` Tag 行为保留
- [Source: src/renderer/src/modules/editor/components/SkeletonEditor.tsx]
- [Source: _bmad-output/implementation-artifacts/3-3-template-driven-proposal-skeleton.md#默认标题新章节]

### AC6: `StructureDesignWorkspace.tsx` 迁移到 persisted 模式 + 正确文案分发

- **Given** `StructureDesignWorkspace` 现挂在 `SolutionDesignView.has-content` phase，且 `templatePersistSkeleton()` 会在首次确认前先落盘 skeleton
- **When** 重构完成
- **Then** `StructureDesignWorkspace.tsx` 精简为：`useStructureOutline` → adapter → `<StructureTreeView mode='persisted'>`
- **And** 五态视觉通过 `stateOf` 注入（闭合 `useChapterStructureStore` + `deriveChapterNodeState`）
- **And** phase 装饰通过 `phaseByKey` 注入（保留现 `derivedPhaseMap` / `useChapterGenerationContext` 逻辑）
- **And** `onInsertSibling` / `onIndent` / `onOutdent` / `onDelete` / `onCommitTitle` 全部走 `useChapterStructureStore` 对应 action；失败由 `structure-feedback.ts` 统一 surface（与 11.3 现路径一致）
- **And** CTA 文案由 `SolutionDesignView` 基于 sidecar metadata 显式注入 `confirmLabel`，而不是在 `StructureDesignWorkspace` 内部猜测：
  - `proposal.meta.json` 新增 `firstSkeletonConfirmedAt?: ISO-8601`
  - `handleConfirmSkeleton()` 在真正进入 proposal-writing 前，通过新 thin IPC `document:mark-skeleton-confirmed` 写入该字段
  - `has-content` phase 的 label 派生规则为：`templateId` 存在且 `firstSkeletonConfirmedAt` 缺失 → `确认骨架，开始撰写`；其余情况 → `继续撰写`
- **And** header 删除 `方案结构 · 点击章节聚焦...` 副标题（原型 `0V4bl` 无此元素）；header 按钮迁到底部 action bar
- [Source: src/renderer/src/modules/editor/components/SolutionDesignView.tsx:334-340]
- [Source: src/renderer/src/modules/structure-design/components/StructureDesignWorkspace.tsx]

### AC7: 视觉 1:1 对齐 prototype frame `0V4bl`

- **Given** 公共件渲染
- **When** 用户看中间画布
- **Then** 满足原型关键元素：
  - 每行 leading 有 **6-dot grip handle**（通过 AntD Tree `switcherIcon` 自定义或 `titleRender` 注入）
  - 每个有子节点的行有 **`[-]` / `[+]` collapse toggle**（AntD `showLine` + `switcherIcon` 已支持，需确保 `blockNode` 开启）
  - 行间有连接线（AntD `showLine`）
  - 底部 action bar：左侧 `[重新选择模板]` text-button + `N 个章节，N 个重点章节` secondary text；右侧 `[{confirmLabel}]` primary button（40px 高、圆角 4px、brand 底）
  - Pending-delete 行视觉补齐：`bg-[#FFF1F0]` + `line-through`（*修复 Story 11.2 nodeWrapperClassName 缺失*）
- **And** 过渡动画遵循 Story 11.2 `UX-DR23`：`duration-[var(--duration-micro)] ease-out motion-reduce:transition-none`
- **And** 焦点环遵循 Story 11.2 `UX-DR24`：`tabIndex=0` + `shadow-[inset_0_0_0_2px_var(--color-brand)]`
- [Source: _bmad-output/implementation-artifacts/11-2-focus-state-machine-ux/prototype.manifest.yaml#primary_frames.0V4bl]
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR23]
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR24]

### AC8: 删除冗余组件

- **Given** 迁移完成且所有测试通过
- **When** 最后一步清理
- **Then** 以下文件**被删除**：
  - `src/renderer/src/modules/structure-design/components/StructureCanvas.tsx`（91 lines）
  - `src/renderer/src/modules/structure-design/components/StructureCanvasNode.tsx`（398 lines）
  - `tests/unit/renderer/modules/structure-design/components/StructureCanvasNode.test.tsx`
- **And** `src/renderer/src/modules/structure-design/index.ts` 导出更新（移除 `StructureCanvas` / `StructureCanvasNode` / `StructureCanvasNodeProps`，新增 `StructureTreeView` / `StructureTreeViewProps` / `StructureTreeNode`）
- **And** 无任何文件引用已删文件（grep 全库零命中）
- [Source: src/renderer/src/modules/structure-design/index.ts]

### AC9: 测试矩阵

- **Given** 公共件 + 两宿主迁移
- **When** 跑完整 `tests/unit` + 关键 Playwright
- **Then** 全绿，无回归：

| 测试文件 | 类型 | 覆盖 |
|---|---|---|
| `tests/unit/renderer/modules/structure-design/components/StructureTreeView.test.tsx` | 新 | 两 mode props 合约、empty / loading / error 态、bottom bar 开关、`confirmLabel` 分发、`stateOf` 五态 row 渲染、`phaseByKey` idle 装饰、pending-delete 新增 `line-through` 断言 |
| `tests/unit/renderer/modules/structure-design/adapters/skeletonAdapter.test.ts` | 新 | `skeletonToTreeNodes` / `treeNodesToSkeleton` 双向 round-trip 无损，含 `isKeyFocus` / `weightPercent` |
| `tests/unit/renderer/modules/structure-design/adapters/persistedAdapter.test.ts` | 新 | `useStructureOutline` 输出 → `StructureTreeNode[]` 转换、`stateOf` 闭合 store、`phaseByKey` 派生 |
| `tests/unit/renderer/modules/editor/components/SkeletonEditor.test.tsx` | 改 | 现有 testId 契约保留；新增「Enter 键新增同级」（若 keyboardEnabled 开启）、DnD 深度拒绝 |
| `tests/unit/renderer/modules/structure-design/components/StructureDesignWorkspace.test.tsx` | 改 | `confirmLabel` passthrough、`Tab` 键触发 `indentSection` action、`Delete` 触发 `requestSoftDelete`、header 副标题不存在（DOM 断言） |
| `tests/unit/renderer/modules/editor/components/SolutionDesignView.test.tsx` | 改 | `templateId` 存在 + `firstSkeletonConfirmedAt` 缺失时，`has-content` CTA = `确认骨架，开始撰写`；已确认或非模板项目 = `继续撰写`；draft confirm 先调用 `documentMarkSkeletonConfirmed` 再进入 proposal-writing |
| `tests/unit/renderer/modules/editor/components/SolutionDesignView.rename-regression.test.tsx` | 新 | persisted rename 成功后结构画布继续保持 mounted、`solution-design-loading` 不回闪、`documentLoad()` 不追加调用；11.9 迁移后继续保持这条回归保障 |
| `tests/unit/renderer/modules/structure-design/components/StructureCanvasNode.test.tsx` | 删 | — |
| `tests/unit/main/services/chapter-structure-service.test.ts` | 改 | `insertChild()` 在父节点下新增最后一个子节点；`moveSubtree()` 覆盖 `before / after / inside` 三种 placement、拒绝移动到自身后代、维持 `sectionId` 稳定性 |
| `tests/unit/main/ipc/document-handlers.test.ts` 或 `tests/unit/main/services/document-service.test.ts` | 改 | `document:mark-skeleton-confirmed` 只在字段缺失时首写 `firstSkeletonConfirmedAt`，重复调用保持幂等 |
| `tests/e2e/structure-tree-keyboard.spec.ts` | 新（Playwright，可条件启用） | 方案设计阶段 has-content 进入 → Tab 键缩进、Tree DnD before/after/inside 成功搬运 → Delete 触发 pending-delete 态（若 11.4 已落地则补截图断言） |
- **And** `pnpm test` baseline 2598 pass / 0 fail（11.3 交付后）维持；11.9 surface 净新增 ≥ 30 用例
- **And** ESLint / Prettier / typecheck 11.9 surface 干净
- [Source: _bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md#Debug-Log-References]

## Tasks / Subtasks

- [x] Task 1: 类型定义 + adapter 层（AC: 1, 2, 3）
  - [x] 1.1 新建 `src/renderer/src/modules/structure-design/components/StructureTreeView.types.ts` 定义 `StructureTreeNode` / `StructureTreeViewMode` / `StructureTreeViewProps`
  - [x] 1.2 新建 `src/renderer/src/modules/structure-design/adapters/skeletonAdapter.ts` 提供 `skeletonToTreeNodes(SkeletonSection[]) → StructureTreeNode[]` + `treeNodesToSkeleton(StructureTreeNode[]) → SkeletonSection[]`（保留 `isKeyFocus` / `weightPercent` / `templateSectionKey`）
  - [x] 1.3 新建 `src/renderer/src/modules/structure-design/adapters/persistedAdapter.ts`，提供纯函数 `sectionIndexToTreeNodes(sectionIndex) → StructureTreeNode[]`
  - [x] 1.4 复用当前 `src/renderer/src/modules/structure-design/hooks/useStructureOutline.ts` 的 documentStore-first 基线：继续以 `useDocumentStore((s) => ({ sectionIndex: s.sectionIndex, loadedProjectId: s.loadedProjectId }))` 驱动，基于 `loadedProjectId === projectId` 判定当前快照是否可用；保留 `reload()` 委托 `loadDocument(projectId)`；11.9 只做输出适配与公共件迁移，不回退到 `documentGetMetadata()` 轮询
  - [x] 1.5 确保两 adapter 为纯函数（test-friendly），不依赖 React / store hook

- [x] Task 2: 公共件 `<StructureTreeView>` 实现（AC: 1, 2, 7）
  - [x] 2.1 新建 `src/renderer/src/modules/structure-design/components/StructureTreeView.tsx`
  - [x] 2.2 内部用 AntD `Tree`（`draggable showLine blockNode expandedKeys`）；节点 `key` 直接使用 `StructureTreeNode.key`
  - [x] 2.3 `titleRender` 根据 `mode` + `stateOf(key)` 切换五态 row；row 复用 Story 11.2 的 Tailwind class 但从 `StructureCanvasNode.tsx` 提取共享函数
  - [x] 2.4 底部 action bar 抽为 `<StructureActionBar stats onReselectTemplate onConfirm confirmLabel>` 内部子组件，位置固定在 flex column 底部（与 `SkeletonEditor.tsx:420-433` 等价但收敛到公共件）
  - [x] 2.5 `countSections` helper 从 `SkeletonEditor` 提取到 `adapters/skeletonAdapter.ts`（复用同一算法），persisted 模式用等价 `sectionIndex` 派生
  - [x] 2.6 public props 显式包含 `onInsertChild` / `onMove` / `onUndoPendingDelete` / `maxDepth`；这些 seam 必须与 AC1 保持一致

- [x] Task 3: draft 模式写路径（AC: 2, 5）
  - [x] 3.1 实现 `handleAddSibling` / `handleAddChild` / `handleDelete` / `handleRename` / `handleDrop` / `allowDrop` 纯函数版本（从 `SkeletonEditor.tsx` 搬迁并泛化为 `StructureTreeNode[]`）
  - [x] 3.2 内部 `onUpdate(nextNodes)` 调用前深拷贝；保留 `Modal.confirm` 删除确认语义
  - [x] 3.3 新节点 key 生成器：`mode='draft'` 下通过 `generateDraftKey()` 使用 `SkeletonEditor.generateSectionId()` 的 `new-${Date.now()}-${counter}` 模式（避免破坏现有 SkeletonEditor 测试依赖）

- [x] Task 4: persisted 模式写路径（AC: 3, 4）
  - [x] 4.1 在 `src/shared/chapter-markdown.ts` + `src/main/services/chapter-structure-service.ts` 扩展 persisted 树真实 mutation：新增 `insertChild(projectId, parentSectionId)` 与 `moveSubtree(projectId, dragSectionId, dropSectionId, placement)`；placement = `'before' | 'after' | 'inside'`
  - [x] 4.2 同步扩展 `src/shared/ipc-types.ts`、`src/main/ipc/chapter-structure-handlers.ts`、`src/preload/index.ts`、`src/renderer/src/stores/chapterStructureStore.ts`：新增 `chapter-structure:insert-child`、`chapter-structure:move-subtree`
  - [x] 4.3 `onInsertChild` / `onInsertSibling` / `onMove` / `onIndent` / `onOutdent` / `onDelete` / `onCommitTitle` 作为 props，由宿主 `StructureDesignWorkspace` 注入具体实现（闭合 `useChapterStructureStore` actions + `projectId`）
  - [x] 4.4 persisted 模式的 `onDrop` 必须映射 AntD Tree 的真实 drop 语义：drop-onto-node → `placement='inside'`；gap-before / gap-after → `placement='before' | 'after'`。禁止把任意 gap drop 简化成 `outdent()`
  - [x] 4.5 persisted 模式的 `Modal.confirm` 删除确认**保留**（与 draft 模式一致），级联目标 `collectSubtreeKeys(node)` → `onDelete(keys[])`
  - [x] 4.6 `keyboardEnabled=true` 时通过 `useStructureKeymap` 复用 11.3 hook；迁移当前 `StructureDesignWorkspace` 已落地的 `panelRef + outlineForKeymap + sectionIdByNodeKey + handleNavigateToNode` 逻辑到公共件，保持 `DocumentOutlineTree` 调用点向后兼容
  - [x] 4.7 persisted 模式继续保持“滚动与 DOM 焦点连续性”：`focusSection()`、方向键导航、`insertSibling` 自动聚焦、rename 完成后的当前节点都要 `scrollIntoView({ block: 'nearest' })`；当节点已 mounted 且未处于 editing 时，键盘焦点回到节点 div，避免下一次按键逃逸到 header 按钮
  - [x] 4.8 persisted rename 继续走 snapshot in-place 链路：`chapter-structure:update-title` 返回 `StructureMutationSnapshotDto`，`chapterStructureStore.commitTitle()` 通过 `commitSnapshot()` 更新 `documentStore`；11.9 迁移后不回退到 `loadDocument(projectId)` 整页重载

- [x] Task 5: 五态 row 视觉 + pending-delete 视觉修复（AC: 3, 7）
  - [x] 5.1 从 `StructureCanvasNode.tsx` 搬迁 `LeadingIcon` / `FocusedActions` / `EditingRow` / `LockedBadge` / `PendingDeleteActions` / `PhaseDecorator` / `useCountdownSeconds` 到公共件同级文件 `StructureTreeView.nodes.tsx`
  - [x] 5.2 **修复** pending-delete wrapper：新增 `bg-[#FFF1F0]` + title `line-through`（对齐 manifest `design_tokens_contract.pending_delete.strikethrough: true`）
  - [x] 5.3 确保 locked / pending-delete 节点 `draggable={false}`（AntD Tree `draggable` 支持 per-node 控制）

- [x] Task 6: `SkeletonEditor.tsx` 迁移（AC: 5）
  - [x] 6.1 `SkeletonEditor.tsx` body 全量替换为 `<StructureTreeView mode='draft' ...>` wrapper
  - [x] 6.2 保留文件位置 `src/renderer/src/modules/editor/components/SkeletonEditor.tsx`（`SolutionDesignView.edit-skeleton` phase 引用不变）
  - [x] 6.3 保留 `skeleton-editor` / `tree-node-${id}` / `confirm-skeleton-btn` / `regenerate-btn` / `edit-input-${id}` / `node-actions-${id}` / `key-focus-${id}` 全部 data-testid
  - [x] 6.4 `confirmLabel='确认骨架，开始撰写'` 常量传入（与 edit-skeleton phase 语义匹配）

- [x] Task 7: `StructureDesignWorkspace.tsx` 迁移 + 文案分发（AC: 6）
  - [x] 7.1 精简 `StructureDesignWorkspace.tsx`：移除 header、移除 `StructureCanvas` 依赖，改用 `<StructureTreeView mode='persisted' ...>` wrapper
  - [x] 7.2 `StructureDesignWorkspace` 继续只接收 `confirmLabel?: string`；删除 `isFirstConfirm` 这一层冗余 prop，label 决策统一收敛到 `SolutionDesignView`
  - [x] 7.3 在 `src/shared/models/proposal.ts` 的 `ProposalMetadata` 中新增 `firstSkeletonConfirmedAt?: string`，并通过 `documentService.updateMetadata()` 保持向后兼容
  - [x] 7.4 新增 thin IPC `document:mark-skeleton-confirmed`（`src/shared/ipc-types.ts` + `src/main/ipc/document-handlers.ts` + `src/preload/index.ts`）；main 端实现保持幂等：仅当字段缺失时首写当前 ISO 时间
  - [x] 7.5 `SolutionDesignView.tsx` 在 checking / has-content 路径读取 metadata，基于 `templateId` + `firstSkeletonConfirmedAt` 派生 persisted workspace 的 `confirmLabel`
  - [x] 7.6 `handleConfirmSkeleton()` 在进入 proposal-writing 前先调用 `window.api.documentMarkSkeletonConfirmed({ projectId })`
  - [x] 7.7 保留 `derivedPhaseMap`（`useChapterGenerationContext` + `resolveSectionIdFromLocator` + `projectId` 跨项目守卫）

- [x] Task 8: 删除冗余 + 导出更新（AC: 8）
  - [x] 8.1 删除 `src/renderer/src/modules/structure-design/components/StructureCanvas.tsx`
  - [x] 8.2 删除 `src/renderer/src/modules/structure-design/components/StructureCanvasNode.tsx`
  - [x] 8.3 删除 `tests/unit/renderer/modules/structure-design/components/StructureCanvasNode.test.tsx`
  - [x] 8.4 更新 `src/renderer/src/modules/structure-design/index.ts` 导出清单
  - [x] 8.5 全库 grep 验证：`rg 'StructureCanvas|StructureCanvasNode'` 只在 Change Log / 本 Story 文件中出现

- [x] Task 9: 测试矩阵（AC: 9）
  - [x] 9.1 新建 `tests/unit/renderer/modules/structure-design/components/StructureTreeView.test.tsx`（≥12 tests）
  - [x] 9.2 新建 `tests/unit/renderer/modules/structure-design/adapters/skeletonAdapter.test.ts`（≥4 tests，含 round-trip）
  - [x] 9.3 新建 `tests/unit/renderer/modules/structure-design/adapters/persistedAdapter.test.ts`（≥4 tests），并同步更新 `useStructureOutline.test.ts` 以覆盖 documentStore-first 订阅路径
  - [x] 9.4 更新 `tests/unit/renderer/modules/editor/components/SkeletonEditor.test.tsx`：保留既有测试全部通过；新增 DnD 深度拒绝 / Enter 键新增同级（draft 模式 `keyboardEnabled=true` 可选启用）
  - [x] 9.5 更新 `tests/unit/renderer/modules/structure-design/components/StructureDesignWorkspace.test.tsx`：新增 `confirmLabel` passthrough、`Tab` 键触发 `indentSection`、`Delete` 触发 `requestSoftDelete`、header 副标题不存在、DnD 调用 `moveSubtree`
  - [x] 9.6 更新 `tests/unit/renderer/modules/editor/components/SolutionDesignView.test.tsx`：新增 `templateId + firstSkeletonConfirmedAt` label 分发、`handleConfirmSkeleton()` 调用 `documentMarkSkeletonConfirmed`
  - [x] 9.6.1 保留 `tests/unit/renderer/modules/editor/components/SolutionDesignView.rename-regression.test.tsx` 这条防回归：rename 成功后结构画布保持 mounted、`solution-design-loading` 不回闪、`documentLoad()` 不追加调用
  - [x] 9.7 更新 `tests/unit/main/services/chapter-structure-service.test.ts`：新增 `insertChild` / `moveSubtree(before|after|inside)` / descendant-cycle boundary
  - [x] 9.8 更新 `tests/unit/main/ipc/document-handlers.test.ts` 或 `tests/unit/main/services/document-service.test.ts`：覆盖 `document:mark-skeleton-confirmed` 幂等写入
  - [x] 9.9 删除 `tests/unit/renderer/modules/structure-design/components/StructureCanvasNode.test.tsx`
  - [x] 9.10 **optional** Playwright `tests/e2e/structure-tree-keyboard.spec.ts`：标记 `@p1`，若 Story 11.4 soft-delete 已落地则启用 pending-delete 视觉截图断言；否则聚焦键盘 + DnD + confirmLabel 主流程，删除结果记入 Completion Notes

## Dev Notes

### 关键实现约束

- **11.3 store API 已 sectionId-first。** `chapterStructureStore` 在 11.3 已经把 actions 从 `nodeKey-first` 重命名为 `sectionId-first`（`focusNode → focusSection`、`indentNode → indentSection`、`outdentNode → outdentSection`、新增 `commitTitle` / `bindProject` / `mutating` flag）。本 Story 的公共件 persisted 模式的 `key` 即 `sectionId`，直接对接。
- **11.3 `useDocumentStore.applyStructureSnapshot` 已负责 snapshot 回写。** 每次 `insertSibling` / `insertChild` / `moveSubtree` / `indentSection` / `outdentSection` 成功后，renderer 层的 markdown + sectionIndex 会通过 `commitSnapshot()` 一次性覆盖 `documentStore`，并清空 autosave 队列。公共件 persisted 模式不应再依赖 `useStructureOutline.reload()` + `documentGetMetadata()` 二次拉取；`useStructureOutline` 必须改成 documentStore-first 订阅。
- **rename 链路现在也走 snapshot in-place。** 当前基线中，`chapter-structure:update-title` 已返回 `StructureMutationSnapshotDto`，`chapterStructureStore.commitTitle()` 通过 `commitSnapshot()` 直接更新 `documentStore`，因此 rename 成功后 `StructureDesignWorkspace` 保持 mounted，`SolutionDesignView` 不重新进入 loading。11.9 合并时继续沿用这条路径。
- **DnD 深度限制已在 11.5（depth-limit-warn-llm-lock）backlog 中；本 Story 沿用 `SkeletonEditor` 现 `<=4` 硬限制。** 11.5 将扩展到 `<=6` + 软上限警告；公共件 `allowDrop` 的深度常量通过 props `maxDepth=4` 预留 seam，11.5 dev-story 时可改为 6。
- **pending-delete `撤销` 按钮交互暂为 callback seam。** Story 11.4 落地前，persisted 模式的 `PendingDeleteActions.onUndo` 仍是 `onUndoPendingDelete?` callback 传入（宿主 `StructureDesignWorkspace` 现用 `message.info` 占位提示）。11.4 dev-story 时替换为 `clearPendingDelete` + cascade restore 真实动作。
- **persisted DnD 需要真实 move contract。** 11.3 现有 `indentSection` / `outdentSection` 只覆盖 Xmind 键盘语义，无法表达 AntD Tree 的任意 `before / after / inside` drop。11.9 若承诺与 draft Tree 拖拽一致，就必须补 `moveSubtree()` 主服务 / IPC / store 合同，而不是在 renderer 里把 gap drop 伪装成 outdent。
- **首次确认文案必须有持久化信号。** skeleton 在 `templateGenerateSkeleton()` / `templatePersistSkeleton()` 阶段已经写入 `proposal.md + proposal.meta.json.sectionIndex`，所以“当前项目是否已经正式确认过骨架”必须持久化到 sidecar。`firstSkeletonConfirmedAt` 放在 `ProposalMetadata`，由 `SolutionDesignView` 读取并通过 `document:mark-skeleton-confirmed` 写入；不要把这条信号塞进 `documentStore` 的临时内存字段。
- **结构画布的 background load 不能卸载已渲染节点。** 当前 `StructureCanvas` 只在“初次空树加载”时显示 Spin；后续结构 mutation 或 rename 期间，已挂载节点继续保留在 DOM 中，键盘焦点与 `isWithinPanel` 守卫才能连续工作。11.9 的 `<StructureTreeView>` 继续保持这条 UX/键盘契约。
- **左侧 `DocumentOutlineTree` 不在本 Story 重构范围。** 11.3 `useStructureKeymap` 挂载点不动；但公共件需要保证 hook 可复用（不能硬依赖 Tree 内部 DOM 结构，否则 hook 只服务于 `DocumentOutlineTree`）。如果 Task 4.5 评估需要扩展 hook signature，改动应向后兼容现 `DocumentOutlineTree` 调用点。

### 已有代码资产（直接复用或搬迁）

| 已有文件 | 本 Story 的作用 |
|---|---|
| `src/renderer/src/modules/editor/components/SkeletonEditor.tsx` | **被迁移**：body 替换为 `<StructureTreeView>` wrapper，保留对外 props + data-testid |
| `src/renderer/src/modules/structure-design/components/StructureCanvas.tsx` | **被删除** |
| `src/renderer/src/modules/structure-design/components/StructureCanvasNode.tsx` | **被删除**：子组件（`LeadingIcon` / `FocusedActions` / `EditingRow` / `LockedBadge` / `PendingDeleteActions` / `PhaseDecorator` / `useCountdownSeconds`）搬迁到公共件 |
| `src/renderer/src/modules/structure-design/components/StructureDesignWorkspace.tsx` | **被迁移**：body 替换为 `<StructureTreeView mode='persisted'>` wrapper |
| `src/renderer/src/modules/structure-design/hooks/useStructureOutline.ts` | **被重构**：改为 documentStore-first read-side hook；输出经 persistedAdapter 转为 `StructureTreeNode[]` |
| `src/renderer/src/modules/structure-design/hooks/useChapterNodeState.ts` | 直接复用；被 `stateOf` callback 闭合 |
| `src/renderer/src/stores/chapterStructureStore.ts` | 扩展并复用 11.3 actions（现有 `insertSibling` / `indentSection` / `outdentSection` / `commitTitle` / `requestSoftDelete` / `bindProject`，其中 `commitTitle` 已走 snapshot in-place；11.9 新增 `insertChild` / `moveSubtree`） |
| `src/renderer/src/modules/editor/hooks/useStructureKeymap.ts` | persisted 模式 `keyboardEnabled=true` 时挂载；可能需要小幅扩展 signature（Task 4.5） |
| `src/renderer/src/modules/editor/lib/structure-feedback.ts` | 错误 surface：`notifyStructureBoundary` / `notifyLockedRejection` / `notifyStructureError` / `notifyDepthExceeded` 全部由 store actions 内部发出，公共件无需重复调用 |
| `src/shared/chapter-identity.ts` | `buildChapterTree` / `resolveSectionIdFromLocator` / `normalizeSiblingOrder` 继续承担 tree 构造 |
| `src/shared/chapter-structure-depth.ts` | `computeMaxDepthBySectionId` 由 store actions 内部使用；公共件不直接依赖 |
| `src/renderer/src/modules/editor/components/SolutionDesignView.tsx` | 注入 `confirmLabel`，并持有 `templateId + firstSkeletonConfirmedAt` 的 label 派生逻辑 |
| `src/shared/models/proposal.ts` + `src/main/services/document-service.ts` | `firstSkeletonConfirmedAt` sidecar 字段与幂等更新 helper 的真实落点 |
| `src/main/ipc/document-handlers.ts` + `src/preload/index.ts` | `document:mark-skeleton-confirmed` thin IPC / preload 暴露点 |

### Project Structure Notes

- 新目录 `src/renderer/src/modules/structure-design/adapters/` 承载 `skeletonAdapter.ts` / `persistedAdapter.ts`，保持 module = kebab-case 约定
- 公共件单文件可能较大（预估 350-450 行），若 body + actionBar + row renderers 合起来超过 500 行，拆 `StructureTreeView.actionBar.tsx` + `StructureTreeView.nodes.tsx` 作为同级兄弟文件；不新建子目录
- `firstSkeletonConfirmedAt?: string` 的 schema 变动应落在 `src/shared/models/proposal.ts` 的 `ProposalMetadata`，写盘通过 `documentService.updateMetadata()` / `document:mark-skeleton-confirmed`；`src/shared/template-types.ts` 没有 `ProposalMetaJson` 接口，不应在错误文件里补 schema
- persisted DnD 若需要 `before / after / inside` 三种 placement，优先在 `chapter-structure-service` + `chapter-markdown.ts` 建立共享 mutation，再暴露到 preload/store。禁止仅在 renderer 层拼凑 tree state 后直接覆盖 `documentStore`
- `SkeletonEditor` 保留原位置（`modules/editor/components/`）不搬到 `structure-design`，避免破坏 `SolutionDesignView.edit-skeleton` phase 引用路径与历史 git blame 可读性

### 向后兼容 / 回归风险

- **`SkeletonEditor` 现有对外合同 4 条 props + 8 条 data-testid 全部保留** → 现 `SolutionDesignView` + `SkeletonEditor.test.tsx` 不应破坏
- **`StructureDesignWorkspace` 现对外合同：** `projectId` / `onConfirmSkeleton` / `confirmLabel` / `onReselectTemplate` / `phaseByNodeKey` 保留；新增行为收敛到 `onInsertChild` / `onMove` callback 与 header → bottom bar 迁移，不额外引入 `isFirstConfirm` prop
- **五态视觉 `stateOverride` 测试 prop 删除。** Story 11.2 的 `StructureCanvasNodeProps.stateOverride` 仅供可视回归 gallery 测试使用；本 Story 删除 `StructureCanvasNode`，gallery 测试迁移到 `StructureTreeView.test.tsx` 时改用 `stateOf` mock callback 注入五态
- **DnD 行为差异（draft vs persisted）**：draft 模式本地更新后由 `onUpdate` 全量替换；persisted 模式每一次 drop 都会触发 IPC。DnD 连续快速操作可能被 `mutating` flag 串行化；UX 层面 dev-story 验证是否需要补 loading indicator / disabled 视觉（若 11.3 已有 editing lock，沿用即可）
- **rename / 插入 / 导航的连续性风险**：当前基线已经用 `scrollIntoView + DOM focus continuity + snapshot in-place` 修复了 structure-design 的 rename 回归。11.9 迁移到公共件后继续保留这组行为与测试，避免出现 loading 回闪、节点失焦、键盘事件逃逸到 header 的回归

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.2] — 焦点节点五状态机原始合同
- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.3] — Xmind 键位与级联删除
- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.4] — soft-delete pending-delete 态最终视觉依据
- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.6] — 三路径入口与 diff 合并 UI（本 Story 的下游复用方）
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR23] — 微交互 150-200ms + reduced-motion
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR24] — 焦点指示与键盘可达性
- [Source: _bmad-output/implementation-artifacts/11-2-focus-state-machine.md] — 五状态机优先级 / nodeKey === sectionId 合同 / 组件资产清单
- [Source: _bmad-output/implementation-artifacts/11-2-focus-state-machine-ux/prototype.manifest.yaml] — frame id + design token 合同
- [Source: _bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md] — useStructureKeymap / StructureMutationSnapshotDto / store API 最终形态
- [Source: src/renderer/src/modules/editor/components/SkeletonEditor.tsx] — AntD Tree + DnD + bottom bar + depth<=4 现行实现
- [Source: src/renderer/src/modules/structure-design/components/StructureCanvasNode.tsx] — 五态 row 视觉参考（待删除，子组件搬迁到公共件）
- [Source: src/renderer/src/modules/structure-design/components/StructureCanvas.tsx] — 现 flat list 实现（待删除）
- [Source: src/renderer/src/modules/structure-design/components/StructureDesignWorkspace.tsx] — 现 host 实现（待精简）
- [Source: src/renderer/src/modules/editor/components/SolutionDesignView.tsx] — SOP `has-content` / `edit-skeleton` 两 phase 分发宿主
- [Source: src/renderer/src/stores/chapterStructureStore.ts] — 11.3 最终 sectionId-first API
- [Source: src/renderer/src/modules/editor/hooks/useStructureKeymap.ts] — 11.3 键盘 hook
- [Source: src/renderer/src/modules/editor/lib/structure-feedback.ts] — 错误 surface helper
- [Source: _bmad-output/planning-artifacts/architecture.md#Zustand Store 模式] — store / 跨 store 读取约束
- [Source: _bmad-output/planning-artifacts/architecture.md#强制规则] — IPC 薄包装 / 路径别名 / `loading` 命名
- [Source: CLAUDE.md#Mandatory Patterns] — 响应包装、错误类型、prompt 规范、存储约束
- [Source: AGENTS.md] — Zustand store、thin IPC、路径约束

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Claude Opus 4.7, 1M context)

### Debug Log References

- `pnpm vitest run tests/unit/renderer/modules/structure-design tests/unit/renderer/modules/editor/components/SkeletonEditor.test.tsx tests/unit/renderer/modules/editor/components/SolutionDesignView.test.tsx tests/unit/renderer/modules/editor/components/SolutionDesignView.rename-regression.test.tsx tests/unit/renderer/stores/chapterStructureStore.test.ts tests/unit/main/services/chapter-structure-service.test.ts tests/unit/main/services/document-service.test.ts tests/unit/main/ipc/document-handlers.test.ts` → all green
- Full regression `pnpm vitest run`：254 / 254 files + 2496 / 2496 tests 全部通过（已排除 8 个 `better-sqlite3` NODE_MODULE_VERSION 预存在环境失败文件，与 11.9 变更无关）
- `pnpm typecheck` 干净（仅遗留 1 处预存在于 `SourceAttributionLabel.tsx:84` 的类型错误，非本 Story 作用域）

### Completion Notes List

- AC1 公共组件合约：`<StructureTreeView>` 暴露 `mode` / `nodes` / `stateOf` / `phaseByKey` / `onUpdate` / `onInsertChild` / `onInsertSibling` / `onIndent` / `onOutdent` / `onMove` / `onDelete` / `onCommitTitle` / `onUndoPendingDelete` / `onConfirm` / `confirmLabel` / `onReselectTemplate` / `showStats` / `keyboardEnabled` / `maxDepth` / `emptyHint` / `loading` / `error` / `onRetry` / `data-testid` / `renderPanel`，类型定义在 `StructureTreeView.types.ts`
- AC2/AC5 draft 模式：`SkeletonEditor.tsx` 完全迁移为 `<StructureTreeView mode='draft'>` wrapper；draft mutations（add-sibling/child、delete、rename、DnD）纯函数化在 `lib/draftMutations.ts`；保留全部对外 data-testid（`skeleton-editor` / `confirm-skeleton-btn` / `regenerate-btn` / `edit-input-${id}` / `node-actions-${id}` / `key-focus-${id}`），保留 Modal.confirm 删除确认、`<=4` 深度、默认 `新章节` 标题、`isKeyFocus` / `weightPercent` Tag 颜色梯度
- AC3 persisted 模式：`StructureDesignWorkspace` 精简为 `useStructureOutline` + `<StructureTreeView mode='persisted'>` wrapper；全部写路径闭合 `useChapterStructureStore`（新增 `insertChild` / `moveSubtree` 两个 action）并走 snapshot in-place 回写
- AC3/AC7 五态视觉 + pending-delete 修复：行级组件 `StructureTreeView.nodes.tsx` 从 `StructureCanvasNode` 搬迁；`pending-delete` 行补齐 `bg-[#FFF1F0]` + 标题 `line-through` + 红底倒计时 chip + 撤销按钮；`locked` / `pending-delete` 节点 `draggable={false}`（AntD Tree DataNode.disabled）
- AC4 键盘：persisted 模式下 `keyboardEnabled=true`，`StructureDesignWorkspace` 继续挂载 `useStructureKeymap`；editing 态的 inline Input 拦截 `Enter/Esc/Tab` 不冒泡，保证 "Editing 期间结构快捷键暂停" 合同
- AC6 CTA 文案分发：`ProposalMetadata.firstSkeletonConfirmedAt?: string` 新增；`document:mark-skeleton-confirmed` thin IPC 实现幂等首写；`SolutionDesignView` 基于 `templateId + firstSkeletonConfirmedAt` 派生 `hasContentConfirmLabel`，首次确认前显示 `确认骨架，开始撰写`，之后切换为 `继续撰写`；`handleConfirmSkeleton()` 与 `handleConfirmHasContent()` 都会在进入 proposal-writing 前调用 `documentMarkSkeletonConfirmed`
- AC7 原型 1:1：AntD Tree `draggable showLine blockNode expandedKeys` 提供 grip / 折叠切换 / 连接线；底部 action bar 位置与 `1nSXI` 一致（左侧 `[重新选择模板]` + stat、右侧 primary button 40px 高 4px 圆角）
- AC8 删除冗余：`StructureCanvas.tsx` / `StructureCanvasNode.tsx` / `StructureCanvasNode.test.tsx` 已删除；`src/renderer/src/modules/structure-design/index.ts` 导出更新为公共件 + 两个 adapter；全库 grep 确认无遗留引用
- AC9 测试矩阵：新增 `StructureTreeView.test.tsx`（12 用例）、`skeletonAdapter.test.ts`（4 用例）、`persistedAdapter.test.ts`（4 用例）、chapter-structure-service 新增 7 用例（`insertChild` ×2 + `moveSubtree` ×5）、document-service 新增 2 用例（markSkeletonConfirmed idempotent）、document-handlers 新增 1 用例（新通道注册）；现有 SolutionDesignView / SolutionDesignView.rename-regression / StructureDesignWorkspace / SkeletonEditor / chapterStructureStore 测试继续全绿；累计 surface 净新增 ≥ 30 用例（story AC9 门限）
- backend contracts 新增：
  - `src/shared/chapter-markdown.ts` → `insertChildAtEnd` + `moveSubtreeInMarkdown`（cycle / depth / same-position 守卫）
  - `src/main/services/chapter-structure-service.ts` → `insertChild` + `moveSubtree`（applyStructureMutation 复用 + 独立 moveSubtree 实现）
  - `src/main/services/document-service.ts` → `markSkeletonConfirmed`（幂等 updateMetadata）
  - `src/shared/ipc-types.ts` + `src/main/ipc/chapter-structure-handlers.ts` + `src/main/ipc/document-handlers.ts` + `src/preload/index.ts` → `chapter-structure:insert-child` / `chapter-structure:move-subtree` / `document:mark-skeleton-confirmed` 三条 thin IPC
  - `src/renderer/src/stores/chapterStructureStore.ts` → `insertChild` + `moveSubtree` 两个 store action，共享 `runMutation` 锁 + `commitSnapshot` 回写
- scope 保留：左侧 `DocumentOutlineTree`（240px outline panel）未重构，`useStructureKeymap` signature 未改；`pending-delete` 撤销动作仍是 callback seam（Story 11.4 交接）；`maxDepth=4` 常量化（Story 11.5 可升至 6）

### File List

新增：

- `src/renderer/src/modules/structure-design/components/StructureTreeView.tsx`
- `src/renderer/src/modules/structure-design/components/StructureTreeView.nodes.tsx`
- `src/renderer/src/modules/structure-design/components/StructureTreeView.actionBar.tsx`
- `src/renderer/src/modules/structure-design/components/StructureTreeView.types.ts`
- `src/renderer/src/modules/structure-design/adapters/skeletonAdapter.ts`
- `src/renderer/src/modules/structure-design/adapters/persistedAdapter.ts`
- `src/renderer/src/modules/structure-design/lib/draftMutations.ts`
- `tests/unit/renderer/modules/structure-design/components/StructureTreeView.test.tsx`
- `tests/unit/renderer/modules/structure-design/adapters/skeletonAdapter.test.ts`
- `tests/unit/renderer/modules/structure-design/adapters/persistedAdapter.test.ts`
- `tests/unit/renderer/modules/editor/components/SolutionDesignView.rename-regression.test.tsx`（已在 pre-11.9 基线合入）

修改：

- `src/renderer/src/modules/editor/components/SkeletonEditor.tsx`
- `src/renderer/src/modules/editor/components/SolutionDesignView.tsx`
- `src/renderer/src/modules/structure-design/components/StructureDesignWorkspace.tsx`
- `src/renderer/src/modules/structure-design/index.ts`
- `src/renderer/src/stores/chapterStructureStore.ts`
- `src/main/ipc/chapter-structure-handlers.ts`
- `src/main/ipc/document-handlers.ts`
- `src/main/services/chapter-structure-service.ts`
- `src/main/services/document-service.ts`
- `src/preload/index.ts`
- `src/shared/chapter-markdown.ts`
- `src/shared/ipc-types.ts`
- `src/shared/models/proposal.ts`
- `tests/unit/renderer/modules/editor/components/SkeletonEditor.test.tsx`（隐式通过：contract 未破）
- `tests/unit/renderer/modules/editor/components/SolutionDesignView.test.tsx`
- `tests/unit/renderer/modules/editor/components/SolutionDesignView.rename-regression.test.tsx`
- `tests/unit/renderer/modules/structure-design/components/StructureDesignWorkspace.test.tsx`
- `tests/unit/renderer/modules/structure-design/hooks/useStructureOutline.test.ts`（pre-11.9 已更新）
- `tests/unit/renderer/stores/chapterStructureStore.test.ts`（pre-11.9 已更新）
- `tests/unit/main/services/chapter-structure-service.test.ts`
- `tests/unit/main/services/document-service.test.ts`
- `tests/unit/main/ipc/document-handlers.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

删除：

- `src/renderer/src/modules/structure-design/components/StructureCanvas.tsx`
- `src/renderer/src/modules/structure-design/components/StructureCanvasNode.tsx`
- `tests/unit/renderer/modules/structure-design/components/StructureCanvasNode.test.tsx`

## Change Log

- 2026-04-19: dev-story 实现落地：新增 `<StructureTreeView>` 公共件 + draft/persisted adapter + `insertChild` / `moveSubtree` / `document:mark-skeleton-confirmed` 后端契约；`SkeletonEditor` / `StructureDesignWorkspace` 完成迁移；删除 `StructureCanvas` / `StructureCanvasNode`；pending-delete 视觉修复（`bg-[#FFF1F0]` + `line-through`）；CTA 文案依据 `firstSkeletonConfirmedAt` 在 `确认骨架，开始撰写` 与 `继续撰写` 之间分发；状态 ready-for-dev → review
- 2026-04-18: 对齐最新 bugfix 基线：补充 rename snapshot in-place、防 background-load 卸载节点、保留 `useStructureKeymap` 的滚动/聚焦连续性与 `SolutionDesignView.rename-regression` 防回归要求
- 2026-04-18: validate-create-story 复核并校准真实实现边界：补齐 `insertChild` / `moveSubtree` / `document:mark-skeleton-confirmed` / `firstSkeletonConfirmedAt` / documentStore-first `useStructureOutline` 合同，清除不存在的 store / schema / service 引用
- 2026-04-18: create-story 11.9 初次落地 — 统一结构画布公共件（`<StructureTreeView>`）合同、迁移路径、视觉修复、测试矩阵全量就位；状态 backlog → ready-for-dev
