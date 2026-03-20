# Master Control — 并行开发指挥官

**Goal:** 自动编排多个 Story 的完整生命周期，通过 tmux 子窗格派发所有具体工作。

**Your Role:** 你是指挥官（master control），负责编排和监控。
- 绝不直接编辑文件、跑构建、执行 skill — 一切通过 tmux 子窗格派发
- 你**可以读取文件**来获取信息和做决策，但**不可写入/执行**
- 子窗格使用 `tmux split-window`（禁止 `new-window`），与你并排显示

---

## CORE REFERENCES

| 文件 | 用途 | 何时读取 |
|------|------|---------|
| `./constitution.md` | 6 条核心规则 | **每次 sub-pane dispatch 前 + 每次 gate** |
| `./forbidden-list.md` | 禁忌清单 | **每次 gate + 每次 step 转换** |
| `./pre-dispatch-checklist.md` | 派发前自检 | **每次 sub-pane dispatch 前** |
| `./inspector-protocol.md` | 御史台协议 | inspector 相关操作时 |
| `./tmux-reference.md` | tmux 命令语法 | 需要查命令时 |
| `./completion-detection.md` | 完成检测方法 | monitoring loop 中 |
| `session-journal.yaml` | 会话内纠错日志 | **每次 dispatch 前** |
| `gate-state.yaml` | 状态快照 + gate 记录 | **每次 step 转换** |

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

## INITIALIZATION

### 1. Skill Preflight Check

```
required_skills = [
  "bmad-create-story", "bmad-dev-story", "bmad-code-review",
  "frontend-design", "ui-ux-pro-max", "debugging-strategies"
]
```

For each: check `.claude/skills/{skill}/SKILL.md` exists. Any missing → HALT.

### 2. Constitution & Forbidden List Loading

- Read `./constitution.md` → 确认 6 条核心规则
- Read `./forbidden-list.md` → 逐条确认已理解

### 3. Environment Verification

- Verify tmux: `[ -n "$TMUX" ] || echo "NOT_IN_TMUX"` → if not in tmux: HALT
- Record current session: `tmux display-message -p '#{session_name}'` → set `current_session`
- Verify codex: `which codex` → if not found: HALT
- Verify worktree.sh: `test -x ./scripts/worktree.sh` → if missing: HALT
- Verify git clean: `git status --short` → if dirty: ask user (L2)
- Check node_modules: `test -d node_modules` → if missing: warn (L1)

### 3b. Commander Instance & Log Directory

Generate unique instance ID and create log directory for pipe-pane logging:

```bash
mc_instance="{current_session}-$(date +%s)"
mc_log_dir="/tmp/mc-logs/${mc_instance}/"
mkdir -p "${mc_log_dir}"
```

All sub-pane pipe-pane logs write to `{mc_log_dir}/pane-{pane_id}.log`.

### 4. Configuration Loading

Load from `{project-root}/_bmad/bmm/config.yaml`:
- `{project_name}`, `{communication_language}`, `{document_output_language}`
- `{planning_artifacts}` → planning docs path
- `{implementation_artifacts}` → story files and sprint-status path

### 5. Pane Creation（顺序和目标不可变）

**布局目标（F12 强制）— 上下两区：**
```
┌──────────────┬─────────────┬──────────┐
│  Commander   │  Inspector  │   Util   │  ← 上半区（指挥控制层）
├──────────────┴─────────────┴──────────┤
│      Dev / Review panes（按需开启）    │  ← 下半区（工作层，灵活创建）
└────────────────────────────────────────┘
```

Record commander pane ID: `tmux display-message -p '#{pane_id}'` → set `commander_pane`

**创建顺序：先纵后横（确保下半区全宽）**

**Step 5a: Bottom Anchor（先纵向分割，预留全宽底部区域）**

```bash
tmux split-window -t {commander_pane} -v -l 40% "cd {project_root} && zsh"
```
Record `bottom_anchor`. Wait for shell prompt.

**Step 5b: Inspector（从 commander 横向分割，上半区中部）**

See `./inspector-protocol.md` for full standing order.

```bash
tmux split-window -t {commander_pane} -h -l 55% "cd {project_root} && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"
```
Record `inspector_pane`. Send standing order. Wait for `INSPECTOR READY`.

**Step 5c: Utility（从 inspector 横向分割，上半区最右）**

```bash
tmux split-window -t {inspector_pane} -h -l 45% "cd {project_root} && zsh"
```
Wait for shell prompt. Record `utility_pane`.

Wait for baseline audit result (`BASELINE AUDIT: COMPLIANT` or `BASELINE AUDIT: VIOLATION`).
If VIOLATION → ask user (L2): "Inspector 基线审计发现问题: {details}。继续还是先处理？"

### 6. Pipe-Pane Logging（三层通讯保障）

为所有已创建 pane 启用日志捕获（确保 Log 层可用）：

```bash
tmux pipe-pane -t {commander_pane} -o 'cat >> {mc_log_dir}/pane-{commander_pane}.log'
tmux pipe-pane -t {bottom_anchor} -o 'cat >> {mc_log_dir}/pane-{bottom_anchor}.log'
tmux pipe-pane -t {inspector_pane} -o 'cat >> {mc_log_dir}/pane-{inspector_pane}.log'
tmux pipe-pane -t {utility_pane} -o 'cat >> {mc_log_dir}/pane-{utility_pane}.log'
```

### 7. Watchdog Startup

```bash
tmux send-keys -t {utility_pane} "nohup bash ${CLAUDE_SKILL_DIR}/watchdog.sh {commander_pane} {inspector_pane} {project_root} &" Enter
```

### 8. Session Journal Initialization

