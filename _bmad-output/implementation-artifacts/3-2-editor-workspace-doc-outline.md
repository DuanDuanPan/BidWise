# Story 3.2: 编辑器嵌入工作空间与文档大纲

Status: ready-for-dev

## Story

As a 售前工程师,
I want Plate 编辑器嵌入项目工作空间主内容区，文档大纲树支持章节导航,
So that 我在三栏布局中编辑方案，大纲导航 100 页方案也能快速定位。

## Acceptance Criteria

### AC1: 编辑器嵌入工作空间主内容区

- **Given** 进入项目工作空间
- **When** SOP 阶段切换到"方案撰写"（`proposal-writing`）
- **Then** Plate 编辑器（`EditorView`）嵌入到 Story 1.7 建立的三栏布局主内容区，替代 `StageGuidePlaceholder`
- **And** 编辑器加载项目对应的 `proposal.md`，显示已有内容或空白编辑器（带 placeholder）
- **And** 切换到其他 SOP 阶段时编辑器卸载，切回时重新加载内容
- [Source: epics.md Story 3.2 AC1, FR24]

### AC2: 文档大纲树章节导航

- **Given** 方案有多个章节（H1-H4 标题层级）
- **When** 查看左侧文档大纲面板
- **Then** 大纲树实时显示方案中的标题层级结构（H1→H2→H3→H4 嵌套）
- **And** 点击大纲中任意章节标题，编辑器平滑滚动到对应位置
- **And** 编辑器中添加/删除/修改标题后，大纲树在 500ms 内自动同步更新
- **And** 空文档时大纲区域显示空状态提示："开始撰写后，文档大纲将自动生成"
- [Source: epics.md Story 3.2 AC2, ux-design-specification.md §长文档编辑体验]

### AC3: 状态栏字数统计

- **Given** 状态栏渲染
- **When** 查看底部 32px 状态栏
- **Then** 字数统计显示当前方案的实时字符数（中文按字符计，非 word 计数）
- **And** 合规分和质量分保持占位符"--"（后续 Story 实现）
- **And** 编辑内容变化后字数在 1 秒内更新
- [Source: epics.md Story 3.2 AC3, ux-design-specification.md §工作空间布局]

## Tasks / Subtasks

- [ ] Task 1: 编辑器嵌入工作空间 (AC: 1)
  - [ ] 1.1 修改 `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`：在 `WorkspaceLayout.center` 的阶段分支中，当 `currentStageKey === 'proposal-writing'` 且 `projectId` 存在时，渲染 `<EditorView projectId={projectId} />`，替代 `StageGuidePlaceholder`
    ```typescript
    const isProposalWriting = currentStageKey === 'proposal-writing' && Boolean(projectId)

    center={
      currentStageKey === 'requirements-analysis' && projectId ? (
        <AnalysisView projectId={projectId} />
      ) : isProposalWriting && projectId ? (
        <EditorView projectId={projectId} />
      ) : (
        <StageGuidePlaceholder stageKey={currentStageKey} />
      )
    }
    ```
  - [ ] 1.2 在 `ProjectWorkspace.tsx` 顶部添加 `EditorView` 导入：`import { EditorView } from '@modules/editor/components/EditorView'`
  - [ ] 1.3 修改 `src/renderer/src/modules/editor/components/EditorView.tsx` 根滚动容器：保留现有 `data-testid="editor-view"`，并新增稳定运行时标记 `data-editor-scroll-container="true"`，供大纲点击滚动时定位真实滚动容器

