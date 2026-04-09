结果: PASS

## 摘要

本次校验按 `validate-create-story` 工作流执行，而非通用自由评审。已重新审阅 Story 8.2、Epic 8 / PRD / Architecture / UX planning artifacts、Story 8.1 前序工件、当前代码库实现状态、`prototype.manifest.yaml`、4 张参考 PNG、以及 `prototype.pen` 的结构节点，并对照 `bmad-create-story` checklist 逐项消除可安全修复的问题。

本次已直接修订 [_bmad-output/implementation-artifacts/8-2-export-preview.md](/Volumes/Data/Work/Code/StartUp/BidWise/_bmad-output/implementation-artifacts/8-2-export-preview.md) 与 [_bmad-output/implementation-artifacts/8-2-export-preview-ux/ux-spec.md](/Volumes/Data/Work/Code/StartUp/BidWise/_bmad-output/implementation-artifacts/8-2-export-preview-ux/ux-spec.md)。`sprint-status.yaml` 已核对，`epic-8: in-progress` 与 `8-2-export-preview: ready-for-dev` 当前已正确，无需额外修改。

## 发现的关键问题

None

## 已应用增强

- 在 story 中删除了会导致重复实现的 preview 专用 Python/HTTP 通路设计，明确要求直接复用 Story 8.1 已落地的 `docxBridgeService.renderDocx()`，并显式禁止新增 `/api/render-preview` / `previewDocx()`。
- 将预览流程改为真正的 `task-queue` 异步任务模型：`export:preview` 仅返回 `taskId`，由 renderer 通过 `task:get-status` + `export:load-preview` 读取结果，补齐进度、取消、清理与完成态行为，避免“UI 要求可取消，但实现仍同步阻塞”的矛盾。
- 修复了原 story 中“预览返回 base64 后立即删除 temp 文件”与“确认导出必须复用当前预览文件、不得重渲染”之间的冲突，改为以 `exports/.preview-*.docx` 作为项目级临时文件，在关闭、重试或导出成功后清理。
- 增补了 `tempPath` 安全边界：`loadPreviewContent`、`confirmExport`、`cleanupPreview` 都必须校验路径位于项目 `exports/` 下且文件名匹配 `.preview-*.docx`，避免任意文件读取/复制风险。
- 收敛了模板处理边界：Story 8.2 只允许消费显式 `templatePath`，或读取 `template-mapping.json` 顶层 `templatePath`；明确禁止在本 story 发明新 schema，也禁止从 `proposal.meta.json.templateId` 反推出 Word 模板路径。
- 对齐了当前仓库里 Story 1.9 的真实现状：把 `Cmd/Ctrl+E` 与 command palette 的“导出功能即将推出”占位行为纳入 Story 8.2 的替换范围，并补齐对应 unit/e2e 回归要求。
- 依据 `docx-preview` 官方稳定 API 约束，修订 story 与 UX 规格中的页码承诺：只在页码元数据或渲染后 `.docx-page` 数量可得时显示页码，否则隐藏页码区，不再要求不可靠的实时分页导航。
- 在 UX 规格中补充了取消与保存取消的关键行为：取消加载时要 best-effort 清理临时 preview 文件；系统保存对话框取消时必须保持预览模态打开且不显示成功 Toast。
- 为 story 增加了 validation note、结构化技术决策、明确禁止事项、与当前代码库一致的文件路径/测试路径，以及变更记录，降低 dev-agent 误读概率。

## 剩余风险

- `docx-preview` 的浏览器渲染与真实 Word 打开效果仍可能存在细微视觉差异；这属于已记录的 Alpha 阶段信息性限制，不阻塞当前 story 实现。

## 最终结论

Story 8.2 现已满足 implementation-ready 要求。经本次原位修订后，不存在仍会阻塞开发的未解决歧义、冲突或缺失项，结论为 PASS。
