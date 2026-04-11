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
- `_bmad-output/implementation-artifacts/8-1-enabler-python-docx-engine.md`
- `_bmad-output/implementation-artifacts/8-2-export-preview.md`
- `_bmad-output/implementation-artifacts/8-3-one-click-docx-export.md`
- `src/main/services/export-service.ts`
- `src/main/services/docx-bridge/index.ts`
- `src/main/services/docx-bridge/render-client.ts`
- `src/shared/export-types.ts`
- `src/shared/docx-types.ts`
- `src/shared/ipc-types.ts`
- `src/main/utils/project-paths.ts`
- `src/main/services/template-service.ts`
- `python/src/docx_renderer/models/schemas.py`
- `python/src/docx_renderer/engine/renderer.py`
- `python/src/docx_renderer/routes/render.py`
- `python/tests/test_render.py`
- `tests/unit/main/services/export-service.test.ts`
- `tests/unit/main/services/docx-bridge-render-client.test.ts`
- `tests/unit/main/services/docx-bridge-service.test.ts`
- `tests/integration/docx-bridge/bridge-integration.test.ts`
- `tests/e2e/stories/story-8-2-export-preview.spec.ts`
- 官方技术资料：
  - `python-docx` Quickstart: https://python-docx.readthedocs.io/en/latest/user/quickstart.html
  - Pydantic Alias docs: https://pydantic.dev/docs/validation/latest/concepts/alias/

本次已直接修订：

- [_bmad-output/implementation-artifacts/8-3-one-click-docx-export.md](/Users/enjoyjavapan163.com/Public/SyncForAll/Doc/BidWise/_bmad-output/implementation-artifacts/8-3-one-click-docx-export.md)
- [_bmad-output/implementation-artifacts/8-2-export-preview.md](/Users/enjoyjavapan163.com/Public/SyncForAll/Doc/BidWise/_bmad-output/implementation-artifacts/8-2-export-preview.md)

其中，`8-2-export-preview.md` 的 `Status` 已与 `sprint-status.yaml` 的 `8-2-export-preview: done` 对齐，消除了 8.3 前置依赖状态的不一致。

## 发现的关键问题

None

## 已应用增强

- 为 Story 8.3 补回 create-story 模板应有的 validation note，并新增 `Change Log`，使其符合 `validate-create-story` 产物约定。
- 修正了模板映射的主进程边界，明确 `resolveTemplateMapping()` 必须返回归一化后的 `templatePath/styleMapping/pageSetup/warnings`，并区分：
  - 缺失 `template-mapping.json` 时允许兼容 fallback。
  - 文件存在但 JSON 非法/结构错误时必须抛出明确 `ValidationError`，不得继续沿用 Story 8.2 的静默吞错行为。
- 修正了 `templatePath` 解析语义，避免把 `company-data/templates/...` 这样的相对路径原样传给 Python：
  - 候选根目录顺序对齐现有 `template-service` 的 `company-data` 解析模式。
  - 候选全失配时也要传给 Python 一个绝对候选路径，保证 `TEMPLATE_NOT_FOUND` 的报错不依赖 Python 当前工作目录。
- 把 Python 请求/结果契约从“裸 `dict`”收紧为明确 model：
  - `StyleMapping`
  - `PageSetup`
  - `RenderRequest.style_mapping/page_setup/project_path`
  - `RenderResult.warnings`
  这样 dev-agent 不会在 8.3 实现时发明临时字段或丢失 camelCase / snake_case 边界。
- 补齐了 `warnings` 的完整数据链，不再只停留在 Python 侧概念：
  - `RenderResult.warnings`
  - `RenderDocxOutput.warnings`
  - `PreviewTaskResult.warnings`
  - `useExportPreview()` 保留 `previewMeta.warnings`
  同时明确 8.3 只要求保留数据契约，不要求新增完整警告面板 UI，避免和 Story 8.5 重复实现。
- 修正了图片插入任务中的两个关键技术错误：
  - 将“支持绝对路径”收紧为“仅允许解析到 `{projectPath}/assets/` 的路径”，阻止任意文件读取。
  - 将“`Inches(max_width)` 直接吃毫米值”的错误实现提示改为 `Mm(...)` / 毫米换算 + 仅设置 `shape.width` 保持宽高比。
- 明确了 8.3 只承诺处理 Markdown 图片语法里的 `.png/.jpg/.jpeg`，并把 Mermaid / SVG / `.drawio` 资产导出明确列入 out-of-scope：
  - 非白名单格式统一 warning + placeholder。
  - 不在 8.3 内补做 SVG 转 PNG。
  - 避免和 Story 8.4 的导出增强范围打架。
- 修正了 TOC 的验收与预览边界：
  - `docx-preview` 不负责执行 Word 域刷新。
  - AC4 的最终验收以导出的 `.docx` 在 Word 中刷新字段后的结果为准。
  这消除了“浏览器预览必须与 Word 中 TOC 页码完全一致”的隐性矛盾。
- 去掉了会引入错误依赖的实现暗示：
  - 明确禁止新增 `markdown-it`、`mistune`、`Pillow` 等本 Story 不需要的第三方库。
  - 性能验证改为现有 `pytest + time.perf_counter()`，不再凭空要求 `pytest-benchmark`。
- 对齐了当前仓库真实测试布局：
  - E2E 目标文件路径改为 `tests/e2e/stories/story-8-3-one-click-docx-export.spec.ts`
  - 单测明确落到现有 `export-service` / `docx-bridge-render-client` / `docx-bridge-service` 文件
  - Python fixture 放到现有 `python/tests/fixtures/` 体系
  - 性能 fixture 改为 deterministic builder，避免提交一个巨大的 100 页 Markdown 样本文件
- 收紧了 8.3 对 8.2 已落地能力的依赖方式：
  - 只允许 `startPreview()` 读取并透传完整 mapping。
  - `confirmExport()` 继续保持 copy-only，禁止重新读取 mapping 或二次渲染。
  这消除了原 story 中“8.2 已要求复用 preview 文件”与“8.3 又让 confirm 阶段重新参与渲染配置”的冲突。
- 将 `8-2-export-preview.md` 的 `Status` 从 `review` 更新为 `done`，与 [_bmad-output/implementation-artifacts/sprint-status.yaml](/Users/enjoyjavapan163.com/Public/SyncForAll/Doc/BidWise/_bmad-output/implementation-artifacts/sprint-status.yaml) 保持一致，消除 8.3 前置 Story 状态冲突。

## 剩余风险

- Word TOC 域代码需要在 Microsoft Word 中刷新字段后才显示最终页码；浏览器侧 `docx-preview` 不执行该刷新。这是 Word 字段机制的已知信息性限制，不阻塞 8.3 实现。

## 最终结论

经本轮 `validate-create-story` 复核与原位修正后，Story 8.3 已与 Epic 8 / PRD / Architecture / UX 规划文档、Story 8.1/8.2 的真实代码基线、当前 `docx-bridge/export-service/python renderer` 契约、以及仓库现有测试目录结构完成必要对齐。当前已无剩余会阻塞开发的未解决歧义、矛盾或缺失项，结论为 PASS。
