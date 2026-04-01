# Story 3.4: AI 章节级方案生成

Status: ready-for-dev

## Story

As a 售前工程师,
I want AI 按章节独立生成方案内容，支持补充上下文后重新生成,
So that 我可以快速获得高质量初稿，对不满意的章节精准重写。

## Acceptance Criteria

1. **Given** 方案骨架已确认（Story 3.3 已生成骨架且进入 `proposal-writing` 阶段），且某章节当前仅包含标题 + 空白段落或 Story 3.3 写入的引导性 blockquote 占位
   **When** 用户触发该章节的“AI 生成”
   **Then** AI 按章节独立生成内容，编辑器内以骨架屏占位 + 阶段进度文字展示生成进度（排队中→解析→匹配资产→生成内容→来源标注），200ms 淡入动效（FR20, UX-DR15）

2. **Given** 某章节已有正文内容
   **When** 用户点击该章节标题区域的“重新生成”
   **Then** 弹出浮层输入框可补充上下文（如额外需求、侧重点、语气），系统基于补充信息重新生成该章节，其他章节内容不受影响（FR20, NFR20）

3. **Given** AI 生成请求
   **When** Provider 调用失败
   **Then** `ai-proxy/provider-adapter` 在单次任务内自动重试最多 3 次（指数退避），而章节生成任务自身不再叠加 task-queue 二次重跑；3 次全部失败后在章节原位置展示内联错误条，提供“重试 / 手动编写 / 跳过”三选一操作按钮（NFR15, NFR23）

4. **Given** AI 生成单个章节
   **When** 生成执行
   **Then** `AgentExecuteOptions.timeoutMs = 120000` 必须同时约束 task-queue 执行窗口与内部 `aiProxy.call()` 超时，确保单章节端到端超时阈值为 2 分钟，而不是仅限制 provider 请求阶段（NFR3）

5. **Given** AI 生成执行
   **When** 所有调用通过 agent-orchestrator
   **Then** 禁止绕过编排层直接调用 API，prompt 文件使用 `.prompt.ts` 规范，AI 调用仍遵循统一 `{ success, data, error }` IPC 包装（架构强制规则）

6. **Given** AI 生成完成
   **When** 内容渲染到编辑器
   **Then** 生成的 Markdown 通过 Plate 编辑器的章节替换 helper 插入到对应 heading locator（`title + level + occurrenceIndex`）所指向的章节范围，替换该章节原有的占位/正文内容，并立即刷新 canonical Markdown 到 `documentStore.updateContent()` 以触发自动保存

7. **Given** 用户正在编辑某章节
   **When** 另一个章节正在 AI 生成，或同一章节在任务执行期间被用户手动改动
   **Then** 用户编辑不受阻塞；AI 生成完成后仅尝试更新目标章节区域，若目标章节自任务发起后发生变化则不得静默覆盖，而是进入显式覆盖确认分支并默认保留当前人工内容（NFR20）

8. **Given** 多个章节需要生成
   **When** 用户连续触发多个章节的生成
   **Then** 各章节生成任务通过 task-queue 并行调度（受 `maxConcurrency=3` 限制），超出并发限制的章节以 `queued` 态显示“排队中...”，各章节独立展示进度与终态

9. **Given** 某项目已有进行中的章节生成任务
   **When** 用户离开并重新进入同一项目的 `proposal-writing` 阶段
   **Then** UI 通过持久化的 task records 恢复当前项目的 pending/running generate 任务映射，继续展示对应章节的进度，而不是丢失中的任务状态

## Tasks / Subtasks

### 主进程（Main Process）

- [ ] Task 1: 增强 `generate-chapter` prompt（AC: #1, #2, #4, #5）
  - [ ] 1.1 重写 `src/main/prompts/generate-chapter.prompt.ts`，替换当前 Alpha 占位实现
  - [ ] 1.2 prompt 注入上下文：章节标题、章节层级、当前章节 guidance/占位提示、评分权重、关联需求条目、已确认必响应项、相邻章节摘要、可选策略种子摘要（若 `seed.json` 不存在则省略，不报错）
  - [ ] 1.3 system role 定义为“专业技术方案撰写助手”，明确输出格式为 Markdown（H3/H4 子节、列表、表格），字数指引按权重自适应
  - [ ] 1.4 支持 `additionalContext` 参数用于重新生成场景
  - [ ] 1.5 明确输出不包含当前章节主标题本身，仅返回该章节正文
  - [ ] 1.6 单测验证 prompt 模板输出完整性、参数注入正确性、可选字段缺失时的回退行为

