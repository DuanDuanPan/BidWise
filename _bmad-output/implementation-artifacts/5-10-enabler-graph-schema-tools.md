# Story 5.10 [Enabler]: 知识图谱 schema 与查询工具

Status: backlog

> **Depends on:** 5-8, 5-9

## Story

As a 后端工程师,
I want 在 SQLite 上实现 entities / relations / mentions 三表 + 7 个图查询工具,通过 MCP 暴露给 agent-orchestrator,
So that LLM 可在章节生成与对抗评审时按需调用图谱能力,实现多跳推理。

## Acceptance Criteria (草稿)

1. Kysely 迁移新增 entities / relations / mentions / entities_vec 表
2. 实体抽取走 `agent-orchestrator`,prompt 在 `src/main/prompts/extract-entities.prompt.ts`
3. 入库时 task-queue 异步触发抽取,写入三表
4. 7 个图查询函数 (借鉴 graphify serve.py 接口设计):
   - `search_entity(name)`
   - `get_neighbors(entity_id, depth)`
   - `find_path(src, dst, max_hops)`
   - `list_chapters_by_entity(entity_id)`
   - `similar_chapters(chapter_id, k)`
   - `list_entities_by_chapter(chapter_id)`
   - `graph_stats()`
5. 通过 MCP server 暴露,agent-orchestrator 可注册为 tool
6. 实体抽取精度 F1 ≥ POC 实测基线
7. 图谱可视化(可选):章节维度的 entity-relation 概览面板

## Tasks (待细化)

- [ ] Kysely schema 迁移
- [ ] entity 抽取 prompt + service
- [ ] task-queue 集成
- [ ] 7 个 tool 函数实现
- [ ] MCP server 注册
- [ ] agent-orchestrator tool 注入
- [ ] 单元测试 + 集成测试

## Dev Notes

待 5-7 / 5-8 / 5-9 完成后细化。
