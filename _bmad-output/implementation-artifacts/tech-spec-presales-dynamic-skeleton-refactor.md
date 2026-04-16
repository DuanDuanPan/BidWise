---
title: '售前技术方案动态骨架与逐维度生成改造方案'
slug: 'presales-dynamic-skeleton-refactor'
created: '2026-04-15'
status: 'draft'
stepsCompleted: [1]
tech_stack:
  [
    Electron,
    TypeScript,
    React,
    Zustand,
    Vitest,
    Kysely,
    SQLite,
    agent-orchestrator,
    task-queue,
  ]
files_to_modify:
  - src/shared/chapter-types.ts
  - src/shared/chapter-markdown.ts
  - src/shared/models/proposal.ts
  - src/shared/ipc-types.ts
  - src/preload/index.ts
  - src/main/ipc/chapter-handlers.ts
  - src/main/prompts/generate-chapter.prompt.ts
  - src/main/services/chapter-generation-service.ts
  - src/main/services/agent-orchestrator/agents/generate-agent.ts
  - src/main/services/agent-orchestrator/batch-orchestration-manager.ts
  - src/renderer/src/modules/editor/hooks/useChapterGeneration.ts
  - src/renderer/src/modules/editor/hooks/useSourceAttribution.ts
  - src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx
  - src/renderer/src/modules/editor/components/EditorView.tsx
new_files_expected:
  - src/shared/document-type-profile.ts
  - src/shared/dimension-catalog.ts
  - src/main/services/dynamic-skeleton-service.ts
  - src/main/services/context-pack-builder.ts
  - src/renderer/src/modules/editor/components/DynamicSkeletonPreview.tsx
related_specs:
  - _bmad-output/implementation-artifacts/tech-spec-skeleton-expand-chapter-generation.md
code_patterns:
  - 'IPC handlers stay thin; orchestration lives in src/main/services/'
  - 'Task queue drives long-running AI generation with progress events'
  - 'Proposal markdown and proposal.meta.json remain the dual persistence model'
  - 'Chapter replacement reuses existing replaceMarkdownSection / EditorView progressive injection path'
  - 'Prompt construction stays in src/main/prompts/'
test_patterns:
  - 'Vitest unit tests for types, services, prompt builders, and renderer hooks'
  - 'Hook tests mirror tests/unit/renderer/modules/editor/hooks'
  - 'Main service tests mirror tests/unit/main/services'
---

# Tech-Spec: 售前技术方案动态骨架与逐维度生成改造方案

**Created:** 2026-04-15

## Overview

### Problem Statement

当前“章节分治生成”已经支持骨架生成、骨架确认、批量生成三步链路，适合处理复合型章节。现有实现的骨架模型是扁平列表，确认结果写入 metadata，正文在批量生成完成后才呈现完整结果。这条链路已经证明了分治方向成立，下一步需要把它升级为更贴近售前技术方案心智的“模块 -> 维度”模型。

售前技术方案中的核心详细设计章节具备三个稳定特征：

- 同一章节会围绕多个业务模块或子系统展开
- 每个模块会从多个设计维度连续说明
- 用户的审阅和修订粒度天然是模块级，而不是单个小段落级

因此，首发改造目标是让系统围绕售前技术方案建立一套稳定的动态骨架引擎：第 2 步确认结构边界和模块树，第 3 步按模块上下文逐维度补充内容，并将前序维度结果持续回带给后续维度。

### Solution

本次改造将现有扁平 `skeleton-expand` 升级为一套首发可用的动态骨架系统，核心由三份契约构成：

1. `DocumentTypeProfile`
   负责定义“售前技术方案”有哪些固定章节、哪些章节进入动态骨架、默认维度顺序是什么、上下文回溯策略是什么。

2. `DimensionCatalog`
   负责定义 8 个通用设计维度的职责、触发条件、输出预期和 guidance 模板。

3. `SkeletonNode + ModuleContextPack`
   负责定义动态骨架树、模块决策记忆、逐维度生成时的上下文输入。

首发交付范围聚焦一个文档类型：`售前技术方案`。动态骨架确认粒度固定为 `模块 -> 维度`。正文生成粒度固定为“模块内逐维度串行补充内容”。模块来源优先级固定为 `用户补充 > RFP需求 > 模板章节`。正文占位形式固定为 `标题树 + 每个维度一句 guidance`。维度顺序由系统自动推荐。

本次改造严格限定在“编辑器内章节级动态骨架”这条链路。现有文档级模板骨架流程继续保留，`SolutionDesignView` 不作为首发改造对象。

## Scope

### In Scope

- 为售前技术方案新增 `DocumentTypeProfile`
- 为动态骨架新增树形节点模型 `SkeletonNode`
- 为动态骨架新增稳定锚点与任务路由键
- 为动态骨架新增 8 维度 `DimensionCatalog`
- 为生成链路新增 `ModuleContextPack` 和模块决策记忆
- 为第 2 步新增“用户补充模块”输入入口
- 动态骨架确认后，立即将树形结构写入父章节正文
- 将现有 batch 逻辑升级为“模块内维度队列”调度
- 维度生成时回带前序维度摘要与模块决策记忆
- UI 从“章节骨架预览”升级为“模块树 + 维度状态”预览
- 保持现有 task-queue、IPC、metadata 体系不变，沿现有模式扩展

