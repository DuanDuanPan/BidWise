结果: PASS

## 摘要

本次校验严格按 `validate-create-story` 工作流执行，而不是通用自由评审。复核范围覆盖：

- `_bmad/bmm/config.yaml`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/workflow.md`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/checklist.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/3-7-drawio-embedded-editing.md`
- `_bmad-output/implementation-artifacts/3-8-mermaid-diagram-generation.md`
- `_bmad-output/implementation-artifacts/8-1-enabler-python-docx-engine.md`
- `_bmad-output/implementation-artifacts/8-2-export-preview.md`
- `_bmad-output/implementation-artifacts/8-3-one-click-docx-export.md`
- `src/shared/drawio-types.ts`
- `src/main/services/drawio-asset-service.ts`
- `src/main/services/mermaid-asset-service.ts`
- `src/renderer/src/modules/editor/components/DrawioEditor.tsx`
- `src/renderer/src/modules/editor/serializer/markdownSerializer.ts`
- `src/main/services/export-service.ts`
- `src/main/services/docx-bridge/index.ts`
- `src/main/services/docx-bridge/render-client.ts`
- `python/src/docx_renderer/engine/renderer.py`
- `python/src/docx_renderer/models/schemas.py`
- `tests/unit/renderer/modules/editor/components/DrawioEditor.test.tsx`
- `tests/unit/renderer/modules/editor/serializer/drawioSerializer.test.ts`
- `tests/unit/renderer/modules/editor/serializer/mermaidSerializer.test.ts`
- `tests/unit/main/services/export-service.test.ts`
- `tests/integration/docx-bridge/rich-export.integration.test.ts`
- 官方技术资料：
  - draw.io embed mode: https://www.drawio.com/doc/faq/embed-mode
  - Electron `nativeImage`: https://www.electronjs.org/docs/latest/api/native-image

校验过程中，已将所有可安全原位修复的问题直接回写到以下文件：

- [_bmad-output/implementation-artifacts/8-4-drawio-png-auto-numbering.md](/Users/enjoyjavapan163.com/Public/SyncForAll/Doc/BidWise/_bmad-output/implementation-artifacts/8-4-drawio-png-auto-numbering.md)
- [_bmad-output/planning-artifacts/epics.md](/Users/enjoyjavapan163.com/Public/SyncForAll/Doc/BidWise/_bmad-output/planning-artifacts/epics.md)
- [_bmad-output/implementation-artifacts/3-7-drawio-embedded-editing.md](/Users/enjoyjavapan163.com/Public/SyncForAll/Doc/BidWise/_bmad-output/implementation-artifacts/3-7-drawio-embedded-editing.md)

## 发现的关键问题

None

## 已应用增强

- 为 Story 8.4 补回 create-story 模板要求的 validation note，并新增 `Change Log`，恢复 story artifact 结构完整性。
- 修正 FR55 的实现边界，使其与当前仓库真实基线一致：
  - draw.io 导出阶段不再描述为“重新解析 `.drawio` XML 生成高清 PNG”。
  - 明确改为消费现有 sibling `.png` 资产。
  - 高清保障来自 `DrawioEditor` 的 `scale: 2` 保存链路，而不是导出期重建图像。
- 同步修正了直接相关工件中的同类矛盾：
  - `epics.md` 中 Story 8.4 的高层 AC 已对齐为“draw.io sibling PNG + Mermaid 预处理转换 + warning/placeholder 降级”。
  - Story 3.7 中对 Story 8.4 的关系描述已改为消费 sibling PNG，并通过 `scale: 2` 逐步升级为高清图。
- 将 Mermaid 导出方案收敛为唯一实现路径：Node 端 `sharp` 预处理。
  - 删除了原 story 中“`sharp` 或 `nativeImage` 二选一”的歧义。
  - 依据官方 `nativeImage` 文档，移除了把 `nativeImage` 当成 SVG rasterizer 的错误暗示。
  - 同时补齐了 `package.json` 与 `pnpm.onlyBuiltDependencies` 的任务要求，避免实现阶段遗漏依赖安装条件。
