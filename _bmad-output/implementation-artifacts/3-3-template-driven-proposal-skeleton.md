# Story 3.3: 模板反向驱动方案骨架生成

Status: ready-for-dev

## Story

As a 售前工程师,
I want 选择模板后系统自动生成方案章节骨架,
So that 我不用从零搭建方案结构，评分权重高的章节自动标注为重点。

## Acceptance Criteria

### AC1: 模板列表加载与选择

- **Given** 进入"方案设计"SOP 阶段（`solution-design`）
- **When** 阶段视图加载
- **Then** 显示模板选择界面，列出可用模板（名称、描述、章节数）
- **And** 支持从内置骨架模板（`resources/templates/*.template.json`）和公司自定义骨架模板（`company-data/templates/skeletons/*.template.json`）加载
- **And** 选择一个模板后，显示该模板的章节结构预览（只读、标题层级缩进展示），再允许点击"生成骨架"
- [Source: epics.md Story 3.3 AC1, FR19, UX §流程1 阶段3]

### AC2: 方案骨架自动生成

- **Given** 已选择模板并点击"生成骨架"
- **When** 系统生成骨架
- **Then** 基于模板章节结构生成方案骨架 Markdown（H1-H4 标题 + 章节引导占位文本）
- **And** 骨架写入项目的 `proposal.md` 并持久化
- **And** 如果项目已有评分模型（复用 Story 2.5 已落地的分析模块数据），自动匹配评分权重到章节
- **And** 权重数据写入 `proposal.meta.json` 的 `sectionWeights` 字段
- **And** 主进程返回结构化骨架树（含权重元数据），供骨架编辑器直接渲染与后续编辑
- [Source: epics.md Story 3.3 AC2, FR19]

### AC3: 评分权重标注与重点章节标记

- **Given** 方案骨架已生成且项目有评分模型
- **When** 查看骨架章节列表
- **Then** 每个匹配到评分标准的章节标注展示百分比（如 `30%`，由评分模型的 0-1 权重或子项分值换算而来）
- **And** 展示百分比 ≥15% 的章节显示红色"重点投入" Tag
- **And** 无评分模型时不显示权重标注，仅显示章节结构
- [Source: epics.md Story 3.3 AC3, FR19]

### AC4: 骨架结构用户调整

- **Given** 骨架已生成并进入骨架编辑模式
- **When** 用户调整大纲结构
- **Then** 可以新增章节（同级或子级，通过节点操作菜单选择）
- **And** 可以删除章节（带二次确认）
- **And** 可以拖拽重排章节顺序
- **And** 可以双击标题进入行内编辑、重命名章节
- **And** 修改操作实时同步到 `proposal.md`，并同步刷新 `proposal.meta.json` 中的 `sectionWeights/templateId`
- [Source: epics.md Story 3.3 AC4]

### AC5: 已有方案内容的安全处理

- **Given** 项目已有非空 `proposal.md`
- **When** 进入方案设计阶段
- **Then** 显示已有方案结构摘要，并提供"继续撰写"与"重新选择模板"两个选项
- **And** 点击重新选择时，Modal 确认"重新生成骨架将覆盖当前方案内容，是否继续？"
- **And** 仅确认后才执行覆盖，且主进程在 `overwriteExisting !== true` 时必须拒绝覆盖非空方案

## Tasks / Subtasks

- [ ] Task 1: 模板数据类型定义 (AC: 1, 2, 3)
  - [ ] 1.1 创建 `src/shared/template-types.ts`：
    ```typescript
    /** 模板章节定义 */
    export interface TemplateSection {
      id: string                    // 如 "s1", "s1.1"
      title: string                 // 章节标题
      level: 1 | 2 | 3 | 4         // 标题层级
      guidanceText?: string         // 章节引导提示（写入 proposal.md 作为占位）
      children: TemplateSection[]
    }

    /** 模板摘要（列表展示用） */
    export interface TemplateSummary {
      id: string
      name: string
      description: string
      sectionCount: number          // 一级章节数
      source: 'built-in' | 'company'
    }

    /** 模板完整定义 */
    export interface ProposalTemplate {
      id: string
      name: string
      description: string
      version: string
      sections: TemplateSection[]
      source: 'built-in' | 'company'
    }

    /** 骨架章节（模板 + 评分权重合并后） */
    export interface SkeletonSection {
      id: string
      title: string
      level: 1 | 2 | 3 | 4
      guidanceText?: string
      weightPercent?: number         // 0-100 展示百分比，由评分模型换算而来
      isKeyFocus: boolean            // weightPercent >= 15
      scoringCriterionId?: string    // 关联的评分标准 ID
      scoringCriterionName?: string
      scoringSubItemId?: string
      scoringSubItemName?: string
      children: SkeletonSection[]
    }

    /** 持久化到 proposal.meta.json 的权重映射 */
    export interface SectionWeightEntry {
      sectionId: string              // 稳定骨架节点 ID，避免标题重名/改名后丢失映射
      sectionTitle: string
      weightPercent: number
      isKeyFocus: boolean
      scoringCriterionId?: string
      scoringCriterionName?: string
      scoringSubItemId?: string
      scoringSubItemName?: string
    }

    // --- IPC 输入/输出类型 ---
    export interface GenerateSkeletonInput {
      projectId: string
      templateId: string
      overwriteExisting?: boolean
    }

    export interface GenerateSkeletonOutput {
      skeleton: SkeletonSection[]
      markdown: string
      sectionWeights: SectionWeightEntry[]
      sectionCount: number           // 一级章节数（与 UI 的“8 个章节”统计一致）
      lastSavedAt: string
    }

    export interface PersistSkeletonInput {
      projectId: string
      templateId: string
      skeleton: SkeletonSection[]
    }

    export interface PersistSkeletonOutput {
      markdown: string
      sectionWeights: SectionWeightEntry[]
      sectionCount: number
      lastSavedAt: string
    }
    ```
  - [ ] 1.2 更新 `src/shared/ipc-types.ts`：
    - 在 `IpcChannels` 常量中新增：
      ```typescript
      TEMPLATE_LIST: 'template:list',
      TEMPLATE_GET: 'template:get',
      TEMPLATE_GENERATE_SKELETON: 'template:generate-skeleton',
      TEMPLATE_PERSIST_SKELETON: 'template:persist-skeleton',
      ```
    - 在 `IpcChannelMap` 类型中新增：
      ```typescript
      'template:list': { input: void; output: TemplateSummary[] }
      'template:get': { input: { templateId: string }; output: ProposalTemplate }
      'template:generate-skeleton': { input: GenerateSkeletonInput; output: GenerateSkeletonOutput }
      'template:persist-skeleton': { input: PersistSkeletonInput; output: PersistSkeletonOutput }
      ```
    - 在文件顶部导入 template-types 中需要的类型
  - [ ] 1.3 扩展 `src/shared/models/proposal.ts` 的 `ProposalMetadata`：
    ```typescript
    export interface ProposalMetadata {
      version: string
      projectId: string
      annotations: []
      scores: []
      sectionWeights?: SectionWeightEntry[]  // NEW
      templateId?: string                    // NEW: 使用的模板 ID
      lastSavedAt: string
    }
    ```
    - 导入 `SectionWeightEntry` 从 `@shared/template-types`
  - [ ] 1.4 扩展 `src/main/services/document-service.ts` 与 `tests/unit/main/services/document-service.test.ts`：
    - `buildDefaultMetadata()` / `normalizeMetadata()` / `parseMetadata()` 需要保留并校验 `sectionWeights`、`templateId`
    - `save()` / `saveSync()` 更新 `lastSavedAt` 时不得丢失既有 `sectionWeights/templateId`
    - 新增回归测试：已有 `sectionWeights/templateId` 的 metadata 经普通文档保存后仍被保留