- [ ] Task 2: 创建 chapter-generation 服务（AC: #1, #2, #4, #5, #6, #7, #8, #9）
  - [ ] 2.1 新建 `src/main/services/chapter-generation-service.ts`
  - [ ] 2.2 定义 `buildChapterContext(projectId, target)`：
    - `target` 使用 heading locator：`{ title, level, occurrenceIndex }`
    - 从 `documentService.load(projectId)` 读取当前 `proposal.md`
    - 从 `documentService.getMetadata(projectId)` 读取 `templateId/sectionWeights`
    - 从 `scoringExtractor.getRequirements(projectId)` / `getScoringModel(projectId)` 读取需求与评分模型
    - 从 `mandatoryItemDetector.getItems(projectId)` 读取已确认或待处理的必响应项
    - 可选读取 `{rootPath}/seed.json` 作为策略上下文；缺失时静默降级
  - [ ] 2.3 用当前 `proposal.md` 解析 heading tree，依据 `title + level + occurrenceIndex` 定位目标章节，提取：
    - 当前章节 guidance blockquote / 空占位
    - 当前章节现有正文摘要
    - 前后相邻章节标题与摘要
    - 任务发起时的目标章节 `baselineDigest`
  - [ ] 2.4 `generateChapter(input)` 仅允许对“空白或 guidance-only”章节触发；`regenerateChapter(input)` 允许任意非空章节触发
  - [ ] 2.5 调用 `agentOrchestrator.execute({ agentType: 'generate', context, options: { timeoutMs: 120000, maxRetries: 0 } })`，返回 `taskId`
  - [ ] 2.6 单测覆盖：上下文构建、target 定位、空章节判定、策略种子缺失回退、错误处理

- [ ] Task 3: 扩展 agent-orchestrator / task-queue / generate-agent 契约（AC: #3, #4, #5）
  - [ ] 3.1 扩展 `src/shared/ai-types.ts` 中 `AgentExecuteOptions`，新增 `maxRetries?: number`
  - [ ] 3.2 更新 `src/main/services/agent-orchestrator/orchestrator.ts`，将 `options.maxRetries` 透传到 `taskQueue.enqueue()`，并把 `options.timeoutMs` 透传到任务执行边界
  - [ ] 3.3 扩展 `src/main/services/task-queue/queue.ts`，让 `execute(taskId, executor, timeoutMs?)` 或等价实现支持 per-task timeout，避免始终退回 15 分钟默认值
  - [ ] 3.4 扩展 `src/main/services/agent-orchestrator/agents/generate-agent.ts`，接收富上下文并传递给增强后的 prompt
  - [ ] 3.5 在 handler 内通过 `updateProgress` 报告阶段进度：0%→解析上下文、25%→匹配资产（Alpha 占位）、50%→生成内容、90%→来源标注（Alpha 占位）、100%→完成
  - [ ] 3.6 保持 `maxTokens: 8192`，确保单章节可生成 3000-5000 字内容；不得在本 Story 中叠加 task-queue 级自动重跑；`timeoutMs` 需同时传入 task-queue 与 `aiProxy.call()`
  - [ ] 3.7 单测覆盖：`maxRetries`/`timeoutMs` 透传、进度更新顺序、消息构造

- [ ] Task 4: IPC 通道与 handler（AC: #1, #2, #5, #9）
  - [ ] 4.1 在 `src/shared/ipc-types.ts` 中新增 IPC 通道：`chapter:generate`、`chapter:regenerate`
  - [ ] 4.2 新增类型映射：`ChapterGenerateInput`、`ChapterGenerateOutput`、`ChapterRegenerateInput`
  - [ ] 4.3 新建 `src/main/ipc/chapter-handlers.ts`，使用 `createIpcHandler` 薄分发到 `chapterGenerationService`
  - [ ] 4.4 在 `src/main/ipc/index.ts` 中注册新 handler，并维持 exhaustive 注册检查通过
  - [ ] 4.5 在 `src/preload/index.ts` 中暴露 `chapterGenerate()` / `chapterRegenerate()` 方法

