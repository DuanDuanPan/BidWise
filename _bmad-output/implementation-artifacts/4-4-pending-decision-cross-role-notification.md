# Story 4.4: 待决策标记与跨角色批注通知

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 将批注标记为"待决策"并指定指导人，系统向相关用户发送通知，并支持批注内回复指导,
So that 我拿不准的问题可以请张总在批注中远程指导，不阻塞我的工作。

## Acceptance Criteria

1. **Given** 某条 `pending` 批注我拿不准
   **When** 我通过 `"标记待决策"` / `"请求指导"` / `Alt+D` 打开指导人选择弹窗并确认
   **Then** 原批注状态变为 `needs-decision`
   **And** `annotations.assignee` 记录目标用户标识（如 `user:zhang-zong`）
   **And** 卡片在状态区显示 `"待 {displayName} 指导"`
   **And** 目标用户后续可在该批注线程中回复指导（FR29）

2. **Given** 一条面向其他用户的定向批注
   **When** 它被标记为 `needs-decision` 或以 `type='cross-role'` 创建且 `assignee` 指向其他用户
   **Then** 系统创建应用内通知记录，至少包含 `projectId`、`projectName`、`sectionId`、根批注 `annotationId`、`targetUser`、通知类型、摘要文本
   **And** 通知面板视觉上展示项目名、摘要、时间戳
   **And** `sectionId` 作为跳转锚点与辅助信息保留在 payload 中（FR30）

3. **Given** 用户标记待决策并选择指导人
   **When** 确认操作
   **Then** 系统自动创建一条 `decision-requested` 通知
   **And** 当 `assignee === author` 时不创建自通知

4. **Given** 用户打开通知铃铛面板
   **When** 当前用户存在未读或已读通知
   **Then** 列表按 `createdAt DESC` 展示通知项
   **And** 每条通知包含：类型图标、项目名、摘要、相对时间、未读标识
   **And** 点击通知后先标记已读，再导航到目标项目与目标根批注
   **And** 对 `reply-received` 通知，根批注线程自动展开后定位

5. **Given** 用户在批注中回复（指令/补充/驳回）
   **When** 回复提交
   **Then** 回复作为子批注写入 `annotations` 表，4.4 的可见线程 UI 统一把 `parentId` 指向目标根批注
   **And** 数据模型继续保留 `parentId` 自引用能力，为后续更深层 reply-to-reply 能力预留扩展空间
   **And** 线程以时间正序显示回复
   **And** 若原批注作者是其他人类用户，则向其发送 `reply-received` 通知

6. **Given** 用户在 AI 来源批注（`ai-suggestion | adversarial | score-warning`）的线程中显式提交回复
   **When** 回复提交成功
   **Then** 复用现有 `generate` agent 的 `mode: 'annotation-feedback'` 通过 task-queue 异步执行 AI 迭代（FR27）
   **And** Alpha 阶段使用 `task:progress` + 完成后本地 progressive reveal，而不是 provider token streaming
   **And** 任务完成后追加一条新的 `ai-suggestion` 子批注

7. **Given** 应用标题栏存在通知铃铛
   **When** 当前用户有未读通知
   **Then** 铃铛 Badge 显示未读数量
   **And** 数量在 `markRead` / `markAllRead` / `notification:new` 事件后即时更新

8. **Given** 当前批注面板处于展开态或 compact flyout 打开
   **When** 焦点位于某条 `pending` 根批注上并触发 `Alt+D`
   **Then** 打开指导人选择弹窗，而不是直接把状态写成 `needs-decision`
   **And** 已处理卡片保持 4.2 已有 no-op 保护，不重复写入状态

## Tasks / Subtasks

### Task 1: 扩展批注数据模型与查询边界 (AC: #1, #5, #6)

- [x] 1.1 创建迁移 `src/main/db/migrations/010_add_annotation_thread_fields.ts`
  - 添加 `parent_id TEXT REFERENCES annotations(id) ON DELETE CASCADE`
  - 添加 `assignee TEXT`
  - 添加索引 `annotations_parent_id_idx` on `parent_id`
- [x] 1.2 更新 `src/main/db/schema.ts`
  - `AnnotationTable` 添加 `parentId: string | null`、`assignee: string | null`
- [x] 1.3 更新 `src/main/db/migrator.ts`
  - 注册 `010_add_annotation_thread_fields`
- [x] 1.4 更新 `src/shared/annotation-types.ts`
  - `AnnotationRecord` 添加 `parentId: string | null`、`assignee: string | null`
  - `CreateAnnotationInput` 添加可选 `parentId?: string`、`assignee?: string`
  - `UpdateAnnotationInput` 添加可选 `assignee?: string`
  - `ListAnnotationsInput` 添加可选 `includeReplies?: boolean`
  - 明确 `assignee` 在 Alpha 中同时承担两类含义：
    - `needs-decision` 批注的指导目标用户
    - 定向 `cross-role` 批注的通知目标用户
- [x] 1.5 更新 `src/main/db/repositories/annotation-repo.ts`
  - `create()` / `update()` 支持 `parentId`、`assignee`
  - `listByProject(projectId, options?)` / `listBySection(projectId, sectionId, options?)` 默认仅返回根批注（`parent_id IS NULL`）
  - `options.includeReplies === true` 时返回全量批注，用于 sidecar 镜像
  - 新增 `listReplies(parentId: string): Promise<AnnotationRecord[]>`，按 `createdAt ASC` 返回线程回复
- [x] 1.6 更新 `src/main/services/annotation-service.ts`
  - `create()` / `update()` 转发新字段
  - 新增 `listReplies(parentId: string)`
  - `list()` 支持 `includeReplies`
  - `syncToSidecar()` / `syncProjectToSidecar()` 必须显式请求 `includeReplies: true`，避免回复线程从 `proposal.meta.json` 丢失
