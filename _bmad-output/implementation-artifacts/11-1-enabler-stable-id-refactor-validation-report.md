# Story 11.1 Validation Report

日期：2026-04-18  
Workflow：`validate-create-story`（`bmad-create-story` Validate Mode）  
目标文档：`_bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor.md`

## 校验范围

本次校验按 `validate-create-story` 工作流执行。复核范围覆盖：

- `_bmad/bmm/config.yaml`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/workflow.md`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/checklist.md`
- `_bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- 当前代码基线：
  - `src/shared/chapter-types.ts`
  - `src/shared/template-types.ts`
  - `src/shared/models/proposal.ts`
  - `src/shared/chapter-locator-key.ts`
  - `src/shared/source-attribution-types.ts`
  - `src/shared/chapter-summary-types.ts`
  - `src/shared/analysis-types.ts`
  - `src/main/services/template-service.ts`
  - `src/main/services/document-service.ts`
  - `src/main/services/project-service.ts`
  - `src/main/services/chapter-generation-service.ts`
  - `src/main/services/source-attribution-service.ts`
  - `src/main/services/chapter-summary-store.ts`
  - `src/main/services/document-parser/traceability-matrix-service.ts`
  - `src/main/db/schema.ts`
  - `src/main/db/repositories/annotation-repo.ts`
  - `src/main/db/repositories/traceability-link-repo.ts`
  - `src/main/services/notification-service.ts`
  - `src/renderer/src/modules/annotation/hooks/useCurrentSection.ts`
  - `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx`
  - `src/main/index.ts`
  - `resources/templates/standard-technical.template.json`
  - `resources/templates/standard-military.template.json`
- 近期 git 记录：
  - `0d9d123 fix: preserve taskId locator mapping for trailing batch-complete event`
  - `c584721 fix: inject chapter + project context into skill-diagram prompt`
  - `8846a37 fix: clamp skill-diagram maxTokens to 32768 for Gemini proxy compat`
  - `0cbd1bc fix: defense-in-depth guard against empty-editor catastrophic overwrite`
  - `407e577 feat: chapter-summary cache with stale-race, bloat, and fan-out fixes (Story 3-12)`

## 发现并已修复的问题

### 1. Story 建在了错误的持久化模型上

原 Story 以“新增 SQLite `chapters` 表 + `src/main/db/repositories/chapter-repo.ts`”作为主实现路径。当前仓库里方案正文与结构的真实持久化边界是 `proposal.md + proposal.meta.json.sectionIndex`，并且 `chapter-repo.ts`、`chapterStore.ts` 都还不存在。

已修复：

- 将 canonical 结构模型收敛到 `proposal.meta.json.sectionIndex`
- 将实现边界改为 shared types + main service + thin IPC
- 明确 `proposal.md` 继续作为章节正文 source of truth

### 2. 迁移范围写错了真实工件

原 Story 把迁移对象写成 `chapter-{oldId}.md -> chapter-{newUuid}.md`。当前项目没有 per-chapter markdown 文件。与此同时，真实会被章节身份影响的工件大量遗漏。

已修复：

- 删除虚构的 per-chapter 文件迁移描述
- 将迁移范围改为真实工件：
  - `proposal.meta.json.sectionWeights`
  - `proposal.meta.json.sectionIndex`
  - `proposal.meta.json.confirmedSkeletons`
  - `proposal.meta.json.annotations`
  - `proposal.meta.json.sourceAttributions`
  - `proposal.meta.json.baselineValidations`
  - `chapter-summaries.json`
  - `traceability-matrix.json`
  - SQLite `annotations` / `traceability_links` / `notifications`

### 3. 模板局部 ID 与项目实例 ID 被混成了一种语义

当前模板 JSON 里的 `sections[].id` 是 `s1.1` 风格的模板局部键。原 Story 直接把这类值当成目标持久化 ID，后续导入、模板复用、多项目实例都会混淆身份语义。

已修复：

- 明确模板键保留为 `templateSectionKey`
- 明确项目实例在 materialization 时生成新的 UUID `sectionId`
- 将这个要求写入 AC、Task 与 Dev Notes

### 4. 现有 locator 驱动能力缺少桥接设计

当前 `useCurrentSection`、`OutlineHeadingElement`、`chapter-generation-service`、`source-attribution-service`、`chapter-summary-store` 全都依赖 `ChapterHeadingLocator` 或 `createChapterLocatorKey(locator)`。原 Story 只定义了新的树模型，没有给出 UUID 与现有 locator 读模型之间的桥接方案。

已修复：

- 新增 shared helper 要求：
  - `buildChapterTree()`
  - `deriveSectionPath()`
  - `resolveSectionIdFromLocator()`
  - `resolveLocatorFromSectionId()`
- 明确 locator/path 继续承担渲染、滚动、DOM marker、兼容读取职责
- 明确持久化引用统一落到 UUID

### 5. 当前仓库里最危险的不一致点没有被写进 Story

当前 `template-service.ts` / `sectionIndex` 仍以模板 `sectionId` 作为结构引用，而 `chapterGenerationService.skeletonConfirm()` 又直接使用 `locatorKey(locator)` 作为 `confirmedSkeletons` key。原 Story 没有点名这个不一致点，dev 很容易做出第三套身份模型。

已修复：

- 将 `confirmedSkeletons` 迁移与收敛写进 AC3 / Task 3 / Task 4
- 明确 `chapter-generation-service` 需要同时提供 `sectionId -> locator` 的桥接能力

### 6. 迁移触发机制与当前应用启动方式不一致

原 Story 使用“应用启动检测 `schema_version`”的笼统说法。当前仓库真实入口是 `main/index.ts` 的 Kysely migrator + `documentService` / `templateService` / `chapter-generation-service` 等 sidecar 读写路径。

已修复：

- 将数据库部分收敛为“已有 `section_id TEXT` 列上的数据归一化”
- 将项目侧迁移改为专门的 `chapter-identity-migration-service`
- 明确迁移需要挂接到现有 main-process 入口，而不是虚构新的全局 schema 机制

### 7. 测试矩阵覆盖面不足

原 Story 的测试只覆盖了 repository / migration / shared util，缺少对真实受影响服务的测试要求，尤其是 `template-service`、`document-service`、`chapter-generation-service`、`source-attribution-service`、`chapter-summary-store` 与 `traceability-matrix-service`。

已修复：

- 扩展测试矩阵到上述 main services
- 将 renderer bridge 测试写回 `useCurrentSection` / `OutlineHeadingElement`
- 将 SQLite repo 测试明确到 `annotation-repo` / `traceability-link-repo` / `notification-repo`

### 8. Story artifact 结构不完整

原 Story 缺少 create-story 模板要求的 validation note、`Project Structure Notes`、`Change Log`。

已修复：

- 补回 validation note
- 增加 `Project Structure Notes`
- 增加 `Change Log`

## 已修改工件

- `_bmad-output/implementation-artifacts/11-1-enabler-stable-id-refactor.md`

## 剩余风险

- Story 11.2-11.8 的草稿目前仍沿用 `chapterStore` / `chapter-repo` 旧命名与旧假设。Story 11.1 已把 foundation contract 收敛到 sidecar + service 模型，后续 11.x story 进入开发前需要按同一契约各自再跑一次 `validate-create-story`。

## 最终结论

经本轮 `validate-create-story` 复核与原位修订后，Story 11.1 已与当前仓库真实的章节存储边界、template materialization 模式、locator-based 现有能力、SQLite `section_id` 列语义，以及 `confirmedSkeletons` / 摘要 / 来源标注 / 追溯矩阵等直接相关工件完成必要对齐。

当前 Story 已具备进入 `dev-story` 的实现清晰度，结论为 **PASS**。

## 备注

- 本次仅进行了 story-spec 修订，没有运行代码测试。
