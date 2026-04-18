# Story 11.2: 焦点节点视觉态 + 五状态机

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 方案设计阶段的结构画布节点具备清晰且互斥的视觉状态,
So that 我能立刻判断焦点位置、节点是否可编辑，以及哪些节点正处于生成或待删除窗口期。

> **Stage scoping 说明**：本 Story 落在 SOP 第 2 阶段"方案设计"，宿主是 Story 11.6 的结构画布（Structure Design Workspace）。"方案撰写"阶段的 outline 面板与编辑器当前章节同步是未来独立 Story 的工作，11.2 不在本次交付范围内处理该 sync。

## 原型参考 / Design References

dev-story 时按以下 lookup order 1:1 还原视觉与交互：

1. **Manifest**（本 Story 的 frame id + node id 索引）：
   `_bmad-output/implementation-artifacts/11-2-focus-state-machine-ux/prototype.manifest.yaml`

2. **Prototype 文件**（与 Story 3.2 共享 pen，复用同一 design token 体系）：
   `_bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/prototype.pen`

3. **两个落地帧**（通过 Pencil MCP `batch_get` 读节点结构）：

   | Frame ID | 名称 | 用途 |
   |---|---|---|
   | `zHAzA` | Story 11.2 — 方案设计 · 焦点节点五状态机 | 方案设计阶段 landing 页：10 行章节卡片，五态内联演示 |
   | `0V4bl` | Story 11.2 — 方案设计 · 确认骨架阶段 | 三列骨架编辑视图（文档大纲 / Structure Canvas / 批注）；**结构画布 1:1 还原目标** |

4. **五态 demo node id**（per frame）见 manifest `state_demo_rows` 段。例如 `0V4bl` 中：
   - `ViyV2` = Focused · H1 "需求理解与响应"
   - `kgpPO` = Editing · H2 "网络与通信设计"
   - `vTpGV` = Locked · H2 "核心业务功能设计"
   - `c6TPR` = Pending-Delete · H2 "安全防护措施"
   - `VgVI8` = Idle 基线对照

5. **Design token 合同**（与 Story 1.4 / 3.2 对齐，见 manifest `design_tokens_contract`）：
   `$brand #1677FF`、`$brand-light #F0F5FF`、`$danger #FF4D4F`、`$warning #FAAD14`、`$border #E8E8E8`、`$text-primary #1F1F1F`、`$text-secondary #8C8C8C`。focus outline = `brand 2px`，pending 倒计时 chip = `danger bg + white 3s bold`，locked badge = `白底 + lucide/sparkles $warning + AI 生成中…`。

## Acceptance Criteria

### AC1: Focused 态与当前节点同步

- **Given** 方案设计阶段的结构画布已加载 `proposal.meta.json.sectionIndex`
- **When** 用户单击结构画布节点、使用 Story 11.3 的 ↑↓ 导航，或通过公共状态 API `focusNode(nodeKey)` 变更焦点
- **Then** 对应节点进入 Focused 态：左侧 3px 品牌色条 + 浅底 + 蓝色 2px focus outline
- **And** 右侧浮现 `[+ 子节点]`、`[⋯ 更多]` 操作入口
- **And** 焦点同步通过 renderer 侧集中状态 `chapterStructureStore` 完成，结构画布不维护第二份本地选中态
- [Source: epics.md Story 11.2 AC1]
- [Source: _bmad-output/implementation-artifacts/11-6-three-path-entry-diff-merge.md]

### AC2: Editing 态

- **Given** 节点处于 Focused 态
- **When** 用户双击节点或按 F2
- **Then** 节点进入 Editing 态：标题区域显示行内 `Input`、文本光标聚焦、边框高亮
- **And** `Enter` / blur 提交并触发 Story 11.1 的 `updateSectionTitle` IPC，`Esc` 取消并回到 Focused 态
- **And** Editing 态期间，结构画布禁止其他节点的 hover / click 抢焦，但保持全局快捷键（如 `Esc`）可用
- [Source: epics.md Story 11.2 AC2]
- [Source: _bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor.md]

### AC3: Locked 态

- **Given** LLM 流式推荐或结构写入中的节点需要暂时冻结（Story 11.8）
- **When** 调用公共状态 API `markLocked(nodeKey)` / `unmarkLocked(nodeKey)`
- **Then** 节点进入 Locked 态：灰底、锁图标、交互禁用
- **And** Story 11.3 的 Delete / Tab / Enter / Shift+Tab 等结构变更键在该节点上失效
- [Source: epics.md Story 11.2 AC3]
- [Source: _bmad-output/implementation-artifacts/11-8-llm-structure-recommend.md]