- [x] 1.7 更新 `src/main/ipc/annotation-handlers.ts`、`src/shared/ipc-types.ts`、`src/preload/index.ts`
  - 新增 `annotation:list-replies`
  - 更新现有 `annotation:create` / `annotation:update` / `annotation:list` 类型映射以承接新字段
- [x] 1.8 单元测试
  - `tests/unit/main/db/repositories/annotation-repo.test.ts`
  - `tests/unit/main/services/annotation-service.test.ts`
  - 覆盖点：根批注默认过滤、`includeReplies` 旁路、`listReplies` 正序、sidecar 同步包含 replies

### Task 2: 新增通知数据模型与服务 (AC: #2, #3, #4, #7)

- [x] 2.1 创建迁移 `src/main/db/migrations/011_create_notifications.ts`
  - 表结构：
    - `id TEXT PRIMARY KEY`
    - `project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE`
    - `project_name TEXT NOT NULL`
    - `section_id TEXT NOT NULL`
    - `annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE`
    - `target_user TEXT NOT NULL`
    - `type TEXT NOT NULL`（`decision-requested | cross-role-mention | reply-received`）
    - `title TEXT NOT NULL`
    - `summary TEXT NOT NULL`
    - `read INTEGER NOT NULL DEFAULT 0`
    - `created_at TEXT NOT NULL`
  - 索引：
    - `notifications_target_user_idx`
    - `notifications_target_user_read_idx` on `(target_user, read)`
    - `notifications_annotation_id_idx`
- [x] 2.2 更新 `src/main/db/schema.ts`
  - 新增 `NotificationTable`
  - 在 `DB` 接口中注册 `notifications`
- [x] 2.3 更新 `src/main/db/migrator.ts`
  - 注册 `011_create_notifications`
- [x] 2.4 创建 `src/shared/notification-types.ts`
  - `NotificationType = 'decision-requested' | 'cross-role-mention' | 'reply-received'`
  - `NotificationRecord`：`id, projectId, projectName, sectionId, annotationId, targetUser, type, title, summary, read, createdAt`
  - `CreateNotificationInput`
  - `ListNotificationsInput = { targetUser: string; unreadOnly?: boolean }`
  - `MarkReadInput = { id: string }`
  - `MarkAllReadInput = { targetUser: string }`
- [x] 2.5 创建 `src/main/db/repositories/notification-repo.ts`
  - `create(input): Promise<NotificationRecord>`
  - `listByUser(targetUser, unreadOnly?): Promise<NotificationRecord[]>`
  - `markRead(id): Promise<NotificationRecord>`
  - `markAllRead(targetUser): Promise<void>`
  - `countUnread(targetUser): Promise<number>`
- [x] 2.6 创建 `src/main/services/notification-service.ts`
  - 封装 repository + `BrowserWindow.getAllWindows().forEach(win.webContents.send(...))` 推送
  - `notifyDecisionRequested({ annotation, projectName })`
  - `notifyCrossRole({ annotation, projectName })`
  - `notifyReplyReceived({ parentAnnotation, reply, projectName })`
  - 所有通知统一使用“根批注 id”写入 `annotationId`；`reply-received` 不把回复本身的子批注 id 当成导航锚点
  - 摘要文案直接由 service 生成，保证与 UX 文案风格一致
  - guard:
    - `assignee` 缺失或 `assignee === author` 时不发 `decision-requested` / `cross-role-mention`
    - `reply.author === parentAnnotation.author` 时不发 `reply-received`
    - `parentAnnotation.author` 以 `agent:` / `system:` 开头时不发 `reply-received`
- [x] 2.7 集成通知触发到 `src/main/services/annotation-service.ts`
  - `update()`：当状态从非 `needs-decision` 变为 `needs-decision` 且存在 `assignee` 时调用 `notifyDecisionRequested`
  - `create()`：当 `type === 'cross-role'` 且存在 `assignee` 时调用 `notifyCrossRole`
  - `create()`：当 `parentId` 存在且父批注作者是其他人类用户时调用 `notifyReplyReceived`
  - 使用 `src/main/services/project-service.ts` 获取 `projectName`
- [x] 2.8 单元测试
  - `tests/unit/main/db/repositories/notification-repo.test.ts`
  - `tests/unit/main/services/notification-service.test.ts`
  - 覆盖 guard、自通知抑制、根批注定位、事件推送

### Task 3: 扩展通知 IPC / preload / 事件白名单 (AC: #4, #7)

- [x] 3.1 更新 `src/shared/ipc-types.ts`
  - 新增 `notification:list`
  - 新增 `notification:mark-read`
  - 新增 `notification:mark-all-read`
  - 新增 `notification:count-unread`
  - 更新 `IpcEventPayloadMap`：加入 `notification:new`
  - 更新 `PreloadEventApi`：加入 `onNotificationNew`
- [x] 3.2 创建 `src/main/ipc/notification-handlers.ts`
  - handler 仅做参数解析 + 调用 `notificationService`
- [x] 3.3 更新 `src/main/ipc/index.ts`
  - 注册 notification handlers
  - 维持 `IpcChannel` exhaustive check 通过
- [x] 3.4 更新 `src/preload/index.ts`
  - 暴露 `notificationList / notificationMarkRead / notificationMarkAllRead / notificationCountUnread`
  - 暴露 `onNotificationNew`
- [x] 3.5 更新 `tests/unit/preload/security.test.ts`
  - 将新方法加入允许白名单
  - 保持“只暴露函数、不暴露原始 `ipcRenderer`”的既有安全合同