### Out of Scope

- 其他文档类型的首发配置
- 自动识别所有文档类型
- 第三层 `topic` 粒度的展开与编辑
- 跨模块一致性自动校验
- 动态骨架拖拽编辑器
- 用户手工自定义维度顺序
- 模块并行生成

## Current State and Gap

### Current State

- 当前章节分治生成已经具备骨架生成、骨架确认、批量生成三段链路
- 当前骨架数据模型是扁平 `sections[]`
- 当前骨架确认只写入 `proposal.meta.json.confirmedSkeletons`
- 当前 batch 逻辑已经具备“前文摘要回带”能力
- 当前正文替换逻辑已经具备流式回填和章节级 replace 能力

### Gap

- 当前骨架表达不了 `模块 -> 维度` 树
- 当前正文在确认阶段看不到动态骨架结构
- 当前生成队列的最小任务单元是“扁平子章节”，用户心智中的最小单元是“模块内维度”
- 当前回溯上下文以文本摘要为主，缺少结构化决策记忆
- 当前系统没有文档类型层，不利于后续向建议书、需求规格说明书、用户手册扩展

## Target Model

### Core Product Principles

- 固定骨架定义结构边界
- 动态骨架定义当前项目的模块树
- 模块是上下文闭包
- 维度是首发生成单元
- 确认动作聚焦结构审核
- 正文生成沿模块上下文逐维度推进

### Boundary with Existing Template Flow

- 文档级模板骨架流程继续由 `SolutionDesignView` + `template-service` 负责
- 本次改造只作用于编辑器内的章节级“分治生成”
- 动态骨架系统消费既有 `proposal.md` 和 `proposal.meta.json`，不重做文档级模板选择 UI
- 若后续需要把文档级模板和章节级动态骨架联动，应单独开后续 story 处理

### Dynamic Chapter Whitelist for 首发

售前技术方案首发进入 `dynamic-tree-section` 的章节白名单如下：

- `方案总体设计`
- `分模块详细设计`
- `系统架构与部署设计`
- `接口与集成设计`
- `实施与交付设计`

以下章节继续使用固定骨架：

- `项目概述`
- `需求分析`
- `风险与保障`
- `附录`
- `公司资质/团队能力类章节`

## Contract 1: DocumentTypeProfile

```ts
export interface FixedSectionProfile {
  key: string
  title: string
  level: 1 | 2 | 3 | 4
  archetype: 'static-section' | 'dynamic-tree-section'
  required: boolean
  description?: string
}

export interface DynamicChapterProfile {
  chapterKey: string
  titlePattern: string
  archetype: 'dynamic-tree-section'
  decompositionStrategy:
    | 'business-module'
    | 'integration-domain'
    | 'runtime-unit'
    | 'delivery-work-package'
  moduleSourceHints: string[]
  defaultDimensions: string[]
  optionalDimensions: string[]
  supportsUserDefinedModules: boolean
}

export interface DocumentTypeProfile {
  id: string
  name: string
  version: string
  description: string

  fixedSkeleton: FixedSectionProfile[]
  dynamicChapterWhitelist: DynamicChapterProfile[]

  moduleRecognition: {
    sourcePriority: Array<'user' | 'rfp' | 'template'>
    mergeStrategy: 'dedupe-by-semantic-title'
    namingStrategy: 'prefer-user-label-then-rfp-then-template'
    userInputMode: 'chapter-local-append-and-rename'
  }

  dynamicSkeleton: {
    granularity: 'module-to-dimension'
    placeholderStyle: 'title-tree-with-guidance'
    defaultDimensionOrder: string[]
    confirmationMode: 'confirm-structure-before-content'
    generationMode: 'dimension-sequential-within-module'
  }

  contextPolicy: {
    includeDocumentGoal: boolean
    includeChapterSummary: boolean
    includeModuleDecisionMemory: boolean
    includePreviousDimensionSummary: boolean
    includeRequirementsTraceability: boolean
    includeScoringWeights: boolean
    includeTerminology: boolean
  }
}
```

### 首发实例约束

- 文档类型：`presales-technical-proposal`
- 动态骨架粒度：`module-to-dimension`
- 模块来源优先级：`user > rfp > template`
- 默认维度顺序：
  1. `functional`
  2. `process-flow`
  3. `data-model`
  4. `interface`
  5. `ui`
  6. `security`
  7. `deployment`
  8. `delivery-acceptance`
- 正文占位样式：模块标题 + 维度标题 + 每个维度一句 guidance

### Chapter-Specific Decomposition Rules

- `方案总体设计`
  - `decompositionStrategy = business-module`
  - 目标对象：业务模块、功能域、子系统
- `分模块详细设计`
  - `decompositionStrategy = business-module`
  - 目标对象：业务模块、核心能力单元
- `系统架构与部署设计`
  - `decompositionStrategy = runtime-unit`
  - 目标对象：部署单元、运行组件、节点角色
- `接口与集成设计`
  - `decompositionStrategy = integration-domain`
  - 目标对象：外部系统、接口域、集成对