### AC4: Pending-Delete 态

- **Given** 节点进入 Story 11.4 的 soft-delete 5 秒撤销窗口
- **When** 调用公共状态 API `markPendingDelete(nodeKeys, expiresAt)`
- **Then** 节点进入 Pending-Delete 态：红底、倒计时数字、交互禁用
- **And** 倒计时由 renderer 统一驱动并支持 Story 11.4 的撤销 / 真删切换
- [Source: epics.md Story 11.2 AC4]
- [Source: _bmad-output/implementation-artifacts/11-4-soft-delete-toast-undo.md]

### AC5: Idle 态

- **Given** 节点既无焦点、也未编辑、未锁定、未处于待删除
- **When** 默认渲染
- **Then** 节点进入 Idle 态：显示基础结构节点样式，并保留 `sectionIndex.generationPhase` 装饰图标能力（例：AI 生成中 / 已生成 / 需复核）
- [Source: epics.md Story 11.2 AC5]

### AC6: 五状态机互斥与 nodeKey contract

- **Given** 同一节点可能同时收到 focus、edit、lock、pending-delete 等事件
- **When** 任意状态切换
- **Then** `useChapterNodeState(nodeKey)` 以单一优先级规则输出五态之一：`pending-delete > locked > editing > focused > idle`
- **And** renderer 视图层使用 `sectionIndex.sectionId` 作为稳定 `nodeKey` 管理视觉状态（方案设计阶段无 heading，无需 locatorKey 桥接）
- **And** Story 11.3 / 11.4 / 11.8 所有结构变更调用继续以 `sectionId` 为持久化 key 与 11.1 的 service 对接
- [Source: epics.md Story 11.2 AC5]
- [Source: _bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor.md]

## Tasks / Subtasks

- [ ] Task 1: sectionIndex 读取与节点模型（AC: 1, 6）
  - [ ] 1.1 新建 `src/renderer/src/modules/structure-design/hooks/useStructureOutline.ts`：调用 `window.api.documentGetMetadata({ projectId })` 读取 `sectionIndex`，输出层级化 `StructureNode[]`，每个节点含 `sectionId`、`title`、`level`、`parentId`、`generationPhase`
  - [ ] 1.2 `nodeKey` 直接使用 `sectionIndex.sectionId`，不再维护 `locatorKey` 第二层映射（方案设计阶段无 heading 漂移问题）
  - [ ] 1.3 hook 只负责 read-side 拉取；结构 CRUD 继续由 Story 11.1 / 11.3 / 11.4 的 main service 与 IPC 负责

- [ ] Task 2: renderer 状态机 store 与 hook（AC: 1-6）
  - [ ] 2.1 新建 `src/renderer/src/stores/chapterStructureStore.ts`，使用 `subscribeWithSelector` 管理：
    - `focusedNodeKey: string | null`
    - `editingNodeKey: string | null`
    - `lockedNodeKeys: Record<string, true>`
    - `pendingDeleteByNodeKey: Record<string, { expiresAt: string }>`
    - `actions: focusNode / enterEditing / exitEditing / markLocked / unmarkLocked / markPendingDelete / clearPendingDelete`
  - [ ] 2.2 新建 `src/renderer/src/modules/structure-design/hooks/useChapterNodeState.ts`：集中输出 `'idle' | 'focused' | 'editing' | 'locked' | 'pending-delete'`
  - [ ] 2.3 `useChapterNodeState(nodeKey)` 通过单一优先级规则保证互斥，不在组件内散落 `useState`
  - [ ] 2.4 更新 `src/renderer/src/stores/index.ts` 导出 `useChapterStructureStore`

- [ ] Task 3: 结构画布节点 UI（AC: 1-5）
  - [ ] 3.1 新建 `src/renderer/src/modules/structure-design/components/StructureCanvasNode.tsx`，渲染单个结构节点的五种视觉态
  - [ ] 3.2 新建 `src/renderer/src/modules/structure-design/components/StructureCanvas.tsx`：承接 11.6 的 host 容器合同（见 Project Structure Notes），使用 AntD `Tree` 或自建层级渲染器
  - [ ] 3.3 Focused 态样式遵循设计系统 token：品牌色 `#1677FF`、`brand-light` 背景 `#F0F5FF`、蓝色 2px outline、`150ms` / `ease-out` 过渡
  - [ ] 3.4 Editing 态使用行内 `Input`；Enter / blur 提交触发 Story 11.1 `updateSectionTitle`，Esc 取消
  - [ ] 3.5 Locked / Pending-Delete 态通过 `aria-disabled`、`cursor-not-allowed` 表达不可操作；全局快捷键（Story 11.3）在该节点上失效
  - [ ] 3.6 `[+ 子节点]`、`[⋯ 更多]` 在 11.2 内先暴露 callback seam；实际新增 / 删除 / 菜单动作由 11.3 / 11.4 接入

