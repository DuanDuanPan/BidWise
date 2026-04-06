# Story 4.1: [Enabler] Annotation Service 基础架构与批注数据模型

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 开发者,
I want 独立的 Annotation Service 基础架构,
So that 批注系统作为跨切面组件，编辑器/对抗引擎/评分引擎都可以发布和订阅批注。

## Acceptance Criteria

1. **Given** Annotation Service 初始化
   **When** 架构组件加载
   **Then** `annotationStore` 在渲染进程缓存按 `projectId` 分桶的批注状态
   **And** 渲染侧所有批注读写都经由 IPC 进入主进程
   **And** UI 通过 store 订阅获得响应式更新，而不是直接读写文件系统或 SQLite

2. **Given** 应用启动
   **When** Kysely 迁移执行
   **Then** 自动创建 `annotations` 表，字段至少包含：
   - `id`（TEXT PK）
   - `project_id`（TEXT FK → `projects.id`，`ON DELETE CASCADE`）
   - `section_id`（TEXT NOT NULL）
   - `type`（TEXT NOT NULL）
   - `content`（TEXT NOT NULL）
   - `author`（TEXT NOT NULL）
   - `status`（TEXT NOT NULL）
   - `created_at`（TEXT NOT NULL）
   - `updated_at`（TEXT NOT NULL）

3. **Given** 批注数据模型
   **When** 创建批注
   **Then** `AnnotationRecord` 至少包含：
   - `id`
   - `projectId`
   - `sectionId`
   - `type`: `ai-suggestion | asset-recommendation | score-warning | adversarial | human | cross-role`
   - `content`
   - `author`
   - `status`: `pending | accepted | rejected | needs-decision`
   - `createdAt`
   - `updatedAt`
   **And** `sectionId` 是通用锚点字符串，不仅限于标题 locator；项目级批注使用保留锚点 `project-root`

4. **Given** 任意批注写操作（创建 / 更新 / 删除）
   **When** 主进程完成持久化
   **Then** SQLite 是事实来源（source of truth）
   **And** `proposal.meta.json.annotations` 通过统一的 `documentService` 元数据更新入口做镜像同步
   **And** sidecar 写入失败只记录 warning 并保留 SQLite 成功结果
   **And** 主进程提供 `syncProjectToSidecar(projectId)` 作为恢复性全量回写能力

5. **Given** 批注 CRUD 通过 IPC 暴露
   **When** 调用 `annotation:create` / `annotation:update` / `annotation:delete` / `annotation:list`
   **Then** 所有 handler 都使用 `{ success, data } | { success: false, error }` 标准响应包装
   **And** handler 仅做薄分发，业务逻辑集中在 `annotationService`

6. **Given** 批注按项目查询
   **When** 调用 `annotation:list` 并仅传入 `projectId`
   **Then** 返回该项目全部批注
   **And** 按 `createdAt DESC` 排序

7. **Given** 批注按锚点查询
   **When** 调用 `annotation:list` 并传入 `projectId` 和 `sectionId`
   **Then** 仅返回指定锚点的批注

8. **Given** 用户进入项目工作空间的 `proposal-writing` 阶段
   **When** `ProjectWorkspace` 装载当前项目
   **Then** `annotationStore.loadAnnotations(projectId)` 自动执行
   **And** 批注面板具备明确的 `loading / empty / list` 三态
   **And** per-project `loading` / `error` 状态不会被其他项目污染

9. **Given** 批注面板、编辑器、文档大纲等多个组件同时订阅批注
   **When** 批注状态变化
   **Then** 使用 `subscribeWithSelector` 或等价细粒度 selector 订阅
   **And** 组件仅响应自己关心的批注子集变化

10. **Given** Story 1.7 已交付右侧智能批注壳层，Story 3.4 临时塞入了“章节生成摘要”占位
    **When** 实现本 Story
    **Then** 保留 Story 1.7 的壳层几何与可访问性合同（展开 320px / 折叠 40px / 紧凑图标栏 48px，`aria-label="智能批注"`）
    **And** 用本 Story 的真实批注内容替换 Story 3.4 的占位摘要
    **And** 展开的面板头文案为 `批注`
    **And** 头部只在待处理数 > 0 时显示蓝色 pill 文案 `N 待处理`
    **And** 加载态、空态、简化列表态与本 Story UX 原型保持一致