- [x] 3.6 单元测试
  - `tests/unit/main/ipc/notification-handlers.test.ts`

### Task 4: 通知 Store 与 hooks (AC: #4, #7)

- [x] 4.1 创建 `src/renderer/src/stores/notificationStore.ts`
  - State：`notifications`, `unreadCount`, `loading`, `error`, `loaded`
  - Actions：
    - `loadNotifications(input: ListNotificationsInput)`
    - `markRead(id: string)`
    - `markAllRead(targetUser: string)`
    - `refreshUnreadCount(targetUser: string)`
    - `reset()`
  - 内部统一按 `createdAt DESC` 排序
  - 使用 `subscribeWithSelector`
- [x] 4.2 创建 `src/renderer/src/modules/notification/hooks/useNotification.ts`
  - `useNotifications()`
  - `useUnreadCount()`
- [x] 4.3 事件集成
  - 监听 `window.api.onNotificationNew`
  - 仅当 `payload.targetUser === userStore.currentUser.id` 时把通知插入 store 并递增 `unreadCount`
  - 不在 `annotationStore` action 内直接调用 `notificationStore`
- [x] 4.4 单元测试
  - `tests/unit/renderer/stores/notificationStore.test.ts`
  - 覆盖加载、排序、事件追加、markRead/markAllRead 计数递减

### Task 5: Alpha 当前用户标识（renderer-local，不新增 main 用户服务） (AC: #1, #2, #3, #4)

- [x] 5.1 创建 `src/shared/user-types.ts`
  - `UserIdentity = { id: string; displayName: string; roleLabel: string }`
  - 导出 `ALPHA_KNOWN_USERS`
    - `user:default` → 我（售前工程师）
    - `user:zhang-zong` → 张总（售前总监）
    - `user:li-jingli` → 李经理（商务经理）
- [x] 5.2 创建 `src/renderer/src/stores/userStore.ts`
  - State：`currentUser`, `knownUsers`
  - Actions：`setCurrentUser(id)`, `addCustomUser(displayName)`
  - `addCustomUser(displayName)` 返回稳定的 `UserIdentity`
  - 自定义用户 id 规则：`user:custom:<slug>`；对规范化后同名输入去重复用，避免同一人生成多个不同 id
  - 使用 Zustand `persist` 写入浏览器 `localStorage`（如 key: `bidwise-current-user`）
  - 默认当前用户为 `user:default`
- [x] 5.3 集成约束
  - `annotationStore.createAnnotation()` 的 `author` 由 `userStore.currentUser.id` 提供
  - `notification:list` / `notification:count-unread` 显式传入 `currentUser.id`
  - 本 Story 不新增 `user-service.ts`、`user-handlers.ts`、`user:*` IPC，也不新增独立“切换身份”设置页
- [x] 5.4 单元测试
  - `tests/unit/renderer/stores/userStore.test.ts`

### Task 6: 待决策指导人选择弹窗与 Alt+D 拦截 (AC: #1, #8)

- [x] 6.1 创建 `src/renderer/src/modules/annotation/components/AssigneePickerModal.tsx`
  - Ant Design `Modal` + `Select`
  - 选项来自 `userStore.knownUsers`
  - 支持自定义输入（`mode="combobox"` 或等价可输入方案）
  - 若输入值未命中现有用户，先调用 `userStore.addCustomUser(displayName)`，再将返回的稳定 id 写入 `assignee`
  - 展示当前批注预览、补充说明输入框、取消/确认按钮
  - 确认逻辑：
    - `annotationStore.updateAnnotation({ id, status: 'needs-decision', assignee })`
    - 若补充说明非空，则创建一条 `human` 子批注
    - 该“补充说明”路径 **不会** 触发 `annotation-feedback`
- [x] 6.2 修改 `src/renderer/src/modules/annotation/components/AnnotationCard.tsx`
  - 扩展 prop 契约：允许父层拦截 `defer` / `request-guidance` / `reply`
  - 当传入 `onRequestGuidance(annotation)` 时，`"标记待决策"` / `"请求指导"` 不再走默认 `updateAnnotation`
  - needs-decision 卡片显示 assignee 文案（优先用 `knownUsers` 映射 displayName，未知用户回退原始 id）
- [x] 6.3 修改 `src/renderer/src/modules/project/components/AnnotationPanel.tsx`
  - 面板自身持有 `activeGuidanceAnnotation` modal state
  - `useKeyboardNavigation` 改为接受 `onRequestGuidance`
  - `Alt+D` 仅对 `pending` 根批注打开 modal；保留 Story 4.2 的输入框 / editor no-op 拦截规则
- [x] 6.4 单元测试
  - `tests/unit/renderer/modules/annotation/components/AssigneePickerModal.test.tsx`
  - `tests/unit/renderer/project/AnnotationPanel.test.tsx`
  - 覆盖按钮路径、Alt+D 路径、已处理卡片 no-op

### Task 7: 批注回复线程 (AC: #5, #6)

- [x] 7.1 创建 `src/renderer/src/modules/annotation/components/AnnotationThread.tsx`
  - 渲染根卡片下方线程
  - 回复列表左缩进 16px，边框/背景与 UX 原型对齐
  - 回复输入区：`TextArea` + 发送按钮
  - 支持加载态 skeleton 与空线程占位
- [x] 7.2 修改 `src/renderer/src/modules/annotation/components/AnnotationCard.tsx`
  - `"回复"` 动作可由父层切换线程展开
  - 根卡片显示 `N 条回复` 链接和回复计数
  - `reply-received` 导航命中时允许自动展开线程
