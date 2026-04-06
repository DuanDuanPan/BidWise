# Story 3.5: AI 内容来源标注与基线交叉验证

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want AI 生成的每段内容都标注来源，产品功能描述与基线交叉验证,
So that 我能判断"这段话是从哪来的"，防止 AI 编造技术参数。

## Acceptance Criteria

1. **Given** AI 生成方案内容
   **When** 内容渲染到编辑器
   **Then** 每段内容旁显示 12px 来源标注标签：资产库蓝底 `#1677FF` / 知识库绿底 `#52C41A` / AI 推理橙底 `#FAAD14`（FR21, UX-DR16）

2. **Given** 内容无明确来源
   **When** 渲染
   **Then** 该段落以黄色高亮背景（`#FFFBE6`）强制标注"无来源"标签，提醒用户人工确认（FR21）

3. **Given** AI 生成的产品功能描述
   **When** 与基础产品能力基线比对
   **Then** 不匹配项自动标红（红色边框或下划线 `#FF4D4F`），防止 AI 编造不存在的产品功能（FR22）

4. **Given** 用户点击来源标注标签
   **When** 展开
   **Then** 显示来源详情弹出框：原始出处路径、匹配片段引用、匹配度百分比

5. **Given** AI 生成完成
   **When** 来源标注元数据持久化
   **Then** 来源信息写入 `proposal.meta.json` 的 `sourceAttributions` 字段，至少包含 `{ id, sectionLocator, paragraphIndex, paragraphDigest, sourceType, sourceRef?, snippet?, confidence }`

6. **Given** 基线交叉验证完成
   **When** 验证结果持久化
   **Then** 不匹配项写入 `proposal.meta.json` 的 `baselineValidations` 字段，至少包含 `{ id, sectionLocator, paragraphIndex, claim, claimDigest, baselineRef?, matched, mismatchReason? }`

7. **Given** 用户编辑 AI 生成的内容后
   **When** 内容变更
   **Then** 对应段落基于 `paragraphDigest` 失配被渲染为灰色"已编辑"状态，不再展开原始来源详情，且不自动重新触发 AI 调用

8. **Given** 来源标注与基线验证流程
   **When** 所有调用通过 agent-orchestrator
   **Then** prompt 文件使用 `.prompt.ts` 规范，禁止绕过编排层直接调用 API

## Tasks / Subtasks

### 共享类型与段落定位

- [ ] Task 1: 定义来源标注 / 基线验证类型，并统一段落切分规则（AC: #1, #2, #5, #6, #7）
  - [ ] 1.1 新建 `src/shared/source-attribution-types.ts`
  - [ ] 1.2 定义 `SourceType = 'asset-library' | 'knowledge-base' | 'ai-inference' | 'no-source' | 'user-edited'`
  - [ ] 1.3 定义 `RenderableParagraph { paragraphIndex: number; text: string; digest: string }`
  - [ ] 1.4 定义 `SourceAttribution { id: string; sectionLocator: ChapterHeadingLocator; paragraphIndex: number; paragraphDigest: string; sourceType: SourceType; sourceRef?: string; snippet?: string; confidence: number }`
  - [ ] 1.5 定义 `BaselineValidation { id: string; sectionLocator: ChapterHeadingLocator; paragraphIndex: number; claim: string; claimDigest: string; baselineRef?: string; matched: boolean; mismatchReason?: string }`
  - [ ] 1.6 定义 `SourceAttributionResult { attributions: SourceAttribution[]; baselineValidations: BaselineValidation[] }`
  - [ ] 1.7 定义：
    - `AttributeSourcesInput { projectId: string; target: ChapterHeadingLocator; content: string }`
    - `ValidateBaselineInput { projectId: string; target: ChapterHeadingLocator; content: string }`
    - `GetSourceAttributionsInput { projectId: string; target: ChapterHeadingLocator }`
    - `SourceTaskOutput { taskId: string }`
    - `GetSourceAttributionsOutput { attributions: SourceAttribution[]; baselineValidations: BaselineValidation[] }`
  - [ ] 1.8 扩展 `src/shared/chapter-markdown.ts`
    - 新增 `extractRenderableParagraphs(sectionMarkdown)`，统一主进程与渲染进程的 `paragraphIndex / digest` 计算
    - Alpha 仅把正文段落与列表项视为可标注块；标题、空行、guidance blockquote、代码块不参与来源标注 UI

### 主进程（Main Process）

- [ ] Task 2: 创建 source-attribution prompt（AC: #1, #2, #5, #8）
  - [ ] 2.1 新建 `src/main/prompts/attribute-sources.prompt.ts`
  - [ ] 2.2 定义 `AttributeSourcesContext { chapterTitle: string; paragraphs: RenderableParagraph[]; availableAssetHints?: string[]; knowledgeHints?: string[] }`
  - [ ] 2.3 prompt 要求 AI 逐段输出 `{ paragraphIndex, sourceType, sourceRef?, snippet?, confidence }` 结构化 JSON
  - [ ] 2.4 prompt 明确：无法确定来源时必须标记为 `no-source`，禁止编造来源；即使 Alpha 没有真实语义检索，也允许根据显式上下文输出 `asset-library / knowledge-base`
  - [ ] 2.5 单测验证 prompt 模板输出完整性、段落编号注入与 `no-source` 约束