- [ ] Task 2: 文档大纲数据提取 hook (AC: 2)
  - [ ] 2.1 创建 `src/renderer/src/modules/editor/hooks/useDocumentOutline.ts`：
    ```typescript
    import { useMemo } from 'react'

    export interface OutlineNode {
      key: string
      title: string
      level: 1 | 2 | 3 | 4
      lineIndex: number
      occurrenceIndex: number // 同名标题在文档中的第几个匹配，用于滚动定位
      children: OutlineNode[]
    }

    /**
     * 从 Markdown 内容中提取标题层级结构，构建大纲树。
     * 使用正则解析 Markdown 标题（# ~ ####），避免依赖 Plate 编辑器内部 AST。
     * 理由：documentStore.content 已持有序列化后的 Markdown 字符串，
     * 直接解析 Markdown 比监听 Slate AST 变更更简单、更解耦。
     */
    export function useDocumentOutline(markdownContent: string): OutlineNode[]
    ```
  - [ ] 2.2 正则提取标题逻辑：
    - 逐行扫描 Markdown 内容，匹配 `^(#{1,4})\s+(.+?)\s*$` 模式
    - 进入 fenced code block（``` 或 ~~~）后暂停标题识别，直到 fence 关闭
    - 生成 flat heading 列表：`{ level, title, lineIndex }`
    - 为同名标题生成 `occurrenceIndex`（按文档顺序从 0 开始）
    - 构建嵌套树：遍历 flat 列表，按 level 关系构建 parent-child 层级（H1 包含 H2，H2 包含 H3，依此类推）
    - `key` 生成：`heading-{lineIndex}`（行号保证唯一性）
  - [ ] 2.3 使用 `useMemo` 优化：仅在 `markdownContent` 变化时重新计算大纲
  - [ ] 2.4 导出 `OutlineNode` 类型和 `useDocumentOutline` hook
  - [ ] 2.5 保持当前模块导入风格：直接从 `@modules/editor/hooks/useDocumentOutline` 导入；**不要**为此 Story 新建 `hooks/index.ts` barrel

- [ ] Task 3: 文档大纲树 UI 组件 (AC: 2)
  - [ ] 3.1 创建 `src/renderer/src/modules/editor/components/DocumentOutlineTree.tsx`：
    ```typescript
    import { Tree } from 'antd'
    import type { OutlineNode } from '../hooks/useDocumentOutline'

    interface DocumentOutlineTreeProps {
      outline: OutlineNode[]
      onNodeClick: (node: OutlineNode) => void
    }

    export function DocumentOutlineTree({
      outline,
      onNodeClick,
    }: DocumentOutlineTreeProps): React.JSX.Element
    ```
  - [ ] 3.2 使用 Ant Design `Tree` 组件渲染大纲：
    - 将 `OutlineNode[]` 转换为 `Tree` 的 `treeData` 格式（`DataNode[]`）
    - `title` 显示标题文本（截断至 30 字符 + 省略号），同时保留完整文本于 `title`/tooltip
    - `key` 使用 `OutlineNode.key`
    - 使用受控 `expandedKeys` 保持所有节点展开；**不要**依赖 `defaultExpandAll`，因为初次渲染为空大纲、随后异步加载/同步更新时它不会重新生效
    - `onSelect` 回调触发 `onNodeClick`
    - `title` 使用自定义 `ReactNode` 包装，并在 `onMouseDown` 中 `preventDefault()`，避免点击大纲时抢走编辑器焦点
    - `title` 包装节点补充 `aria-label`（例如：`2级标题 系统架构设计`），让屏幕阅读器同时读出标题层级和完整标题文本
    - 组件内部维护 `selectedKeys`，点击后高亮当前节点，和 UX 原型保持一致
  - [ ] 3.3 样式：
    - Tree 使用 `showLine` 属性显示连接线
    - 文字使用 `text-caption`（12px），颜色 `var(--color-text-secondary)`
    - 选中项高亮使用 `var(--color-brand-bg)`
    - Tree 所在容器占满面板内容区高度，并允许纵向滚动；不要把树内容包在居中占位容器里
    - 不抢编辑区注意力（UX-DR：浅灰底色，轻量文字导航）
  - [ ] 3.4 空状态：当 `outline` 为空数组时，显示居中空状态（文件图标 + 文案"开始撰写后，文档大纲将自动生成"），文案样式与当前 OutlinePanel 占位符保持一致
  - [ ] 3.5 保持当前模块导入风格：直接从 `@modules/editor/components/DocumentOutlineTree` 导入；**不要**为此 Story 新建 `components/index.ts` barrel

- [ ] Task 4: 大纲点击滚动到编辑器对应位置 (AC: 2)
  - [ ] 4.1 滚动策略：基于 `heading text + same-title occurrence index` 定位对应 DOM 元素
    - 在 Heading 元素上注入 `data-heading-text` 属性
    - 点击大纲节点时，在编辑器滚动容器中枚举所有 `[data-heading-text]` 元素，按标题文本精确匹配后，再按 `occurrenceIndex` 选择第 N 个匹配项
    - 找到目标元素后调用 `element.scrollIntoView({ behavior: 'smooth', block: 'start' })`
  - [ ] 4.2 创建 `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx`：
    - 基于 `PlateElement` 包装 H1-H4 元素
    - 通过手动递归 `element.children` 提取纯文本，写入 `data-heading-text`
    - 保持原有 heading 语义标签（`h1` ~ `h4`）和 `children` 透传
  - [ ] 4.3 修改 `src/renderer/src/modules/editor/plugins/editorPlugins.ts`，为 H1-H4 Plugin 接入自定义 heading component：
    ```typescript
    import { H1Plugin, H2Plugin, H3Plugin, H4Plugin } from '@platejs/basic-nodes/react'
    import { OutlineH1Element, OutlineH2Element, OutlineH3Element, OutlineH4Element } from '@modules/editor/components/OutlineHeadingElement'

    H1Plugin.configure({
      node: {
        component: OutlineH1Element,
      },
    }),
    ```
    - 使用 Plate 官方支持的 `node.component` / `withComponent` 配置方式，**不要**使用已过时/不匹配当前版本的 `render.node`
    - H1-H4 四个 Plugin 均需配置
  - [ ] 4.4 创建 `src/renderer/src/modules/editor/lib/scrollToHeading.ts`：
    ```typescript
    import type { OutlineNode } from '@modules/editor/hooks/useDocumentOutline'

    /**
     * 在编辑器容器中查找目标标题元素并滚动到可见区域。
     * @param containerEl - 编辑器滚动容器 DOM 元素
     * @param target - 目标标题信息（标题文本 + 同名序号）
     */
    export function scrollToHeading(
      containerEl: HTMLElement | null,
      target: Pick<OutlineNode, 'title' | 'occurrenceIndex'>
    ): void
    ```
    - 查找策略：`containerEl.querySelectorAll('[data-heading-text]')` → 读取 attribute 后在 JS 中精确比较，**不要**把原始标题文本直接拼进 CSS selector
    - 如有同名标题，使用 `occurrenceIndex` 选中正确匹配项
    - 找到后调用 `scrollIntoView({ behavior: 'smooth', block: 'start' })`
    - 未找到时静默失败（不报错不弹窗）

- [ ] Task 5: 集成大纲到工作空间 OutlinePanel (AC: 1, 2)
  - [ ] 5.1 修改 `src/renderer/src/modules/project/components/OutlinePanel.tsx`：
    - 新增 props：
      ```typescript
      interface OutlinePanelProps {
        collapsed: boolean
        onToggle: () => void
        children?: React.ReactNode  // 大纲内容由父组件注入
      }
      ```
    - 将原来的 placeholder `<p>` 替换为 `{children}`，当 `children` 为 `undefined` 时显示默认占位符
    - 当 `children` 存在时，内容区改为顶部对齐的可滚动容器（例如 `flex-1 min-h-0 overflow-y-auto`）；仅默认占位状态保持居中布局
    - 继承 Story 1.7 已落地的 shell 几何尺寸：展开 `240px`、折叠条 `40px`、标题栏 `48px`；本 Story 仅填充内容，不重做外层壳
  - [ ] 5.2 在 `ProjectWorkspace.tsx` 中，当 `currentStageKey === 'proposal-writing'` 时，向 `OutlinePanel` 传入大纲内容：
    ```typescript
    // 在组件中读取 documentStore 的 content
    const documentContent = useDocumentStore((s) => s.content)
    const isProposalWriting = currentStageKey === 'proposal-writing' && Boolean(projectId)
    const outline = useDocumentOutline(isProposalWriting ? documentContent : '')

    // 传入 OutlinePanel
    <OutlinePanel collapsed={outlineCollapsed} onToggle={toggleOutline}>
      {isProposalWriting ? (
        <DocumentOutlineTree
          outline={outline}
          onNodeClick={(node) =>
            scrollToHeading(
              document.querySelector('[data-editor-scroll-container="true"]') as HTMLElement | null,
              node
            )
          }
        />
      ) : undefined}
    </OutlinePanel>
    ```
  - [ ] 5.3 使用 `EditorView` 根节点上的 `data-editor-scroll-container="true"` 作为滚动容器查找入口；**不要**使用 `workspace-main` 作为滚动目标，因为它不是实际承载编辑内容的滚动容器
  - [ ] 5.4 导入所需模块：
    - `import { useDocumentOutline } from '@modules/editor/hooks/useDocumentOutline'`
    - `import { DocumentOutlineTree } from '@modules/editor/components/DocumentOutlineTree'`
    - `import { scrollToHeading } from '@modules/editor/lib/scrollToHeading'`
  - [ ] 5.5 复用 `ProjectWorkspace.tsx` 里已有的 `useDocumentStore` 访问；**不要**为 outline 额外创建 store 或跨层事件总线

- [ ] Task 6: 状态栏字数统计 (AC: 3)
  - [ ] 6.1 创建 `src/renderer/src/modules/editor/hooks/useWordCount.ts`：
    ```typescript
    /**
     * 计算 Markdown 内容的字符数（中文按字符计数）。
     * 剥离 Markdown 语法标记（#、*、`、|、--- 等），仅统计纯文本内容。
     */
    export function useWordCount(markdownContent: string): number
    ```
    - 使用 `useMemo` 缓存结果
    - 剥离 Markdown 标记后，统计所有非空白字符数（`content.replace(/\s/g, '').length`）
    - fenced code block 内容、标题井号、列表 marker、表格分隔符等 Markdown 语法标记不计入字符数
    - 空内容返回 0
  - [ ] 6.2 修改 `src/renderer/src/modules/project/components/StatusBar.tsx`：
    - 新增 prop `wordCount?: number`
    - 当 `wordCount` 为 `number` 时，替换"字数 --"中的"--"为实际数字，格式使用 `Intl.NumberFormat('zh-CN')`（示例：`3,842`）
    - 布局与 UX 原型对齐：
      - 左侧：`currentStageName` + `leftExtra`（自动保存状态）
      - 右侧：`字数 {count}` → `合规分 --` → `质量分 --`
    - 将占位标签统一为 `合规分 --` / `质量分 --`
    ```typescript
    interface StatusBarProps {
      currentStageName?: string
      leftExtra?: React.ReactNode
      wordCount?: number  // 新增
    }
    ```
  - [ ] 6.3 在 `ProjectWorkspace.tsx` 中，当处于 `proposal-writing` 阶段时计算字数并传入 `StatusBar`：
    ```typescript
    const wordCount = useWordCount(documentContent)
    // ...
    <StatusBar
      currentStageName={currentStageName}
      wordCount={isProposalWriting ? wordCount : undefined}
      leftExtra={...}
    />
    ```
  - [ ] 6.4 保持非 proposal-writing 阶段的现有行为：字数显示 `--`，合规分/质量分仍为占位，不引入新评分逻辑

- [ ] Task 7: 单元测试 (AC: 全部)
  - [ ] 7.1 `tests/unit/renderer/modules/editor/hooks/useDocumentOutline.test.ts`：
    - 空内容返回空数组
    - 单级标题（仅 H1）返回 flat 列表
    - 多级标题（H1→H2→H3→H4）返回正确嵌套树
    - 非标题行被忽略（段落、列表、代码块）
    - 代码块内的 `#` 不被误识别为标题（行首 ``` 到行尾 ``` 之间的内容跳过）
    - `~~~` fenced code block 内的 `#` 同样不被识别为标题
    - 同名标题生成正确的 `occurrenceIndex`
    - 标题文本变化后大纲同步更新
  - [ ] 7.2 `tests/unit/renderer/modules/editor/hooks/useWordCount.test.ts`：
    - 空内容返回 0
    - 纯中文文本返回正确字符数
    - 混合中英文返回正确字符数
    - Markdown 语法标记不计入字数
    - fenced code block / 表格分隔行等 Markdown 结构标记不计入字数
  - [ ] 7.3 `tests/unit/renderer/modules/editor/components/DocumentOutlineTree.test.tsx`：
    - 空大纲显示空状态文本
    - 渲染多级大纲树节点
    - 点击节点触发 `onNodeClick` 回调，并切换 selected state
    - `outline` 从空数组更新为有内容后，新节点默认保持展开（验证不依赖 `defaultExpandAll`）
    - 标题包装节点暴露包含层级信息的 `aria-label`
  - [ ] 7.4 `tests/unit/renderer/modules/editor/lib/scrollToHeading.test.ts`：
    - 找到匹配标题时调用 scrollIntoView
    - 同名标题时按 `occurrenceIndex` 滚动到正确节点
    - 未找到匹配时静默不报错
  - [ ] 7.5 `tests/unit/renderer/project/ProjectWorkspace.test.tsx`（增量）：
    - proposal-writing 阶段渲染 EditorView 而非 StageGuidePlaceholder
    - 其他阶段仍渲染 StageGuidePlaceholder
    - proposal-writing 阶段向 OutlinePanel 注入大纲内容
  - [ ] 7.6 `tests/unit/renderer/project/OutlinePanel.test.tsx`（增量）：
    - 传入 `children` 时渲染自定义内容
    - 未传入 `children` 时仍回退到 Story 1.7 的占位内容
  - [ ] 7.7 `tests/unit/renderer/project/StatusBar.test.tsx`（增量）：
    - `wordCount={3842}` 时显示 `字数 3,842`
    - 标签显示 `合规分 --` / `质量分 --`
    - `currentStageName` 与 `leftExtra` 位于左侧 cluster
  - [ ] 7.8 `tests/unit/renderer/modules/editor/plugins/editorPlugins.test.ts`（增量）：
    - H1-H4 plugin 已接入 `OutlineHeadingElement` 自定义 component，避免后续重构丢失 `data-heading-text` 注入
  - [ ] 7.9 `tests/unit/renderer/modules/editor/components/EditorView.test.tsx`（增量）：
    - 编辑器根容器保留 `data-testid="editor-view"`，并暴露 `data-editor-scroll-container="true"`

