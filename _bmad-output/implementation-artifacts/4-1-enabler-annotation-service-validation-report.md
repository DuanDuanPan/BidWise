# Story 4.1 Validation Report

日期：2026-04-06
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）
目标文档：`_bmad-output/implementation-artifacts/4-1-enabler-annotation-service.md`

已核对工件：
- `_bmad/bmm/config.yaml`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/workflow.md`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/checklist.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/story-1-7-workspace-layout-shell.md`
- `_bmad-output/implementation-artifacts/3-4-ai-chapter-generation.md`
- `_bmad-output/implementation-artifacts/4-1-enabler-annotation-service.md`
- `_bmad-output/implementation-artifacts/4-1-enabler-annotation-service-ux/prototype.manifest.yaml`
- `_bmad-output/implementation-artifacts/4-1-enabler-annotation-service-ux/ux-spec.md`
- `_bmad-output/implementation-artifacts/4-1-enabler-annotation-service-ux/exports/Nh3y0.png`
- `_bmad-output/implementation-artifacts/4-1-enabler-annotation-service-ux/exports/pEmrs.png`
- `_bmad-output/implementation-artifacts/4-1-enabler-annotation-service-ux/exports/pZeQ2.png`
- `_bmad-output/implementation-artifacts/4-1-enabler-annotation-service-ux/prototype.pen`
- `src/main/db/migrator.ts`
- `src/main/db/schema.ts`
- `src/main/db/repositories/index.ts`
- `src/main/db/repositories/mandatory-item-repo.ts`
- `src/main/db/repositories/strategy-seed-repo.ts`
- `src/main/ipc/create-handler.ts`
- `src/main/ipc/document-handlers.ts`
- `src/main/ipc/index.ts`
- `src/main/services/document-service.ts`
- `src/main/services/template-service.ts`
- `src/main/services/project-service.ts`
- `src/main/utils/errors.ts`
- `src/preload/index.ts`
- `src/shared/ipc-types.ts`
- `src/shared/models/proposal.ts`
- `src/shared/constants.ts`
- `src/renderer/src/stores/analysisStore.ts`
- `src/renderer/src/stores/documentStore.ts`
- `src/renderer/src/modules/project/components/AnnotationPanel.tsx`
- `src/renderer/src/modules/project/components/ProjectWorkspace.tsx`
- `src/renderer/src/modules/project/components/ProjectCard.tsx`
- `tests/unit/main/db/migrations.test.ts`
- `tests/unit/main/services/document-service.test.ts`
- `tests/unit/preload/security.test.ts`
- `tests/unit/renderer/project/AnnotationPanel.test.tsx`
- `tests/unit/renderer/project/ProjectWorkspace.test.tsx`

`.pen` 核对说明：
- 已按用户指定 lookup order 执行：先读 story design notes，再读 manifest，再对照 3 张 PNG 导出，最后用 Pencil MCP 打开 `prototype.pen`
- 已读取 `pZeQ2` / `Nh3y0` / `pEmrs` 三个 frame 的结构节点，核对 header、pending pill、empty/loading/list 三态与 shell 几何

结果：PASS

## 摘要

本次按 `validate-create-story` 工作流重跑了 Story 4.1 的 implementation-readiness 校验，并把所有可安全修正的问题直接回写到 story 文件与直接相关工件。修正后，Story 4.1 已与当前仓库真实的 DB migrator / IPC / preload / document-service / Story 1.7 workspace shell / Story 3.4 临时占位实现，以及 4.1 UX 原型三态表现对齐。

## 发现的关键问题

None

## 已应用增强

- 统一了批注数据模型的语义边界：
  - 将 `pending-decision` 从错误的 `type` 维度移出，改为 `status = needs-decision`
  - 将来源类型收敛为 `ai-suggestion / asset-recommendation / score-warning / adversarial / human / cross-role`
  - 同步修正了 story、`epics.md`、`architecture.md` 中会误导实现的旧表述
- 删除了 story 中未被 AC 需要、且会平白增加范围的 `annotation:get` 通道，避免 dev 在 IPC / preload / handler / test 上做无效扩展。
- 修正了 sidecar 持久化路径设计：
  - 明确 SQLite 是 source of truth，`proposal.meta.json.annotations` 是镜像
  - 明确 sidecar 更新应收敛到 `documentService.updateMetadata(...)`
  - 明确需要把现有 `template-service.ts` 本地 sidecar helper 一并收敛，避免仓库出现第二套 metadata 写法
- 修正了 renderer store 设计，使其与现有 `analysisStore` 的 project-scoped 模式对齐，不再使用会污染多项目切换的全局 `loading/error`。
- 修正了 renderer hook / 测试目录路径漂移：
  - 不再指向不存在的 `tests/unit/renderer/modules/project/components/...`
  - 将 annotation hooks 收敛到独立 `modules/annotation/hooks`，避免把跨切面批注逻辑埋进 `modules/editor`
- 修正了 preload 规范描述：
  - 明确 `PreloadApi` 只做编译期穷尽校验，不会“自动生成实现”
  - 要求在 `src/preload/index.ts` 的 `requestApi` 中手动接线 annotation API
- 将 Story 4.1 的面板 UX 与原型及现有壳层合同对齐：
  - 保留 Story 1.7 的 320px/40px/48px 壳层与 `aria-label="智能批注"`
  - 展开态标题改为 `批注`
  - Header 改为蓝色 `N 待处理` pill，而不是硬编码 `Badge count={0}`
  - 明确 4.1 必须替换 Story 3.4 的“章节生成摘要”过渡占位
  - 补齐 loading skeleton / empty state / simplified list 三态要求
- 修正了 E2E 期望，使其与 4.1 实际交付边界一致：
  - 不再要求本 Story 提供“新增批注”可视化按钮
  - 改为通过 preload API 预置数据后进入 workspace 验证面板状态与 sidecar 落盘
- 补回了 create-story 模板应有的 validation note，并为 story 增加了 `Change Log`，便于后续追溯。

## 剩余风险

None

## 最终结论

经本轮 `validate-create-story` 复核与原位修正后，Story 4.1 已无剩余的可执行阻塞项。当前 story、故事级 UX 规格、以及直接相关的规划源文档与代码现状已完成必要对齐，结论为 **PASS**。