- [ ] Task 3: 创建 baseline-validation prompt（AC: #3, #6, #8）
  - [ ] 3.1 新建 `src/main/prompts/validate-baseline.prompt.ts`
  - [ ] 3.2 定义 `ValidateBaselineContext { chapterTitle: string; paragraphs: RenderableParagraph[]; productBaseline: string }`
  - [ ] 3.3 prompt 要求 AI 输出 `{ paragraphIndex, claim, claimDigest, baselineRef?, matched, mismatchReason? }` JSON
  - [ ] 3.4 单测验证 prompt 模板输出完整性、声明归属段落与 mismatch reason 输出

- [ ] Task 4: 创建 `source-attribution-service`，由外层任务负责轮询、解析和 sidecar 持久化（AC: #1-#8）
  - [ ] 4.1 新建 `src/main/services/source-attribution-service.ts`
  - [ ] 4.2 实现 `attributeSources(input: AttributeSourcesInput): Promise<SourceTaskOutput>`
    - 用 `input.content` 作为权威章节内容做段落切分，不依赖磁盘上的 `proposal.md` 重新读取，避免和未 flush 的编辑器状态竞争
    - 通过 `taskQueue.enqueue({ category: 'semantic-search', input })` 创建外层任务，再在 `taskQueue.execute()` 内调用 `agentOrchestrator.execute({ agentType: 'attribute-sources', ... })`
    - 外层任务轮询 inner agent 终态，解析 JSON，补齐 `paragraphDigest`，并在成功后写入 `proposal.meta.json.sourceAttributions`
  - [ ] 4.3 实现 `validateBaseline(input: ValidateBaselineInput): Promise<SourceTaskOutput>`
    - 采用与 `src/main/services/template-service.ts` 一致的双候选目录解析方式查找公司级基线：先 `app.getAppPath()/company-data/baselines`，再 `app.getPath('userData')/company-data/baselines`
    - 文件候选按 `{project.proposalType}.md|json` → `default.md|json` 搜索；当前 MVP `proposalType` 固定为 `presale-technical`
    - 未找到基线文件时，外层任务应以 `completed` 终态结束并记录 skipped message，不报错，也不写入 mismatch 数据
    - 找到基线后同样通过外层任务调用 inner `validate-baseline` agent，解析并写入 `proposal.meta.json.baselineValidations`
  - [ ] 4.4 实现 `getAttributions(input: GetSourceAttributionsInput): Promise<GetSourceAttributionsOutput>`
    - 从 `documentService.getMetadata(projectId)` 读取 metadata
    - 仅返回目标 `sectionLocator` 下的 attribution / validation 记录
  - [ ] 4.5 实现持久化合并语义
    - 同一 `sectionLocator` 的 `sourceAttributions` 采用“整段替换”策略，避免重复追加
    - `baselineValidations` 同样按 `sectionLocator` 覆盖式更新，保留其他章节数据不变
    - sidecar 更新统一走 `documentService.updateMetadata()`，避免 attribution / baseline 两条并行任务互相覆盖
  - [ ] 4.6 单测覆盖：上下文构建、外层任务轮询、baseline skipped、结果持久化、错误处理

- [ ] Task 5: 扩展 agent handler / orchestrator 契约（AC: #8）
  - [ ] 5.1 新建 `src/main/services/agent-orchestrator/agents/attribute-sources-agent.ts`
    - handler 只构建 prompt/messages，不直接调用 `aiProxy.call()`
    - `updateProgress`: 0%→解析段落、50%→分析来源
  - [ ] 5.2 新建 `src/main/services/agent-orchestrator/agents/validate-baseline-agent.ts`
    - handler 只构建 prompt/messages，不直接调用 `aiProxy.call()`
    - `updateProgress`: 0%→提取声明、50%→比对基线
  - [ ] 5.3 扩展 `src/shared/ai-types.ts` 的 `AgentType`，新增 `'attribute-sources' | 'validate-baseline'`
  - [ ] 5.4 在 `src/main/services/agent-orchestrator/index.ts` 中注册两个新 agent
  - [ ] 5.5 修改 `src/main/services/agent-orchestrator/orchestrator.ts`
    - 移除当前对所有 agent 一刀切的 `ctx.updateProgress(90, 'annotating-sources')`
    - 让具体 progress 只由对应 handler 或外层服务任务发出，避免 `attribute-sources` / `validate-baseline` 被错误标记成章节生成阶段
  - [ ] 5.6 单测覆盖 agent 注册、AgentType 扩展、orchestrator progress 契约回归