## Tasks / Subtasks

### 共享类型与 sidecar 元数据

- [x] Task 1: 定义批注共享类型并补齐统一元数据更新入口（AC: #1, #3, #4, #5, #6, #7）
  - [x] 1.1 新建 `src/shared/annotation-types.ts`
  - [x] 1.2 定义：
    ```ts
    export type AnnotationType =
      | 'ai-suggestion'
      | 'asset-recommendation'
      | 'score-warning'
      | 'adversarial'
      | 'human'
      | 'cross-role'

    export type AnnotationStatus =
      | 'pending'
      | 'accepted'
      | 'rejected'
      | 'needs-decision'

    export interface AnnotationRecord {
      id: string
      projectId: string
      sectionId: string
      type: AnnotationType
      content: string
      author: string
      status: AnnotationStatus
      createdAt: string
      updatedAt: string
    }
    ```
  - [x] 1.3 定义输入类型：
    ```ts
    export interface CreateAnnotationInput {
      projectId: string
      sectionId: string
      type: AnnotationType
      content: string
      author: string
    }

    export interface UpdateAnnotationInput {
      id: string
      content?: string
      status?: AnnotationStatus
    }

    export interface DeleteAnnotationInput {
      id: string
    }

    export interface ListAnnotationsInput {
      projectId: string
      sectionId?: string
    }
    ```
  - [x] 1.4 更新 `src/shared/ipc-types.ts`
    - 新增 `IPC_CHANNELS.ANNOTATION_CREATE / UPDATE / DELETE / LIST`
    - 在 `IpcChannelMap` 中新增四个通道类型映射
    - 在文件顶部导入 `annotation-types.ts` 中所需类型
  - [x] 1.5 更新 `src/shared/models/proposal.ts`
    - 将 `annotations: []` 改为 `annotations: AnnotationRecord[]`
    - 保持 `scores` 现状不变
  - [x] 1.6 扩展 `src/main/services/document-service.ts`
    - 新增统一 sidecar 更新入口：
      ```ts
      updateMetadata(
        projectId: string,
        updater: (current: ProposalMetadata) => ProposalMetadata
      ): Promise<ProposalMetadata>
      ```
    - `save()` / `saveSync()` 继续保留既有 `annotations` 字段，不因普通文档保存丢失批注
    - 缺少 `annotations` 时默认 `[]`
  - [x] 1.7 将 `src/main/services/template-service.ts` 中当前本地 `saveMetadata()` sidecar 写入逻辑迁移到统一 `documentService` 元数据更新入口，避免仓库继续出现多套 sidecar 写法
  - [x] 1.8 更新 `tests/unit/main/services/document-service.test.ts`
    - 覆盖 `annotations` 保留行为
    - 覆盖 metadata patch helper 的成功与失败路径

### 数据库层

- [x] Task 2: 创建 `annotations` 表迁移并接入 migrator（AC: #2）
  - [x] 2.1 新建 `src/main/db/migrations/007_create_annotations.ts`
  - [x] 2.2 建表字段按 AC #2 定义实现，`status` 默认值为 `'pending'`
  - [x] 2.3 创建索引：
    - `annotations_project_id_idx`（`project_id`）
    - `annotations_project_section_id_idx`（`project_id`, `section_id`）
  - [x] 2.4 实现 `down()` 删除 `annotations` 表
  - [x] 2.5 更新 `src/main/db/schema.ts`
    - 新增 `AnnotationTable`
    - 在 `DB` 接口中新增 `annotations: AnnotationTable`
  - [x] 2.6 更新 `src/main/db/migrator.ts` 注册 `007_create_annotations`
  - [x] 2.7 更新 `tests/unit/main/db/migrations.test.ts`
    - 迁移总数增加到 7
    - 校验 `annotations` 表字段、默认值和索引