- `实施与交付设计`
  - `decompositionStrategy = delivery-work-package`
  - 目标对象：交付包、实施域、阶段性工作包

章节级拆解策略必须显式配置，首发不允许所有动态章节共用一个“业务模块识别器”。

## Contract 2: DimensionCatalog

```ts
export interface DimensionDefinition {
  id: string
  label: string
  purpose: string
  applyWhen: string[]
  outputExpectation: string[]
  guidanceTemplate: string
  promptFocus: string
  decisionMemoryWrites: string[]
}
```

### 首发 8 维度

| id | 标签 | 首发职责 |
| --- | --- | --- |
| `functional` | 功能设计 | 定义模块能力边界、功能点、输入输出、业务规则 |
| `process-flow` | 流程设计 | 定义步骤、角色动作、状态流转、异常路径 |
| `data-model` | 数据结构设计 | 定义对象、字段、关系、数据约束 |
| `interface` | 接口设计 | 定义服务边界、输入输出、集成关系 |
| `ui` | UI设计 | 定义页面、交互、用户操作路径、反馈方式 |
| `security` | 权限与安全设计 | 定义角色、授权、审计、数据保护 |
| `deployment` | 部署设计 | 定义部署单元、环境依赖、运行约束 |
| `delivery-acceptance` | 验收与交付设计 | 定义交付物、验收标准、责任边界 |

### Default Enable Rules

- 默认开启：`functional`、`process-flow`、`data-model`、`interface`
- 条件开启：`ui`、`security`、`deployment`、`delivery-acceptance`

### Dimension Trimming Rules

- 模块存在可见页面时开启 `ui`
- 模块存在系统对接时开启 `interface`
- 模块存在角色与权限边界时开启 `security`
- 模块存在部署、环境或运行要求时开启 `deployment`
- 模块存在明确交付或验收要求时开启 `delivery-acceptance`

## Contract 3: SkeletonNode + ModuleContextPack

```ts
export type SkeletonNodeKind = 'chapter' | 'module' | 'dimension'
export type SkeletonNodeStatus =
  | 'draft'
  | 'confirmed'
  | 'queued'
  | 'generating'
  | 'completed'
  | 'failed'

export interface SkeletonNode {
  id: string
  parentId: string | null
  kind: SkeletonNodeKind
  title: string
  routeKey: string
  anchorKey: string
  order: number
  level: number
  source: 'user' | 'rfp' | 'template' | 'system'
  status: SkeletonNodeStatus
  chapterKey?: string
  moduleKey?: string
  dimensionId?: string
  guidance?: string
  summary?: string
  constraints?: string[]
  traceabilityRequirementIds?: string[]
  children: SkeletonNode[]
}
```

### Tree Shape for 首发

- 第 1 层：动态章节
- 第 2 层：模块
- 第 3 层：维度

首发不展开 `topic` 第 4 层。

```ts
export interface ModuleDecisionMemory {
  terminology: Array<{ canonical: string; aliases?: string[]; note?: string }>
  roles: Array<{ name: string; responsibilities?: string[] }>
  processNodes: Array<{ name: string; description?: string }>
  dataObjects: Array<{ name: string; keyFields?: string[]; description?: string }>
  interfaceNames: Array<{ name: string; direction?: 'inbound' | 'outbound' | 'internal' }>
}

export interface ModuleContextPack {
  documentTypeId: string
  projectId: string

  chapter: {
    chapterNodeId: string
    chapterTitle: string
    chapterSummary?: string
  }

  module: {
    moduleNodeId: string
    moduleTitle: string
    moduleGoal?: string
    moduleGuidance?: string
    moduleConstraints?: string[]
  }

  dimensions: {
    orderedDimensionIds: string[]
    completedDimensionIds: string[]
    currentDimensionId: string
    previousDimensionSummaries: Array<{
      dimensionId: string
      title: string
      summary: string
    }>
  }

  traceability: {
    requirementsText?: string
    scoringWeightsText?: string
    linkedRequirementIds?: string[]
  }

  decisionMemory: ModuleDecisionMemory

  globalContext: {
    documentGoal?: string
    documentGoalSource?: 'project-summary' | 'chapter-brief' | 'rfp-summary' | 'fallback'
    writingStyle?: string
    terminologySupplement?: string
    documentOutline?: string
  }
}
```

### 首发 Decision Memory 写入范围

- `terminology`
- `roles`
- `processNodes`
- `dataObjects`
- `interfaceNames`

### Dynamic Generation State Contract

`proposal.meta.json` 中的进行中状态需要从宽泛 map 收紧为稳定契约，建议首发定义：

```ts
export interface DynamicGenerationState {
  activeChapterLocatorKey?: string
  activeModuleId?: string
  activeDimensionId?: string
  moduleCursor?: number
  dimensionCursor?: number
  inFlightTasks?: Record<string, SkeletonTaskRouteKey>
  lastSystemBaselineVersionByChapter?: Record<string, string>
  updatedAt: string
}
```

约束：

- `confirmedSkeletonTrees` 以 `chapterLocatorKey` 作为顶层 key
- `moduleDecisionMemories` 以 `moduleNodeId` 作为顶层 key
- `userDefinedModulesByChapter` 以 `chapterLocatorKey` 作为顶层 key
- `dynamicGenerationState` 只承载进行中状态，不承载已完成业务结果