- [ ] Task 8: 集成验证 (AC: 全部)
  - [ ] 8.1 验证 `pnpm lint && pnpm typecheck && pnpm build` 全部通过
  - [ ] 8.2 验证完整流程：进入项目 → 切换到"方案撰写"阶段 → 编辑器加载已有内容 → 左侧大纲树显示标题层级 → 编辑新标题后大纲自动更新 → 点击大纲节点编辑器滚动到对应位置
  - [ ] 8.3 验证阶段切换：从"方案撰写"切到"需求分析"再切回 → 编辑器重新加载内容，大纲重新生成
  - [ ] 8.4 验证面板折叠：折叠大纲面板后内容区宽度自动扩展，展开后恢复
  - [ ] 8.5 验证状态栏：编辑内容后字数统计实时更新，格式为精确数字（例如 `字数 3,842`），并保持 `合规分 --` / `质量分 --`
  - [ ] 8.6 验证空文档：新建项目 → 进入方案撰写 → 编辑器显示 placeholder → 大纲显示空状态提示 → 输入首个标题后大纲出现

## Dev Notes

### 架构模式与约束

**本 Story 在 Epic 3 中的位置——编辑器与工作空间的桥梁：**
```
ProjectWorkspace (Story 1.7)
  ├── SopProgressBar
  ├── WorkspaceLayout
  │   ├── OutlinePanel (Story 1.7 壳 → 本 Story 填充大纲内容)
  │   │   └── DocumentOutlineTree [NEW]
  │   ├── EditorView → PlateEditor (Story 3.1 → 本 Story 接入主内容区)
  │   └── AnnotationPanel (Story 1.7 壳)
  └── StatusBar (Story 1.7 → 本 Story 添加字数统计)
```

