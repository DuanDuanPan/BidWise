# Story 11.7: Word 文档导入提取目录

Status: ready-for-dev

## Story

As a 售前工程师,
I want 把客户给的 Word 模板文档拖入应用，自动提取目录骨架,
So that 我无需手动重建客户要求的章节结构。

## Acceptance Criteria

### AC1: 文件上传与传输

- **Given** 用户在 Story 11.6 三路径入口选择"导入 Word"
- **When** 上传 .docx 文件（拖拽或选择）
- **Then** Renderer 将 buffer 通过 IPC 传给主进程，主进程转发给 Python 子进程的 FastAPI 端点
- [Source: epics.md Story 11.7 AC1]

### AC2: 双引擎 Heading 识别

- **Given** Python FastAPI 收到 docx 内容
- **When** 调用 `/api/extract-document-outline`
- **Then** 用双引擎识别 Heading：
  - **主引擎**：`paragraph.style.name` 匹配正则 `Heading [1-9]`（含中文别名"标题 1-9"）
  - **备引擎（启发式）**：font_size > 正文中位字号 + bold + 行长度 < 50 字符的段落
- [Source: epics.md Story 11.7 AC2]

### AC3: 置信度三档标注

- **Given** 提取完成
- **When** 返回结构 JSON
- **Then** 每个节点附 `confidence` 字段，三档：
  - `high`：来自真 Heading 样式
  - `medium`：启发式命中（字号 + 加粗）
  - `low`：仅字号大
- [Source: epics.md Story 11.7 AC3]

### AC4: 预览界面 + 置信度标记

- **Given** 提取结果
- **When** 渲染预览界面
- **Then** 显示提取的章节树，每节点旁标置信度 Tag：
  - 高 = 绿色
  - 中 = 黄色
  - 低 = 灰色
- **And** 用户可勾选 / 取消接受单个节点
- **And** Story 11.5 联动：深度 >6 节点显示 ⚠️ 警告
- [Source: epics.md Story 11.7 AC4]

### AC5: 仅取目录骨架

- **Given** 用户确认导入
- **When** 点击"导入到 diff 视图"
- **Then** 进入 Story 11.6 的 diff 合并流程，与现有结构合并
- **And** **不**导入 Word 正文内容（仅章节标题 + 层级）
- [Source: epics.md Story 11.7 AC5]

### AC6: 失败处理

- **Given** Word 文件解析失败（损坏 / 密码保护 / 非 .docx）
- **When** 错误发生
- **Then** 显示明确错误信息（"文件已损坏" / "受密码保护" / "格式不支持，请使用 .docx 格式"）+ 引导降级到其他路径
- [Source: epics.md Story 11.7 AC6]

## Tasks / Subtasks

- [ ] Task 1: Python FastAPI 端点 (AC: 1, 2, 3)
  - [ ] 1.1 在 Python 子进程项目（`python/`）增 `routers/outline_extractor.py`
  - [ ] 1.2 端点 `POST /api/extract-document-outline`：接收 multipart .docx，返回结构 JSON
  - [ ] 1.3 主引擎实现：
    ```python
    from docx import Document
    doc = Document(io.BytesIO(file_content))
    for para in doc.paragraphs:
        match = re.match(r'^(Heading|标题)\s*([1-9])$', para.style.name)
        if match: yield { "title": para.text, "level": int(match.group(2)), "confidence": "high" }
    ```
  - [ ] 1.4 启发式备引擎：先扫描全文计算正文中位字号，再扫段落判断 font_size > median + bold + len < 50
  - [ ] 1.5 输出 nested JSON `{ title, level, confidence, children: [] }` 按 level 嵌套
  - [ ] 1.6 错误处理：损坏 → 422、密码保护 → 423、非 docx → 400

- [ ] Task 2: 主进程 IPC + 转发 (AC: 1, 6)
  - [ ] 2.1 创建 `src/main/services/word-outline-service.ts`：调 Python FastAPI 客户端
  - [ ] 2.2 IPC 通道 `structure:import-word`，输入 `{ filePath: string }`，输出 `WordOutlineResult`
  - [ ] 2.3 复用现有 docx-bridge 子进程客户端（FastAPI HTTP）
  - [ ] 2.4 错误码：`WORD_FILE_CORRUPTED` / `WORD_FILE_PASSWORD_PROTECTED` / `WORD_FORMAT_INVALID`