### Stable Anchor Strategy

动态骨架确认写入正文时，系统必须同时写入稳定锚点，首发格式统一为注释标记：

```md
### 功能设计
<!-- bw:skeleton-anchor:dim-user-management-functional -->
> 说明用户管理模块承担的能力范围、核心功能点与边界。
```

规则：

- 每个 `module` 和 `dimension` 节点都必须生成稳定 `anchorKey`
- 后续维度正文回填以 `anchorKey` 为定位依据，而不是只靠标题文本
- `src/shared/chapter-markdown.ts` 需要新增基于 `anchorKey` 的 leaf replacement helper
- heading 文本允许重复，`anchorKey` 不允许重复

### Task Routing Key Strategy

当前 `taskId -> ChapterHeadingLocator` 的单层路由无法支撑模块级、维度级任务。首发新增：

```ts
type SkeletonTaskRouteKey = `${chapterLocatorKey}:${moduleId}:${dimensionId}`
```

规则：

- renderer 侧状态索引以 `SkeletonTaskRouteKey` 为准
- `ChapterHeadingLocator` 继续作为“章节级容器定位”
- metadata 中的 `dynamicGenerationState` 必须保存：
  - `activeChapterLocatorKey`
  - `activeModuleId`
  - `activeDimensionId`
  - `inFlightTasks: Record<taskId, SkeletonTaskRouteKey>`

### Decision Memory Merge Policy

`ModuleDecisionMemory` 不是简单 append。首发必须定义合并规则：

- `terminology`
  - 以 `canonical` 为主键
  - 同义项追加到 `aliases`
- `roles`
  - 以 `name` 为主键
  - 新职责合并到 `responsibilities`
- `processNodes`
  - 以 `name` 为主键
  - 保留首个稳定定义，后续补充说明
- `dataObjects`
  - 以 `name` 为主键
  - 字段集合按去重合并
- `interfaceNames`
  - 以 `name + direction` 为主键
  - 方向冲突时记录 warning，不直接覆盖

冲突策略：

- 首发采用 `preserve-first-stable-value + append-compatible-details`
- 冲突值写入 warning 日志与任务结果摘要，禁止静默覆盖

### Baseline Refresh Policy

动态骨架首发必须显式重定义 baseline：

- 章节确认写入占位树后，立即把该章节当前文本升级为新的 baseline
- 每个维度成功回填后，再次推进该章节 baseline
- baseline 更新只由系统自动写入触发，人工修改仍然走现有 conflict detection
- `useChapterGeneration` 需要区分：
  - `system-baseline-advance`
  - `manual-edit-conflict`

### Source Attribution and Baseline Validation Policy

现有 source attribution 在章节终态替换后触发。首发调整为：

- 维度级写回时先更新正文，不立即做全章节 attribution
- 模块完成后触发一次模块级/章节级 attribution 与 baseline validation
- 模块未完成时，只允许记录局部 summary，不生成最终 attribution 结果

这样可以避免逐维度写入导致 attribution 高频抖动与重复覆盖。

### User-Defined Module Input

“用户补充模块”必须有显式入口，首发约束如下：

- 输入位置：第 2 步动态骨架预览弹窗
- 支持动作：
  - 追加模块
  - 重命名模块
  - 标记模块来源为 `user`
- metadata 需持久化：
  - `userDefinedModulesByChapter: Record<string, Array<{ id: string; title: string }>>`
  - 顶层 key 统一使用 `chapterLocatorKey`

系统在模块识别时优先读取此字段。

### Long-Running Task Policy

首发需显式约束长任务行为：

- checkpoint 粒度：每完成一个维度保存一次
- timeout 粒度：按单个维度任务设置，而不是整章节统一设置
- 恢复粒度：恢复到 `moduleCursor + dimensionCursor`
- 取消语义：取消当前维度后，保留已完成维度和模块决策记忆

整章任务恢复不应重新回放已完成维度。

## User Flow Redesign

### Step 2: 固定骨架确认页

用户看到：

- 售前技术方案固定章节树
- 动态章节的模块预览卡片
- 每个模块命中的默认维度标签
- 模块来源标识：`用户补充 / RFP / 模板`

用户确认：

- 模块是否成立
- 模块命名是否正确
- 默认维度覆盖是否完整
- 模块顺序是否合理

### Step 3: 当前模块生成页

用户看到：

- 当前模块标题
- 当前模块 8 维度队列
- 每个维度的状态、guidance、摘要
- 文档级、模块级、维度级进度

系统行为：

- 先锁定 `ModuleContextPack`
- 按默认顺序串行生成当前模块的维度
- 每完成一个维度，立刻回写正文、摘要、决策记忆
- 模块完成后再进入下一个模块

## Architecture Changes

### 1. Shared Types

新增或重构：

- `src/shared/document-type-profile.ts`
- `src/shared/dimension-catalog.ts`
- `src/shared/chapter-types.ts`
- `src/shared/models/proposal.ts`

目标：

- 让动态骨架树、文档类型配置、维度定义成为一等共享契约

### 2. Main Process Services

新增：

- `dynamic-skeleton-service`
  负责模块识别、维度裁剪、动态骨架树构建