- 修复了多个会直接误导开发的任务级错误：
  - 原 story 把 `assetFileName` 当成“不含扩展名”的占位符使用，和现有 draw.io / Mermaid serializer 真实契约冲突；现已统一说明 `assetFileName` 本身已含 `.drawio` / `.svg`。
  - 原 story 把 draw.io PNG 文件名写成 `{diagramId}.png`，与当前 `assetFileName.replace(/\.drawio$/, '.png')` 规则冲突；现已改正。
  - 原 story 中 `convertSvgToPng(...): Promise<void>` 却写“返回 null + warning”，函数契约自相矛盾；现已改为在 service 内部吸收可降级错误，并通过预处理 warnings 返回。
- 删除了不必要的 scope creep：
  - 去除了 `RenderDocxInput.autoNumberFigures` / `figureNumberFormat`
  - 去除了 `RenderRequest.auto_number_figures` / `figure_number_format`
  - 去除了对应的 shared type / schema 改动要求
  这些能力并非 FR55/FR56 必需，保留只会扩大变更面并增加歧义。
- 明确了预处理后的降级语义，避免 Python 端重复报错或双重 placeholder：
  - draw.io PNG 缺失时，Node 预处理直接把整个 block 改写为占位文本。
  - Mermaid SVG 缺失/转换失败时，同样直接改写为占位文本。
  - 普通图片语法保持原样，不被图表预处理误伤。
- 补齐了与 Story 8.2 / 8.3 的关键非回归边界：
  - `startPreview()` 在 task-queue executor 中增加图表预处理步骤。
  - `confirmExport()` 继续保持 copy-only，不允许重新预处理或二次渲染。
  - warnings 合并链路明确为 `mapping + preprocess + renderResult`，最终进入 preview task output，供 Story 8.5 复用。
- 将图表编号规则收敛为可直接实现的具体算法：
  - caption 非空图片才进入 registry。
  - H1 驱动章节号递增。
  - 首个 H1 之前的图片归入隐式第 1 章。
  - `{figref:...}` 支持精确匹配、包含匹配、匹配不唯一 warning、前向引用。
- 修正了 Python 侧实现指令，使其复用 Story 8.3 已落地 helper，而不是发明新的样式访问方式：
  - 题注样式必须使用 `_get_style_key(style_mapping, 'caption')`
  - 再经 `_resolve_paragraph_style(...)`
  - 不再使用错误的 `style_mapping.get(...)` 伪代码
- 补齐了真实需要改动和真实不需要改动的文件清单：
  - 新增 `src/shared/drawio-types.ts`、`package.json`、`figure-export-service.ts`、`figure_numbering.py` 及对应测试文件
  - 明确 `src/shared/ipc-types.ts`、`src/preload/index.ts`、`src/main/ipc/export-handlers.ts`、`src/shared/docx-types.ts`、`src/shared/export-types.ts`、`markdownSerializer.ts` 不需要修改
- 补齐了缺失的测试矩阵与最低验证命令，使 story 可直接交给 dev-story：
  - `DrawioEditor` postMessage `scale: 2`
  - `figure-export-service` 单测
  - `python/tests/test_figure_numbering.py`
  - `python/tests/test_render.py` 的题注/编号链路
  - `rich-export.integration.test.ts`
  - 新增 8.4 专属 E2E spec 与最低执行命令集

## 剩余风险

None

## 最终结论

经本轮 `validate-create-story` 复核与原位修正后，Story 8.4 已与 Epic 8 / PRD / Architecture / UX 规划文档、Story 3.7 / 3.8 / 8.2 / 8.3 的真实代码基线，以及当前 `export-service` / `docx-bridge` / `renderer.py` / 测试目录结构完成必要对齐。

当前已无剩余会阻塞开发的未解决歧义、矛盾或缺失项，结论为 PASS。
