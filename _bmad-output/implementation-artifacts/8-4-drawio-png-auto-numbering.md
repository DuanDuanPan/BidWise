# Story 8.4: draw.io 自动转 PNG 与图表编号

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 导出时 draw.io 架构图自动转换为高清 PNG，图表自动编号,
So that 导出的 Word 中架构图清晰、编号规范，无需手动处理。

## Acceptance Criteria

### AC1: draw.io sibling PNG 以高清方式插入 docx（FR55）

**Given** 方案中内嵌 draw.io 架构图，Markdown 序列化格式为 `<!-- drawio:{diagramId}:{assetFileName} -->` + `![caption](assets/{assetBase}.png)`，且 `assetFileName` 本身已包含 `.drawio` 扩展名
**When** docx 预览/导出执行
**Then**

- 导出阶段**不重新解析 `.drawio` XML**；仅消费 `assets/{assetBase}.png` 这一现有 sibling PNG 资产
- 若 PNG 存在，则按 Story 8.3 已落地的图片缩放规则插入 docx，宽度不超过 `pageSetup.contentWidthMm`
- 若 PNG 缺失，则在 Node 端预处理阶段将该图替换为占位文本 `[图片未导出: assets/{assetBase}.png]`，并追加 warning；导出继续，不阻塞
- `DrawioEditor` 的 export postMessage 新增 `scale: 2`，使后续用户再次编辑保存 draw.io 图时写出 2x PNG
- 已存在的 1x PNG 不做批量回填；用户下次编辑并保存该图后，自动升级为 2x PNG

### AC2: Mermaid SVG 在导出预处理中转 PNG（FR55）

**Given** 方案中内嵌 Mermaid 图表，Markdown 序列化格式为 `<!-- mermaid:{diagramId}:{assetFileName}:{encodedCaption} -->` + Mermaid fenced code block，且 `assetFileName` 本身已包含 `.svg` 扩展名
**When** docx 预览/导出执行
**Then**

- Node 端预处理从 `assets/{assetFileName}` 读取 SVG，并在调用 Python 渲染器前生成 sibling PNG `assets/{assetBase}.png`
- 预处理成功时，将整个 Mermaid 注释 + fenced block 替换为标准图片引用 `![caption](assets/{assetBase}.png)`；其中 `caption` 来自 URL-decoded `encodedCaption`
- 旧格式 `<!-- mermaid:{diagramId}:{assetFileName} -->` 视为合法输入，caption 为空字符串
- 若 SVG 缺失或转换失败，则将该 Mermaid block 替换为占位文本 `[图片未导出: assets/{assetBase}.png]`，并追加 warning；导出继续，不阻塞

### AC3: 图表按章节位置自动编号（FR56）

**Given** 方案中有多个图表（draw.io + Mermaid + 普通图片）
**When** docx 预览/导出执行
**Then**

- Python 渲染器自动为所有带非空 caption 的图片分配图表编号
- 编号格式固定为 `图 X-Y: {caption}`，其中 `X` 为一级标题（Markdown H1）章节号，`Y` 为该章节内图表序号
- 图表按文档出现顺序编号；每进入新的 H1，当前章节图号重置为 1
- 若图片出现在首个 H1 之前，归入隐式第 1 章，从 `图 1-1` 开始编号
- 无 caption 的图片（`![](path)`）不编号，不插入题注
- 题注段落使用模板 `caption` 样式；样式缺失时按 Story 8.3 既有 warning + fallback 规则处理
- 编号仅在导出时生成，不修改原始 Markdown（遵循 D5 Markdown 纯净原则）

### AC4: 交叉引用自动替换（FR56）

**Given** Markdown 正文中使用 `{figref:caption text}` 引用图表
**When** docx 预览/导出执行
**Then**