- [x] 7.3 更新 `src/renderer/src/stores/annotationStore.ts`
  - 新增 `repliesByParent: Record<string, AnnotationRecord[]>`
  - 新增 `replyLoadingByParent: Record<string, boolean>`
  - 新增 `loadReplies(parentId: string)`
  - `createAnnotation()` 当 `parentId` 存在时，把返回值追加到对应 `repliesByParent[parentId]`（按 `createdAt ASC`）
- [x] 7.4 创建 `src/renderer/src/modules/annotation/hooks/useAnnotationReplies.ts`
  - 返回 `{ replies, loading, loadReplies }`
- [x] 7.5 回复提交流程
  - 显式回复一律写为 `type: 'human'`
  - `author` 使用 `userStore.currentUser.id`
  - `sectionId` 复用父批注的 `sectionId`
  - 4.4 Alpha 的可见回复入口仅挂在根批注线程下，提交时 `parentId` 统一写为根批注 id
  - schema / repo 仍保留自引用能力，但本 Story **不** 实现 reply-to-reply 的独立 UI
- [x] 7.6 单元测试
  - `tests/unit/renderer/modules/annotation/components/AnnotationThread.test.tsx`
  - 覆盖懒加载、正序渲染、回复提交、自动展开

### Task 8: AI 反馈迭代（复用现有 generate agent） (AC: #6)

- [x] 8.1 创建 `src/main/prompts/annotation-feedback.prompt.ts`
  - 导出类型化函数：
    ```ts
    (context: {
      originalAnnotationContent: string
      originalAnnotationType: 'ai-suggestion' | 'adversarial' | 'score-warning'
      userFeedback: string
      sectionContent: string
    }) => string
    ```
- [x] 8.2 修改 `src/main/services/agent-orchestrator/agents/generate-agent.ts`
  - 新增 `mode: 'annotation-feedback'` 分支
  - **不新增新的 `AgentType`**，继续通过 `agentType: 'generate'` 调用
  - 复用现有 `task:progress` 语义：`analyzing` → `generating`
- [x] 8.3 修改 `src/renderer/src/modules/annotation/components/AnnotationThread.tsx`
  - 当父批注类型属于 `ai-suggestion | adversarial | score-warning` 且本次提交来自显式“回复”输入框时：
    - 先创建人类子批注
    - 再调用 `window.api.agentExecute({ agentType: 'generate', context: { mode: 'annotation-feedback', ... } })`
    - 监听 `onTaskProgress` + 轮询 `agentStatus`
    - 完成后通过 `annotationStore.createAnnotation()` 追加新的 `ai-suggestion` 子批注
  - `sectionContent` 取自当前 `documentStore.content` + 现有 `currentSection`；仅当 `currentSection.sectionKey === parent.sectionId` 时传真实章节正文，否则传空字符串并让 prompt 显式说明上下文受限
- [x] 8.4 约束
  - AI 反馈只由 `AnnotationThread` 的显式回复路径触发
  - `AssigneePickerModal` 的补充说明不触发 AI 反馈
  - 不在 main 侧新增“任务完成自动写批注”的隐藏回调，保持与 Story 4.3 `AskSystemDialog` 一致的 renderer-owned 轮询模式
- [x] 8.5 单元测试
  - `tests/unit/main/services/agent-orchestrator/agents/generate-agent.test.ts`
  - `tests/unit/renderer/modules/annotation/components/AnnotationThread.test.tsx`
  - 覆盖 mode 分支、进度展示、完成后 AI 子批注创建

### Task 9: 通知铃铛、面板与导航定位桥 (AC: #4, #7)

- [x] 9.1 创建 `src/renderer/src/modules/notification/constants/notification-icons.ts`
  - `decision-requested` → warning/orange
  - `reply-received` → reply/blue
  - `cross-role-mention` → at-sign/green
- [x] 9.2 创建 `src/renderer/src/modules/notification/components/NotificationBell.tsx`
  - `BellOutlined` + `Badge`
  - 挂在 `ProjectWorkspace` 顶部标题栏，位于设置按钮之前
  - 组件初始化时刷新当前用户未读数
- [x] 9.3 创建 `src/renderer/src/modules/notification/components/NotificationPanel.tsx`
  - 列表显示项目名、摘要、相对时间
  - `aria-label` 额外包含从 `sectionId` 推导的章节标题（如可解析）
  - 空状态与 `"全部已读"` 行为遵循 story-level UX spec / PNG