- [ ] Task 2: 内置默认模板 (AC: 1)
  - [ ] 2.1 创建目录 `resources/templates/`
  - [ ] 2.2 创建 `resources/templates/standard-technical.template.json`：
    ```json
    {
      "id": "standard-technical",
      "name": "标准技术方案模板",
      "description": "适用于一般 IT 系统集成项目的标准技术方案格式，涵盖需求理解、方案设计、实施计划等核心章节",
      "version": "1.0",
      "sections": [
        {
          "id": "s1", "title": "项目概述", "level": 1, "guidanceText": "概述项目背景、目标和范围。",
          "children": [
            { "id": "s1.1", "title": "项目背景", "level": 2, "guidanceText": "阐述项目产生的背景和驱动因素。", "children": [] },
            { "id": "s1.2", "title": "项目目标", "level": 2, "guidanceText": "明确项目的具体目标和预期成果。", "children": [] },
            { "id": "s1.3", "title": "项目范围", "level": 2, "guidanceText": "界定项目的边界和交付物。", "children": [] }
          ]
        },
        {
          "id": "s2", "title": "需求理解与分析", "level": 1, "guidanceText": "展示对甲方需求的深入理解。",
          "children": [
            { "id": "s2.1", "title": "业务需求分析", "level": 2, "guidanceText": "分析甲方的业务需求和痛点。", "children": [] },
            { "id": "s2.2", "title": "技术需求分析", "level": 2, "guidanceText": "分析技术层面的需求和约束。", "children": [] },
            { "id": "s2.3", "title": "需求响应矩阵", "level": 2, "guidanceText": "逐项响应招标文件中的需求条目。", "children": [] }
          ]
        },
        {
          "id": "s3", "title": "系统架构设计", "level": 1, "guidanceText": "详细描述系统的整体架构设计方案。",
          "children": [
            { "id": "s3.1", "title": "总体架构", "level": 2, "guidanceText": "描述系统的分层架构和技术选型。", "children": [] },
            { "id": "s3.2", "title": "网络架构", "level": 2, "guidanceText": "描述网络拓扑和部署架构。", "children": [] },
            { "id": "s3.3", "title": "安全架构", "level": 2, "guidanceText": "描述信息安全策略和防护措施。", "children": [] },
            { "id": "s3.4", "title": "数据架构", "level": 2, "guidanceText": "描述数据模型、存储和流转方案。", "children": [] }
          ]
        },
        {
          "id": "s4", "title": "功能设计", "level": 1, "guidanceText": "按模块描述系统的功能设计方案。",
          "children": [
            { "id": "s4.1", "title": "功能模块总览", "level": 2, "guidanceText": "列出系统主要功能模块及其关系。", "children": [] },
            { "id": "s4.2", "title": "核心功能详设", "level": 2, "guidanceText": "对核心功能模块进行详细设计描述。", "children": [] }
          ]
        },
        {
          "id": "s5", "title": "项目实施方案", "level": 1, "guidanceText": "描述项目的实施策略和计划。",
          "children": [
            { "id": "s5.1", "title": "实施方法论", "level": 2, "guidanceText": "说明采用的项目管理方法和实施流程。", "children": [] },
            { "id": "s5.2", "title": "实施计划与里程碑", "level": 2, "guidanceText": "制定详细的实施时间表和关键里程碑。", "children": [] },
            { "id": "s5.3", "title": "风险管理", "level": 2, "guidanceText": "识别项目风险并制定应对措施。", "children": [] }
          ]
        },
        {
          "id": "s6", "title": "项目管理", "level": 1, "guidanceText": "描述项目的管理体系和保障措施。",
          "children": [
            { "id": "s6.1", "title": "组织架构与人员配置", "level": 2, "guidanceText": "描述项目团队组织和关键角色。", "children": [] },
            { "id": "s6.2", "title": "质量管理", "level": 2, "guidanceText": "说明质量保障体系和质量控制措施。", "children": [] },
            { "id": "s6.3", "title": "沟通与协调机制", "level": 2, "guidanceText": "说明项目沟通渠道和协调流程。", "children": [] }
          ]
        },
        {
          "id": "s7", "title": "售后服务与技术支持", "level": 1, "guidanceText": "描述交付后的运维和技术支持方案。",
          "children": [
            { "id": "s7.1", "title": "服务体系", "level": 2, "guidanceText": "说明售后服务组织架构和响应机制。", "children": [] },
            { "id": "s7.2", "title": "培训方案", "level": 2, "guidanceText": "制定用户培训计划和内容。", "children": [] },
            { "id": "s7.3", "title": "质保与维护", "level": 2, "guidanceText": "明确质保期限和维护承诺。", "children": [] }
          ]
        },
        {
          "id": "s8", "title": "案例与资质", "level": 1, "guidanceText": "展示公司相关项目经验和资质。",
          "children": [
            { "id": "s8.1", "title": "类似项目案例", "level": 2, "guidanceText": "列举与本项目相关的成功案例。", "children": [] },
            { "id": "s8.2", "title": "公司资质与认证", "level": 2, "guidanceText": "列出公司相关资质证书和荣誉。", "children": [] }
          ]
        }
      ]
    }
    ```
  - [ ] 2.3 创建 `resources/templates/standard-military.template.json`（军工/政务简化模板，章节名称使用更正式的措辞），一级章节数与 UX 原型对齐为 10 个，并增加"保密管理"、"国产化方案"等军工常见章节
  - [ ] 2.4 创建 `company-data/templates/skeletons/.gitkeep`，为本地开发提供公司自定义骨架模板的约定目录
  - [ ] 2.5 创建 `tests/fixtures/template-samples/`：放置测试用的简化模板 JSON 文件