### 共享类型（Shared Types）

- [ ] Task 5: 定义章节生成类型（AC: #1, #2, #6, #8, #9）
  - [ ] 5.1 新建 `src/shared/chapter-types.ts`
  - [ ] 5.2 定义 `ChapterHeadingLocator { title: string; level: 1 | 2 | 3 | 4; occurrenceIndex: number }`
  - [ ] 5.3 定义 `ChapterGenerateInput { projectId: string; target: ChapterHeadingLocator }`
  - [ ] 5.4 定义 `ChapterGenerateOutput { taskId: string }`（立即返回，异步生成）
  - [ ] 5.5 定义 `ChapterRegenerateInput extends ChapterGenerateInput { additionalContext: string }`
  - [ ] 5.6 定义 `ChapterGenerationPhase = 'queued' | 'analyzing' | 'matching-assets' | 'generating' | 'annotating-sources' | 'conflicted' | 'completed' | 'failed'`
  - [ ] 5.7 定义 `ChapterGenerationStatus { target: ChapterHeadingLocator; phase; progress; taskId; message?; error?; generatedContent?; baselineDigest? }`

### 渲染进程（Renderer Process）

- [ ] Task 6: `useChapterGeneration` hook（AC: #1, #2, #3, #6, #7, #8, #9）
  - [ ] 6.1 新建 `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts`
  - [ ] 6.2 在 proposal-writing 工作区作用域管理 `Map<chapterKey, ChapterGenerationStatus>`，其中 `chapterKey` 由 `title + level + occurrenceIndex` 规范化得到
  - [ ] 6.3 提供 `startGeneration(target)` / `startRegeneration(target, additionalContext)` / `retry(target)` / `dismissError(target)`
  - [ ] 6.4 监听 `window.api.onTaskProgress()` 实时更新进度；对长时间无进度更新的任务使用 `window.api.agentStatus(taskId)` 做 stale polling，而不是每秒无差别轮询全部任务
  - [ ] 6.5 当 `agentStatus.status === 'pending'` 时映射为 `queued`
  - [ ] 6.6 组件初次挂载时调用 `window.api.taskList({ category: 'ai-agent', agentType: 'generate' })` 恢复任务，再按 `task.status in {pending,running}` 且 `JSON.parse(task.input).projectId === currentProjectId` 过滤出当前项目的 active generate 任务，并继续监听进度
  - [ ] 6.7 生成完成后先比较目标章节当前摘要/`baselineDigest`；若冲突则写入 `generatedContent` 并切换为 `conflicted`，等待用户确认是否覆盖
  - [ ] 6.8 组件卸载时清理定时器与事件监听，但不得清空主进程中仍在运行的任务

- [ ] Task 7: 章节生成 UI 组件（AC: #1, #2, #3, #7, #8）
  - [ ] 7.1 新建 `src/renderer/src/modules/editor/components/ChapterGenerateButton.tsx`：
    - 标题右侧 “AI 生成” 按钮
    - 仅在章节正文为空白或仅含 guidance blockquote/空段落时显示
  - [ ] 7.2 新建 `src/renderer/src/modules/editor/components/ChapterGenerationProgress.tsx`：
    - 支持 `queued / analyzing / matching-assets / generating / annotating-sources`
    - 渲染骨架屏 + 阶段文字 + 细线进度条
  - [ ] 7.3 新建 `src/renderer/src/modules/editor/components/RegenerateDialog.tsx`：
    - 用于任何已有正文的章节，不要求事先识别“AI 生成内容”
    - 包含只读章节标题、TextArea、覆盖提示
  - [ ] 7.4 新建 `src/renderer/src/modules/editor/components/InlineErrorBar.tsx`：
    - 三个操作按钮（重试 / 手动编写 / 跳过）
    - 持续显示直至用户操作

