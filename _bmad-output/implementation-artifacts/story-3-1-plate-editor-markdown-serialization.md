# Story 3.1: Plate 富文本编辑器集成与 Markdown 序列化

Status: ready-for-dev

## Story

As a 售前工程师,
I want 使用所见即所得的富文本编辑器编辑方案内容,
So that 我专注于内容而非 Markdown 语法，编辑体验接近最终 docx 效果。

## Acceptance Criteria

### AC1: Plate 编辑器渲染与基础格式

- **Given** 进入方案编辑界面
- **When** 编辑器加载
- **Then** Plate/Slate 编辑器渲染方案内容为富文本，支持标题层级（H1-H4）、有序/无序列表、表格、代码块、粗体/斜体/下划线/删除线/行内代码
- [Source: epics.md Story 3.1 AC1, FR24]

### AC2: Markdown 序列化与 Sidecar JSON

- **Given** 用户编辑内容
- **When** 内容变更
- **Then** Slate AST 自动序列化为标准 Markdown 文件（`proposal.md`），元数据保存到 sidecar JSON（`proposal.meta.json`）
- [Source: epics.md Story 3.1 AC2, NFR13]

### AC3: 中文排版与终稿效果

- **Given** 方案正文渲染
- **When** 用户阅读
- **Then** 正文行高 1.8（高于常规 1.5），内容宽度限制 800px，中文排版舒适接近终稿效果
- [Source: epics.md Story 3.1 AC3, UX-DR4, UX-DR6]

### AC4: 编辑器响应性能

- **Given** 用户按键输入
- **When** 字符渲染
- **Then** 按键到渲染延迟 <100ms
- [Source: epics.md Story 3.1 AC4, NFR6]

### AC5: 自动保存与崩溃恢复

- **Given** 编辑过程中
- **When** 内容变更
- **Then** 防抖自动保存到文件系统（1 秒间隔），窗口关闭前强制刷写；应用崩溃后最多丢失最后 1 秒未保存内容
- [Source: epics.md Story 3.1 AC5, NFR17]

## Tasks / Subtasks

- [ ] Task 1: 安装 Plate 依赖 (AC: 1, 2)
  - [ ] 1.1 安装核心包：
    ```bash
    pnpm add platejs @platejs/basic-nodes @platejs/list-classic @platejs/markdown @platejs/table @platejs/code-block
    ```
    - `platejs`：核心引擎 + React 组件（含 `usePlateEditor`、`Plate`、`PlateContent` 等）
    - `@platejs/basic-nodes`：标题、粗体、斜体、下划线、删除线、行内代码、引用块等
    - `@platejs/list-classic`：标准 HTML/Markdown 兼容的有序/无序列表插件；本 Story 选 classic 而不是 `@platejs/list`，因为需要稳定的 `ul/ol > li` 结构和 clean Markdown export
    - `@platejs/markdown`：Markdown 序列化/反序列化插件（`MarkdownPlugin`）；**使用 `@platejs/markdown`，不要用已废弃的 `@udecode/plate-markdown`**
    - `@platejs/table`：表格插件
    - `@platejs/code-block`：代码块插件
  - [ ] 1.2 安装 remark GFM 支持：`pnpm add remark-gfm`（表格/删除线/任务列表的 Markdown 解析）
  - [ ] 1.3 确认 TypeScript 配置：`tsconfig.web.json` 需有 `"moduleResolution": "bundler"`（Plate 52.x 要求 TS 5.0+）
  - [ ] 1.4 React renderer 统一使用客户端导入路径：编辑器从 `platejs/react` 导入，插件从 `@platejs/*/react` 导入；不要把 Node/SSR 场景的 base imports 直接搬进 renderer 组件