- [ ] Task 3: 类型定义 (AC: 2, 3)
  - [ ] 3.1 `src/shared/word-import-types.ts`：
    ```typescript
    export type Confidence = 'high' | 'medium' | 'low'
    export interface WordOutlineNode {
      title: string
      level: number
      confidence: Confidence
      children: WordOutlineNode[]
    }
    export interface WordOutlineResult {
      outline: WordOutlineNode[]
      sourceName: string  // 原文件名
      totalNodeCount: number
    }
    ```

- [ ] Task 4: 预览组件 (AC: 4)
  - [ ] 4.1 创建 `src/renderer/src/modules/editor/components/WordImportPreview.tsx`
  - [ ] 4.2 props: `result: WordOutlineResult`, `onConfirm: (selectedNodes) => void`, `onCancel: () => void`
  - [ ] 4.3 Tree 渲染含 checkbox + 置信度 Tag + ⚠️（深度 >6）+ 全选 / 反选 按钮
  - [ ] 4.4 默认全选 high 置信度，medium/low 默认未选（用户主动确认）
  - [ ] 4.5 顶部统计："共 N 节点（高 X / 中 Y / 低 Z），已选 M 个"

- [ ] Task 5: 集成到 Story 11.6 (AC: 5)
  - [ ] 5.1 `StructureSourceModal` "导入 Word" 卡片 onClick → 打开文件选择器 → 调 `structure:import-word` IPC
  - [ ] 5.2 收到 result → 渲染 `WordImportPreview`
  - [ ] 5.3 用户确认 → 转换 `WordOutlineNode[]` → `ChapterNode[]`（生成 UUID + parentId + order）→ 进入 Story 11.6 的 diff 视图

- [ ] Task 6: 测试 (AC: 全部)
  - [ ] 6.1 `python/tests/test_outline_extractor.py`：
    - 真 Heading 样式文档识别
    - 伪 Heading（手工字号）启发式识别
    - 损坏文件返回 422
    - 密码保护返回 423
    - 嵌套层级正确
  - [ ] 6.2 `tests/unit/main/services/word-outline-service.test.ts`：IPC 转发 + 错误码映射
  - [ ] 6.3 `tests/unit/renderer/modules/editor/components/WordImportPreview.test.tsx`：
    - 置信度 Tag 颜色
    - 默认勾选规则
    - 深度警告显示
    - 全选 / 反选
  - [ ] 6.4 fixture：`tests/fixtures/word-samples/`：标准 Heading 样式 + 伪 Heading + 损坏 + 加密 docx 各一份

## Dev Notes

### 关键决策（来自 Party Mode）

- **仅目录骨架** — 不导入正文，避免与 LLM 生成内容冲突
- **双引擎兜底** — Word 用户大量"伪 Heading"，单引擎漏检率高
- **置信度标注** — 让用户能看到"哪些节点是猜的"
- **不强制接受** — 用户可裁决每个节点

### 已有代码资产

| 已有文件 | 操作 |
|---|---|
| `python/` 子进程 | 增 outline_extractor 路由 |
| `src/main/services/docx-bridge.ts`（已有） | 复用 HTTP 客户端 |
| `src/shared/word-import-types.ts` | 新建 |
| Story 11.6 `StructureSourceModal` | 集成入口 |

### 依赖

- 阻塞前置：Story 11.1（UUID）、11.6（diff 入口 + 合并视图）
- 协同：Story 11.5（深度警告）

### 禁止事项

- 禁止导入 Word 正文（仅标题 + 层级）
- 禁止跳过双引擎兜底（单引擎漏检率高）
- 禁止跳过置信度标注（用户需知道猜测来源）
- 禁止 IPC handler 含业务逻辑（必须委托 service）

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.7]
- [Source: python-docx documentation] — paragraph.style 字段
- [Source: src/main/services/docx-bridge.ts] — Python FastAPI 客户端模式

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
