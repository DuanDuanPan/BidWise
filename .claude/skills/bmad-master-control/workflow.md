# Master Control — 并行开发指挥官

**Goal:** 作为指挥官自动编排多个 Story 的完整生命周期，通过 tmux 子窗格派发所有具体工作，实现并行开发。

**Your Role:** 你是指挥官（master control），负责编排和监控。
- 绝不直接编辑文件、跑构建、执行 skill — 一切通过 tmux 子窗格派发
- 你**可以读取文件**（cat/grep/read）来获取信息和做决策，但**不可写入/执行**
- 子窗格使用 `tmux split-window`（禁止 `new-window`），与你并排显示
- 子窗格启动 claude 时**必须**加 `--dangerously-skip-permissions`，命令格式：`tmux split-window -h "cd /path && claude --dangerously-skip-permissions"`
- 子窗格启动 codex 时**必须**加 `--dangerously-bypass-approvals-and-sandbox`（tmux 子窗格不加载 shell alias，必须显式传 flag）。命令格式：`tmux split-window -h "cd /path && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"`

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
| **Prototype** | Pencil MCP tools | Story 绑定 `.pen` 原型 + 参考 PNG + manifest 索引 |
| **Validate** | _(codex 直接验证，无需 skill)_ | AC/架构/PRD 对齐检查 |
| **Dev** | `/bmad-dev-story` | Story 实现 |
| **Dev (UI Story)** | `/bmad-dev-story` + `/frontend-design` 或 `/ui-ux-pro-max` | UI 实现需额外加载设计 skill |
| **Code Review** | `/bmad-code-review` | 对抗性代码审查 |
| **Automated QA (optional skill)** | `/bmad-qa-generate-e2e-tests` | 生成/更新 Story 级自动化测试，辅助 UAT |
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
| 自动化测试补强 | `/bmad-qa-generate-e2e-tests` | 缺少 Story 级 E2E 覆盖时，进入 UAT 前补齐 |

---

## PHASE GATE PROTOCOL (御史台制度)

**核心原则：** 不靠觉悟（advisory checks），而靠制度（mandatory gates with state persistence）。

类比唐代三省制度：中书省起草（指挥官执行）→ 门下省审核（gate 验证）→ 通过才能交尚书省执行（进入下一步）。门下省给事中有权**封还驳回**，即使皇帝本人也不能绕过。

### 两级强制执行

| 级别 | 机制 | 执行者 | 耗时 | 适用场景 |
|------|------|--------|------|---------|
| **Self-Check** | `<gate>` + `<assert>` 指挥官读取磁盘/git 状态验证 | 指挥官 | ~0s（文件读取） | 每次转换 |
| **Inspector (御史台)** | 独立 codex session 验证磁盘/git 状态 | Fresh codex pane | <2 min | 高风险转换：G5 (commit→worktree), G10 (UAT→merge) |

### 强制规则

1. **每个 `<gate>` 必须执行** — 指挥官 MUST 执行 gate 内所有 `<assert>`。跳过 gate 等同于 L3 HALT 级别的协议违规。
2. **Gate 结果持久化** — 通过 gate 后，将结果写入 `gate-state.yaml`。同时作为审计日志和断点恢复检查点。
3. **REJECT = 不可前进** — 任何 assert 失败，指挥官 MUST NOT 继续。必须修复后重新评估，或 HALT。
4. **Inspector gate 不可自我认证** — G5 和 G10 必须由独立 codex session 验证。指挥官不能替代 inspector 做出 APPROVE 判断。
5. **Gate 状态跨会话存活** — 会话重启后读取 `gate-state.yaml` 确定恢复点。

### Gate 全景图

| Gate | 转换 | 级别 | 检查要点 |
|------|------|------|---------|
| G1 | Step 1→2 | Self-check | 用户已确认 batch |
| G2 | 2a→2b | Self-check | 所有 story 文件存在于磁盘 |
| G3 | 2b→2c | Self-check | UI story 有 .pen + PNG + manifest |
| G4 | 2c→2d | Self-check | 所有 story validation == PASS |
| **G5** | **Step 2→3** | **Inspector** | **Batch commit 在 git log 中；story 文件/原型合同/工作区干净** |
| G6 | Step 3→4 | Self-check | Worktree 已创建，dev pane 存活 |
| G7 | dev→review | Self-check (per story) | Dev pane 完成，源文件存在 |
| G8 | review→auto_qa | Self-check (per story) | Code review PASS |
| G9 | auto_qa→uat | Self-check (per story) | QA 报告存在且 PASS |
| **G10** | **UAT→merge** | **Inspector (per story)** | **用户明确确认 ✅；前置 gate 链完整；review/QA 全 PASS** |
| G11 | regression→cleanup | Self-check (per story) | 三层回归同一轮全部通过 |