- [ ] Task 2: 共享类型定义 (AC: 1, 2, 5)
  - [ ] 2.1 创建 `src/shared/models/proposal.ts`：
    ```typescript
    /** 方案文档数据模型 */
    export interface ProposalDocument {
      projectId: string
      content: string          // Markdown 文本
      lastSavedAt: string      // ISO-8601
      version: number
    }

    /** proposal.meta.json 结构 */
    export interface ProposalMetadata {
      version: string          // schema 版本 "1.0"
      projectId: string
      annotations: []          // Alpha 阶段空数组占位，Epic 4 填充
      scores: []               // Alpha 阶段空数组占位，Epic 7 填充
      lastSavedAt: string      // ISO-8601
    }

    /** 自动保存状态 */
    export interface AutoSaveState {
      dirty: boolean
      saving: boolean
      lastSavedAt: string | null
      error: string | null
    }
    ```
  - [ ] 2.2 在 `src/shared/models/index.ts` 导出 proposal 类型
  - [ ] 2.3 在 `src/shared/ipc-types.ts` 的 `IpcChannelMap` 新增通道：
    - `'document:load'`: `{ input: { projectId: string }; output: ProposalDocument }`
    - `'document:save'`: `{ input: { projectId: string; content: string }; output: { lastSavedAt: string } }`
    - `'document:get-metadata'`: `{ input: { projectId: string }; output: ProposalMetadata }`
  - [ ] 2.4 在 `src/shared/constants.ts` 的 `ErrorCode` 枚举补充：`DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND'`、`DOCUMENT_SAVE_FAILED = 'DOCUMENT_SAVE_FAILED'`

- [ ] Task 3: 主进程文档服务 (AC: 2, 5)
  - [ ] 3.1 创建 `src/main/services/document-service.ts`：
    ```typescript
    class DocumentService {
      /** 读取 proposal.md，不存在则返回空字符串 */
      async load(projectId: string): Promise<ProposalDocument>

      /** 写入 proposal.md + 更新 proposal.meta.json 的 lastSavedAt */
      async save(projectId: string, content: string): Promise<{ lastSavedAt: string }>

      /** 读取 proposal.meta.json */
      async getMetadata(projectId: string): Promise<ProposalMetadata>
    }
    ```
  - [ ] 3.2 文件路径解析：调用 `projectService.get(projectId)` 获取 `ProjectTable` 记录，从其 `rootPath` 字段获取项目目录路径（`{userData}/data/projects/{projectId}/`）。注意：`projectService` 无 `getProjectPath()` 方法，需通过 `get()` 获取完整记录后读取 `rootPath`
  - [ ] 3.3 读写使用 `fs.promises`（禁止同步 I/O）
  - [ ] 3.4 save 操作使用原子写入策略：先写临时文件 `.proposal.md.tmp`，再 `rename` 覆盖——防止写入中途崩溃导致文件损坏
  - [ ] 3.5 错误使用 `BidWiseError` 子类（`DocumentNotFoundError`、`DocumentSaveError`）

- [ ] Task 4: IPC Handler (AC: 2, 5)
  - [ ] 4.1 创建 `src/main/ipc/document-handlers.ts`：
    - `document:load` — 调用 `documentService.load()`
    - `document:save` — 调用 `documentService.save()`
    - `document:get-metadata` — 调用 `documentService.getMetadata()`
  - [ ] 4.2 遵循薄分发模式：参数解析 → 调用 service → 包装 `{ success, data }` / `{ success: false, error }`
  - [ ] 4.3 在 `src/main/ipc/index.ts` 注册 `registerDocumentHandlers()`
  - [ ] 4.4 注意：document:save 不需要走 task-queue（非白名单操作），但需做防抖（连续快速保存只执行最后一次）

- [ ] Task 5: Preload API (AC: 2, 5)
  - [ ] 5.1 在 `src/preload/index.ts` 的 `requestApi` 对象中手动添加新 IPC 通道方法（preload 是手动 `typedInvoke` 封装映射，非自动生成）：`documentLoad`、`documentSave`、`documentGetMetadata`，并确认 `api` 对象满足 `PreloadApi` 类型约束（编译时自动检查）

