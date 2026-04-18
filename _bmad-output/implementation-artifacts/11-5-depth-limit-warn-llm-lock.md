# Story 11.5: 6 层深度软上限警告 + LLM 锁定态

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 方案结构超过 6 层时被提醒"过深降低可读性"，但不强制阻止,
So that 我能在合规建议下保持灵活，避免做出 30 层嵌套这种异常结构。

## Acceptance Criteria

### AC1: 深度警告 Toast

- **Given** proposal-writing 阶段的结构面板已经通过 Story 11.2 / 11.3 建立 `chapterStructureStore` 与 `chapter-structure-service` 的 mutation 闭环
- **When** 用户在第 6 层节点上按 `Tab` 生成第 7 层子节点，且 mutation 返回的最新 `proposal.meta.json.sectionIndex` snapshot 中该节点深度 >6
- **Then** 结构变更保持成功
- **And** renderer 显示黄色警告 Toast：`过深结构（{N} 层）会降低可读性，建议拆分为独立章节`
- **And** Toast 2 秒自动消失，并通过单一 keyed message surface 保持单实例
- [Source: epics.md Story 11.5 AC1]
- [Source: _bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md]
- [Source: src/main/services/chapter-structure-service.ts]
- [Source: src/renderer/src/stores/documentStore.ts]

### AC2: LLM 流式锁定态

- **Given** Story 11.2 的 `chapterStructureStore` 已持有 `lockedNodeKeys`，Story 11.3 的结构快捷键通过 `useStructureKeymap()` / 节点 CTA 调用结构 mutation
- **When** Story 11.8 的 AI 结构推荐流式过程将某个结构节点标记为 locked
- **Then** 该节点使用 Story 11.2 的 Locked 视觉态（灰底 + 锁图标 + `aria-disabled`）
- **And** Story 11.3 的结构变更快捷键与节点操作在该 nodeKey 上返回 `blockedReason: 'locked'`
- **And** renderer 交互层显示 `AI 生成中，请稍候`
- **And** 当前 `useChapterGeneration()` 内部的正文生成 `locked` 状态继续服务正文生成链路，结构面板锁定通过 `chapterStructureStore` 单独承载
- [Source: epics.md Story 11.5 AC2]
- [Source: _bmad-output/implementation-artifacts/11-2-focus-state-machine.md]
- [Source: _bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md]
- [Source: src/renderer/src/modules/editor/hooks/useChapterGeneration.ts]

### AC3: LLM Prompt 深度约束

- **Given** Story 11.8 的 `recommend-structure` 流程通过 `task-queue` + `agent-orchestrator` 运行，且输入先经过脱敏
- **When** 主进程构造 prompt 并在收到最终 JSON 结构后解析
- **Then** `src/main/prompts/recommend-structure.prompt.ts` 的 system prompt 明确要求：
  - 深度 ≤6 层
  - 节点数 ≤50
  - 每个节点都包含 `sourceRequirement`