### 监察官协作机制（指挥官 ↔ 御史台）

**生命周期：** 监察官在 INITIALIZATION 阶段创建，与指挥官共存直到 batch 结束。不是用完即抛。

**启动：** 指挥官在 Step 1 之前通过 tmux 创建监察官窗格（codex），发送"驻场令"（standing orders），监察官确认就绪。

```
启动命令：
tmux split-window -v "cd {project_root} && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"

驻场令（首条消息）：
"你是本次 batch 的独立监察官（御史台）。你将驻场监督整个 batch 生命周期。

你的两项职责：
1. **Gate 审查** — 收到"请审查 Gate G{N}"时，读取 _bmad-output/implementation-artifacts/gate-report-G{N}.md，然后独立验证磁盘/git 状态，输出 APPROVE 或 REJECT
2. **主动监察** — 收到"请执行主动监察"时，检查整体合规状态

你的原则：
- 不信任指挥官的文字描述，只信任磁盘文件和 git 状态
- 每次审查都独立读取实际状态
- 发现违规必须立即 REJECT，不做妥协
- 你不参与任何执行工作

请确认就绪。"
```

**Gate 审查协议（被动）：**

```
指挥官 ─── 写入 gate-report-G{N}.md（通过子窗格） ───┐
                                                       │
指挥官 ─── send-keys "请审查 Gate G{N}" ──────────── 监察官
                                                       │
监察官 ─── 读取报告 + 独立验证磁盘/git ────────────── 监察官
                                                       │
监察官 ─── 输出 APPROVE/REJECT ────────────────────── 指挥官（capture-pane 读取结论）
```

gate-report 文件格式（`_bmad-output/implementation-artifacts/gate-report-G{N}.md`）：
```markdown
# Gate Report G{N}
- Gate: G{N} ({label})
- Batch: {batch_stories}
- 提交时间: {iso_timestamp}

## 指挥官执行摘要
{一段话描述做了什么}

## 磁盘状态断言
- [ ] {assertion_1}
- [ ] {assertion_2}
```

**主动监察协议（周期性）：**

指挥官在 Step 4 监控循环中，每 **3 轮轮询** 向监察官发送一次主动监察请求：

```
tmux send-keys -t {inspector_pane} "请执行主动监察。当前状态：
- 活跃 story: {active_stories_and_phases}
- 最近通过的 gate: {last_gate}
- 活跃 tmux panes: {pane_list}
请检查：1) gate-state.yaml 无间隙 2) 活跃 pane 与 story phase 一致 3) 无未授权的 main 分支变更 4) 工作流顺序合规" Enter
```

监察官输出 `COMPLIANT` 或 `VIOLATION: {details}`。指挥官 capture-pane 读取结论。

若 `VIOLATION` → 指挥官按 HALT 级别处理，输出违规详情给用户。

**监察官 pane ID 追踪：** `inspector_pane` 记录在 `story_states` 同级的 `inspector` 字段中。

### Gate 状态文件

位置：`_bmad-output/implementation-artifacts/gate-state.yaml`

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
    G10: { status: PASS, verified_by: inspector, ... }