- [ ] Task 6: documentStore 创建 (AC: 1, 2, 5)
  - [ ] 6.1 创建 `src/renderer/src/stores/documentStore.ts`：
    ```typescript
    interface DocumentState {
      // State
      content: string                  // 当前 Markdown 内容
      loading: boolean                 // 文档加载中
      error: string | null
      autoSave: AutoSaveState          // 自动保存状态

      // Actions
      loadDocument: (projectId: string) => Promise<void>
      updateContent: (content: string) => void   // 编辑器内容变更 → 触发自动保存
      saveDocument: (projectId: string) => Promise<void>
      resetDocument: () => void
    }
    ```
  - [ ] 6.2 `updateContent` 内部逻辑：设置 `autoSave.dirty = true`，启动防抖定时器（1 秒），到期后自动调用 `saveDocument`
  - [ ] 6.3 `saveDocument` 流程：设置 `autoSave.saving = true` → IPC `document:save` → 更新 `autoSave.lastSavedAt` → 设置 `autoSave.dirty = false`、`autoSave.saving = false`
  - [ ] 6.4 `loadDocument` 流程：设置 `loading = true` → IPC `document:load` → 设置 `content` → `loading = false`
  - [ ] 6.5 遵循 Store 命名规范：`loading: boolean`（不用 `isLoading`）
  - [ ] 6.6 在 `src/renderer/src/stores/index.ts` 导出 `useDocumentStore`

- [ ] Task 7: Plate 编辑器核心组件 (AC: 1, 3, 4)
  - [ ] 7.1 创建 `src/renderer/src/modules/editor/plugins/editorPlugins.ts`：
    ```typescript
    import {
      BlockquotePlugin,
      BoldPlugin,
      CodePlugin,
      H1Plugin,
      H2Plugin,
      H3Plugin,
      H4Plugin,
      ItalicPlugin,
      StrikethroughPlugin,
      UnderlinePlugin,
    } from '@platejs/basic-nodes/react'
    import {
      BulletedListPlugin,
      ListItemContentPlugin,
      ListItemPlugin,
      ListPlugin,
      NumberedListPlugin,
    } from '@platejs/list-classic/react'
    import { TablePlugin } from '@platejs/table/react'
    import { CodeBlockPlugin, CodeLinePlugin } from '@platejs/code-block/react'
    import { MarkdownPlugin } from '@platejs/markdown'
    import remarkGfm from 'remark-gfm'

    export const editorPlugins = [
      H1Plugin,
      H2Plugin,
      H3Plugin,
      H4Plugin,
      BoldPlugin,
      ItalicPlugin,
      UnderlinePlugin,
      StrikethroughPlugin,
      CodePlugin,         // 行内代码
      BlockquotePlugin,
      ListPlugin,
      BulletedListPlugin,
      NumberedListPlugin,
      ListItemPlugin,
      ListItemContentPlugin,
      TablePlugin,
      CodeBlockPlugin,
      CodeLinePlugin,
      MarkdownPlugin.configure({
        options: {
          remarkPlugins: [remarkGfm],
        },
      }),
    ]
    ```
  - [ ] 7.2 创建 `src/renderer/src/modules/editor/components/PlateEditor.tsx`：
    - 使用 `usePlateEditor({ plugins: editorPlugins, value: initialValue })` 创建编辑器实例
    - `<Plate editor={editor} onChange={...}>` + `<PlateContent />` 组成基础编辑器
    - `onChange` 回调：调用 `editor.api.markdown.serialize()` 获取 Markdown → `documentStore.updateContent(markdown)` 触发自动保存
    - `PlateContent` 样式：Tailwind 类名实现 800px 最大宽度、1.8 行高、中文字体栈
  - [ ] 7.3 编辑器容器样式要点（Tailwind）：
    ```
    max-w-[800px] mx-auto            -- 800px 内容限宽 + 居中
    leading-[1.8]                     -- 行高 1.8
    font-[PingFang_SC,Microsoft_YaHei,sans-serif]  -- 中文字体栈
    text-sm                           -- 14px 正文（Body）
    focus:outline-none                -- 编辑区无焦点外框
    ```
  - [ ] 7.4 标题层级字号映射（与 UX-DR4 对齐）：
    - H1: 24px (`text-2xl`)、H2: 20px (`text-xl`)、H3: 16px (`text-base font-semibold`)、H4: 14px (`text-sm font-semibold`)
  - [ ] 7.5 性能保障（NFR6 <100ms）：
    - `onChange` 中 Markdown 序列化使用 `requestIdleCallback` 或 `setTimeout(fn, 0)` 异步化，不阻塞按键渲染
    - 仅在编辑器 idle 后序列化，不在每个按键时同步序列化
    - 防抖序列化间隔：300ms（序列化频率）vs 1000ms（自动保存频率），两层防抖