- [ ] Task 8: Proposal-writing 工作区与编辑器集成（AC: #1, #6, #7, #8, #9）
  - [ ] 8.1 在 `ProjectWorkspace.tsx` 的 `proposal-writing` 分支提升 `useChapterGeneration` 到工作区作用域，避免状态仅存在于 `EditorView`
  - [ ] 8.2 扩展 `PlateEditor.tsx` 暴露 imperative API（例如 `replaceSectionContent(target, markdown)`、`focusSection(target)`），由其内部负责：
    - `editor.api.markdown.deserialize(content)` 得到 `Descendant[]`
    - 根据 heading locator 定位目标 heading 范围
    - 替换该 heading 与下一同级/更高级 heading 之间的节点
    - 立即 flush canonical Markdown 到 `documentStore.updateContent()`
    - 避免与现有 300ms 序列化防抖产生重复/反向覆盖
  - [ ] 8.3 在 `EditorView.tsx` 中把 `PlateEditor` imperative API 与 `useChapterGeneration` 连接起来，并在冲突场景下使用 `Modal.confirm` 做覆盖确认
  - [ ] 8.4 扩展 `OutlineHeadingElement.tsx`，在标题区域渲染 `ChapterGenerateButton` / `RegenerateButton` / `ChapterGenerationProgress` / `InlineErrorBar`，其中 target locator 必须基于当前文档顺序生成，不能只靠标题文本
  - [ ] 8.5 扩展 `DocumentOutlineTree.tsx` 支持可选章节状态装饰：`queued`=时钟、生成中=蓝色 spinner、完成=绿色 check、失败=红色警示
  - [ ] 8.6 扩展 `AnnotationPanel.tsx` 仅显示轻量级生成摘要（如“3 个章节正在生成中...”）或现有占位文案；本 Story 不实现完整批注卡片系统

### 测试

- [ ] Task 9: 单元测试、集成测试与 E2E（AC: #1-#9）
  - [ ] 9.1 `tests/unit/main/prompts/generate-chapter.prompt.test.ts` — prompt 模板输出、可选 seed/must-have context 回退
  - [ ] 9.2 `tests/unit/main/services/chapter-generation-service.test.ts` — 上下文构建、heading locator 定位、空章节判定、策略种子缺失回退
  - [ ] 9.3 `tests/unit/main/services/agent-orchestrator/orchestrator.test.ts` + `tests/unit/main/services/task-queue/queue.test.ts` — `maxRetries` / `timeoutMs` 透传与 per-task timeout 生效
  - [ ] 9.4 `tests/unit/main/ipc/chapter-handlers.test.ts` + `tests/unit/preload/security.test.ts` — 新 IPC 通道注册与暴露
  - [ ] 9.5 `tests/unit/renderer/modules/editor/hooks/useChapterGeneration.test.ts` — 仅恢复当前项目 active tasks、queued 映射、冲突检测、错误处理
  - [ ] 9.6 `tests/unit/renderer/modules/editor/components/PlateEditor.test.tsx` / `EditorView.test.tsx` — imperative section replacement 与 flush 行为
  - [ ] 9.7 `tests/unit/renderer/modules/editor/components/ChapterGenerateButton.test.tsx` — guidance-only 章节显隐、点击事件
  - [ ] 9.8 `tests/unit/renderer/modules/editor/components/ChapterGenerationProgress.test.tsx` + `tests/unit/renderer/modules/editor/components/DocumentOutlineTree.test.tsx` — 阶段文字、queued 态、outline 状态图标
  - [ ] 9.9 `tests/unit/renderer/modules/editor/components/RegenerateDialog.test.tsx` + `InlineErrorBar.test.tsx` — 输入、确认、三按钮操作
  - [ ] 9.10 `tests/unit/renderer/project/ProjectWorkspace.test.tsx` — proposal-writing 左/中/右三栏共享章节生成状态
  - [ ] 9.11 `tests/e2e/stories/story-3-4-ai-chapter-generation.spec.ts` — 覆盖 guidance-only 章节生成、多章节排队、错误恢复、冲突确认、重新进入工作区后的任务恢复
  - [ ] 9.12 当前完整 `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` 全部通过

## Dev Notes

### 本 Story 在 Epic 3 中的位置

```
Story 3.1 (done): Plate 编辑器 + Markdown 序列化
Story 3.2 (done): 编辑器嵌入工作空间 + 文档大纲
Story 3.3 (done): 模板驱动方案骨架生成
→ Story 3.4 (本 Story): AI 章节级方案生成 ← 核心 AI 生成能力
Story 3.5 (next): AI 内容来源标注与基线交叉验证 ← 依赖本 Story 的生成内容
```

