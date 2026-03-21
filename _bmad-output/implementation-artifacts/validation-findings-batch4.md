# Batch 4 Validation Findings (cycle 3 — user accepted)

> 以下问题经 3 轮 codex 验证未自动解决，用户确认这些均为 contract 精度问题，
> 可在开发阶段由 dev agent 自行修正。不影响 story 方向和架构决策。

## Story 1-8 (smart-todo-priority)

1. **useContextRestore API 形状未明确** — hook vs 自由函数，需 dev 自定义 API 返回
2. **useTodoPanel 缺会话级缓存** — useState 在路由卸载时重置，需用 Zustand 或 sessionStorage
3. **新增 preload API 影响的测试文件未列全** — App.test.tsx、两套 project-handlers.test 需更新
4. **ProjectKanban 网格描述漂移** — 实际 auto-fill 多列 vs story 写的单列；断点 1440 vs 1280

## Story 2-5 (requirement-extraction-scoring-model)

1. **AgentType 需扩展** — 当前 union 只有 parse|generate，需加 extract
2. **renderer monitor 缺 extraction 生命周期** — 需扩展 analysisStore + useAnalysisTaskMonitor
3. **async service 边界矛盾** — extract() 返回类型 vs handler 返回 {taskId}，需统一；TaskCategory 需扩展

## Story 3-1 (plate-editor-markdown-serialization)

1. **AC5 与 Epic 原文不一致** — story 写"最多丢失 1 秒"，Epic 要求"零数据丢失"，dev 按 Epic 标准实现
2. **proposal.meta.json 三版本 schema 不一致** — 以 architecture.md 为准
3. **StatusBar 接入边界** — 不改 ProjectWorkspace 但需传 autosave 状态，解决方案：扩展 StatusBar props
4. **Plate 版本号过时** — story 写 ^49.x，当前 52.x，pnpm add 时自动获取最新
5. **Document 错误类型未列为显式任务** — dev 按 BidWiseError 模式补充