- [ ] Task 8: Markdown 序列化器 (AC: 2)
  - [ ] 8.1 创建 `src/renderer/src/modules/editor/serializer/markdownSerializer.ts`：
    ```typescript
    import type { PlateEditor } from 'platejs'

    /** 将当前编辑器内容序列化为 Markdown */
    export function serializeToMarkdown(editor: PlateEditor): string {
      return editor.api.markdown.serialize()
    }

    /** 将 Markdown 反序列化为 Plate 编辑器节点 */
    export function deserializeFromMarkdown(editor: PlateEditor, markdown: string) {
      return editor.api.markdown.deserialize(markdown)
    }
    ```
  - [ ] 8.2 序列化层仅做薄封装——核心逻辑由 `@platejs/markdown` 的 `MarkdownPlugin` 处理
  - [ ] 8.3 反序列化时确保所有必需插件已注册（`H1Plugin`-`H4Plugin`、`ListPlugin`/`ListItemPlugin`、`TablePlugin`、`CodeBlockPlugin` 等），否则对应元素会被丢弃
  - [ ] 8.4 在 `src/renderer/src/modules/editor/serializer/index.ts` 导出

- [ ] Task 9: 编辑器模块入口与集成 (AC: 1, 3)
  - [ ] 9.1 创建 `src/renderer/src/modules/editor/components/EditorView.tsx`：
    - 作为编辑器模块的顶层容器组件
    - 接收 `projectId` prop
    - 调用 `documentStore.loadDocument(projectId)` 加载文档
    - loading 时显示骨架屏（Ant Design `Skeleton`）
    - 加载完成后渲染 `PlateEditor` 组件，传入初始 Markdown 内容
    - 顶部工具栏区域预留（本 Story 不实现；后续是否在 Story 3.2 一并激活，以经 validation 的 Story 3.2 文件为准）
  - [ ] 9.2 创建 `src/renderer/src/modules/editor/hooks/useDocument.ts`：
    - 封装 `documentStore` 的常用操作组合
    - 自动保存状态监听
    - Cmd/Ctrl+S 拦截：显示"已自动保存"微提示（Toast），不执行手动保存（UX-DR27）
  - [ ] 9.3 更新 `src/renderer/src/modules/editor/types.ts`：定义编辑器模块内部类型
  - [ ] 9.4 **[边界说明 — 属于 Story 3.2]** `ProjectWorkspace.tsx` 中 `WorkspaceLayout` 的主内容区分支接入（在"方案撰写"阶段用 `EditorView` 替换 `StageGuidePlaceholder`）由 Story 3.2 负责。本 Story 仅创建可独立渲染的 `EditorView` / `PlateEditor`，并稳定其 `projectId`、加载态、自动保存契约；**不要**在本 Story 修改工作空间阶段切换逻辑

- [ ] Task 10: 自动保存机制 (AC: 5)
  - [ ] 10.1 在 `useDocument` hook 中实现 `beforeunload` 事件监听：窗口关闭前强制保存未保存内容
  - [ ] 10.2 防抖保存实现细节：
    - 编辑器 `onChange` → 300ms 防抖序列化 Markdown → `documentStore.updateContent(markdown)`
    - `updateContent` → 设置 dirty → 1000ms 防抖自动保存 → IPC `document:save`
    - 两层防抖确保：按键不卡顿（序列化异步）、保存不频繁（1 秒聚合）
  - [ ] 10.3 状态栏集成：在底部状态栏展示自动保存状态（"已保存"/"保存中..."/"未保存更改"）。当前 `StatusBar` 组件仅接受 `currentStageName?: string` prop（无自定义内容插槽），需扩展 `StatusBarProps` 增加 `leftExtra?: React.ReactNode` prop 用于显示自动保存状态指示器（保存图标 + 文字），保持与现有 metrics 占位符并列展示
  - [ ] 10.4 错误恢复：保存失败时设置 `autoSave.error`，UI 显示警告并提供"重试保存"按钮