**数据流：**
```
documentStore.content (Markdown)
  ├── → useDocumentOutline() → OutlineNode[] → DocumentOutlineTree
  ├── → useWordCount() → number → StatusBar.wordCount
  └── → EditorView → PlateEditor (渲染)

用户点击大纲 → scrollToHeading({ title, occurrenceIndex }) → DOM querySelectorAll + attribute 精确比较 + scrollIntoView
```

### 已有代码资产（禁止重复创建）

| 已有文件 | 内容 | Story | 本 Story 操作 |
|----------|------|-------|--------------|
| `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` | 三栏布局编排，阶段分支逻辑 | 1-7 | **修改**：添加 proposal-writing 分支，注入 outline，传递 wordCount |
| `src/renderer/src/modules/project/components/OutlinePanel.tsx` | 大纲面板壳（含折叠/展开），内容区为 placeholder | 1-7 | **修改**：接受 children prop |
| `src/renderer/src/modules/project/components/StatusBar.tsx` | 32px 状态栏，合规/质量/字数三栏占位 | 1-7 | **修改**：添加 wordCount prop，校正 labels 和左右布局 |
| `src/renderer/src/modules/project/components/WorkspaceLayout.tsx` | 三栏 flex 布局 | 1-7 | 不修改 |
| `src/renderer/src/modules/editor/components/EditorView.tsx` | 编辑器顶层容器，管理加载/错误/PlateEditor | 3-1 | **小改**：根滚动容器添加 `data-editor-scroll-container` |
| `src/renderer/src/modules/editor/components/PlateEditor.tsx` | Plate 编辑器核心，含 onChange/序列化 | 3-1 | 不直接修改 |
| `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx` | 自定义 heading DOM 包装组件 | NEW | **创建**：注入 `data-heading-text` |
| `src/renderer/src/modules/editor/plugins/editorPlugins.ts` | Plate 插件列表 | 3-1 | **修改**：H1-H4 添加自定义渲染 |
| `src/renderer/src/modules/editor/components/AutoSaveIndicator.tsx` | 自动保存状态指示器 | 3-1 | 不修改 |
| `src/renderer/src/stores/documentStore.ts` | 文档状态（content/loading/autoSave） | 3-1 | 不修改 |
| `src/renderer/src/modules/project/hooks/useWorkspaceLayout.ts` | 面板折叠状态管理 | 1-7 | 不修改 |