- [ ] Task 6: IPC 通道与 preload API（AC: #1, #5, #6）
  - [ ] 6.1 在 `src/shared/ipc-types.ts` 新增 IPC 通道与类型映射：`source:attribute`、`source:validate-baseline`、`source:get-attributions`
  - [ ] 6.2 新建 `src/main/ipc/source-attribution-handlers.ts`，使用 `createIpcHandler` 做薄分发
  - [ ] 6.3 在 `src/main/ipc/index.ts` 中注册新 handler，并把 `RegisteredSourceAttributionChannels` 并入 exhaustive `_AllRegistered`
  - [ ] 6.4 在 `src/preload/index.ts` 中暴露 `sourceAttribute()` / `sourceValidateBaseline()` / `sourceGetAttributions()`
  - [ ] 6.5 更新 `tests/unit/preload/security.test.ts` 白名单

### 共享模型与 sidecar 更新

- [ ] Task 7: 扩展 `ProposalMetadata` 与 `documentService`（AC: #5, #6）
  - [ ] 7.1 在 `src/shared/models/proposal.ts` 扩展 `ProposalMetadata`
    - 新增 `sourceAttributions: SourceAttribution[]`
    - 新增 `baselineValidations: BaselineValidation[]`
  - [ ] 7.2 扩展 `src/main/services/document-service.ts`
    - `buildDefaultMetadata()` / `normalizeMetadata()` / `parseMetadata()` 为新字段提供 `[]` 默认值并校验数组类型
    - 新增 `updateMetadata(projectId, updater)`，用于原子化 metadata patch
    - 既有 `annotations` / `scores` / `sectionWeights` / `templateId` 在普通保存与 metadata patch 后不得丢失
  - [ ] 7.3 更新 `tests/unit/main/services/document-service.test.ts` 覆盖 metadata 保留与 patch helper

### 渲染进程（Renderer Process）

- [ ] Task 8: 来源标注 UI 组件（AC: #1, #2, #4, #7）
  - [ ] 8.1 新建 `src/renderer/src/modules/editor/components/SourceAttributionLabel.tsx`
    - 12px 内联标签，按 `sourceType` 渲染颜色、图标和辅助文案
    - 复用 `SourceAssetIcon` / `SourceKnowledgeIcon` / `SourceAiIcon`
    - `no-source` 呈现黄色高亮背景，`user-edited` 呈现灰色禁用态
  - [ ] 8.2 新建 `src/renderer/src/modules/editor/components/SourceDetailPopover.tsx`
    - 展示来源类型、原始出处、匹配片段、匹配度百分比
    - `no-source` / `user-edited` 时显示不可追溯说明，不展开旧来源正文

- [ ] Task 9: 基线验证 UI 组件（AC: #3）
  - [ ] 9.1 新建 `src/renderer/src/modules/editor/components/BaselineMismatchMarker.tsx`
    - 不匹配段落显示红色边框 / 下划线 / 警告图标
    - Tooltip 展示声明内容、基线参考、不匹配原因
  - [ ] 9.2 Alpha 阶段仅展示文本引用，不做跨文档跳转

- [ ] Task 10: 创建 `useSourceAttribution` hook 与上下文（AC: #1-#7）
  - [ ] 10.1 新建 `src/renderer/src/modules/editor/hooks/useSourceAttribution.ts`
  - [ ] 10.2 新建：
    - `src/renderer/src/modules/editor/context/SourceAttributionContext.ts`
    - `src/renderer/src/modules/editor/context/useSourceAttributionContext.ts`
  - [ ] 10.3 管理 `Map<sectionKey, { attributions; baselineValidations; attributionTaskId?; baselineTaskId?; attributionPhase; baselinePhase }>`
  - [ ] 10.4 提供 `triggerAttribution(target, content)` / `triggerBaselineValidation(target, content)` / `refreshSection(target)` / `getSectionState(target)`
  - [ ] 10.5 监听 `window.api.onTaskProgress()` 更新外层任务进度，并通过 `window.api.taskGetStatus()` 而不是 `agentStatus()` 轮询终态
  - [ ] 10.6 任务完成后自动调用 `sourceGetAttributions()` 刷新 section state
  - [ ] 10.7 结合当前编辑器内容与持久化 `paragraphDigest / claimDigest` 派生 `user-edited` 状态，并在 digest 失配时隐藏旧 mismatch 标记

