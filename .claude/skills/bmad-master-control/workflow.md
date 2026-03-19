# Master Control — 并行开发指挥官

**Goal:** 作为指挥官自动编排多个 Story 的完整生命周期，通过 tmux 子窗格派发所有具体工作，实现并行开发。

**Your Role:** 你是指挥官（master control），负责编排和监控。
- 绝不直接编辑文件、跑构建、执行 skill — 一切通过 tmux 子窗格派发
- 你**可以读取文件**（cat/grep/read）来获取信息和做决策，但**不可写入/执行**
- 子窗格使用 `tmux split-window`（禁止 `new-window`），与你并排显示
- 子窗格启动 claude 时**必须**加 `--dangerously-skip-permissions`，命令格式：`tmux split-window -h "cd /path && claude --dangerously-skip-permissions"`

**授权分级（Authority Levels）— 判断"问不问用户"的唯一依据：**

| Level | 名称 | 触发条件 | 指挥官行为 |
|-------|------|---------|-----------|
| **L0** | FULL AUTO | 可逆 + 流水线标准流转 + 无破坏性 | 直接执行，不通知 |
| **L1** | NOTIFY | 里程碑完成 / 用户可能关注的状态变化 | 输出状态信息，不等待 |
| **L2** | CONFIRM | 不可逆 OR 影响共享状态 OR 多选项需用户决策 | 暂停等待用户确认 |
| **L3** | HALT | 超出能力 OR 重大风险 OR 重复失败 | 完全停止并说明原因 |

遇到新场景时，按条件归类到对应 Level，不需要逐条加规则。

**LLM 分工规则：**
- **claude** — Create Story、Prototype、Dev（主力开发）
- **codex** — Validate Story、Code Review、顽固 bug 修复（不同 LLM 视角 + 审查/验证角色）
- 子窗格启动命令：`claude --dangerously-skip-permissions` 或 `codex`，按角色选择

---

## SKILL DEPENDENCY MAP

各流水线阶段必须使用的 skill，指挥官派发子窗格时**必须明确指定 skill 名称**，不得依赖 LLM 自动匹配。

| 阶段 | 必需 Skill | 用途 |
|------|-----------|------|
| **Create Story** | `/bmad-create-story` | 创建 story 文件 |
| **Prototype** | Pencil MCP tools | .pen 原型设计 |
| **Validate** | _(codex 直接验证，无需 skill)_ | AC/架构/PRD 对齐检查 |
| **Dev** | `/bmad-dev-story` | Story 实现 |
| **Dev (UI Story)** | `/bmad-dev-story` + `/frontend-design` 或 `/ui-ux-pro-max` | UI 实现需额外加载设计 skill |
| **Code Review** | `/bmad-code-review` | 对抗性代码审查 |
| **Bug Fix (一般)** | `/debugging-strategies` | 系统性调试定位 |
| **Bug Fix (顽固)** | `/debugging-strategies` | codex 接手顽固 bug |
| **Regression L2/L3** | _(codex 直接验证，无需 skill)_ | AC 回归 + 集成验证 |

**可选增强 Skill（按需使用）：**

| 场景 | 可选 Skill | 何时使用 |
|------|-----------|---------|
| UI 组件开发 | `/tailwind-design-system` | 涉及设计系统/组件库 |
| React 性能 | `/react-best-practices` | React 组件优化 |
| 状态管理 | `/react-state-management` | Zustand store 设计 |
| 架构模式 | `/architecture-patterns` | 后端架构实现 |
| 无障碍/UX 审查 | `/web-design-guidelines` | UI story 的 code review |

---

## INITIALIZATION

### Skill Preflight Check

启动指挥官前，必须验证所有必需 skill 存在。检查 `.claude/skills/` 目录：

```
required_skills = [
  "bmad-create-story",
  "bmad-dev-story",
  "bmad-code-review",
  "frontend-design",
  "ui-ux-pro-max",
  "debugging-strategies",
]
```

<action>For each skill in required_skills:
  Check if `.claude/skills/{skill}/SKILL.md` exists</action>

