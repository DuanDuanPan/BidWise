---
batch_stories: []
story_states: {}
story_registry: {}
current_session: ''
inspector_pane: ''
utility_pane: ''
---

# Step 6: Automated QA Gate + UAT Notification

## GUARDS
- Read `../constitution.md` before proceeding
- Read `session-journal.yaml` if it exists
- **AUTH: L0** for auto QA execution | **L2** for UAT notification (user must respond)
- **LLM:** Auto QA = codex
- **ROLE:** 指挥官通过子窗格派发 QA，然后通知用户做 UAT

## RULES
1. 人工 UAT 之前先跑自动化 QA — 让模型完成可重复检查，人类聚焦业务判断
2. QA 失败的 story 回流到 fixing → review 循环
3. UAT 通知后必须 HALT 等待用户回复（L2）

## INSTRUCTIONS

### Automated QA (parallel dispatch, aggregate results)
1. Read gate-state.yaml → 恢复 story_states
2. Create directory if missing: `{project_root}/_bmad-output/implementation-artifacts/tests/`

#### Phase A: Parallel Dispatch
3. Collect all stories with phase == `auto_qa_pending`
4. For **each** story, **simultaneously** open a codex sub-pane:
   - **Execute pre-dispatch:** LLM = codex, AUTH = L0, PANE = new
   - Open codex sub-pane in story worktree; equalize after: `tmux select-layout -t {bottom_anchor} even-horizontal`
   - Set pane title: `tmux select-pane -t {new_pane_id} -T "mc-story-{story_id}-qa"`
   - Record: panes.stories[story_id].qa = new pane_id
   - Set story.phase = "qa_running" (durable — enables resume if session restarts mid-QA)
   - Update gate-state.yaml with phase change
   - Check if story-scoped Playwright tests exist: `tests/e2e/stories/story-{story_id}*.spec.ts`
   - Send task packet:
     ```
     Skill: bmad-qa-generate-e2e-tests
     Goal: Create or refresh story-scoped automated QA, then run it
     Inputs:
     - story id: {story_id}
     - worktree: {worktree_path}
     - story file: {story_file_worktree}
     - report output: {project_root}/_bmad-output/implementation-artifacts/tests/auto-qa-story-{story_id}.md
     Constraints:
     - reuse existing Playwright conventions
     - tag story tests as @story-{story_id}, critical as @p0, important as @p1
     - map each AC to automated/manual-only/not-covered
     - avoid duplicate coverage: E2E for critical path, push edge cases to unit/component
     - reuse fixtures/factories from tests/support/ if they exist
     Expected Output:
     - MC_DONE QA {story_id} PASS|FAIL
     - report path
     ```
   - Each pane runs independently; do NOT wait for one to finish before launching the next

#### Phase B: Aggregate Results
5. Wait for **all** QA panes to report `MC_DONE`; close each pane as it completes
6. Collect all results, then **batch-update** gate-state.yaml once (avoid concurrent writes)
7. For each FAIL story:
     - Write findings to `../BidWise-story-{story_id}/auto-qa-findings-cycle-{N}.md`
     - Set story.phase = "fixing"
8. If any story FAIL:
     - Output (L1): "⚠️ 自动化 QA 发现阻塞问题，已回流修复"
     - **Read `./step-04-monitoring.md`** to re-enter monitoring loop

### GATE G9 (per story): auto_qa → uat
- **Assert:** `test -f {project_root}/_bmad-output/implementation-artifacts/tests/auto-qa-story-{story_id}.md`
- **Assert:** QA report 包含 PASS
- **On pass:** 更新 gate-state.yaml story_gates.{story_id}.G9 = PASS

### UAT Notification (L2 — HALT and wait)
5. Set story.phase = "uat_waiting" for each passing story
6. Output:

```
🧪 UAT 验收通知

以下 Story 已完成开发、Code Review 和自动化 QA，请进行人工 UAT 验收：

{uat_ready_stories_with_worktree_paths}

先看自动化结果，再做人工验收:
1. cd ../BidWise-story-{story_id} 进入 worktree
2. 查看 _bmad-output/.../tests/auto-qa-story-{story_id}.md
3. 如需看失败细节: playwright-report/ 或 test-results/playwright/
4. pnpm dev 启动应用做人工 UAT
5. 重点关注: 业务判断、视觉细节、中文文案、操作流畅度
6. 可选: pnpm test 全量确认

请逐个回复:
Story {story_id}: ✅ PASS
或
Story {story_id}: ❌ FAIL - 原因
```

7. **HALT — 等待用户 UAT 结果**

## CHECKPOINT
- Auto QA results per story: {pass/fail}
- Stories waiting for UAT: {list}

## NEXT
When user provides UAT results → Read fully and follow `./step-07-merge.md`
