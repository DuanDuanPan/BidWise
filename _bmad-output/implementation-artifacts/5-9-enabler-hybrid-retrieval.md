# Story 5.9 [Enabler]: 混合检索 (BM25 + cosine + RRF)

Status: backlog

> **Depends on:** 5-8

## Story

As a 后端工程师,
I want 在现有 FTS5 BM25 基础上叠加 sqlite-vec cosine + RRF 融合排序,并支持 heading_path / 实体重叠加权,
So that 资产推荐与 RAG 检索召回质量显著优于纯关键词。

## Acceptance Criteria (草稿)

1. `recommendation-service` 与 `asset-service.search` 升级为混合检索
2. 召回流程:BM25 top-N + cosine top-N → RRF 融合 → 重排 → 去重
3. 章节级 chunk 自适应切分(参考 POC 决定的阈值,典型 500±50 字 overlap 50)
4. heading_path 拼入 embedding 文本(`"技术方案 > 算力 > GPU 选型: xxx"`)
5. 与现有 5-1 / 5-2 接口向后兼容,A/B 切换通过 feature flag
6. Recall@10 比纯 BM25 提升 ≥ 30%(基于 POC 测试集)

## Tasks (待细化)

- [ ] chunk 切分服务
- [ ] 混合检索算法
- [ ] 现有 service 接入
- [ ] feature flag
- [ ] 回归测试

## Dev Notes

待 5-7 / 5-8 完成后细化。