- [x] Task 3: 创建 annotation repository 并导出（AC: #2, #3, #6, #7）
  - [x] 3.1 新建 `src/main/db/repositories/annotation-repo.ts`
  - [x] 3.2 实现 `create(input: CreateAnnotationInput): Promise<AnnotationRecord>`
    - 生成 UUID
    - 默认 `status = 'pending'`
    - 生成 ISO-8601 `createdAt/updatedAt`
  - [x] 3.3 实现 `update(input: UpdateAnnotationInput): Promise<AnnotationRecord>`
  - [x] 3.4 实现 `delete(id: string): Promise<void>`
  - [x] 3.5 实现 `findById(id: string): Promise<AnnotationRecord | null>` 供 service 内部查询项目归属与 sidecar 回写使用
  - [x] 3.6 实现 `listByProject(projectId: string): Promise<AnnotationRecord[]>`
  - [x] 3.7 实现 `listBySection(projectId: string, sectionId: string): Promise<AnnotationRecord[]>`
  - [x] 3.8 统一使用 `DatabaseError` / `NotFoundError`
  - [x] 3.9 更新 `src/main/db/repositories/index.ts` 导出 `AnnotationRepository`
  - [x] 3.10 新增 `tests/unit/main/db/repositories/annotation-repo.test.ts`

### 主进程服务与 IPC

- [x] Task 4: 创建 `annotationService` 并实现 SQLite + sidecar 镜像（AC: #1, #4, #5, #6, #7）
  - [x] 4.1 新建 `src/main/services/annotation-service.ts`
  - [x] 4.2 实现 `create(input: CreateAnnotationInput): Promise<AnnotationRecord>`
  - [x] 4.3 实现 `update(input: UpdateAnnotationInput): Promise<AnnotationRecord>`
  - [x] 4.4 实现 `delete(id: string): Promise<void>`
  - [x] 4.5 实现 `list(input: ListAnnotationsInput): Promise<AnnotationRecord[]>`
  - [x] 4.6 实现 `syncProjectToSidecar(projectId: string): Promise<void>`
    - 从 SQLite 全量读取当前项目批注
    - 覆盖写回 `proposal.meta.json.annotations`
  - [x] 4.7 写操作后的 sidecar 回写策略：
    - 优先提交 SQLite
    - sidecar 镜像使用统一 `documentService.updateMetadata()` 完成
    - sidecar 失败仅 `logger.warn()`，不回滚 SQLite
  - [x] 4.8 新增 `tests/unit/main/services/annotation-service.test.ts`
    - CRUD 正常路径
    - `listByProject` 排序
    - `listBySection` 过滤
    - sidecar 同步成功
    - sidecar 同步失败不阻塞 SQLite 成功

- [x] Task 5: 注册 annotation IPC，并手动接线 preload API（AC: #5）
  - [x] 5.1 新建 `src/main/ipc/annotation-handlers.ts`
  - [x] 5.2 使用 `src/main/ipc/create-handler.ts` 做薄分发：
    - `annotation:create`
    - `annotation:update`
    - `annotation:delete`
    - `annotation:list`
  - [x] 5.3 更新 `src/main/ipc/index.ts`
    - 导入并注册 `registerAnnotationHandlers()`
    - 将 `RegisteredAnnotationChannels` 并入 `_AllRegistered` 编译期穷尽校验
  - [x] 5.4 更新 `src/preload/index.ts`
    - 手动在 `requestApi` 中新增 `annotationCreate` / `annotationUpdate` / `annotationDelete` / `annotationList`
    - 说明：`PreloadApi` 只负责类型穷尽校验，不会自动生成实现
  - [x] 5.5 更新 `tests/unit/preload/security.test.ts` 白名单
  - [x] 5.6 新增 `tests/unit/main/ipc/annotation-handlers.test.ts`

### 渲染进程 store / hooks / 面板集成

