# Story 2.3: 招标文件导入与异步解析框架

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 上传招标文件后系统自动异步解析,
So that 我不用手动逐页阅读，且解析期间可以做其他事。

## Acceptance Criteria

### AC1: 拖拽上传触发异步解析

- **Given** 我在需求分析阶段（SOP Stage 1 — `requirements-analysis`）
- **When** 拖拽上传 PDF 或 Word 招标文件
- **Then** 系统开始异步解析，显示进度条和预估时间
- [Source: epics.md Story 2.3 AC1, FR9, UX-DR15]

### AC2: 解析不阻塞 UI

- **Given** 解析正在进行
- **When** 用户切换到其他项目或章节
- **Then** 解析不中断，完成后通过 Toast 通知回调
- [Source: epics.md Story 2.3 AC2, NFR2]

### AC3: 文件格式支持

- **Given** 支持的文件格式
- **When** 导入文件
- **Then** 支持 PDF（文本型 PDF 提取全文；扫描件 PDF 提取可用文本并标记"建议 OCR"）和 Word（.docx 完整提取；.doc 格式通过 LibreOffice CLI 自动转换为 .docx 后提取，转换失败时降级提示用户手动另存为 .docx）
- [Source: epics.md Story 2.3 AC3, NFR26 — ".docx/.doc" 均需支持导入]

## Tasks / Subtasks

### Task 1: 共享类型定义 (AC: 1, 2, 3)

- [ ] 1.1 创建 `src/shared/analysis-types.ts`：
  - `TenderFormat = 'pdf' | 'docx' | 'doc'`
  - `TenderMeta = { originalFileName: string; format: TenderFormat; fileSize: number; pageCount: number; importedAt: string; parseCompletedAt?: string }`
  - `TenderSection = { id: string; title: string; content: string; pageStart: number; pageEnd: number; level: number }` — 文档章节结构
  - `ParsedTender = { meta: TenderMeta; sections: TenderSection[]; rawText: string; totalPages: number; hasScannedContent: boolean }` — `hasScannedContent` 标记是否检测到扫描件内容（文本密度低），提示 Story 2.4 OCR
  - `ImportTenderInput = { projectId: string; filePath: string }` — IPC 输入
  - `ImportTenderResult = { taskId: string }` — IPC 返回（异步，入队即返回）
  - `GetTenderInput = { projectId: string }` — 查询已解析结果
- [ ] 1.2 扩展 `src/shared/ipc-types.ts`：
  - `IPC_CHANNELS` 新增：`ANALYSIS_IMPORT_TENDER: 'analysis:import-tender'`, `ANALYSIS_GET_TENDER: 'analysis:get-tender'`
  - `IpcChannelMap` 新增：
    - `'analysis:import-tender'` → input: `ImportTenderInput`, output: `ImportTenderResult`
    - `'analysis:get-tender'` → input: `GetTenderInput`, output: `ParsedTender | null`
- [ ] 1.3 扩展 `src/shared/constants.ts` ErrorCode：
  - `TENDER_IMPORT = 'TENDER_IMPORT'`
  - `TENDER_PARSE = 'TENDER_PARSE'`
  - `UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT'`
  - `TENDER_NOT_FOUND = 'TENDER_NOT_FOUND'`

### Task 2: npm 依赖 (AC: 3)

- [ ] 2.1 `pnpm add pdf-parse mammoth`
- [ ] 2.2 `pnpm add -D @types/pdf-parse`（如可用）
- [ ] 2.3 验证 Electron 主进程中可正常 import（注意 native module 兼容性，pdf-parse 底层用 pdfjs-dist 纯 JS 实现，无 native 问题）

### Task 3: Document Parser Service — 文本提取 (AC: 1, 3)

- [ ] 3.1 创建 `src/main/services/document-parser/pdf-extractor.ts`：
  - `extractPdfText(filePath: string): Promise<PdfExtractResult>`
  - `PdfExtractResult = { text: string; pageCount: number; pages: { pageNum: number; text: string }[]; isScanned: boolean }`
  - 使用 `pdf-parse` 读取文件 buffer → `pdfParse(buffer)` → 提取 `data.text`、`data.numpages`
  - 扫描件检测：如果每页平均字符数 < 50 且页数 > 1，标记 `isScanned = true`
  - 错误处理：文件损坏 / 密码保护 → 抛 `BidWiseError(TENDER_PARSE, '...')`