- [ ] Task 11: 单元测试 (AC: 全部)
  - [ ] 11.1 `tests/unit/main/services/document-service.test.ts`：
    - load：正常读取、文件不存在返回空内容、项目路径无效报错
    - save：正常写入、原子写入验证（tmp + rename）、写入失败报 DocumentSaveError
    - getMetadata：正常读取、文件不存在返回默认结构
  - [ ] 11.2 `tests/unit/renderer/stores/documentStore.test.ts`：
    - loadDocument：loading 状态流转、IPC 调用、content 赋值
    - updateContent：dirty 标记、防抖定时器启动
    - saveDocument：saving 状态流转、IPC 调用、lastSavedAt 更新、dirty 重置
    - 错误处理：IPC 失败时 error 状态设置
  - [ ] 11.3 `tests/unit/renderer/modules/editor/serializer/markdownSerializer.test.ts`：
    - 基础格式往返（roundtrip）：标题、列表、表格、代码块、粗体/斜体
    - 空文档序列化为空字符串
    - 纯文本 Markdown 反序列化为正确节点
  - [ ] 11.4 `tests/unit/renderer/modules/editor/components/PlateEditor.test.tsx`：
    - 编辑器正确挂载
    - 初始内容正确渲染
    - onChange 回调触发（模拟输入后验证 documentStore.updateContent 被调用）
  - [ ] 11.5 `tests/unit/renderer/modules/editor/components/EditorView.test.tsx`：
    - loading 状态显示骨架屏
    - 加载完成后显示 PlateEditor
    - 错误状态显示错误提示

- [ ] Task 12: 集成验证 (AC: 全部)
  - [ ] 12.1 验证 `pnpm lint && pnpm typecheck && pnpm build` 全部通过
  - [ ] 12.2 验证本 Story 范围内完整流程：以现有 `projectId` 独立挂载 `EditorView` → 编辑器加载 → 输入内容 → 自动保存 → 卸载并重新挂载 `EditorView` → 内容恢复
  - [ ] 12.3 验证 Markdown 往返一致性：在编辑器中创建含标题/列表/表格/代码块的内容 → 保存 → 用文本编辑器打开 `proposal.md` 确认为标准 Markdown → 重新加载验证内容一致
  - [ ] 12.4 验证性能：快速连续输入 50 字符，无明显卡顿（<100ms 响应）
  - [ ] 12.5 验证崩溃恢复：编辑内容 → 强制退出应用 → 重启 → 内容已保存（最多丢失最后 1 秒未保存内容）

## Dev Notes

### 架构模式与约束

**本 Story 在架构中的位置——Epic 3 的基石：**
```
方案编辑界面
  → Renderer (EditorView → PlateEditor)
    → Plate 编辑器 (Slate AST)
      → MarkdownPlugin 序列化
        → documentStore.updateContent(markdown)
          → 防抖 1s → IPC (document:save)
            → document-handlers.ts（薄分发）
              → documentService.save(projectId, content)
                → fs.promises.writeFile(proposal.md)（原子写入）
                → 更新 proposal.meta.json lastSavedAt
```

**本 Story 是 Epic 3 所有后续 Story 的基础：**
- Story 3.2（编辑器嵌入工作空间与文档大纲）→ 在本 Story 的 PlateEditor 基础上添加大纲树
- Story 3.3（模板驱动方案骨架）→ 在本 Story 的编辑器中渲染生成的骨架
- Story 3.4（AI 章节生成）→ AI 内容通过本 Story 的序列化器写入编辑器
- Story 3.7（draw.io）→ 在本 Story 的 Plate 配置中添加自定义 Void Element 插件
- Story 3.8（Mermaid）→ 在本 Story 的 Plate 配置中添加代码块渲染扩展

### 已有代码资产（禁止重复创建）