- **And** main-process 在写缓存、发出 complete 事件、或进入 diff 视图前调用共享 `validateStructureConstraints()` 校验最终树
- **And** 违反约束时抛出 `BidWiseError(ErrorCode.STRUCTURE_VIOLATES_CONSTRAINTS)`，供 Story 11.8 的 UI 执行失败重试路径
- [Source: epics.md Story 11.5 AC3]
- [Source: _bmad-output/planning-artifacts/epics.md#FR71]
- [Source: AGENTS.md#Async Task Queue Whitelist]
- [Source: src/main/services/agent-orchestrator/index.ts]
- [Source: src/main/services/task-queue/index.ts]
- [Source: src/shared/constants.ts]

### AC4: Word 导入超深节点警告

- **Given** Story 11.7 的 Word 目录提取结果已转换为 `WordOutlineNode[]`
- **When** 在导入预览中渲染深度 >6 的节点
- **Then** 节点旁显示黄色警告图标与 Tooltip：`过深结构（{N} 层），建议导入后拆分`
- **And** 预览顶部统计展示超深节点数量
- **And** 用户仍可勾选这些节点继续导入
- [Source: epics.md Story 11.5 AC4]
- [Source: _bmad-output/implementation-artifacts/11-7-word-outline-import.md]
- [Source: _bmad-output/planning-artifacts/epics.md#FR72]

## Tasks / Subtasks

- [ ] Task 1: 共享深度与结构约束 helper（AC: 1, 3, 4）
  - [ ] 1.1 新建 `src/shared/chapter-structure-constraints.ts`：提供可复用于 canonical `sectionIndex` 树、Word 导入树、AI 推荐树的纯函数 helper，例如 `countTreeNodes()`、`getMaxTreeDepth()`、`collectNodesExceedingDepth()`、`validateStructureConstraints()`
  - [ ] 1.2 扩展 `src/shared/chapter-identity.ts`：新增 `getSectionDepth(sectionIndex, sectionId)` 或等价 helper，使结构 mutation 可以基于最新 `sectionIndex` snapshot 计算单节点深度
  - [ ] 1.3 在 `src/shared/constants.ts` 新增 `ErrorCode.STRUCTURE_VIOLATES_CONSTRAINTS`
  - [ ] 1.4 新建 / 更新测试：`tests/unit/shared/chapter-structure-constraints.test.ts`、`tests/unit/shared/chapter-identity.test.ts`

- [ ] Task 2: renderer 反馈通道与单实例告警（AC: 1, 2）
  - [ ] 2.1 在 `src/renderer/src/modules/editor/lib/` 新建 keyed 反馈 helper，例如 `structure-feedback.ts`，统一格式化“深度警告”和“locked 提示”消息
  - [ ] 2.2 反馈展示沿用当前 renderer 的 `App.useApp().message` 模式；深度警告使用 `message.warning`，locked 拒绝使用 `message.info`
  - [ ] 2.3 keyed warning surface 保持单实例；连续触发会刷新同一条消息的内容与计时

- [ ] Task 3: 结构锁定合同接入 Story 11.2 / 11.3 / 11.8（AC: 1, 2）
  - [ ] 3.1 延续 Story 11.2 的 `src/renderer/src/stores/chapterStructureStore.ts`：保留 `lockedNodeKeys` 与 `markLocked(nodeKey)` / `unmarkLocked(nodeKey)`
  - [ ] 3.2 延续 Story 11.3 的 mutation actions：`insertSibling()` / `indentNode()` / `outdentNode()` 在命中 locked nodeKey 时返回 `blockedReason: 'locked'`
  - [ ] 3.3 Story 11.3 mutation 成功后基于返回 snapshot 计算 `affectedSectionId` 的最新深度；深度 >6 时返回 `depthWarning: { depth }`
  - [ ] 3.4 Story 11.8 的结构推荐流或推荐预览节点复用 Story 11.2 的 Locked 视觉 token，并通过 `sectionIndex` / `locatorKey` bridge 解析 `nodeKey ↔ sectionId`

- [ ] Task 4: 11.8 Prompt / parser / error 合同（AC: 3）
  - [ ] 4.1 创建 `src/main/prompts/recommend-structure.prompt.ts`，system prompt 固化深度 ≤6、节点数 ≤50、必须输出 JSON、节点必含 `sourceRequirement`
  - [ ] 4.2 Story 11.8 的 `structure-recommend-service` 在最终树完成后调用 `validateStructureConstraints()`；校验位置位于缓存写入、stream complete 事件、diff 视图接入之前
  - [ ] 4.3 违反约束时通过共享 Response Wrapper / stream error 事件返回 `ErrorCode.STRUCTURE_VIOLATES_CONSTRAINTS`
  - [ ] 4.4 新建 / 更新测试：`tests/unit/main/prompts/recommend-structure.prompt.test.ts`、`tests/unit/main/services/structure-recommend-service.test.ts`

- [ ] Task 5: 11.7 Word 导入预览告警接入（AC: 4）
  - [ ] 5.1 Story 11.7 的 `WordImportPreview.tsx` 复用 `collectNodesExceedingDepth()` 或等价深度映射 helper，为超深节点渲染 `WarningOutlined` + Tooltip
  - [ ] 5.2 顶部统计增加“超深节点数”展示，帮助用户提前感知导入风险
  - [ ] 5.3 导入勾选逻辑继续允许这些节点进入 11.6 的 diff 合并流程
  - [ ] 5.4 新建 / 更新测试：`tests/unit/renderer/modules/editor/components/WordImportPreview.test.tsx`

- [ ] Task 6: 测试矩阵（AC: 全部）
  - [ ] 6.1 renderer 集成：Tab 形成第 7 层节点后，结构 mutation 成功、节点存在、并出现 2 秒警告
  - [ ] 6.2 renderer 集成：locked nodeKey 上的 Enter / Tab / Shift+Tab / Delete 返回 `blockedReason: 'locked'`，并显示 `AI 生成中，请稍候`
  - [ ] 6.3 main 集成：AI 推荐输出深度 >6 或节点数 >50 时，服务抛出 `STRUCTURE_VIOLATES_CONSTRAINTS`
  - [ ] 6.4 renderer 集成：Word 导入预览渲染深度 >6 节点时显示警告，同时保留勾选能力

## Dev Notes

### 关键实现约束

- **深度判断以 canonical snapshot 为准。** 11.5 的深度判断来自 11.3 mutation 返回的最新 `proposal.meta.json.sectionIndex`，而不是行号式 outline key 或旧树状态。
- **三条树链路共用一套约束 helper。** 结构面板、Word 导入预览、AI 推荐结果都需要共享深度 / 节点数校验，避免三套实现各自漂移。
- **结构锁定与正文生成锁定各自独立。** `useChapterGeneration()` 里的 `locked` 继续服务正文生成批次；结构面板锁定由 Story 11.2 的 `chapterStructureStore` 统一承载。
- **renderer 反馈沿用现有消息模式。** 当前仓库广泛使用 `App.useApp().message` 作为轻量提示通道；11.5 的 advisory warning / locked info 应沿用同一模式，并通过 keyed message 保持单实例。
- **11.8 仍需遵守既有 AI 主流程约束。** Prompt 放在 `src/main/prompts/`，AI 调用走 `agent-orchestrator`，任务进入 `task-queue`，脱敏在离开本机前完成。

### 已有代码资产（直接复用或扩展）

| 已有文件 | 本 Story 的作用 |
|---|---|
| `src/shared/chapter-identity.ts` | `sectionIndex` → tree / path / locator bridge；可扩展深度 helper |
| `src/main/services/chapter-structure-service.ts` | 11.1 已建立的结构 read-side service；11.3/11.8 在同一 service 上补 mutation / validation |
| `src/main/ipc/chapter-structure-handlers.ts` | `chapter-structure:*` thin IPC 包装点 |
| `src/preload/index.ts` | `chapterStructureList/Get/Tree/Path` renderer API 暴露点 |
| `src/renderer/src/stores/documentStore.ts` | renderer 当前持有 `sectionIndex` snapshot |
| `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` | 结构面板、编辑器、当前章节同步的真实集成点 |
| `src/renderer/src/modules/editor/components/DocumentOutlineTree.tsx` | 结构树壳层与未来快捷键 / feedback 集成点 |
| `src/renderer/src/modules/editor/hooks/useDocumentOutline.ts` | 当前 markdown → outline read-side 入口 |
| `src/shared/constants.ts` | 新增 `STRUCTURE_VIOLATES_CONSTRAINTS` 落点 |
| `src/main/services/task-queue/` | 11.8 AI 结构推荐任务排队模式 |
| `src/main/services/agent-orchestrator/` | 11.8 agent 注册与执行入口 |
| `src/main/services/docx-bridge/` | 当前 Python bridge 真实路径，供 11.7 复用 |

### Project Structure Notes

- `src/shared/chapter-utils.ts` 当前不存在。11.5 的共享深度 / 约束逻辑更适合落在新的 `src/shared/chapter-structure-constraints.ts`，或扩展 `chapter-identity.ts`。
- `src/renderer/src/stores/chapterStore.ts` 当前不存在。结构状态落点延续 Story 11.2 的 `src/renderer/src/stores/chapterStructureStore.ts`。
- 当前 renderer 轻提示主要通过 `App.useApp().message` 调用；11.5 的 warning/info 应保持这一用法，减少第二套全局提示实现。
- `src/main/services/docx-bridge.ts` 当前路径已经目录化为 `src/main/services/docx-bridge/`；11.7/11.5 相关引用应保持一致。
- `chapter-structure-service` 当前只暴露 read-side 方法；11.3 / 11.8 在同一 service 上扩 mutation 与 validation 更符合既有架构。

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.5] — 用户故事与 AC 原始来源
- [Source: _bmad-output/planning-artifacts/epics.md#FR70] — 快捷键结构编辑背景
- [Source: _bmad-output/planning-artifacts/epics.md#FR71] — AI 结构推荐背景
- [Source: _bmad-output/planning-artifacts/epics.md#FR72] — Word 目录导入背景
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR23] — 150-200ms / 300ms 动效规范
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR24] — 键盘可达性与焦点可见性要求
- [Source: _bmad-output/implementation-artifacts/11-2-focus-state-machine.md] — `chapterStructureStore`、五状态机、Locked 视觉态
- [Source: _bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md] — 结构 mutation、keyboard scope、`blockedReason` 接口边界
- [Source: _bmad-output/implementation-artifacts/11-7-word-outline-import.md] — Word 目录预览与勾选流程
- [Source: _bmad-output/implementation-artifacts/11-8-llm-structure-recommend.md] — AI 结构推荐 prompt / stream / diff 视图目标
- [Source: src/main/services/chapter-structure-service.ts] — 当前 canonical 结构 service
- [Source: src/main/ipc/chapter-structure-handlers.ts] — 当前 `chapter-structure:*` handler
- [Source: src/preload/index.ts] — 当前 `chapterStructure*` preload API
- [Source: src/renderer/src/stores/documentStore.ts] — renderer 当前 `sectionIndex` 持有位置
- [Source: src/renderer/src/modules/project/components/ProjectWorkspace.tsx] — outline / currentSection 集成点
- [Source: src/renderer/src/modules/editor/components/DocumentOutlineTree.tsx] — 当前结构树壳层
- [Source: src/renderer/src/modules/editor/hooks/useChapterGeneration.ts] — 正文生成 `locked` 现有语义
- [Source: src/shared/chapter-identity.ts] — canonical `sectionId ↔ locator/path` bridge
- [Source: src/shared/constants.ts] — ErrorCode 定义位置
- [Source: AGENTS.md] — thin IPC、task-queue、prompt 目录、Zustand store 约束

## Change Log

- 2026-04-18: `validate-create-story` 校准实现路径
  - 将不存在的 `src/shared/chapter-utils.ts` 收敛为共享 `chapter-structure-constraints` helper + `chapter-identity.ts` 深度 helper
  - 将不存在的 `chapterStore` 收敛为 Story 11.2 的 `chapterStructureStore`
  - 将 renderer 提示通道收敛到当前仓库真实使用的 `App.useApp().message`
  - 明确深度判断基于 11.3 mutation 返回的最新 `sectionIndex` snapshot
  - 补入 11.8 所需的 `task-queue` / `agent-orchestrator` / `STRUCTURE_VIOLATES_CONSTRAINTS` 合同
  - 补回 create-story 模板要求的 validation note、`Project Structure Notes`、`Change Log`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