- [ ] 3.2 创建 `src/main/services/document-parser/word-extractor.ts`：
  - `extractWordText(filePath: string): Promise<WordExtractResult>`
  - `WordExtractResult = { text: string; html: string; sections: { title: string; content: string; level: number }[] }`
  - 使用 `mammoth.extractRawText({ path: filePath })` 提取纯文本
  - 使用 `mammoth.convertToHtml({ path: filePath })` 提取 HTML，从 `<h1>`~`<h6>` 标签解析标题层级以识别章节
  - .doc 格式处理：根据扩展名判断，先尝试通过 LibreOffice CLI 自动转换为 .docx（`soffice --headless --convert-to docx --outdir {tmpDir} {filePath}`），转换成功后走 .docx 提取路径；转换失败（LibreOffice 未安装或执行出错）时降级抛 `BidWiseError(UNSUPPORTED_FORMAT, '.doc 格式自动转换失败，请安装 LibreOffice 或手动将文件另存为 .docx 格式后重试')`
  - 创建辅助函数 `convertDocToDocx(filePath: string): Promise<string>` — 返回转换后的 .docx 临时文件路径
  - LibreOffice 检测：使用 `which soffice`（macOS/Linux）或注册表查找（Windows），缓存检测结果
- [ ] 3.3 创建 `src/main/services/document-parser/section-detector.ts`：
  - `detectSections(text: string, format: TenderFormat, htmlSections?: ...): TenderSection[]`
  - PDF 路径：纯正则 + 启发式规则检测招标文件章节模式：
    - `第X章/节/部分` 模式：`/^第[一二三四五六七八九十百]+[章节部分]/m`
    - 数字编号模式：`/^\d+[.、]\s*.+/m`、`/^\d+\.\d+\s*.+/m`
    - 中文编号模式：`/^[一二三四五六七八九十]+[、.]\s*.+/m`
    - 常见标题关键字：总则、技术要求、评分标准(办法)、商务条款、投标须知、资格要求等
  - Word 路径：优先使用 HTML 标题层级，回退正则
  - 为每个 section 生成 UUID id
  - 无结构文档返回单一 section（整份文档为一个章节）
  - Alpha 精度目标：80% 标准招标文件章节正确分割
- [ ] 3.4 创建 `src/main/services/document-parser/rfp-parser.ts`：
  - `RfpParser` 类：
    - `parse(filePath: string, options: { onProgress?: (progress: number, message: string) => void }): Promise<ParsedTender>`
    - 流程：
      1. 检测文件格式（扩展名）→ `onProgress(5, '检测文件格式...')`
      2. 调用对应 extractor 提取文本 → `onProgress(40, '提取文档文本...')`
      3. 调用 section-detector 识别章节 → `onProgress(70, '识别文档结构...')`
      4. 组装 `ParsedTender` 结果 → `onProgress(90, '整理解析结果...')`
      5. 返回 → `onProgress(100, '解析完成')`
  - 使用 `createLogger('document-parser')` 记录日志
- [ ] 3.5 创建 `src/main/services/document-parser/index.ts`：
  - 导出 `rfpParser` 单例
  - 导出所有公共类型

### Task 4: Tender Import 编排服务 (AC: 1, 2)

