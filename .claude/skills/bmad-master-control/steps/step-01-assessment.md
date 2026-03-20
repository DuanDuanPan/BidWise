---
# Runtime context (restored from gate-state.yaml, not from memory)
batch_stories: []
story_states: {}
current_session: ''
inspector_pane: ''
utility_pane: ''
---

# Step 1: State Assessment & Batch Selection

## GUARDS
- Read `../constitution.md` before proceeding
- Read `session-journal.yaml` if it exists
- **AUTH: L2** — batch 选择需要用户确认
- **ROLE:** 指挥官只读取文件做分析，不编辑任何文件

## RULES
1. 从 sprint-status.yaml 和 epics.md 推导 batch 候选，不凭记忆猜测
2. 必须分析并行冲突风险（文件重叠、模块重叠）
3. `in-progress` / `review` story 需先处理，不能直接跳过选新 batch

## INSTRUCTIONS

1. Read `{implementation_artifacts}/sprint-status.yaml` → 提取所有 story 状态
2. For each story key (e.g. `1-5-project-crud-kanban`), 缓存:
   - `story_key` = sprint-status 中的完整 key
   - `story_id` = 前两个数字段用 `-` 连接 (e.g. `1-5`)
   - `story_slug` = `story_id` 之后的部分
3. Read `{planning_artifacts}/epics.md` → 构建依赖图（识别前置 story，特别是 [Enabler]）
4. 识别 batch 候选:
   - `backlog` 且所有前置 story 为 `done` → candidate, prep_mode = "create"
   - `ready-for-dev` → candidate, prep_mode = "reuse"
   - `in-progress` / `review` → 不是候选，需单独处理
5. Read `{planning_artifacts}/architecture.md` → 推断各 story 的模块/文件范围
6. 分析并行冲突:
   - 标记有重叠的 story 对（同一 migration 目录、ipc-types.ts、package.json 等）
   - 将不冲突的 story 分组
   - 建议并行度（2-3 路为宜）

<check if="no batch candidates found" level="L3">
  HALT: "当前没有可开发的 Story — 所有前置依赖未完成，或所有 Story 已 done"
</check>

<check if="stories found in-progress or review status" level="L2">
  输出进行中的 Story 列表，询问用户：恢复还是跳过？
</check>

7. 输出 batch 推荐:

```
🚀 可并行开发的 Story:
{batch_recommendation_with_rationale}

预计冲突风险: {conflict_assessment}
建议合并顺序: {merge_order} (小改动/纯后端优先)
```

8. 询问用户确认 batch 选择（L2）

## GATE G1: batch_selection → batch_prep
- **Assert:** 用户已明确确认 batch 选择
- **Assert:** batch_stories 数组非空
- **On pass:** 通过 utility_pane 创建 gate-state.yaml，记录 G1 PASS + batch_stories 列表

## CHECKPOINT
- 已选 batch: {batch_stories}
- prep_mode per story: {create/reuse}
- 冲突风险: {assessment}
- 建议合并顺序: {merge_order}

## NEXT
Read fully and follow `./step-02-batch-prep.md`