- [ ] Task 11: 编辑器集成（AC: #1, #2, #3, #7）
  - [ ] 11.1 更新 `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
    - 在 workspace 作用域初始化 `useSourceAttribution`
    - 通过 `SourceAttributionProvider` 向 `EditorView` / heading / paragraph 渲染层共享状态
  - [ ] 11.2 更新 `src/renderer/src/modules/editor/components/EditorView.tsx`
    - 仅在 `replaceSectionContent()` 真正成功后触发 `triggerAttribution()`
    - 章节进入 `conflicted` 且用户选择“保留手动编辑”时不得自动触发 attribution / baseline validation
    - 用户在冲突 Modal 中选择“替换”后，替换成功再触发 attribution 流程
  - [ ] 11.3 更新 `src/renderer/src/modules/editor/plugins/editorPlugins.ts` 与 `src/renderer/src/modules/editor/components/PlateEditor.tsx`
    - 接入 paragraph 渲染层的来源标签 / mismatch 装饰能力
    - 不向 Slate AST 持久化来源节点，所有标记仅由 context + decorations/render layer 驱动
  - [ ] 11.4 如需在标题区展示 section 级汇总（如 mismatch count），只做展示，不在 `OutlineHeadingElement.tsx` 内直接触发后台任务

- [ ] Task 12: 与 Story 3.4 的章节生成进度和 UX 对齐（AC: #1, #3, #8）
  - [ ] 12.1 维持 `ChapterGenerationPhase` 现有核心阶段（`analyzing / matching-assets / generating / annotating-sources`）不做破坏性重命名
  - [ ] 12.2 更新 `src/renderer/src/modules/editor/components/ChapterGenerationProgress.tsx`
    - 将 `annotating-sources` 作为真实来源标注阶段展示
    - 增加可选的“基线验证”第五视觉槽位或 secondary note，以匹配 3.5 UX Screen 4，而不是重写 3.4 的共享 phase enum
  - [ ] 12.3 `generate` 流程的 90% “标注来源”阶段必须由章节生成链路显式发出；不得再依赖 orchestrator 全局硬编码

### 测试

- [ ] Task 13: 单元测试、集成测试与 E2E（AC: #1-#8）
  - [ ] 13.1 `tests/unit/main/prompts/attribute-sources.prompt.test.ts` — prompt 模板输出、段落编号、`no-source` 约束
  - [ ] 13.2 `tests/unit/main/prompts/validate-baseline.prompt.test.ts` — prompt 模板输出、claim→paragraph 映射
  - [ ] 13.3 `tests/unit/main/services/source-attribution-service.test.ts` — 外层任务轮询、JSON 解析、baseline skipped、sidecar 覆盖更新
  - [ ] 13.4 `tests/unit/main/services/agent-orchestrator/agents/attribute-sources-agent.test.ts` — handler 消息构造、进度更新
  - [ ] 13.5 `tests/unit/main/services/agent-orchestrator/agents/validate-baseline-agent.test.ts` — handler 消息构造、进度更新
  - [ ] 13.6 `tests/unit/main/services/agent-orchestrator/orchestrator.test.ts` — 移除全局 `annotating-sources` hardcode 的回归测试
  - [ ] 13.7 `tests/unit/main/services/document-service.test.ts` — `sourceAttributions / baselineValidations` 默认值与 `updateMetadata()` 保留行为
  - [ ] 13.8 `tests/unit/main/ipc/source-attribution-handlers.test.ts` + `tests/unit/preload/security.test.ts` — IPC 注册与 preload 白名单
  - [ ] 13.9 `tests/unit/renderer/modules/editor/hooks/useSourceAttribution.test.ts` — 任务进度、digest 派生的 `user-edited` 状态、baseline skipped
  - [ ] 13.10 `tests/unit/renderer/modules/editor/components/SourceAttributionLabel.test.tsx` / `SourceDetailPopover.test.tsx` / `BaselineMismatchMarker.test.tsx` — 组件渲染与交互
  - [ ] 13.11 `tests/unit/renderer/modules/editor/components/EditorView.test.tsx` / `PlateEditor.test.tsx` / `ChapterGenerationProgress.test.tsx` / `tests/unit/renderer/project/ProjectWorkspace.test.tsx` — trigger 时机、paragraph render、五步视觉态
  - [ ] 13.12 新增基线 fixture：`tests/fixtures/baseline-samples/presale-technical.md`
  - [ ] 13.13 `tests/e2e/stories/story-3-5-source-attribution.spec.ts` — 章节替换成功后自动来源标注、无来源高亮、基线不匹配标红、编辑后标签变灰、缺失基线文件时静默跳过
  - [ ] 13.14 `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` 全部通过

## Dev Notes

### 本 Story 在 Epic 3 中的位置

```
Story 3.1 (done): Plate 编辑器 + Markdown 序列化
Story 3.2 (done): 编辑器嵌入工作空间 + 文档大纲
Story 3.3 (done): 模板驱动方案骨架生成
Story 3.4 (review): AI 章节级方案生成 ← 当前代码已落地生成主链路，本 Story 依赖其已存在实现
→ Story 3.5 (本 Story): AI 内容来源标注与基线交叉验证
Story 3.6 (next): 文风模板与军工用语控制
```

本 Story 是 AI 生成内容的"可信层"。Story 3.4 生成初稿后，本 Story 负责对每段内容标注来源（资产库/知识库/AI 推理/无来源）并与产品基线交叉验证，让用户快速判断"这段话可信吗"。

### 数据流

```
Story 3.4 AI 章节生成完成，且 EditorView 已成功 replaceSectionContent()
  ↓