- [ ] 4.1 创建 `src/main/services/document-parser/tender-import.ts`：
  - `TenderImportService` 类：
    - 构造依赖：`rfpParser`、`taskQueue`
    - `importTender(input: ImportTenderInput): Promise<ImportTenderResult>`
      1. 验证文件存在（`fs.access`）且格式受支持（.pdf / .docx / .doc）
      2. 从 `projectRepo.findById(projectId)` 获取项目信息，使用 `project.rootPath` 确定项目根路径（不硬编码 `data/projects/{projectId}/`，参考 `project-service.ts:21`）
      3. 创建 `{rootPath}/tender/` 子目录（`fs.mkdir` recursive）
      4. 复制原始文件到 `{rootPath}/tender/original/{originalFileName}`
      5. `taskQueue.enqueue({ category: 'import', input: { projectId, filePath: copiedPath, originalFileName } })`
         - **注意**：`enqueue()` 的 `input` 参数类型为 `unknown`，内部自行序列化——调用方传原始对象，**不要** 手动 `JSON.stringify`
      6. 以 fire-and-forget 启动 `taskQueue.execute(taskId, executor)` 后台执行
      7. 同步返回 `{ taskId }`
    - Task executor 内部：
      1. 调用 `rfpParser.parse(filePath, { onProgress: (p, msg) => updateProgress(p, msg) })`
      2. 将 `ParsedTender` 写入 `tender/tender-parsed.json`（JSON.stringify 格式化）
      3. 将 `TenderMeta` 写入 `tender/tender-meta.json`
    - `getTender(projectId: string): Promise<ParsedTender | null>`
      - 通过 `projectRepo.findById(projectId)` 获取 `rootPath`，读取 `{rootPath}/tender/tender-parsed.json`
      - 文件不存在返回 `null`
- [ ] 4.2 导出 `tenderImportService` 单例

### Task 5: IPC Handlers — analysis 域 (AC: 1, 2)

- [ ] 5.1 创建 `src/main/ipc/analysis-handlers.ts`：
  - `registerAnalysisHandlers()` 导出 + `RegisteredAnalysisChannels` 类型导出
  - `analysis:import-tender` → `tenderImportService.importTender(input)` — 返回 `ImportTenderResult`
  - `analysis:get-tender` → `tenderImportService.getTender(input.projectId)` — 返回 `ParsedTender | null`
  - 使用 `createIpcHandler` 工厂（复用 Story 1.3/2.2 已有模式）
  - handler 仅做参数解析和结果包装——业务逻辑在 service 层
- [ ] 5.2 更新 `src/main/ipc/index.ts`：
  - 显式调用 `registerAnalysisHandlers()`
  - `_AllRegistered` 扩展包含 `RegisteredAnalysisChannels`，保持穷举校验

### Task 6: Preload 扩展 (AC: 1)

- [ ] 6.1 更新 `src/preload/index.ts`：
  - 新增 `analysisImportTender(input: ImportTenderInput): Promise<ApiResponse<ImportTenderResult>>`
  - 新增 `analysisGetTender(input: GetTenderInput): Promise<ApiResponse<ParsedTender | null>>`
- [ ] 6.2 更新 `src/preload/index.d.ts` 类型声明同步
- [ ] 6.3 编译时类型安全——新增通道未实现会触发编译错误

### Task 6A: task:get-status IPC 接口创建（前置依赖） (AC: 2)

> **背景**：Story 2.2 创建了 task-queue 服务并暴露了 `task:list` 和 `task:cancel` IPC 接口及 preload 方法（`taskList`、`taskCancel`），但 **未暴露按 ID 查询单个任务状态的接口**。本 Story 的 `AnalysisView`（Task 8.4）和 `useParseProgress`（Task 9.1）需要通过 `taskGetStatus(taskId)` 轮询任务终态（completed / failed / cancelled），因此必须先创建此接口。

- [ ] 6A.1 扩展 `src/shared/ipc-types.ts`：
  - `IPC_CHANNELS` 新增：`TASK_GET_STATUS: 'task:get-status'`
  - `IpcChannelMap` 新增：`'task:get-status'` → input: `{ taskId: string }`, output: `TaskRecord | null`
- [ ] 6A.2 扩展 task-queue IPC handler（`src/main/ipc/task-handlers.ts` 或 Story 2.2 已有的对应文件）：
  - `task:get-status` handler → 调用 `taskQueue.getTask(taskId)` 返回 `TaskRecord | null`
  - 使用 `createIpcHandler` 工厂（复用 Story 2.2 模式）
  - handler 仅做参数解析和结果包装——task-queue 服务已有 `getTask()` 方法
- [ ] 6A.3 更新 `src/preload/index.ts`：
  - 新增 `taskGetStatus(taskId: string): Promise<ApiResponse<TaskRecord | null>>`
- [ ] 6A.4 更新 `src/preload/index.d.ts` 类型声明同步
- [ ] 6A.5 更新 `src/main/ipc/index.ts`：确保 `task:get-status` handler 已注册 + `Registered*Channels` 穷举包含新通道

### Task 7: analysisStore (AC: 1, 2)

