# Story 8.3: 一键 docx 导出与模板样式映射

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 一键将方案从编辑态导出为精确模板化的 docx 文档,
So that 输出的 Word 文档样式 100% 合规，不需要手动调格式。

## Acceptance Criteria

1. **AC1: 核心样式精确映射**
   - **Given** 预览确认无误
   - **When** 点击"导出 docx"
   - **Then** 渲染引擎基于 `template-mapping.json` 配置精确映射核心样式（标题 H1-H6 / 正文 / 表格 / 图片 / 目录），生成 docx 文件
   - **FRs:** FR54

2. **AC2: 导出性能**
   - **Given** 100 页方案（含图片、表格）
   - **When** 导出执行
   - **Then** 导出时间 < 30 秒
   - **NFRs:** NFR5

3. **AC3: 导出完整性**
   - **Given** 导出结果
   - **When** 在 Microsoft Word 中打开
   - **Then** 图片不丢、格式不乱、编号正确、样式精确映射到模板定义的 Word 样式
   - **NFRs:** NFR16

4. **AC4: 目录自动生成**
   - **Given** 方案包含多级标题结构
   - **When** 导出 docx
   - **Then** 自动生成 TOC 域代码，Word 打开后刷新即显示正确目录与页码

5. **AC5: 内联格式保真**
   - **Given** 方案正文包含加粗、斜体、行内代码
   - **When** 导出 docx
   - **Then** 对应文本在 Word 中保持加粗/斜体/等宽字体渲染

6. **AC6: 图片插入**
   - **Given** 方案引用 `assets/` 目录下的图片（PNG/JPG）
   - **When** 导出 docx
   - **Then** 图片按原始宽高比插入，宽度不超过页面内容区域，位置与 Markdown 中引用位置一致

## Out of Scope（本 Story 不做）

- draw.io 自动转 PNG（Story 8.4）
- Mermaid / SVG 资产自动转导出图片（后续 Epic 8 导出迭代；本 Story 仅处理 Markdown 图片语法中的 `.png/.jpg/.jpeg`）
- 图表自动编号与交叉引用（Story 8.4）
- 格式降级方案与合规报告（Story 8.5）
- 续表表头（表格跨页时重复表头）— 后续迭代
- 多节页眉/页脚 — 后续迭代
- 代码块语法高亮渲染 — 后续迭代（本 Story 仅用等宽字体+灰色背景段落）

## Tasks / Subtasks

### Task 1: 模板映射配置 Schema 与解析归一化（AC: #1）

- [ ] 1.1 扩展 `src/shared/export-types.ts`，新增可复用的共享类型：
  ```typescript
  export type TemplateStyleKey =
    | 'heading1'
    | 'heading2'
    | 'heading3'
    | 'heading4'
    | 'heading5'
    | 'heading6'
    | 'bodyText'
    | 'table'
    | 'listBullet'
    | 'listNumber'
    | 'caption'
    | 'codeBlock'
    | 'toc'

  export type TemplateStyleMapping = Partial<Record<TemplateStyleKey, string>>

  export interface TemplatePageSetup {
    contentWidthMm?: number
  }

  export interface TemplateMappingConfig {
    templatePath?: string
    styles?: TemplateStyleMapping
    pageSetup?: TemplatePageSetup
  }
  ```
- [ ] 1.2 在 `src/main/services/export-service.ts` 中将 `resolveTemplatePath()` 升级为 `resolveTemplateMapping()`，返回归一化结果：
  - `templatePath?: string`
  - `styleMapping?: TemplateStyleMapping`
  - `pageSetup?: TemplatePageSetup`
  - `warnings: string[]`
  - **兼容旧格式**：`template-mapping.json` 只有 `{ templatePath }` 时，视为合法旧格式，`styleMapping/pageSetup` 为空
  - **缺失文件**：保持 Story 8.2 的兼容行为，允许无模板继续预览/导出
  - **非法 JSON / 非对象结构**：抛出明确 `ValidationError`，不要像 Story 8.2 一样静默吞掉格式错误
- [ ] 1.3 明确 `templatePath` 解析策略，避免把 `company-data/templates/...` 原样传给 Python：
  - 绝对路径显式 `input.templatePath` 仍保留为测试覆盖项；显式相对路径也按同一候选策略解析
  - `template-mapping.json` 中的相对路径按以下候选顺序解析为真实文件路径：
    1. `app.getAppPath()`
    2. `app.getPath('userData')`
    3. `resolveProjectDataPath(projectId)`（仅用于项目级测试 fixture）
  - 若候选路径都不存在，返回“首个候选根目录拼出的绝对路径”交给 Python，让 `TEMPLATE_NOT_FOUND` 仍基于绝对路径报错，不依赖 Python 进程当前工作目录
