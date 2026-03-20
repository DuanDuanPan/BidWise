# Master Control — 并行开发指挥官

**Goal:** 作为指挥官自动编排多个 Story 的完整生命周期，通过 tmux 子窗格派发所有具体工作，实现并行开发。

**Your Role:** 你是指挥官（master control），负责编排和监控。
- 绝不直接编辑文件、跑构建、执行 skill — 一切通过 tmux 子窗格派发
- 你**可以读取文件**（cat/grep/read）来获取信息和做决策，但**不可写入/执行**
- 子窗格使用 `tmux split-window`（禁止 `new-window`），与你并排显示
- 子窗格启动 claude 时**必须**加 `--dangerously-skip-permissions`
- 子窗格启动 codex 时**必须**加 `--dangerously-bypass-approvals-and-sandbox`（tmux 子窗格不加载 shell alias，必须显式传 flag）

**tmux 标准布局：**

```
┌──────────────────────┬─────────────┐
│   Commander (指挥官)  │  Inspector  │
│    {commander_pane}  │  (监察官)    │
├──────┬───────┬───────┴──────┬──────┤
│ Util │ Pane1 │    Pane2     │Pane3 │
│{util}│       │              │      │
└──────┴───────┴──────────────┴──────┘
```

- **Inspector（commander 右侧，等高）：** 从 commander 水平分割 `-h`，与 commander 同行
- **Utility + 动态窗格（下方全宽）：** 先从 commander 垂直分割 `-v` 创建 utility（此时 utility 在 commander+inspector 下方全宽），再横向 `-h` 扩展更多动态窗格
- 动态窗格数量由指挥官根据并行需求决定

**分割命令模板：**
```bash
# Step 1: Inspector（commander 右侧，等高）
tmux split-window -t {commander_pane} -h -l 40% "cd {project_root} && codex ..."

# Step 2: Utility（commander 下方，自动占全宽）
tmux split-window -t {commander_pane} -v -l 30% "zsh"

# Step 3+: 动态窗格（从 utility 横向扩展）
tmux split-window -t {utility_pane} -h "cd {path} && claude --dangerously-skip-permissions"
```

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
| **Create Story** | `bmad-create-story` | 创建 story 文件 |
| **Prototype** | Pencil MCP tools | Story 绑定 `.pen` 原型 + 参考 PNG + manifest 索引 |
| **Validate** | _(codex 直接验证，无需 skill)_ | AC/架构/PRD 对齐检查 |
| **Dev** | `bmad-dev-story` | Story 实现 |
| **Dev (UI Story)** | `bmad-dev-story` + `frontend-design` 或 `ui-ux-pro-max` | UI 实现需额外加载设计 skill |
| **Code Review** | `bmad-code-review` | 对抗性代码审查 |
| **Automated QA (optional skill)** | `bmad-qa-generate-e2e-tests` | 生成/更新 Story 级自动化测试，辅助 UAT |
| **Bug Fix (一般)** | `debugging-strategies` | 系统性调试定位 |
| **Bug Fix (顽固)** | `debugging-strategies` | codex 接手顽固 bug |
| **Regression L2/L3** | _(codex 直接验证，无需 skill)_ | AC 回归 + 集成验证 |

**可选增强 Skill（按需使用）：**

| 场景 | 可选 Skill | 何时使用 |
|------|-----------|---------|
| UI 组件开发 | `tailwind-design-system` | 涉及设计系统/组件库 |
| React 性能 | `react-best-practices` | React 组件优化 |
| 状态管理 | `react-state-management` | Zustand store 设计 |
| 架构模式 | `architecture-patterns` | 后端架构实现 |
| 无障碍/UX 审查 | `web-design-guidelines` | UI story 的 code review |
| 自动化测试补强 | `bmad-qa-generate-e2e-tests` | 缺少 Story 级 E2E 覆盖时，进入 UAT 前补齐 |

### 子窗格任务包（Task Packet）

指挥官向任何 claude/codex 子窗格派发任务时，必须发送一个**紧凑、结构化、固定字段顺序**的任务包。不要只发 skill 名，也不要发长篇散文式背景。

**固定 4 段：**

1. `Skill:` 或 `Role:` — 明确本次要执行的 skill / 角色  
2. `Goal:` — 本次唯一目标  
3. `Inputs:` — 绝对路径、分支、story id、worktree 等可验证输入  
4. `Constraints:` + `Expected Output:` — 边界条件和结果格式

**规则：**
- skill 名直接写，如 `bmad-code-review`，不要加 `/`
- 所有文件路径优先使用绝对路径
- 一次只派发一个目标，避免在同一消息里混入多个阶段
- 期望输出必须带固定哨兵，便于 `capture-pane` 识别，例如 `MC_DONE REVIEW 1-5 PASS`
- 除非任务本身要求对话式澄清，否则在 `Constraints` 中写明”仅在输入无效时提问”

**子窗格通讯三层协议（signal → full → log）：**

指挥官与子窗格之间的输出读取采用分层策略，解决 capture-pane 受窗格尺寸限制的问题：

| 层级 | 方法 | 用途 | 何时使用 |
|------|------|------|---------|
| **Signal** | `tmux capture-pane -t {pane_id} -p -S -5` | 检测 MC_DONE 哨兵（仅状态） | 轮询循环中的快速检查 |
| **Full** | `tmux capture-pane -t {pane_id} -p -S - -E -` | 获取完整 scrollback | 检测到 MC_DONE 后读取完整结果 |
| **Log** | 读取 `{mc_log_dir}/pane-{pane_id}.log` | 永久审计日志，不受 scrollback 限制 | 结果需要审计/回溯时 |

**pipe-pane 日志自动设置：** 每个子窗格创建后，立即执行：
```bash
tmux pipe-pane -t {pane_id} -o 'cat >> {mc_log_dir}/pane-{pane_id}.log'
```
此操作在 utility pane 或指挥官 shell 中执行（不影响子窗格内部状态）。

**推荐模板：**

```text
Skill: bmad-code-review
Goal: Review story 1-5 implementation against main
Inputs:
- story id: 1-5
- worktree: /abs/path/to/BidWise-story-1-5
- review mode: branch diff vs main
- spec file: /abs/path/to/story-file.md
Constraints:
- fresh context
- do not modify files
- ask only if an input path or diff baseline is invalid
Expected Output:
- MC_DONE REVIEW 1-5 PASS|FAIL
- findings grouped as must-fix / should-fix / optional
```

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
6. **Gate FAIL 后必须修复并重试** — 任何 gate assert 失败后，指挥官修复问题，然后重新执行整个 gate（不是只重试失败的 assert）。gate-state.yaml 中记录重试次数。

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
tmux split-window -t {current_session} -v "cd {project_root} && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"

驻场令（首条消息）：
"你是本次 batch 的独立监察官（御史台）。你将驻场监督整个 batch 生命周期。

**当前 batch 上下文（指挥官在发送驻场令时填入实际值）：**
- batch_id: {batch_id}
- batch_stories: {batch_stories}
- current_phase: {current_phase}（如 Step 2a create / Step 2b prototype / Step 3 dev 等）