- [ ] 7.1 创建 `src/renderer/src/stores/analysisStore.ts`：
  - **State:**
    - `tenderMeta: TenderMeta | null`
    - `parsedTender: ParsedTender | null`
    - `importTaskId: string | null` — 当前导入任务 ID
    - `parseProgress: number` — 0-100
    - `parseMessage: string` — 阶段消息（如"提取文档文本..."）
    - `loading: boolean`
    - `error: string | null`
  - **Actions:**
    - `importTender(projectId: string, filePath: string): Promise<void>` — 调用 `window.api.analysisImportTender()`，设 importTaskId + loading
    - `fetchTenderResult(projectId: string): Promise<void>` — 调用 `window.api.analysisGetTender()`，设 parsedTender
    - `updateParseProgress(progress: number, message: string): void` — 由 task:progress 事件驱动
    - `setParseCompleted(result: ParsedTender): void`
    - `setError(error: string): void`
    - `reset(): void`
- [ ] 7.2 在 `src/renderer/src/stores/index.ts` 导出 analysisStore

### Task 8: Analysis UI 组件 (AC: 1, 2, 3)

- [ ] 8.1 创建 `src/renderer/src/modules/analysis/components/TenderUploadZone.tsx`：
  - Ant Design `Upload.Dragger` 组件
  - accept: `.pdf,.docx,.doc`；.doc 文件导入时后端自动尝试转换（见 Task 3.2），无需前端拦截
  - 文件大小限制 200MB，超出显示友好提示
  - 空状态引导文案（UX 空状态设计规范）："本阶段目标：理解甲方要什么。请上传招标文件（支持 PDF、Word 格式），系统将自动解析文档结构。"
  - 上传后通过 `(file as any).path` 获取 Electron 扩展的文件路径（**不走 HTTP 上传**——本地 Electron 应用直接读路径）
  - 调用 `analysisStore.importTender(projectId, filePath)`
  - 解析中状态：禁用上传区域
  - 已有文件状态：显示文件名 + 格式 + "重新导入"按钮
- [ ] 8.2 创建 `src/renderer/src/modules/analysis/components/ParseProgressPanel.tsx`：
  - Ant Design `Progress` 组件（type="line"）
  - 显示进度百分比 + 当前阶段文案（parseMessage）
  - 预估剩余时间（线性推算：`remaining = (elapsed / progress) * (100 - progress)`，最小显示"< 1 分钟"）
  - "取消解析"按钮 → `window.api.taskCancel(taskId)`
  - 完成时切换为成功状态 + "查看解析结果"
- [ ] 8.3 创建 `src/renderer/src/modules/analysis/components/TenderResultSummary.tsx`：
  - 解析完成后的结果概要
  - 显示：文件名、页数、检测到的章节数量
  - 章节列表：Ant Design `Tree` 展示标题层级
  - `hasScannedContent === true` 时显示 Alert："检测到部分页面可能为扫描件，建议使用 OCR 功能提升准确率"
  - 此组件为 Story 2.5（需求结构化抽取）的入口占位
- [ ] 8.4 创建 `src/renderer/src/modules/analysis/components/AnalysisView.tsx`：
  - Stage 1（需求分析，`requirements-analysis`）主视图组件
  - 条件渲染三种状态：
    - 无招标文件 → `TenderUploadZone`
    - 解析中 → `ParseProgressPanel`
    - 解析完成 → `TenderResultSummary`
  - 组件挂载时：检查是否已有解析结果（`fetchTenderResult`）
  - 订阅 `window.api.onTaskProgress(callback)` 更新进度状态；组件卸载时调用返回的 unlisten 函数清理
  - **任务状态轮询**：`TaskProgressEvent` 仅包含 `progress`/`message` 字段，不携带 failed/cancelled 状态。组件需定时调用 `window.api.taskGetStatus(taskId)`（由本 Story **Task 6A** 创建，Story 2.2 仅暴露了 `taskList` 和 `taskCancel`）查询任务最终状态：
    - `status === 'completed'` → 调用 `fetchTenderResult` 加载结果
    - `status === 'failed'` → 提取 `task.error` 显示失败 UI
    - `status === 'cancelled'` → 重置为上传初始状态
  - 轮询策略：进度事件停滞 >10s 时启动轮询（间隔 3s），任务终态后停止
  - 解析完成时触发 Toast：`message.success('招标文件解析完成')`（Ant Design message，3s 自动消失）
  - 解析失败时：`message.error({ content: '解析失败：{errorMessage}', duration: 0 })`（手动关闭，附重试建议）