- [ ] Task 3: 模板服务（主进程） (AC: 1, 2, 3)
  - [ ] 3.1 创建 `src/main/services/template-service.ts`：
    ```typescript
    import { createLogger } from '@main/utils/logger'
    import type {
      TemplateSummary,
      ProposalTemplate,
      GenerateSkeletonInput,
      GenerateSkeletonOutput,
      PersistSkeletonInput,
      PersistSkeletonOutput,
      SkeletonSection,
      SectionWeightEntry,
    } from '@shared/template-types'
    import type { ScoringModel, ScoringCriterion, ScoringSubItem } from '@shared/analysis-types'

    class TemplateService {
      /** 列出所有可用模板（内置 + 公司） */
      async listTemplates(): Promise<TemplateSummary[]>

      /** 加载完整模板定义 */
      async getTemplate(templateId: string): Promise<ProposalTemplate>

      /** 首次生成方案骨架并持久化 proposal.md + proposal.meta.json */
      async generateSkeleton(input: GenerateSkeletonInput): Promise<GenerateSkeletonOutput>

      /** 骨架编辑后的增量持久化（刷新 markdown + sectionWeights） */
      async persistSkeleton(input: PersistSkeletonInput): Promise<PersistSkeletonOutput>
    }
    ```
  - [ ] 3.2 `listTemplates()` 实现逻辑：
    - 扫描 `resources/templates/*.template.json`（内置模板，使用 Electron `app.getAppPath()` 或 `__dirname` 定位）
    - 扫描公司模板目录 `company-data/templates/skeletons/*.template.json`
    - 将公司模板目录解析封装到 `resolveCompanyTemplateDir()`，fallback 顺序固定为：
      1. `path.join(app.getAppPath(), 'company-data', 'templates', 'skeletons')`
      2. `path.join(app.getPath('userData'), 'company-data', 'templates', 'skeletons')`
      - 使用第一个存在的目录；**不要**把 `app.getPath('userData')` 写死为唯一来源
    - 读取每个 JSON 文件的 id/name/description，统计一级 sections 数量作为 sectionCount
    - 合并去重（公司模板同 ID 覆盖内置模板）
    - 如果 `company-data/templates/skeletons/` 目录不存在，静默跳过（不报错）
  - [ ] 3.3 `getTemplate()` 实现逻辑：
    - 先在公司模板目录查找，再在内置模板目录查找
    - 找不到时抛出 `BidWiseError`（code: `TEMPLATE_NOT_FOUND`）
    - 返回完整 `ProposalTemplate`，`source` 字段标记来源
  - [ ] 3.4 `generateSkeleton()` 实现逻辑：
    - 加载模板定义
    - 读取当前 `proposal.md`；若内容非空且 `overwriteExisting !== true`，抛出 `BidWiseError(ErrorCode.SKELETON_OVERWRITE_REQUIRED, ...)`
    - **主进程内直接调用** `scoringExtractor.getScoringModel(projectId)`，**不要**从主进程去调用 `analysis:*` IPC
    - 调用 `applyWeights(template.sections, scoringModel)` 生成结构化 `SkeletonSection[]`
    - 调用 `sectionsToMarkdown(skeleton)` 生成 Markdown
    - 调用 `documentService.save()` 写入 `proposal.md`
    - 调用内部 metadata 持久化 helper，把 `sectionWeights`、`templateId` 写入 `proposal.meta.json`
    - 返回 `{ skeleton, markdown, sectionWeights, sectionCount, lastSavedAt }`
  - [ ] 3.5 评分权重匹配与骨架装配 helper `applyWeights()`：
    - 先把评分模型展平成候选项：
      - criterion 级候选：`label = criterion.category`，`weightPercent = Math.round(criterion.weight * 100)`
      - subItem 级候选：`label = subItem.name`，`weightPercent = Math.round((subItem.maxScore / scoringModel.totalScore) * 100)`
    - 遍历模板一级章节，优先与 `ScoringSubItem.name` 匹配，再与 `ScoringCriterion.category` 匹配
    - 匹配策略：精确相等 > 包含匹配 > 关键词交集；并保留命中的 criterion/subItem ID 与名称
    - 匹配成功则赋予 `weightPercent`，`isKeyFocus = weightPercent >= 15`
    - 未匹配的章节 `weightPercent = undefined`，`isKeyFocus = false`
    - 评分模型为 null 时跳过匹配，所有章节无权重
  - [ ] 3.6 Markdown 生成 `sectionsToMarkdown()`：
    - 递归遍历 sections，生成 Markdown 标题（`#` ~ `####`）
    - 每个章节标题下方输出引导文本（如果有）：使用 `> ` blockquote 前缀
    - 在引导文本后空一行，为后续 AI 内容生成预留位置
    - 示例输出：
      ```markdown
      # 项目概述

      > 概述项目背景、目标和范围。

      ## 项目背景

      > 阐述项目产生的背景和驱动因素。

      ```
  - [ ] 3.7 `persistSkeleton()` 实现逻辑：
    - 输入为 renderer 当前编辑后的 `SkeletonSection[]`
    - 重新生成 markdown + `sectionWeights`
    - 持久化 `proposal.md` 与 `proposal.meta.json`
    - 返回 `{ markdown, sectionWeights, sectionCount, lastSavedAt }`
  - [ ] 3.8 错误码：在 `src/shared/constants.ts` 的 `ErrorCode` 中新增 `TEMPLATE_NOT_FOUND`、`SKELETON_GENERATION_FAILED`、`SKELETON_OVERWRITE_REQUIRED`