- [ ] 1.4 单元测试：`tests/unit/main/services/export-service.test.ts`
  - 合法完整格式
  - 旧格式 `{ templatePath }`
  - 缺失文件
  - 非法 JSON / 非对象
  - `company-data/...` 相对路径的候选解析顺序

### Task 2: Python 渲染请求/结果模型扩展（AC: #1, #3, #6）

- [ ] 2.1 扩展 `python/src/docx_renderer/models/schemas.py`，避免使用裸 `dict`：
  - `StyleMapping` model：覆盖 `heading1-6/bodyText/table/listBullet/listNumber/caption/codeBlock/toc`
  - `PageSetup` model：`content_width_mm: Optional[float]`
  - `RenderRequest` 新增：
    - `style_mapping: Optional[StyleMapping]`
    - `page_setup: Optional[PageSetup]`
    - `project_path: Optional[str]`
  - `RenderResult` 新增 `warnings: list[str] = Field(default_factory=list)`
- [ ] 2.2 更新 `python/src/docx_renderer/routes/render.py` 与 `render_markdown_to_docx()` 签名，完整透传 `style_mapping/page_setup/project_path`
- [ ] 2.3 增加 camelCase 请求/响应覆盖，确保 `styleMapping/pageSetup/projectPath/warnings` 在 FastAPI JSON 边界上仍遵循现有 Pydantic alias 规则

### Task 3: Python 渲染引擎 — 模板样式映射与 warnings（AC: #1, #3）

- [ ] 3.1 在 `python/src/docx_renderer/engine/renderer.py` 中新增样式解析 helper，而不是在 `_parse_markdown()` 中散落硬编码：
  - `_resolve_paragraph_style(document, configured_name, fallback_name, warnings) -> str`
  - `_resolve_table_style(document, configured_name, warnings) -> str | None`
  - fallback 基线使用 python-docx / Word 内置英文样式名：`Heading 1-6`、`List Bullet`、`List Number`、`Normal`
- [ ] 3.2 样式查找优先级：
  - `style_mapping` 中配置的样式名且模板内存在
  - 内置 fallback 样式名
  - 若 fallback 样式也不可用，则退回无样式直写并记录 warning
- [ ] 3.3 样式缺失只记入 `warnings`，不阻断渲染；**禁止**在运行时往模板里创建新样式
- [ ] 3.4 pytest：验证自定义样式生效、缺失样式 warning、无模板 fallback、`warnings` 写回 `RenderResult`

### Task 4: Python 渲染引擎 — 内联格式与代码块（AC: #5）

- [ ] 4.1 抽取 `_append_inline_runs(paragraph, text, style_mapping, warnings)`，统一处理普通段落、列表项、表格单元格中的行内格式：
  - `**text**` / `__text__` → `run.bold = True`
  - `*text*` / `_text_` → `run.italic = True`
  - `` `code` `` → 优先使用模板中的 character/paragraph 级代码样式；无样式时退回等宽字体 direct formatting
  - `***bold italic***` → 同时设置 bold + italic
  - 需要保留 run 间空格；不要因为 regex 切分吞掉前后空白