- [ ] 8.5 更新 `src/renderer/src/modules/analysis/types.ts`：组件 Props 类型定义

### Task 9: Analysis hooks (AC: 1, 2)

- [ ] 9.1 创建 `src/renderer/src/modules/analysis/hooks/useAnalysis.ts`：
  - `useImportTender(projectId: string)` — 封装导入流程，返回 `{ importTender, loading, error }`
  - `useParseProgress(taskId: string | null)` — 订阅 `onTaskProgress`，过滤当前 taskId 事件；进度停滞 >10s 时启动 `taskGetStatus(taskId)` 轮询（3s 间隔）检测 failed/cancelled 终态；解析完成时自动 `fetchTenderResult`，返回 `{ progress, message, status }`
  - `useTenderResult(projectId: string)` — 组件挂载时加载已有解析结果

### Task 10: Stage 1（需求分析）路由集成 (AC: 1)

- [ ] 10.1 确认 Story 1-6 SOP 导航已建立 `requirements-analysis`（stageNumber: 1）路由或渲染入口
- [ ] 10.2 将 `AnalysisView` 注册为 Stage 1（需求分析，`requirements-analysis`）的主组件——接入已有的 SOP 阶段切换机制
- [ ] 10.3 确保从 SOP 进度条点击"需求分析"可进入 AnalysisView

### Task 11: 项目目录结构 (AC: 1)

- [ ] 11.1 tender-import 服务中按需创建 `tender/` 和 `tender/original/` 子目录（`fs.mkdir({ recursive: true })`）
- [ ] 11.2 确认 `data/projects/{id}/` 基础目录在项目创建时已存在（Story 1.5 建立）

### Task 12: 单元测试 (AC: 全部)

- [ ] 12.1 `tests/unit/main/services/document-parser/pdf-extractor.test.ts`：
  - 正常 PDF 文本提取返回 text + pageCount
  - 空 PDF 返回空文本 + pageCount=0
  - 扫描件检测（低文本密度 → isScanned=true）
  - 损坏文件抛 BidWiseError(TENDER_PARSE)
  - Mock `pdf-parse`
- [ ] 12.2 `tests/unit/main/services/document-parser/word-extractor.test.ts`：
  - 正常 .docx 提取 text + html + sections
  - HTML 标题层级正确映射为 sections
  - .doc 格式：LibreOffice 可用时自动转换后提取成功
  - .doc 格式：LibreOffice 不可用时抛 BidWiseError(UNSUPPORTED_FORMAT) 含降级提示
  - Mock `mammoth` + `child_process.execFile`（LibreOffice CLI）
- [ ] 12.3 `tests/unit/main/services/document-parser/section-detector.test.ts`：
  - "第X章" 模式正确检测
  - 数字编号 "1.1 / 1.2" 模式正确检测
  - 中文编号 "一、/二、" 模式正确检测
  - 嵌套层级正确（1 > 1.1 > 1.1.1）
  - 无结构文档返回单一 section
- [ ] 12.4 `tests/unit/main/services/document-parser/rfp-parser.test.ts`：
  - PDF 解析端到端（format detect → extract → sections → assemble）
  - Word 解析端到端
  - onProgress 回调按预期阶段触发
  - 不支持格式拒绝
  - Mock pdf-extractor + word-extractor + section-detector
- [ ] 12.5 `tests/unit/main/services/document-parser/tender-import.test.ts`：
  - 文件复制到项目 tender/ 目录
  - task-queue 入队并返回 taskId
  - executor 调用 rfpParser 并写入 JSON 文件
  - getTender 读取已存在结果
  - getTender 文件不存在返回 null
  - 文件不存在抛 BidWiseError
  - Mock taskQueue + rfpParser + fs
- [ ] 12.6 `tests/unit/main/ipc/analysis-handlers.test.ts`：
  - 两个通道正确派发到对应 service 方法
  - 异常包装为 ApiResponse error 格式
  - 使用 createIpcHandler 工厂