**授权凭据规则：**
- `gate-state.yaml` 中 PASS 的 gate 条目 = 该阶段之前的 main 变更已被授权
- batch 准备阶段（Step 2）的 main 本地 commit 在 G5 inspector 审查前不要求已 push
- 当前阶段的工作产物（如 prototype 阶段的 .pen 文件）允许以 untracked 状态存在
- 超出当前 batch_stories 范围的 main 变更 → VIOLATION

你的三项职责：
1. **Gate 审查（被动）** — 收到"请审查 Gate G{N}"时，读取 _bmad-output/implementation-artifacts/gate-report-G{N}.md，然后独立验证磁盘/git 状态，输出 APPROVE 或 REJECT
2. **即时基线审计** — 确认就绪后，立即执行一次初始审计：检查 git status、sprint-status.yaml、gate-state.yaml（如存在），输出 BASELINE AUDIT: COMPLIANT 或 VIOLATION
3. **主动巡查（自主）** — 你不需要等待指挥官指令。在空闲时（无 Gate 审查任务），你应当主动定期执行巡查。巡查内容：
   - gate-state.yaml 无间隙（已通过的 gate 按顺序连续）
   - 无未授权的 main 分支变更（git log 未出现非 batch 相关 commit）
   - 活跃 tmux panes 与当前阶段一致
   - 工作流顺序合规（未跳过 gate）
   每次巡查输出 PATROL: COMPLIANT 或 PATROL: VIOLATION: {details}

你的原则：
- 不信任指挥官的文字描述，只信任磁盘文件和 git 状态
- 每次审查都独立读取实际状态
- 发现违规必须立即输出 VIOLATION，不做妥协
- 你不参与任何执行工作

请确认就绪，输出 'INSPECTOR READY' 后立即执行基线审计。"
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

**主动巡查协议（自主 + 指挥官触发双轨）：**

监察官具备两种巡查触发模式：

1. **自主巡查（驻场令已授权）：** 监察官在空闲时（无 Gate 审查任务）应自主执行巡查，无需等待指挥官指令。驻场令中已明确授权此行为。监察官输出 `PATROL: COMPLIANT` 或 `PATROL: VIOLATION: {details}`。

2. **指挥官触发巡查（补充）：** 指挥官在 Step 4 监控循环中，每 **3 轮轮询** 额外向监察官发送一次主动监察请求（作为双重保障，而非唯一触发源）：

```
tmux send-keys -t {inspector_pane} "请执行主动监察。当前状态：
- 活跃 story: {active_stories_and_phases}
- 最近通过的 gate: {last_gate}
- 活跃 tmux panes: {pane_list}
请检查：1) gate-state.yaml 无间隙 2) 活跃 pane 与 story phase 一致 3) 无未授权的 main 分支变更 4) 工作流顺序合规" Enter
```

**巡查输出约定：**
- 被动 Gate 审查 → `APPROVE` / `REJECT`
- 自主巡查 → `PATROL: COMPLIANT` / `PATROL: VIOLATION: {details}`
- 指挥官触发巡查 → `COMPLIANT` / `VIOLATION: {details}`
- 即时基线审计 → `BASELINE AUDIT: COMPLIANT` / `BASELINE AUDIT: VIOLATION: {details}`

若任何输出包含 `VIOLATION` → 指挥官按 HALT 级别处理，输出违规详情给用户。

**监察官 pane ID 追踪：** `inspector_pane` 记录在 `story_states` 同级的 `inspector` 字段中。

**监察官互斥锁（单通道竞争解决）：**

监察官同一时刻只能处理一个请求。指挥官维护 `inspector_state`：

```
inspector_state: idle | busy_gate | busy_audit
```

**发送前必须检查：**

| 要发送的请求 | inspector_state == idle | busy_audit | busy_gate |
|-------------|----------------------|------------|-----------|
| **Gate 审查**（高优先级，阻塞） | 直接发送 → set busy_gate | 等待审计完成 → 再发送 | N/A（不会并发） |
| **主动监察**（低优先级，可跳过） | 直接发送 → set busy_audit | **跳过本轮** | **跳过本轮** |

**检查 inspector 是否空闲：** `tmux capture-pane -t {inspector_pane} -p | tail -3` 看是否有 codex 空闲提示符。

**原则：Gate 审查不可跳过（关键路径），主动监察可跳过（弹性巡查）。**

### 禁忌清单（INCIDENT-DRIVEN FORBIDDEN LIST）

**目的：** 从真实执行偏差中提炼的具体禁令。每条来自实际事件，不是理论推演。每次 batch 结束后回顾偏差，更新此清单。

**读取规则：** 指挥官在 INITIALIZATION 阶段 MUST 读取此清单。执行过程中如果即将采取与禁忌清单匹配的行动，MUST 立即停止并采用正确做法。

| # | 禁忌 | 正确做法 | 来源事件 |
|---|------|---------|---------|
| F1 | **禁止逐 story 做完整闭环**（create→prototype→validate→commit 单个 story 后才处理下一个） | 分阶段批处理：先批量 create → 再批量 prototype → 再统一 validate → 单次 batch commit | 2026-03-19: Story 1-5 和 2-1 分别独立走完流程，导致 2-1 的最终修复跳过了第 3 轮验证 |
| F2 | **禁止逐 story 单独 commit** | 全 batch 一次 commit（Step 2d），commit message 包含所有 story ID | 2026-03-19: 1-5 提交 8d619d8，2-1 另外提交 f0190a9 |
| F3 | **禁止直接修改 prototype.pen（母版）** | 派生到 `story-{id}.pen`，prototype.pen 只读 | 2026-03-19: Story 1-5 原型直接在 prototype.pen 上添加 frame |
| F4 | **禁止验证 FAIL 修复后跳过重新验证** | 每次修复后必须重新提交 codex 验证，直到 PASS 才能进入下一步 | 2026-03-19: Story 2-1 第 2 轮 codex FAIL → claude 修复 → 直接 commit，跳过第 3 轮验证 |
| F5 | **禁止在 L0 转换时询问用户"继续？"** | L0 级别直接执行，不通知不等待 | 2026-03-19: Step 2→3 转换时输出"继续？"等待确认 |
| F6 | **禁止依赖 `bmad-create-story` 自动选 story** | 必须在指令中明确指定 story ID（如"请创建 Story 2-1"） | 2026-03-19: 未指定 ID，skill 自动选了 1-6 而非 batch 中的 2-1 |
| F7 | **禁止在独立 tmux session 创建子窗格** | 子窗格必须在用户当前 attach 的 session 中 split-window | 2026-03-19: 在 "mc" session 创建 dev pane，用户在 session "1"，看不到窗格 |
| F8 | **禁止指挥官在自身上下文执行构建/测试/写文件/git commit** | 所有构建、测试、文件写入、git 操作必须通过 tmux 子窗格派发；指挥官上下文仅允许读取文件和 tmux 管理命令 | 2026-03-20: 指挥官直接执行 pnpm test:unit、electron-builder rebuild、Write 工具创建文件、git commit |

| F9 | **禁止用 `capture-pane -S -N`（固定行数）读取子窗格完整结果** | 检测哨兵用 `-S -5`，读完整结果用 `-S - -E -`（全量 scrollback）或读 pipe-pane 日志文件。固定行数在小窗格下会截断 findings | 2026-03-20: cycle 3 验证 codex 输出 FAIL 但 findings 被截断，指挥官误判为"无可操作 findings" |