本 Story 是 BidWise 从“结构搭建”到“AI 内容生成”的关键跃迁点。用户在 Story 3.3 确认骨架后进入 `proposal-writing` 阶段，此时编辑器中每个章节通常已具备标题，并且正文区域可能只包含 Story 3.3 写入的 guidance blockquote 占位；本 Story 负责把这些“待填充章节”逐章替换为 AI 正文。

### 数据流

```
用户点击章节 "AI 生成"
  ↓
useChapterGeneration.startGeneration(targetHeadingLocator)
  ↓
IPC: chapter:generate → chapter-handlers.ts（薄分发）
  ↓
chapterGenerationService.generateChapter({ projectId, target })
  ├── 1. documentService.load() 读取当前 proposal.md
  ├── 2. documentService.getMetadata() 读取 templateId / sectionWeights
  ├── 3. scoringExtractor.getRequirements() / getScoringModel()
  ├── 4. mandatoryItemDetector.getItems()
  ├── 5. 可选读取 seed.json（缺失则跳过）
  ├── 6. 解析当前 markdown，按 title + level + occurrenceIndex 定位目标章节并生成 baselineDigest
  └── 7. agentOrchestrator.execute({
         agentType: 'generate',
         context,
         options: { timeoutMs: 120000, maxRetries: 0 }
       })
       ├── → taskQueue.enqueue() → 立即返回 taskId
       └── → 后台执行（120000ms timeout 同时约束 queue executor 与 aiProxy.call）：
            ├── generate-agent handler 构建 AiRequestParams
            ├── updateProgress(0/25/50/90/100)
            └── aiProxy.call(params) → provider-adapter 内部自动重试最多 3 次
  ↓
renderer:
  ├── onTaskProgress() 实时更新进度
  ├── agentStatus(taskId) 查询终态 / stale 轮询
  ├── taskList() 在重新进入工作区时恢复 active generate tasks
  └── 完成后：
       ├── 若目标章节摘要与 baselineDigest 一致 → PlateEditor.replaceSectionContent(target, content)
       └── 若目标章节已变更 → phase='conflicted'，等待用户覆盖确认
```

### 已有基础设施（禁止重复实现）

以下已在之前的 Story 中实现，直接复用：

| 组件 | 位置 | 用途 |
|------|------|------|
| AgentOrchestrator | `src/main/services/agent-orchestrator/orchestrator.ts` | agent 注册、执行、状态查询 |
| generate-agent handler | `src/main/services/agent-orchestrator/agents/generate-agent.ts` | 当前为 Alpha 占位，本 Story 增强 |
| generateChapterPrompt | `src/main/prompts/generate-chapter.prompt.ts` | 当前为 Alpha 占位，本 Story 重写 |
| AiProxyService | `src/main/services/ai-proxy/index.ts` | 脱敏→调用→恢复 |
| provider-adapter retry | `src/main/services/ai-proxy/provider-adapter.ts` | 3 次自动重试（timeout/429/5xx） |
| TaskQueueService | `src/main/services/task-queue/queue.ts` | 任务排队、并发控制（max=3）、进度推送、任务恢复；需补齐 per-task timeout 透传 |
| ProgressEmitter | `src/main/services/task-queue/progress-emitter.ts` | IPC 进度事件推送 |
| documentService | `src/main/services/document-service.ts` | `proposal.md` / `proposal.meta.json` 读写 |
| scoringExtractor | `src/main/services/document-parser/scoring-extractor.ts` | requirements / scoringModel 读取 |
| mandatoryItemDetector | `src/main/services/document-parser/mandatory-item-detector.ts` | mandatory items 读取 |
| documentStore | `src/renderer/src/stores/documentStore.ts` | 文档内容管理、自动保存（1s 防抖） |
| ProjectWorkspace | `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` | proposal-writing 三栏工作区 |
| EditorView | `src/renderer/src/modules/editor/components/EditorView.tsx` | Plate 编辑器容器 |
| PlateEditor | `src/renderer/src/modules/editor/components/PlateEditor.tsx` | Plate 编辑器核心 |
| DocumentOutlineTree | `src/renderer/src/modules/editor/components/DocumentOutlineTree.tsx` | 左侧文档大纲 |
| useDocumentOutline | `src/renderer/src/modules/editor/hooks/useDocumentOutline.ts` | heading tree + occurrenceIndex 提取 |
| OutlineHeadingElement | `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx` | Heading 自定义渲染（含 `data-heading-text`） |
| AnnotationPanel | `src/renderer/src/modules/project/components/AnnotationPanel.tsx` | 右侧批注 shell（当前为占位） |
| serializer | `src/renderer/src/modules/editor/serializer/index.ts` | Markdown ↔ Plate AST 序列化 |
| createIpcHandler | `src/main/ipc/create-handler.ts` | IPC handler 工厂函数 |
| IPC_CHANNELS / IpcChannelMap | `src/shared/ipc-types.ts` | IPC 常量与通道类型映射 |
| BidWiseError | `src/main/utils/errors.ts` | 类型化错误基类 |
| ProposalMetadata | `src/shared/models/proposal.ts` | sidecar 元数据（含 `templateId/sectionWeights`） |