- [ ] 12.6A `tests/unit/main/ipc/task-handlers.test.ts`（扩展或新建）：
  - `task:get-status` 通道正确派发到 `taskQueue.getTask(taskId)`
  - taskId 存在返回 `TaskRecord`
  - taskId 不存在返回 `null`
  - 异常包装为 ApiResponse error 格式
- [ ] 12.7 `tests/unit/renderer/stores/analysisStore.test.ts`：
  - importTender 设置 importTaskId + loading
  - updateParseProgress 更新进度和消息
  - setParseCompleted 设置结果并清 loading
  - fetchTenderResult 正确加载已有结果
  - setError 设置错误
  - reset 清空全部状态

### Task 13: 集成验证 (AC: 全部)

- [ ] 13.1 `pnpm lint && pnpm typecheck && pnpm build` 全部通过
- [ ] 13.2 IPC 类型完整性——新增通道在 `IpcChannelMap`、`preload`、handler 三处一致，`Registered*Channels` 穷举编译通过
- [ ] 13.3 冷启动时间仍 <5 秒（NFR1）
- [ ] 13.4 手动验证（可选）：拖拽 PDF → 进度条 → 完成 → 查看章节结构

## Dev Notes

### 本 Story 在架构中的位置

```
Renderer (AnalysisView + analysisStore)
  │
  ├── IPC analysis:import-tender
  │     → tender-import 编排层
  │       → 复制文件到 tender/original/
  │       → taskQueue.enqueue(category='import')
  │       → taskQueue.execute(taskId, executor)  // fire-and-forget
  │           → rfpParser.parse(filePath, { onProgress })
  │               → pdf-extractor / word-extractor
  │               → section-detector
  │           → 写入 tender-parsed.json + tender-meta.json
  │       → return { taskId }
  │
  ├── ← task:progress 事件推送进度到 AnalysisView
  │
  └── IPC analysis:get-tender
        → 读取 tender/tender-parsed.json
        → return ParsedTender | null
```

### Scope 边界（重要）

本 Story 聚焦**导入框架和基础文本提取**，不调用 AI 接口。以下功能在后续 Story：

| 后续 Story | 功能 | 本 Story 提供的基础 |
|-----------|------|-------------------|
| 2.4 | OCR 识别与人工校正 | `hasScannedContent` 标记 + 扫描件检测 |
| 2.5 | LLM 需求结构化抽取 + 评分模型 | `tender-parsed.json` 的 rawText + sections 作为输入 |
| 2.6 | *项识别高亮 | 同上，rawText 供 *项检测 Agent 分析 |
| 2.7 | 策略种子生成 | 独立流程，不依赖本 Story |

`section-detector` 为启发式规则基线（Alpha），Story 2.5 通过 parse-agent + LLM 精化。

### 已有代码资产（禁止重复创建）

| 已有文件 | 内容 | Story |
|----------|------|-------|
| `src/main/services/task-queue/` | 完整任务队列（enqueue/execute/cancel/progress/recover） | 2.2 |
| `src/main/services/agent-orchestrator/` | Agent 编排层（**本 Story 不使用**，Story 2.5 使用） | 2.2 |
| `src/main/services/ai-proxy/` | AI 脱敏代理（**本 Story 不使用**） | 2.1 |
| `src/shared/ai-types.ts` | TaskRecord/TaskProgressEvent/TaskCategory 等类型（本 Story 复用） | 2.2 |
| `src/shared/ipc-types.ts` | IpcChannelMap/IPC_CHANNELS/IpcEventPayloadMap（本 Story 扩展） | 1.3/2.2 |
| `src/shared/constants.ts` | ErrorCode 枚举（本 Story 扩展 TENDER 系列） | 1.1/2.1/2.2 |
| `src/main/utils/errors.ts` | BidWiseError 错误体系（直接使用，不创建子类） | 1.1 |
| `src/main/utils/logger.ts` | `createLogger(module)` 工厂 | 1.1 |
| `src/main/ipc/create-handler.ts` | `createIpcHandler<C>()` 工厂 | 1.3 |
| `src/main/db/repositories/project-repo.ts` | 项目 CRUD（获取项目路径） | 1.2/1.5 |
| `src/preload/index.ts` | contextBridge API（本 Story 扩展 2 个方法） | 1.3/2.2 |
| `src/renderer/src/stores/projectStore.ts` | 项目状态管理（获取当前 projectId） | 1.5 |
| `src/renderer/src/modules/analysis/` | 空骨架（components/.gitkeep, hooks/.gitkeep, types.ts 空文件） | 1.4 |

