# Story 11.3 Validation Report

日期：2026-04-18  
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）  
目标文档：`_bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md`

## 校验范围

本次校验按 `validate-create-story` 工作流执行。复核范围覆盖：

- `_bmad/bmm/config.yaml`
- `.agents/skills/bmad-create-story/workflow.md`
- `.agents/skills/bmad-create-story/checklist.md`
- `_bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md`
- `_bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor.md`
- `_bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor-validation-report.md`
- `_bmad-output/implementation-artifacts/11-2-focus-state-machine.md`
- `_bmad-output/implementation-artifacts/11-2-focus-state-machine-validation-report.md`
- `_bmad-output/implementation-artifacts/11-4-soft-delete-toast-undo.md`
- `_bmad-output/implementation-artifacts/11-5-depth-limit-warn-llm-lock.md`
- `_bmad-output/implementation-artifacts/11-8-llm-structure-recommend.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- 当前代码基线：
  - `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
  - `src/renderer/src/modules/project/components/OutlinePanel.tsx`
  - `src/renderer/src/modules/editor/components/DocumentOutlineTree.tsx`
  - `src/renderer/src/modules/editor/components/PlateEditor.tsx`
  - `src/renderer/src/modules/editor/hooks/useDocumentOutline.ts`
  - `src/renderer/src/modules/annotation/hooks/useCurrentSection.ts`
  - `src/renderer/src/stores/documentStore.ts`
  - `src/shared/chapter-markdown.ts`
  - `src/shared/chapter-identity.ts`
  - `src/shared/chapter-locator-key.ts`
  - `src/shared/chapter-types.ts`
  - `src/shared/template-types.ts`
  - `src/shared/ipc-types.ts`
  - `src/preload/index.ts`
  - `src/main/services/chapter-structure-service.ts`
  - `src/main/services/document-service.ts`
- 近期 git 记录：
  - `0d9d123 fix: preserve taskId locator mapping for trailing batch-complete event`
  - `c584721 fix: inject chapter + project context into skill-diagram prompt`
  - `8846a37 fix: clamp skill-diagram maxTokens to 32768 for Gemini proxy compat`
  - `0cbd1bc fix: defense-in-depth guard against empty-editor catastrophic overwrite`
  - `407e577 feat: chapter-summary cache with stale-race, bloat, and fan-out fixes (Story 3-12)`

## 发现并已修复的问题

### 1. Story 仍写在不存在的 `chapterStore` 上

原 Story 将结构键盘动作全部落到 `src/renderer/src/stores/chapterStore.ts`。当前仓库没有这个 store，Story 11.2 validation 已经把 renderer 状态容器收敛到 `chapterStructureStore`。

已修复：

- 将 renderer 状态落点统一到 Story 11.2 的 `chapterStructureStore`
- 将 `sectionIdByNodeKey`、`focusNode()`、`enterEditing()`、`useChapterNodeState()` 写回 11.3 的实现前提

### 2. Story 把结构编辑写成了纯树状态变化，漏掉了真实的 markdown 写路径

当前大纲树来自 `ProjectWorkspace.tsx` 里的 `useDocumentOutline(documentContent)`。只改 renderer 内存态，outline 与 Plate 正文会立刻失真。

已修复：

- 补入 `proposal.md` + `proposal.meta.json.sectionIndex` 的同步更新要求
- 明确 main-process mutation 必须返回最新 `markdown` 与 `sectionIndex` snapshot
- 明确 renderer 要把 mutation 返回值写回 `documentStore`

### 3. Tab / Shift+Tab 缺少“整棵子树搬运 + heading level 重算”定义

原 Story 把 `Tab` / `Shift+Tab` 写成节点层级变化，缺少 markdown subtree block 搬运、后代 heading level 调整、`parentSectionId/order/occurrenceIndex` 归一化。实际实现中最容易在这里损坏文档结构。

已修复：

- 在 shared helper 任务中补入 subtree 级 markdown 变换要求
- 在 `chapter-structure-service` 任务中补入 `normalizeSiblingOrder()`、`headingLocator` 重算与后代层级同步

### 4. 方向键导航缺少现有滚动链路，焦点会被 `useCurrentSection()` 拉回旧节点