- `context-pack-builder`
  负责构建 `ModuleContextPack`

改造：

- `chapter-generation-service`
  从“章节 skeleton + 扁平 batch”升级为“动态骨架树 + 模块内维度队列”
- `generate-agent`
  从“子章节 prompt”升级为“维度 prompt + 决策记忆回写”
- `batch-orchestration-manager`
  从“章节索引队列”升级为“moduleCursor + dimensionCursor”

### 3. Prompt Layer

首发仍可沿用 `generate-chapter.prompt.ts`，同时增加三个新入口函数：

- `generateDynamicSkeletonPrompt(profile, chapterContext)`
- `generateDimensionPrompt(contextPack, dimensionDefinition)`
- `summarizeDimensionForMemoryPrompt(dimensionResult)`

### 4. Persistence Layer

`proposal.meta.json` 新增或扩展字段建议：

- `confirmedSkeletonTrees`
- `documentTypeProfileId`
- `moduleDecisionMemories`
- `dynamicGenerationState`
- `userDefinedModulesByChapter`

正文 `proposal.md` 在确认阶段立即写入：

- 模块标题
- 维度标题
- 每个维度的 guidance blockquote

## Generation Strategy

### Dispatch Model

首发 dispatch 粒度如下：

1. 选定动态章节
2. 识别模块
3. 为每个模块匹配 8 维度中的适用维度
4. 写入正文占位
5. 按模块逐维度串行生成

### Context Backtracking Policy

每个维度生成时，prompt 输入统一包含：

- 文档目标
- 当前章节摘要
- 当前模块目标与 guidance
- 当前模块已完成维度摘要
- 当前模块决策记忆
- 需求与评分点映射
- 术语补充
- 文档大纲

### Decision Memory Update Policy

每个维度完成后，系统执行两件事：

1. 生成一段短摘要，写入 `previousDimensionSummaries`
2. 从正文中提取结构化决策，写入 `ModuleDecisionMemory`

## Migration Strategy

### Compatibility

- 现有 `confirmedSkeletons` 保持可读
- 首发新增树形字段后，旧项目可以按“旧扁平 skeleton 继续可读，新树形 skeleton 用于新生成”处理
- 当前 `batch-generate` IPC 通道可以保留名称，内部升级为维度队列执行

### Rollout

建议三阶段实施：

1. **Phase A: 契约落地**
   建立 `DocumentTypeProfile`、`DimensionCatalog`、`SkeletonNode`、`ModuleContextPack`

2. **Phase B: 主流程打通**
   动态骨架确认即写正文，模块维度队列执行，决策记忆回写

3. **Phase C: UI 与验收补齐**
   树形预览、模块级进度、维度级状态、失败恢复测试

## Risks and Controls

### Key Risks

- 模块识别过粗，导致一个模块内部主题过散
- 维度开启过多，导致模块树过重
- 决策记忆提取不稳，导致后续维度术语漂移
- 旧 metadata 与新树字段并存时出现兼容复杂度

### Controls

- 首发只覆盖售前技术方案白名单章节
- 首发树深固定为 `module -> dimension`
- 维度默认 8 个，按规则裁剪
- 决策记忆首发只写 5 类硬信息
- `anchorKey` 生成与解析统一走 shared helper
- `routeKey` 作为进行中任务唯一状态主键
- 失败时允许维度级重试，模块上下文保留

## Acceptance Criteria

### Functional

- 系统能够识别售前技术方案的动态章节白名单
- 系统能够基于 `用户补充 > RFP需求 > 模板章节` 识别模块
- 系统能够为每个模块生成 8 维度中的适用子集
- 用户能够在第 2 步追加模块并重命名模块，结果写入 metadata
- 用户确认动态骨架后，正文立即出现标题树与 guidance
- 系统能够按模块内维度顺序串行生成正文
- 后续维度 prompt 能读取前序维度摘要与模块决策记忆
- 模块完成后触发 attribution 与 baseline validation
- 用户能够看到文档级、模块级、维度级进度

### Technical

- 共享类型契约稳定并覆盖 main / renderer / shared
- `ModuleContextPack` 在每个维度生成前可复现构建
- 决策记忆能够持久化到 metadata
- `anchorKey` 能稳定定位维度正文回填
- `SkeletonTaskRouteKey` 能稳定支撑恢复、重试、取消
- `dynamicGenerationState` 能表达进行中模块和维度位置
- 旧 metadata 与进行中旧任务能够平滑迁移
- 现有章节替换与流式更新能力继续可用

### UX

- 第 2 步只要求结构审核
- 第 3 步只展开当前模块
- 当前维度状态和 guidance 始终可见
- 模块完成度一眼可读

## Implementation Plan

### Task Dependency Graph

