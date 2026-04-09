结果: PASS

## 摘要

本次按 `validate-create-story` workflow（`bmad-create-story` Validate Mode）重新验证 Story 3.8：`_bmad-output/implementation-artifacts/3-8-mermaid-diagram-generation.md`，并在最终结论前直接修复了所有可安全原位解决的 story-spec 问题。

验证覆盖：
- `.agents/skills/bmad-create-story/workflow.md`
- `.agents/skills/bmad-create-story/checklist.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/3-7-drawio-embedded-editing.md`
- `_bmad-output/implementation-artifacts/story-3-1-plate-editor-markdown-serialization.md`
- `_bmad-output/implementation-artifacts/3-8-mermaid-diagram-generation-ux/prototype.manifest.yaml`
- `_bmad-output/implementation-artifacts/3-8-mermaid-diagram-generation-ux/ux-spec.md`
- `_bmad-output/implementation-artifacts/3-8-mermaid-diagram-generation-ux/prototype.pen`
- `_bmad-output/implementation-artifacts/3-8-mermaid-diagram-generation-ux/exports/MjRXk.png`
- `_bmad-output/implementation-artifacts/3-8-mermaid-diagram-generation-ux/exports/zXWJU.png`
- `_bmad-output/implementation-artifacts/3-8-mermaid-diagram-generation-ux/exports/kFTq8.png`
- `_bmad-output/implementation-artifacts/3-8-mermaid-diagram-generation-ux/exports/vSEQc.png`
- 当前 draw.io/editor/IPC/preload/test 代码基线
- Mermaid 官方 API 用法文档（https://mermaid.js.org/config/usage.html）与 npm/jsDelivr latest 查询（2026-04-08：`11.14.0`）

## 发现的关键问题

None

## 已应用增强

- 补充 Story 3.8 专属 UX manifest / PNG / `.pen` lookup order 与关键视觉约束，确保 dev-story 不会跳过用户明确提供的 UX 原型上下文。
- 将 Story 与 story 级 UX spec 中的编辑态边框修正为与 PNG / `.pen` 一致的蓝色 2px 实线，移除会导致视觉实现歧义的虚线要求。
- 明确 `mermaid.parse()` / `mermaid.render()` 都按 async API 处理，渲染前先 parse，错误统一进入 error state。
- 明确 `onRenderSuccess` / 保存逻辑必须绑定当前 `source`，只有最新成功渲染的 `source` 与当前 textarea `source` 完全一致时才允许保存 SVG，防止旧 SVG 被误存为新源码资产。
- 明确当前 source 仍有语法错误或尚无匹配成功 SVG 时保持编辑模式并显示非阻塞 warning，不得覆盖资产或丢失 Markdown source。
- 补充 MermaidRenderer 的渲染中 loading 要求，要求不阻塞 textarea 输入。
- 明确 MermaidElement 通过 `useProjectStore((s) => s.currentProject?.id)` 获取 `projectId`，不得把 `projectId` 持久化到 Plate node data。
- 补充点击外部收起的实现约束：必须可靠区分外部 pointer/focus 事件，不能在点击 textarea、完成按钮或标题输入框时误收起。
- 明确 `RegisteredMermaidChannels` 必须在 `src/main/ipc/index.ts` 中加入 `_AllRegistered` union，满足当前 IPC 穷举检查模式。
- 保留并复核既有增强：create-story validation note、Markdown 围栏示例、`assetFileName` `.svg` 扩展名与 basename 安全校验、`ApiResponse.success` 解包、preload 白名单、删除确认、保存失败重试、测试路径与 Epic 8 边界。

## 剩余风险

None

## 最终结论

经本轮 `validate-create-story` workflow 复核与原位修正后，Story 3.8 已与 Epic 3 / FR26 / Architecture D5 / UX 图形层要求、Story 3.7 真实代码基线、当前 editor/IPC/preload/test 目录结构、Story 3.8 UX 原型四态、以及 Mermaid v11.14.0 官方 API 行为完成必要对齐。当前无剩余可执行阻塞项，结论为 PASS。