### 关键实现决策

**大纲提取方案：解析 Markdown 字符串而非 Plate AST**
- `documentStore.content` 已持有序列化后的 Markdown，直接正则解析比监听 Slate 内部 AST 更简单
- 解耦：大纲 hook 不依赖 Plate 编辑器实例，可独立测试
- 性能：`useMemo` 仅在 content 变化时重计算，不随每次按键触发
- 时延：content 更新有 300ms 序列化防抖 + 大纲 useMemo 重计算，总延迟约 300-500ms，满足 AC2 要求的 500ms

**大纲滚动定位方案：data 属性 + DOM 顺序匹配**
- 在 Heading 元素上注入 `data-heading-text` 属性
- 避免维护独立的 heading ID 映射表
- 同名标题通过 `occurrenceIndex` 消歧，避免"总是跳到第一个同名标题"的错误
- 运行时使用 `querySelectorAll('[data-heading-text]')` + attribute 精确比较，避免将原始标题文本拼进 CSS selector 导致引号/特殊字符失配
- 滚动容器使用 `EditorView` 根节点的 `data-editor-scroll-container="true"`，不要把 `workspace-main` 当作滚动目标
- 使用 `scrollIntoView({ behavior: 'smooth' })` 提供平滑滚动体验

**字数统计方案：中文字符计数**
- 中文按字符数（非英文 word 计数），与中文写作习惯一致
- 剥离 Markdown 语法标记后统计纯文本非空白字符
- 状态栏显示格式与 UX 原型对齐：使用 `Intl.NumberFormat('zh-CN')` 输出精确数字（如 `3,842`），不使用 `1.2k` 简写