- [ ] Task 4: IPC 处理器与预加载 (AC: 1, 2, 3)
  - [ ] 4.1 创建 `src/main/ipc/template-handlers.ts`：
    ```typescript
    import { createIpcHandler } from './create-handler'
    import { templateService } from '@main/services/template-service'

    export function registerTemplateHandlers(): void {
      createIpcHandler('template:list', () => templateService.listTemplates())
      createIpcHandler('template:get', ({ templateId }) => templateService.getTemplate(templateId))
      createIpcHandler('template:generate-skeleton', (input) =>
        templateService.generateSkeleton(input)
      )
      createIpcHandler('template:persist-skeleton', (input) =>
        templateService.persistSkeleton(input)
      )
    }
    ```
    - 遵循现有 handler 的薄分发模式（无业务逻辑）
    - 直接复用仓库现有的 `src/main/ipc/create-handler.ts`
  - [ ] 4.2 在 `src/main/ipc/index.ts` 中注册 `registerTemplateHandlers()`
  - [ ] 4.3 在 `src/preload/index.ts` 中新增预加载方法：
    ```typescript
    templateList: (input: IpcChannelMap['template:list']['input']) =>
      ipcRenderer.invoke(IpcChannels.TEMPLATE_LIST, input),
    templateGet: (input: IpcChannelMap['template:get']['input']) =>
      ipcRenderer.invoke(IpcChannels.TEMPLATE_GET, input),
    templateGenerateSkeleton: (input: IpcChannelMap['template:generate-skeleton']['input']) =>
      ipcRenderer.invoke(IpcChannels.TEMPLATE_GENERATE_SKELETON, input),
    templatePersistSkeleton: (input: IpcChannelMap['template:persist-skeleton']['input']) =>
      ipcRenderer.invoke(IpcChannels.TEMPLATE_PERSIST_SKELETON, input),
    ```
    - 遵循现有的命名模式：channel `template:generate-skeleton` → method `templateGenerateSkeleton`
    - 新增 `template:persist-skeleton` → `templatePersistSkeleton`
  - [ ] 4.4 验证 `PreloadApi` 类型自动推导正确

- [ ] Task 5: 模板选择 UI 组件 (AC: 1)
  - [ ] 5.1 创建 `src/renderer/src/modules/editor/components/TemplateSelector.tsx`：
    ```typescript
    import { Card, Row, Col, Tag, Empty, Spin, Typography, Button, Tree } from 'antd'
    import { FileTextOutlined, BankOutlined } from '@ant-design/icons'
    import type { ProposalTemplate, TemplateSummary } from '@shared/template-types'

    interface TemplateSelectorProps {
      templates: TemplateSummary[]
      loading: boolean
      selectedId: string | null
      previewTemplate: ProposalTemplate | null
      previewLoading: boolean
      generating: boolean
      onSelect: (templateId: string) => void
      onGenerate: () => void
    }

    export function TemplateSelector({
      templates, loading, selectedId, previewTemplate, previewLoading, generating, onSelect, onGenerate
    }: TemplateSelectorProps): React.JSX.Element
    ```
  - [ ] 5.2 UI 布局：
    - 顶部标题："选择方案模板"（H3）
    - 主体为两栏：左侧卡片网格（`Row` + `Col`，每行 2-3 张卡片，响应式），右侧模板章节预览面板；窄屏时预览面板堆叠到卡片下方
    - 每张卡片显示：模板名称（标题）、描述文本、`{n} 个章节` 标签、来源标签（内置/公司）
    - 选中卡片高亮边框（`border-color: var(--color-brand)`）
    - 右侧预览面板显示所选模板的 H1-H4 章节结构（只读缩进列表 / `Tree`），未选择时显示提示"选择模板后可预览章节结构"
    - 加载态：`Spin` 居中
    - 空列表：`Empty` 组件 + 提示"暂无可用模板"
    - 底部右侧固定"生成骨架"按钮，未选模板时 disabled，生成中显示 loading
  - [ ] 5.3 卡片样式：
    - 使用 Ant Design `Card` 的 `hoverable` 属性
    - 来源标签：内置模板蓝色 Tag，公司模板绿色 Tag
    - 卡片 cursor: pointer，点击整张卡片触发 `onSelect`