```

指挥官通过子窗格写入此文件（不直接编辑），写入命令见 TMUX COMMANDS REFERENCE。

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

### Inspector Initialization (御史台启动)

<action>创建监察官窗格（与指挥官并排）：
  `tmux split-window -v "cd {project_root} && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"`</action>
<action>等待 codex 就绪，发送驻场令（见 PHASE GATE PROTOCOL 中的"监察官协作机制"）</action>
<action>等待监察官确认就绪（capture-pane 检查 "确认就绪" 或类似输出）</action>
<action>记录 inspector_pane = {pane_id}</action>

<check if="codex 启动失败或不就绪" level="L3">
  <output>🚫 监察官启动失败 — 无法建立独立监督机制</output>
  <action>HALT: "Inspector initialization failed"</action>
</check>

<output level="L1">🏛️ 御史台就绪 — 监察官已驻场，pane {{inspector_pane}}</output>

### Gate State Resumption (断点恢复)

<action>Check if `_bmad-output/implementation-artifacts/gate-state.yaml` exists</action>
<check if="gate-state.yaml exists">
  <action>Read gate-state.yaml. Identify the last PASS gate.</action>
  <action>Determine resume point:
    - Last PASS is G1 → resume at Step 2 (batch prep)
    - Last PASS is G2 → resume at Step 2b (prototype)
    - Last PASS is G3 → resume at Step 2c (validate)
    - Last PASS is G4 → resume at Step 2d (commit)
    - Last PASS is G5 → resume at Step 3 (worktree creation)
    - Last PASS is G6 → resume at Step 4 (monitoring loop)
    - Story-level gates (G7-G11): check each story's last PASS gate to determine individual story phase</action>
  <output level="L1">📍 发现 gate-state.yaml — 从 gate {{last_pass_gate}} 之后恢复</output>
  <goto step="{{resume_step}}">Resume from last checkpoint</goto>
</check>
<check if="gate-state.yaml does not exist">
  <action>Fresh start — proceed to Step 1</action>
</check>

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
  <action>Identify batch candidates:
    - `backlog` stories whose ALL prerequisite stories are `done` → candidate with prep_mode = "create"
    - `ready-for-dev` stories → candidate with prep_mode = "reuse"
    - `in-progress` / `review` stories are handled separately as resume decisions, not fresh batch candidates</action>

  <check if="no batch candidates found" level="L3">
    <output>📋 当前没有可开发的 Story — 所有前置依赖尚未完成、没有可复用的 `ready-for-dev` Story，或所有 Story 已 done</output>
    <action>HALT: "No candidate stories ready for development"</action>
  </check>

  <check if="stories found in-progress or review status" level="L2">
    <output>⏯️ 发现进行中的 Story: {{in_progress_stories}}
    需要先处理这些 Story，或者确认放弃/重启。</output>
    <ask>恢复这些 Story？还是跳过它们选择新 batch？</ask>
  </check>

  <action>Analyze batch candidates for parallelizability:
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

<!-- ═══════════════ GATE G1: batch_selection → batch_prep ═══════════════ -->
<gate id="G1" from="step-1" to="step-2" level="self-check" label="Batch 选择已确认">
  <assert verify="用户已明确确认 batch 选择" fail="HALT: 用户未确认 batch"/>
  <assert verify="batch_stories 数组非空" fail="HALT: 未选中任何 story"/>
  <on_pass>创建 gate-state.yaml（通过子窗格），记录 G1 PASS + batch_stories 列表</on_pass>
</gate>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- STEP 2: BATCH PREPARATION (phase-batched, on main branch)         -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<step n="2" goal="Prepare batch on main branch with phase-batched flow (create → prototype → validate → commit)">
  <preflight gate="G1">
    <assert cmd="读取 gate-state.yaml 中 G1.status" expect="PASS" fail="HALT: Gate G1 未通过，不能进入 Step 2"/>
  </preflight>
  <critical>Phase 1-3 必须在 main 分支上完成，但不要按 story 做完整闭环。应先按批次补齐 story 文件/原型，再统一验证，再统一提交到 main，最后才创建 worktree。</critical>

  <action>Partition the selected batch:
    - `stories_to_create` = batch 中状态为 `backlog` 的 story
    - `stories_to_reuse` = batch 中状态为 `ready-for-dev` 的 story
    - `ui_stories` = batch 中涉及 UI/interaction 的 story
    - `backend_only_stories` = 纯后端/Enabler story</action>

  <!-- ── 2a: Create missing story files (backlog only) ── -->
  <action>For each story in `stories_to_create`, sequentially run `/bmad-create-story` in a claude sub-pane.
    Reason: create-story is interactive and must remain minimally serial on main.
    After each story file is created, close the pane and continue to the next story.
    Do NOT validate/commit per story at this stage.</action>

  <!-- ═══ GATE G2: create → prototype ═══ -->
  <gate id="G2" level="self-check" label="所有 story 文件已创建">
    <assert foreach="batch_stories" cmd="test -f _bmad-output/implementation-artifacts/story-{{story_id}}.md" fail="HALT: story-{{story_id}}.md 不存在"/>
    <on_pass>更新 gate-state.yaml 记录 G2 PASS</on_pass>
  </gate>

  <!-- ── 2b: Add prototypes only where needed ── -->
  <critical>`prototype.pen` 是只读的项目级标准母版；所有 story 原型必须派生到各自的 `story-{{story_id}}.pen`。禁止多个 Story 并行编辑同一个工作 `.pen`。</critical>
  <action>For each story in `ui_stories`, check whether current batch artifacts already include a usable prototype for the current story scope.</action>
  <check if="UI story lacks current prototype artifact">
    <action>Open claude sub-pane and instruct it to:
      1. Open the canonical master prototype in read-only mindset: `{project_root}/_bmad-output/implementation-artifacts/prototypes/prototype.pen`
      2. Copy the relevant standard frames/components/tokens from `prototype.pen` into the story-bound working file `{project_root}/_bmad-output/implementation-artifacts/prototypes/story-{{story_id}}.pen`
      3. Reuse project-wide style baseline from:
         - `_bmad-output/planning-artifacts/ux-design-specification.md`
         - `_bmad-output/implementation-artifacts/1-4-ui-framework-design-system.md`
         - existing reference exports under `_bmad-output/implementation-artifacts/prototypes/story-1-4-*.png`
      4. Create or update story-specific frames using names prefixed with `Story {{story_id}} —`
      5. Export primary reference PNGs to `_bmad-output/implementation-artifacts/prototypes/story-{{story_id}}/`
      6. Save the `.pen` document to disk before exiting the pane
      7. Update `_bmad-output/implementation-artifacts/prototypes/prototype-manifest.yaml` with story id, `.pen` path, exported PNG paths, viewport(s), style baseline references, and which standard frames/components were copied from `prototype.pen`
      8. Report the saved file path, copied baseline sources, updated frame names, and exported reference PNG paths</action>
    <action>After the pane finishes, verify prototype persistence on disk:
      - file exists: `_bmad-output/implementation-artifacts/prototypes/story-{{story_id}}.pen`
      - manifest entry exists in `_bmad-output/implementation-artifacts/prototypes/prototype-manifest.yaml`
      - at least one reference PNG exists under `_bmad-output/implementation-artifacts/prototypes/story-{{story_id}}/`
      - manifest indicates the story prototype was seeded from `prototype.pen`
      - `git status --short` shows expected file creation/modification</action>
    <action if="story-bound prototype, manifest entry, or reference PNG missing">Re-open the prototype pane, explicitly request save-to-disk + manifest update + PNG export, then re-check once. If still missing, HALT: "Story-bound prototype contract not fully persisted"</action>
  </check>
  <check if="story is in `backend_only_stories` or already has current prototype">
    <action>Skip prototype work for that story.</action>
  </check>

  <!-- ═══ GATE G3: prototype → validate ═══ -->
  <gate id="G3" level="self-check" label="UI story 原型合同已满足">
    <assert foreach="ui_stories" cmd="test -f _bmad-output/implementation-artifacts/prototypes/story-{{story_id}}.pen" fail="HALT: story-{{story_id}}.pen 不存在"/>
    <assert foreach="ui_stories" cmd="ls _bmad-output/implementation-artifacts/prototypes/story-{{story_id}}/*.png 2>/dev/null | wc -l" expect=">= 1" fail="HALT: story-{{story_id}} 无 reference PNG"/>
    <assert foreach="ui_stories" cmd="grep '{{story_id}}' _bmad-output/implementation-artifacts/prototypes/prototype-manifest.yaml" fail="HALT: prototype-manifest.yaml 中无 {{story_id}} 条目"/>
    <assert foreach="backend_only_stories" action="SKIP — 纯后端 story 无原型要求"/>
    <on_pass>更新 gate-state.yaml 记录 G3 PASS</on_pass>
  </gate>

  <!-- ── 2c: Validate entire batch before dev ── -->
  <critical>Validate 必须使用 codex（不同 LLM 视角），对 batch 中每个 story 执行标准化验证；`ready-for-dev` story 不能重建，但应在进入 Dev 前复核。</critical>
  <action>Open ONE codex sub-pane on main:
    `tmux split-window -h "cd {project_root} && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"`</action>
  <action>For each story in the batch, sequentially send validation instructions in the SAME codex pane:
    "请读取 .claude/skills/bmad-create-story/checklist.md 中的验证清单，然后对 _bmad-output/implementation-artifacts/story-{{story_id}}.md 执行完整验证。重点检查：1) 防止重复造轮子 — 是否复用了已有代码 2) 库/依赖是否与 Tech Stack 对齐 3) 文件位置是否符合架构规范 4) AC 完整性和可测试性 5) 任务覆盖率 6) 如有原型，与原型对齐。输出 PASS/FAIL 及具体发现。"</action>
  <action>Collect PASS/FAIL per story. Keep the codex pane open until the whole batch has been assessed.</action>

  <check if="any story in batch fails validation">
    <action>Close codex pane after extracting findings</action>
    <action>For each failed story, open a claude pane on main and fix the story file / prototype according to the captured findings. Close the pane after each fix.</action>
    <action>Re-open ONE codex pane and re-validate only the failed stories.</action>
    <action>Max 3 validation cycles per story.</action>
    <action if="any story fails validation 3 times">HALT: "One or more stories in batch failed validation 3 times"</action>
  </check>

  <!-- ═══ GATE G4: validate → commit ═══ -->
  <gate id="G4" level="self-check" label="所有 story validation PASS">
    <assert foreach="batch_stories" verify="validation_status[{{story_id}}] == PASS" fail="HALT: story {{story_id}} 验证未通过"/>
    <on_pass>更新 gate-state.yaml 记录 G4 PASS</on_pass>
  </gate>

  <!-- ── 2d: Single commit for the whole batch ── -->
  <action>Close codex pane after the whole batch passes validation</action>
  <action>Open one claude pane for batch commit: `tmux split-window -h "cd {project_root} && claude --dangerously-skip-permissions"`</action>
  <action>Send git add for all newly created or updated story/prototype artifacts.</action>
  <check if="working tree has staged changes">
    <action>Send a SINGLE batch commit covering all prepared stories on main.</action>
  </check>
  <check if="no file changes were needed for reused `ready-for-dev` stories">
    <action>Skip commit and proceed directly to worktree creation.</action>
  </check>
  <action>Close claude pane</action>

  <output level="L1">✅ Batch 准备完成 — 选中 Story 已按批次完成创建/补原型/验证，并已统一提交（如有变更）到 main</output>
</step>

<!-- ═══════════════ GATE G5: batch_commit → worktree (🏛️ 御史台) ═══════════════ -->
<gate id="G5" from="step-2" to="step-3" level="inspector" label="Batch 准备产物完整性 — 独立审查">
  <!-- Self-check 前置验证 -->
  <assert cmd="git log -1 --oneline" expect="包含 batch story ID" fail="HALT: git log 最近 commit 不含 batch 产物"/>
  <assert foreach="batch_stories" cmd="test -f _bmad-output/implementation-artifacts/story-{{story_id}}.md" fail="HALT: story-{{story_id}}.md 不存在"/>
  <assert cmd="git status --short" expect="空（无未提交文件）" fail="HALT: 工作区有未提交变更"/>
  <!-- 独立监察官审查（使用驻场监察官，非临时创建） -->
  <inspector>
    <action>写入 gate-report-G5.md（通过子窗格），内容为指挥官执行摘要 + 磁盘状态断言</action>
    <action>向驻场监察官发送审查请求：
      `tmux send-keys -t {inspector_pane} "请审查 Gate G5。读取 _bmad-output/implementation-artifacts/gate-report-G5.md，然后独立验证：1) git log -1 确认 batch commit 2) story 文件完整 3) validation 全通过 4) UI story 原型合同 5) git status 干净。输出 APPROVE 或 REJECT + 逐项 PASS/FAIL。" Enter`</action>
    <action>轮询 inspector_pane 直到看到 APPROVE 或 REJECT</action>
    <on_reject>HALT: "御史台驳回 G5 — {{reject_reason}}"</on_reject>
  </inspector>
  <on_pass>更新 gate-state.yaml 记录 G5 PASS (verified_by: inspector)</on_pass>
</gate>

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- STEP 3: CREATE WORKTREES & LAUNCH PARALLEL DEV                    -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<step n="3" goal="Create worktrees and launch parallel development">
  <preflight gate="G5">
    <assert cmd="读取 gate-state.yaml 中 G5.status" expect="PASS" fail="HALT: Gate G5 未通过，不能创建 worktree"/>
    <assert verify="G5.verified_by == inspector" fail="HALT: G5 必须由御史台（inspector）验证，不能自我认证"/>
  </preflight>
  <critical>Story 文件必须已 commit 到 main 后才能创建 worktree</critical>

  <action>Run: `./scripts/worktree.sh create {{story_id_1}} {{story_id_2}} ...`
    (worktree.sh 会自动执行 pnpm install)</action>
  <action>Verify all worktrees created successfully (check exit code)</action>

  <action>For each story, launch a dev sub-pane:
    1. `tmux split-window -h "cd ../BidWise-story-{{story_id}} && claude --dangerously-skip-permissions"` (alternate -h/-v for layout balance)
    2. Wait for Claude prompt (❯)
    3. **UI Story 额外加载设计 skill：** 如果 story 涉及 UI/交互，先发送 `/frontend-design` 加载设计上下文，等待加载完成
    4. Send: `tmux send-keys -t {pane_id} "/bmad-dev-story _bmad-output/implementation-artifacts/story-{{story_id}}.md" Enter`
    5. If UI Story, send follow-up guidance:
       "Prototype references:
       - manifest: _bmad-output/implementation-artifacts/prototypes/prototype-manifest.yaml
       - pen: _bmad-output/implementation-artifacts/prototypes/story-{{story_id}}.pen
       - reference PNGs: _bmad-output/implementation-artifacts/prototypes/story-{{story_id}}/
       视觉还原要求：以 reference PNG 为像素级静态基准，以 story-bound .pen 为结构/交互细节来源，以 Story 1.4 设计系统和 ux-design-specification 作为全局风格约束。"
    6. Record: story_states[{{story_id}}] = { phase: "dev", dev_pane: pane_id, is_ui: true/false }</action>

  <output level="L1">🔨 并行开发已启动 — {{batch_size}} 个 Story 在独立 worktree 中开发中</output>

  <!-- ═══ GATE G6: worktree → monitor ═══ -->
  <gate id="G6" level="self-check" label="Worktree 已创建，dev pane 存活">
    <assert foreach="batch_stories" cmd="test -d ../BidWise-story-{{story_id}}" fail="HALT: worktree 不存在 — story-{{story_id}}"/>
    <assert foreach="batch_stories" verify="story_states[{{story_id}}].dev_pane 存在于 tmux list-panes" fail="HALT: dev pane 未存活 — story-{{story_id}}"/>
    <on_pass>更新 gate-state.yaml 记录 G6 PASS</on_pass>
  </gate>

  <goto step="4">Enter monitoring loop</goto>
</step>


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- STEP 4: MONITORING LOOP (core state machine)                      -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<step n="4" goal="Monitor all active stories, drive state transitions">
  <preflight gate="G6">
    <assert cmd="读取 gate-state.yaml 中 G6.status" expect="PASS" fail="HALT: Gate G6 未通过"/>
  </preflight>
  <critical>这是核心调度循环 — 持续轮询所有活跃 story，驱动状态转换直到所有 story 到达 auto_qa_pending、uat_waiting 或 done</critical>

  <action>For each story in story_states, poll based on current phase:</action>

  <!-- ── Phase: dev ── -->
  <check if="story.phase == 'dev'">
    <action>Capture dev_pane output. Check for:
      - Claude idle prompt (❯) after dev-story completion → transition to "pending_review"
      - HALT message → HALT and notify user
      - Error/crash → warn user</action>
  </check>

  <check if="story.phase == 'pending_review'">
    <!-- ═══ GATE G7 (per story): dev → review ═══ -->
    <gate id="G7" level="self-check" per-story="true" label="Dev 完成，源文件存在">
      <assert cmd="ls ../BidWise-story-{{story_id}}/src/" expect="源文件存在" fail="HALT: worktree 中无源文件"/>
      <on_pass>更新 gate-state.yaml story_gates.{{story_id}}.G7 = PASS</on_pass>
    </gate>
    <action>Launch code review → goto step 5 for this story</action>
    <action>Set story.phase = "review"</action>
  </check>

  <!-- ── Phase: review ── -->
  <check if="story.phase == 'review'">
    <action>Capture review_pane output. Check for:
      - Review completed with PASS / no critical issues →
        <!-- ═══ GATE G8 (per story): review → auto_qa ═══ -->
        <gate id="G8" level="self-check" per-story="true" label="Code review PASS">
          <assert verify="review pane 输出包含 PASS 或 'no critical issues'" fail="Review 未通过 — 进入 fix cycle"/>
          <on_pass>更新 gate-state.yaml story_gates.{{story_id}}.G8 = PASS</on_pass>
        </gate>
        set story.phase = "auto_qa_pending"
      - Review completed with issues found → save findings, transition to "fixing"
      - Still running → continue polling</action>
  </check>

  <!-- ── Phase: fixing (review→fix loop) ── -->
  <check if="story.phase == 'fixing'">
    <action>Capture dev_pane output. Check for:
      - Fix completed (Claude idle) → set story.phase = "pending_review" (will trigger new review)
      - Still running → continue polling</action>
  </check>

  <!-- ── Phase: auto_qa_pending ── -->
  <check if="story.phase == 'auto_qa_pending'">
    <action>Skip — waiting for automated QA gate (handled in step 6)</action>
  </check>

  <!-- ── Phase: uat_waiting ── -->
  <check if="story.phase == 'uat_waiting'">
    <action>Skip — waiting for user (handled in step 6)</action>
  </check>

  <!-- ── Loop control ── -->
  <check if="all stories are in auto_qa_pending, uat_waiting, or done">
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
  <action>Open NEW tmux sub-pane with codex: `tmux split-window -h "cd ../BidWise-story-{{story_id}} && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"`</action>
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
    <action>Open new pane with codex: `tmux split-window -h "cd ../BidWise-story-{{story_id}} && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"`</action>
    <action>Wait for codex ready</action>
    <action>Send: "请查看 review-findings-cycle-{{N}}.md 中的问题并修复所有 must-fix 项。这是第 {{N}} 轮 review，之前的修复未能解决问题，请使用系统性调试方法分析根因"</action>
    <action>Update story.dev_pane = new pane_id</action>
  </check>

  <action>Set story.phase = "fixing"</action>
  <goto step="4">Return to monitoring loop</goto>
</step>


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- STEP 6: AUTOMATED QA GATE + UAT NOTIFICATION                      -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<step n="6" goal="Run automated QA gate, then notify user for focused UAT">

  <critical>人工 UAT 之前先跑自动化 QA。目标不是取代 UAT，而是先让模型完成可重复的冒烟、Story 级关键路径和失败证据收集，让人类把时间花在业务正确性、视觉细节和真实使用判断上。</critical>

  <action>Create directory if missing: `_bmad-output/implementation-artifacts/tests/`</action>

  <action>For each story whose phase is `auto_qa_pending`, sequentially execute:</action>
  <action>
    1. Open NEW tmux sub-pane on the story worktree with codex
    2. Check whether story-scoped Playwright tests exist under `tests/e2e/stories/story-{{story_id}}*.spec.ts`
    3. If missing or clearly stale, instruct the pane to create/update tests following current project conventions:
       - keep global smoke in `tests/e2e/flows/`
       - store story-scoped tests in `tests/e2e/stories/story-{{story_id}}.spec.ts`
       - use stable selectors and semantic locators
       - prefer tags in titles like `@story-{{story_id}}`
       - tag critical path tests as `@p0`, important flows as `@p1`
       - map each acceptance criterion to at least one automated check or mark it `manual-only`
       - avoid duplicate coverage: keep E2E for critical path, push lower-level variations to API/unit/component tests when applicable
       - if fixtures/factories exist under `tests/support/`, reuse them; if a non-trivial UI story needs repeated setup, create minimal fixtures/factories instead of hardcoding data in every test
       - if `/bmad-qa-generate-e2e-tests` is available, it may be used; otherwise implement directly
    4. Run automated QA commands:
       - `pnpm test:e2e:smoke`
       - `pnpm exec playwright test -g @story-{{story_id}}` for UI / cross-layer stories
       - pure backend stories may skip story-scoped Playwright but must still record `E2E=N/A`
    5. Save a markdown summary to `_bmad-output/implementation-artifacts/tests/auto-qa-story-{{story_id}}.md` including:
       - commands executed
       - PASS / FAIL
       - acceptance-criteria coverage matrix (`AC -> automated/manual-only/not-covered`)
       - generated test inventory with `@p0/@p1` tags
       - failing tests or skipped rationale
       - report paths: `playwright-report/`, `test-results/playwright/`
       - recommended manual UAT focus points
       - if UI story: prototype manifest entry used and whether runtime UI was visually compared against exported reference PNGs
    6. Close the QA pane</action>

  <check if="any story fails automated QA">
    <action>For each failed story:
      - write or update `../BidWise-story-{{story_id}}/auto-qa-findings-cycle-{{N}}.md`
      - send the failure summary and artifact paths to the story's dev pane
      - set story.phase = "fixing"</action>
    <output level="L1">⚠️ 自动化 QA 发现阻塞问题，已回流到修复环节。修复完成后会重新进入 review → auto QA。</output>
    <goto step="4">Return to monitoring loop</goto>
  </check>

  <!-- ═══ GATE G9 (per story): auto_qa → uat ═══ -->
  <gate id="G9" level="self-check" per-story="true" label="Auto QA 报告存在且 PASS">
    <assert cmd="test -f _bmad-output/implementation-artifacts/tests/auto-qa-story-{{story_id}}.md" fail="HALT: Auto QA 报告不存在"/>
    <assert cmd="grep -i 'PASS' _bmad-output/implementation-artifacts/tests/auto-qa-story-{{story_id}}.md" fail="HALT: Auto QA 报告未显示 PASS"/>
    <on_pass>更新 gate-state.yaml story_gates.{{story_id}}.G9 = PASS</on_pass>
  </gate>

  <action>For each story that passes automated QA, set story.phase = "uat_waiting"</action>

  <output>🧪 **UAT 验收通知**

  以下 Story 已完成开发、Code Review 和自动化 QA，请进行人工 UAT 验收：

  {{uat_ready_stories_with_worktree_paths}}

  **先看自动化结果，再做人工验收:**
  1. `cd ../BidWise-story-{{story_id}}` 进入对应 worktree
  2. 查看 `_bmad-output/implementation-artifacts/tests/auto-qa-story-{{story_id}}.md`
  3. 如需看失败细节，打开 `playwright-report/` 或检查 `test-results/playwright/` 下的 trace / screenshot / video
  4. `pnpm test:e2e:headed` 或 `pnpm dev` 启动应用，做人工 UAT
  5. 人工 UAT 重点关注自动化不擅长的问题：业务判断、视觉细节、中文文案、真实操作流畅度、异常恢复体验
  6. 如有需要，再运行 `pnpm test` 做全量确认

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

  <!-- ═══ GATE G10 (per story): UAT → merge (🏛️ 御史台) ═══ -->
  <gate id="G10" level="inspector" per-story="true" label="UAT 确认 + 前置 gate 链完整 — 独立审查">
    <assert verify="用户明确回复 '✅ 通过' for {{story_id}}" fail="HALT: 用户未确认 UAT"/>
    <assert verify="gate-state.yaml 中 story_gates.{{story_id}} 的 G7/G8/G9 全部 PASS" fail="HALT: 前置 gate 链不完整"/>
    <inspector>
      <action>写入 gate-report-G10-{{story_id}}.md（通过子窗格）</action>
      <action>向驻场监察官发送审查请求：
        `tmux send-keys -t {inspector_pane} "请审查 Gate G10（Story {{story_id}}）。读取 gate-report-G10-{{story_id}}.md，然后独立验证：1) 用户 UAT 确认 2) G7→G8→G9 全 PASS 3) review PASS 4) auto-qa 报告 PASS 5) worktree 干净。输出 APPROVE 或 REJECT。" Enter`</action>
      <action>轮询 inspector_pane 直到看到 APPROVE 或 REJECT</action>
      <on_reject>HALT: "御史台驳回 G10 for {{story_id}} — {{reject_reason}}"</on_reject>
    </inspector>
    <on_pass>更新 gate-state.yaml story_gates.{{story_id}}.G10 = PASS (verified_by: inspector)</on_pass>
  </gate>

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
  <check if="more batch candidates exist">
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

  <action>Open tmux sub-pane with codex on main: `tmux split-window -h "cd {project_root} && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"`</action>
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
  <!-- ═══ GATE G11 (per story): regression → cleanup ═══ -->
  <gate id="G11" level="self-check" per-story="true" label="三层回归同一轮全部通过">
    <assert verify="L1 + L2 + L3 在同一 regression_cycle 中全部通过" fail="HALT: 回归未在同一轮全部通过"/>
    <on_pass>更新 gate-state.yaml story_gates.{{story_id}}.G11 = PASS</on_pass>
  </gate>

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
  <check if="more batch candidates exist">
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
| Automated QA | 20 min | Warn user |
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
tmux split-window -h "cd /project/path && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"
tmux split-window -v "cd /project/path && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"

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
    phase: "dev" | "pending_review" | "review" | "auto_qa_pending" | "fixing" | "uat_waiting" | "merging" | "regression" | "done",
    dev_pane: "%3",
    review_pane: "%5" | null,
    qa_pane: "%6" | null,
    review_cycle: 0,        // max 3
    validation_cycle: 0,    // max 3
    auto_qa_cycle: 0,       // max 3 if needed
    merge_priority: 1,      // lower = merge first
    prototype_manifest: "_bmad-output/implementation-artifacts/prototypes/prototype-manifest.yaml",
    prototype_pen: "_bmad-output/implementation-artifacts/prototypes/story-{{story_id}}.pen" | null,
    prototype_exports_dir: "_bmad-output/implementation-artifacts/prototypes/story-{{story_id}}/" | null,
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
