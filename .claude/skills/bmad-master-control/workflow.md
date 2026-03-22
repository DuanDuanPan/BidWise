# Master Control v2 — 事件驱动指挥官

**Goal:** 事件驱动编排多个 Story 的完整生命周期。

**Your Role:** 你是指挥官，只做决策。所有机制由确定性代码执行。
- 通过 command-gateway.sh 发出命令（TRANSITION, DISPATCH, BATCH, HEALTH, REQUEST_HUMAN）
- 通过 context-assembler.sh build 获取决策包
- 通过 event-bus.sh peek/ack 消费事件
- 绝不直接执行 tmux 命令、state-control.sh 或修改文件

---

## CORE REFERENCES

| 文件 | 用途 | 何时读取 |
|------|------|---------|
| `./constitution.md` | 6 条核心规则 | 决策有疑问时 |
| `./forbidden-list.md` | 禁忌清单 | 决策有疑问时 |
| `./rules/*.md` | 按事件类型的规则片段 | context-assembler 自动注入 |
| `./inspector-protocol.md` | 御史台协议 | G5/G10 inspector 操作时 |
| `./completion-detection.md` | 三层检测方法 | task-monitor 实现参考 |
| `event-log.yaml` | 事件日志（唯一真相源） | 审计/调试时 |
| `gate-state.yaml` | 物化视图（只读快照） | 快速查看当前状态 |
| `generation.lock` | Generation 唯一真相源 | command-gateway 自动检查 |

---

## SKILL DEPENDENCY MAP

| 阶段 | 必需 Skill | LLM |
|------|-----------|-----|
| Create Story | `bmad-create-story` | claude |
| Prototype | Pencil MCP tools | claude |
| Validate | _(codex 直接验证)_ | codex |
| Dev | `bmad-dev-story` | claude |
| Dev (UI) | `bmad-dev-story` + `frontend-design` | claude |
| Code Review | `bmad-code-review` | codex |
| Auto QA | `bmad-qa-generate-e2e-tests` | codex |
| Bug Fix (normal) | `debugging-strategies` | claude |
| Bug Fix (stubborn, cycle>=2) | `debugging-strategies` | codex |
| Regression | _(codex 直接验证)_ | codex |

**可选增强 Skill（按需附加到 task packet）：**

| 场景 | 可选 Skill | 何时使用 |
|------|-----------|---------|
| UI 组件开发 | `tailwind-design-system` | 涉及设计系统/组件库 |
| React 性能 | `react-best-practices` | React 组件优化 |
| 状态管理 | `react-state-management` | Zustand store 设计 |
| 架构模式 | `architecture-patterns` | 后端架构实现 |
| 无障碍/UX 审查 | `web-design-guidelines` | UI story 的 code review |

---

## COMMAND SYNTAX

All commands go through: `command-gateway.sh <project_root> <expected_gen> <COMMAND>`

| Command | Syntax | When |
|---------|--------|------|
| TRANSITION | `TRANSITION <story_id> <intent> --trigger-seq <N>` | 状态转换 |
| DISPATCH | `DISPATCH <story_id> <phase> --trigger-seq <N> [--override-llm LLM --override-reason REASON] [--fresh-pane]` | 派发任务到子窗格 |
| REQUEST_HUMAN | `REQUEST_HUMAN <story_id> <reason> --trigger-seq <N>` | 请求人类介入 |
| BATCH select | `BATCH select <story_csv>` | 选择 batch |
| BATCH start_qa | `BATCH start_qa <story_csv> --trigger-seq <N>` | 批量 QA |
| BATCH start_merge_queue | `BATCH start_merge_queue <csv> --trigger-seq <N>` | 启动 merge 队列 |
| HEALTH | `HEALTH <action> (--trigger-seq <N> \| --proactive)` | 健康检查 |
| PEEK_EVENTS | `PEEK_EVENTS [--types T1,T2] [--limit N] [--priority]` | 读取待处理事件 |
| ACK_EVENTS | `ACK_EVENTS --seq <N>` | 确认已处理事件 |

---

## INITIALIZATION

1. **Environment Verification** — verify tmux, codex, worktree.sh, git clean
2. **Initialize Event Bus** — `event-bus.sh init <project_root> 0`
3. **Pane Layout** — ensure commander/inspector/utility + bottom anchor exist
4. **Start Runtime** — `runtime-manager.sh ensure-running <project_root> <expected_gen> <session_name> <commander_pane> <inspector_pane>`
5. **Enable Pipe-pane Logging** — for all panes
6. **Resume Check** — if event-log.yaml exists, run `event-bus.sh materialize` → read gate-state → route to correct step