- [ ] Task 6: 骨架编辑器 UI 组件 (AC: 2, 3, 4)
  - [ ] 6.1 创建 `src/renderer/src/modules/editor/components/SkeletonEditor.tsx`：
    ```typescript
    import { Tree, Tag, Button, Input, Modal, Tooltip } from 'antd'
    import type { SkeletonSection } from '@shared/template-types'

    interface SkeletonEditorProps {
      skeleton: SkeletonSection[]
      onUpdate: (updated: SkeletonSection[]) => void
      onConfirm: () => void
      onRegenerate: () => void
    }

    export function SkeletonEditor({
      skeleton, onUpdate, onConfirm, onRegenerate
    }: SkeletonEditorProps): React.JSX.Element
    ```
  - [ ] 6.2 Tree 渲染：
    - 使用 Ant Design `Tree` 的 `draggable` 属性支持拖拽排序
    - 每个节点的 `title` 为自定义 ReactNode：
      - 标题文本（可双击进入编辑模式，使用 `Input` 行内编辑）
      - 权重 Badge：有权重时显示 `Tag` 如 `30%`，颜色根据 `weightPercent` 梯度（≥15% 红色，5-14% 橙色，<5% 默认）
      - 重点投入标记：`isKeyFocus` 为 true 时显示红色"重点投入" `Tag`
      - 操作按钮组（hover 时显示）：一个“新增”入口（点击后出现"添加同级章节" / "添加子章节"菜单）+ 删除
    - `showLine` 显示层级连接线
    - 使用受控 `expandedKeys` 维持当前展开状态；首次渲染默认全部展开，新增父/子节点后确保新节点仍可见，**不要**依赖 `defaultExpandAll`
  - [ ] 6.3 拖拽排序：
    - `Tree` 的 `onDrop` 回调处理节点移动
    - 更新 skeleton 数据结构后调用 `onUpdate`
    - 通过 `allowDrop` / `onDrop` 联合限制最大层级为 4（H4），拖拽到超过 4 层时阻止
  - [ ] 6.4 章节增删改：
    - 新增同级：在目标节点后方插入空白章节（默认标题"新章节"，自动进入编辑模式）
    - 新增子级：在目标节点 children 末尾插入空白章节（若当前已是 H4 则禁用）
    - 删除：`Modal.confirm` 二次确认 "确定删除「{title}」及其所有子章节？"
    - 重命名：双击标题 → `Input` 替换 → 回车/失焦确认 → Escape 取消
    - 每次操作后调用 `onUpdate(updatedSkeleton)`
  - [ ] 6.5 底部操作栏：
    - 左侧："重新选择模板" `Button`（text 类型，触发 `onRegenerate`）
    - 右侧："确认骨架，开始撰写" `Button`（primary 类型，触发 `onConfirm`）
    - 统计信息：`{totalSections} 个章节，{keyFocusCount} 个重点章节`

- [ ] Task 7: 方案设计阶段视图 (AC: 1, 2, 3, 4, 5)
  - [ ] 7.1 创建 `src/renderer/src/modules/editor/components/SolutionDesignView.tsx`：
    ```typescript
    interface SolutionDesignViewProps {
      projectId: string
      onEnterProposalWriting: () => void
    }

    export function SolutionDesignView({
      projectId,
      onEnterProposalWriting,
    }: SolutionDesignViewProps): React.JSX.Element
    ```
  - [ ] 7.2 内部状态管理（使用 `useState`/`useReducer`，不创建新 store）：
    ```typescript
    type ViewPhase = 'checking' | 'select-template' | 'edit-skeleton' | 'has-content'

    // checking: 初始加载，检查 proposal.md 是否有内容
    // select-template: 模板选择界面
    // edit-skeleton: 骨架编辑界面
    // has-content: 已有方案内容，显示摘要 + 重新选择选项
    ```
  - [ ] 7.3 初始化流程：
    - 调用 `documentStore.loadDocument(projectId)` 载入当前 `proposal.md` 到全局 store（这样左侧大纲和状态栏字数能与 `solution-design` 同步）
    - 以 `documentStore.content.trim()` 判断是否已有内容
    - 有内容 → phase = `has-content`，提取 H1 标题列表作为摘要
    - 无内容 → phase = `select-template`，调用 `window.api.templateList()` 加载模板
  - [ ] 7.4 `has-content` 视图：
    - 显示现有方案结构摘要（一级标题列表）
    - "继续撰写" Button（primary）→ 调用 `onEnterProposalWriting()`
    - "重新选择模板" Button（default）→ Modal 确认后进入 `select-template`
  - [ ] 7.5 `select-template` → `edit-skeleton` 流程：
    - 选择模板后调用 `window.api.templateGet({ templateId })` 获取完整模板并渲染只读预览
    - 点击"生成骨架"时调用 `window.api.templateGenerateSkeleton({ projectId, templateId, overwriteExisting })`
    - 使用返回的 `skeleton` 进入 `edit-skeleton` 阶段
    - 成功后调用 `documentStore.updateContent(markdown, projectId, { scheduleSave: false })`，让左侧大纲/字数立即反映刚生成的骨架；**不要**立刻再走一次 `documentStore.saveDocument()`
  - [ ] 7.6 `edit-skeleton` 中的编辑操作：
    - 每次 `onUpdate` 调用时，先将 skeleton 转换为 Markdown 并通过 `documentStore.updateContent(markdown, projectId, { scheduleSave: false })` 更新 renderer 内存态（供大纲/字数实时刷新）
    - 同时以 1 秒 debounce 调用 `window.api.templatePersistSkeleton({ projectId, templateId, skeleton })`，确保 `proposal.md` 与 `proposal.meta.json.sectionWeights` 一起持久化；**不要**只依赖 `documentStore.saveDocument()`，因为它无法刷新 `sectionWeights`
    - `onConfirm` 时：等待任何 pending 的 `templatePersistSkeleton` 完成，然后调用 `onEnterProposalWriting()`
  - [ ] 7.7 错误处理：
    - 模板加载失败：显示 `Alert` + 重试按钮
    - 骨架生成失败：显示 `Alert` + 重试按钮
    - 非空 proposal 且未带 `overwriteExisting` 时：展示确认文案并在确认后重试生成
    - 使用 `BidWiseError` 错误码展示友好中文消息