- [x] 9.4 修改 `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
  - 接入 `NotificationBell`
  - 使用 `react-router-dom` `navigate(..., { state })` 或等价 route-state 方案传递：
    - `focusAnnotationId`
    - `focusSectionId`
    - `expandThread`（仅 `reply-received`）
  - 如果当前不在目标项目或不在 `proposal-writing` 阶段，先导航到目标项目并切换到 `proposal-writing`
- [x] 9.5 修改 `src/renderer/src/modules/project/components/AnnotationPanel.tsx`
  - 增加可选 prop：`requestedFocusAnnotationId?: string | null`
  - 增加可选 prop：`requestedExpandThreadParentId?: string | null`
  - 当请求 id 命中当前列表时，把本地 `focusedIndex` 对齐到目标卡片并 `scrollIntoView`
  - **不要**继续依赖“现有 focusedIndex 自然就能跨路由定位”的错误假设
- [x] 9.6 通知点击导航逻辑
  - `markRead(id)` 成功后再执行导航
  - 用通知中的根批注 `annotationId` 做定位锚点
  - `reply-received` 额外展开对应线程
- [x] 9.7 单元测试
  - `tests/unit/renderer/modules/notification/components/NotificationBell.test.tsx`
  - `tests/unit/renderer/modules/notification/components/NotificationPanel.test.tsx`
  - `tests/unit/renderer/project/ProjectWorkspace.test.tsx`

### Task 10: 测试矩阵与 E2E (AC: #1-#8)

- [x] 10.1 单元 / 集成
  - `tests/unit/main/db/repositories/annotation-repo.test.ts`
  - `tests/unit/main/services/annotation-service.test.ts`
  - `tests/unit/main/db/repositories/notification-repo.test.ts`
  - `tests/unit/main/services/notification-service.test.ts`
  - `tests/unit/main/ipc/annotation-handlers.test.ts`
  - `tests/unit/main/ipc/notification-handlers.test.ts`
  - `tests/unit/preload/security.test.ts`
  - `tests/unit/renderer/stores/annotationStore.test.ts`
  - `tests/unit/renderer/stores/notificationStore.test.ts`
  - `tests/unit/renderer/stores/userStore.test.ts`
  - `tests/unit/renderer/modules/annotation/components/AssigneePickerModal.test.tsx`
  - `tests/unit/renderer/modules/annotation/components/AnnotationThread.test.tsx`
  - `tests/unit/renderer/modules/notification/components/NotificationBell.test.tsx`
  - `tests/unit/renderer/modules/notification/components/NotificationPanel.test.tsx`
  - `tests/unit/renderer/project/AnnotationPanel.test.tsx`
  - `tests/unit/renderer/project/ProjectWorkspace.test.tsx`
- [x] 10.2 E2E：`tests/e2e/stories/story-4-4-pending-decision-cross-role-notification.spec.ts`
  - 场景 1：`Alt+D` / `"请求指导"` → 选择指导人 → 验证 `needs-decision + assignee + decision-requested`
  - 场景 2：展开线程并回复 → 验证子批注正序显示与 `reply-received`
  - 场景 3：回复 AI 批注 → 验证 renderer 侧 task 轮询与 AI 子批注落库
  - 场景 4：通知铃铛 Badge、打开面板、点击通知跳转到根批注并展开线程
  - 场景 5：使用 seed 数据验证 `cross-role` + `assignee` 的通知触发；不要求本 Story 新增独立跨角色创作界面
- [x] 10.3 验证命令
  - `pnpm test`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`

## Dev Notes

### Story 在 Epic 4 中的位置

```text
Story 4.1 (done): [Enabler] Annotation Service 基础架构与批注数据模型
Story 4.2 (done): 批注卡片与五色分层着色
Story 4.3 (done): 智能批注面板与上下文优先级排序
→ Story 4.4 (this): 待决策标记与跨角色批注通知 — Epic 4 最后一个 story
```

Story 4.4 必须直接复用 4.1 的 SQLite-first + sidecar mirror、4.2 的卡片动作语义、4.3 的 Ask System `generate` agent + task progress 轮询模式。不要重新发明第二套通知、任务或用户系统。

### 核心数据流

```text
请求指导：
  AnnotationCard / Alt+D
    → AnnotationPanel 打开 AssigneePickerModal
    → annotationStore.updateAnnotation({ id, status: 'needs-decision', assignee })
    → IPC annotation:update
    → annotationService.update()
      → annotationRepo.update()
      → notificationService.notifyDecisionRequested()   // guard: 非自通知
      → syncToSidecar(includeReplies: true)
      → BrowserWindow.webContents.send('notification:new', notification)
    → notificationStore 只在 payload.targetUser === currentUser.id 时追加通知
```

```text
线程回复：
  AnnotationThread submit
    → annotationStore.createAnnotation({ ..., parentId, author: currentUser.id })
    → IPC annotation:create
    → annotationService.create()
      → annotationRepo.create()
      → notificationService.notifyReplyReceived()       // guard: 仅其他人类作者
      → syncToSidecar(includeReplies: true)
    → renderer 追加 repliesByParent[parentId]
```

```text
AI 反馈迭代：
  AnnotationThread human reply created
    → window.api.agentExecute({ agentType: 'generate', context: { mode: 'annotation-feedback', ... } })
    → task-queue / task:progress / agentStatus
    → renderer progressive reveal
    → annotationStore.createAnnotation({ type: 'ai-suggestion', parentId, ... })
```

```text
通知跳转：
  NotificationPanel click
    → notificationStore.markRead(id)
    → navigate('/project/:id', { state: { focusSectionId, focusAnnotationId, expandThread } })
    → ProjectWorkspace 切到 proposal-writing 并展开 AnnotationPanel
    → AnnotationPanel 对齐 focusedIndex 到 requestedFocusAnnotationId
    → 如为 reply-received，则自动展开对应线程
```

### 现有基础设施（禁止重复实现）

| 组件 | 路径 | 用途 |
|------|------|------|
| `AnnotationRecord` / CRUD 输入类型 | `src/shared/annotation-types.ts` | 4.1 建立的批注共享契约，本 Story 仅扩展字段，不改基本语义 |
| `annotationStore` | `src/renderer/src/stores/annotationStore.ts` | 4.1 CRUD store，4.4 只在其上补 replies state |
| `AnnotationCard` | `src/renderer/src/modules/annotation/components/AnnotationCard.tsx` | 4.2 已建立动作按钮与状态渲染；4.4 通过 callback 拦截 guidance/reply |
| `AnnotationPanel` | `src/renderer/src/modules/project/components/AnnotationPanel.tsx` | 4.3 已建立排序/过滤/键盘导航壳层 |
| `AskSystemDialog` | `src/renderer/src/modules/annotation/components/AskSystemDialog.tsx` | 4.3 renderer-owned task progress + poll + progressive reveal 参考实现 |
| `useCurrentSection` | `src/renderer/src/modules/annotation/hooks/useCurrentSection.ts` | 当前章节 key/label 推导 |
| `annotationService` | `src/main/services/annotation-service.ts` | SQLite + sidecar mirror 的唯一批注业务入口 |
| `AnnotationRepository` | `src/main/db/repositories/annotation-repo.ts` | 批注查询与写入 |
| `projectService` | `src/main/services/project-service.ts` | 读取 `projectName` 供通知文案与持久化使用 |
| `generateAgentHandler` | `src/main/services/agent-orchestrator/agents/generate-agent.ts` | 4.3 已有 `ask-system` 模式，本 Story 在同一 agent 上新增 `annotation-feedback` |
| `task-queue` / `progressEmitter` | `src/main/services/task-queue/` | 现有异步任务白名单与 `task:progress` 推送 |
| `IPC_CHANNELS` / `IpcEventPayloadMap` | `src/shared/ipc-types.ts` | request-response 与 push event 的唯一类型源 |
| `createIpcHandler` | `src/main/ipc/create-handler.ts` | handler 必须继续复用统一 response wrapper |
| `tests/unit/preload/security.test.ts` | `tests/unit/preload/security.test.ts` | preload 暴露白名单安全护栏 |