### 关键实现决策

**1. 章节定位键使用 heading locator，不使用 `sectionId`**

- Story 3.3 持久化到 `proposal.md` 的是纯 Markdown heading，不包含稳定 `sectionId`
- `proposal.meta.json.sectionWeights` 也只覆盖有权重的部分章节，不能反查完整骨架
- 因此本 Story 的跨进程定位主键必须使用 `title + level + occurrenceIndex`
- `occurrenceIndex` 复用 `useDocumentOutline` / `scrollToHeading` 已建立的模式，避免同名章节误命中

**2. “空章节”判定必须兼容 Story 3.3 的 guidance blockquote**

- Story 3.3 生成骨架后，每个章节正文通常不是彻底空白，而是 `> guidanceText`
- 只有“空白段落 + guidance blockquote”时，才应显示 `AI 生成`
- 不能用“无正文子节点”作为唯一条件，否则按钮永远不会出现

**3. 章节替换必须由 `PlateEditor` 内部完成**

- `EditorView` 当前拿不到 `editor` 实例，也不应直接拼装 Slate Transforms
- 需要由 `PlateEditor` 提供 imperative API：
  - `replaceSectionContent(target, markdown)`
  - `focusSection(target)`
- 该 API 内部完成 AST 区间替换、序列化 flush、以及防抖抑制，避免 store 与 editor 双向回写打架

**4. 同章冲突采用 `baselineDigest` 检测**

- 发起任务时记录目标章节摘要/哈希
- 任务完成后再次提取当前目标章节摘要
- 若发生变化，则进入 `conflicted`，不允许静默覆盖
- 覆盖确认默认保留用户当前内容

**5. 状态共享范围提升到 proposal-writing 工作区，而不是新建 Zustand store**

- 左侧 `DocumentOutlineTree`、中间 `EditorView`、右侧 `AnnotationPanel` 摘要都需要消费章节生成状态
- 章节生成状态不应新建全局 store；使用 `ProjectWorkspace` 局部 hook / context 即可
- 这既满足跨组件共享，也保持状态作用域局部化

**6. 重试边界固定为“provider 自动重试 3 次 + 用户手动重试”**

- `provider-adapter` 已内建 3 次自动重试（指数退避）
- `taskQueue.enqueue()` 当前默认 `maxRetries=3`，如不显式覆盖会造成重复重试层叠
- 因此本 Story 必须扩展 `AgentExecuteOptions.maxRetries`，并在章节生成调用时显式传 `0`

**7. `timeoutMs` 必须同时约束 queue executor 与 provider 调用**

- 当前 `AgentExecuteOptions.timeoutMs` 只会沿 `aiProxy.call()` 生效，不能天然限制整个 task executor 生命周期
- 若不补齐 per-task timeout 透传，章节上下文构建或其它前后置逻辑可能突破 2 分钟门槛
- 因此本 Story 需要把 `timeoutMs=120000` 同时传入 task-queue 执行层，并继续传给 `aiProxy.call()`

**8. prompt 上下文必须来自“当前项目真实状态”，而不是假定静态文件**

- `requirements/scoringModel` 通过 `scoringExtractor` 读 DB/快照
- `mandatoryItems` 通过 `mandatoryItemDetector` 读取
- `seed.json` 是可选项，因为 Story 2.7 当前尚未落地到代码库
- `guidanceText` 优先取当前章节中的 blockquote 占位文本；`templateId` 仅作回退辅助，不可假设骨架未被用户修改

