结果: PASS

## 摘要

本次按 `validate-create-story` workflow（`bmad-create-story` Validate Mode）复核 Story 4.3：`_bmad-output/implementation-artifacts/4-3-smart-annotation-panel.md`，并在给出结论前直接修复了所有可安全原位解决的 story-spec 问题。

已核对的 workflow / 配置工件：

- `.agents/skills/bmad-create-story/SKILL.md`
- `.agents/skills/bmad-create-story/workflow.md`
- `.agents/skills/bmad-create-story/checklist.md`
- `.agents/skills/bmad-create-story/template.md`
- `_bmad/bmm/config.yaml`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

已核对的规划与前序上下文：

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/4-1-enabler-annotation-service.md`
- `_bmad-output/implementation-artifacts/4-2-annotation-card-color-coding.md`

已按用户指定 lookup order 核对的 UX 工件：

- `_bmad-output/implementation-artifacts/4-3-smart-annotation-panel-ux/prototype.manifest.yaml`
- `_bmad-output/implementation-artifacts/4-3-smart-annotation-panel-ux/ux-spec.md`
- `_bmad-output/implementation-artifacts/4-3-smart-annotation-panel-ux/exports/5EgWg.png`
- `_bmad-output/implementation-artifacts/4-3-smart-annotation-panel-ux/exports/Sy9e0.png`
- `_bmad-output/implementation-artifacts/4-3-smart-annotation-panel-ux/exports/dtCEl.png`
- `_bmad-output/implementation-artifacts/4-3-smart-annotation-panel-ux/exports/wcfhw.png`
- `_bmad-output/implementation-artifacts/4-3-smart-annotation-panel-ux/prototype.pen`

已核对的当前代码基线：

- `src/shared/annotation-types.ts`
- `src/shared/ai-types.ts`
- `src/shared/ipc-types.ts`
- `src/shared/chapter-types.ts`
- `src/shared/chapter-markdown.ts`
- `src/preload/index.ts`
- `src/main/services/annotation-service.ts`
- `src/main/services/agent-orchestrator/orchestrator.ts`
- `src/main/services/agent-orchestrator/agents/generate-agent.ts`
- `src/main/services/ai-proxy/index.ts`
- `src/main/services/ai-proxy/provider-adapter.ts`
- `src/main/services/task-queue/progress-emitter.ts`
- `src/renderer/src/stores/annotationStore.ts`
- `src/renderer/src/stores/documentStore.ts`
- `src/renderer/src/stores/projectStore.ts`
- `src/renderer/src/modules/annotation/hooks/useAnnotation.ts`
- `src/renderer/src/modules/annotation/constants/annotation-colors.ts`
- `src/renderer/src/modules/project/components/AnnotationPanel.tsx`
- `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
- `src/renderer/src/modules/project/hooks/useSopNavigation.ts`
- `src/renderer/src/modules/editor/components/EditorView.tsx`
- `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx`
- `src/renderer/src/modules/editor/hooks/useDocumentOutline.ts`
- `src/renderer/src/modules/editor/hooks/useSourceAttribution.ts`
- `tests/unit/renderer/project/AnnotationPanel.test.tsx`
- `tests/unit/renderer/project/ProjectWorkspace.test.tsx`
- `package.json`

额外核对的官方文档：

- Plate Core API: https://platejs.org/docs/api/core
- Ant Design Segmented: https://ant.design/components/segmented/

本次未运行 `pnpm test` / `pnpm lint` / `pnpm typecheck` / `pnpm build`，因为任务目标是 story artifact validation 而不是代码实现；对应验证命令已保留在 Story 4.3 的 Task 8 中。

## 发现的关键问题

None

## 已应用增强