当前鼠标点击大纲节点通过 `ProjectWorkspace.tsx` 复用 `scrollToHeading()` 来驱动编辑器滚动。原 Story 的方向键只切 tree focus，没有接上编辑器滚动路径，焦点同步会立刻漂移。

已修复：

- 明确方向键导航复用与鼠标点击相同的 `handleOutlineNavigate(node)` / `scrollToHeading()` 链路
- 将这一要求写入 AC1、Task 4、Task 5 与 Dev Notes

### 5. Story 11.2 与 11.3 的 Editing 态按键语义互相冲突

Story 11.2 已把 Editing 态定义为“大纲标题 inline Input”，`Enter` 用于提交。原 Story 11.3 又写成“Editing 态下 Enter 插入换行”，这与单行标题编辑契约直接冲突。

已修复：

- 将 11.3 的 AC2 拆成“两种编辑上下文”：
  - 大纲标题 inline Input 继续沿用 11.2 的 Enter 提交 / Esc 取消
  - Plate 正文编辑继续保留自己的 Enter / Shift+Enter / Tab 语义
- 明确结构快捷键只在树根焦点作用域内生效

### 6. Delete 热键缺少 `sectionId` 级联目标集合与 11.4 边界

原 Story 直接写 `chapterStore.softDelete(ids)`，既缺少 descendant target 的解析路径，也把 11.4 的事务 / Undo / GC 责任提前混进了 11.3。

已修复：

- 将 11.3 的 Delete 责任收敛为“快捷键入口 + 级联 `sectionId[]` 集合构造”
- 明确删除事务与 Undo 生命周期归 Story 11.4
- 补入 `sectionIdByNodeKey` 桥接要求

### 7. 快捷键绑定点写得过于抽象，真实焦点节点没有被点名

原 Story 写“结构面板根组件挂 hook”。当前真正承载键盘焦点与 Tree 交互的是 `DocumentOutlineTree.tsx`，`OutlinePanel.tsx` 负责 240px / 40px 壳层。

已修复：

- 将快捷键绑定点收敛到 `DocumentOutlineTree` 根节点
- 保留 `OutlinePanel.tsx` 的壳层职责不变
- 补入 `tabIndex={0}`、focus outline、inline Input 停止冒泡等实现要求

### 8. Story artifact 结构不完整

原 Story 缺少 create-story 模板要求的 validation note、`Project Structure Notes`、`Change Log`。

已修复：

- 补回 validation note
- 增加 `Project Structure Notes`
- 增加 `Change Log`

## 已修改工件

- `_bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete.md`
- `_bmad-output/implementation-artifacts/11-3-xmind-keymap-cascade-delete-validation-report.md`

## 剩余风险

- `_bmad-output/implementation-artifacts/11-4-soft-delete-toast-undo.md`
- `_bmad-output/implementation-artifacts/11-5-depth-limit-warn-llm-lock.md`
- `_bmad-output/implementation-artifacts/11-8-llm-structure-recommend.md`

这些相邻 Story 仍带有旧草稿痕迹，尤其是 `chapterStore`、SQLite `chapters` 表、以及 renderer/main 边界的旧假设。进入实现前继续按同一 contract 执行 `validate-create-story` 可以保持 11.x 串联一致。

## 结果

经本轮 `validate-create-story` 复核与原位修订后，Story 11.3 已与以下事实完成必要对齐：

- 当前结构面板真实入口：`ProjectWorkspace.tsx` + `OutlinePanel.tsx` + `DocumentOutlineTree.tsx`
- 当前 renderer identity bridge：Story 11.2 的 `chapterStructureStore` + `sectionIdByNodeKey`
- 当前持久化结构合同：`proposal.meta.json.sectionIndex` 中的 `sectionId`
- 当前可见 outline 来源：`proposal.md` 的 heading 解析
- 当前章节同步链路：`useCurrentSection()` + `scrollToHeading()`
- 当前主进程落点：`chapter-structure-service` + thin IPC + preload wrapper

当前 Story 已具备进入 `dev-story` 的实现清晰度，结论为 **PASS**。

## 备注

- 本次仅进行了 story-spec 修订，没有运行代码测试。