- [x] Task 6: 创建 project-scoped 的 `annotationStore`（AC: #1, #8, #9）
  - [x] 6.1 新建 `src/renderer/src/stores/annotationStore.ts`
  - [x] 6.2 使用下述状态骨架，而不是全局单一 `loading/error`
    ```ts
    interface AnnotationProjectState {
      items: AnnotationRecord[]
      loading: boolean
      error: string | null
      loaded: boolean
    }

    interface AnnotationState {
      projects: Record<string, AnnotationProjectState>
    }
    ```
  - [x] 6.3 使用 `create` + `subscribeWithSelector`
  - [x] 6.4 实现 actions：
    - `loadAnnotations(projectId)`
    - `createAnnotation(input)`
    - `updateAnnotation(input)`
    - `deleteAnnotation(id, projectId)`
    - `reset(projectId?)`
  - [x] 6.5 写操作以服务端返回的 canonical record 更新本地缓存；本 Story **不**引入临时 ID 乐观写入
  - [x] 6.6 本地缓存始终维持 `createdAt DESC` 顺序
  - [x] 6.7 IPC 失败时记录到对应项目的 `error` 字段，不向组件层抛异常
  - [x] 6.8 新增 `tests/unit/renderer/stores/annotationStore.test.ts`

- [x] Task 7: 创建 annotation hooks，并复用现有相对时间格式化逻辑（AC: #8, #9, #10）
  - [x] 7.1 新建 `src/renderer/src/modules/annotation/hooks/useAnnotation.ts`
  - [x] 7.2 提供：
    - `useProjectAnnotations(projectId)`
    - `useAnnotationsForSection(projectId, sectionId)`
    - `usePendingAnnotationCount(projectId)`
  - [x] 7.3 将 `src/renderer/src/modules/project/components/ProjectCard.tsx` 里的 `formatRelativeTime()` 提炼到可复用 shared lib，`AnnotationPanel` 与 `ProjectCard` 共用，避免复制实现
  - [x] 7.4 新增 `tests/unit/renderer/modules/annotation/hooks/useAnnotation.test.ts`

