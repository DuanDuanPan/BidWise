---
batch_stories: []
story_states: {}
batch_id: ''
current_session: ''
utility_pane: ''
---

# Step 9: Cleanup & Batch Review

## GUARDS
- Read `../constitution.md` before proceeding
- Read `session-journal.yaml` if it exists
- **AUTH: L0** for cleanup | **L2** for next batch decision
- **ROLE:** 指挥官通过子窗格执行 cleanup

## RULES
1. Cleanup 只针对已 merge + regression PASS 的 story
2. Gate-state 必须归档保存（审计 trail）
3. Session-journal 中的 corrections 必须评估是否提升为 forbidden-list

## INSTRUCTIONS

### Worktree Cleanup
1. Read gate-state.yaml → 确认所有 merged stories 的 G11 == PASS
2. For each merged story:
   - `./scripts/worktree.sh remove {story_id}`
   - Verify: `./scripts/worktree.sh list` should not show the story
3. Output (L1): "🧹 Cleanup 完成 — {count} 个 worktree 已清理"

### Forbidden List Update (Batch Review)
4. Read gate-state.yaml → 统计本 batch 所有 Gate FAIL 记录（含已修复的）
5. Read session-journal.yaml → 统计所有 correction entries
6. For each FAIL→fix→retry 模式或 correction pattern:
   - 判断是否为新型偏差（不与 forbidden-list.md 中 F1-F{N} 重复）
   - 新型偏差 → 通过子窗格追加到 `../forbidden-list.md` (FORBIDDEN_LIST_END 标记前) + git commit 固化
   - 已有条目的重复 → 在条目上标记 recurrence
   - **recurrence >= 3 → 输出建议（L1 通知用户）："以下 pattern 重复 N 次，建议人工评估是否升级到 constitution"。不自动修改 constitution。**
7. If new entries added:
   - 通知监察官新增的禁忌条目
   - Output (L1): "📝 禁忌清单已更新 — 新增 {count} 条"

### Gate State Archive
8. 通过子窗格:
   `mv _bmad-output/implementation-artifacts/gate-state.yaml _bmad-output/implementation-artifacts/gate-state-{batch_id}.yaml`
9. 归档 session-journal:
   `mv _bmad-output/implementation-artifacts/session-journal.yaml _bmad-output/implementation-artifacts/session-journal-{batch_id}.yaml`

### Next Batch Decision
10. Re-read sprint-status.yaml
11. If more batch candidates exist:
    - Output: "📋 还有可开发的 Story，是否继续下一个 batch？"
    - Ask (L2): "继续？输入 '是' 开始下一轮，或 '否' 结束。"
    - If user confirms → **Read `./step-01-assessment.md`**
12. If no more candidates:
    - Output: "🏁 所有已选 Story 处理完毕。"

## CHECKPOINT
- Cleaned worktrees: {list}
- Forbidden list updates: {new_entries}
- Archived: gate-state-{batch_id}.yaml, session-journal-{batch_id}.yaml
- Next batch available: {yes/no}