- [ ] Task 4: 方案设计 workspace 宿主集成（AC: 1, 2, 6）
  - [ ] 4.1 与 Story 11.6 协调 `src/renderer/src/modules/structure-design/components/StructureDesignWorkspace.tsx` 骨架，本 Story 落地 canvas slot 的最小实现（单列结构画布），11.6 再接入 Modal 入口选择器与 diff 合并视图
  - [ ] 4.2 在 SOP `stage === 'proposal-design'` 时渲染 `StructureDesignWorkspace`，`stage === 'proposal-writing'` 继续使用现有 `ProjectWorkspace.tsx`
  - [ ] 4.3 点击结构节点调用 `focusNode(nodeKey)`；键盘 ↑↓ 由 Story 11.3 接管
  - [ ] 4.4 `StructureDesignWorkspace` 左侧保留 240px 面板（仅章节层级），主区留给 11.6 的 diff 合并 / AI 推荐预览

- [ ] Task 5: 跨 Story 公共状态 API（AC: 3, 4, 6）
  - [ ] 5.1 为 Story 11.3 暴露 `focusNode()` / `enterEditing()` / `exitEditing()`
  - [ ] 5.2 为 Story 11.8 暴露 `markLocked()` / `unmarkLocked()`
  - [ ] 5.3 为 Story 11.4 暴露 `markPendingDelete()` / `clearPendingDelete()`
  - [ ] 5.4 对需要持久化的调用方，同时提供 `sectionIdByNodeKey[nodeKey]` 读取路径，确保 11.1 的 `sectionId` contract 继续生效

- [ ] Task 6: 测试矩阵（AC: 全部）
  - [ ] 6.1 新建 `tests/unit/renderer/modules/structure-design/hooks/useStructureOutline.test.ts`：验证 sectionIndex → StructureNode[] 转换、层级关系、`generationPhase` 透传
  - [ ] 6.2 新建 `tests/unit/renderer/stores/chapterStructureStore.test.ts`：验证五态优先级、`focusNode()`、`enterEditing()`、`markLocked()`、`markPendingDelete()`
  - [ ] 6.3 新建 `tests/unit/renderer/modules/structure-design/components/StructureCanvasNode.test.tsx`：验证 Focused / Editing / Locked / Pending-Delete / Idle 视觉、按钮显隐、`aria-selected` / `aria-disabled`
  - [ ] 6.4 新建 `tests/unit/renderer/modules/structure-design/components/StructureDesignWorkspace.test.tsx`：验证 SOP stage === 'proposal-design' 触发结构画布挂载、点击节点驱动 `focusNode`
  - [ ] 6.5 验证 UX-DR24 / UX-DR23 关键要求：蓝色 2px focus outline、键盘可达、`prefers-reduced-motion` 下退化为静态过渡

## Dev Notes

### 关键实现约束

- **宿主是方案设计阶段的结构画布。** 方案撰写阶段的 `ProjectWorkspace.tsx` + `DocumentOutlineTree.tsx` 与编辑器正文耦合，不是 11.2 的落点。11.2 新建 `modules/structure-design/` 并与 Story 11.6 的结构画布 host 合并。
- **nodeKey 直接用 sectionId。** 方案设计阶段无正文 heading，`sectionIndex.sectionId` 就是唯一稳定键；不再维护 locatorKey ↔ sectionId 映射层。
- **编辑器同步是 out-of-scope。** “方案撰写阶段 outline 跟随 useCurrentSection” 交由未来独立 Story 处理，复用本 Story 的 `chapterStructureStore.focusNode()` API。
- **11.2 是 renderer-first story。** 本 Story 不新增 main 端 CRUD service、repo 或 IPC；11.1 负责结构 foundation contract，11.3/11.4 负责结构修改与删除事务。
- **依赖 11.6 host 合同。** 结构画布 shell 与 11.6 共用，11.2 落地 canvas slot 最小实现；两条 Story 需要提前对齐组件命名与 prop 合同。

### 已有代码资产（直接复用或扩展）