<check if="any required skill missing" level="L3">
  <output>🚫 **前置检查失败 — 缺少必需 Skill：**

  {{missing_skills_list}}

  请安装缺失的 skill 后重新启动指挥官。
  安装方式：使用 `/find-skills` 搜索并安装，或手动创建到 `.claude/skills/` 目录。</output>
  <action>HALT: "Missing required skills"</action>
</check>

<output level="L1">✅ Skill 前置检查通过 — {{skill_count}} 个必需 skill 全部就绪</output>

### Configuration Loading

Load config from `{project-root}/_bmad/bmm/config.yaml` and resolve:
- `{project_name}`, `{communication_language}`, `{document_output_language}`
- `{planning_artifacts}` → planning docs path
- `{implementation_artifacts}` → story files and sprint-status path

### Context Loading

1. Read `{implementation_artifacts}/sprint-status.yaml` → current story statuses
2. Read `{planning_artifacts}/epics.md` → dependency graph between stories
3. Read `{planning_artifacts}/architecture.md` → module boundaries (for conflict assessment)

---

## EXECUTION

<workflow>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- STEP 1: STATE ASSESSMENT & BATCH SELECTION                        -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<step n="1" goal="Assess current state and select batch for parallel development">
  <critical>指挥官绝不直接编辑文件、跑构建、执行 skill — 一切通过 tmux 子窗格派发</critical>

  <action>Read sprint-status.yaml: extract all story statuses</action>
  <action>Read epics.md: build dependency graph — for each story, identify prerequisite stories (especially [Enabler] stories)</action>
  <action>Identify "ready" stories: backlog stories whose ALL prerequisite stories are `done`</action>

  <check if="no ready stories found" level="L3">
    <output>📋 当前没有可开发的 Story — 所有前置依赖尚未完成，或所有 Story 已 done</output>
    <action>HALT: "No stories ready for development"</action>
  </check>

  <check if="stories found in-progress or review status" level="L2">
    <output>⏯️ 发现进行中的 Story: {{in_progress_stories}}
    需要先处理这些 Story，或者确认放弃/重启。</output>
    <ask>恢复这些 Story？还是跳过它们选择新 batch？</ask>
  </check>

  <action>Analyze ready stories for parallelizability:
    - 检查各 story 涉及的模块/文件范围（从 architecture.md 推断）
    - 标记有重叠的 story 对（如都修改 ipc-types.ts、package.json、同一 migration 目录）
    - 将不冲突的 story 分组为可并行 batch
    - 建议并行度（2-3 路为宜）</action>

  <output>🚀 **可并行开发的 Story:**

  {{batch_recommendation_with_rationale}}

  **预计冲突风险:** {{conflict_assessment}}
  **建议合并顺序:** {{merge_order}} (小改动/纯后端优先)</output>

  <ask level="L2">确认这个 batch？或调整选择？</ask>
