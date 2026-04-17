# Story 5.12: 推荐 v2 — 图谱感知 + 复合章节插入预览

Status: backlog

> **Depends on:** 5-9, 5-10
> **Supersedes:** Story 5.2 推荐逻辑(纯 BM25 → 混合检索 + 图扩展)

## Story

As a 售前工程师,
I want 资产推荐结合语义 + 实体关系,且插入复合章节时有预览面板可调整 标题层级 / 编号 / 引用 / 资源迁移 / 术语替换,
So that 推荐更精准、插入复合内容不破坏文档结构。

## Acceptance Criteria (草稿)

1. `recommendation-service` 升级:混合检索 + `list_chapters_by_entity` 图扩展加权
2. 推荐结果带匹配理由(关键词命中 / 语义相似 / 实体重叠 / 多跳关联)
3. Plate 反序列化升级:支持 markdown + HTML 表 + 自定义 OOXML 块,样式不丢
4. 新增 `asset-composition-service.prepareInsertion(assetId, ctx)` → `InsertionPlan`
5. `InsertionPlan` 含:标题层级偏移、编号 remap、外部引用断链清单、资源迁移清单、术语 rewrite
6. UI 预览面板:左右对比 + 逐项 plan 项可取消/调整,确认后原子执行
7. 章节级粒度,用户可三档选择(段落 / 章节 / 整章)
8. 已插入资产标"已插入"角标(沿用 5-2 现有 UI)

## Tasks (待细化)

- [ ] recommendation-service 升级
- [ ] Plate HTML 表 / 自定义块反序列化
- [ ] asset-composition-service 新建
- [ ] InsertionPlan 计算逻辑(demote / numbering / ref / resource / term)
- [ ] 预览面板 UI
- [ ] 原子插入执行
- [ ] 三档粒度切换
- [ ] 回归 5-2 现有功能

## Dev Notes

待 5-9 / 5-10 完成后细化。