<!-- FORBIDDEN_LIST_END — 新条目追加到此标记之前 -->

**自动更新机制：**

三种触发源会产生新禁忌条目：

| 触发源 | 时机 | 指挥官动作 |
|--------|------|-----------|
| **Inspector VIOLATION** | 主动监察或 gate 审查时发现 | 立即生成条目，通过子窗格追加 |
| **Gate FAIL** | 任何 gate assert 失败 | 记录到 incident log，batch 结束时批量转化 |
| **用户纠正** | 用户指出执行偏差 | 立即生成条目 |

**实时更新流程（Inspector VIOLATION 或用户纠正）：**

```
1. 监察官输出 VIOLATION 或用户纠正 → 指挥官提取结构化信息：
   - what: 做了什么
   - why_wrong: 为什么错
   - correct: 正确做法
   - incident: 来源事件（日期+描述）

2. 指挥官生成 forbidden entry 并通过子窗格写入：
   tmux send-keys -t {utility_pane} "sed -i '' '/FORBIDDEN_LIST_END/i\\
   | F{N} | **禁止 {what}** | {correct} | {incident} |' .claude/skills/bmad-master-control/workflow.md" Enter

3. 同时通知监察官新增的禁忌条目，监察官将其纳入后续审查范围
```

**批量更新流程（Step 9 cleanup 后）：**

```
1. 读取 gate-state.yaml 中所有 FAIL 记录（含已修复的）
2. 对每个 FAIL→fix→retry 模式，判断是否属于新型偏差（不与现有 F1-F{N} 重复）
3. 新型偏差 → 生成 forbidden entry → 子窗格追加
4. 已被 Gate 物理阻止的旧条目 → 标记 [GATE-COVERED] 但不删除
```

**禁忌编号规则：** 新条目编号递增（F8, F9, ...），不修改已有编号。已有条目的内容可以更新（如补充新的来源事件），但编号不变。

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

### Environment Verification

<action>Verify tmux environment: `[ -n "$TMUX" ] || echo "NOT_IN_TMUX"`</action>
<check if="not in tmux" level="L3">
  <output>🚫 指挥官必须在 tmux 会话中运行</output>
  <action>HALT: "Not running inside tmux"</action>
</check>

<action>Record current tmux session: `tmux display-message -p '#{session_name}'`</action>
<action>Set current_session = result. All sub-pane split-window commands MUST target this session.</action>
<action>Generate commander instance ID: `mc_instance = "{current_session}-$(date +%s)"`。此 ID 用于日志目录隔离，防止多指挥官冲突。</action>
<action>Set mc_log_dir = "/tmp/mc-logs/{mc_instance}/"</action>
<action>创建日志目录（通过 shell 或后续 utility pane）：`mkdir -p {mc_log_dir}`</action>

<action>Verify codex available: `which codex`</action>
<check if="codex not found" level="L3">
  <output>🚫 codex 命令不可用</output>
  <action>HALT: "codex binary not found"</action>
</check>

<action>Verify worktree script: `test -x ./scripts/worktree.sh`</action>
<check if="worktree.sh missing or not executable" level="L3">
  <output>🚫 worktree.sh 不存在或不可执行</output>
  <action>HALT: "worktree.sh not found or not executable"</action>
</check>

<action>Verify git working tree clean: `git status --short`</action>
<check if="working tree not clean" level="L2">
  <output>⚠️ main 分支有未提交变更：{{dirty_files}}。建议先提交或 stash。</output>
  <ask>继续（可能影响后续操作）？还是先处理未提交变更？</ask>
</check>

<action>Check node_modules exists: `test -d node_modules`</action>
<check if="node_modules missing" level="L1">
  <output>⚠️ node_modules 不存在，建议先运行 `pnpm install`</output>
</check>

<action>Check Claude Max usage if visible in sub-pane HUD: look for usage percentage</action>
<check if="usage > 80%" level="L1">
  <output>⚠️ Claude Max 用量已超过 80%，本 batch 可能因限流中断</output>
</check>

### Context Loading

1. Read `{implementation_artifacts}/sprint-status.yaml` → current story statuses
2. Read `{planning_artifacts}/epics.md` → dependency graph between stories
3. Read `{planning_artifacts}/architecture.md` → module boundaries (for conflict assessment)

### Forbidden List Loading (禁忌清单加载)

<action>读取 PHASE GATE PROTOCOL 章节中的"禁忌清单"，逐条确认已理解</action>
<critical>禁忌清单中的每一条都来自真实执行偏差。执行过程中如果即将采取与任何条目匹配的行动，必须立即停止并采用"正确做法"列。</critical>

### Utility Pane Initialization

<action>创建 utility pane（普通 shell，用于写 gate-state、gate-report、UAT 结果等文件）：
  `tmux split-window -t {current_session} -v "cd {project_root} && zsh"`</action>
<action>等待 shell prompt（`%` 或 `$`）出现</action>
<action>记录 utility_pane = {pane_id}</action>

### Inspector Initialization (御史台启动)

<action>创建监察官窗格（与指挥官并排）：
  `tmux split-window -t {current_session} -v "cd {project_root} && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"`</action>
<action>等待 codex 就绪，发送驻场令（见 PHASE GATE PROTOCOL 中的"监察官协作机制"）</action>
<action>等待监察官确认就绪：capture-pane 检查输出包含 "INSPECTOR READY"</action>
<action>等待监察官执行即时基线审计：capture-pane 检查输出包含 "BASELINE AUDIT: COMPLIANT" 或 "BASELINE AUDIT: VIOLATION"</action>
<check if="BASELINE AUDIT: VIOLATION">
  <output level="L2">⚠️ 监察官基线审计发现违规：{{violation_details}}</output>
  <ask>处理违规后继续？</ask>
</check>
<action>记录 inspector_pane = {pane_id}</action>
<action>Set inspector_state = idle</action>

<check if="codex 启动失败或不就绪" level="L3">
  <output>🚫 监察官启动失败 — 无法建立独立监督机制</output>
  <action>HALT: "Inspector initialization failed"</action>
</check>

