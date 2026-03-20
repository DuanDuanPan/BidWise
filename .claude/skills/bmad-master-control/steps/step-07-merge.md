---
batch_stories: []
story_states: {}
story_registry: {}
uat_results: {}
current_session: ''
inspector_pane: ''
utility_pane: ''
current_merge_story_id: ''
merged_story_files_list: []
---

# Step 7: Process UAT Results & Sequential Merge

## GUARDS
- Read `../constitution.md` before proceeding
- Read `session-journal.yaml` if it exists
- **AUTH: L2** — merge 影响共享状态（main 分支）
- **LLM:** merge 操作通过 shell/worktree.sh
- **ROLE:** 指挥官通过子窗格执行 merge

## RULES
1. UAT 结果必须从用户消息中明确解析，无法解析的 story 需请求重述
2. UAT PASS 的 story 按顺序 merge（小改动/纯后端优先）
3. UAT FAIL 的 story 回流修复，不阻塞 PASS 的 story
4. 每次 merge 后必须跑 regression（step-08），然后才能 merge 下一个

## INSTRUCTIONS

1. Read gate-state.yaml → 恢复 story_states
2. 解析用户 UAT 回复 → `uat_results[story_id] = PASS|FAIL + reason`
   - 若任一 uat_waiting story 无法解析 → 请用户按固定格式重述
3. 通过 utility_pane 写入 UAT 结果文件:
   `{project_root}/_bmad-output/implementation-artifacts/tests/uat-result-story-{story_id}.yaml`

### Handle UAT Failures
4. For each FAIL story:
   - Send user feedback to dev pane as fix instructions
   - Set story.phase = "fixing", review_cycle = 0 (reset)
   - Continue processing PASS stories (don't block merge)

### GATE G10 (per story, Inspector): UAT → merge
5. For each PASS story:
   - Self-check: UAT result file exists + status PASS + G7/G8/G9 全 PASS
   - **Inspector gate:**
     - 写入 gate-report-G10-{story_id}.md
     - Send to inspector: "请审查 Gate G10 (Story {story_id})"
     - Poll until APPROVE or REJECT
     - REJECT → HALT

### Sequential Merge
6. Sort merge queue: small/no-UI/enabler stories first
7. For each story in merge queue:
   a. Set `current_merge_story_id = {story_id}`
   b. Recompute `merged_story_files_list` (已合并 + 当前 story files)
   c. Check .pen files in diff: `git -C ../BidWise-story-{story_id} diff main --name-only | grep '\.pen$'`
      If .pen modified → warn user (L2)
   d. Check migration conflicts with already-merged stories
   e. Run: `./scripts/worktree.sh merge {story_id}`
   f. Verify merge succeeded (check exit code)
   g. If merge fails → HALT with conflict details

   **After each successful merge → Read `./step-08-regression.md`**
   (Regression must pass before merging next story)

### After All Merges + Regressions
8. Output (L1):
   ```
   ✅ Batch 完成
   已合并: {merged_stories}
   Sprint 状态已自动更新
   {remaining_or_failed_summary}
   ```

9. If any story still in fixing → **Read `./step-04-monitoring.md`**
10. If all merged and regression passed → **Read `./step-09-cleanup.md`**

## CHECKPOINT
- UAT results: {uat_results}
- Merge queue: {ordered list}
- Current merge: {current_merge_story_id}
- Merged so far: {list}