| 已有文件 | 内容 | Story |
|----------|------|-------|
| `src/renderer/src/modules/project/components/WorkspaceLayout.tsx` | 三栏布局（大纲/主内容/侧边栏），按 SOP 阶段切换主内容 | 1-7 |
| `src/renderer/src/modules/project/components/StatusBar.tsx` | 底部 32px 状态栏 | 1-7 |
| `src/main/services/project-service.ts` | `get(id)` 返回 ProjectTable（含 `rootPath` 项目目录）；`create()` 时已初始化 `proposal.md`、`proposal.meta.json`、`assets/` | 1-2/1-5 |
| `src/shared/ipc-types.ts` | IpcChannelMap 类型定义 + `FullPreloadApi` 自动派生类型（编译时强制 preload 方法完备性） | 1-3 |
| `src/shared/constants.ts` | ErrorCode 枚举 | 1-1 |
| `src/main/utils/errors.ts` | BidWiseError 基类 + 子类 | 1-1 |
| `src/main/utils/logger.ts` | `createLogger(module)` | 1-1 |
| `src/main/ipc/index.ts` | IPC handler 注册入口 | 1-3 |
| `src/preload/index.ts` | contextBridge + 手动 `requestApi` 映射（`typedInvoke` 封装） | 1-3 |
| `src/renderer/src/stores/projectStore.ts` | 项目状态管理（参照 Store 模式） | 1-5 |
| `src/renderer/src/stores/analysisStore.ts` | 分析模块 Store（参照防抖/进度模式） | 2-3 |
| `src/renderer/src/stores/index.ts` | Store 统一导出 | 1-5 |
| `src/renderer/src/modules/editor/components/.gitkeep` | 编辑器组件目录占位 | 1-1 |
| `src/renderer/src/modules/editor/hooks/.gitkeep` | 编辑器 hooks 目录占位 | 1-1 |
| `src/renderer/src/modules/editor/plugins/` | 编辑器插件目录（空） | 1-1 |
| `src/renderer/src/modules/editor/serializer/` | 序列化器目录（空） | 1-1 |
| `src/renderer/src/modules/editor/types.ts` | 编辑器类型文件（空占位） | 1-1 |

**关键提醒：**
- `proposal.md` 和 `proposal.meta.json` 已在项目创建时由 `project-service.ts` 初始化为空文件/默认结构
- `ProjectWorkspace.tsx` 当前在 `WorkspaceLayout.center` 中仅对 `requirements-analysis` 渲染 `AnalysisView`，其余阶段仍回退到 `StageGuidePlaceholder`；按 Epic 3 定义，"方案撰写"阶段接入 `EditorView` 属于 Story 3.2
- preload 是手动映射：新增 IPC 通道需在 `IpcChannelMap` 中声明类型 **且** 在 `requestApi` 中手动添加对应方法；`FullPreloadApi` 类型会在编译时检查完备性
- 已有的 `StatusBar` 组件仅接受 `currentStageName?: string` prop（无自定义内容插槽），本 Story 需扩展其 props 以支持自动保存状态展示

### Plate.js 技术要点

**包版本与选择（2026-03 最新）：**
- 核心：`platejs` ^52.x（含 `usePlateEditor`、`Plate`、`PlateContent` 等 React 组件）
- 基础节点：`@platejs/basic-nodes` ^52.x（renderer 中从 `@platejs/basic-nodes/react` 导入）
- 列表：`@platejs/list-classic`（renderer 中从 `@platejs/list-classic/react` 导入；用于有序/无序列表的标准 `ul/ol > li` 结构）
- 表格：`@platejs/table` ^49.x（renderer 中从 `@platejs/table/react` 导入）
- 代码块：`@platejs/code-block`（renderer 中从 `@platejs/code-block/react` 导入）
- Markdown：`@platejs/markdown` ^52.x（**不要用已废弃的 `@udecode/plate-markdown`**）
- GFM：`remark-gfm`（表格/删除线的 Markdown 解析）