<output level="L1">🏛️ 御史台就绪 — 监察官已驻场（pane {{inspector_pane}}），基线审计 COMPLIANT，自主巡查已启动</output>

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
  <action>For each story key in sprint-status (e.g. `1-5-project-crud-kanban`), derive and cache:
    - `story_key` = exact sprint-status key
    - `story_id` = first two numeric segments joined by `-` (e.g. `1-5`)
    - `story_slug` = remainder after `story_id`</action>
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

  <action>为本 batch 初始化 `story_registry[story_id]`：
    - `story_key` = sprint-status 中的完整 key
    - `story_id` = 短 id（如 `1-5`）
    - `story_file_rel` / `story_file_main` = 通过以下顺序解析：
      1. `_bmad-output/implementation-artifacts/story-{{story_id}}.md`
      2. `_bmad-output/implementation-artifacts/{{story_key}}.md`
      3. 在 `_bmad-output/implementation-artifacts/` 下查找唯一匹配 `*{{story_id}}*.md` 且排除 `*validation*`
    - `story_file_rel` 对 backlog story 初始可为空，待 Step 2a 创建后回填
    - `is_ui` = true/false
    解析出的路径必须保存，后续步骤禁止再手写推导 story 文件名。</action>

  <action>Partition the selected batch:
    - `stories_to_create` = batch 中状态为 `backlog` 的 story
    - `stories_to_reuse` = batch 中状态为 `ready-for-dev` 的 story
    - `ui_stories` = batch 中涉及 UI/interaction 的 story
    - `backend_only_stories` = 纯后端/Enabler story</action>

  <!-- ── 2a: Create missing story files (backlog only) ── -->
  <action>For each story in `stories_to_create`, sequentially open a claude sub-pane and send a task packet:
    `Skill: bmad-create-story`
    `Goal: Create the missing story file for the explicitly assigned backlog story`
    `Inputs:`
    `- story id: {{story_id}}`
    `- story key: {{story_key}}`
    `- project root: {project_root}`
    `Constraints:`
    `- use only this explicit story target; do not auto-select another backlog story`
    `- update sprint tracking as required by the skill`
    `Expected Output:`
    `- MC_DONE CREATE_STORY {{story_id}}`
    `- story_file_rel: <resolved relative path>`
    创建完成后，立即按 canonical resolution 规则回填 `story_registry[story_id].story_file_rel/story_file_main`。
    Reason: create-story is interactive and must remain minimally serial on main.
    After each story file is created, close the pane and continue to the next story.
    Do NOT validate/commit per story at this stage.</action>

  <!-- ═══ GATE G2: create → prototype ═══ -->
  <gate id="G2" level="self-check" label="所有 story 文件已创建">
    <assert foreach="batch_stories" verify="story_registry[story_id].story_file_main 非空" fail="HALT: story {{story_id}} 未解析出 canonical story file"/>
    <assert foreach="batch_stories" cmd="test -f {{story_registry[story_id].story_file_main}}" fail="HALT: story file 不存在 — {{story_id}}"/>
    <on_pass>更新 gate-state.yaml 记录 G2 PASS</on_pass>
  </gate>

  <!-- ── 2b: Add prototypes only where needed ── -->
  <critical>`prototype.pen` 是只读的项目级标准母版；所有 story 原型必须派生到各自的 `story-{{story_id}}.pen`。禁止多个 Story 并行编辑同一个工作 `.pen`。</critical>
  <action>For each story in `ui_stories`, check whether current batch artifacts already include a usable prototype for the current story scope.</action>
  <check if="UI story lacks current prototype artifact">
    <critical>Pencil MCP 没有显式 save-as 工具。`open_document("new")` 会创建临时 `pencil-new.pen`，设计内容无法保存到目标路径。
    正确流程：先在磁盘创建目标 .pen 文件，再用 `open_document` 打开它，这样 Pencil MCP 的自动保存会写回同一路径。</critical>

    <action>**Pre-step（指挥官通过 utility_pane 执行）：** 在磁盘上创建目标 .pen 文件
      ```bash
      # 从母版复制，创建 story-bound .pen（Pencil MCP 要求 open_document 接收已存在的文件路径）
      cp {project_root}/_bmad-output/implementation-artifacts/prototypes/prototype.pen \
         {project_root}/_bmad-output/implementation-artifacts/prototypes/story-{{story_id}}.pen
      # 创建 PNG 导出目录
      mkdir -p {project_root}/_bmad-output/implementation-artifacts/prototypes/story-{{story_id}}/
      ```
    </action>

    <action>Open claude sub-pane and send Task Packet:
      ```text
      Skill: Pencil MCP tools
      Goal: Design story-bound prototype for Story {{story_id}}
      Inputs:
      - story id: {{story_id}}
      - story file: {{story_registry[story_id].story_file_main}}
      - target .pen (ALREADY ON DISK, open this): {project_root}/_bmad-output/implementation-artifacts/prototypes/story-{{story_id}}.pen
      - style baselines:
        - {project_root}/_bmad-output/planning-artifacts/ux-design-specification.md
        - {project_root}/_bmad-output/implementation-artifacts/1-4-ui-framework-design-system.md
        - {project_root}/_bmad-output/implementation-artifacts/prototypes/story-1-4-*.png
      - PNG export dir: {project_root}/_bmad-output/implementation-artifacts/prototypes/story-{{story_id}}/
      - manifest: {project_root}/_bmad-output/implementation-artifacts/prototypes/prototype-manifest.yaml
      Constraints:
      - CRITICAL: 使用 open_document 打开目标 .pen 文件（已从母版复制到磁盘），不要用 open_document("new")
      - 打开后用 batch_design 清除母版中不需要的内容，再创建 story 专属 frame
      - batch_design 和 export_nodes 调用时始终传 filePath 参数指向目标 .pen
      - frame 名称前缀 "Story {{story_id}} —"
      - 设计完成后用 export_nodes(filePath=...) 导出 PNG
      - 更新 prototype-manifest.yaml
      - 最后用 ls 验证 .pen 文件大小已变化（确认设计内容已写入）
      Expected Output:
      - MC_DONE PROTOTYPE {{story_id}}
      - .pen path, PNG paths, manifest updated
      ```
    </action>

    <action>After the pane finishes, verify prototype persistence on disk:
      - .pen file exists AND size > template size: `ls -la _bmad-output/implementation-artifacts/prototypes/story-{{story_id}}.pen`
      - manifest entry exists: `grep '{{story_id}}' _bmad-output/implementation-artifacts/prototypes/prototype-manifest.yaml`
      - at least one reference PNG: `ls _bmad-output/implementation-artifacts/prototypes/story-{{story_id}}/*.png 2>/dev/null | wc -l`
      - `git status --short` shows expected file creation/modification</action>
    <action if="story-bound prototype, manifest entry, or reference PNG missing">Re-open the prototype pane with the same instructions, then re-check once. If still missing, HALT: "Story-bound prototype contract not fully persisted"</action>
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

  <!-- ── 2c: Validate entire batch before dev (PARALLEL) ── -->
  <critical>Validate 必须使用 codex（不同 LLM 视角），对 batch 中每个 story 执行标准化验证；`ready-for-dev` story 不能重建，但应在进入 Dev 前复核。</critical>
  <critical>**并行验证：** 每个 story 使用独立的 codex pane 同时验证，最大化吞吐量。codex 单实例同时只能处理一个请求，因此并行必须开多个 pane。</critical>
  <action>For each story in the batch, **simultaneously** open a separate codex sub-pane on main:
    `tmux split-window -t {current_session} -h "cd {project_root} && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"`
    Wait for codex ready, then send task packet:
    `Role: story validation`
    `Goal: Validate the prepared story contract before development`
    `Inputs:`
    `- story id: {{story_id}}`
    `- story file: {{story_registry[story_id].story_file_main}}`
    `- checklist: {project_root}/.claude/skills/bmad-create-story/checklist.md`
    `Constraints:`
    `- read the checklist before validating`
    `- do not modify files`
    `Expected Output:`
    `- MC_DONE VALIDATE {{story_id}} PASS|FAIL`
    `- concrete findings`
    Record validate_pane[story_id] = pane_id</action>
  <action>Poll all validate panes in round-robin until every story has returned MC_DONE VALIDATE. Collect PASS/FAIL per story. Close each codex pane after its result is captured.</action>

  <check if="any story in batch fails validation">
    <action>For each failed story, open a claude pane on main and fix the story file / prototype according to the captured findings. Close the pane after each fix.</action>
    <action>Re-validate only the failed stories — again in parallel (one codex pane per failed story).</action>
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
  <action>Open one claude pane for batch commit: `tmux split-window -t {current_session} -h "cd {project_root} && claude --dangerously-skip-permissions"`</action>
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
    <assert foreach="batch_stories" cmd="test -f {{story_registry[story_id].story_file_main}}" fail="HALT: story file 不存在 — {{story_id}}"/>
  <assert cmd="git status --short" expect="空（无未提交文件）" fail="HALT: 工作区有未提交变更"/>
  <!-- 独立监察官审查（使用驻场监察官，非临时创建） -->
  <inspector>
    <check if="inspector_state == busy_audit">
      <action>等待当前主动监察结束，再发送 Gate 审查</action>
      <action>轮询 inspector_pane 直到看到 COMPLIANT 或 VIOLATION</action>
      <check if="当前主动监察结果 == VIOLATION">
        <action>HALT: "主动监察发现违规，必须先处理后才能进入 G5"</action>
      </check>
      <action>Set inspector_state = idle</action>
    </check>
    <action>Set inspector_state = busy_gate</action>
    <action>写入 gate-report-G5.md（通过子窗格），内容为指挥官执行摘要 + 磁盘状态断言</action>
    <action>向驻场监察官发送审查请求：
      `tmux send-keys -t {inspector_pane} "请审查 Gate G5。读取 _bmad-output/implementation-artifacts/gate-report-G5.md，然后独立验证：1) git log -1 确认 batch commit 2) story 文件完整 3) validation 全通过 4) UI story 原型合同 5) git status 干净。输出 APPROVE 或 REJECT + 逐项 PASS/FAIL。" Enter`</action>
    <action>轮询 inspector_pane 直到看到 APPROVE 或 REJECT</action>
    <action>Set inspector_state = idle</action>
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
  <action>For each story in batch, set:
    - `story_registry[story_id].worktree_path = ../BidWise-story-{{story_id}}`
    - `story_registry[story_id].story_file_worktree = ../BidWise-story-{{story_id}}/{{story_registry[story_id].story_file_rel}}`</action>

  <action>For each story, launch a dev sub-pane:
    1. `tmux split-window -t {current_session} -h "cd ../BidWise-story-{{story_id}} && claude --dangerously-skip-permissions"` (alternate -h/-v for layout balance)
    2. Wait for Claude prompt (❯)
    3. Send a task packet:
       `Skill: bmad-dev-story`
       `Goal: Implement the assigned story in this worktree only`
       `Inputs:`
       `- story id: {{story_id}}`
       `- story key: {{story_registry[story_id].story_key}}`
       `- worktree: {{story_registry[story_id].worktree_path}}`
       `- story file: {{story_registry[story_id].story_file_worktree}}`
       `Constraints:`
       `- use the provided story file path; do not auto-discover another ready-for-dev story`
       `- modify files only inside this worktree`
       `- if blocked, HALT explicitly`
       `Expected Output:`
       `- MC_DONE DEV {{story_id}} REVIEW_READY|HALT`
       `- changed files summary`
    4. If UI Story, append UI-specific inputs:
       - `design skill to use: frontend-design`
       - `prototype manifest: {project_root}/_bmad-output/implementation-artifacts/prototypes/prototype-manifest.yaml`
       - `prototype pen: {project_root}/_bmad-output/implementation-artifacts/prototypes/story-{{story_id}}.pen`
       - `reference PNG dir: {project_root}/_bmad-output/implementation-artifacts/prototypes/story-{{story_id}}/`
       - `visual baseline: Story 1.4 design system + ux-design-specification`
    5. Record: story_states[story_id] = { phase: "dev", dev_pane: pane_id, is_ui: true/false }</action>

  <output level="L1">🔨 并行开发已启动 — {{batch_size}} 个 Story 在独立 worktree 中开发中</output>

  <!-- ═══ GATE G6: worktree → monitor ═══ -->
  <gate id="G6" level="self-check" label="Worktree 已创建，dev pane 存活">
    <assert foreach="batch_stories" cmd="test -d ../BidWise-story-{{story_id}}" fail="HALT: worktree 不存在 — story-{{story_id}}"/>
    <assert foreach="batch_stories" verify="story_states[story_id].dev_pane 存在于 tmux list-panes -t {current_session}" fail="HALT: dev pane 未存活 — story-{{story_id}}"/>
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

  <!-- ── Inspector 健康检查 ── -->
  <action>Check inspector pane alive: `tmux list-panes -t {current_session} -F '#{pane_id}' | grep {inspector_pane}`</action>
  <check if="inspector pane not found">
    <output level="L1">⚠️ 监察官窗格已崩溃，正在重建...</output>
    <action>Re-run Inspector Initialization（见 INITIALIZATION 章节）</action>
    <action>发送驻场令，等待 INSPECTOR READY</action>
    <action>Set inspector_state = idle</action>
  </check>

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
      - Review completed with issues found → save findings, goto step 5b for this story
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

  <!-- ── 主动监察触发（每 3 轮轮询） ── -->
  <check if="poll_count % 3 == 0 AND inspector_state == idle">
    <action>Set inspector_state = busy_audit</action>
    <action>发送主动监察请求到 inspector_pane（见 PHASE GATE PROTOCOL "主动监察协议"）</action>
    <action>轮询 inspector_pane 直到看到 COMPLIANT 或 VIOLATION</action>
    <action>Set inspector_state = idle</action>
    <check if="VIOLATION">
      <action>提取违规详情，按 HALT 级别处理</action>
    </check>
  </check>
  <check if="poll_count % 3 == 0 AND inspector_state != idle">
    <action>跳过本轮主动监察 — 监察官正忙（{{inspector_state}}）</action>
  </check>

  <check if="any story still in dev, review, pending_review, or fixing">
    <action>Increment poll_count</action>
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
  <preflight>
    <assert verify="story.phase == pending_review AND G7 PASS for this story" fail="HALT: 不满足进入 code review 的前置条件"/>
  </preflight>
  <critical>Code review 必须在新窗格（fresh context）中执行，避免开发上下文偏见</critical>

  <check if="story.review_cycle >= 3" level="L3">
    <output>🚫 Story {{story_id}} 已经过 3 轮 review 仍未通过</output>
    <action>HALT: "Story {{story_id}} failed code review after 3 cycles"</action>
  </check>

  <action>Increment story.review_cycle</action>
  <critical>Code Review 必须使用 codex（不同 LLM 视角），不能用开发同一 Story 的 claude</critical>
  <!-- skill: bmad-code-review + UI story 额外 web-design-guidelines -->
  <action>Open NEW tmux sub-pane with codex: `tmux split-window -t {current_session} -h "cd ../BidWise-story-{{story_id}} && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"`</action>
  <action>Wait for codex ready</action>
  <action>Send a task packet:
    `Skill: bmad-code-review`
    `Goal: Review the story implementation against main in fresh context`
    `Inputs:`
    `- story id: {{story_id}}`
    `- worktree: {{story_registry[story_id].worktree_path}}`
    `- automation: non-interactive`
    `- review mode: branch diff vs main`
    `- base branch: main`
    `- spec file: {{story_registry[story_id].story_file_worktree}}`
    `Constraints:`
    `- fresh context`
    `- do not modify files`
    `- ask only if a path or diff baseline is invalid`
    `Expected Output:`
    `- MC_DONE REVIEW {{story_id}} PASS|FAIL`
    `- findings grouped as must-fix / should-fix / optional`</action>
  <action>如果是 UI Story，再发送补充审查要求：
    `Skill: web-design-guidelines`
    `Goal: Audit accessibility and UX compliance for the same diff`
    `Inputs:`
    `- story id: {{story_id}}`
    `- review target: same branch diff vs main`
    `Expected Output:`
    `- append UI/UX findings under must-fix / should-fix / optional`</action>
  <action>Record story.review_pane = new pane_id</action>
  <action>Set story.phase = "review"</action>

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

  <!-- 正常修复：claude + debugging-strategies -->
  <check if="dev pane is still alive AND story.review_cycle < 2">
    <action>Send a task packet to dev_pane:
      `Skill: debugging-strategies`
      `Goal: Fix all must-fix review findings for the assigned story`
      `Inputs:`
      `- story id: {{story_id}}`
      `- findings file: ../BidWise-story-{{story_id}}/review-findings-cycle-{{N}}.md`
      `Constraints:`
      `- only modify this story worktree`
      `Expected Output:`
      `- MC_DONE FIX {{story_id}} REVIEW_READY|HALT`</action>
  </check>
  <check if="dev pane has exited AND story.review_cycle < 2">
    <action>Open new pane with claude: `tmux split-window -t {current_session} -h "cd ../BidWise-story-{{story_id}} && claude --dangerously-skip-permissions"`</action>
    <action>Wait for Claude prompt (❯)</action>
    <action>Send a task packet:
      `Skill: debugging-strategies`
      `Goal: Fix all must-fix review findings for the assigned story`
      `Inputs:`
      `- story id: {{story_id}}`
      `- worktree: {{story_registry[story_id].worktree_path}}`
      `- findings file: ../BidWise-story-{{story_id}}/review-findings-cycle-{{N}}.md`
      `Constraints:`
      `- fix only the assigned story worktree`
      `Expected Output:`
      `- MC_DONE FIX {{story_id}} REVIEW_READY|HALT`</action>
    <action>Update story.dev_pane = new pane_id</action>
  </check>

  <!-- 顽固 bug 升级：第 2 轮 review 仍不通过时，切换到 codex + debugging-strategies -->
  <check if="story.review_cycle >= 2">
    <critical>claude 多次修复失败，切换到 codex（不同 LLM 视角）+ debugging-strategies 处理顽固 bug</critical>
    <action>Close existing dev pane if alive</action>
    <action>Open new pane with codex: `tmux split-window -t {current_session} -h "cd ../BidWise-story-{{story_id}} && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"`</action>
    <action>Wait for codex ready</action>
    <action>Send a task packet:
      `Skill: debugging-strategies`
      `Goal: Solve the stubborn review failures with a fresh model perspective`
      `Inputs:`
      `- story id: {{story_id}}`
      `- worktree: {{story_registry[story_id].worktree_path}}`
      `- findings file: ../BidWise-story-{{story_id}}/review-findings-cycle-{{N}}.md`
      `Constraints:`
      `- analyze root cause before editing`
      `- fix only must-fix items first`
      `Expected Output:`
      `- MC_DONE FIX {{story_id}} REVIEW_READY|HALT`</action>
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

  <action>Create directory if missing: `{project_root}/_bmad-output/implementation-artifacts/tests/`</action>

  <action>For each story whose phase is `auto_qa_pending`, sequentially execute:</action>
  <action>
    1. Open NEW tmux sub-pane on the story worktree with codex:
       `tmux split-window -t {current_session} -h "cd ../BidWise-story-{{story_id}} && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"`
    2. Check whether story-scoped Playwright tests exist under `tests/e2e/stories/story-{{story_id}}*.spec.ts`
    3. Send a task packet. If missing or clearly stale, instruct the pane to create/update tests following current project conventions:
       `Skill: bmad-qa-generate-e2e-tests`
       `Goal: Create or refresh story-scoped automated QA, then run it`
       `Inputs:`
       `- story id: {{story_id}}`
       `- worktree: {{story_registry[story_id].worktree_path}}`
       `- story file: {{story_registry[story_id].story_file_worktree}}`
       `- report output: {project_root}/_bmad-output/implementation-artifacts/tests/auto-qa-story-{{story_id}}.md`
       `Constraints:`
       `- reuse existing Playwright conventions`
       `- if no dedicated skill is available, implement directly in the worktree`
       `Expected Output:`
       `- MC_DONE QA {{story_id}} PASS|FAIL`
       `- report path`
       - keep global smoke in `tests/e2e/flows/`
       - store story-scoped tests in `tests/e2e/stories/story-{{story_id}}.spec.ts`
       - use stable selectors and semantic locators
       - prefer tags in titles like `@story-{{story_id}}`
       - tag critical path tests as `@p0`, important flows as `@p1`
       - map each acceptance criterion to at least one automated check or mark it `manual-only`
       - avoid duplicate coverage: keep E2E for critical path, push lower-level variations to API/unit/component tests when applicable
       - if fixtures/factories exist under `tests/support/`, reuse them; if a non-trivial UI story needs repeated setup, create minimal fixtures/factories instead of hardcoding data in every test
    4. Run automated QA commands:
       - `pnpm test:e2e:smoke`
       - `pnpm exec playwright test -g @story-{{story_id}}` for UI / cross-layer stories
       - pure backend stories may skip story-scoped Playwright but must still record `E2E=N/A`
    5. Save a markdown summary to `{project_root}/_bmad-output/implementation-artifacts/tests/auto-qa-story-{{story_id}}.md` including:
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
    <assert cmd="test -f {project_root}/_bmad-output/implementation-artifacts/tests/auto-qa-story-{{story_id}}.md" fail="HALT: Auto QA 报告不存在"/>
    <assert cmd="grep -i 'PASS' {project_root}/_bmad-output/implementation-artifacts/tests/auto-qa-story-{{story_id}}.md" fail="HALT: Auto QA 报告未显示 PASS"/>
    <on_pass>更新 gate-state.yaml story_gates.{{story_id}}.G9 = PASS</on_pass>
  </gate>

  <action>For each story that passes automated QA, set story.phase = "uat_waiting"</action>

  <output>🧪 **UAT 验收通知**

  以下 Story 已完成开发、Code Review 和自动化 QA，请进行人工 UAT 验收：

  {{uat_ready_stories_with_worktree_paths}}

  **先看自动化结果，再做人工验收:**
  1. `cd ../BidWise-story-{{story_id}}` 进入对应 worktree
  2. 查看 `{project_root}/_bmad-output/implementation-artifacts/tests/auto-qa-story-{{story_id}}.md`
  3. 如需看失败细节，打开 `playwright-report/` 或检查 `test-results/playwright/` 下的 trace / screenshot / video
  4. `pnpm test:e2e:headed` 或 `pnpm dev` 启动应用，做人工 UAT
  5. 人工 UAT 重点关注自动化不擅长的问题：业务判断、视觉细节、中文文案、真实操作流畅度、异常恢复体验
  6. 如有需要，再运行 `pnpm test` 做全量确认

  请逐个按固定格式回复，每个 Story 一行：
  `Story {{story_id}}: ✅ PASS`
  或
  `Story {{story_id}}: ❌ FAIL - 原因`</output>

  <action>HALT and wait for user UAT results for each story</action>