- 补回了 create-story 模板要求的 validation note，并为 Story 4.3 新增 `Change Log`，便于后续 dev-story / code-review 追溯。
- 修正了章节联动契约：不再把当前章节写成不存在的 `section-3.2` 或“纯 heading text”，改为 `ChapterHeadingLocator` + 统一 `createChapterLocatorKey(locator)` 键。
- 修正了面板视图语义：当前章节存在时，面板默认以当前章节为 scope；列表、计数器、零批注、过载检测均针对当前章节子集，不再把其他章节批注简单排到下方。
- 修正了排序职责边界：`sortAnnotations()` 只做章节 scope 内的 pending / stage-weight / createdAt 排序，不再同时承担跨章节过滤职责。
- 修正了 5 个过滤按钮与 6 个批注类型的映射：紫色按钮同时控制 `human + cross-role`，Badge 计数按“当前章节 scope + 当前类型过滤”计算。
- 补齐了章节联动实现前提：明确需要在 `OutlineHeadingElement.tsx` 输出 `data-heading-level` / `data-heading-occurrence` / `data-heading-locator-key`，否则 `useCurrentSection()` 无法可靠区分重复标题与不同层级标题。
- 修正了 `ProjectWorkspace` 传参来源：Story 4.3 必须复用 `useSopNavigation().currentStageKey` 作为当前有效 `sopPhase`，而不是再次读取可能滞后的 `projectStore.currentProject?.sopStage`。
- 修正了 Ask System 实现边界：继续复用 `generate` agent，但必须在 `generate-agent.ts` 增加 `mode: 'ask-system'` 分支，并新增独立 `.prompt.ts`；禁止直接复用章节生成 prompt 硬塞问答字段。
- 修正了“Streaming 回答”的实现说明：当前 `task:progress` / `TaskProgressEvent` 只有阶段进度，没有 token 增量文本，因此 Alpha 版改为“任务进度 + 完成后本地 progressive reveal”的 Streaming 风格展示；不在 Story 4.3 内扩展 provider streaming / IPC 事件 schema。
- 修正了 Ask System 上下文来源：明确使用 `extractMarkdownSectionContent(documentStore.content, currentSection.locator)` 构造当前章节正文，而不是只传一个 `sectionId` 字符串。
- 修正了过载应急触发条件与行为：仅在当前章节 `pending` 视图中且数量 > 15 触发；选项 B 明确为 placeholder 且不触发 agent，选项 C 明确为局部 `summary` 模式。
- 修正了已有基础设施路径：`formatRelativeTime` 真实位置是 `src/renderer/src/shared/lib/format-time.ts`，而不是 story 草稿中的 `modules/annotation/lib/format-time.ts`。
- 修正了测试矩阵与目录路径：把错误的 `tests/unit/renderer/modules/project/components/AnnotationPanel.test.tsx` 改为真实路径 `tests/unit/renderer/project/AnnotationPanel.test.tsx`，并补入 `generate-agent` ask-system 分支、`OutlineHeadingElement` marker attrs、`ProjectWorkspace` props 传递等必要测试。
- 同步回写了直接相关规划工件：
  - `epics.md`：补齐 Story 4.3 缺失的“编辑器切换章节自动过滤”AC，收敛计数器语义，并把 Ask System grounding 边界调整为 Story 4.3 Alpha 可实现版本。
  - `ux-design-specification.md`：同步“当前章节 scope”“紫色按钮控制 human/cross-role”“Story 4.3 Alpha 的 Streaming 风格展示边界”，并把 roadmap 中的微对话 / 过载面板改为“增强版”表述，消除与 Story 4.3 的时序冲突。
  - `4-3-smart-annotation-panel-ux/ux-spec.md`：同步 5 色对 6 类型、章节 scope、过载触发条件、以及 Streaming 风格展示的 Alpha 边界。

## 剩余风险

None

## 最终结论

经本轮 `validate-create-story` workflow 复核与原位修正后，Story 4.3 已与 Epic 4 / PRD / Architecture / UX 规划文档、Story 4.1/4.2 的真实代码基线、4 张 PNG 导出、`.pen` 结构，以及当前 agent/progress/editor 契约完成必要对齐。当前无剩余可执行阻塞项，结论为 PASS。