- [ ] Task 8: 集成到工作空间 (AC: 1, 2, 5)
  - [ ] 8.1 修改 `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`：
    - 在阶段分支中新增 `solution-design` 分支：
      ```typescript
      const isSolutionDesign = currentStageKey === 'solution-design' && Boolean(projectId)

      center={
        currentStageKey === 'requirements-analysis' && projectId ? (
          <AnalysisView projectId={projectId} />
        ) : isSolutionDesign && projectId ? (
          <SolutionDesignView
            projectId={projectId}
            onEnterProposalWriting={() => navigateToStage('proposal-writing')}
          />
        ) : isProposalWriting && projectId ? (
          <EditorView projectId={projectId} />
        ) : (
          <StageGuidePlaceholder stageKey={currentStageKey} />
        )
      }
      ```
    - 添加 `SolutionDesignView` 导入
  - [ ] 8.2 大纲面板在 `solution-design` 阶段的行为：
    - `solution-design` 阶段当 `documentStore.content` 有内容时，左侧面板显示只读骨架大纲预览（从现有 `useDocumentOutline(documentStore.content)` 派生）
    - 复用现有 `DocumentOutlineTree` 时，需要做只读处理（例如屏蔽节点 click/select 但保留容器滚动），避免出现“可点击但没有编辑器可滚动”的死交互
    - 修改 outline 计算条件：
      ```typescript
      const showOutline = (isProposalWriting || isSolutionDesign) && Boolean(projectId)
      const outline = useDocumentOutline(showOutline ? documentContent : '')
      ```
    - `proposal-writing` 阶段保持原有点击滚动行为；`solution-design` 阶段不接 `scrollToHeading`
  - [ ] 8.3 状态栏：solution-design 阶段显示字数统计（与 UX 原型一致）
    ```typescript
    const showWordCount = isProposalWriting || isSolutionDesign
    // ...
    wordCount={showWordCount ? wordCount : undefined}
    ```

- [ ] Task 9: 单元测试 (AC: 全部)
  - [ ] 9.1 `tests/unit/main/services/template-service.test.ts`：
    - 列出内置模板返回正确摘要信息
    - 公司模板目录不存在时不报错
    - 加载指定模板返回完整定义
    - 模板不存在时抛出 TEMPLATE_NOT_FOUND 错误
    - 非空 proposal 且未声明 `overwriteExisting` 时抛出 `SKELETON_OVERWRITE_REQUIRED`
    - 生成骨架返回正确 `skeleton + markdown + sectionWeights`
    - 有评分模型时权重能同时匹配 `criterion.category` 与 `subItems.name`
    - 无评分模型时所有章节无权重
    - 高权重章节（≥15%）标记为 isKeyFocus
    - `persistSkeleton()` 会同步刷新 markdown 与 metadata
  - [ ] 9.2 `tests/unit/main/ipc/template-handlers.test.ts`：
    - template:list 调用 templateService.listTemplates
    - template:get 调用 templateService.getTemplate
    - template:generate-skeleton 调用 templateService.generateSkeleton
    - template:persist-skeleton 调用 templateService.persistSkeleton
    - 错误时返回标准 error response
  - [ ] 9.3 `tests/unit/renderer/modules/editor/components/TemplateSelector.test.tsx`：
    - 渲染模板卡片列表
    - 点击卡片触发 onSelect
    - 选中卡片显示高亮边框
    - 选中模板后显示章节结构预览
    - 加载态显示 Spin
    - 空列表显示 Empty
  - [ ] 9.4 `tests/unit/renderer/modules/editor/components/SkeletonEditor.test.tsx`：
    - 渲染骨架树结构
    - 权重 Tag 正确显示
    - 重点投入 Tag 在 isKeyFocus 时显示
    - 新增菜单同时支持"添加同级章节"和"添加子章节"
    - 删除节点触发确认弹窗
    - 双击标题进入编辑模式
    - 确认按钮触发 onConfirm
  - [ ] 9.5 `tests/unit/renderer/modules/editor/components/SolutionDesignView.test.tsx`：
    - 无内容时显示模板选择界面
    - 有内容时显示已有方案摘要
    - 选择模板后显示章节预览
    - 选择模板后进入骨架编辑
    - 重新选择模板时弹出确认对话框
    - "继续撰写" / "确认骨架，开始撰写" 触发 `onEnterProposalWriting`
  - [ ] 9.6 `tests/unit/renderer/project/ProjectWorkspace.test.tsx`（增量）：
    - solution-design 阶段渲染 SolutionDesignView
    - solution-design 阶段当 `documentStore.content` 非空时展示只读 outline 与字数统计
    - 其他阶段行为不变（回归验证）

- [ ] Task 10: 集成验证 (AC: 全部)
  - [ ] 10.1 `pnpm lint && pnpm typecheck && pnpm build` 全部通过
  - [ ] 10.2 完整流程验证：进入项目 → 切换到"方案设计"阶段 → 模板选择界面加载 → 选择模板 → 骨架生成 → 编辑骨架（增删改排序） → 确认骨架 → 切换到"方案撰写" → 编辑器加载骨架内容
  - [ ] 10.3 评分权重验证：有评分模型的项目 → 生成骨架 → 章节显示权重 → 高权重显示"重点投入"
  - [ ] 10.4 已有内容验证：已有 proposal.md 的项目 → 进入方案设计 → 显示摘要 → 重新选择弹出确认
  - [ ] 10.5 边界验证：无评分模型时不显示权重、公司模板目录不存在时只显示内置模板

## Dev Notes

### 本 Story 在 Epic 3 中的位置

```
Story 3.1 (done): Plate 编辑器 + Markdown 序列化
Story 3.2 (validated / implemented): 编辑器嵌入工作空间 + 文档大纲
→ Story 3.3 (本 Story): 模板驱动方案骨架生成 ← 填充 solution-design 阶段
Story 3.4 (next): AI 章节级方案生成 ← 依赖本 Story 生成的骨架
```