**9. 右侧智能批注卡片与“AI 生成·待来源标注”标签是后续故事的未来态**

- Screen 3 PNG 中出现的批注卡片 / 来源标签用于组合态预览
- Story 3.4 本身不实现完整批注卡片系统，也不实现真实来源标签持久化
- 本 Story 右侧只允许显示轻量级生成摘要；真正的来源标注与批注体系分别由 Story 3.5 / Epic 4 负责

### 前一 Story（3-3）关键学习

1. **`createIpcHandler` 复用**：直接使用 `src/main/ipc/create-handler.ts` 中的工厂函数注册 handler
2. **`proposal.meta.json` 扩展方式**：新增字段保持向后兼容，读取时缺少字段使用默认值
3. **SOP 阶段定义**：`proposal-writing` 阶段已存在于 `SOP_STAGES` 常量，本 Story 的 UI 在该阶段激活
4. **Ant Design 组件使用**：直接使用 Ant Design 组件（Modal、Button、Input.TextArea），保持与现有 UI 风格一致
5. **评分模型与需求读取**：主进程 service 应直接复用 `scoringExtractor` / `mandatoryItemDetector`，不要经由 renderer IPC 再回调主进程
6. **Story 3.3 持久化边界**：现有 sidecar 只保存 `templateId/sectionWeights`，没有完整 skeleton tree，3.4 必须基于当前 Markdown 解析章节定位
7. **编辑器防抖保存**：300ms 序列化防抖 + 1000ms 保存防抖已在 Story 3.1 建立；章节替换要兼容这条链路，而不是绕开它

### 禁止事项

- **禁止**绕过 agent-orchestrator 直接调用 aiProxy（架构强制规则）
- **禁止**绕过 task-queue（AI 调用必须经过任务队列）
- **禁止**在 IPC handler 中放置业务逻辑（必须委托给 `chapterGenerationService`）
- **禁止**使用 `../../` 以上的相对导入路径（使用 `@main/`、`@renderer/`、`@shared/`、`@modules/` 别名）
- **禁止**创建新的全局 Zustand store
- **禁止**修改 `documentStore` 公共接口定义
- **禁止**为章节生成再叠加一层 task-queue 自动重跑，造成双重重试
- **禁止**throw 裸字符串（使用 `BidWiseError`）
- **禁止**在 prompt 中硬编码实现逻辑（必须放在 `src/main/prompts/*.prompt.ts`）
- **禁止**在本 Story 中实现完整 AnnotationPanel 卡片系统、真实来源标注或资产匹配逻辑
- **禁止**依赖不存在的 `seed-agent` / `analysis:get-seeds` IPC；若 `seed.json` 缺失必须优雅降级

### Alpha 阶段边界说明

本 Story 为 Alpha 阶段实现，以下功能为**占位/预留**：

- “匹配资产”阶段（progress 25-49%）：快速跳过，仅显示进度文字；真正的资产匹配在 Epic 5 实现
- “来源标注”阶段（progress 90-99%）：快速跳过；真正的来源标注在 Story 3.5 实现
- `AnnotationPanel` 的 AI 建议卡 / 评分预警卡：未来态预览，不作为 3.4 交付门槛
- “AI 生成 · 待来源标注”标签：未来态视觉参考，不要求本 Story 持久化实现
- 文风控制（军工/政企/通用）：Story 3.6 负责
- 经验图谱注入：Beta 阶段实现；Alpha 仅保留 `ai-trace-logger` 产生的原始调用日志

### Project Structure Notes

新增 / 修改文件清单：