- 引用会在 Python 渲染前被替换为实际图表编号，如 `{figref:系统架构图}` -> `图 3-1`
- 匹配顺序为：caption 完全匹配优先；若无完全匹配，再按 caption 包含匹配
- 若包含匹配命中多个图表，则取文档顺序最先出现的图表并追加 `图表引用匹配不唯一` warning
- 若完全无法匹配，则保留原文并追加 warning
- 支持前向引用：引用可以出现在对应图表之前

### AC5: 降级容错与 warnings 链路（FR55, FR56, FR57, NFR16）

**Given** 预览/导出过程中遇到图表相关问题
**When** 问题不影响整体导出
**Then**

- draw.io PNG 缺失 -> 占位文本 + warning
- Mermaid SVG 缺失/转换失败 -> 占位文本 + warning
- 图表引用未匹配/匹配不唯一 -> 保留原文或按规则降级 + warning
- Python 题注样式缺失 -> warning + fallback；不得因为样式缺失中断导出
- 所有 warning 必须最终出现在预览任务输出中，供 Story 8.5 的格式问题清单复用

## Out of Scope（本 Story 不做）

- 不新增导出专用 IPC channel、preload API 或 renderer 命令
- 不新增预览侧 warnings 面板或格式问题清单 UI（由 Story 8.5 处理）
- 不批量重建历史 draw.io PNG；仅在再次编辑保存时升级为 2x PNG
- 不修改现有 draw.io / Mermaid 的 Markdown 序列化格式
- 不在 Python 中实现 SVG -> PNG 转换
- 不为图表编号暴露新的用户可配置格式或开关

## Tasks / Subtasks

