---
batch_stories: []
story_registry: {}
story_states: {}
current_session: ''
inspector_pane: ''
utility_pane: ''
bottom_anchor: ''
---

# Step 3: Create Worktrees & Launch Parallel Dev

## GUARDS
- Read `../constitution.md` before proceeding
- **AUTH: L0** — worktree 创建和 dev 启动是标准流转
- **LLM:** Dev = claude
- **ROLE:** 指挥官通过 command-gateway 派发

## RULES
1. Story 文件必须已 commit 到 main 后才能创建 worktree
2. 所有 worktree 使用 `./scripts/worktree.sh create`
3. UI Story 的 dev 派发必须附带 prototype 信息

## INSTRUCTIONS

### Preflight
1. Read gate-state.yaml → 确认 G5 PASS + verified_by == inspector

### Create Worktrees
2. Run: `./scripts/worktree.sh create {story_id_1} {story_id_2} ...`
   (worktree.sh 自动执行 pnpm install)
3. Verify all worktrees created (check exit code)
4. For each story, set:
   - `story_registry[story_id].worktree_path = ../BidWise-story-{story_id}`
   - `story_registry[story_id].story_file_worktree = ../BidWise-story-{story_id}/{story_file_rel}`
   - State is persisted automatically by transition-engine when DISPATCH dev is executed

### Launch Dev Panes
5. For each story:
   - `command-gateway.sh <project_root> <gen> DISPATCH <story_id> dev --trigger-seq <N>`
     (transition-engine handles: pane creation, pipe-pane logging, task packet paste,
      dispatch_state tracking, Enter-after-paste verification, and G6 recording)
   - UI detection is automatic (transition-engine reads story's is_ui field)
   - Task monitor daemon will detect MC_DONE/HALT/idle and emit events

6. Output (L1): "并行开发已启动 -- {batch_size} 个 Story 在独立 worktree 中开发中"

## GATE G6: worktree → monitor
- **Assert foreach batch_stories:** `test -d ../BidWise-story-{story_id}`
- **Assert foreach batch_stories:** panes.stories[story_id].dev exists in gate-state
- **Assert foreach batch_stories:** dispatch_state ∈ {`packet_submitted`, `worker_running`}
- **On pass:** G6 is recorded automatically by transition-engine during DISPATCH dev

## CHECKPOINT
- Worktrees created: {list}
- Dev panes launched: {pane_ids}
- All dev stories have dispatch_state >= `packet_submitted`

## NEXT
Read fully and follow `./step-04-monitoring.md`