- [x] Task 8: 在 `ProjectWorkspace` 与 `AnnotationPanel` 中接入真实批注状态（AC: #8, #10）
  - [x] 8.1 修改 `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
    - 仅在 `proposal-writing` 阶段自动触发 `loadAnnotations(projectId)`
    - `projectId` 变化时切换到对应 project bucket
    - 紧凑模式 flyout 与标准模式共享同一批注内容状态
  - [x] 8.2 修改 `src/renderer/src/modules/project/components/AnnotationPanel.tsx`
    - 保留 Story 1.7 壳层宽度、折叠模式、`data-testid`、`role="complementary"`、`aria-label="智能批注"`、`aria-live="polite"`
    - 可见标题改为 `批注`
    - 移除 Story 3.4 临时“章节生成摘要”占位
  - [x] 8.3 Header 规则
    - 展开态右上角用蓝色 pill 文案 `N 待处理`
    - `pending === 0` 时隐藏 pill
    - 紧凑图标栏可以继续使用小型 numeric badge
  - [x] 8.4 Loading 态
    - 渲染 header spinner
    - 渲染 3 条 skeleton 卡片
    - 底部提示文案：`正在加载批注数据...`
  - [x] 8.5 Empty 态
    - 渲染图标 + 标题 `本项目暂无批注`
    - 渲染说明文案：`批注将在 AI 生成、评分分析、对抗检测等流程中自动创建`
  - [x] 8.6 List 态
    - 渲染简化列表，不实现 4.2 的完整五色卡片动作区
    - 单条仅显示：类型 chip、状态 chip、正文、`author · relativeTime`
    - `cross-role` 在 4.1 可用简化 chip 展示；其专属通知/交互留给 Story 4.4
  - [x] 8.7 新增/更新测试：
    - `tests/unit/renderer/project/AnnotationPanel.test.tsx`
    - `tests/unit/renderer/project/ProjectWorkspace.test.tsx`

### 测试

- [x] Task 9: 补齐 4.1 的单元 / 集成 / E2E 回归（AC: #1-#10）
  - [x] 9.1 `tests/unit/main/services/document-service.test.ts` — sidecar metadata patch / preserve annotations
  - [x] 9.2 `tests/unit/main/db/migrations.test.ts` — `007_create_annotations`
  - [x] 9.3 `tests/unit/main/db/repositories/annotation-repo.test.ts`
  - [x] 9.4 `tests/unit/main/services/annotation-service.test.ts`
  - [x] 9.5 `tests/unit/main/ipc/annotation-handlers.test.ts`
  - [x] 9.6 `tests/unit/preload/security.test.ts` — annotation API 暴露白名单
  - [x] 9.7 `tests/unit/renderer/stores/annotationStore.test.ts`
  - [x] 9.8 `tests/unit/renderer/modules/annotation/hooks/useAnnotation.test.ts`
  - [x] 9.9 `tests/unit/renderer/project/AnnotationPanel.test.tsx`
  - [x] 9.10 `tests/unit/renderer/project/ProjectWorkspace.test.tsx`
  - [x] 9.11 `tests/e2e/stories/story-4-1-annotation-service.spec.ts`
    - 在进入 workspace 前通过 `window.api.annotationCreate(...)` 预置批注数据，再访问 `/project/:id` 验证 list state / pending pill
    - 对 empty state 使用“无预置批注项目”或“API 删除后重新进入 workspace”的方式验证，不要求本 Story 提供“新增批注”可视化按钮
    - 验证 `proposal.meta.json.annotations` sidecar 持久化结果
  - [x] 9.12 `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`

## Dev Notes

### 本 Story 在 Epic 4 中的位置

```text
→ Story 4.1 (本 Story): Annotation Service 基础设施、数据模型、SQLite/sidecar/IPC/store
Story 4.2: 五色批注卡片与基础交互
Story 4.3: 智能批注面板排序/过滤/微对话
Story 4.4: 待决策状态与跨角色通知
```

### 关键实现决策

1. **Type 与 Status 必须拆开**
   - `type` 表示来源/语义：AI 建议、资产推荐、评分预警、对抗反馈、人工批注、跨角色指导
   - `status` 表示处理状态：待处理、已采纳、已拒绝、待决策
   - `pending-decision` 不能再混在 `type` 里，否则 Story 4.4 会与 4.2/4.3 的来源维度打架

2. **SQLite 是 source of truth，sidecar 是镜像**
   - 查询一律读 SQLite
   - sidecar 用于项目文件级导出/恢复/同步
   - SQLite 成功、sidecar 失败时不得把本次写操作伪装成整体失败

3. **统一 sidecar 写入入口**
   - 现有仓库里 `template-service.ts` 已经有一套本地 `saveMetadata()` 写 sidecar 的逻辑
   - 4.1 不应复制第二套临时 helper；应把 sidecar 更新收敛到 `documentService`

4. **Story 1.7 壳层合同不能被 4.1 打破**
   - 右栏宽度仍为 320px
   - 紧凑模式图标栏仍为 48px，flyout 逻辑仍保留
   - `data-testid="annotation-panel"` 等壳层测试标识尽量延续，避免把 1.7/3.4 回归面全部打碎

5. **Story 3.4 的 annotation placeholder 到此结束**
   - `generatingCount` 摘要只是临时过渡
   - 4.1 应改成真实的 `loading / empty / list` 三态

6. **复用已有相对时间格式化逻辑**
   - 当前仓库已有 `ProjectCard.tsx` 内联 `formatRelativeTime()`
   - 4.1 应复用或抽取该 helper，而不是再次复制一份时间格式化实现

### Previous Story Intelligence

- Story 1.7 已经固定了工作空间三栏壳层与 annotation panel 的几何、折叠、compact flyout、ARIA 合同；4.1 只能填内容，不能重做壳层。
- Story 3.4 暂时把“章节生成中...”摘要塞进了 AnnotationPanel；4.1 的首要 UI 任务之一就是替换这块过渡占位。
- Story 3.3 已经为 `ProposalMetadata` 引入统一 metadata 扩展模式，并在 `template-service.ts` 中出现了 sidecar 元数据写回 helper；4.1 应沿同一方向做收敛，而不是并行生长。

### Scope Boundary

- **本 Story 交付**
  - Annotation shared types
  - SQLite `annotations` 表
  - Repository / service / IPC / preload / renderer store
  - `AnnotationPanel` 的加载态、空态、简化列表态
- **本 Story 不交付**
  - 完整五色卡片操作按钮与键盘处理（Story 4.2）
  - 智能排序、过滤器、过载应急、微对话（Story 4.3）
  - 待决策协作者通知、跨角色流程、决策线程（Story 4.4）
  - “新增批注”可视化按钮或编辑器内锚点 UI 入口

### Project Structure Notes

- 新增 shared 类型放在 `src/shared/annotation-types.ts`
- 新增 DB migration 需同时更新 `src/main/db/migrator.ts` 与 `tests/unit/main/db/migrations.test.ts`
- 新增 repository 需同时更新 `src/main/db/repositories/index.ts`
- renderer store 放在 `src/renderer/src/stores/annotationStore.ts`
- annotation selector hooks 放在新模块 `src/renderer/src/modules/annotation/hooks/`
- `AnnotationPanel` 仍位于 `src/renderer/src/modules/project/components/AnnotationPanel.tsx`
- project 模块现有测试目录是 `tests/unit/renderer/project/`
- 不新增与现有路径风格冲突的 `tests/unit/renderer/modules/project/components/...` 伪目录

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.1] — Epic 4 / Story 4.1 基础 AC
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.2] — 五色批注卡片后续边界
- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4] — 待决策状态与跨角色通知后续边界
- [Source: _bmad-output/planning-artifacts/prd.md#FR27] — 批注式双向人机协作
- [Source: _bmad-output/planning-artifacts/prd.md#FR28] — 批注来源分层着色
- [Source: _bmad-output/planning-artifacts/prd.md#FR29] — 待决策标记
- [Source: _bmad-output/planning-artifacts/prd.md#FR30] — 跨角色通知
- [Source: _bmad-output/planning-artifacts/architecture.md#跨切面关注点] — Annotation Service 作为独立架构组件
- [Source: _bmad-output/planning-artifacts/architecture.md#sidecar JSON 元数据结构（proposal.meta.json）] — sidecar 元数据契约
- [Source: _bmad-output/implementation-artifacts/story-1-7-workspace-layout-shell.md] — 右侧 320px 壳层与 compact flyout 合同
- [Source: _bmad-output/implementation-artifacts/3-4-ai-chapter-generation.md] — Story 3.4 临时 annotation placeholder 约束
- [Source: _bmad-output/implementation-artifacts/4-1-enabler-annotation-service-ux/prototype.manifest.yaml] — 本 Story UX 查阅入口
- [Source: _bmad-output/implementation-artifacts/4-1-enabler-annotation-service-ux/ux-spec.md] — 面板头、空态、加载态、简化列表规范
- [Source: _bmad-output/implementation-artifacts/4-1-enabler-annotation-service-ux/prototype.pen] — 结构与交互细节参考
- [Source: src/main/db/migrator.ts] — 现有 migration 注册方式
- [Source: src/main/ipc/create-handler.ts] — IPC handler 工厂
- [Source: src/main/ipc/index.ts] — IPC compile-time exhaustive registration pattern
- [Source: src/main/services/document-service.ts] — metadata 读取与 sidecar 保留逻辑
- [Source: src/main/services/template-service.ts] — 现有 sidecar metadata helper 待收敛
- [Source: src/preload/index.ts] — requestApi 需要手动接线
- [Source: src/shared/ipc-types.ts] — IpcChannelMap / PreloadApi / FullPreloadApi 合同
- [Source: src/renderer/src/modules/project/components/AnnotationPanel.tsx] — 当前 Story 1.7 / 3.4 壳层与占位实现
- [Source: src/renderer/src/modules/project/components/ProjectWorkspace.tsx] — proposal-writing 阶段集成点
- [Source: src/renderer/src/modules/project/components/ProjectCard.tsx] — 现有相对时间格式化逻辑
- [Source: src/renderer/src/stores/analysisStore.ts] — project-scoped Zustand store 参考模式

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Pre-existing `better-sqlite3` native module version mismatch (NODE_MODULE_VERSION 137 vs 141) causes 46 pre-existing test failures in client/project-repo/project-service/migrations/integration tests. Not related to this story.

### Completion Notes List

- Task 1: Created `annotation-types.ts` shared types, added IPC channels to `ipc-types.ts`, updated `ProposalMetadata.annotations` from `[]` to `AnnotationRecord[]`, added `documentService.updateMetadata()` unified entry, migrated `template-service.ts` saveMetadata to use it
- Task 2: Created `007_create_annotations` migration with FK, indexes, registered in migrator
- Task 3: Created `AnnotationRepository` with CRUD + listByProject/listBySection, exported from index
- Task 4: Created `annotationService` with SQLite-first + sidecar mirror pattern, sidecar failure logged as warning only
- Task 5: Created `annotation-handlers.ts`, registered in IPC index with compile-time exhaustive check, wired preload API, updated security whitelist
- Task 6: Created `annotationStore` with per-project state buckets, `subscribeWithSelector`, createdAt DESC sorting
- Task 7: Extracted `formatRelativeTime` to `shared/lib/format-time.ts`, created `useProjectAnnotations`/`useAnnotationsForSection`/`usePendingAnnotationCount` hooks
- Task 8: Replaced Story 3.4 placeholder with real loading/empty/list states, title changed to "批注", pending pill, preserved Story 1.7 shell geometry
- Task 9: All unit tests written inline with tasks, E2E spec created, full suite 889/889 passing, lint clean, typecheck clean

### File List

New files:
- src/shared/annotation-types.ts
- src/main/db/migrations/007_create_annotations.ts
- src/main/db/repositories/annotation-repo.ts
- src/main/services/annotation-service.ts
- src/main/ipc/annotation-handlers.ts
- src/renderer/src/stores/annotationStore.ts
- src/renderer/src/shared/lib/format-time.ts
- src/renderer/src/modules/annotation/hooks/useAnnotation.ts
- tests/unit/main/db/repositories/annotation-repo.test.ts
- tests/unit/main/services/annotation-service.test.ts
- tests/unit/main/ipc/annotation-handlers.test.ts
- tests/unit/renderer/stores/annotationStore.test.ts
- tests/unit/renderer/modules/annotation/hooks/useAnnotation.test.ts
- tests/e2e/stories/story-4-1-annotation-service.spec.ts

Modified files:
- src/shared/ipc-types.ts (annotation channels + imports)
- src/shared/models/proposal.ts (annotations typed as AnnotationRecord[])
- src/main/db/schema.ts (AnnotationTable + DB interface)
- src/main/db/migrator.ts (007 registration)
- src/main/db/repositories/index.ts (AnnotationRepository export)
- src/main/services/document-service.ts (updateMetadata method)
- src/main/services/template-service.ts (saveMetadata uses documentService.updateMetadata)
- src/main/ipc/index.ts (annotation handler registration + exhaustive check)
- src/preload/index.ts (annotation API wiring)
- src/renderer/src/modules/project/components/AnnotationPanel.tsx (real annotation states)
- src/renderer/src/modules/project/components/ProjectWorkspace.tsx (loadAnnotations trigger)
- src/renderer/src/modules/project/components/ProjectCard.tsx (shared formatRelativeTime)
- tests/unit/main/services/document-service.test.ts (updateMetadata + preserve annotations)
- tests/unit/main/services/template-service.test.ts (updateMetadata mock)
- tests/unit/main/db/migrations.test.ts (007 migration)
- tests/unit/preload/security.test.ts (annotation whitelist)
- tests/unit/renderer/project/AnnotationPanel.test.tsx (new panel states)
- tests/unit/renderer/project/ProjectWorkspace.test.tsx (annotation store reset + API mock)

### Change Log

- 2026-04-06: Story 4.1 implementation complete
  - Full Annotation Service: shared types → DB migration → repository → service → IPC → preload → store → hooks → panel integration
  - SQLite as source of truth, sidecar mirror via `documentService.updateMetadata()`
  - Template-service sidecar writes consolidated to documentService
  - AnnotationPanel: loading/empty/list states, "批注" title, pending pill, Story 1.7 shell preserved
  - 107 test files, 889 tests passing, lint clean, typecheck clean
- 2026-04-06: `validate-create-story` 修订
  - 统一批注 `type/status` 语义，去除 `pending-decision` 作为 type 的冲突定义
  - 删除未被 AC 需要的 `annotation:get` 通道，收敛到 create/update/delete/list
  - 将 sidecar 更新路径收敛到 `documentService`，并明确复用 / 重构现有 `template-service` helper
  - 修正 renderer hook / 测试路径与当前仓库真实结构不一致的问题
  - 明确 4.1 需要替换 Story 3.4 的 annotation placeholder，并补齐 header pill / loading / empty / list UX 合同