```text
Task 1 (文档类型契约) ──┐
Task 2 (维度库契约) ─────┼──→ Task 4 (动态骨架服务)
Task 3 (树模型与 metadata) ─┘         │
                                      ├──→ Task 5 (上下文包构建)
                                      ├──→ Task 6 (prompt 改造)
                                      └──→ Task 7 (anchor / route key helper)

Task 3 (树模型与 metadata) ──→ Task 8 (agent / batch runner 演进)
Task 5 (上下文包构建) ─────────→ Task 8
Task 6 (prompt 改造) ─────────→ Task 8
Task 7 (anchor / route key helper) ─→ Task 9 (chapter-generation-service 主流程)
Task 8 ───────────────────────→ Task 9
Task 9 ──→ Task 10 (IPC / preload)
Task 9 ──→ Task 11 (renderer hook)
Task 11 ──→ Task 12 (DynamicSkeletonPreview + 用户补充模块 UI)
Task 11 ──→ Task 13 (OutlineHeadingElement / EditorView 集成)
Task 9 ──→ Task 14 (source attribution / baseline 适配)

Task 1-14 ──→ Task 15 (兼容迁移)
Task 1-15 ──→ Task 16 (shared/main 单测)
Task 11-14 ──→ Task 17 (renderer 单测)
Task 9-15 ──→ Task 18 (端到端链路验证)
```

### Tasks

- [ ] **Task 1: 新建 `DocumentTypeProfile` 契约与售前技术方案 profile** **[阻塞 Task 4, 9]**
  - Files:
    - `src/shared/document-type-profile.ts` _(new)_
  - Action:
    - 定义 `DocumentTypeProfile`、`FixedSectionProfile`、`DynamicChapterProfile`
    - 落地首发 `presales-technical-proposal` profile
    - 固化动态章节白名单、模块识别优先级、默认维度顺序、上下文回溯策略
    - 为每个动态章节配置 `decompositionStrategy`
  - Notes:
    - 首发只做一个 profile，结构设计允许后续扩展其他文档类型

- [ ] **Task 2: 新建 8 维度 `DimensionCatalog` 契约** **[阻塞 Task 4, 5, 6]**
  - Files:
    - `src/shared/dimension-catalog.ts` _(new)_
  - Action:
    - 定义 `DimensionDefinition`
    - 固化 8 个维度：`functional`、`process-flow`、`data-model`、`interface`、`ui`、`security`、`deployment`、`delivery-acceptance`
    - 为每个维度写入 `purpose`、`applyWhen`、`outputExpectation`、`guidanceTemplate`、`promptFocus`、`decisionMemoryWrites`
    - 增加售前技术方案默认开启与裁剪规则帮助函数
  - Notes:
    - 保持“通用底座 + 文档特化”的可扩展设计

- [ ] **Task 3: 将扁平 skeleton 模型升级为树模型，并扩展 metadata** **[阻塞 Task 4, 7, 8, 9, 11]**
  - Files:
    - `src/shared/chapter-types.ts`
    - `src/shared/models/proposal.ts`
    - `src/main/services/document-service.ts`
  - Action:
    - 新增 `SkeletonNodeKind`、`SkeletonNodeStatus`、`SkeletonNode`
    - 新增 `ModuleDecisionMemory`、`ModuleContextPack`
    - 新增 `SkeletonTaskRouteKey` 相关类型
    - 在 `ProposalMetadata` 中扩展：
      - `documentTypeProfileId?: string`
      - `confirmedSkeletonTrees?: Record<string, SkeletonNode[]>`
      - `moduleDecisionMemories?: Record<string, ModuleDecisionMemory>`
      - `dynamicGenerationState?: DynamicGenerationState`
      - `userDefinedModulesByChapter?: Record<string, Array<{ id: string; title: string }>>`
    - 为 metadata 读写增加 schema 校验与透传
  - Notes:
    - 旧 `confirmedSkeletons` 保持兼容读取，供迁移期 fallback 使用

- [ ] **Task 4: 新建 `dynamic-skeleton-service`，实现模块识别与维度裁剪** **[阻塞 Task 9]**
  - Files:
    - `src/main/services/dynamic-skeleton-service.ts` _(new)_
  - Action:
    - 输入：`projectId`、目标章节 locator、文档类型 profile、可选用户补充模块
    - 输出：`SkeletonNode[]` 树，形态固定为 `chapter -> module -> dimension`
    - 实现模块来源合并：
      - 用户补充模块优先
      - RFP 需求识别补齐
      - 模板经验兜底
    - 按 `decompositionStrategy` 区分：
      - `business-module`
      - `integration-domain`
      - `runtime-unit`
      - `delivery-work-package`
    - 实现维度匹配与裁剪
    - 为每个维度生成 guidance
  - Notes:
    - 首发不做复杂 NLP 平台，允许先使用现有 requirement/scoring/document outline 信号 + prompt 辅助识别

- [ ] **Task 5: 新建 `context-pack-builder`，统一模块上下文回溯输入** **[阻塞 Task 8, 9]**
  - Files:
    - `src/main/services/context-pack-builder.ts` _(new)_
  - Action:
    - 根据当前章节、模块节点、已完成维度、决策记忆、traceability、writingStyle 构建 `ModuleContextPack`
    - 提供两个入口：
      - `buildForDimensionGeneration(...)`
      - `buildForDecisionMemoryUpdate(...)`
    - 统一注入：
      - 文档目标
      - 章节摘要
      - 模块 guidance / constraints
      - 已完成维度摘要
      - 模块决策记忆
      - 需求与评分映射
      - 文档大纲 / 术语
    - 明确 `documentGoal` 取值优先级：
      - 项目概要/brief
      - 当前章节 brief
      - RFP 摘要
      - fallback 文本
  - Notes:
    - 这是“回溯上下文”从散字段升级到稳定结构的关键节点