**Plate 核心 API：**
```typescript
// 创建编辑器实例（memoized，跨 re-render 稳定）
const editor = usePlateEditor({
  plugins: editorPlugins,
  value: initialNodes,  // Descendant[] 初始内容
})

// 渲染
<Plate editor={editor} onChange={({ value }) => handleChange(value)}>
  <PlateContent className="..." placeholder="开始撰写方案..." />
</Plate>

// Markdown 序列化（需 MarkdownPlugin 已注册）
const markdown = editor.api.markdown.serialize()

// Markdown 反序列化
const nodes = editor.api.markdown.deserialize(markdownString)
```

**初始加载流程：**
1. `EditorView` mount → `documentStore.loadDocument(projectId)` → IPC `document:load` → 返回 `proposal.md` 内容
2. 拿到 Markdown 字符串 → `editor.api.markdown.deserialize(markdown)` → 得到 `Descendant[]`
3. 将 `Descendant[]` 设为编辑器初始值 → 编辑器渲染富文本

**编辑保存流程：**
1. 用户编辑 → Plate `onChange` 回调触发
2. 300ms 防抖后 → `editor.api.markdown.serialize()` → 得到 Markdown 字符串
3. `documentStore.updateContent(markdown)` → 设置 dirty
4. 1000ms 防抖后 → `documentStore.saveDocument(projectId)` → IPC `document:save`
5. 主进程 `documentService.save()` → 原子写入 `proposal.md`

### 文件格式设计

**proposal.md（标准 Markdown，NFR13 要求人机可读）：**
```markdown
# 系统架构设计

## 整体架构

本系统采用微服务架构...

### 技术选型

| 组件 | 技术 | 说明 |
|------|------|------|
| 后端 | Spring Cloud | 微服务框架 |
| 前端 | React | 用户界面 |

## 功能模块设计

1. 用户管理模块
2. 数据处理模块
   - 数据采集
   - 数据清洗
```

**proposal.meta.json（sidecar 元数据）：**
```json
{
  "version": "1.0",
  "projectId": "uuid",
  "annotations": [],
  "scores": [],
  "lastSavedAt": "2026-03-21T10:00:00.000Z"
}
```

Alpha 阶段 sidecar JSON 仅维护 `version`、`projectId`、`lastSavedAt`；`annotations` 和 `scores` 为空数组占位，由 Epic 4（批注系统）和 Epic 7（评分引擎）填充。

### 性能优化策略

**NFR6 保障（<100ms 按键响应）：**
- Plate 的 Slate 底层已经是增量更新 DOM，单次按键不会触发全量重渲染
- Markdown 序列化在 `requestIdleCallback` 或 `setTimeout(fn, 0)` 中异步执行，不阻塞按键事件循环
- 序列化结果缓存：仅当编辑器 AST 实际变化时才重新序列化
- 自动保存防抖（1 秒）确保 I/O 不频繁

**大文档性能预期：**
- 100 页方案（约 50K 字符）→ Markdown 序列化耗时预计 <50ms
- 如果实测超过 100ms，考虑增量序列化（仅序列化变更 section）——但 Alpha 阶段先用全量序列化

### 与后续 Story 的接口契约

**Story 3.2（编辑器嵌入工作空间与文档大纲）将消费：**
- `EditorView` 组件 → 由 `ProjectWorkspace.tsx` 在"方案撰写"阶段嵌入三栏布局主内容区
- `PlateEditor` 组件 → 作为 `EditorView` 的内部编辑器实现
- `editorPlugins` → 可能扩展新插件
- `documentStore` → 文档状态

**Story 3.3（模板驱动方案骨架）将消费：**
- `editor.api.markdown.deserialize()` → 将生成的骨架 Markdown 加载到编辑器
- `documentStore.saveDocument()` → 骨架保存

**Story 3.4（AI 章节生成）将消费：**
- 编辑器 API → AI 生成内容插入到指定章节位置
- `documentStore` → 更新内容并保存

**Story 3.7（draw.io）将消费：**
- `editorPlugins` → 添加自定义 Void Element 插件
- Plate 插件系统 → 注册 draw.io iframe 包裹器

**Epic 4（批注系统）将消费：**
- Plate Mark 机制 → 内联批注标记
- `proposal.meta.json` → annotations 数组
- `documentStore` → 批注状态同步

本 Story 需为这些消费者预留稳定接口，但不提前实现下游逻辑。