**状态栏布局方案：复用 1.7 壳层，但内容排布对齐 3.2 UX**
- 左侧显示当前阶段名和自动保存状态
- 右侧显示字数、合规分占位、质量分占位
- 保持 Story 1.7 已有 `StatusBar` 壳层、角色语义和 32px 高度，不引入额外状态源
- 自动保存文案复用 Story 3.1 `AutoSaveIndicator` 已存在的状态 copy（`已保存` / `保存中...` / `未保存更改` / `保存失败`）；UX PNG 中的“已自动保存”作为视觉示意，不要求在本 Story 重写组件文案
- UX 原型中的深色 shell chrome（SOP 栏 / 状态栏）用于视觉参考；本 Story 的强制实现项是信息布局、指标顺序和计数格式，不单独开启工作空间 chrome 主题重做

**壳层继承原则：本 Story 只填充内容，不重做 Story 1.7 shell**
- `OutlinePanel` 继续沿用已落地的 240px 展开宽度、40px 折叠条、48px 标题栏
- `WorkspaceLayout` 的 min-width / max-width / panel collapse 行为已由 Story 1.7 验证，本 Story 不再改写这些布局契约
- UX PNG / `.pen` 主要用于内容填充、状态排布和视觉层级对齐，而不是重新定义 1.7 已交付的外层尺寸
- `OutlinePanel` 在注入真实大纲内容后，内容区布局需从居中占位模式切换为顶部对齐的滚动容器；不要复用 placeholder 的居中样式直接承载 Tree