EditorView 通过 SourceAttributionContext 调用 triggerAttribution(target, appliedContent)
  ↓
IPC: source:attribute → source-attribution-handlers.ts（薄分发）
  ↓
sourceAttributionService.attributeSources({ projectId, target, content })
  ├── 1. taskQueue.enqueue({ category: 'semantic-search', input })
  └── 2. taskQueue.execute(outerTaskId, ctx => {
         - extractRenderableParagraphs(content)
         - agentOrchestrator.execute({ agentType: 'attribute-sources', ... }) 启动 inner agent
         - 轮询 inner agent 完成
         - 解析结构化 JSON
         - documentService.updateMetadata() 覆盖写回当前 section 的 sourceAttributions
       })
  ↓
renderer:
  ├── onTaskProgress() 监听 outer task 进度
  ├── taskGetStatus(taskId) 查询 outer task 终态
  ├── 完成后调用 sourceGetAttributions() 刷新当前 section 状态
  └── paragraph render layer 根据 digest 派生 SourceAttributionLabel / BaselineMismatchMarker
```

```
并行路径（基线验证）：
useSourceAttribution.triggerBaselineValidation(target, appliedContent)
  ↓
IPC: source:validate-baseline → source-attribution-handlers.ts
  ↓
sourceAttributionService.validateBaseline({ projectId, target, content })
  ├── resolveCompanyBaselineDir() 采用 template-service 同款双路径搜索
  ├── 若未找到 `{proposalType}.md|json` / `default.md|json` → outer task completed(skipped)
  └── 若找到 baseline → inner validate-baseline agent 分析并写回当前 section 的 baselineValidations
  ↓