</step>


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- STEP 2: BATCH PREPARATION (sequential, on main branch)            -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<step n="2" goal="Sequentially prepare all stories in batch (create + prototype + validate) on main branch">
  <critical>Phase 1-3 必须在 main 分支上完成。每个 story 的产出物（story 文件 + .pen 原型）必须 commit 到 main 后，才能处理下一个 story 或创建 worktree</critical>

  <action>For each story in the selected batch, sequentially execute sub-steps 2a → 2d:</action>

  <!-- ── 2a: Create Story (skill: /bmad-create-story) ── -->
  <action>Open tmux sub-pane with claude: `tmux split-window -h "cd {project_root} && claude --dangerously-skip-permissions"`</action>
  <action>Wait for Claude prompt (❯), then send: `tmux send-keys -t {pane_id} "/bmad-create-story" Enter`</action>
  <action>Poll via `tmux capture-pane -t {pane_id} -p` every 15 seconds until completion</action>

  <!-- ── 2b: Prototype (conditional) ── -->
  <check if="story involves UI/interaction (design system, kanban, navigation, editor, dashboard, form, layout)">
    <action>In the SAME pane, send Pencil MCP prototype instructions</action>
    <action>Poll every 15 seconds until prototype completes</action>
  </check>
  <check if="story is pure backend/enabler (data layer, IPC, AI proxy, task queue, migration)">
    <action>Skip prototype — proceed directly to validate</action>
  </check>

  <!-- ── 2c: Validate (codex) ── -->
  <critical>Validate 必须使用 codex（不同 LLM 视角），不能用开发同一 Story 的 claude</critical>
  <action>Close the claude pane used for Create/Prototype: `tmux send-keys -t {pane_id} "/exit" Enter`</action>
  <action>Open NEW tmux sub-pane with codex: `tmux split-window -h "cd {project_root} && codex"`</action>
  <action>Wait for codex ready, then send validation instructions:
    "请验证 story 文件 _bmad-output/implementation-artifacts/story-{{story_id}}.md：1) AC 完整性 2) 与 architecture.md 对齐 3) 与 PRD 对齐 4) 任务覆盖率 5) 如有原型，与原型对齐"</action>
  <action>Poll until validation completes</action>

  <check if="validation fails">
    <action>Send fix instructions to codex pane, poll until fixed</action>
    <action>Re-validate. Max 3 validation attempts per story.</action>
    <action if="3 validation failures">HALT: "Story {{story_id}} validation failed 3 times"</action>
  </check>

  <!-- ── 2d: Commit to main ── -->
  <action>In the codex pane, send git add + git commit for story file (and .pen files if created)</action>
  <action>Poll until commit confirmed</action>
  <action>Close codex sub-pane: `tmux send-keys -t {pane_id} "exit" Enter`</action>

  <action>Repeat 2a-2d for each remaining story in batch</action>

  <output level="L1">✅ Batch 准备完成 — {{batch_size}} 个 Story 文件已提交到 main</output>
</step>


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- STEP 3: CREATE WORKTREES & LAUNCH PARALLEL DEV                    -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<step n="3" goal="Create worktrees and launch parallel development">
  <critical>Story 文件必须已 commit 到 main 后才能创建 worktree</critical>

  <action>Run: `./scripts/worktree.sh create {{story_id_1}} {{story_id_2}} ...`
    (worktree.sh 会自动执行 pnpm install)</action>
  <action>Verify all worktrees created successfully (check exit code)</action>

  <action>For each story, launch a dev sub-pane:
    1. `tmux split-window -h "cd ../BidWise-story-{{story_id}} && claude --dangerously-skip-permissions"` (alternate -h/-v for layout balance)
    2. Wait for Claude prompt (❯)
    3. **UI Story 额外加载设计 skill：** 如果 story 涉及 UI/交互，先发送 `/frontend-design` 加载设计上下文，等待加载完成
    4. Send: `tmux send-keys -t {pane_id} "/bmad-dev-story _bmad-output/implementation-artifacts/story-{{story_id}}.md" Enter`
    5. Record: story_states[{{story_id}}] = { phase: "dev", dev_pane: pane_id, is_ui: true/false }</action>

  <output level="L1">🔨 并行开发已启动 — {{batch_size}} 个 Story 在独立 worktree 中开发中</output>
  <goto step="4">Enter monitoring loop</goto>
</step>


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- STEP 4: MONITORING LOOP (core state machine)                      -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<step n="4" goal="Monitor all active stories, drive state transitions">
  <critical>这是核心调度循环 — 持续轮询所有活跃 story，驱动状态转换直到所有 story 到达 uat_waiting 或 done</critical>

  <action>For each story in story_states, poll based on current phase:</action>

  <!-- ── Phase: dev ── -->
  <check if="story.phase == 'dev'">
    <action>Capture dev_pane output. Check for:
      - Claude idle prompt (❯) after dev-story completion → transition to "pending_review"
      - HALT message → HALT and notify user
      - Error/crash → warn user</action>
  </check>

  <check if="story.phase == 'pending_review'">
    <action>Launch code review → goto step 5 for this story</action>
    <action>Set story.phase = "review"</action>
  </check>

  <!-- ── Phase: review ── -->
  <check if="story.phase == 'review'">
    <action>Capture review_pane output. Check for:
      - Review completed with PASS / no critical issues → set story.phase = "uat_waiting"
      - Review completed with issues found → save findings, transition to "fixing"
      - Still running → continue polling</action>
  </check>

  <!-- ── Phase: fixing (review→fix loop) ── -->
  <check if="story.phase == 'fixing'">
    <action>Capture dev_pane output. Check for:
      - Fix completed (Claude idle) → set story.phase = "pending_review" (will trigger new review)
      - Still running → continue polling</action>
  </check>

  <!-- ── Phase: uat_waiting ── -->
  <check if="story.phase == 'uat_waiting'">
    <action>Skip — waiting for user (handled in step 6)</action>
  </check>

  <!-- ── Loop control ── -->
  <check if="all stories are in uat_waiting or done">
    <goto step="6">All stories ready for UAT</goto>
  </check>

  <check if="any story still in dev, review, pending_review, or fixing">
    <action>Wait polling interval:
      - dev phase: 60 seconds
      - review/fixing phase: 30 seconds
      - use the shortest interval among all active stories</action>
    <goto step="4">Continue monitoring</goto>
  </check>