- [ ] 4.2 围栏代码块（``` / ~~~）独立于 inline parser 处理：
  - 保持换行和缩进
  - 优先使用 `styleMapping.codeBlock`
  - 无代码块样式时，用等宽字体 + 浅灰底纹段落 helper 降级
  - 不做语法高亮
- [ ] 4.3 pytest：覆盖单独加粗、单独斜体、行内代码、嵌套组合、空代码块、带语言标记的 fenced code block

### Task 5: Python 渲染引擎 — 图片插入与资产边界（AC: #3, #6）

- [ ] 5.1 在 `_parse_markdown()` 中识别 Markdown 图片语法 `![alt](path)`，仅承诺支持：
  - `assets/*.png`
  - `assets/*.jpg`
  - `assets/*.jpeg`
- [ ] 5.2 图片路径解析规则：
  - `project_path` 由主进程传入，只能由主进程生成，不接受 renderer 直接指定
  - 相对路径必须解析到 `{project_path}/assets/` 下
  - 绝对路径仅在其真实路径仍位于 `{project_path}/assets/` 下时允许
  - 出现 `..`、跨目录、或扩展名不在白名单中时，**不得读取文件**；改为记录 warning 并插入占位文本 `[图片未导出: {path}]`
- [ ] 5.3 图片缩放策略使用 `docx.shared.Mm` 或等价毫米换算，而不是把毫米值直接传给 `Inches(...)`：
  - 先按原始尺寸插入
  - 若 `shape.width > Mm(contentWidthMm ?? 150)`，再缩放到内容区宽度
  - 仅设置 `shape.width`，让 python-docx 自动保持宽高比
- [ ] 5.4 图片缺失时不抛异常，改记 warning 并插入占位文本
- [ ] 5.5 `svg` / `.drawio` / 其他非白名单图片格式在本 Story 统一视为 out of scope：
  - 记录 warning
  - 不尝试在 8.3 内补做 SVG 转 PNG
  - 后续由 Story 8.4 处理 draw.io / 图表导出增强
- [ ] 5.6 pytest：图片插入成功、图片缺失降级、路径穿越拒绝、扩展名白名单、宽度缩放

### Task 6: Python 渲染引擎 — TOC 域代码（AC: #4）

- [ ] 6.1 新增 `add_toc(document, title, toc_style)` helper，在文档第一个 heading 之前插入 TOC 标题与域代码
- [ ] 6.2 TOC 标题优先使用 `styleMapping.toc`；若该样式缺失则 warning + fallback 到 `Heading 1`
- [ ] 6.3 TOC 深度固定 `1-3` 级，本 Story 不扩展更多自定义参数
- [ ] 6.4 pytest：验证 TOC 相关 XML 节点结构正确
- [ ] 6.5 在 story 内明确：浏览器侧 `docx-preview` 不负责执行 Word 域刷新，AC4 的验收以 Word 打开并刷新字段后的结果为准

### Task 7: Node.js 侧集成 — 透传完整渲染配置（AC: #1, #3, #6）

- [ ] 7.1 扩展 `src/shared/docx-types.ts`：
  - `RenderDocxInput` 增加 `styleMapping?: TemplateStyleMapping`、`pageSetup?: TemplatePageSetup`、`projectPath?: string`
  - `RenderDocxOutput` 增加 `warnings?: string[]`
- [ ] 7.2 更新 `src/main/services/docx-bridge/render-client.ts`，透传新增字段并在 `tests/unit/main/services/docx-bridge-render-client.test.ts` 覆盖 camelCase payload
- [ ] 7.3 更新 `src/main/services/docx-bridge/index.ts`：
  - 保持现有 `outputPath` 安全校验
  - 透传 `styleMapping/pageSetup/projectPath`
  - 在 `tests/unit/main/services/docx-bridge-service.test.ts` 覆盖新增字段转发
- [ ] 7.4 更新 `src/main/services/export-service.ts`：
  - 仅 `startPreview()` 负责读取并归一化 `template-mapping.json`
  - 将 `styleMapping`、`pageSetup`、`projectPath: resolveProjectDataPath(projectId)` 传给 `docxBridgeService.renderDocx()`
  - `confirmExport()` 继续保持 Story 8.2 的 copy-only 行为，**不得**重新读取 mapping、不得重新渲染

### Task 8: Preview / Export 任务结果契约（AC: #3）

- [ ] 8.1 扩展 `src/shared/export-types.ts` 中的 `PreviewTaskResult`，增加 `warnings?: string[]`
- [ ] 8.2 `export-service.startPreview()` 把 Python 侧 `warnings` 写入 `task.output`
- [ ] 8.3 `useExportPreview()` 保持 `warnings` 随 `previewMeta` 保存，供后续 Story 8.5 直接消费；本 Story **不要求**新增专门的 warnings 面板 UI

### Task 9: 一键导出流程边界复用（AC: #1, #2）

- [ ] 9.1 明确复用 Story 8.2 已实现的 `preview -> confirmExport -> copy preview file` 管线；本 Story 不新增 renderer / IPC channel
- [ ] 9.2 若 preview 与最终导出参数相同，`confirmExport()` 必须直接复制 `.preview-*.docx`，**禁止**为了“最终质量”再做第二次渲染
- [ ] 9.3 验证导出成功后的 Toast 与 preview 文件清理逻辑不回归

### Task 10: 性能验证（AC: #2）

- [ ] 10.1 在 `python/tests/` 中使用 deterministic builder 生成 100 页 Markdown 测试内容；不要为 benchmark 引入新的第三方插件
- [ ] 10.2 用 `time.perf_counter()` 断言 `render_markdown_to_docx()` 对 100 页内容在 CI 可接受阈值内完成（目标 `< 30s`）
- [ ] 10.3 如需 slow test 标记，可直接使用 `pytest` 自定义 marker 或测试命名约定，不引入 `pytest-benchmark`

### Task 11: 集成测试与 E2E（AC: #1-#6）

- [ ] 11.1 在 `python/tests/test_render.py` 增补端到端 pytest 覆盖：样式映射、warnings、图片、TOC、代码块
- [ ] 11.2 `tests/integration/docx-bridge/` 新增或扩展 integration test，验证 Node.js → Python 的完整 payload/response：`styleMapping/pageSetup/projectPath/warnings`
- [ ] 11.3 `tests/e2e/stories/story-8-3-one-click-docx-export.spec.ts`
  - 打开包含合法 `template-mapping.json` 与图片资产的测试项目
  - 触发预览 → 确认导出
  - 校验导出的 docx 文件存在且大小合理
  - 若保存对话框取消，ready modal 继续保持打开（复用 Story 8.2 既有行为）
- [ ] 11.4 最低验证命令：
  - `pnpm typecheck`
  - `pnpm test:unit`
  - `pnpm build`
  - `pnpm test:python`
  - `playwright test tests/e2e/stories/story-8-3-one-click-docx-export.spec.ts`

## Dev Notes

### 架构约束（必须遵守）

1. **task-queue 白名单**：docx 导出必须通过 `taskQueue` 执行（已由 Story 8.2 建立，本 Story 复用）
2. **IPC handler 薄层派发**：`export-handlers.ts` 只做参数解析和结果包装，业务逻辑在 `export-service.ts`
3. **统一响应格式**：Python FastAPI 和 Node.js IPC 均使用 `{ success: true, data: T }` / `{ success: false, error: { code, message } }`
4. **camelCase 边界**：Python 内部 snake_case，Pydantic `alias_generator=to_camel` + `by_alias=True` 输出 camelCase
5. **路径安全分层**：
   - `outputPath` 继续只允许写入项目 `exports/`
   - `projectPath` 只能由主进程基于 `resolveProjectDataPath(projectId)` 生成
   - Python 只允许从 `{projectPath}/assets/` 读取白名单图片，禁止任意绝对路径读取
6. **模板路径解析**：`template-mapping.json.templatePath` 的相对路径由主进程解析为真实文件系统路径，解析规则与现有 `template-service` 的 `company-data` 候选路径保持一致
7. **BidWiseError 类型**：所有错误使用 `BidWiseError` 层次体系，不 throw 裸字符串；非致命问题统一进入 `warnings`
8. **Preview → Export 流程不变**：Story 8.3 只增强渲染质量，不改 Story 8.2 已实现的 modal / confirmExport / cleanup 主流程

### 关键代码位置（已存在，需修改）

| 文件 | 说明 | 修改内容 |
|------|------|----------|
| `python/src/docx_renderer/engine/renderer.py` | 核心渲染引擎 | 重构 `_parse_markdown()`，增加样式映射/内联格式/图片/TOC/代码块 |
| `python/src/docx_renderer/models/schemas.py` | 数据模型 | 扩展 `RenderRequest` 和 `RenderResult` |
| `python/src/docx_renderer/routes/render.py` | 渲染路由 | 透传新字段到渲染引擎 |
| `src/shared/docx-types.ts` | docx 共享类型 | 扩展 `RenderDocxInput`/`RenderDocxOutput` |
| `src/shared/export-types.ts` | 导出共享类型 | 新增 `TemplateMappingConfig` |
| `src/main/services/docx-bridge/render-client.ts` | HTTP 客户端 | 透传 styleMapping/pageSetup/projectPath |
| `src/main/services/docx-bridge/index.ts` | Bridge 门面 | 透传新字段 |
| `src/main/services/export-service.ts` | 导出服务 | 升级 `resolveTemplateMapping()`，传递完整配置 |
| `src/renderer/src/modules/export/hooks/useExportPreview.ts` | preview 生命周期 | 保留 `warnings` 于 `previewMeta`，不新增复杂 UI |
| `src/shared/ipc-types.ts` | IPC 类型 | 无需新增 channel（复用 `docx:render`, `export:*`） |
| `tests/unit/main/services/export-service.test.ts` | 主进程单测 | 覆盖 mapping 解析、warnings 回写、路径候选解析 |
| `tests/unit/main/services/docx-bridge-render-client.test.ts` | HTTP client 单测 | 覆盖新增 camelCase payload |
| `tests/unit/main/services/docx-bridge-service.test.ts` | Bridge 单测 | 覆盖新增字段透传 |
| `python/tests/test_render.py` | Python pytest | 扩展 rich render / warnings / TOC / image 用例 |

### 关键代码位置（需新建）

| 文件 | 说明 |
|------|------|
| `python/tests/fixtures/template-with-styles.docx` | 含自定义样式的 Python 测试模板 |
| `python/tests/fixtures/images/test-image.png` | Python pytest 使用的测试图片 |
| `tests/fixtures/proposal-samples/story-8-3-rich-export/` | E2E/集成测试项目样例（含 `proposal.md`、`template-mapping.json`、`assets/`） |
| `tests/integration/docx-bridge/rich-export.integration.test.ts` | 样式映射/图片/TOC/warnings 集成测试 |
| `tests/e2e/stories/story-8-3-one-click-docx-export.spec.ts` | E2E 测试 |

### Story 8.1/8.2 已建立的模式（必须复用，禁止重新发明）

1. **Python 进程管理**：`process-manager.ts` 已完成，不需修改启动/健康检查逻辑
2. **HTTP 通信**：`render-client.ts` 使用 Node.js 内置 `fetch`，60 秒超时，支持 AbortController 取消
3. **Preview → Export 流程**：Story 8.2 已实现完整的 `startPreview → loadPreviewContent → confirmExport → cleanupPreview` 管线，本 Story 只增强渲染质量，不改变流程
4. **tempPath 安全边界**：临时文件为 `exports/.preview-{timestamp}.docx`，所有操作验证路径在项目 `exports/` 内
5. **task-queue 集成**：export 使用 `category: 'export'`，返回 `taskId`，支持取消和进度回调
6. **E2E 测试模式**：通过 `BIDWISE_E2E_EXPORT_PREVIEW_DELAY_MS` 环境变量控制测试延迟

### Python 渲染引擎重构策略

当前 `_parse_markdown()` 是逐行正则匹配的简单实现。本 Story 需要将其重构为更健壮的解析器：

```
推荐重构方向：
1. 保持逐行解析（不引入 markdown-it 等第三方库，避免依赖膨胀）
2. 增加状态机：追踪当前是否在代码块/表格内
3. 内联格式解析抽取为独立函数 _parse_inline_runs(text) -> list[Run]
4. 图片行单独处理 _handle_image_line(line, project_path, doc) -> warnings
5. 样式查找封装为 _resolve_style(doc, style_key, style_mapping) -> str
```

**禁止**引入 `markdown-it`、`mistune`、`Pillow` 或其他为本 Story 额外新增的 Markdown / 图片处理依赖。python-docx + 现有标准库能力足够覆盖本 Story 的 Markdown 子集和图片缩放需求。

### TOC 实现细节

python-docx 不原生支持 TOC 生成。需要直接操作 OOXML：

```python
# 插入 TOC 域代码（Word 打开后按 Ctrl+A → F9 刷新）
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

def add_toc(document, title="目录", toc_style=None):
    """在文档开头插入 TOC 域代码"""
    # 1. 添加 TOC 标题段落
    if title:
        p = document.add_paragraph(title, style=toc_style or 'Heading 1')
    # 2. 添加 TOC 域
    paragraph = document.add_paragraph()
    run = paragraph.add_run()
    fldChar_begin = OxmlElement('w:fldChar')
    fldChar_begin.set(qn('w:fldCharType'), 'begin')
    run._r.append(fldChar_begin)

    instrText = OxmlElement('w:instrText')
    instrText.set(qn('xml:space'), 'preserve')
    instrText.text = ' TOC \\o "1-3" \\h \\z \\u '
    run._r.append(instrText)

    fldChar_separate = OxmlElement('w:fldChar')
    fldChar_separate.set(qn('w:fldCharType'), 'separate')
    run._r.append(fldChar_separate)

    fldChar_end = OxmlElement('w:fldChar')
    fldChar_end.set(qn('w:fldCharType'), 'end')
    run._r.append(fldChar_end)
```

**注意**：TOC 域代码在 Word 中打开时需要刷新（Ctrl+A → F9）才显示页码。浏览器侧 `docx-preview` 不负责执行该字段刷新，因此 TOC 的最终正确性以导出的 `.docx` 在 Word 中打开后的结果为准。

### template-mapping.json 示例

```json
{
  "templatePath": "company-data/templates/standard-proposal.docx",
  "styles": {
    "heading1": "标题 1",
    "heading2": "标题 2",
    "heading3": "标题 3",
    "bodyText": "正文",
    "table": "网格型",
    "listBullet": "列表段落",
    "listNumber": "编号列表",
    "caption": "题注",
    "codeBlock": "代码",
    "toc": "TOC Heading"
  },
  "pageSetup": {
    "contentWidthMm": 150
  }
}
```

向后兼容旧格式（仅 `templatePath`）：
```json
{ "templatePath": "company-data/templates/standard-proposal.docx" }
```

若项目未配置 `template-mapping.json`，仍允许继续预览/导出，但只走默认样式 fallback；FR54“100% 合规”的验收必须在提供合法模板映射的 fixture/项目上进行。

### 测试策略

| 层级 | 框架 | 覆盖范围 |
|------|------|----------|
| Python 单元测试 | pytest | renderer.py 每个新功能（样式映射/内联格式/图片/TOC/代码块） |
| Python 性能测试 | pytest + `time.perf_counter()` 断言 | 100 页 Markdown < 30 秒 |
| Node.js 单元测试 | Vitest | export-service 映射解析、render-client/bridge payload 透传 |
| 集成测试 | Vitest | Node.js → Python 完整渲染（需启动 Python 进程） |
| E2E 测试 | Playwright | 预览 → 导出 → 验证文件 |

### 前置依赖

- **Story 8.1 (done)**：Python 进程管理、docx-bridge 通信、基础渲染
- **Story 8.2 (done)**：预览管线、export-service、task-queue 集成、UI 组件

### Project Structure Notes

- 所有路径别名遵循 `@main/*`、`@shared/*`、`@renderer/*` 规范
- Python 文件遵循 PEP 8 snake_case
- FastAPI endpoint 保持 kebab-case: `/api/render-documents`（已存在，不新增 endpoint）
- 共享类型文件位于 `src/shared/`，不在 `src/main/` 或 `src/renderer/` 中定义跨进程类型
- `template-mapping.json` 位于项目目录根（`projects/{project-id}/template-mapping.json`），不在应用全局配置中
- `templatePath` 可存 `company-data/templates/...` 相对路径，但主进程在调用 Python 前必须先解析为真实绝对路径
- 本 Story 只插入 `assets/` 下的 `.png/.jpg/.jpeg`；`.svg` / `.drawio` 导出增强继续留在后续 Story
- `PreviewTaskResult.warnings` 只是数据契约，不要求在 8.3 新增完整警告面板

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic8-Story8.3] — AC 定义、FR54/NFR5/NFR16
- [Source: _bmad-output/planning-artifacts/architecture.md#D2b] — Python 进程通信决策
- [Source: _bmad-output/planning-artifacts/architecture.md#D5] — Markdown + sidecar JSON 决策
- [Source: _bmad-output/planning-artifacts/architecture.md#FormatChain] — Markdown ↔ AST ↔ docx 格式链
- [Source: _bmad-output/planning-artifacts/prd.md#FR54] — 一键导出精确模板化 docx
- [Source: _bmad-output/planning-artifacts/prd.md#NFR5] — 100 页 < 30 秒
- [Source: _bmad-output/planning-artifacts/prd.md#NFR16] — 导出完整性 100%
- [Source: _bmad-output/planning-artifacts/prd.md#NFR28] — 跨平台一致性
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Stage6] — 导出流程 UX
- [Source: _bmad-output/implementation-artifacts/8-1-enabler-python-docx-engine.md] — Python 引擎基础
- [Source: _bmad-output/implementation-artifacts/8-2-export-preview.md] — 预览管线、task-queue 集成
- [Source: https://python-docx.readthedocs.io/en/latest/user/quickstart.html] — `add_picture()` 尺寸/宽高比、段落样式、run bold/italic 的官方行为
- [Source: https://pydantic.dev/docs/validation/latest/concepts/alias/] — `alias_generator` / `to_camel` 官方行为

## Change Log

- 2026-04-09: `validate-create-story` 复核修订

## Dev Agent Record

### Agent Model Used

(to be filled by dev agent)

### Debug Log References

### Completion Notes List

### File List