renderer 刷新本 section mismatch 状态；digest 失配的旧记录不再展示
```

### 已有基础设施（禁止重复实现）

| 组件 | 位置 | 用途 |
|------|------|------|
| AgentOrchestrator | `src/main/services/agent-orchestrator/orchestrator.ts` | agent 执行、状态查询 |
| agent registry | `src/main/services/agent-orchestrator/index.ts` | 当前 agent 注册入口，本 Story 应在此注册新 agent |
| AiProxyService | `src/main/services/ai-proxy/index.ts` | 脱敏→调用→恢复 |
| provider-adapter retry | `src/main/services/ai-proxy/provider-adapter.ts` | 3 次自动重试 |
| TaskQueueService | `src/main/services/task-queue/queue.ts` | 任务排队、并发控制、进度推送 |
| documentService | `src/main/services/document-service.ts` | `proposal.md` / `proposal.meta.json` 读写 |
| template-service resolver pattern | `src/main/services/template-service.ts` | 公司级 `company-data` 双路径解析参考 |
| useChapterGeneration | `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts` | 章节生成 hook，本 Story 需要与其终态协作 |
| PlateEditor | `src/renderer/src/modules/editor/components/PlateEditor.tsx` | Plate 编辑器核心 |
| OutlineHeadingElement | `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx` | Heading 自定义渲染 |
| EditorView | `src/renderer/src/modules/editor/components/EditorView.tsx` | Plate 编辑器容器 |
| ChapterGenerationProgress | `src/renderer/src/modules/editor/components/ChapterGenerationProgress.tsx` | 章节生成进度组件 |
| editorPlugins | `src/renderer/src/modules/editor/plugins/editorPlugins.ts` | Plate 渲染组件注册入口 |
| SourceAssetIcon | `src/renderer/src/shared/components/icons/SourceAssetIcon.tsx` | 资产库来源图标（蓝） |
| SourceKnowledgeIcon | `src/renderer/src/shared/components/icons/SourceKnowledgeIcon.tsx` | 知识库来源图标（绿） |
| SourceAiIcon | `src/renderer/src/shared/components/icons/SourceAiIcon.tsx` | AI 推理来源图标（橙） |
| ProposalMetadata | `src/shared/models/proposal.ts` | sidecar 元数据模型 |
| ChapterHeadingLocator | `src/shared/chapter-types.ts` | 章节定位器，复用 Story 3.4 定义 |
| createIpcHandler | `src/main/ipc/create-handler.ts` | IPC handler 工厂函数 |
| IPC_CHANNELS / IpcChannelMap | `src/shared/ipc-types.ts` | IPC 常量与通道类型映射 |
| BidWiseError | `src/main/utils/errors.ts` | 类型化错误基类 |

### 关键实现决策

**1. 来源标注通过独立 AI agent 完成，不在 generate-agent 内联**

- 来源标注是生成后的独立分析步骤，不应耦合到章节生成 prompt 中
- 保持 generate-agent 专注于内容生成，attribute-sources-agent 专注于来源分析
- 两步串行（生成→标注），但来源标注和基线验证由各自 outer task 负责轮询、解析和持久化

**2. 来源标注结果存储在 sidecar JSON，不新建 SQLite 表**

- `proposal.meta.json` 已有 `annotations` 占位字段，来源标注作为章节级元数据更适合 sidecar
- 来源标注与方案内容强绑定，随文件移动，不需要跨项目查询
- 本 Story 不创建新数据库表，完全通过 sidecar JSON 持久化
- 并行写入必须统一走 `documentService.updateMetadata()`，避免 attribution / baseline 两条任务互相覆盖

**3. 段落级定位使用 `sectionLocator + paragraphIndex + paragraphDigest`**

- 复用 `ChapterHeadingLocator`（title + level + occurrenceIndex）定位章节
- 章节内按统一 helper 计算 `paragraphIndex`
- 同时持久化 `paragraphDigest` / `claimDigest`，渲染层据此识别“已编辑”与隐藏过期 mismatch
- `paragraphIndex` 用于 UI 定位，`digest` 用于编辑后失效判定；两者都不能省略

**4. Alpha 阶段"资产匹配"和"知识库匹配"为占位**

- 真正的资产库语义搜索在 Epic 5 实现
- 真正的知识图谱查询在 Epic 10（Beta）实现
- Alpha 阶段：AI agent 基于 prompt 内容分析判断来源类型，不调用外部资产/知识服务
- 来源标注 agent 仍然会标记类型，但 `sourceRef` 可为空

**5. 基线交叉验证依赖公司级基线文件，解析方式与 template-service 对齐**

- 基线目录候选顺序：`app.getAppPath()/company-data/baselines` → `app.getPath('userData')/company-data/baselines`
- 文件名候选顺序：`{proposalType}.md|json` → `default.md|json`
- Alpha 阶段：若基线文件不存在，完成任务但跳过 mismatch 输出，不报错
- 基线文件格式为 Markdown/JSON，包含产品功能列表与参数范围
- 验证逻辑通过独立 `validate-baseline` agent 实现

**6. “已编辑”是派生状态，不是每次键入都回写 sidecar**

- 用户手动修改 AI 生成的段落后，原始来源标注不再准确
- 渲染层比较当前段落 digest 与已持久化 `paragraphDigest`
- digest 失配时，把对应标签渲染为 `user-edited`，同时隐藏旧来源详情和旧 baseline mismatch
- 不自动重新触发来源标注（避免频繁 AI 调用）

**7. 来源详情使用 Ant Design Popover，不使用 Modal**

- 来源详情是轻量级信息查看，不应打断编辑流
- 与 UX-DR30 模态策略一致：侧边面板/Popover 用于不打断主编辑流的操作

**8. 来源标注标签渲染通过 Plate render layer / decorations 实现**

- 不修改 Plate 核心数据模型（不在 Slate AST 中添加节点）
- 在 `editorPlugins.ts` / `PlateEditor.tsx` 接入 paragraph render layer，与 context 状态协作
- 来源数据从 `useSourceAttribution` hook 状态驱动，不持久化到 Markdown

**9. 自动触发点必须在 EditorView 的 section replace 成功之后**

- `OutlineHeadingElement.tsx` 负责按钮与进度展示，不是可靠的内容落盘时机
- `EditorView.tsx` 已掌握 `replaceSectionContent()` 是否成功以及 conflict Modal 的最终选择
- 因此 attribution / baseline validation 只能在 `EditorView` 成功替换章节后启动

### 前一 Story（3-4）关键学习

1. **heading locator 定位模式**：`title + level + occurrenceIndex` 已成为跨进程章节定位标准，本 Story 复用
2. **task-queue + agent-orchestrator 调用链**：`maxRetries: 0` 避免与 provider-adapter 重试叠加；复杂后处理应放在 outer task，而不是依赖 inner agent 直接落盘
3. **imperative API 模式**：`PlateEditor` 的 `replaceSectionContent()` 是自动 attribution 的唯一可靠触发点
4. **进度推送模式**：`window.api.onTaskProgress()` 适合实时 UI；service-owned outer task 应配合 `taskGetStatus()` 查询终态，而不是复用 `agentStatus()`
5. **proposal.meta.json 扩展方式**：新增字段保持向后兼容，读取时缺少字段使用默认值
6. **冲突检测 baselineDigest**：Story 3.4 已建立“替换是否成功”的边界；本 Story 只在 replace 成功后追加来源任务，不穿透 conflicted 分支
7. **Ant Design 组件使用**：直接使用 Ant Design 组件（Popover、Tooltip、Tag），保持 UI 风格一致

### 禁止事项

- **禁止**绕过 agent-orchestrator 直接调用 aiProxy（架构强制规则）
- **禁止**绕过 task-queue（AI 调用必须经过任务队列）
- **禁止**在 IPC handler 中放置业务逻辑（委托给 `sourceAttributionService`）
- **禁止**在 renderer 直接读写 `proposal.meta.json`（统一经 main-process + `documentService.updateMetadata()`）
- **禁止**使用 `../../` 以上的相对导入路径（使用 `@main/`、`@renderer/`、`@shared/`、`@modules/` 别名）
- **禁止**为来源标注新建 SQLite 表（使用 sidecar JSON）
- **禁止**为来源标注新建全局 Zustand store（使用工作区局部 hook）
- **禁止**在 Slate AST 中添加来源标注节点（使用 decoration 渲染层）
- **禁止**在 generate-chapter prompt 中内联来源分析逻辑（独立 agent）
- **禁止**在 `AgentOrchestrator.createExecutor()` 中继续保留所有 agent 共用的 `annotating-sources` 硬编码阶段
- **禁止**在章节进入 `conflicted` 但尚未替换成功时启动 attribution / baseline validation
- **禁止**throw 裸字符串（使用 `BidWiseError`）
- **禁止**在 prompt 中硬编码实现逻辑（必须放在 `src/main/prompts/*.prompt.ts`）
- **禁止**依赖不存在的资产库语义搜索 API（Epic 5 实现）
- **禁止**依赖不存在的知识图谱查询 API（Epic 10 Beta 实现）

### Alpha 阶段边界说明

本 Story 为 Alpha 阶段实现，以下功能为**占位/预留**：

- "资产库匹配"：AI agent 推断来源类型但 `sourceRef` 可为空，真正的资产语义搜索在 Epic 5 实现
- "知识库匹配"：同上，真正的知识图谱查询在 Epic 10 实现
- 基线交叉验证：依赖公司级 baseline 文件解析；若文件不存在则跳过验证
- 仅正文段落与列表项参与来源标注 UI；代码块 / guidance blockquote / 标题保持默认编辑器表现
- 来源标签 12px 图标已存在（`SourceAssetIcon`/`SourceKnowledgeIcon`/`SourceAiIcon`），本 Story 负责集成到编辑器 render layer

### Project Structure Notes

新增 / 修改文件清单：

```
src/
├── shared/
│   ├── source-attribution-types.ts            [NEW] 来源标注与基线验证类型
│   ├── ai-types.ts                            [MODIFY] 扩展 AgentType
│   ├── chapter-markdown.ts                    [MODIFY] 统一 paragraphIndex / digest 规则
│   ├── models/proposal.ts                     [MODIFY] 扩展 ProposalMetadata
│   └── ipc-types.ts                           [MODIFY] 新增 source:* IPC 通道
├── main/
│   ├── prompts/
│   │   ├── attribute-sources.prompt.ts        [NEW] 来源标注 prompt
│   │   └── validate-baseline.prompt.ts        [NEW] 基线验证 prompt
│   ├── services/
│   │   ├── source-attribution-service.ts      [NEW] 来源标注业务服务
│   │   └── agent-orchestrator/
│   │       ├── index.ts                       [MODIFY] 注册新 agent
│   │       ├── orchestrator.ts                [MODIFY] 去掉全局 progress 硬编码
│   │       └── agents/
│   │           ├── attribute-sources-agent.ts [NEW] 来源标注 agent handler
│   │           └── validate-baseline-agent.ts [NEW] 基线验证 agent handler
│   ├── ipc/
│   │   ├── source-attribution-handlers.ts     [NEW] IPC 薄分发
│   │   └── index.ts                           [MODIFY] 注册新 handler + exhaustive check
│   └── document-service.ts                    [MODIFY] 增加 updateMetadata()
├── preload/
│   └── index.ts                               [MODIFY] 暴露新 API
└── renderer/src/
    └── modules/
        ├── project/components/ProjectWorkspace.tsx [MODIFY] 提供 SourceAttributionContext
        └── editor/
            ├── context/
            │   ├── SourceAttributionContext.ts      [NEW]
            │   └── useSourceAttributionContext.ts   [NEW]
            ├── hooks/
            │   └── useSourceAttribution.ts          [NEW] 来源标注状态管理 hook
            ├── plugins/editorPlugins.ts             [MODIFY] 接入 paragraph render layer
            └── components/
                ├── SourceAttributionLabel.tsx       [NEW] 来源标注标签
                ├── SourceDetailPopover.tsx          [NEW] 来源详情弹出框
                ├── BaselineMismatchMarker.tsx       [NEW] 基线不匹配标记
                ├── ChapterGenerationProgress.tsx    [MODIFY] 增加第五视觉槽位/secondary note
                ├── PlateEditor.tsx                  [MODIFY] 读取 SourceAttributionContext 做渲染装饰
                ├── OutlineHeadingElement.tsx        [MODIFY] 可选展示 section 汇总，不触发任务
                └── EditorView.tsx                   [MODIFY] 自动触发 attribution 的唯一入口

tests/
├── fixtures/
│   └── baseline-samples/
│       └── presale-technical.md              [NEW]
├── unit/main/prompts/
│   ├── attribute-sources.prompt.test.ts       [NEW]
│   └── validate-baseline.prompt.test.ts       [NEW]
├── unit/main/services/
│   ├── source-attribution-service.test.ts      [NEW]
│   ├── document-service.test.ts                [MODIFY]
│   └── agent-orchestrator/orchestrator.test.ts [MODIFY]
│
│   └── agent-orchestrator/agents/
│       ├── attribute-sources-agent.test.ts     [NEW]
│       └── validate-baseline-agent.test.ts     [NEW]
├── unit/main/ipc/
│   └── source-attribution-handlers.test.ts     [NEW]
├── unit/renderer/modules/editor/
│   ├── hooks/useSourceAttribution.test.ts      [NEW]
│   └── components/
│       ├── SourceAttributionLabel.test.tsx     [NEW]
│       ├── SourceDetailPopover.test.tsx        [NEW]
│       ├── BaselineMismatchMarker.test.tsx     [NEW]
│       ├── PlateEditor.test.tsx                [MODIFY]
│       ├── EditorView.test.tsx                 [MODIFY]
│       └── ChapterGenerationProgress.test.tsx  [MODIFY]
├── unit/renderer/project/
│   └── ProjectWorkspace.test.tsx               [MODIFY]
├── unit/preload/
│   └── security.test.ts                        [MODIFY]
└── e2e/stories/
    └── story-3-5-source-attribution.spec.ts    [NEW]
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.5] — 来源标注与基线验证 AC
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3] — Epic 3 全局上下文
- [Source: _bmad-output/planning-artifacts/prd.md#FR21] — AI 生成内容标注来源
- [Source: _bmad-output/planning-artifacts/prd.md#FR22] — 产品功能描述与基线交叉验证
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR16] — 来源标注标签视觉规范
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UX-DR30] — 非阻塞 Popover / inline 操作策略
- [Source: _bmad-output/planning-artifacts/architecture.md#项目目录结构] — `company-data/baselines` 与 `tests/fixtures/baseline-samples`
- [Source: _bmad-output/implementation-artifacts/3-4-ai-chapter-generation.md] — 前一 Story 学习与已建立模式
- [Source: _bmad-output/implementation-artifacts/3-5-source-attribution-baseline-validation-ux/prototype.manifest.yaml] — 本 Story UX 查阅入口
- [Source: _bmad-output/implementation-artifacts/3-5-source-attribution-baseline-validation-ux/ux-spec.md] — 来源标签 / Popover / mismatch / progress 视觉规范
- [Source: _bmad-output/implementation-artifacts/3-5-source-attribution-baseline-validation-ux/prototype.pen] — 结构与交互细节参考
- [Source: src/main/services/agent-orchestrator/index.ts] — agent 注册真实入口
- [Source: src/main/services/agent-orchestrator/orchestrator.ts] — 当前全局 `annotating-sources` hardcode 需要移除
- [Source: src/main/services/template-service.ts] — `company-data` 双路径解析模式参考
- [Source: src/main/services/document-service.ts] — metadata 读取与保留逻辑
- [Source: src/main/ipc/index.ts] — IPC exhaustive registration pattern
- [Source: src/preload/index.ts] — requestApi 需手动接线
- [Source: src/shared/ai-types.ts] — `AgentType` 需要扩展
- [Source: src/shared/chapter-markdown.ts] — chapter locator / digest 复用入口
- [Source: src/renderer/src/modules/editor/components/EditorView.tsx] — replace 成功后才可启动 attribution
- [Source: src/renderer/src/modules/editor/components/PlateEditor.tsx] — paragraph render layer 接入点
- [Source: src/renderer/src/modules/editor/plugins/editorPlugins.ts] — Plate 组件注册入口
- [Source: tests/fixtures/baseline-samples/] — 约定的 baseline fixture 目录
- [Source: CLAUDE.md] — 项目级架构约束与反模式

### Change Log

- 2026-04-06: `validate-create-story` 修订
  - 补回 create-story 模板要求的 validation note
  - 修正 agent 注册入口、orchestrator 全局 progress hardcode、以及 `EditorView` 才是自动触发点的真实代码契约
  - 将来源标注 / 基线验证改为 outer task 负责轮询、解析、sidecar 落盘，避免“只拿到 inner agent taskId 却无人持久化”的执行断点
  - 为 `sourceAttributions` / `baselineValidations` 补齐 `paragraphDigest / claimDigest`，使“已编辑”状态与 mismatch 失效逻辑可实现且可跨刷新保持
  - 明确 baseline 文件双路径解析方式、`proposalType` 文件名约定，以及无 baseline 时的 skipped 语义
  - 收敛 renderer 方案为 `ProjectWorkspace` 作用域 context + `taskGetStatus()` 轮询 + paragraph render layer 接入

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