### 禁止事项

- **禁止**修改 `documentStore` 的接口或状态结构
- **禁止**在编辑器组件内部管理大纲状态（大纲数据从 `documentStore.content` 派生，在 `ProjectWorkspace` 层管理）
- **禁止**使用 `../../` 以上的相对导入路径（使用 `@modules/`、`@renderer/` 路径别名）
- **禁止**在 IPC handler 中放置业务逻辑
- **禁止**为大纲功能创建新的 Zustand store（大纲是 content 的派生数据，用 hook + useMemo 即可）
- **禁止**为此 Story 新建 `src/renderer/src/modules/editor/index.ts`、`components/index.ts`、`hooks/index.ts` 等 barrel 文件；当前代码库普遍使用直连导入
- **禁止**用 `document.querySelector('[data-testid="workspace-main"]')` 作为滚动容器
- **禁止**将原始标题文本直接拼进 CSS selector（例如 `querySelector('[data-heading-text=\"...\"]')`）
- **禁止**使用与 Plate v52 不匹配的 `render.node` 写法；应使用 `node.component` / `withComponent`
- **禁止**修改 Story 1.7 已完成的 panel 尺寸与折叠交互契约
- **禁止**为此 Story 额外引入 `@platejs/toc` 或其他 TOC 依赖；当前代码库已具备 `documentStore.content`，直接派生 outline 更轻量、边界更清晰