### Alpha 阶段边界

- **当前用户身份**：Alpha 仅提供 renderer-local 的轻量 `userStore`；不做完整用户认证，也不在 main 侧引入 `electron-store` 或新的 `user:*` IPC。
- **自定义指导人**：允许通过弹窗录入临时指导人，但必须归一化为稳定的 `user:custom:<slug>` 身份并在 `knownUsers` 中去重复用。
- **通知持久化范围**：notifications 只落 SQLite，不写入 `proposal.meta.json` sidecar；sidecar 继续仅镜像 annotations / source attributions / baseline validations 等项目元数据。
- **跨角色创作入口**：本 Story 不新增独立的成本视图/商务批注创作界面；FR30 基础设施先在 4.4 落地，真正的 cross-role 业务入口由后续 Story 6.4 等复用。
- **AI 反馈表现**：沿用 4.3 Ask System 的阶段进度 + 完成后渐进揭示；不扩展 provider token streaming。
- **通知导航**：以“根批注 id + sectionId + 可选 expandThread”完成定位；不假设现有 `focusedIndex` 能自动跨路由恢复。
- **线程深度**：4.4 Alpha 只实现“根批注下单层可见线程”；更深层 reply-to-reply UI 留给后续 Story，避免当前实现范围失控。

### 关键实现决策

1. **线程模型继续使用 `parentId` 自引用**
   - 回复仍然是 annotation，不单独建 `replies` 表。
2. **`assignee` 统一承担“指导目标 / 定向跨角色通知目标”**
   - 避免再引入第二个 `targetUser` 风格字段到 annotations。
3. **通知表独立于 annotations**
   - 已读状态与生命周期不污染批注表。
4. **回复列表正序，根批注列表倒序**
   - 根列表保持面板近期优先；线程内部保持对话可读性。
5. **AI 反馈继续复用 `generate` agent**
   - 与 4.3 一致，减少新 AgentType / preload / task wiring 扩散。
6. **通知导航锚点始终使用根批注**
   - `reply-received` 通过 `expandThread` 展开具体上下文，而不是直接定位到子回复卡片。
7. **sidecar 同步必须显式包含 replies**
   - 否则 4.4 的线程能力会被 4.1 既有镜像逻辑意外裁剪。

### 命名规范对照

| 类别 | 规范 | 本 Story 示例 |
|------|------|--------------|
| SQLite 表 | snake_case 复数 | `notifications` |
| SQLite 列 | snake_case | `project_name`, `section_id`, `target_user` |
| IPC 通道 | `{domain}:{action}` | `notification:list`, `annotation:list-replies` |
| IPC 事件 | `{domain}:{event}` | `notification:new` |
| Zustand store | camelCase + Store | `notificationStore`, `userStore` |
| 组件 | PascalCase | `AssigneePickerModal`, `AnnotationThread`, `NotificationBell` |
| hooks | `use` 前缀 | `useNotification`, `useAnnotationReplies` |
| prompt 文件 | `{name}.prompt.ts` | `annotation-feedback.prompt.ts` |

### 禁止事项

- **禁止**在 IPC handler 中写业务逻辑。
- **禁止**手动做 snake_case ↔ camelCase 映射，继续依赖 `CamelCasePlugin`。
- **禁止**把通知写入 `proposal.meta.json` sidecar。
- **禁止**在 `annotationStore` action 内直接调用 `notificationStore`。
- **禁止**为本 Story 新增 `user-service.ts` / `user:*` IPC / `electron-store` 依赖。
- **禁止**绕过 task-queue 直接触发 AI。
- **禁止**依赖现有 `focusedIndex` 作为跨项目通知导航的唯一桥。
- **禁止**修改 4.2 已建立的五色映射与卡片基础视觉合同。

### Project Structure Notes