**关键复用提醒：**
- `taskQueue.enqueue()` + `taskQueue.execute()` 是 fire-and-forget 异步执行标准模式——参考 `agent-orchestrator/orchestrator.ts` 的实现
- `createIpcHandler<C>()` 自动包装 try/catch → ApiResponse 格式——handler 不需要自己 try/catch
- `window.api.onTaskProgress(callback)` 已在 preload 暴露，返回 unlisten 函数
- IPC 通道新增后必须同步更新：`IPC_CHANNELS` 常量 + `IpcChannelMap` 类型 + `preload/index.ts` 方法 + `preload/index.d.ts` 声明 + `ipc/index.ts` 的 `Registered*Channels` 穷举校验（本 Story 共新增 3 个通道：`analysis:import-tender`、`analysis:get-tender`、`task:get-status`）
- `loading` 字段名必须为 `loading: boolean`（禁止 isLoading/fetching/pending）
- TaskCategory 已包含 `'import'`——本 Story 使用此类别入队

### 关键技术决策

**PDF 文本提取：pdf-parse**
- MIT 协议，底层 pdfjs-dist（纯 JS，无 native 依赖）
- API：`const data = await pdfParse(fs.readFileSync(filePath))` → `data.text`、`data.numpages`
- Electron 主进程中运行，不阻塞渲染进程
- 局限：扫描件 PDF 返回空文本或极少文本——通过文本密度检测标记 `hasScannedContent`，完整 OCR 在 Story 2.4

**Word 文本提取：mammoth**
- BSD 协议，纯 JS 实现
- 纯文本：`mammoth.extractRawText({ path })` → `result.value`
- HTML：`mammoth.convertToHtml({ path })` → 用于解析 `<h1>`~`<h6>` 标题层级
- 仅支持 .docx（OOXML）；.doc（二进制 OLE）需先通过 LibreOffice CLI 转换为 .docx 后提取（`soffice --headless --convert-to docx`），转换失败时降级提示用户手动另存。与 epics.md:693 "Word (.docx/.doc)" 和 prd.md NFR26 对齐

**章节检测策略（Alpha 启发式基线）：**
招标文件常见模式，按检测优先级排列：
1. `第X章/节/部分` — `第一章 总则`、`第三部分 技术要求`
2. 数字编号 — `1. 项目概述`、`2.1 技术标准`、`3.2.1 性能指标`
3. 中文编号 — `一、投标须知`、`二、技术标准`
4. 关键字识别 — 总则、技术要求、评分标准/办法、商务条款、投标须知、资格要求

**文件路径获取（Electron 特殊处理）：**
- Electron 扩展 File API：`File.path` 属性返回完整本地路径
- Ant Design Upload 的 `beforeUpload(file)` 中通过 `(file as any).path` 获取
- **不走 HTTP 上传**——本地 Electron 应用直接通过路径读取文件
- `beforeUpload` 返回 `false` 阻止 Ant Design 默认上传行为

**进度映射：**

| 阶段 | 进度 | 消息 |
|------|------|------|
| 格式检测 | 0→5% | "检测文件格式..." |
| 文本提取 | 5→40% | "提取文档文本..." |
| 结构识别 | 40→70% | "识别文档结构..." |
| 结果整理 | 70→90% | "整理解析结果..." |
| 写入存储 | 90→100% | "保存解析结果..." |

**预估时间算法：**
`remainingMs = (elapsedMs / progress) * (100 - progress)`，最小显示 "< 1 分钟"

**数据存储结构：**
```
{project.rootPath}/          ← 来自 projectRepo.findById()，不硬编码
└── tender/
    ├── original/
    │   └── {originalFileName}     ← 原始文件副本
    ├── tender-meta.json           ← TenderMeta
    └── tender-parsed.json         ← ParsedTender（后续 Story 的输入数据源）
```

### UX 规范要点