### Plate.js 自定义渲染要点

为 Heading 插件添加自定义渲染时，使用 Plate 当前版本支持的 component 配置方式：
```typescript
// editorPlugins.ts 中
import { H1Plugin } from '@platejs/basic-nodes/react'
import { OutlineH1Element } from '@modules/editor/components/OutlineHeadingElement'

H1Plugin.configure({
  node: {
    component: OutlineH1Element,
  },
}),
```

注意：
- 自定义 component 基于 `PlateElement` 包装，保留原语义标签和 attributes
- 纯文本提取优先使用本地递归 helper，从 `element.children` 中收集 `text` 字段；不要依赖未经本仓验证的 helper 名称
- 自定义渲染必须透传 `children`，否则编辑器内容不显示
- 需同时配置 H1-H4 四个插件

### Ant Design Tree 使用要点

```typescript
import { Tree } from 'antd'
import type { DataNode } from 'antd/es/tree'

// OutlineNode → DataNode 转换
function toTreeData(nodes: OutlineNode[]): DataNode[] {
  return nodes.map((node) => ({
    key: node.key,
    title: node.title.length > 30 ? node.title.slice(0, 30) + '...' : node.title,
    children: node.children.length > 0 ? toTreeData(node.children) : undefined,
  }))
}

// 使用
<Tree
  treeData={treeData}
  showLine
  expandedKeys={allExpandedKeys}
  onSelect={(_, { node }) => onNodeClick(findOutlineNode(node.key))}
  className="text-caption"
/>
```

UX 规范参考（UX-DR）：
- Tree 组件定制程度"低"（直接使用 Ant Design Tree） [Source: ux-design-specification.md §组件策略]
- 浅灰底色，轻量文字导航，不抢编辑区注意力 [Source: ux-design-specification.md §设计方向决策]
- `DataNode` 从 `antd/es/tree` 导入在本仓可接受，现有 analysis 模块已有相同做法

### Project Structure Notes

- 新文件遵循 editor 模块 kebab-case 目录 + PascalCase 组件命名
- 所有新增 hook 放在 `src/renderer/src/modules/editor/hooks/`
- 新增 UI 组件放在 `src/renderer/src/modules/editor/components/`
- 工具函数放在 `src/renderer/src/modules/editor/lib/`
- project 模块测试现有路径为 `tests/unit/renderer/project/`
- editor 模块测试现有路径为 `tests/unit/renderer/modules/editor/`
- 新增代码按现有目录直连导入，不为局部 convenience 创建 barrel

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2 编辑器嵌入工作空间与文档大纲]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#工作空间布局] — 三栏布局规格（大纲 240px、主内容弹性、侧边栏 320px）
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#设计方向决策] — 文档大纲树浅灰底色、轻量文字导航
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#组件策略] — Tree 组件定制程度低
- [Source: _bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-ux/ux-spec.md] — 本 Story 的 UX 状态与视觉对齐说明
- [Source: _bmad-output/planning-artifacts/architecture.md#项目目录结构] — 模块结构、Alpha 阶段编辑器模块
- [Source: _bmad-output/planning-artifacts/architecture.md#D5 Markdown 扩展规范] — Markdown 纯净 + sidecar JSON
- [Source: _bmad-output/planning-artifacts/prd.md#FR24] — 富文本编辑器编辑方案内容
- [Source: _bmad-output/planning-artifacts/prd.md#UX 设计挑战 §7] — 长文档编辑体验，章节导航始终可见
- [Source: _bmad-output/implementation-artifacts/story-3-1-plate-editor-markdown-serialization.md] — 前置 Story，Plate 编辑器实现细节

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