</step>


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- STEP 5: LAUNCH CODE REVIEW (per story)                            -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<step n="5" goal="Launch fresh-context code review for a story">
  <critical>Code review 必须在新窗格（fresh context）中执行，避免开发上下文偏见</critical>

  <check if="story.review_cycle >= 3" level="L3">
    <output>🚫 Story {{story_id}} 已经过 3 轮 review 仍未通过</output>
    <action>HALT: "Story {{story_id}} failed code review after 3 cycles"</action>
  </check>

  <action>Increment story.review_cycle</action>
  <critical>Code Review 必须使用 codex（不同 LLM 视角），不能用开发同一 Story 的 claude</critical>
  <!-- skill: /bmad-code-review + UI story 额外 /web-design-guidelines -->
  <action>Open NEW tmux sub-pane with codex: `tmux split-window -h "cd ../BidWise-story-{{story_id}} && codex"`</action>
  <action>Wait for codex ready</action>
  <action>Send: `/bmad-code-review`</action>
  <action>如果是 UI Story，review 完成后额外发送: `/web-design-guidelines` 检查无障碍和 UX 合规</action>
  <action>Record story.review_pane = new pane_id</action>

  <goto step="4">Return to monitoring loop</goto>
</step>


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- STEP 5b: HANDLE REVIEW FAILURE → FIX CYCLE                        -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<step n="5b" goal="Pass review findings to dev pane for fixing" tag="review-fix-cycle" level="L0">
  <action>Extract review findings from review_pane via capture-pane</action>
  <action>Write findings to file: `../BidWise-story-{{story_id}}/review-findings-cycle-{{N}}.md`
    (Use a sub-pane to write this file, or use tmux send-keys to cat > file)</action>
  <action>Close review pane</action>

  <!-- 正常修复：claude + /debugging-strategies -->
  <check if="dev pane is still alive AND story.review_cycle < 2">
    <action>Send to dev_pane (claude): "/debugging-strategies" 加载调试 skill，等待加载</action>
    <action>Send: "请查看 review-findings-cycle-{{N}}.md 中的问题并修复所有 must-fix 项"</action>
  </check>
  <check if="dev pane has exited AND story.review_cycle < 2">
    <action>Open new pane with claude: `tmux split-window -h "cd ../BidWise-story-{{story_id}} && claude --dangerously-skip-permissions"`</action>
    <action>Wait for Claude prompt (❯)</action>
    <action>Send: `/debugging-strategies`，等待加载</action>
    <action>Send: "请查看 review-findings-cycle-{{N}}.md 中的问题并修复所有 must-fix 项"</action>
    <action>Update story.dev_pane = new pane_id</action>
  </check>

  <!-- 顽固 bug 升级：第 2 轮 review 仍不通过时，切换到 codex + /debugging-strategies -->
  <check if="story.review_cycle >= 2">
    <critical>claude 多次修复失败，切换到 codex（不同 LLM 视角）+ /debugging-strategies 处理顽固 bug</critical>
    <action>Close existing dev pane if alive</action>
    <action>Open new pane with codex: `tmux split-window -h "cd ../BidWise-story-{{story_id}} && codex"`</action>
    <action>Wait for codex ready</action>
    <action>Send: "请查看 review-findings-cycle-{{N}}.md 中的问题并修复所有 must-fix 项。这是第 {{N}} 轮 review，之前的修复未能解决问题，请使用系统性调试方法分析根因"</action>
    <action>Update story.dev_pane = new pane_id</action>
  </check>

  <action>Set story.phase = "fixing"</action>
  <goto step="4">Return to monitoring loop</goto>
