---
batch_stories: []
story_registry: {}
story_states: {}
current_session: ''
inspector_pane: ''
utility_pane: ''
---

# Step 3: Create Worktrees & Launch Parallel Dev

## GUARDS
- Read `../constitution.md` before proceeding
- Read `session-journal.yaml` if it exists
- **AUTH: L0** — worktree 创建和 dev 启动是标准流转
- **LLM:** Dev = claude
- **ROLE:** 指挥官通过子窗格派发

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

### Launch Dev Panes
5. For each story:
   - Execute pre-dispatch (Read `../pre-dispatch-checklist.md`):
     LLM = claude, AUTH = L0, EXECUTOR = sub-pane, PANE = new
   - Open claude sub-pane:
     `tmux split-window -t {current_session} -h "cd ../BidWise-story-{story_id} && claude --dangerously-skip-permissions"`
     (alternate -h/-v for layout balance)
   - Wait for Claude prompt (❯)
   - Send task packet:
     ```
     Skill: bmad-dev-story
     Goal: Implement the assigned story in this worktree only
     Inputs:
     - story id: {story_id}
     - story key: {story_registry[story_id].story_key}
     - worktree: {story_registry[story_id].worktree_path}
     - story file: {story_registry[story_id].story_file_worktree}
     Constraints:
     - use the provided story file path; do not auto-discover another
     - modify files only inside this worktree
     - if blocked, HALT explicitly
     Expected Output:
     - MC_DONE DEV {story_id} REVIEW_READY|HALT
     - changed files summary
     ```
   - If UI Story, append:
     ```
     - design skill to use: frontend-design
     - prototype manifest: {project_root}/_bmad-output/implementation-artifacts/prototypes/prototype-manifest.yaml
     - prototype pen: {project_root}/_bmad-output/implementation-artifacts/prototypes/story-{story_id}.pen
     - reference PNG dir: {project_root}/_bmad-output/implementation-artifacts/prototypes/story-{story_id}/
     - visual baseline: Story 1.4 design system + ux-design-specification
     ```
   - Record: story_states[story_id] = { phase: "dev", dev_pane: pane_id, current_llm: "claude", review_cycle: 0, is_ui: true/false }
   - Update gate-state.yaml with story_states snapshot

6. Output (L1): `🔨 并行开发已启动 — {batch_size} 个 Story 在独立 worktree 中开发中`

## GATE G6: worktree → monitor
- **Assert foreach batch_stories:** `test -d ../BidWise-story-{story_id}`
- **Assert foreach batch_stories:** story_states[story_id].dev_pane 存在于 `tmux list-panes`
- **On pass:** 更新 gate-state.yaml G6 PASS

## CHECKPOINT
- Worktrees created: {list}
- Dev panes launched: {pane_ids}
- All story_states.phase == "dev"

## NEXT
Read fully and follow `./step-04-monitoring.md`