```
src/
├── shared/
│   ├── ai-types.ts                         [MODIFY] AgentExecuteOptions 增加 maxRetries
│   └── chapter-types.ts                    [NEW] 章节生成类型定义（heading locator）
├── main/
│   ├── prompts/
│   │   └── generate-chapter.prompt.ts      [MODIFY] 重写，注入丰富上下文
│   ├── services/
│   │   ├── chapter-generation-service.ts   [NEW] 章节生成业务服务
│   │   ├── task-queue/
│   │   │   └── queue.ts                    [MODIFY] 支持 per-task timeout 透传
│   │   └── agent-orchestrator/
│   │       ├── orchestrator.ts             [MODIFY] 透传 maxRetries
│   │       └── agents/
│   │           └── generate-agent.ts       [MODIFY] 增强上下文传递 + 阶段进度
│   └── ipc/
│       ├── chapter-handlers.ts             [NEW] IPC handler（薄分发）
│       └── index.ts                        [MODIFY] 注册 chapter handlers
├── preload/
│   ├── index.ts                            [MODIFY] 暴露 chapter 通道
│   └── index.d.ts                          [AUTO VIA FullPreloadApi] 无需手写额外方法声明
└── renderer/
    └── src/
        ├── modules/
        │   ├── editor/
        │   │   ├── components/
        │   │   │   ├── ChapterGenerateButton.tsx       [NEW]
        │   │   │   ├── ChapterGenerationProgress.tsx   [NEW]
        │   │   │   ├── RegenerateDialog.tsx            [NEW]
        │   │   │   ├── InlineErrorBar.tsx              [NEW]
        │   │   │   ├── PlateEditor.tsx                 [MODIFY] 暴露章节替换 imperative API
        │   │   │   ├── EditorView.tsx                  [MODIFY] 连接 hook 与 editor API
        │   │   │   ├── OutlineHeadingElement.tsx       [MODIFY] heading chrome + target locator
        │   │   │   └── DocumentOutlineTree.tsx         [MODIFY] 可选章节状态图标
        │   │   └── hooks/
        │   │       └── useChapterGeneration.ts         [NEW]
        │   └── project/
        │       ├── components/
        │       │   ├── ProjectWorkspace.tsx            [MODIFY] proposal-writing 作用域状态共享
        │       │   └── AnnotationPanel.tsx             [MODIFY] 轻量级生成摘要
        │       └── types.ts                            [REUSE] SOP 阶段定义
        └── stores/
            └── documentStore.ts                        [REUSE] 仅消费现有 updateContent/save 链路

tests/
├── unit/
│   ├── main/
│   │   ├── ipc/
│   │   │   └── chapter-handlers.test.ts                [NEW]
│   │   ├── prompts/
│   │   │   └── generate-chapter.prompt.test.ts        [NEW]
│   │   └── services/
│   │       ├── chapter-generation-service.test.ts     [NEW]
│   │       └── agent-orchestrator/
│   │           └── orchestrator.test.ts               [MODIFY]
│   └── renderer/
│       ├── modules/
│       │   └── editor/
│       │       ├── hooks/
│       │       │   └── useChapterGeneration.test.ts   [NEW]
│       │       └── components/
│       │           ├── ChapterGenerateButton.test.tsx [NEW]
│       │           ├── ChapterGenerationProgress.test.tsx [NEW]
│       │           ├── RegenerateDialog.test.tsx      [NEW]
│       │           ├── InlineErrorBar.test.tsx        [NEW]
│       │           ├── PlateEditor.test.tsx           [MODIFY]
│       │           ├── EditorView.test.tsx            [MODIFY]
│       │           └── DocumentOutlineTree.test.tsx   [MODIFY]
│       └── project/
│           └── ProjectWorkspace.test.tsx              [MODIFY]
├── e2e/
│   └── stories/
│       └── story-3-4-ai-chapter-generation.spec.ts    [NEW]
└── preload/
    └── security.test.ts                               [MODIFY]
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3 Story 3.4]
- [Source: _bmad-output/planning-artifacts/architecture.md#Agent 编排层设计原则]
- [Source: _bmad-output/planning-artifacts/architecture.md#AI 调用模式]
- [Source: _bmad-output/planning-artifacts/architecture.md#异步任务白名单]
- [Source: _bmad-output/planning-artifacts/architecture.md#Prompt 文件规范]
- [Source: _bmad-output/planning-artifacts/prd.md#FR20 系统可以按章节独立生成 AI 方案内容]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR3 AI 单章节生成]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR20 章节级容错]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR23 AI API 超时处理]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#异步操作模式]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#内联错误恢复]
- [Source: _bmad-output/implementation-artifacts/3-3-template-driven-proposal-skeleton.md#Dev Notes]
- [Source: _bmad-output/implementation-artifacts/2-7-strategy-seed-generation.md#seed-json 快照格式如下后续 Story 3.4 直接读取此文件]
- [Source: _bmad-output/implementation-artifacts/3-4-ai-chapter-generation-ux/ux-spec.md]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