</step>


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- STEP 6: UAT NOTIFICATION                                          -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<step n="6" goal="Notify user for UAT and wait" level="L2">

  <output>🧪 **UAT 验收通知**

  以下 Story 已完成开发和 Code Review，请进行 UAT 验收：

  {{uat_ready_stories_with_worktree_paths}}

  **验收步骤:**
  1. `cd ../BidWise-story-{{story_id}}` 进入对应 worktree
  2. `pnpm dev` 启动应用，手动验收各 AC
  3. `pnpm test` 确认所有测试通过
  4. 检查代码是否符合预期

  请逐个回复：✅ 通过 / ❌ 不通过（附原因）</output>

  <action>HALT and wait for user UAT results for each story</action>
</step>


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- STEP 7: PROCESS UAT RESULTS & SEQUENTIAL MERGE                    -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<step n="7" goal="Process UAT results, merge passed stories, handle failures">

  <!-- Handle UAT failures -->
  <check if="any story failed UAT">
    <action>For each failed story: send user's feedback to dev pane as fix instructions</action>
    <action>Set failed stories phase = "fixing", review_cycle = 0 (reset for post-UAT fix)</action>
    <action>Continue processing passed stories (don't block merge for UAT-passed stories)</action>
  </check>

  <!-- Sequential merge for passed stories -->
  <check if="stories passed UAT exist">
    <action>Sort merge queue: small/no-UI/enabler stories first</action>
    <action>For each story in merge queue, sequentially:
      1. Check .pen files: `git -C ../BidWise-story-{{story_id}} diff main --name-only | grep '\.pen$'`
         If .pen modified → warn user, ask to confirm
      2. Check migration files: `ls ../BidWise-story-{{story_id}}/src/main/db/migrations/`
         If migration timestamps conflict with already-merged stories → warn user
      3. Run: `./scripts/worktree.sh merge {{story_id}}`
         (auto-rebase, auto-update sprint-status.yaml, auto-commit status change)
      4. Verify merge succeeded (check exit code)
      5. If merge fails → HALT with conflict details</action>
  </check>

  <!-- After each merge, run regression (Step 8) before merging next story -->
  <action>After each successful merge, goto step 8 for regression before merging next story in queue</action>

  <!-- Cleanup after all merges + regressions pass → handled in Step 9 -->

  <output level="L1">✅ **Batch 完成**

  已合并: {{merged_stories}}
  Sprint 状态已自动更新

  {{remaining_or_failed_summary}}</output>

  <!-- Handle remaining fixes if any -->
  <check if="any story still in fixing phase">
    <goto step="4">Return to monitoring for UAT-failed stories being fixed</goto>
  </check>

  <!-- Check for next batch -->
  <action>Re-read sprint-status.yaml</action>
  <check if="more ready stories exist">
    <output>📋 还有可开发的 Story，是否继续下一个 batch？</output>
    <ask level="L2">继续？输入 "是" 开始下一轮，或 "否" 结束。</ask>
    <check if="user confirms">
      <goto step="1">Start next batch</goto>
    </check>
  </check>

  <output>🏁 所有已选 Story 处理完毕。</output>
</step>


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- STEP 8: REGRESSION TEST ON MAIN (after each merge)                -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<step n="8" goal="Run three-layer regression on main after merge" level="L0">
  <critical>
    三层回归 PASS 的唯一标准：L1 + L2 + L3 在同一次运行中全部通过。
    任何层失败 → 修复 → 从 L1 重新开始（不是从失败层重跑）。
    分次通过不算 PASS（修复可能破坏之前通过的层）。
    整体最多 3 轮（regression_cycle），超出则 HALT。
  </critical>

  <action>Open tmux sub-pane with codex on main: `tmux split-window -h "cd {project_root} && codex"`</action>
  <action>Wait for codex ready</action>
  <action>Set regression_cycle = 0</action>

  <!-- ══ REGRESSION LOOP (max 3 cycles) ══ -->
  <action tag="regression_loop_start">Increment regression_cycle</action>

  <check if="regression_cycle > 3" level="L3">
    <output>🚫 三层回归已重跑 3 轮仍未全部通过</output>
    <action>HALT: "Regression failed after 3 full cycles on main"</action>
  </check>

  <!-- ── L1: 基础自动化 ── -->
  <action>Send L1 command:
    "请在 main 分支执行 L1 基础自动化回归（第 {{regression_cycle}} 轮）：`pnpm test:unit && pnpm lint && pnpm typecheck && pnpm build`。通过标准：全绿，零 warning。报告 PASS 或 FAIL（附失败详情）"</action>
  <action>Poll until L1 completes</action>

  <check if="L1 FAIL" level="L0">
    <action>Send fix instructions: "L1 失败，请修复。修复后不要自行重跑 — 等待指挥官重新发起完整三层回归。"</action>
    <action>Poll until fix completes</action>
    <goto tag="regression_loop_start">修复后从 L1 重新开始新一轮</goto>
  </check>

  <!-- ── L2: Story AC 回归 ── -->
  <action>Send L2 command:
    "L1 通过。请执行 L2 Story AC 回归：读取以下 story 文件的 AC，逐项验证每个 AC 在 main 上仍然满足（代码/测试/行为）。Story 文件：{{merged_story_files_list}}。批量合并时需覆盖所有已合并 story 的 AC。报告每个 AC 的 PASS/FAIL。"</action>
  <action>Poll until L2 completes</action>

  <check if="L2 FAIL" level="L0">
    <action>Send fix instructions: "L2 AC 回归失败：{{failed_ACs}}。请定位问题并修复。修复后不要自行重跑 — 等待指挥官重新发起完整三层回归（从 L1 开始）。"</action>
    <action>Poll until fix completes</action>
    <goto tag="regression_loop_start">修复后从 L1 重新开始新一轮</goto>
  </check>

  <!-- ── L3: 集成验证 ── -->
  <action>Send L3 command:
    "L2 通过。请执行 L3 集成验证：检查合并后各 story 之间的交叉功能正常工作，验证跨层调用链路（UI→IPC→Service→DB），启动 app (`pnpm dev`) 验证无报错、主要功能可用。报告 PASS 或 FAIL。"</action>
  <action>Poll until L3 completes</action>

  <check if="L3 FAIL" level="L0">
    <action>Send fix instructions: "L3 集成验证失败。请修复。修复后不要自行重跑 — 等待指挥官重新发起完整三层回归（从 L1 开始）。"</action>
    <action>Poll until fix completes</action>
    <goto tag="regression_loop_start">修复后从 L1 重新开始新一轮</goto>
  </check>

  <!-- ══ ALL THREE LAYERS PASSED IN SAME CYCLE ══ -->
  <action>Set story.phase = "done"</action>
  <action>Close codex pane</action>
  <output level="L1">✅ Story {{story_id}} 三层回归测试同一轮全部通过（第 {{regression_cycle}} 轮），状态已更新为 done</output>
  <action>Continue merging next story in queue (return to step 7), or proceed to step 9 cleanup if queue empty</action>
</step>


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- STEP 9: CLEANUP (after all regressions pass)                      -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<step n="9" goal="Clean up merged worktrees and branches" level="L0">
  <action>For each merged story in batch:
    1. `./scripts/worktree.sh remove {{story_id}}`
       (removes worktree directory + deletes local branch)
    2. Verify removal: `./scripts/worktree.sh list` should not show the story</action>

  <output level="L1">🧹 Cleanup 完成 — {{cleaned_count}} 个 worktree 已清理

  {{remaining_worktrees_if_any}}</output>

  <!-- Check for next batch -->
  <action>Re-read sprint-status.yaml</action>
  <check if="more ready stories exist">
    <output>📋 还有可开发的 Story，是否继续下一个 batch？</output>
    <ask level="L2">继续？输入 "是" 开始下一轮，或 "否" 结束。</ask>
    <check if="user confirms">
      <goto step="1">Start next batch</goto>
    </check>
  </check>

  <output>🏁 所有已选 Story 处理完毕。</output>
</step>

</workflow>

---

## COMPLETION DETECTION

### How to detect sub-pane completion

Use `tmux capture-pane -t {pane_id} -p` and check the last few lines for:

1. **Claude Code idle:** The prompt character `❯` appears at the end with no active progress indicator
2. **Codex idle:** codex 完成后会显示结果并返回 shell prompt（`$` 或 `%`），或 pane 自动关闭
3. **Pane exited:** Pane no longer exists in `tmux list-panes` output — since sub-panes use `tmux split-window "command"` 形式启动，claude/codex 退出后 pane 自动关闭
4. **HALT message:** Text containing "HALT" in the output
5. **Error/crash:** Stack traces, "Error:", "FATAL:", disconnection messages

### Tips for reliable detection

- Capture the last 5 lines: `tmux capture-pane -t {pane_id} -p | tail -5`
- Strip ANSI codes for clean matching: `... | sed 's/\x1b\[[0-9;]*m//g'`
- Check if Claude process is still running: `tmux list-panes -F '#{pane_id} #{pane_current_command}'`

### Timeout thresholds (warn user, do NOT auto-kill)

| Phase | Timeout | Action on timeout |
|-------|---------|-------------------|
| Create story | 10 min | Warn user |
| Prototype | 15 min | Warn user |
| Validate | 5 min | Warn user |
| Dev | 60 min | Warn user |
| Code review | 15 min | Warn user |
| Regression | 10 min | Warn user |

---

## TMUX COMMANDS REFERENCE

**Codex 提交命令注意事项：** codex 的输入框在 `send-keys` 发送长文本后可能不会自动提交。发送命令后需要额外发一次 `Enter`：
```bash
tmux send-keys -t {pane_id} '命令内容' Enter
sleep 1
tmux send-keys -t {pane_id} Enter   # 额外 Enter 确保提交
```

```bash
# Open sub-pane with claude (Create Story, Prototype, Dev)
tmux split-window -h "cd /project/path && claude --dangerously-skip-permissions"
tmux split-window -v "cd /project/path && claude --dangerously-skip-permissions"

# Open sub-pane with codex (Validate, Code Review, 顽固 bug 修复)
tmux split-window -h "cd /project/path && codex"
tmux split-window -v "cd /project/path && codex"

# Send command to running claude in pane
tmux send-keys -t {pane_id} "/bmad-dev-story story-file.md" Enter

# Capture pane output (last screen)
tmux capture-pane -t {pane_id} -p

# Capture with scrollback history
tmux capture-pane -t {pane_id} -p -S -50

# List all panes with their IDs and running commands
tmux list-panes -F '#{pane_id} #{pane_current_command} #{pane_width}x#{pane_height}'

# Close/kill a specific pane
tmux kill-pane -t {pane_id}
```

---

## STATE TRACKING

Maintain an in-memory state map throughout execution:

```
story_states = {
  "1-2": {
    phase: "dev" | "pending_review" | "review" | "fixing" | "uat_waiting" | "merging" | "regression" | "done",
    dev_pane: "%3",
    review_pane: "%5" | null,
    review_cycle: 0,        // max 3
    validation_cycle: 0,    // max 3
    merge_priority: 1,      // lower = merge first
  },
  "1-4": { ... },
  ...
}
```

---

## REVIEW FINDINGS FILE FORMAT

When extracting review findings from the review pane, write to `review-findings-cycle-{N}.md` in the worktree root:

```markdown
# Code Review Findings — Story {{story_id}} (Cycle {{N}})

## Must Fix
- [ ] Issue description
- [ ] Issue description

## Should Fix
- [ ] Issue description

## Optional
- [ ] Issue description
```

The dev pane reads this file to know what to fix. Use a sub-pane to write the file:
```bash
tmux send-keys -t {utility_pane} "cat > ../BidWise-story-{id}/review-findings-cycle-{N}.md << 'REVIEW_EOF'
{findings_content}
REVIEW_EOF" Enter
```
