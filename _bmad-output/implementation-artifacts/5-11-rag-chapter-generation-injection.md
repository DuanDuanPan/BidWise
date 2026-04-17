# Story 5.11: RAG 注入章节生成

Status: backlog

> **Depends on:** 5-9, 5-10
> **Replaces partial logic in:** Story 3.4 (AI 章节生成)

## Story

As a 售前工程师,
I want LLM 生成章节前先检索内部资产并注入 prompt,生成结果带来源标注,
So that 章节质量贴近团队真实历史素材而非空想,且每段输出可追溯到具体资产。

## Acceptance Criteria (草稿)

1. 章节生成请求触发前,先调用混合检索 + 图扩展,返回 top-K (K=3~5) 相关资产 chunks
2. 检索结果按"片段标识 + heading_path + 内容"格式拼入 system prompt
3. LLM 生成内容中以 `[asset:xxx]` 标记引用片段,后处理解析并写入 sidecar JSON(扩展 Story 3-5 来源归因)
4. 检索片段过脱敏代理,实体映射合并到当前会话
5. 强制项过滤:命中当前标书强制项冲突的资产片段不注入
6. token 预算控制:超过阈值自动 summarize 注入而非全文
7. UI 显示"参考资产"列表,用户可逐条审阅/移除/打开原资产

## Tasks (待细化)

- [ ] 检索集成到 chapter-generation 流程
- [ ] prompt 模板 (复用 src/main/prompts/)
- [ ] 引用标记后处理与 sidecar 写入
- [ ] 脱敏映射合并
- [ ] 强制项过滤
- [ ] token 预算 + summarize 兜底
- [ ] UI "参考资产" 面板

## Dev Notes

待 5-9 / 5-10 完成后细化。