| 已有文件 | 本 Story 的作用 |
|---|---|
| `src/preload/index.ts` | 已有 `documentGetMetadata` 暴露点，结构画布直接调用 |
| `src/main/ipc/document-handlers.ts` | 已有 `document:get-metadata` handler |
| `src/main/services/document-service.ts` | metadata 读取入口 |
| `src/main/services/template-service.ts` | `proposal.meta.json.sectionIndex` 当前写入路径 |
| `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` | SOP 阶段分发宿主；`stage === 'proposal-design'` 时改路由到 `StructureDesignWorkspace` |

### Project Structure Notes

- 新建 `src/renderer/src/modules/structure-design/` 目录，承载本 Story 的 hook + component + workspace。目录命名遵循 module = kebab-case 约定。
- 新建 `src/renderer/src/stores/chapterStructureStore.ts`，命名沿用 “chapter” 是跨 Story 11.x 统一术语（虽宿主在方案设计阶段，store 本身跨阶段可复用）。
- `window.api.documentGetMetadata()` 已经满足 11.2 的 metadata 读取需求；本 Story 不新增 preload / main handler。
- 11.2 交付的是”结构画布五态视觉机 + 焦点同步 callback seam”。多路径入口 / diff 合并 / AI 推荐流式写入分别留给 11.6 / 11.7 / 11.8。

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.2] — 用户故事与 AC 原始来源
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR23] — 微交互 150-200ms、reduced-motion 要求
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR24] — 焦点指示与键盘可达性要求
- [Source: _bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor.md] — `sectionIndex` / `sectionId` foundation contract
- [Source: _bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor-validation-report.md] — 11.2-11.8 需要按新 contract 复核的直接依据
- [Source: _bmad-output/implementation-artifacts/11-6-three-path-entry-diff-merge.md] — 结构画布 host、方案设计阶段 SOP 落地点
- [Source: _bmad-output/implementation-artifacts/11-2-focus-state-machine-ux/prototype.manifest.yaml] — 原型 frame id + 五态 demo node id 索引
- [Source: _bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/prototype.pen] — 原型 .pen（frame `zHAzA` landing 页、frame `0V4bl` 确认骨架 1:1 还原目标）
- [Source: src/renderer/src/modules/project/components/ProjectWorkspace.tsx] — SOP 阶段分发 host（按 stage 路由到方案设计 / 方案撰写 workspace）
- [Source: src/preload/index.ts] — `documentGetMetadata` renderer API
- [Source: src/main/ipc/document-handlers.ts] — `document:get-metadata` handler
- [Source: src/main/services/document-service.ts] — metadata 读取路径
- [Source: src/main/services/template-service.ts] — `sectionIndex` 当前写入路径
- [Source: AGENTS.md] — Zustand store、thin IPC、response wrapper、路径约束

## Change Log

- 2026-04-18: 添加高精度原型 + manifest
  - 新建 `11-2-focus-state-machine-ux/prototype.manifest.yaml`，记录两张原型帧（`zHAzA` 方案设计 landing、`0V4bl` 确认骨架）+ 五态 demo node id + design token 合同
  - 原型落在共享 `3-2-editor-workspace-doc-outline-ux/prototype.pen`（复用 Story 3.2 的外壳与 tokens）
  - Story 头部新增 "原型参考 / Design References" 章节，dev-story 时按 manifest → pen frame → node id 的顺序 1:1 还原
- 2026-04-18: 阶段归属 realign — 由 方案撰写 → 方案设计
  - Story 与 AC 全量调整到方案设计阶段结构画布宿主
  - 去除 `useCurrentSection()` / `ProjectWorkspace.tsx` / `DocumentOutlineTree.tsx` / `useDocumentOutline.ts` 依赖
  - `nodeKey` 从 `locatorKey` 简化为 `sectionIndex.sectionId`（方案设计阶段无 heading）
  - 新增 `modules/structure-design/` 落地目录；与 Story 11.6 约定共享 `StructureDesignWorkspace` host
  - 方案撰写阶段 outline ↔ editor 同步 降级为 out-of-scope，由未来独立 Story 处理
- 2026-04-18: `validate-create-story` 校准实现路径（早期版本）
  - 将不存在的 `chapterStore` 收敛为 renderer 侧 `chapterStructureStore`
  - 将节点渲染落点从虚构的 `ChapterNode.tsx` 收敛到现有 `DocumentOutlineTree` title slot
  - 补入 `useCurrentSection()`、`document:get-metadata`、`sectionIndex.sectionId` 的真实桥接路径
  - 将 outline key 从行号式 `heading-${lineIndex}` 收敛到稳定 `locatorKey`
  - 补回 create-story 模板要求的 validation note、`Project Structure Notes`、`Change Log`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