</step>


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- STEP 7: PROCESS UAT RESULTS & SEQUENTIAL MERGE                    -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<step n="7" goal="Process UAT results, merge passed stories, handle failures">
  <preflight>
    <assert verify="至少一个 story 的 UAT 结果已收到（通过或不通过）" fail="HALT: 未收到任何 UAT 结果"/>
  </preflight>

  <action>解析用户的 UAT 回复，生成 `uat_results[story_id] = PASS|FAIL + reason`。若任一 `uat_waiting` story 无法从用户回复中解析出明确结果，立即请求用户按固定格式重述该 story 的结果。</action>
  <action>For each parsed story result, 通过 utility_pane 写入：
    `{project_root}/_bmad-output/implementation-artifacts/tests/uat-result-story-{{story_id}}.yaml`
    内容至少包含：
    - `story_id`
    - `story_key`
    - `status: PASS|FAIL`
    - `reason`
    - `recorded_at`
    - `source: user-uat`</action>

  <!-- Handle UAT failures -->
  <check if="any story failed UAT">
    <action>For each failed story: send user's feedback to dev pane as fix instructions</action>
    <action>Set failed stories phase = "fixing", review_cycle = 0 (reset for post-UAT fix)</action>
    <action>Continue processing passed stories (don't block merge for UAT-passed stories)</action>
  </check>

  <!-- ═══ GATE G10 (per story): UAT → merge (🏛️ 御史台) ═══ -->
  <gate id="G10" level="inspector" per-story="true" label="UAT 确认 + 前置 gate 链完整 — 独立审查">
    <assert cmd="test -f {project_root}/_bmad-output/implementation-artifacts/tests/uat-result-story-{{story_id}}.yaml" fail="HALT: UAT 结果文件不存在"/>
    <assert cmd="grep '^status: PASS$' {project_root}/_bmad-output/implementation-artifacts/tests/uat-result-story-{{story_id}}.yaml" fail="HALT: UAT 未通过"/>
    <assert verify="gate-state.yaml 中 story_gates.{{story_id}} 的 G7/G8/G9 全部 PASS" fail="HALT: 前置 gate 链不完整"/>
    <inspector>
      <check if="inspector_state == busy_audit">
        <action>等待当前主动监察结束，再发送 Gate 审查</action>
        <action>轮询 inspector_pane 直到看到 COMPLIANT 或 VIOLATION</action>
        <check if="当前主动监察结果 == VIOLATION">
          <action>HALT: "主动监察发现违规，必须先处理后才能进入 G10"</action>
        </check>
        <action>Set inspector_state = idle</action>
      </check>
      <action>Set inspector_state = busy_gate</action>
      <action>写入 gate-report-G10-{{story_id}}.md（通过子窗格）</action>
      <action>向驻场监察官发送审查请求：
        `tmux send-keys -t {inspector_pane} "请审查 Gate G10（Story {{story_id}}）。读取 gate-report-G10-{{story_id}}.md 和 {project_root}/_bmad-output/implementation-artifacts/tests/uat-result-story-{{story_id}}.yaml，然后独立验证：1) UAT 结果文件为 PASS 2) G7→G8→G9 全 PASS 3) review PASS 4) auto-qa 报告 PASS 5) worktree 干净。输出 APPROVE 或 REJECT。" Enter`</action>
      <action>轮询 inspector_pane 直到看到 APPROVE 或 REJECT</action>
      <action>Set inspector_state = idle</action>
      <on_reject>HALT: "御史台驳回 G10 for {{story_id}} — {{reject_reason}}"</on_reject>
    </inspector>
    <on_pass>更新 gate-state.yaml story_gates.{{story_id}}.G10 = PASS (verified_by: inspector)</on_pass>
  </gate>

  <!-- Sequential merge for passed stories -->
  <check if="stories passed UAT exist">
    <action>Sort merge queue: small/no-UI/enabler stories first</action>
    <action>For each story in merge queue, sequentially:
      0. Set `current_merge_story_id = {{story_id}}`
      0b. Recompute `merged_story_files_list` to include:
          - 当前 batch 中已合并 stories 的 canonical story file
          - `story_registry[story_id].story_file_main`（当前正在 merge 的 story）
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

  <check if="all stories merged and regression passed">
    <goto step="9">Proceed to cleanup</goto>
  </check>
</step>


<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- STEP 8: REGRESSION TEST ON MAIN (after each merge)                -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

<step n="8" goal="Run three-layer regression on main after merge" level="L0">
  <preflight>
    <assert verify="current_merge_story_id 非空" fail="HALT: 未设置当前 merge story"/>
    <assert verify="story_gates.{{current_merge_story_id}}.G10 == PASS" fail="HALT: G10 未通过，不能执行回归"/>
  </preflight>
  <critical>
    三层回归 PASS 的唯一标准：L1 + L2 + L3 在同一次运行中全部通过。
    任何层失败 → 修复 → 从 L1 重新开始（不是从失败层重跑）。
    分次通过不算 PASS（修复可能破坏之前通过的层）。
    整体最多 3 轮（regression_cycle），超出则 HALT。
  </critical>

  <action>Open tmux sub-pane with codex on main: `tmux split-window -t {current_session} -h "cd {project_root} && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"`</action>
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
    "L1 通过。请执行 L2 Story AC 回归：读取以下 story 文件的 AC，逐项验证每个 AC 在 main 上仍然满足（代码/测试/行为）。Story 文件：{{merged_story_files_list}}（必须至少包含 {{current_merge_story_id}} 对应 story file；若是批量回归则覆盖所有已合并 stories）。报告每个 AC 的 PASS/FAIL。"</action>
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
    <on_pass>更新 gate-state.yaml story_gates.{{current_merge_story_id}}.G11 = PASS</on_pass>
  </gate>

  <action>Set story_states[current_merge_story_id].phase = "done"</action>
  <action>Close codex pane</action>
  <output level="L1">✅ Story {{current_merge_story_id}} 三层回归测试同一轮全部通过（第 {{regression_cycle}} 轮），状态已更新为 done</output>
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

  <!-- ── Batch 回顾：更新禁忌清单 ── -->
  <action>读取 gate-state.yaml，统计本 batch 的所有 Gate FAIL 记录（含已修复的）</action>
  <action>对每个 FAIL→fix→retry 模式，判断是否为新型偏差（不与现有 F1-F{N} 重复）</action>
  <check if="发现新型偏差">
    <action>通过子窗格将新禁忌条目追加到 workflow.md 的 FORBIDDEN_LIST_END 标记之前</action>
    <action>通知监察官新增的禁忌条目</action>
    <output level="L1">📝 禁忌清单已更新 — 新增 {{new_count}} 条</output>
  </check>

  <!-- ── Gate State 归档 ── -->
  <action>归档当前 gate-state.yaml：通过子窗格执行
    `mv _bmad-output/implementation-artifacts/gate-state.yaml _bmad-output/implementation-artifacts/gate-state-{{batch_id}}.yaml`</action>

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
3. **Pane exited:** Pane no longer exists in `tmux list-panes -t {current_session}` output — since sub-panes use `tmux split-window "command"` 形式启动，claude/codex 退出后 pane 自动关闭
4. **HALT message:** Text containing "HALT" in the output
5. **Error/crash:** Stack traces, "Error:", "FATAL:", disconnection messages

### Tips for reliable detection

- **Signal check** (快速): `tmux capture-pane -t {pane_id} -p -S -5` — 只看最后 5 行找 MC_DONE
- **Full read** (完整结果): `tmux capture-pane -t {pane_id} -p -S - -E -` — 完整 scrollback，用于提取 findings
- **Log read** (审计): `cat {mc_log_dir}/pane-{pane_id}.log` — 不受 scrollback 限制的永久日志
- Strip ANSI codes for clean matching: `... | sed 's/\x1b\[[0-9;]*m//g'`
- Check if Claude process is still running: `tmux list-panes -t {current_session} -F '#{pane_id} #{pane_current_command}'`
- **重要：** 不要用 `capture-pane -S -N`（固定行数回看），它在小窗格下会丢失内容。始终用 `-S - -E -` 获取完整输出。

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

### API Fault Recovery

| 故障类型 | 检测方式 | 恢复动作 |
|---------|---------|---------|
| **Rate limit (限流)** | 子窗格输出 "rate limit" 或 "resets" 或 usage > 95% | 暂停派发新任务，等待限流重置（通常 5h 窗口），已有 dev pane 可继续运行 |
| **Content filter (内容过滤)** | 子窗格输出 "content filtering" 或 "blocked" | 关闭当前 pane，用不同措辞重新发送指令（避免触发过滤的术语），记录到禁忌清单 |
| **API timeout** | 子窗格超过 timeout 无输出变化 | Warn 用户，不自动 kill。用户决定等待或重启 |
| **Codex/Claude 崩溃** | pane 从 tmux list-panes 消失 | 重新创建 pane + 发送上次指令。对 inspector 执行 C3 重建流程 |

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
tmux split-window -t {current_session} -h "cd /project/path && claude --dangerously-skip-permissions"
tmux split-window -t {current_session} -v "cd /project/path && claude --dangerously-skip-permissions"

# Open sub-pane with codex (Validate, Code Review, 顽固 bug 修复)
tmux split-window -t {current_session} -h "cd /project/path && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"
tmux split-window -t {current_session} -v "cd /project/path && codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"

# Send task packet to running claude in pane
tmux send-keys -t {pane_id} "Skill: bmad-dev-story" Enter

# [Signal] Quick check — last 5 lines for MC_DONE detection
tmux capture-pane -t {pane_id} -p -S -5

# [Full] Complete scrollback — all output since pane creation
tmux capture-pane -t {pane_id} -p -S - -E -

# [Log] Enable real-time log for a pane (run once after pane creation)
tmux pipe-pane -t {pane_id} -o 'cat >> {mc_log_dir}/pane-{pane_id}.log'

# [Log] Read full log file (no scrollback limit)
cat {mc_log_dir}/pane-{pane_id}.log

# List all panes with their IDs and running commands
tmux list-panes -t {current_session} -F '#{pane_id} #{pane_current_command} #{pane_width}x#{pane_height}'

# Close/kill a specific pane
tmux kill-pane -t {pane_id}

# Write/update gate-state.yaml (via utility sub-pane)
# Create initial gate-state.yaml:
tmux send-keys -t {utility_pane} "cat > _bmad-output/implementation-artifacts/gate-state.yaml << 'GATE_EOF'
last_updated: \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"
batch_id: \"batch-$(date +%Y-%m-%d)-1\"
batch_stories: [\"{{story_id_1}}\", \"{{story_id_2}}\"]
gates:
  G1: { status: PASS, timestamp: \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\", verified_by: commander, details: \"{{details}}\" }
story_gates: {}
GATE_EOF" Enter

# Append/update a gate entry (use python for YAML safety):
tmux send-keys -t {utility_pane} "python3 -c \"
import yaml, datetime
path = '_bmad-output/implementation-artifacts/gate-state.yaml'
with open(path) as f: state = yaml.safe_load(f)
state['last_updated'] = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z')
state['gates']['G{{N}}'] = {'status': 'PASS', 'timestamp': state['last_updated'], 'verified_by': '{{commander_or_inspector}}', 'details': '{{details}}'}
with open(path, 'w') as f: yaml.dump(state, f, default_flow_style=False, allow_unicode=True)
print('Gate G{{N}} recorded as PASS')
\"" Enter

# Write gate-report file:
tmux send-keys -t {utility_pane} "cat > _bmad-output/implementation-artifacts/gate-report-G{{N}}.md << 'REPORT_EOF'
# Gate Report G{{N}}
- Gate: G{{N}} ({{label}})
- Batch: {{batch_stories}}
- 提交时间: $(date -u +%Y-%m-%dT%H:%M:%S.000Z)

## 指挥官执行摘要
{{summary}}

## 磁盘状态断言
{{assertions}}
REPORT_EOF" Enter
```

---

## STATE TRACKING

Maintain an in-memory state map throughout execution:

```
# 全局状态
inspector_pane: "%7"             // 驻场监察官 pane ID
utility_pane: "%8"               // shell pane，用于文件写入/归档
inspector_state: idle            // idle | busy_gate | busy_audit
poll_count: 0                    // Step 4 循环计数器，用于主动监察触发
current_session: "1"             // 用户 attach 的 tmux session name
mc_instance: "1-1742486400"      // commander instance ID = {session_name}-{epoch}，防止多指挥官冲突
mc_log_dir: "/tmp/mc-logs/1-1742486400/"  // 子窗格日志目录
current_merge_story_id: null     // Step 7/8 正在 merge 和回归的 story

# Story 注册表（静态/跨阶段路径）
story_registry = {
  "1-5": {
    story_key: "1-5-project-crud-kanban",
    story_id: "1-5",
    story_file_rel: "_bmad-output/implementation-artifacts/story-1-5.md",
    story_file_main: "/abs/path/to/BidWise/_bmad-output/implementation-artifacts/story-1-5.md",
    story_file_worktree: "../BidWise-story-1-5/_bmad-output/implementation-artifacts/story-1-5.md",
    worktree_path: "../BidWise-story-1-5",
    is_ui: true
  }
}

# Per-story 运行态
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
    uat_result_file: "{project_root}/_bmad-output/implementation-artifacts/tests/uat-result-story-{{story_id}}.yaml" | null,
    qa_report_main: "{project_root}/_bmad-output/implementation-artifacts/tests/auto-qa-story-{{story_id}}.md" | null,
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
