结果: PASS

## 摘要

本次按 `validate-create-story` 工作流重新校验 Story `3-7-drawio-embedded-editing`，并对 story 文件、同目录 UX spec、prototype manifest 做了原位修订。校验过程覆盖了 workflow/checklist、Epic 3 / PRD / Architecture / UX 规划文档、前序 Story 3.6、当前 renderer/main/preload 代码基线、4 张 PNG 导出、`.pen` 结构，以及 draw.io 官方 embed 文档。

本轮重点复核并对齐了以下事实来源：

- `_bmad/bmm/config.yaml`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/workflow.md`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/checklist.md`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/discover-inputs.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/3-6-writing-style-template.md`
- `_bmad-output/implementation-artifacts/3-7-drawio-embedded-editing.md`
- `_bmad-output/implementation-artifacts/3-7-drawio-embedded-editing-ux/ux-spec.md`
- `_bmad-output/implementation-artifacts/3-7-drawio-embedded-editing-ux/prototype.manifest.yaml`
- `_bmad-output/implementation-artifacts/3-7-drawio-embedded-editing-ux/exports/gSbw7.png`
- `_bmad-output/implementation-artifacts/3-7-drawio-embedded-editing-ux/exports/RmZHn.png`
- `_bmad-output/implementation-artifacts/3-7-drawio-embedded-editing-ux/exports/a7QGi.png`
- `_bmad-output/implementation-artifacts/3-7-drawio-embedded-editing-ux/exports/kDWv6.png`
- `_bmad-output/implementation-artifacts/3-7-drawio-embedded-editing-ux/prototype.pen`
- `package.json`
- `src/renderer/index.html`
- `src/renderer/src/modules/editor/components/EditorToolbar.tsx`
- `src/renderer/src/modules/editor/components/EditorView.tsx`
- `src/renderer/src/modules/editor/components/PlateEditor.tsx`
- `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx`
- `src/renderer/src/modules/editor/components/SourceAwareParagraph.tsx`
- `src/renderer/src/modules/editor/plugins/editorPlugins.ts`
- `src/renderer/src/modules/editor/serializer/markdownSerializer.ts`
- `src/renderer/src/stores/documentStore.ts`
- `src/renderer/src/stores/projectStore.ts`
- `src/shared/ipc-types.ts`
- `src/main/ipc/index.ts`
- `src/main/ipc/create-handler.ts`
- `src/main/services/document-service.ts`
- `src/main/services/project-service.ts`
- `src/main/utils/project-paths.ts`
- `src/preload/index.ts`
- `tests/unit/preload/security.test.ts`
- `tests/unit/renderer/modules/editor/serializer/markdownSerializer.test.ts`
- `tests/unit/renderer/modules/editor/components/PlateEditor.test.tsx`
- `tests/unit/renderer/modules/editor/components/EditorView.test.tsx`
- 官方资料：
  - https://www.drawio.com/doc/faq/embed-mode
  - https://www.drawio.com/blog/embedding-walkthrough

`.pen` 查阅顺序按用户要求执行：先读 story design notes，再读 manifest，再查看 PNG，最后核对 `prototype.pen` 结构与交互标注。

验证命令：

- `pnpm exec prettier --check _bmad-output/implementation-artifacts/3-7-drawio-embedded-editing.md _bmad-output/implementation-artifacts/3-7-drawio-embedded-editing-ux/ux-spec.md _bmad-output/implementation-artifacts/3-7-drawio-embedded-editing-ux/prototype.manifest.yaml`

## 发现的关键问题

None

## 已应用增强

- 明确编辑态截图中的保存 / 关闭按钮优先映射为 draw.io embed mode 原生 Save / Exit 控件，宿主层不再重复实现第二套 overlay 按钮，避免偏离官方嵌入能力和产生多余交互分叉。
- 明确 `export` 事件后的持久化顺序：先经 `window.api.drawioSaveAsset(...)` 完成 `.drawio` / `.png` 持久化，只有在 `ApiResponse.success === true` 时才更新节点运行时数据并收起为预览态。
- 补齐保存失败行为：保存失败时必须保持编辑态、保留最近一次成功预览，不得收起为新预览或覆写现有成功态，并通过现有 Ant Design 提示体系通知用户重试。
- 明确 renderer 侧 draw.io 资产读取必须遵循现有 preload `ApiResponse` 包装约定；`drawioLoadAsset(...)` 返回 `success: true, data: null` 或读取失败时，组件需显示 warning placeholder，并保留编辑 / 删除入口，不得让整个编辑器树崩溃。
- 补齐测试要求：`DrawioEditor.test.tsx` 需覆盖保存失败保持编辑态，`DrawioElement.test.tsx` 需覆盖资产缺失 fallback。
- 消除 story 内部 embed URL 不一致问题，将 Dev Notes 中遗漏的 `libraries=1` 补齐，使 story、UX spec 与 prototype manifest 的嵌入地址保持一致。

## 剩余风险

None

## 最终结论

经本轮 `validate-create-story` 复核与原位修正后，Story 3.7 已无剩余可执行阻塞项。当前 story、同目录 UX 工件、以及与 renderer/main/preload 真实代码基线的关键契约已完成必要对齐，结论为 PASS。