- [ ] **Task 6: 重构 prompt 层，支持动态骨架与逐维度生成** **[阻塞 Task 8, 9]**
  - Files:
    - `src/main/prompts/generate-chapter.prompt.ts`
  - Action:
    - 新增 `generateDynamicSkeletonPrompt(profile, chapterContext)`
    - 新增 `generateDimensionPrompt(contextPack, dimensionDefinition)`
    - 新增 `summarizeDimensionForMemoryPrompt(dimensionResult)`
    - 让 prompt 明确区分：
      - 生成模块树
      - 生成单个维度正文
      - 提取/压缩决策记忆
  - Notes:
    - 保持所有 prompt 继续集中在 `src/main/prompts/`

- [ ] **Task 7: 新增 leaf replacement helper 与 route key helper** **[阻塞 Task 9, 11, 13]**
  - Files:
    - `src/shared/chapter-markdown.ts`
    - `src/shared/chapter-types.ts`
  - Action:
    - 新增基于 `anchorKey` 的正文 leaf replacement helper
    - 新增稳定 route key helper，避免 renderer 继续只用 `ChapterHeadingLocator`
    - 定义注释锚点格式与解析规则
  - Notes:
    - 这是“确认即写占位”和“逐维度回填”能否成立的前置条件

- [ ] **Task 8: 将 agent / batch runner 从“扁平子章节”升级为“模块内维度队列”** **[阻塞 Task 9]**
  - Files:
    - `src/main/services/agent-orchestrator/agents/generate-agent.ts`
    - `src/main/services/agent-orchestrator/batch-orchestration-manager.ts`
  - Action:
    - 把当前 `sectionIndex` 语义扩展为 `moduleCursor + dimensionCursor`
    - 批量执行单元改为“单个维度”
    - 每完成一个维度：
      - 返回正文块
      - 生成短摘要
      - 回写 `ModuleDecisionMemory`
    - 下一个维度读取 `previousDimensionSummaries + decisionMemory`
    - 定义维度级 checkpoint、timeout、取消与恢复语义
  - Notes:
    - 首发保持串行，不引入模块并行
    - 现有 progress payload 需要扩展到模块级、维度级信息

- [ ] **Task 9: 重构 `chapter-generation-service` 主流程，确认即写正文占位** **[阻塞 Task 10, 11, 18]**
  - Files:
    - `src/main/services/chapter-generation-service.ts`
  - Action:
    - 为售前技术方案动态章节新增“生成动态骨架树”入口
    - 确认动态骨架时同时执行：
      - 将树写入 `proposal.meta.json.confirmedSkeletonTrees`
      - 将模块标题 + 维度标题 + guidance blockquote + `anchorKey` 写入目标章节正文
    - 确认占位写入后立即刷新章节 baseline
    - 将现有 `batchGenerate()` 内部升级为“模块内维度串行生成”
    - 模块完成后更新模块级完成状态
  - Notes:
    - 正文占位阶段仍走章节级 replace，维度正文阶段改走 leaf replacement
    - 需要明确对进行中旧任务的保护策略

- [ ] **Task 10: 扩展 IPC / preload 契约，暴露动态骨架树接口** **[依赖 Task 9]**
  - Files:
    - `src/shared/ipc-types.ts`
    - `src/main/ipc/chapter-handlers.ts`
    - `src/preload/index.ts`
  - Action:
    - 扩展 skeleton 相关 IPC 的输入输出类型以承载树模型
    - 如有必要，新增更明确的通道，例如：
      - `chapter:dynamic-skeleton-generate`
      - `chapter:dynamic-skeleton-confirm`
      - 或在现有 `chapter:skeleton-*` 基础上平滑升级
    - preload 暴露对应 API
  - Notes:
    - 首发可优先保持旧通道名，内部换新语义，降低前端改造面

- [ ] **Task 11: 扩展 `useChapterGeneration`，增加模块级与维度级状态机** **[阻塞 Task 12, 13, 17]**
  - Files:
    - `src/renderer/src/modules/editor/hooks/useChapterGeneration.ts`
  - Action:
    - 状态从“章节 skeletonPlan + batchSections”升级为：
      - `skeletonTree`
      - `activeModuleId`
      - `activeDimensionId`
      - `moduleStatuses`
      - `dimensionStatuses`
      - `inFlightTasksByRouteKey`
    - 支持：
      - 动态骨架树加载
      - 确认后状态切换
      - 逐维度生成进度
      - 维度级重试
      - 模块级完成度统计
      - 章节 baseline 的系统推进
  - Notes:
    - 保留现有 retry / dismiss / conflict detection 语义，但状态主键必须切到 route key

- [ ] **Task 12: 新建 `DynamicSkeletonPreview` 组件，替代扁平 skeleton preview** **[依赖 Task 11]**
  - Files:
    - `src/renderer/src/modules/editor/components/DynamicSkeletonPreview.tsx` _(new)_
  - Action:
    - 展示三层结构：
      - 文档章节
      - 模块
      - 维度
    - 显示模块来源、维度 guidance、状态 tag、完成度
    - 增加“用户补充模块”入口：
      - 追加模块
      - 重命名模块
      - 标记来源为 `user`
    - 首发不做拖拽编辑，只做结构审核和确认入口
  - Notes:
    - 这是第 2 步“结构审核”的核心组件