### 反模式清单（禁止）

- ❌ 使用 `@udecode/plate-markdown`（已废弃，使用 `@platejs/markdown`）
- ❌ 渲染进程直接 import `fs`/`path` 等 Node.js 模块（通过 IPC 调用主进程）
- ❌ IPC handler 中写文件读写业务逻辑（委托给 DocumentService）
- ❌ 同步文件 I/O（使用 `fs.promises`）
- ❌ `../../` 相对路径 import（使用 `@main/`、`@shared/`、`@renderer/`、`@modules/` 别名）
- ❌ throw 裸字符串（使用 BidWiseError 或子类）
- ❌ `isLoading`/`fetching` 命名（统一用 `loading: boolean`）
- ❌ 在 `onChange` 回调中同步执行 Markdown 序列化（必须异步化以保障 <100ms 响应）
- ❌ 手动实现 Markdown 解析/生成（使用 `@platejs/markdown` 的 `MarkdownPlugin`）
- ❌ 将批注/评分数据混入 `proposal.md`（这些属于 sidecar JSON）
- ❌ 跨 Store 同步调用 Action（documentStore 不直接调用 projectStore 的 Action）

### 测试规范

- **单元测试：** Vitest（主进程测试用 Node.js 环境，渲染进程组件测试用 jsdom）
- **序列化测试：** 构造 Plate 编辑器实例（`createPlateEditor` 或 `usePlateEditor` in test），验证 Markdown 往返一致性
- **Store 测试：** Mock IPC 调用（`vi.mock`），验证状态流转
- **组件测试：** `@testing-library/react`，验证渲染和用户交互
- **性能测试（手动）：** 在 dev 模式下使用 Chrome DevTools Performance tab 验证按键响应 <100ms

### Project Structure Notes

编辑器模块完整目录结构（本 Story 创建后）：

```
src/renderer/src/modules/editor/
├── components/
│   ├── EditorView.tsx          ← 编辑器模块入口（加载/骨架/错误）
│   └── PlateEditor.tsx         ← Plate 编辑器核心组件
├── plugins/
│   └── editorPlugins.ts        ← 插件配置（后续 Story 扩展）
├── serializer/
│   ├── markdownSerializer.ts   ← Markdown 序列化/反序列化封装
│   └── index.ts
├── hooks/
│   └── useDocument.ts          ← 文档操作 hook（加载/保存/快捷键）
└── types.ts                    ← 编辑器模块内部类型
```

主进程新增：
```
src/main/
├── services/
│   └── document-service.ts     ← 文档读写服务
└── ipc/
    └── document-handlers.ts    ← document:* IPC 通道处理器
```

共享类型新增：
```
src/shared/models/
└── proposal.ts                 ← ProposalDocument / ProposalMetadata
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1 Plate 富文本编辑器集成与 Markdown 序列化]
- [Source: _bmad-output/planning-artifacts/prd.md#FR24 富文本编辑器编辑方案内容]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR6 编辑器输入响应 <100ms]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR13 方案文件格式 Markdown 纯文本存储]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR17 实时自动保存零数据丢失]
- [Source: _bmad-output/planning-artifacts/architecture.md#Plate 编辑器扩展]
- [Source: _bmad-output/planning-artifacts/architecture.md#Markdown 序列化 modules/editor/serializer/]
- [Source: _bmad-output/planning-artifacts/architecture.md#前端架构 组件架构]
- [Source: _bmad-output/planning-artifacts/architecture.md#sidecar JSON 元数据结构]
- [Source: _bmad-output/planning-artifacts/architecture.md#FR19-30 方案编辑目录映射]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#工作空间核心布局 UX-DR6]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#字体系统 UX-DR4]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#快捷键体系 Cmd/Ctrl+S 拦截]
- [Source: platejs.org/docs/installation/react — React Installation Guide]
- [Source: platejs.org/docs/list-classic — List Classic Plugin]
- [Source: platejs.org/docs/markdown — Markdown Plugin API]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### Change Log

- 2026-03-21 — Story 文件创建，包含 Plate 编辑器集成与 Markdown 序列化完整开发上下文