- **空状态**：遵循 UX 规范空状态设计——引导式占位符，含阶段目标说明 + 开始操作入口
- **Toast 规范**：成功 3s 自动消失、失败手动关闭 + 可操作恢复选项（重试/跳过）、同一时刻最多 3 条
- **异步不阻塞**：用户可在解析期间自由切换项目/阶段，完成后 Toast 通知
- **动效禁区**：不使用旋转菊花（改用进度条），不为常规操作添加多余动效
- **Upload 组件**：Ant Design Upload.Dragger，拖拽区域定制，定制级别"中"

### 新增文件预期

```
src/main/services/document-parser/
├── pdf-extractor.ts         ← 新建
├── word-extractor.ts        ← 新建
├── section-detector.ts      ← 新建
├── rfp-parser.ts            ← 新建
├── tender-import.ts         ← 新建
└── index.ts                 ← 新建

src/main/ipc/
└── analysis-handlers.ts     ← 新建

src/shared/
└── analysis-types.ts        ← 新建

src/renderer/src/stores/
└── analysisStore.ts         ← 新建

src/renderer/src/modules/analysis/
├── components/
│   ├── TenderUploadZone.tsx     ← 新建
│   ├── ParseProgressPanel.tsx   ← 新建
│   ├── TenderResultSummary.tsx  ← 新建
│   └── AnalysisView.tsx         ← 新建
├── hooks/
│   └── useAnalysis.ts           ← 新建
└── types.ts                     ← 更新（现为空文件）

tests/unit/main/services/document-parser/
├── pdf-extractor.test.ts    ← 新建
├── word-extractor.test.ts   ← 新建
├── section-detector.test.ts ← 新建
├── rfp-parser.test.ts       ← 新建
└── tender-import.test.ts    ← 新建
tests/unit/main/ipc/
└── analysis-handlers.test.ts ← 新建
tests/unit/renderer/stores/
└── analysisStore.test.ts     ← 新建
```

**修改文件：**
- `src/shared/ipc-types.ts` — 新增 2 个 IPC 通道 + 常量 + 类型
- `src/shared/constants.ts` — ErrorCode 扩展 4 个 TENDER 错误码
- `src/main/ipc/index.ts` — 注册 analysis handlers + 穷举类型扩展
- `src/preload/index.ts` — 新增 3 个 API 方法（2 个 analysis + 1 个 taskGetStatus）
- `src/preload/index.d.ts` — 类型声明（同步 3 个新方法）
- `src/main/ipc/task-handlers.ts` — 扩展 `task:get-status` handler（Task 6A）
- `src/renderer/src/stores/index.ts` — 导出 analysisStore
- `package.json` / `pnpm-lock.yaml` — pdf-parse + mammoth 依赖

### Previous Story Intelligence

Story 2.2 建立的关键模式（本 Story 必须遵循）：
- **IPC handler 模式**：`createIpcHandler<C>()` 工厂 + `registerXxxHandlers()` 函数 + `RegisteredXxxChannels` 类型 → 在 `ipc/index.ts` 调用并扩展穷举类型
- **task-queue 使用模式**：`enqueue()` 返回 `taskId` → `execute(taskId, executor)` fire-and-forget → executor 内 `updateProgress()` 推送进度 → 结果写入持久化
- **类型安全链路**：`IPC_CHANNELS` 常量 → `IpcChannelMap` 类型对 → preload 方法 → `index.d.ts` 声明——四处必须同步
- **错误处理**：使用 `BidWiseError(ErrorCode.XXX, message)` 抛出，IPC handler 自动包装为 `{ success: false, error: { code, message } }`
- **单例模式**：service 在模块 `index.ts` 中创建单例并导出

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.3]
- [Source: _bmad-output/planning-artifacts/prd.md — FR9, NFR2, NFR26]
- [Source: _bmad-output/planning-artifacts/architecture.md — document-parser 服务目录, analysis 模块, analysisStore, FR→目录映射]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Stage 1（需求分析）流程图, 异步操作模式, Toast 规范, Upload 组件, 空状态设计]
- [Source: _bmad-output/implementation-artifacts/2-2-enabler-agent-orchestrator-task-queue.md — task-queue 使用模式, IPC handler 模式, 进度推送协议]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