- [ ] **Task 13: 将新预览和进度集成到 `OutlineHeadingElement` / `EditorView`** **[依赖 Task 7, 11, 12]**
  - Files:
    - `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx`
    - `src/renderer/src/modules/editor/components/EditorView.tsx`
  - Action:
    - “分治生成”按钮改为面向动态骨架树
    - 预览弹窗替换为 `DynamicSkeletonPreview`
    - `EditorView` 的流式回填逻辑调整为“当前维度正文回填”
    - 进度提示升级为文档级 / 模块级 / 维度级
  - Notes:
    - 当前模块展开，其余模块折叠

- [ ] **Task 14: 适配 source attribution / baseline validation 到模块完成语义** **[依赖 Task 9, 11, 13]**
  - Files:
    - `src/renderer/src/modules/editor/hooks/useSourceAttribution.ts`
    - `src/renderer/src/modules/editor/components/EditorView.tsx`
  - Action:
    - 将 attribution / baseline validation 的触发点从“章节终态替换”调整为“模块完成”
    - 防止逐维度写入导致 attribution 高频覆盖
    - 明确局部 summary 与最终 attribution 的边界
  - Notes:
    - 这是避免 metadata 抖动和归因失真的必要改造

- [ ] **Task 15: 增加兼容迁移逻辑，允许旧项目和平滑升级中的进行中任务共存** **[依赖 Task 3, 9]**
  - Files:
    - `src/main/services/chapter-generation-service.ts`
    - `src/main/services/document-service.ts`
    - 视实现情况补充 shared/model 文件
  - Action:
    - 旧 `confirmedSkeletons` 仍然可读
    - 新生成统一写 `confirmedSkeletonTrees`
    - 读取 metadata 时，优先用新字段，旧字段作为 fallback
    - 为旧 batch 任务恢复逻辑补兼容判断
    - 明确升级窗口内进行中任务的恢复与清理策略
  - Notes:
    - 目标是避免历史项目在首发后直接失效

- [ ] **Task 16: 补齐 shared / main 层单测** **[依赖 Task 1-10, 15]**
  - Files:
    - `tests/unit/main/services/dynamic-skeleton-service.test.ts` _(new)_
    - `tests/unit/main/services/context-pack-builder.test.ts` _(new)_
    - `tests/unit/main/services/chapter-generation-service.dynamic-skeleton.test.ts` _(new)_
    - `tests/unit/main/services/agent-orchestrator/agents/generate-agent.dynamic-dimension.test.ts` _(new)_
    - `tests/unit/main/prompts/generate-chapter.prompt.dynamic.test.ts` _(new)_
  - Action:
    - 覆盖模块识别、维度裁剪、上下文包构建、决策记忆回写、逐维度 prompt 输入
    - 验证确认即写正文占位与 `anchorKey`
    - 验证模块内维度顺序、route key、回溯输入、决策记忆合并
    - 验证章节特定拆解策略
    - 验证进行中旧任务兼容
- [ ] **Task 17: 补齐 renderer 层单测** **[依赖 Task 11-14]**
  - Files:
    - `tests/unit/renderer/modules/editor/hooks/useChapterGeneration.dynamic.test.ts` _(new or extend existing)_
    - `tests/unit/renderer/modules/editor/components/DynamicSkeletonPreview.test.tsx` _(new)_
    - `tests/unit/renderer/modules/editor/components/OutlineHeadingElement.dynamic.test.tsx` _(new or extend existing)_
  - Action:
    - 验证树结构状态展示
    - 验证确认后 UI 状态切换
    - 验证当前模块、当前维度进度展示
    - 验证维度级重试路径
    - 验证用户补充模块入口
    - 验证 route key 恢复
- [ ] **Task 18: 做首发链路验收与回归测试** **[依赖 Task 9-17]**
  - Files:
    - 视实现情况补充到 `tests/` 或 `_bmad-output/implementation-artifacts/` 验证报告
  - Action:
    - 跑通完整链路：
      - 动态章节识别
      - 模块树确认
      - 用户补充模块参与识别
      - 正文占位写入
      - 模块内逐维度生成
      - 决策记忆回带
      - `anchorKey` 精确回填
      - 文档级 / 模块级 / 维度级进度展示
    - 覆盖失败场景：
      - 模块识别为空
      - 某维度生成失败
      - metadata 仅有旧字段
      - 中途恢复任务
      - 进行中旧任务升级
  - Notes:
    - 输出一份简短 validation report 最有利于后续评审

## Recommended Next Steps

1. 以 Task 1-7 作为第一开发批次，先冻结共享契约、metadata 结构、anchor/route key helper
2. 以 Task 8-10 作为第二开发批次，先打通主流程和 IPC，再接 renderer 状态机
3. 以 Task 11-14 作为第三开发批次，完成预览 UI、进度呈现、attribution/baseline 适配
4. 以 Task 15-18 作为收尾批次，完成迁移、单测、回归和 validation report