通过 utility_pane 创建空 session-journal:

```bash
tmux send-keys -t {utility_pane} "cat > _bmad-output/implementation-artifacts/session-journal.yaml << 'EOF'
batch_id: \"\"
entries: []
EOF" Enter
```

### 9. Gate State Resumption (断点恢复)

Check if `_bmad-output/implementation-artifacts/gate-state.yaml` exists:
- If exists: read it, identify last PASS gate, route to corresponding step
- If not: fresh start → route to Step 1

| Last PASS Gate | Resume Step |
|---------------|-------------|
| G1 | step-02-batch-prep |
| G2 | step-02 (prototype section) |
| G3 | step-02 (validate section) |
| G4 | step-02 (commit section) |
| G5 | step-03-launch-dev |
| G6 | step-04-monitoring |
| Story-level G7-G11 | step-04 (check individual story phases) |

---

## STEP ROUTING

After initialization, read and follow the appropriate step file:

- **Fresh start** → Read fully and follow `./steps/step-01-assessment.md`
- **Resume from checkpoint** → Read the step file indicated by gate state resumption

---

## GATE OVERVIEW

| Gate | 转换 | 级别 | 检查要点 |
|------|------|------|---------|
| G1 | Step 1→2 | Self-check | 用户已确认 batch |
| G2 | 2a→2b | Self-check | 所有 story 文件存在于磁盘 |
| G3 | 2b→2c | Self-check | UI story 有 .pen + PNG + manifest |
| G4 | 2c→2d | Self-check | 所有 story validation == PASS |
| **G5** | **Step 2→3** | **Inspector** | **Batch commit 在 git log；story 文件/原型完整；工作区干净** |
| G6 | Step 3→4 | Self-check | Worktree 已创建，dev pane 存活 |
| G7 | dev→review | Self-check (per story) | Dev 完成，源文件存在 |
| G8 | review→auto_qa | Self-check (per story) | Code review PASS |
| G9 | auto_qa→uat | Self-check (per story) | QA 报告存在且 PASS |
| **G10** | **UAT→merge** | **Inspector (per story)** | **用户确认 ✅；前置 gate 链完整** |
| G11 | regression→cleanup | Self-check (per story) | 三层回归同一轮全部通过 |

**Enforcement rules:** Each gate must execute (C6). REJECT = no forward. Inspector gates (G5/G10) cannot be self-certified. Gate state persists to `gate-state.yaml` for cross-session resumption.

---

## SHARED DEFINITIONS

### Gate State File Format

Location: `_bmad-output/implementation-artifacts/gate-state.yaml`

```yaml
last_updated: "2026-03-20T10:30:00.000Z"
batch_id: "batch-2026-03-20-1"
batch_stories: ["1-5", "2-1"]
gates:
  G1: { status: PASS, timestamp: "...", verified_by: commander, details: "..." }
  G5: { status: PASS, timestamp: "...", verified_by: inspector, details: "..." }
story_gates:
  "1-5":
    G7: { status: PASS, ... }
story_states:                # DURABLE only — no pane IDs (ephemeral handles don't survive session restart)
  "1-5":
    phase: review             # durable: resume point
    review_cycle: 1           # durable: tracks fix attempts
    current_llm: codex        # durable: which LLM should be active
    is_ui: true               # durable: story attribute
    worktree_path: "../BidWise-story-1-5"  # durable: verifiable on disk
    story_file_main: "_bmad-output/implementation-artifacts/story-1-5.md"
    story_file_rel: "_bmad-output/implementation-artifacts/story-1-5.md"
    story_key: "1-5-project-crud-kanban"
    validation_cycle: 0       # durable: tracks validate attempts
    auto_qa_cycle: 0          # durable: tracks QA attempts
    merge_priority: 1         # durable: merge order
    # Pane IDs are NOT stored — on resume, panes are re-created based on phase
inspector_state: idle         # ephemeral but lightweight — re-init on resume
```

### Session Journal Format

Location: `_bmad-output/implementation-artifacts/session-journal.yaml`

```yaml
batch_id: "batch-2026-03-20-1"
entries:
  - seq: 1
    timestamp: "2026-03-20T10:15:00Z"
    type: dispatch_audit    # dispatch_audit | correction | gate_fail
    story_id: "1-5"
    phase: "dev"
    llm: "claude"
    auth: "L0"
    constitution_check: "PASS"
  - seq: 2
    timestamp: "2026-03-20T10:16:00Z"
    type: correction
    trigger: user           # user | self | inspector | gate | watchdog
    description: "..."
    violated_rule: "C2"
    correct_action: "..."
    step: "5b"
    story_id: "1-5"
```

### Story Registry Schema

```yaml
story_registry:
  "1-5":
    story_key: "1-5-project-crud-kanban"
    story_id: "1-5"
    story_file_rel: "_bmad-output/implementation-artifacts/story-1-5.md"
    story_file_main: "/abs/path/story-1-5.md"
    story_file_worktree: "../BidWise-story-1-5/_bmad-output/..."
    worktree_path: "../BidWise-story-1-5"
    is_ui: true
    prep_mode: "create"     # create | reuse
```

### Task Packet Template

指挥官向任何 sub-pane 派发任务时，使用固定 4 段格式：

```
Skill: {skill_name}
Goal: {one-line goal}
Inputs:
- {key}: {value}
Constraints:
- {constraint}
Expected Output:
- MC_DONE {PHASE} {story_id} {RESULT}
```

规则：
- skill 名直接写，不加 `/`
- 所有文件路径用绝对路径
- 一次只派发一个目标
- Expected Output 带 `MC_DONE` 哨兵，便于 `capture-pane` 检测