- [x] Task 1: draw.io 2x PNG 生成链路对齐 (AC: #1)
  - [x] 1.1 修改 `src/shared/drawio-types.ts`
    - 为 `DrawioMessageOut` 增加 `scale?: number`
    - 保持现有 `load/export` action、`format: 'png'` 与 `spin` 字段不变
  - [x] 1.2 修改 `src/renderer/src/modules/editor/components/DrawioEditor.tsx`
    - 在收到 draw.io `save` 事件后发送 `postMessage({ action: 'export', format: 'png', spin: true, scale: 2 })`
    - 继续沿用现有 exact-match origin 校验、JSON stringify/parse、`pendingXmlRef` 与 `onSave(xml, pngBase64)` 流程
    - 不改变 `.drawio` / `.png` 的 basename 约定：PNG 路径仍由 `assetFileName.replace(/\\.drawio$/, '.png')` 推导
  - [x] 1.3 验证 `src/main/services/drawio-asset-service.ts`
    - 如现有 base64 -> Buffer -> `writeFile()` 逻辑已可透明支持更大 PNG，则不改生产代码，仅补/调测试说明
    - 若测试暴露尺寸相关问题，再做最小修正；不得改文件名协议

- [x] Task 2: Mermaid 导出预处理服务（唯一实现方案使用 `sharp`） (AC: #2, #5)
  - [x] 2.1 创建 `src/main/services/figure-export-service.ts`
    - `preprocessMarkdownForExport(markdown: string, projectPath: string): Promise<{ processedMarkdown: string; warnings: string[] }>`
    - 识别 Mermaid block：`<!-- mermaid:{diagramId}:{assetFileName}:{encodedCaption?} -->` + 紧随其后的 fenced code block
    - 识别 draw.io block：`<!-- drawio:{diagramId}:{assetFileName} -->` + 紧随其后的标准图片引用
    - 统一约定：`assetBase` = `assetFileName` 去掉扩展名后的 basename；draw.io 用 `.drawio -> .png`，Mermaid 用 `.svg -> .png`
    - 对 Mermaid：
      - 读取 `assets/{assetFileName}`
      - 生成 sibling PNG `assets/{assetBase}.png`
      - 成功则将整个 Mermaid block 替换为 `![caption](assets/{assetBase}.png)`
      - 失败则替换为纯文本占位符 `[图片未导出: assets/{assetBase}.png]`
    - 对 draw.io：
      - 校验标准图片引用中的 `assets/{assetBase}.png` 是否存在
      - 缺失时将整个 draw.io block 替换为纯文本占位符 `[图片未导出: assets/{assetBase}.png]`
    - 其余 Markdown 内容保持原样，不改动普通图片语法
  - [x] 2.2 SVG -> PNG 转换实现
    - 使用 `sharp` 在 main-process Node 环境完成 SVG rasterize
    - 输出目标为 sibling `.png`，目标清晰度按 2x 导出要求生成
    - service 内部返回 warning 文本而不是抛出“可降级错误”；真正不可恢复的路径/参数错误才抛 `BidWiseError`
  - [x] 2.3 修改 `package.json`
    - 新增 `sharp` 依赖
    - 将 `sharp` 加入 `pnpm.onlyBuiltDependencies`

- [x] Task 3: 将图表预处理接入既有 preview -> confirmExport 管线 (AC: #1, #2, #5)
  - [x] 3.1 修改 `src/main/services/export-service.ts`
    - 在 `startPreview()` 的 task-queue executor 中，于调用 `docxBridgeService.renderDocx()` 前执行 `figureExportService.preprocessMarkdownForExport()`
    - 将 `processedMarkdown` 传给 Python，而不是原始 `documentService.load().content`
    - 合并 `mapping.warnings + preprocessWarnings + renderResult.warnings`
    - 保持 `PreviewTaskResult.warnings` 数据链，供 `useExportPreview()` 和 Story 8.5 复用
  - [x] 3.2 进度与边界
    - 新增明确进度文案，例如 `正在预处理图表资产`
    - `confirmExport()` 继续保持 Story 8.2 的 copy-only 行为，禁止重新预处理或二次渲染
    - 不修改 `src/main/ipc/export-handlers.ts`、`src/preload/index.ts`、`src/shared/ipc-types.ts`

- [x] Task 4: Python 图表编号与交叉引用引擎 (AC: #3, #4, #5)
  - [x] 4.1 创建 `python/src/docx_renderer/engine/figure_numbering.py`
    - `FigureEntry` 数据结构至少包含：`line_index`, `caption`, `chapter_number`, `figure_number`, `label`
    - `build_figure_registry(lines: list[str]) -> list[FigureEntry]`
    - `replace_cross_references(lines: list[str], figures: list[FigureEntry], warnings: list[str]) -> list[str]`
    - caption 匹配需支持：完全匹配、包含匹配、匹配不唯一 warning、未匹配保留原文
  - [x] 4.2 修改 `python/src/docx_renderer/engine/renderer.py`
    - 在 `_parse_markdown()` 前先按行构建 figure registry，并产出替换过 `{figref:...}` 的 Markdown
    - 为 `_handle_image()` 增加 figure-entry 上下文，在插图后插入题注段落
    - 题注样式必须复用 Story 8.3 已有 helper：`_get_style_key(style_mapping, 'caption')` + `_resolve_paragraph_style(...)`
    - 题注段落居中；样式缺失时 warning + fallback，不得硬编码 `style_mapping.get(...)`
    - 保持现有图片白名单、`projectPath/assets/` 安全校验与 placeholder 降级逻辑
  - [x] 4.3 章节规则
    - H1 递增章节号并重置当前章节图号
    - 首个 H1 之前的图片归入隐式第 1 章
    - 空 caption 图片不进入 registry

- [x] Task 5: 测试与回归 (AC: #1-#5)
  - [x] 5.1 `tests/unit/renderer/modules/editor/components/DrawioEditor.test.tsx`
    - 验证 export postMessage 包含 `scale: 2`
    - 验证非 `https://embed.diagrams.net` 消息仍被忽略
  - [x] 5.2 `tests/unit/main/services/figure-export-service.test.ts`
    - Mermaid SVG -> PNG 成功
    - Mermaid SVG 缺失 / 转换失败 -> 占位文本 + warning
    - draw.io PNG 缺失 -> 占位文本 + warning
    - 旧格式 Mermaid 注释（无 caption）兼容
    - 混合文档（draw.io + Mermaid + 普通图片）预处理不误伤普通图片
  - [x] 5.3 `tests/unit/main/services/export-service.test.ts`
    - `startPreview()` 使用 `processedMarkdown`
    - warning 合并顺序正确
    - `confirmExport()` 仍为 copy-only，不重复预处理或重渲染
  - [x] 5.4 `python/tests/test_figure_numbering.py`
    - 单章节 / 多章节编号
    - 首个 H1 前图片归入隐式第 1 章
    - 精确匹配、包含匹配、匹配不唯一、未匹配
    - 前向引用
  - [x] 5.5 `python/tests/test_render.py`
    - 图片 + 题注段落输出
    - 无 caption 图片不编号
    - draw.io / Mermaid 预处理后生成的 `![caption](assets/*.png)` 可正常进入题注链路
    - `caption` 样式缺失时 warning + fallback
  - [x] 5.6 `tests/integration/docx-bridge/rich-export.integration.test.ts`
    - 扩展 docx 内容断言：编号题注与 warning 回传
  - [x] 5.7 `tests/e2e/stories/story-8-4-drawio-png-auto-numbering.spec.ts`
    - 覆盖预览 -> 确认导出 happy path
    - 验证包含图表资产的测试项目可成功导出，不回归 Story 8.2 / 8.3 既有交互
  - [x] 5.8 最低验证命令
    - `pnpm typecheck`
    - `pnpm test:unit`
    - `pnpm test:integration`
    - `pnpm test:python`
    - `playwright test tests/e2e/stories/story-8-4-drawio-png-auto-numbering.spec.ts`

## Dev Notes

### 关键架构模式

#### Node 端图表预处理 + Python 端编号渲染

```text
export-service.ts (Node.js, task-queue executor)
  ↓ resolveTemplateMapping()
  ↓ figureExportService.preprocessMarkdownForExport()
  |   - Mermaid SVG -> PNG
  |   - draw.io sibling PNG 存在性校验
  |   - 缺失图表替换为占位文本
  |   - 收集 preprocess warnings
  ↓ docxBridgeService.renderDocx(processedMarkdown)
      ↓ HTTP POST /api/render-documents
      Python renderer.py
        - build_figure_registry()
        - replace_cross_references()
        - 渲染图片
        - 在图片后插入居中题注段落
```

- **Node.js 负责**：图表资产准备、SVG -> PNG 转换、占位文本注入、预处理 warnings
- **Python 负责**：图表编号、交叉引用替换、docx 图片与题注渲染
- 不新增 IPC/preload 通道：继续复用 `export:preview` -> `docx:render`

#### Markdown 纯净原则（D5）

- 不在 `proposal.md` 中写入图表编号
- `{figref:...}` 仅作为 Markdown 占位语法存在；导出时替换
- draw.io / Mermaid 的现有注释 + 标准图片/代码块序列化格式保持不变

#### draw.io 高清 PNG 策略

- 8.4 的高清保障来自 **编辑保存时生成 2x PNG**，不是导出时重开 `.drawio` 再渲染
- 导出阶段只消费 sibling PNG，避免在 main-process 新引入一套 `.drawio` 解析栈
- 这与 Story 3.7 现有 `drawio-asset-service` / `markdownSerializer` 资产模型保持一致

#### Mermaid SVG -> PNG 方案

- 唯一实现方案：`sharp`
- 选择原因：
  - 当前仓库没有可复用的 SVG rasterizer
  - `nativeImage` 不作为本 Story 的 SVG 转 PNG 方案
  - 处理逻辑保持在 main-process，无需改 preload / renderer API

#### 图表编号规则

```python
chapter_number = 1
figure_number = 0
seen_real_h1 = False

for line in markdown_lines:
    if is_h1(line):
        if not seen_real_h1:
            seen_real_h1 = True
        else:
            chapter_number += 1
        figure_number = 0
    elif is_captioned_image(line):
        figure_number += 1
        label = f"图 {chapter_number}-{figure_number}"
```

- 实现时需注意：首个 H1 之前的图片归入隐式第 1 章；进入首个真实 H1 时，章节号应继续保持与文档阅读顺序一致，不得产生 `图 0-Y`
- 交叉引用替换必须在 `_parse_markdown()` 之前完成

### 与已有代码的衔接

| 已有资产 | Story | 本 Story 扩展方式 |
|---|---|---|
| `src/shared/drawio-types.ts` | 3-7 | 为 `DrawioMessageOut` 添加 `scale?: number` |
| `DrawioEditor.tsx` | 3-7 | export postMessage 添加 `scale: 2` |
| `drawio-asset-service.ts` | 3-7 | 继续复用 `.drawio` + sibling `.png` 写入协议 |
| `markdownSerializer.ts` | 3-7, 3-8 | 保持现有 draw.io / Mermaid 序列化格式不变 |
| `mermaid-asset-service.ts` | 3-8 | 继续只负责保存 `.svg`；不负责导出转换 |
| `export-service.ts` | 8-2, 8-3 | 插入图表预处理步骤并合并 warnings |
| `renderer.py` | 8-3 | 新增 figure registry / cross-reference / caption 渲染 |
| `rich-export.integration.test.ts` | 8-3 | 扩展 docx 内容与 warning 断言 |

### 文件结构

**新增文件：**

```text
src/main/services/figure-export-service.ts
tests/unit/main/services/figure-export-service.test.ts
python/src/docx_renderer/engine/figure_numbering.py
python/tests/test_figure_numbering.py
tests/e2e/stories/story-8-4-drawio-png-auto-numbering.spec.ts
```

**修改文件：**

```text
package.json
src/shared/drawio-types.ts
src/renderer/src/modules/editor/components/DrawioEditor.tsx
src/main/services/export-service.ts
python/src/docx_renderer/engine/renderer.py
tests/unit/renderer/modules/editor/components/DrawioEditor.test.tsx
tests/unit/main/services/export-service.test.ts
python/tests/test_render.py
tests/integration/docx-bridge/rich-export.integration.test.ts
```

### 不需要修改的文件（明确排除）

- `src/shared/ipc-types.ts`
- `src/preload/index.ts`
- `src/main/ipc/export-handlers.ts`
- `src/shared/docx-types.ts`
- `src/shared/export-types.ts`
- `src/renderer/src/modules/editor/serializer/markdownSerializer.ts`

### 反模式警告

- 不要在导出阶段重新解析 `.drawio` XML
- 不要使用 `nativeImage` 充当 Mermaid SVG rasterizer
- 不要修改既有 draw.io / Mermaid Markdown 序列化语法
- 不要在 Python 中做 SVG -> PNG 转换
- 不要新增 IPC / preload API
- 不要为图表编号发明新的用户配置面板或格式模板
- 不要让图表问题阻塞导出；一律走 warning + placeholder 降级

### 性能约束

- Mermaid SVG -> PNG 单张处理目标 < 2 秒
- 图表编号扫描 + 引用替换对 100 页方案目标 < 1 秒
- 整体预览/导出仍需满足 NFR5：100 页方案 < 30 秒

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 8 / Story 8.4]
- [Source: _bmad-output/planning-artifacts/prd.md — FR55, FR56, NFR5, NFR16]
- [Source: _bmad-output/planning-artifacts/architecture.md — D5, docx-bridge, task-queue 白名单]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — 编辑态占位符，导出时自动编号]
- [Source: _bmad-output/implementation-artifacts/3-7-drawio-embedded-editing.md — sibling `.png` 资产模型]
- [Source: _bmad-output/implementation-artifacts/3-8-mermaid-diagram-generation.md — Mermaid SVG 资产与编码 caption 格式]
- [Source: _bmad-output/implementation-artifacts/8-2-export-preview.md — preview -> confirmExport 管线]
- [Source: _bmad-output/implementation-artifacts/8-3-one-click-docx-export.md — 图片白名单、安全边界、warnings 链路、caption 样式 fallback]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

无阻塞问题。

### Completion Notes List

- Task 1: 为 `DrawioMessageOut` 增加 `scale?: number`，`DrawioEditor` export postMessage 添加 `scale: 2`。`drawio-asset-service` 的 base64→Buffer→writeFile 逻辑已可透明支持更大 PNG，无需修改生产代码。
- Task 2: 创建 `figure-export-service.ts`，实现 Mermaid SVG→PNG（sharp，density: 192 实现 2x）和 draw.io sibling PNG 存在性校验。缺失时替换为占位文本 + warning。新增 `sharp` 依赖并加入 `pnpm.onlyBuiltDependencies`。
- Task 3: 在 `export-service.ts` 的 `startPreview()` executor 中，于 `renderDocx()` 前插入 `figureExportService.preprocessMarkdownForExport()` 步骤。将 `processedMarkdown` 传给 Python。合并 `mapping.warnings + preprocessResult.warnings + renderResult.warnings`。`confirmExport()` 保持 copy-only 行为不变。
- Task 4: 创建 `figure_numbering.py` 实现 `build_figure_registry()` 和 `replace_cross_references()`。在 `renderer.py` 的 `render_markdown_to_docx()` 中，先构建 figure registry 并替换交叉引用，再传入 `_parse_markdown()`。在图片后插入居中题注段落，复用 `_resolve_paragraph_style()` + caption 样式 fallback。
- Task 5: 新增/修改 7 个测试文件共计约 30 个新测试用例。全部通过：typecheck ✓、unit 1780/1780 ✓、integration 23/23 ✓、python 74/74 ✓。

### File List

**新增文件：**
- `src/main/services/figure-export-service.ts`
- `python/src/docx_renderer/engine/figure_numbering.py`
- `tests/unit/main/services/figure-export-service.test.ts`
- `python/tests/test_figure_numbering.py`
- `tests/e2e/stories/story-8-4-drawio-png-auto-numbering.spec.ts`

**修改文件：**
- `package.json` — 新增 sharp 依赖 + onlyBuiltDependencies
- `src/shared/drawio-types.ts` — DrawioMessageOut 增加 scale
- `src/renderer/src/modules/editor/components/DrawioEditor.tsx` — export 添加 scale: 2
- `src/main/services/export-service.ts` — 插入图表预处理步骤
- `python/src/docx_renderer/engine/renderer.py` — 集成 figure registry、cross-ref、caption
- `tests/unit/renderer/modules/editor/components/DrawioEditor.test.tsx` — 新增 scale: 2 测试
- `tests/unit/main/services/export-service.test.ts` — 新增 preprocess mock 和 8-4 测试
- `python/tests/test_render.py` — 新增 caption/numbering 测试
- `tests/integration/docx-bridge/rich-export.integration.test.ts` — 新增 figure caption 集成测试

## Change Log

- 2026-04-12: Story 8.4 实施完成
  - Task 1-5 全部完成，所有 AC 满足
  - 新增 figure-export-service (Node) + figure_numbering (Python)
  - 集成至 export-service preview 管线
  - 全量测试通过：typecheck、unit、integration、python
- 2026-04-12: `validate-create-story` 修订
  - 补回 create-story 模板要求的 validation note，并新增 `Change Log`
  - 修正 Story 8.4 与当前代码基线/前序 story 的关键边界：draw.io 导出消费 sibling PNG，高清保障来自 `scale: 2` 保存链路，而非导出期重开 `.drawio`
  - 将 Mermaid 导出方案收敛为 Node 端 `sharp` 预处理，移除 `nativeImage` 二选一歧义
  - 删除不必要的 `RenderDocxInput` / `RenderRequest` 编号开关扩展，避免 scope creep
  - 补齐 `src/shared/drawio-types.ts`、`package.json`、`figure-export-service`、`figure_numbering.py`、集成测试与 E2E 落点