```text
src/shared/
  annotation-types.ts              ← MODIFY: 添加 parentId / assignee / includeReplies
  notification-types.ts            ← NEW: 通知共享类型
  user-types.ts                    ← NEW: Alpha 已知用户与 UserIdentity
  ipc-types.ts                     ← MODIFY: notification channels + notification:new

src/main/
  db/
    schema.ts                      ← MODIFY: AnnotationTable / NotificationTable
    migrator.ts                    ← MODIFY: 注册 010 / 011
    migrations/
      010_add_annotation_thread_fields.ts   ← NEW
      011_create_notifications.ts           ← NEW
    repositories/
      annotation-repo.ts           ← MODIFY: root-only list + listReplies + includeReplies
      notification-repo.ts         ← NEW
  services/
    annotation-service.ts          ← MODIFY: 集成通知触发 + sidecar includeReplies
    notification-service.ts        ← NEW
    project-service.ts             ← REUSE: 读取 projectName
    agent-orchestrator/agents/
      generate-agent.ts            ← MODIFY: annotation-feedback mode
  prompts/
    annotation-feedback.prompt.ts  ← NEW
  ipc/
    annotation-handlers.ts         ← MODIFY
    notification-handlers.ts       ← NEW
    index.ts                       ← MODIFY

src/preload/
  index.ts                         ← MODIFY: notification invoke + onNotificationNew

src/renderer/src/
  stores/
    annotationStore.ts             ← MODIFY: repliesByParent / replyLoadingByParent
    notificationStore.ts           ← NEW
    userStore.ts                   ← NEW
  modules/annotation/
    components/
      AnnotationCard.tsx           ← MODIFY: guidance/reply callback hooks
      AssigneePickerModal.tsx      ← NEW
      AnnotationThread.tsx         ← NEW
    hooks/
      useAnnotationReplies.ts      ← NEW
  modules/notification/
    components/
      NotificationBell.tsx         ← NEW
      NotificationPanel.tsx        ← NEW
    constants/
      notification-icons.ts        ← NEW
    hooks/
      useNotification.ts           ← NEW
  modules/project/components/
    AnnotationPanel.tsx            ← MODIFY: modal state + requestedFocus bridge
    ProjectWorkspace.tsx           ← MODIFY: bell integration + route-state navigation bridge

tests/
  unit/main/db/repositories/notification-repo.test.ts
  unit/main/services/notification-service.test.ts
  unit/main/ipc/notification-handlers.test.ts
  unit/preload/security.test.ts
  unit/renderer/stores/notificationStore.test.ts
  unit/renderer/stores/userStore.test.ts
  unit/renderer/modules/annotation/components/AssigneePickerModal.test.tsx
  unit/renderer/modules/annotation/components/AnnotationThread.test.tsx
  unit/renderer/modules/notification/components/NotificationBell.test.tsx
  unit/renderer/modules/notification/components/NotificationPanel.test.tsx
  e2e/stories/story-4-4-pending-decision-cross-role-notification.spec.ts
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4] — 4.4 用户故事与 Epic 4 边界
- [Source: _bmad-output/planning-artifacts/prd.md#FR27-FR30] — 双向批注、待决策、跨角色通知来源
- [Source: _bmad-output/planning-artifacts/prd.md#旅程 1：小周的第一次独立投标] — “请张总指导”业务场景
- [Source: _bmad-output/planning-artifacts/architecture.md#跨切面关注点] — Annotation Service / 异步任务管理
- [Source: _bmad-output/planning-artifacts/architecture.md#sidecar JSON 元数据结构（proposal.meta.json）] — sidecar 仍以 annotations 为镜像主体
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#批注族] — 批注面板 / 卡片 / 微对话通用 UX 约束
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#批注导航快捷键] — `Alt+D` 快捷键来源
- [Source: _bmad-output/implementation-artifacts/4-1-enabler-annotation-service.md] — 4.1 SQLite-first + sidecar mirror 合同
- [Source: _bmad-output/implementation-artifacts/4-2-annotation-card-color-coding.md] — 4.2 action key / Alt+D / 卡片视觉合同
- [Source: _bmad-output/implementation-artifacts/4-3-smart-annotation-panel.md] — 4.3 AnnotationPanel / AskSystemDialog / currentSection 模式
- [Source: _bmad-output/implementation-artifacts/4-4-pending-decision-cross-role-notification-ux/prototype.manifest.yaml] — UX lookup order
- [Source: _bmad-output/implementation-artifacts/4-4-pending-decision-cross-role-notification-ux/ux-spec.md] — story-level UX 规格
- [Source: _bmad-output/implementation-artifacts/4-4-pending-decision-cross-role-notification-ux/exports/ohI8J.png] — AssigneePickerModal 视觉对齐
- [Source: _bmad-output/implementation-artifacts/4-4-pending-decision-cross-role-notification-ux/exports/YZ6W9.png] — AnnotationThread 视觉对齐
- [Source: _bmad-output/implementation-artifacts/4-4-pending-decision-cross-role-notification-ux/exports/MJmaK.png] — NotificationBell + Panel 视觉对齐
- [Source: _bmad-output/implementation-artifacts/4-4-pending-decision-cross-role-notification-ux/exports/EXqZS.png] — 空通知态视觉对齐
- [Source: _bmad-output/implementation-artifacts/4-4-pending-decision-cross-role-notification-ux/prototype.pen] — 结构与交互细节
- [Source: src/main/services/annotation-service.ts] — 4.1 当前 sidecar 同步入口
- [Source: src/main/db/repositories/annotation-repo.ts] — 当前根批注查询基线
- [Source: src/main/services/project-service.ts] — `projectName` 读取基线
- [Source: src/renderer/src/modules/annotation/components/AskSystemDialog.tsx] — renderer-owned task progress + poll 模式参考
- [Source: src/renderer/src/modules/project/components/AnnotationPanel.tsx] — 现有 focusedIndex / Alt+D 键盘导航基线
- [Source: src/shared/ipc-types.ts] — 现有 `task:progress` / preload 合同

### Change Log

- 2026-04-09: `validate-create-story` 修订
  - 补回模板 validation note，并新增 Change Log
  - 将迁移占位符 `0XX_*` 收敛为可直接落地的 `010_*` / `011_*`，并补上 `schema.ts` / `migrator.ts` 更新要求
  - 删除与当前仓库不匹配的 `electron-store` / `user-service` / `user:*` IPC 假设，改为 renderer-local `userStore`
  - 修正 `cross-role` 通知接收者契约：复用 `annotations.assignee` 作为定向通知目标，避免“通知发给谁”缺失
  - 修正 sidecar 风险：明确 `syncToSidecar()` 必须带 `includeReplies: true`，否则回复线程会从 metadata 镜像丢失
  - 修正通知导航契约：不再错误依赖现有 `focusedIndex` 自然跨路由恢复，改为 route-state + `requestedFocusAnnotationId`
  - 修正 AI 反馈实现路径：继续复用 `generate` agent 与 renderer-owned `task:progress` + `agentStatus` 轮询模式，不新增 AgentType，也不要求 main 侧隐藏回调
  - 同步 story-level UX：通知列表视觉继续以项目名 + 摘要 + 时间为主，`sectionId` 保留在 payload/辅助信息中用于导航
  - 收敛 4.4 Alpha 线程范围：UI 仅实现根批注下单层可见回复，避免把实现误扩成递归 reply tree
  - 明确自定义指导人录入规则：使用稳定的 `user:custom:<slug>` 身份并对同名输入去重
- 2026-04-09: 实现验证与测试补全
  - 修复 `notification-service.ts` 未使用 logger 变量导致 typecheck 失败
  - 修复 9 个 prettier 格式化警告
  - 补全 5 个缺失的组件/E2E 测试文件（AssigneePickerModal, AnnotationThread, NotificationBell, NotificationPanel, E2E story-4-4）
  - 全套回归验证通过：173/174 test files, 1502 tests, lint 0 warnings, typecheck pass, build success

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- 修复 `notification-service.ts` 中未使用的 `_logger` 变量导致 typecheck 失败
- 修复 9 个 prettier 格式化警告（eslint --fix）
- 补充 5 个缺失的测试文件（AssigneePickerModal, AnnotationThread, NotificationBell, NotificationPanel 组件测试及 E2E 测试）

### Completion Notes List

- ✅ Task 1-10 全部实现完成，所有子任务均已验证
- ✅ 批注数据模型扩展（parentId, assignee）与迁移 010/011 就绪
- ✅ 通知服务完整实现，包含 guard（自通知抑制、agent/system 作者过滤）
- ✅ IPC/preload 层扩展，包含 notification:list/mark-read/mark-all-read/count-unread 及 notification:new 事件
- ✅ notificationStore + userStore 渲染层状态管理
- ✅ AssigneePickerModal 指导人选择弹窗，支持自定义用户录入与去重
- ✅ AnnotationThread 线程回复组件，支持 AI 反馈回调
- ✅ NotificationBell + NotificationPanel 通知铃铛与面板
- ✅ AI 反馈迭代复用 generate agent annotation-feedback mode
- ✅ 通知导航桥：route-state + requestedFocusAnnotationId + expandThread
- ✅ 173/174 测试文件通过（1502 tests），唯一失败为预存在的 docx-bridge 集成测试
- ✅ lint 0 error 0 warning / typecheck 通过 / build 成功

### File List

**新增文件:**
- src/main/db/migrations/010_add_annotation_thread_fields.ts
- src/main/db/migrations/011_create_notifications.ts
- src/main/db/repositories/notification-repo.ts
- src/main/ipc/notification-handlers.ts
- src/main/prompts/annotation-feedback.prompt.ts
- src/main/services/notification-service.ts
- src/shared/notification-types.ts
- src/shared/user-types.ts
- src/renderer/src/modules/annotation/components/AnnotationThread.tsx
- src/renderer/src/modules/annotation/components/AssigneePickerModal.tsx
- src/renderer/src/modules/annotation/hooks/useAnnotationReplies.ts
- src/renderer/src/modules/notification/constants/notification-icons.ts
- src/renderer/src/modules/notification/components/NotificationBell.tsx
- src/renderer/src/modules/notification/components/NotificationPanel.tsx
- src/renderer/src/modules/notification/hooks/useNotification.ts
- src/renderer/src/stores/notificationStore.ts
- src/renderer/src/stores/userStore.ts
- tests/unit/main/db/repositories/notification-repo.test.ts
- tests/unit/main/ipc/notification-handlers.test.ts
- tests/unit/main/services/notification-service.test.ts
- tests/unit/renderer/stores/notificationStore.test.ts
- tests/unit/renderer/stores/userStore.test.ts
- tests/unit/renderer/modules/annotation/components/AssigneePickerModal.test.tsx
- tests/unit/renderer/modules/annotation/components/AnnotationThread.test.tsx
- tests/unit/renderer/modules/notification/components/NotificationBell.test.tsx
- tests/unit/renderer/modules/notification/components/NotificationPanel.test.tsx
- tests/e2e/stories/story-4-4-pending-decision-cross-role-notification.spec.ts

**修改文件:**
- src/main/db/schema.ts
- src/main/db/migrator.ts
- src/main/db/repositories/annotation-repo.ts
- src/main/services/annotation-service.ts
- src/main/services/agent-orchestrator/agents/generate-agent.ts
- src/main/ipc/annotation-handlers.ts
- src/main/ipc/index.ts
- src/preload/index.ts
- src/shared/annotation-types.ts
- src/shared/ipc-types.ts
- src/renderer/src/stores/annotationStore.ts
- src/renderer/src/modules/annotation/components/AnnotationCard.tsx
- src/renderer/src/modules/project/components/AnnotationPanel.tsx
- src/renderer/src/modules/project/components/ProjectWorkspace.tsx
- tests/unit/main/db/repositories/annotation-repo.test.ts
- tests/unit/main/services/annotation-service.test.ts
- tests/unit/main/ipc/annotation-handlers.test.ts
- tests/unit/preload/security.test.ts
- tests/unit/renderer/stores/annotationStore.test.ts
- tests/unit/renderer/project/AnnotationPanel.test.tsx
- tests/unit/renderer/project/ProjectWorkspace.test.tsx