**数据流：**
```
resources/templates/*.template.json  ──→  templateService.listTemplates()
                                          templateService.getTemplate()
                                          templateService.generateSkeleton()
                                          templateService.persistSkeleton()
                                                │
                                                ├── → proposal.md (Markdown 骨架)
                                                ├── → proposal.meta.json (sectionWeights)
                                                └── → GenerateSkeletonOutput → UI

ScoringModel (from Story 2-5) ──→ scoringExtractor.getScoringModel()
                                   └──→ applyWeights() → weight annotations
```

**UI 流程：**
```
[solution-design 阶段]
  ┌─────────────────────────────────────────┐
  │ 检查 proposal.md                         │
  ├─── 无内容 → 模板选择界面                  │
  │    └── 选择模板 → 生成骨架 → 骨架编辑器   │
  ├─── 有内容 → 已有方案摘要                  │
  │    ├── "继续撰写" → 引导切换阶段           │
  │    └── "重新选择" → 确认 → 模板选择界面    │
  └─────────────────────────────────────────┘
```

### SOP 阶段定义（来自 types.ts）

```typescript
type SopStageKey =
  | 'not-started'
  | 'requirements-analysis'  // 阶段1：需求分析
  | 'solution-design'        // 阶段2：方案设计 ← 本 Story
  | 'proposal-writing'       // 阶段3：标书撰写
  | 'cost-estimation'        // 阶段4：成本估算
  | 'compliance-review'      // 阶段5：合规审查
  | 'delivery'               // 阶段6：交付
```

`solution-design` 的 CTA 标签为"选择方案模板"，description 为"本阶段目标：确定方案骨架。选择模板并生成方案大纲。"

### 已有代码资产（禁止重复创建）

| 已有文件 | 内容 | 本 Story 操作 |
|----------|------|--------------|
| `src/renderer/src/modules/project/components/ProjectWorkspace.tsx` | 三栏布局、阶段分支 | **修改**：添加 solution-design 分支 |
| `src/renderer/src/modules/project/types.ts` | SopStageKey、SOP_STAGES 常量 | 只读引用 |
| `src/renderer/src/modules/project/components/StageGuidePlaceholder.tsx` | 阶段占位组件 | 不修改（solution-design 改为渲染 SolutionDesignView） |
| `src/renderer/src/stores/documentStore.ts` | 文档内容、自动保存 | 复用 `loadDocument()` + `updateContent(markdown, projectId, { scheduleSave: false })` 同步 renderer 态；**不**单独承担 skeleton metadata 持久化 |
| `src/renderer/src/modules/editor/hooks/useDocumentOutline.ts` | Markdown 大纲提取 | 只读复用 |
| `src/renderer/src/modules/editor/hooks/useWordCount.ts` | 字数统计 | 只读复用 |
| `src/renderer/src/modules/editor/components/DocumentOutlineTree.tsx` | 大纲树 UI | 只读复用 |
| `src/renderer/src/modules/editor/lib/scrollToHeading.ts` | 大纲滚动定位 | 只读复用 |
| `src/main/services/document-service.ts` | proposal.md 读写 | 通过 IPC 调用 |
| `src/main/services/document-parser/scoring-extractor.ts` | 评分模型提取 | **主进程内直接调用** `getScoringModel(projectId)` |
| `src/main/db/repositories/scoring-model-repo.ts` | 评分模型数据库操作 | 间接调用（通过评分提取服务） |
| `src/shared/analysis-types.ts` | ScoringModel、ScoringCriterion 类型 | 只读引用 |
| `src/shared/models/proposal.ts` | ProposalDocument、ProposalMetadata | **修改**：扩展 sectionWeights 字段 |
| `src/shared/ipc-types.ts` | IPC 通道类型映射 | **修改**：新增 template 通道 |
| `src/preload/index.ts` | 预加载 API 桥接 | **修改**：新增 template 方法 |
| `src/main/ipc/create-handler.ts` | 统一 IPC response wrapper | 只读复用 |
| `src/main/ipc/index.ts` | IPC handler 注册入口 | **修改**：注册 template handlers |
| `tests/unit/main/services/document-service.test.ts` | metadata 保留回归测试 | **修改**：验证 sectionWeights/templateId 不会在普通保存中丢失 |

### 评分模型数据结构（Story 2-5 已实现）

```typescript
// src/shared/analysis-types.ts
interface ScoringCriterion {
  id: string
  category: string       // 评分大类名称，如"技术方案"、"项目管理"
  maxScore: number
  weight: number          // 0-1 小数权重，例如 0.3
  subItems: ScoringSubItem[]
  reasoning: string
  status: 'extracted' | 'confirmed' | 'modified'
}

interface ScoringModel {
  projectId: string
  totalScore: number
  criteria: ScoringCriterion[]
  extractedAt: string
  confirmedAt: string | null
  version: number
}
```

评分权重匹配策略：
1. 先把评分模型展平为两类候选：
   - criterion 级：`ScoringCriterion.category`，百分比来自 `criterion.weight * 100`
   - sub-item 级：`ScoringSubItem.name`，百分比来自 `subItem.maxScore / totalScore * 100`
2. 对模板一级章节优先尝试匹配 sub-item，再回退到 criterion
3. 匹配优先级：精确相等 > 包含匹配 > 关键词交集
4. 未匹配的章节不赋权重

### 关键实现决策

**不使用 AI 生成骨架：** 骨架是模板结构的直接映射，不需要 AI 推理。Story 3.4 才引入 AI 生成章节内容。因此本 Story 不需要经过 agent-orchestrator 或 task-queue。

**不创建新 Zustand store：** 模板选择是一次性流程，使用组件本地状态（`useState`/`useReducer`）管理。骨架确认后写入 `documentStore`，模板选择状态不需要跨组件共享。

