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
     LLM = claude, AUTH = L0, EXECUTOR = sub-pane, PANE = fresh worker slot
   - Open claude sub-pane:
     `work_pane_id="$("${TMUX_LAYOUT_HELPER}" open-worker "{current_session}" "{commander_pane}" "{bottom_anchor}" "mc-story-{story_id}-dev" "../BidWise-story-{story_id}" "claude --dangerously-skip-permissions" "{project_root}" "{current_generation}" "{story_id}")"`
   - Enable pipe-pane logging: `tmux pipe-pane -t {work_pane_id} -o 'cat >> {mc_log_dir}/pane-{work_pane_id}.log'`
   - `register-worker-pane` 完成后，story `dispatch_state` 应为 `pane_opened`
   - Wait for Claude prompt (❯)
   - Paste task packet:
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
   - 通过 helper 记录：`dispatch_state = "packet_pasted"`
   - **Send a dedicated `Enter` after the multiline paste. Do not treat `❯ [Pasted text #…]` as dispatched.**
   - Re-capture pane:
     - If still shows `❯ [Pasted text #…]` → send one more `Enter`, wait 1s, capture again
     - If still shows `❯ [Pasted text #…]` after retry → HALT（这是半提交态，禁止前进到 G6）
   - Once the pane no longer shows `❯ [Pasted text #…]`, 通过 helper 记录：`dispatch_state = "packet_submitted"`
   - 只有在 worker 已真正收到任务后，才把该 story 视为 active dev
   - Record panes.stories[story_id] = { dev: {work_pane_id} }
   - Update gate-state.yaml with generation-guarded write path（use `STATE_CONTROL_HELPER` / utility pane; do not write raw YAML directly）

6. After all dev panes launch, optionally run:
   - `"{TMUX_LAYOUT_HELPER}" rebalance-bottom "{current_session}" "{commander_pane}"`
   - `"{TMUX_LAYOUT_HELPER}" validate-work "{current_session}"`

7. Output (L1): `🔨 并行开发已启动 — {batch_size} 个 Story 在独立 worktree 中开发中`

## GATE G6: worktree → monitor
- **Assert foreach batch_stories:** `test -d ../BidWise-story-{story_id}`
- **Assert foreach batch_stories:** panes.stories[story_id].dev 存在于 `tmux list-panes -s`
- **Assert foreach batch_stories:** story_states[story_id].dispatch_state ∈ {`packet_submitted`, `worker_running`}
- **Assert foreach batch_stories:** capture-pane 不再显示 `❯ [Pasted text #…]`
- **On pass:** 通过 helper 记录 G6 PASS：
  `current_generation="$("${STATE_CONTROL_HELPER}" get-generation "{project_root}")"; tmux send-keys -t {utility_pane} "\"${STATE_CONTROL_HELPER}\" record-batch-gate \"{project_root}\" \"${current_generation}\" \"G6\" \"commander\" \"worktrees created and dev panes alive\"" Enter`

## CHECKPOINT
- Worktrees created: {list}
- Dev panes launched: {pane_ids}
- All dev stories have dispatch_state >= `packet_submitted`

## NEXT
Read fully and follow `./step-04-monitoring.md`