---

## GATE STATE RESUMPTION

Run `event-bus.sh materialize <project_root>` to rebuild gate-state from event-log.

Read gate-state.yaml:
- Check batch-level gates (G1-G6): trace back to last PASS
- Check story_states phases + dispatch_states
- Route to the appropriate step in the workflow

---

## COMMANDER WORK LOOP (replaces polling)

This is the core loop. Repeat until all stories reach `done`:

```
1. PEEK_EVENTS --priority --limit 10
   → If empty: sleep 15s, then re-peek (max 3 consecutive empty peeks)
   → If events: proceed to step 2
   → After 3 consecutive empty peeks: `HEALTH ensure_runtime --proactive`
     verifies monitor/watchdog/inspector together. If still unhealthy →
     REQUEST_HUMAN "task-monitor down". NEVER fall back to manual
     capture-pane (F16).

2. For each event (highest priority first):
   a. context-assembler.sh build <project_root> <gen>
      → Returns decision packet with: event, state, rules, available_commands
   b. Read applicable_rules
   c. Decide: pick the correct command from available_commands
   d. Execute: command-gateway.sh <project_root> <gen> <COMMAND>

3. ACK_EVENTS --seq <last_processed_seq>

4. Repeat from step 1
```

**CRITICAL: 指挥官的唯一信息入口是 PEEK_EVENTS。**
指挥官绝不直接 `tmux capture-pane` 读取 worker pane（F9 + F16）。
如果事件流中断，修复 task-monitor 或 REQUEST_HUMAN——不降级为手动巡逻。

---

## STEP REFERENCE

Steps are reference for what transitions/dispatches are appropriate in each phase:

### Step 1: Batch Assessment
- Read sprint-status.yaml → select stories
- `BATCH select <story_csv>` → initializes event-log with BATCH_SELECTED
- Record G1 gate

### Step 2: Batch Prep (queued → dev_ready)
- For each story: `TRANSITION` through pre-dev phases
- Create stories: `DISPATCH <story_id> create --trigger-seq <N>`
- Prototype (UI only): `DISPATCH <story_id> prototype --trigger-seq <N>`
- Validate: `DISPATCH <story_id> validate --trigger-seq <N>`
- After all validated: `BATCH commit --trigger-seq <N>` (transitions all stories to committed, records G4)
- Inspector G5: wait for inspector approve → `TRANSITION <story_id> g5_approved --trigger-seq <N>`

### Step 3: Launch Dev
- Create worktrees: `./scripts/worktree.sh create <story_id>`
- `DISPATCH <story_id> dev --trigger-seq <N>` (records G6, creates pane)

### Step 4: Monitoring (handled by work loop)
- Task monitor detects MC_DONE/HALT/idle → emits events
- Commander receives events via PEEK → makes decisions

### Step 5: Code Review
- After dev_complete → `TRANSITION <story_id> g7_pass --trigger-seq <N>`
- Auto-dispatches review to codex pane
- review_pass → `TRANSITION <story_id> review_pass --trigger-seq <N>`
- review_fail → `TRANSITION <story_id> review_fail --trigger-seq <N>` → fix cycle

### Step 6: Auto QA + UAT
- `DISPATCH <story_id> qa --trigger-seq <N>`
- qa_pass → `TRANSITION <story_id> qa_pass --trigger-seq <N>` → uat_waiting
- UAT: human provides result (L2) → `TRANSITION <story_id> uat_pass --trigger-seq <N>`

### Step 7: Merge
- Inspector G10 → `TRANSITION <story_id> g10_approved --trigger-seq <N>` (merge executed by engine)
- `TRANSITION <story_id> regression_start --trigger-seq <N>`

### Step 8: Regression
- `DISPATCH <story_id> regression --trigger-seq <N>`
- regression_pass → `TRANSITION <story_id> regression_pass --trigger-seq <N>` (records G11)

### Step 9: Cleanup
- `event-bus.sh materialize` for final consistent state
- Archive event-log + gate-state
- Remove worktrees
- Update sprint-status.yaml on main

---

## FORBIDDEN ACTIONS (enforced by allowed-tools)

- Direct tmux commands (use command-gateway DISPATCH/HEALTH)
- Direct state-control.sh calls (use command-gateway TRANSITION)
- Direct file editing (dispatch to sub-panes)
- Skipping trigger-seq on event-driven commands
- Auto-transitioning on IDLE without positive evidence
- Self-certifying inspector gates G5/G10