**骨架编辑 ≠ 富文本编辑：** 骨架编辑器是结构编辑器（Tree + 拖拽 + CRUD），不使用 Plate 编辑器。Plate 编辑器在 `proposal-writing` 阶段加载骨架内容后用于正文编写。

**内置模板 + 公司模板双源：** 内置模板打包在 `resources/templates/` 中，公司自定义骨架模板放在 `company-data/templates/skeletons/`。这样不会和 Epic 5 的 Word 导出模板注册（同属 `company-data/templates/` 根目录）混淆。Alpha 阶段模板为预定义 JSON 结构。

**proposal.meta.json 扩展：** 新增 `sectionWeights` 字段存储章节权重映射，`templateId` 记录使用的模板。`sectionWeights` 必须以稳定 `sectionId` 为主键，不能只靠标题字符串。保持向后兼容——读取 metadata 时缺少这些字段使用默认值。

**solution-design 阶段的持久化策略：** 该阶段仍复用 `documentStore.content` 作为 renderer 内存态来源，但真正落盘必须通过 template-service 一并刷新 `proposal.md + proposal.meta.json.sectionWeights`。不要只依赖 `documentStore.saveDocument()`，否则 metadata 会过期。

### 内置模板 JSON 加载路径

```typescript
import { app } from 'electron'
import path from 'path'

// 开发环境：项目根目录下 resources/templates/
// 打包后：app.getAppPath() 指向 asar 包内
const builtInDir = path.join(app.getAppPath(), 'resources', 'templates')

// 公司骨架模板：按固定 fallback 顺序查找
// 1) app.getAppPath()/company-data/templates/skeletons
// 2) app.getPath('userData')/company-data/templates/skeletons
const companyDir = resolveCompanyTemplateDir()
```

**注意**：当前仓库已经通过 `electron-builder.yml` 的 `files + asarUnpack` 把 `resources/**` 带入打包产物。除非实际打包验证证明读取失败，否则**不要**在本 Story 额外引入 `extraResources` 配置改动。

### IPC Handler 模式参考

参照 `src/main/ipc/document-handlers.ts` 和 `src/main/ipc/analysis-handlers.ts` 的实现模式，直接复用 `src/main/ipc/create-handler.ts` 中已存在的 `createIpcHandler`。

### 禁止事项

- **禁止**在 IPC handler 中放置业务逻辑（必须委托给 template-service）
- **禁止**使用 `../../` 以上的相对导入路径
- **禁止**为模板功能经过 agent-orchestrator 或 task-queue（非 AI 操作）
- **禁止**修改 `documentStore` 的接口定义（仅调用现有 `loadDocument` 和 `updateContent(content, projectId, options?)`）
- **禁止**修改 Story 3.2 已完成的大纲/编辑器组件内部逻辑
- **禁止**创建新 Zustand store（使用组件本地状态管理模板选择流程）
- **禁止**修改 SOP_STAGES 常量或 SopStageKey 类型（`solution-design` 已存在）
- **禁止** throw 裸字符串（使用 BidWiseError）
- **禁止**在 solution-design 视图中渲染 Plate 编辑器（Plate 仅用于 proposal-writing）
- **禁止**在主进程 service 内部通过 `analysis:*` IPC 反调自己
- **禁止**直接把 `company-data` 路径硬编码为单一路径——应使用集中 resolver
- **禁止**只用标题字符串作为 `sectionWeights` 主键

### Ant Design Tree 拖拽排序要点

```typescript
import { Tree } from 'antd'
import type { TreeProps } from 'antd'

// onDrop handler for drag-and-drop reorder
const onDrop: TreeProps['onDrop'] = (info) => {
  const dropKey = info.node.key as string
  const dragKey = info.dragNode.key as string
  const dropPos = info.node.pos.split('-')
  const dropPosition = info.dropPosition - Number(dropPos[dropPos.length - 1])
  // dropPosition: -1 = before, 0 = inside (as child), 1 = after
  // Update skeleton tree structure accordingly
}

<Tree
  draggable
  blockNode
  onDrop={onDrop}
  treeData={treeData}
  // ...
/>
```

### Project Structure Notes

- 新增文件遵循 editor 模块 kebab-case 目录 + PascalCase 组件命名
- template-service 放在 `src/main/services/template-service.ts`（与 document-service 同级）
- 模板类型放在 `src/shared/template-types.ts`（与 analysis-types 同级）
- IPC handler 放在 `src/main/ipc/template-handlers.ts`（与 document-handlers 同级）
- 测试文件遵循现有目录结构：`tests/unit/main/services/`、`tests/unit/renderer/modules/editor/`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3 模板反向驱动方案骨架生成] — 用户故事、AC、FR19
- [Source: _bmad-output/planning-artifacts/prd.md#FR19] — 系统可以基于选定模板反向生成方案章节骨架，并按评分权重标注重点章节
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#流程1 阶段3] — 选择方案模板 → 一键生成方案骨架 → 调整大纲结构
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#工作空间布局] — 三栏布局规格
- [Source: _bmad-output/planning-artifacts/architecture.md#项目目录结构] — company-data/templates/、data/projects/{id}/template-mapping.json
- [Source: _bmad-output/planning-artifacts/architecture.md#数据边界] — 公司资产（模板）通过 Git 同步
- [Source: _bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline.md] — 前置 Story，大纲树、字数统计实现细节
- [Source: _bmad-output/implementation-artifacts/3-2-editor-workspace-doc-outline-validation-report.md] — Story 3.2 已验证的展开/只读交互边界
- [Source: src/shared/analysis-types.ts] — ScoringModel、ScoringCriterion 类型定义
- [Source: src/renderer/src/modules/project/types.ts] — SopStageKey、SOP_STAGES 定义
- [Source: src/main/services/todo-priority-service.ts] — solution-design 阶段 nextAction: '生成方案骨架'
- [Source: src/main/services/document-service.ts] — 文档读写服务模式

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
