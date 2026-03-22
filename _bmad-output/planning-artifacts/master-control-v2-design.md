# Master Control v2 — 设计理念、参考模式与改造方案

> **目标：** 将 bmad-master-control 从"LLM 模拟操作系统"改造为"操作系统服务 LLM"。
> **核心度量：** 指挥官注意力衰退从第 30+ 轮 poll 后显著偏离，降低到可无限运行不偏离。
> **修订记录：**
> - v2.1 — 纳入对抗性评审 R1 的 3 CRITICAL + 7 HIGH + 2 MEDIUM 修正
> - v2.2 — 纳入对抗性评审 R2 的 1 CRITICAL + 3 HIGH + 2 MEDIUM 修正；fix cycle pane 策略
> - v2.3 — 纳入对抗性评审 R3 的 2 HIGH + 1 MEDIUM 修正（gate 写入模型 / trigger-seq 全覆盖 / DISPATCH 去重规格）
> - v2.4 — 移除 session-restart 机制（v2 无状态架构根治了注意力衰退，重启不再必要）
> - v2.5 — R4: generation.lock 提交顺序统一（approve-failover 独立协议）+ 物化规则 phase 字段修正
> - v2.6 — R5: trigger-seq 子命令级粒度 + HEALTH 全 action 幂等定义 + 事件名统一
> - v2.7 — R6: HEALTH trigger-seq 改为可选
> - v2.8 — R7: HEALTH 消除审计灰区（`--trigger-seq` 或 `--proactive` 二选一，两者都不带→拒绝）
> - v2.9 — R8: HEALTH MISSING_MODE 检查落到 command-gateway 主流程伪代码
> - v2.10 — R9: HEALTH 模式检查改为 XOR（二选一，同时提供也拒绝）

---

## 第一部分：设计理念

### 1.1 问题诊断

当前 master-control v1 的指挥官是一个 **宏内核(monolithic kernel)**——所有职责都在同一个 LLM 上下文中执行：

```
当前指挥官的一次 poll 迭代：
  ├── 读取 gate-state.yaml        → 状态恢复（本该由引擎保证）
  ├── 读取 constitution.md        → 刷新规则（本该由代码强制执行）
  ├── 读取 session-journal.yaml   → 上下文恢复（本该不需要记忆）
  ├── 检查 inspector pane 存活    → 基础设施维护（本该由监控完成）
  ├── 检查 pipe-pane 完整性       → 基础设施维护
  ├── 检查 watchdog 心跳          → 基础设施维护
  ├── 逐个 capture-pane           → 信号检测（本该由监控完成）
  ├── 解析 pane 输出              → 事件识别（本该由监控完成）
  ├── 判断状态转换                → ★ 真正的决策价值
  ├── 拼接 tmux 命令              → 机制执行（本该由脚本完成）
  ├── 拼接 state-control 调用     → 状态更新（本该由引擎原子完成）
  └── 更新多个 YAML 字段          → 多步操作（本该是一次事务）
```

**只有★标记的"判断状态转换"是指挥官不可替代的价值。** 其余全部可以下沉到确定性代码层。

### 1.2 第一性原理

**原理一：LLM 是不可信组件**

LLM 在架构中的地位等同于 Web 应用中的用户输入——不是因为恶意，而是因为**不可靠**。系统设计必须假设 LLM 在任何一步都可能出错，并通过工程手段保证即使出错也不会导致不可恢复的状态。

**原理二：分离机制与策略**

来自操作系统微内核思想(Mach/L4)：
- **机制(Mechanism)**——"怎么做"：创建 pane、检测信号、写入状态、验证前置条件。确定性代码实现。
- **策略(Policy)**——"做什么"：选择下一步行动、判断异常严重性。LLM 实现。

即使策略层完全失控，机制层也会拒绝非法操作。

**原理三：软约束必须有硬约束背书**

| 软约束 | 本质 | 衰变模式 | 硬化目标 |
|--------|------|---------|---------|
| **记忆** | 上下文窗口中的历史信息 | 越早的记忆越模糊 | 消除对记忆的依赖 |
| **事务** | LLM 按顺序调用多个命令 | 中途遗忘、做一半被中断 | 操作原子化 |
| **Prompt** | 自然语言规则 | 随时间降级为"建议" | 违规操作在接口上不存在 |

### 1.3 设计目标

| # | 目标 | 度量标准 |
|---|------|---------|
| D1 | 消除注意力衰退 | 每次激活上下文完全自包含 |
| D2 | 状态转换完整性 | 任何转换要么到达提交点，要么可安全重试（基于 trigger-seq 去重） |
| D3 | 规则不可绕过 | allowed-tools 不提供绕过入口 |
| D4 | 最小化 LLM 工作量 | 只做决策 |
| D5 | 可观测性 | 所有变更可追溯 |
| D6 | 渐进迁移 | 分阶段实施 |

### 1.4 诚实的保证边界

v2 **不声称** 数据库级 ACID。跨 tmux / 文件系统 / 进程 / git 的操作无法做到 all-or-nothing 回滚。

**v2 的实际保证：**

| 保证 | 机制 | 不保证 |
|------|------|--------|
| **提交点语义** | event-log append 是提交点。不变量在提交点**之前**检查，无效状态不落盘 | 提交前后的副作用不回滚 |
| **幂等重试** | `trigger-seq` 去重键覆盖所有事件驱动命令（TRANSITION/DISPATCH/REQUEST_HUMAN/BATCH start_qa/BATCH start_merge_queue/HEALTH）。每种命令有对应的去重查询表。pane 操作通过 title dedup。不可逆操作(merge)通过完成性检测 | — |
| **At-least-once 交付** | peek + ack 两阶段协议：游标只在显式 ack 后推进 | 可能重复投递（由幂等性保证安全） |
| **Generation fencing** | 独立原子文件 `generation.lock` 是唯一真相源，不从 gate-state 派生 | — |

**副作用分类与提交点的关系：**

| 副作用类型 | 示例 | 相对提交点 | 重试策略 |
|-----------|------|-----------|---------|
| 可逆/幂等 | pane 创建/关闭 | 提交前执行 | title dedup / kill 幂等 |
| 不可逆+可检测 | git merge | **提交前执行 + 验证成功** | 重试先检测是否已完成 |
| 不可逆+不可检测 | **不存在于系统中** | — | 如果出现 → L2/L3 人类决策 |

```
不可逆操作（git merge）的提交顺序：
  1. 执行 worktree.sh merge → 验证成功（exit code + git log 确认）
  2. 写 event-log（提交点）
  3. 更新 gate-state（物化）

  重试时：
  1. 检查 git log main | grep "Merge.*story-{id}" → 已 merge?
     是 → 跳过 merge，直接写 event-log
     否 → 正常执行 merge
```

---

## 第二部分：参考模式

### 2.1 记忆硬化模式

#### M1：无状态协议（HTTP/REST）
每次决策自包含——所有需要的信息从外部注入，不依赖之前的对话历史。

#### M2：按需换页（OS Demand Paging）
机制层根据事件类型，只注入当前决策点需要的规则子集。

#### M3：哈佛架构（指令与数据分离）
指令通道（规则子集）和数据通道（事件 payload + 状态）分离注入，不互相稀释。

### 2.2 事务硬化模式

#### T1：存储过程（Database Stored Procedure）
每个状态转换封装为复合命令。指挥官声明意图，引擎内部完成所有步骤。

#### T2：有限状态机 + 转换表（FSM）
转换由 `(当前状态, intent) → (目标状态, 副作用)` 驱动。不在表中的转换 → 引擎拒绝。

#### T3：Saga + 补偿（有限适用）
仅适用于可逆操作。**不可逆操作（git merge）不可自动补偿** — merge 到 main 后，后续 story 可能已 rebase；git revert 不是局部回滚而是新业务动作。Merge 失败 → L2/L3 人类决策。

#### T4：约束（Database Constraints）
不变量编码在转换引擎中，**在提交点之前检查**（不是之后），无效状态不落盘。

### 2.3 Prompt 硬化模式

#### P1：类型系统（Static Type System）
LLM 选择由引擎根据 `LLM_FOR_PHASE` 自动确定。默认路径无 llm 参数；覆盖路径需显式 `--override-llm` + `--override-reason`（完整审计）。

#### P2：能力安全（Capability-Based Security）— 执行环境级限制
SKILL.md `allowed-tools` 收窄为 `command-gateway.sh`、`event-bus.sh peek/ack`、`context-assembler.sh build`、`Read`、`Glob`、`Grep`。移除 `Bash(tmux *)`、`Bash(state-control.sh *)`。

> **诚实的限制：** Claude Code 的 `allowed-tools` 是正则匹配，不是密码学 capability。对于防止注意力衰退导致的误操作够用，不是对抗恶意 LLM 的安全边界。

#### P3：守卫条件 / 契约设计（Design by Contract）
Pre-dispatch checklist 编码为 `dispatch` 命令的 `require` 块。不满足就不执行。

#### P4：准入语法（Command Grammar）
指挥官的命令语法固定，机制层解析并验证。

### 2.4 系统级模式

#### S1：中断驱动（OS Interrupt-Driven I/O）
Task Monitor 替代指挥官的 pane 轮询。

#### S2：WAL + Checkpoint（Database）
Event Log = append-only 唯一真相源。Gate State = 物化视图，可随时重建。

#### S3：Sentinel（Redis）
Watchdog（合规审计）+ Task Monitor（运行时检测）+ Inspector（行为/gate 审查）形成三级监控。v2 中 watchdog 不再触发 session restart——只做合规告警，由 inspector 确认后交指挥官或人类处理。

#### S4：进程优先级调度（OS Scheduler）
事件按优先级排序。P3（正常运行中）不唤醒指挥官。

---

## 第三部分：目标架构

### 3.1 分层架构总览

```
                    ┌─────────────┐
                    │    用户      │
                    │ (Human Loop) │
                    └──────┬──────┘
                           │ P0 事件
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                 不可信区域 (Untrusted Zone)                    │
│  ┌───────────────────────────────────────────────────────┐   │
│  │                 指挥官 (Policy Engine)                  │   │
│  │  输入: Decision Packet (结构化、上下文最小化)            │   │
│  │  输出: Command (固定语法、有限命令集)                    │   │
│  │  不能: 直接 tmux、直接 state-control、选择 LLM(默认)    │   │
│  │  能做: PEEK → 决策 → COMMAND → ACK                     │   │
│  └──────────────────────┬────────────────────────────────┘   │
│                         │ COMMAND + trigger-seq                │
└─────────────────────────┼────────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                 验证边界 (Validation Boundary)                 │
│  command-gateway.sh <expected_generation> <command>           │
│  ├── generation fencing（读 generation.lock，非 gate-state）  │
│  ├── 解析命令语法                                             │
│  ├── trigger-seq 去重检查                                     │
│  ├── 查转换表 + 前置条件 + 不变量（全部在提交前）             │
│  └── 合法 → 转换引擎执行                                     │
└──────────────────────────┼───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                 可信区域 (Trusted Zone)                        │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Transition │  │ Event    │  │ Task     │  │ Context    │  │
│  │ Engine     │  │ Bus      │  │ Monitor  │  │ Assembler  │  │
│  │ 提交点语义  │  │ peek/ack │  │ log-first│  │ 决策包构建  │  │
│  │ 不变量前检  │  │ runtime游标│ │ 诊断回退 │  │ 规则注入   │  │
│  └───────────┘  └──────────┘  └──────────┘  └────────────┘  │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Watchdog   │  │ Runtime  │  │ Agent    │  │ generation │  │
│  │ 合规检测   │  │ Manager  │  │ Wrapper  │  │ .lock      │  │
│  │ (简化)     │  │ 启停编排  │  │ 结构化信号 │  │ 唯一真相源  │  │
│  └───────────┘  └──────────┘  └──────────┘  └────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 组件详细设计

#### 3.2.1 转换引擎（Transition Engine）

**文件：** `transition-engine.sh`（内部 Ruby）

##### Gate 写入模型

Gate 分为两类，写入者和时机严格区分：

| Gate 类型 | Gates | 写入者 | 转换中的角色 |
|-----------|-------|--------|-------------|
| **Self-check** | G1-G4, G6-G9, G11 | 转换引擎 | 前置条件 = **实际断言**（如"所有 story validated"）；副作用 = **记录 gate** |
| **Inspector** | G5, G10 | Inspector（外部） | 前置条件 = **gate 已被 inspector 写入**；**无 record 副作用**（避免双写） |

Self-check gate 示例：`validated → batch_committed`
- 引擎检查"all_batch_stories_validated" → 通过 → 引擎记录 G4 PASS

Inspector gate 示例：`committed → g5_approved`
- Inspector 通过 `approve-failover` 外部写入 G5 PASS → 指挥官收到 APPROVE 信号 → 发出 `TRANSITION g5_approved` → 引擎检查 G5 已在 gate-state/event-log 中 → 执行转换，**不重复记录 G5**

##### 唯一权威状态模型

**Phase 列表（穷举，覆盖完整生命周期）：**

```
Pre-dev phases（批量/顺序，commander-driven）:
  queued → creating → created → prototyping → prototyped → validating → validated → committed → dev_ready

Dev-and-beyond phases（异步/并行，event-driven）:
  dev → pending_review → review → auto_qa_pending → qa_running →
  uat_waiting → pre_merge → merged → regression → done

                 ↗ fixing ↘ (可从 review / qa_running / uat_waiting 进入)
```

**Pre-dev 转换表（批量操作，较简单的约束模型）：**

```ruby
PRE_DEV_TRANSITIONS = {
  [:queued, :create_dispatched] => {
    target: :creating,
    preconditions: [:g1_passed, :story_not_yet_created],
    side_effects: [],
  },
  [:creating, :create_complete] => {
    target: :created,
    preconditions: [:story_file_exists_on_disk],
    side_effects: [],
  },
  [:created, :prototype_dispatched] => {
    target: :prototyping,
    preconditions: [:is_ui_story],  # backend stories skip to :prototyped
    side_effects: [],
  },
  [:created, :skip_prototype] => {
    target: :prototyped,
    preconditions: [:is_not_ui_story],
    side_effects: [],
  },
  [:prototyping, :prototype_complete] => {
    target: :prototyped,
    preconditions: [:pen_file_exists, :png_exported],
    side_effects: [],
  },
  [:prototyped, :validate_dispatched] => {
    target: :validating,
    preconditions: [:g2_passed, :g3_passed_if_ui],
    side_effects: [],
  },
  [:validating, :validate_pass] => {
    target: :validated,
    preconditions: [],
    side_effects: [],
  },
  [:validating, :validate_fail] => {
    target: :created,  # 回到 created，修复后重新 validate
    preconditions: [:validation_cycle_under_limit],
    side_effects: [:increment_validation_cycle],
  },
  # G4 是 self-check gate: 引擎检查断言 → 记录 gate
  [:validated, :batch_committed] => {
    target: :committed,
    preconditions: [:all_batch_stories_validated],  # 实际断言，不是 "gate 已 PASS"
    side_effects: [:record_gate_g4],                # 引擎作为写入者记录 gate
  },
  # G5 是 inspector gate: inspector 已外部写入 → 引擎只检查存在性
  [:committed, :g5_approved] => {
    target: :dev_ready,
    preconditions: [:g5_recorded_by_inspector],     # 检查 inspector 已写入
    side_effects: [],                               # 不重复记录（避免双写）
  },
  [:dev_ready, :dev_dispatched] => {
    target: :dev,
    preconditions: [:worktree_created],
    side_effects: [:record_gate_g6],
  },
}
```

**Dev-and-beyond 转换表（核心异步流程）：**

```ruby
PHASE_TRANSITIONS = {
  # === Dev 完成 ===
  [:dev, :dev_complete] => {
    target: :pending_review,
    preconditions: [:source_files_exist],
    side_effects: [:clear_dispatch_state],
    pane_actions: [],
  },

  # === G7 通过 → 进入 Review ===
  [:pending_review, :g7_pass] => {
    target: :review,
    preconditions: [:g7_not_yet_recorded],
    side_effects: [:record_gate_g7],
    auto_dispatch: { phase: :review, llm: :codex, pane: :new },
  },

  # === Review 通过 ===
  [:review, :review_pass] => {
    target: :auto_qa_pending,
    preconditions: [],
    side_effects: [:record_gate_g8],
    pane_actions: [:close_review_pane, :clear_review_pane_ref],
  },

  # === Review 失败 → Fixing ===
  [:review, :review_fail] => {
    target: :fixing,
    preconditions: [:review_cycle_under_limit],
    side_effects: [:save_review_findings, :increment_review_cycle],
    pane_actions: [:close_review_pane, :clear_review_pane_ref],
    auto_dispatch: :commander_decides,  # 见下方 Fix Cycle Pane 策略
  },

  # === Fix 完成 ===
  [:fixing, :fix_complete] => {
    target: :pending_review,
    preconditions: [],
    side_effects: [:clear_dispatch_state],
    pane_actions: [],
  },

  # === QA 派发 ===
  [:auto_qa_pending, :qa_dispatched] => {
    target: :qa_running,
    preconditions: [],
    side_effects: [],
    auto_dispatch: { phase: :qa, llm: :codex, pane: :new },
  },

  # === QA 通过 ===
  [:qa_running, :qa_pass] => {
    target: :uat_waiting,
    preconditions: [],
    side_effects: [:record_gate_g9],
    pane_actions: [:close_qa_pane, :clear_qa_pane_ref],
  },

  # === QA 失败 → Fixing ===
  [:qa_running, :qa_fail] => {
    target: :fixing,
    preconditions: [],
    side_effects: [:save_qa_findings],
    pane_actions: [:close_qa_pane, :clear_qa_pane_ref],
    auto_dispatch: { phase: :fixing, llm: :claude, pane: :new_or_reuse_dev },
  },

  # === UAT 通过 → 等待 Inspector G10 ===
  [:uat_waiting, :uat_pass] => {
    target: :pre_merge,
    preconditions: [:uat_result_file_exists],
    side_effects: [:request_inspector_g10],
  },

  # === UAT 失败 → Fixing ===
  [:uat_waiting, :uat_fail] => {
    target: :fixing,
    preconditions: [],
    side_effects: [:save_uat_feedback, :reset_review_cycle],
    auto_dispatch: { phase: :fixing, llm: :claude, pane: :new_or_reuse_dev },
  },

  # G10 是 inspector gate: inspector 已外部写入 → 引擎只检查存在性
  # execute_merge 是不可逆副作用 → 提交前执行+验证
  [:pre_merge, :g10_approved] => {
    target: :merged,
    preconditions: [:g10_recorded_by_inspector],   # 检查 inspector 已写入
    side_effects: [:execute_merge],                # 不重复记录 G10（避免双写）
    irreversible_side_effects: [:execute_merge],   # 标记：提交前执行+验证
  },

  # === Merge 完成 → 开始 Regression ===
  [:merged, :regression_start] => {
    target: :regression,
    preconditions: [],
    side_effects: [],
    auto_dispatch: { phase: :regression, llm: :codex, pane: :new },
  },

  # === Regression 通过 ===
  [:regression, :regression_pass] => {
    target: :done,
    preconditions: [:all_three_layers_same_cycle],
    side_effects: [:record_gate_g11, :update_sprint_status],
    pane_actions: [:close_regression_pane, :clear_regression_pane_ref],
  },

  # === Regression 失败 ===
  [:regression, :regression_fail] => {
    target: :regression,  # 保持 phase=regression
    preconditions: [:regression_cycle_under_limit],
    side_effects: [:increment_regression_cycle],
    pane_actions: [],  # codex 在同一 pane 修复后重跑
  },
}
```

##### Fix Cycle Pane 策略

Review → Fix 循环中的 pane 复用决策：

| 场景 | Pane 策略 | 决策者 |
|------|----------|--------|
| Cycle 1 + 局部缺陷(missing check, naming) | 复用 dev pane | 指挥官判断 |
| Cycle 1 + 系统性问题(架构/数据流) | 新开 pane | 指挥官判断 |
| Cycle 2 + 同类问题重现 | 新开 pane | 指挥官判断 |
| Cycle 3+ (C2 升级到 codex) | **强制新开** | 引擎硬编码 |

`review_fail` 转换的 `auto_dispatch: :commander_decides` 触发决策包：

```yaml
available_commands:
  - command: "DISPATCH 1-5 fixing --trigger-seq 15"
    description: "复用现有 dev pane 修复（局部缺陷）"
  - command: "DISPATCH 1-5 fixing --fresh-pane --trigger-seq 15"
    description: "新开 pane 修复（系统性问题/重复失败）"
applicable_rules:
  - "Cycle 1: 优先复用，除非 findings 指出系统性架构问题"
  - "Cycle 2: 如果 findings 与 cycle 1 同类 → 建议新开"
  - "Cycle 3+: 强制新开（C2 升级）— 引擎自动处理，不需要选"
  - "review findings 分类摘要: {从 review-findings-cycle-N.md 提取}"
```

Cycle 3+ 时引擎直接执行新 pane + codex，不回调指挥官选择。

##### 全局不变量（提交前检查）

```ruby
INVARIANTS = [
  # C2: review/qa/regression 必须用 codex（无 override 时）
  {
    name: "C2_review_llm",
    check: ->(s) {
      !%i[review qa_running regression].include?(s[:phase]) ||
        s[:current_llm] == "codex" ||
        s[:c2_override] == true
    },
  },
  # C2: fixing 默认 claude，cycle >= 2 可升级 codex（或 override）
  {
    name: "C2_fixing_llm",
    check: ->(s) {
      s[:phase] != :fixing ||
        s[:current_llm] == "claude" ||
        (s[:current_llm] == "codex" && (s[:review_cycle] || 0) >= 2) ||
        s[:c2_override] == true
    },
  },
  # Cycle 上限（batch 级可配，不回溯验证已完成 batch）
  { name: "review_cycle_limit",     check: ->(s, cfg) { (s[:review_cycle] || 0) <= cfg[:max_review_cycles] } },
  { name: "regression_cycle_limit", check: ->(s, cfg) { (s[:regression_cycle] || 0) <= cfg[:max_regression_cycles] } },
  { name: "validation_cycle_limit", check: ->(s, cfg) { (s[:validation_cycle] || 0) <= cfg[:max_validation_cycles] } },
  # Gate 依赖链
  { name: "gate_chain_g8",  check: ->(gates) { !gates["G8"]  || gates["G7"] } },
  { name: "gate_chain_g9",  check: ->(gates) { !gates["G9"]  || gates["G8"] } },
  { name: "gate_chain_g10", check: ->(gates) { !gates["G10"] || (gates["G7"] && gates["G8"] && gates["G9"]) } },
  { name: "gate_chain_g11", check: ->(gates) { !gates["G11"] || gates["G10"] } },
]
```

**不变量检查时机——必须在提交点之前：**

```
普通转换执行流程（绝大多数转换）：
  1. 检查前置条件 → 失败则不执行
  2. 在内存中计算目标状态
  3. 对目标状态运行全局不变量 → 失败则不执行（无效状态不落盘）
  4a. 可逆副作用（pane 创建/关闭）→ 执行（幂等，可安全重试）
  4b. 不可逆副作用（git merge）→ 执行 + 验证成功
      重试时先做完成性检测: 已完成 → 跳过
  5. ★ 写 event-log（提交点）← 只有不变量通过 + 副作用成功才到此
  6. 更新 gate-state.yaml（物化）

  注意: 普通转换不涉及 generation bump。generation.lock 只在
  approve-failover 中写入（见下方独立协议）。

  crash at 1-3: 什么都没发生，安全
  crash at 4:   副作用已执行但未提交 → 重试时幂等（pane dedup / merge 检测）
  crash at 5:   已提交但 gate-state 未更新 → materialize 恢复
  crash at 6:   gate-state 不一致 → materialize 恢复
```

```
approve-failover 协议（独立于普通转换，由 inspector 触发）：
  1. ★ 写 generation.lock（原子覆写）← 新 generation 立即生效
     → 旧 commander 的后续所有命令立即被 command-gateway 拒绝
  2. 写 event-log GENERATION_BUMPED 事件
  3. 更新 gate-state.yaml（generation + failover_epoch + gate PASS）

  这是唯一写入 generation.lock 的路径。
  第一步是屏障：即使步骤 2-3 未完成就崩溃，旧 commander 已被隔离。
  新 commander 启动时：如果 event-log 缺少 GENERATION_BUMPED 但
  generation.lock 已更新 → materialize 补写事件。

  crash at 1:   generation.lock 已更新但无事件记录
                → 旧 commander 已被隔离（安全）
                → 新 commander 启动时 materialize 检测到 generation.lock
                   > event-log 中最新 generation → 补写 GENERATION_BUMPED
  crash at 2:   事件已写但 gate-state 未更新 → materialize 恢复
  crash at 3:   全部完成
```

##### trigger-seq 去重（覆盖所有事件驱动命令）

**命令分为两类：**

| 类别 | 命令 | trigger-seq | 去重机制 |
|------|------|-------------|---------|
| **事件驱动** | TRANSITION | 必须 | event-log `STORY_PHASE_CHANGED { trigger_seq, story_id }` |
| | DISPATCH | 必须 | event-log `TASK_DISPATCHED { trigger_seq, story_id, phase }` + pane 存活检查 |
| | REQUEST_HUMAN | 必须 | event-log `HUMAN_REQUEST { trigger_seq, story_id }` |
| | BATCH start_qa | 必须 | event-log `BATCH_QA_STARTED { trigger_seq }` |
| | BATCH start_merge_queue | 必须 | event-log `BATCH_MERGE_STARTED { trigger_seq }` |
| **HEALTH (二选一模式)** | HEALTH rebuild_pane | `--trigger-seq` 或 `--proactive` | trigger-seq → event-log dedup；proactive → `HEALTH_PROACTIVE` 审计 + pane title dedup |
| | HEALTH check_inspector | 同上 | trigger-seq → event-log dedup；proactive → 审计 + 只读操作 |
| | HEALTH restart_watchdog | 同上 | trigger-seq → event-log dedup；proactive → 审计 + PID 存活检测 |
| | HEALTH check_logging | 同上 | trigger-seq → event-log dedup；proactive → 审计 + pipe-pane 幂等 |
| **用户发起** | BATCH select | 无 | 不需要（人类交互，非事件循环） |
| | BATCH commit | 无 | 不需要（人类确认触发） |
| | PEEK_EVENTS | 无 | 天然幂等（只读） |
| | ACK_EVENTS | 无 | 天然幂等（游标只前进） |

**命令网关的 trigger-seq 检查规则：**

```ruby
# 始终必须带 trigger-seq 的命令（状态变更，必须可去重）
ALWAYS_REQUIRES_TRIGGER_SEQ = Set[:transition, :dispatch, :request_human]
# 按子命令区分的 BATCH
BATCH_REQUIRES_TRIGGER_SEQ = Set["start_qa", "start_merge_queue"]

def requires_trigger_seq?(parsed)
  return true if ALWAYS_REQUIRES_TRIGGER_SEQ.include?(parsed.type)
  return BATCH_REQUIRES_TRIGGER_SEQ.include?(parsed.action) if parsed.type == :batch
  # HEALTH: trigger-seq 可选。有 → 去重；没有 → 主动巡检，放行不去重
  false
end
```

**HEALTH 命令必须显式声明调用模式（消除审计灰区）：**
- `--trigger-seq N`：事件驱动 → 写 `HEALTH_EXECUTED` 审计事件 → 重投递时去重
- `--proactive`：主动巡检 → 写 `HEALTH_PROACTIVE` 审计事件（轻量，无去重）→ 直接执行
- **两者都不带 → 拒绝**（`MISSING_MODE: HEALTH requires --trigger-seq or --proactive`）

这保证了 D5 可观测性：事后审计可以区分事件驱动执行 vs 主动巡检 vs 漏传参数（不存在，因为会被拒绝）。

**HEALTH 命令的幂等保证（双层）：**

| 模式 | 审计事件 | 去重机制 |
|------|---------|---------|
| `--trigger-seq N` | `HEALTH_EXECUTED { trigger_seq, action }` | event-log dedup：已有 → `already_applied` |
| `--proactive` | `HEALTH_PROACTIVE { action, timestamp }` | 无去重（操作天然幂等，见下表） |
| 两者都不带 | — | **拒绝**（`MISSING_MODE`） |

| HEALTH action | 天然幂等原因 |
|---------------|-------------|
| `rebuild_pane` | pane title dedup（tmux-layout.sh `find_existing_worker`）|
| `check_inspector` | 只读操作，无副作用 |
| `restart_watchdog` | `ensure-running` 内部 PID 存活检测，活着就不重启 |
| `check_logging` | `pipe-pane` 对已启用的 pane 是 no-op |

**TRANSITION 去重：**

```ruby
def execute_transition(story_id, intent, trigger_seq)
  existing = find_event(type: "STORY_PHASE_CHANGED",
                        trigger_seq: trigger_seq,
                        story_id: story_id)
  if existing
    return { success: true, already_applied: true, event_seq: existing.seq }
  end
  # 正常执行转换...
end
```

**DISPATCH 去重（含 pane 存活性检查）：**

```ruby
def dispatch_with_dedup(story_id, phase, trigger_seq, ...)
  # 1. 查 event-log 中是否已有相同 trigger_seq 的派发事件
  existing = find_event(type: "TASK_DISPATCHED",
                        trigger_seq: trigger_seq,
                        story_id: story_id,
                        phase: phase)
  if existing
    pane_id = existing.payload["pane_id"]
    # 2. 检查 pane 是否仍然存活
    if pane_alive?(pane_id)
      return { success: true, already_applied: true, pane_id: pane_id }
    else
      # pane 已死 → 不是重复，而是 pane 崩溃后的新情况
      return { success: false, error: "PANE_DEAD_AFTER_DISPATCH",
               hint: "Issue HEALTH rebuild_pane or new DISPATCH with new trigger-seq from new event." }
    end
  end
  # 3. 无重复 → 正常执行 dispatch
  execute_dispatch(story_id, phase, trigger_seq, ...)
end
```

这使得 at-least-once 的重复投递是**可证明的 no-op**（基于事件 trigger_seq 去重），而不是碰巧的 phase mismatch。

##### 命令接口

```bash
# 执行状态转换
transition-engine.sh execute <project_root> <expected_generation> <story_id> <intent> --trigger-seq <N>
# 返回: JSON { success, new_phase, already_applied, events_written, error }

# Dispatch（带可选 C2 覆盖和 pane 策略）
transition-engine.sh dispatch <project_root> <expected_generation> <story_id> <phase> --trigger-seq <N> [--override-llm LLM --override-reason REASON] [--fresh-pane]
# 返回: JSON { success, pane_id, llm_used, c2_override, already_applied, error }

# 查询可用转换
transition-engine.sh available <project_root> <story_id>

# 验证全局不变量
transition-engine.sh validate <project_root>

# 批量操作
transition-engine.sh batch-transition <project_root> <expected_generation> <intent> <story_csv> --trigger-seq <N>
```

#### 3.2.2 事件总线（Event Bus）

**文件：** `event-bus.sh`

##### Peek + Ack 两阶段消费协议

```
Commander 工作循环：
  1. PEEK_EVENTS → 读取 seq > cursor 的事件（游标不动）
  2. 对每个事件：构建决策包 → 做出决策 → 发出 COMMAND（带 --trigger-seq）
  3. 全部处理完毕 → ACK_EVENTS <last_processed_seq>（显式推进游标）

  crash at 1:   游标未推进，下次 peek 重投递
  crash at 2:   游标未推进，下次 peek 重投递。已执行的 COMMAND 通过 trigger-seq 去重
  crash at 3:   游标未推进，下次 peek 重投递。已执行的 COMMAND 通过 trigger-seq 去重
  正常完成:     游标推进到 last_processed_seq
```

**事件不标记"已消费"，不删除。** 消费语义完全由游标位置决定。

##### 游标存储

```yaml
# _bmad-output/implementation-artifacts/consumer-cursors.yaml
# 独立文件，不在 gate-state 中（避免 materialize 循环依赖）
# consumer 名称按 runtime 隔离，而不是全局单键
commander-mc-verify-g0: 30
watchdog-mc-verify-g0: 28
```

> 运行时 daemon 的 pid / heartbeat / dedup / alert-cache 不再共享项目级单文件，
> 而是写入 `runtime/<session>-g<generation>/...`。只有 event-log / gate-state / generation.lock
> 仍然是项目级真相源。

##### Generation 真相源

```
文件: _bmad-output/implementation-artifacts/generation.lock
内容: 单个整数（如 "0" 或 "1"）
唯一写入路径: approve-failover 协议（见 §3.2.1）
唯一读取路径: command-gateway.sh 第一步

command-gateway.sh 检查顺序:
  1. ★ 读 generation.lock
  2. 比较 expected_generation == actual → 不等则拒绝所有命令
```

Generation 既不从 event-log 读也不从 gate-state 读，只从这个独立原子文件读。approve-failover 的完整提交顺序和崩溃语义定义在 §3.2.1 的独立协议中。

##### 事件日志格式

```yaml
# _bmad-output/implementation-artifacts/event-log.yaml
schema_version: 2
events:
  - seq: 1
    type: BATCH_SELECTED
    timestamp: "2026-03-22T10:00:00.000Z"
    generation: 0
    source: commander
    trigger_seq: null  # 非事件触发的操作
    payload:
      batch_id: "batch-2026-03-22-1"
      stories: ["1-5", "2-1"]
      config: { max_review_cycles: 3, max_regression_cycles: 3, max_validation_cycles: 3 }

  - seq: 5
    type: STORY_PHASE_CHANGED
    timestamp: "2026-03-22T10:30:00.000Z"
    generation: 0
    source: transition_engine
    trigger_seq: 10  # 由 seq=10 的 PANE_SIGNAL_DETECTED 触发
    payload:
      story_id: "1-5"
      from_phase: dev
      to_phase: pending_review
      intent: dev_complete
      review_cycle: 0
      regression_cycle: 0
      auto_qa_cycle: 0
      validation_cycle: 0
      current_llm: claude
      dispatch_state: null
      c2_override: false

  - seq: 10
    type: PANE_SIGNAL_DETECTED
    timestamp: "2026-03-22T11:15:00.000Z"
    generation: 0
    source: task_monitor
    trigger_seq: null
    payload:
      story_id: "1-5"
      pane_id: "%95"
      signal: MC_DONE_DEV
      detail: "MC_DONE DEV 1-5 REVIEW_READY"

  - seq: 11
    type: PANE_IDLE_NO_SENTINEL
    timestamp: "2026-03-22T11:16:00.000Z"
    generation: 0
    source: task_monitor
    trigger_seq: null
    payload:
      story_id: "1-5"
      pane_id: "%95"
      idle_indicator: "claude_prompt"
      dispatch_state_at_detection: "worker_running"
      # 指挥官必须判断，机制层不自动推进

  - seq: 20
    type: TASK_DISPATCHED
    timestamp: "2026-03-22T11:21:00.000Z"
    generation: 0
    source: transition_engine
    trigger_seq: 10
    payload:
      story_id: "1-5"
      phase: review
      llm: codex
      pane_id: "%98"
      c2_override: false
      override_reason: null
      constitution_check: PASS

  - seq: 30
    type: GENERATION_BUMPED
    timestamp: "..."
    generation: 1  # 新 generation
    source: inspector
    trigger_seq: null
    payload:
      old_generation: 0
      new_generation: 1
      failover_epoch: 1
      trigger: session_restart
```

##### 完整物化规则

```ruby
MATERIALIZATION_RULES = {
  BATCH_SELECTED: ->(state, e) {
    p = e["payload"]
    state["batch_id"] = p["batch_id"]
    state["batch_stories"] = p["stories"]
    state["config"] = p["config"]
    p["stories"].each_with_index do |sid, idx|
      state["story_states"][sid] ||= default_story_state(sid, idx + 1)
    end
  },

  STORY_PHASE_CHANGED: ->(state, e) {
    p = e["payload"]
    ss = state["story_states"][p["story_id"]] ||= {}
    # payload 使用 to_phase（与事件样例一致），映射到 state 的 phase 字段
    ss["phase"] = p["to_phase"] if p.key?("to_phase")
    %w[review_cycle regression_cycle auto_qa_cycle validation_cycle
       current_llm dispatch_state c2_override].each do |field|
      ss[field] = p[field] if p.key?(field)
    end
  },

  GATE_PASSED: ->(state, e) {
    p = e["payload"]
    if p["story_id"]
      target = state["story_gates"][p["story_id"]] ||= {}
    else
      target = state["gates"] ||= {}
    end
    target[p["gate"]] = {
      "status" => "PASS",
      "timestamp" => e["timestamp"],
      "verified_by" => p["verified_by"],
    }
  },

  TASK_DISPATCHED: ->(state, e) {
    p = e["payload"]
    ss = state["story_states"][p["story_id"]] ||= {}
    ss["current_llm"] = p["llm"]
    ss["dispatch_state"] = p["dispatch_state"] || "worker_running"
    ss["c2_override"] = p["c2_override"] || false
  },

  DISPATCH_STATE_CHANGED: ->(state, e) {
    p = e["payload"]
    ss = state["story_states"][p["story_id"]] ||= {}
    ss["dispatch_state"] = p["dispatch_state"] if p["dispatch_state"]
  },

  PANE_REGISTERED: ->(state, e) {
    p = e["payload"]
    panes = ((state["panes"] ||= {})["stories"] ||= {})[p["story_id"]] ||= {}
    panes[p["role"]] = p["pane_id"]
  },

  PANE_CLOSED: ->(state, e) {
    p = e["payload"]
    state.dig("panes", "stories", p["story_id"])&.delete(p["role"])
  },

  GENERATION_BUMPED: ->(state, e) {
    p = e["payload"]
    state["session_generation"] = p["new_generation"]
    state["failover_epoch"] = p["failover_epoch"]
  },

  MERGE_STATE_UPDATED: ->(state, e) {
    p = e["payload"]
    ms = state["merge_state"] ||= {}
    %w[queue current_story completed].each { |k| ms[k] = p[k] if p.key?(k) }
  },

  # 以下事件仅作审计 trail，不影响物化状态
  # HUMAN_REQUEST: 指挥官请求人类介入（由 REQUEST_HUMAN 命令写入）
  # HUMAN_INPUT:   用户主动提供的输入（UAT 结果等，由转换引擎在处理 uat_pass/uat_fail 时写入）
  HUMAN_REQUEST:       ->(state, e) {},
  HUMAN_INPUT:         ->(state, e) {},
  CORRECTION:          ->(state, e) {},
  HEALTH_ALERT:        ->(state, e) {},
  HEALTH_EXECUTED:     ->(state, e) {},  # HEALTH 事件驱动执行审计
  HEALTH_PROACTIVE:    ->(state, e) {},  # HEALTH 主动巡检审计
  BATCH_QA_STARTED:    ->(state, e) {},  # 批量 QA 派发审计
  BATCH_MERGE_STARTED: ->(state, e) {},  # 批量 merge 启动审计
  CURSOR_ADVANCED:     ->(state, e) {},  # 游标在独立文件，不在 gate-state
}
```

##### 命令接口

```bash
# 追加事件（仅可信区域调用）
event-bus.sh append <project_root> <expected_generation> <type> <source> <trigger_seq|null> <payload_json>

# Peek（读事件，不推进游标）
event-bus.sh peek <project_root> <expected_generation> --consumer <name> [--types TYPE1,TYPE2] [--priority] [--limit N]
# 返回: JSON array of events where seq > cursor AND generation <= expected_generation

# Ack（显式推进游标）
event-bus.sh ack <project_root> --consumer <name> --seq <last_processed_seq>
# 写入 consumer-cursors.yaml

# 物化
event-bus.sh materialize <project_root>

# 统计
event-bus.sh stats <project_root>
```

#### 3.2.3 任务监控器（Task Monitor）

**文件：** `task-monitor.sh`

**关键变化：**
- 结果链路优先读取 `mc-logs` 增量（log-first），`capture-pane` 只做诊断回退
- `MC_STATE ...` 由统一 wrapper 写入，物化为 `DISPATCH_STATE_CHANGED`
- `IDLE` / `PANE_EXIT` 只触发恢复路径，不再直接推进业务 phase

| 信号 | 事件类型 | 通知 | 指挥官动作 |
|------|---------|------|-----------|
| `MC_DONE {PHASE} {story_id} {RESULT}` | `PANE_SIGNAL_DETECTED` | P1 | TRANSITION |
| `HALT` | `PANE_SIGNAL_DETECTED` | P0 | REQUEST_HUMAN |
| `MC_STATE {STATE}` | `DISPATCH_STATE_CHANGED` | P3 | 同步 dispatch_state |
| Error/crash | `PANE_SIGNAL_DETECTED` | P2 | 判断可恢复性 |
| Pane 消失 | `PANE_SIGNAL_DETECTED` signal=PANE_EXIT | P1 | 判断原因 |
| Idle 无 MC_DONE | `PANE_IDLE_NO_SENTINEL` | P2 | **仅恢复 / 升级，不推进 phase** |
| Worker 运行中 | 不写事件 | 无 | — |
| 超时 | `PANE_TIMEOUT` | P2 | 通知用户 |

监控目标由转换引擎在 auto_dispatch 时自动注册。

#### 3.2.4 Watchdog 简化（Session-Restart 移除）

v1 中 watchdog 的核心职责之一是检测指挥官注意力衰退 → 写 `restart-eligible.yaml` → inspector 在 gate 时执行 SESSION-RESTART，给指挥官一个干净的上下文窗口。

**v2 不再需要 session restart。** 原因：

| v1 衰退源 | v2 消除方式 |
|-----------|-----------|
| 每轮读 6 个文件 → 上下文膨胀 | Context Assembler 注入最小子集 |
| 长时间连续 polling → 注意力衰退 | peek/ack 事件驱动，空闲时不消耗 token |
| 隐式记忆 → 随时间失真 | 无状态协议，每次决策自包含 |
| 机械工作占注意力 → 规则遗忘 | tmux/state-control 下沉到机制层 |
| 多步事务 → 做一半出错 | 转换引擎原子执行 |

v2 的指挥官每次处理一个事件 → 发一条命令 → 完成。上下文窗口不会随时间膨胀。

**保留的 watchdog 职责（合规审计）：**

| 检查 | 说明 | 适配 |
|------|------|------|
| `check_llm_phase_mismatch` | 保留 | 数据源从 gate-state + session-journal 改为 event-log 中的 `TASK_DISPATCHED` 事件 |
| `check_dispatch_contract_mismatch` | 保留 | 同上 |
| `check_predispatch_gap` | 保留 | 检测 event-log 中 trigger-seq 连续性 |
| heartbeat 机制 | 保留 | watchdog 自身健康证明 |

**移除的 watchdog 职责（不再需要）：**

| 检查 | 移除原因 |
|------|---------|
| `check_session_timeout` | 无长轮询，无超时概念 |
| `check_sentinel_consumed` | restart-eligible 机制整体移除 |

**连带移除的组件：**

| 组件 | 位置 |
|------|------|
| `restart-eligible.yaml` 写入/消费机制 | watchdog.sh, inspector-protocol.md |
| `SESSION-RESTART` 协议 | inspector-protocol.md |
| `APPROVE → SESSION-RESTART` 分支 | inspector-protocol.md, step-02, step-07 |
| `WATCHDOG_SESSION_MAX_SECONDS` 配置 | watchdog.sh |
| `approve-failover` 中的 generation bump | state-control.sh（generation bump 仅在实际 failover 场景保留，不再由定时超时触发）|
| workflow.md §9 中的 restart-eligible 检查 | workflow.md 恢复算法 |

**watchdog.sh v2 主循环（简化后）：**

```bash
while true; do
  sleep "$CHECK_INTERVAL"

  tmux has-session -t "$SESSION_NAME" 2>/dev/null || exit 0

  # 合规检测（数据源改为 event-log）
  check_llm_phase_mismatch      # C2 违规
  check_dispatch_contract_mismatch  # phase/LLM 契约违规
  check_predispatch_gap         # trigger-seq 连续性

  # 移除: check_session_timeout
  # 移除: check_sentinel_consumed

  write_heartbeat
done
```

#### 3.2.5 上下文装配器（Context Assembler）

**文件：** `context-assembler.sh`

对 `PANE_IDLE_NO_SENTINEL` 事件，额外注入：

```yaml
applicable_rules:
  - "IDLE without MC_DONE is ambiguous — do NOT auto-transition"
  - "Check dispatch_state: packet_submitted / packet_acked → 派发恢复; worker_running → 恢复或升级"
  - "Check pane log for rate limit / content filter"
  - "IDLE is diagnostic-only — never advance business phase from IDLE"
```

#### 3.2.6 命令网关（Command Gateway）

**文件：** `command-gateway.sh`

**完整命令语法：**

```
command-gateway.sh <expected_generation> <command>

TRANSITION <story_id> <intent> --trigger-seq <N>
  pre-dev intents:  create_dispatched | create_complete
                    | prototype_dispatched | prototype_complete | skip_prototype
                    | validate_dispatched | validate_pass | validate_fail
                    | batch_committed | g5_approved | dev_dispatched
  dev+ intents:     dev_complete | g7_pass | review_pass | review_fail
                    | fix_complete | qa_dispatched | qa_pass | qa_fail
                    | uat_pass | uat_fail | g10_approved
                    | regression_start | regression_pass | regression_fail

DISPATCH <story_id> <phase> --trigger-seq <N> [--override-llm LLM --override-reason REASON] [--fresh-pane]
  phase: create | prototype | validate | dev | review | fixing | qa | regression

REQUEST_HUMAN <story_id> <reason> --trigger-seq <N>

BATCH <action> [args]
  select <story_csv>                            (用户发起，无 trigger-seq)
  commit                                        (用户发起，无 trigger-seq)
  start_qa <story_csv> --trigger-seq <N>        (事件驱动)
  start_merge_queue <csv> --trigger-seq <N>     (事件驱动)

HEALTH <action> (--trigger-seq <N> | --proactive)
  check_inspector | restart_watchdog | rebuild_pane <story_id> | check_logging
  必须二选一: --trigger-seq（事件驱动）或 --proactive（主动巡检）
  两者都不带 → 拒绝
  注: v2 无 session-restart 命令。watchdog 仅做合规审计，不触发重启。

PEEK_EVENTS [--types TYPE1,TYPE2] [--limit N]
ACK_EVENTS --seq <last_processed_seq>
```

**处理流程：**

```ruby
def process_command(expected_generation, raw_command)
  # 1. Generation fencing — 读 generation.lock（不是 gate-state）
  actual_gen = File.read(generation_lock_path).strip.to_i
  return { error: "STALE_GENERATION", actual: actual_gen } unless actual_gen == expected_generation

  # 2. 解析
  parsed = CommandParser.parse(raw_command)
  return { error: "SYNTAX_ERROR", hint: valid_commands_hint } unless parsed

  # 3. trigger-seq 强制检查（按具体子命令，不按顶层类型）
  if requires_trigger_seq?(parsed) && parsed.trigger_seq.nil?
    return { error: "MISSING_TRIGGER_SEQ", hint: "Event-driven commands require --trigger-seq" }
  end

  # 4. 路由（每种命令类型内部有自己的去重逻辑）
  case parsed.type
  when :transition
    TransitionEngine.execute(project_root, expected_generation, parsed.story_id, parsed.intent,
      trigger_seq: parsed.trigger_seq)
  when :dispatch
    TransitionEngine.dispatch(project_root, expected_generation, parsed.story_id, parsed.phase,
      trigger_seq: parsed.trigger_seq,
      override_llm: parsed.override_llm, override_reason: parsed.override_reason,
      fresh_pane: parsed.fresh_pane)
  when :request_human
    dedup_and_execute(:HUMAN_REQUEST, parsed.trigger_seq, parsed.story_id) {
      EventBus.append(project_root, expected_generation, "HUMAN_REQUEST", "commander",
        parsed.trigger_seq, { story_id: parsed.story_id, reason: parsed.reason }.to_json)
    }
  when :batch
    # select/commit: 用户发起，无 trigger-seq，无去重
    # start_qa/start_merge_queue: 事件驱动，trigger-seq 必须，内部去重
    handle_batch_command(project_root, expected_generation, parsed)
  when :health
    has_seq = !parsed.trigger_seq.nil?
    has_pro = parsed.proactive
    return { error: "MISSING_MODE", hint: "HEALTH requires --trigger-seq or --proactive (exactly one)" } \
      unless has_seq ^ has_pro  # XOR: 有且仅有一个
    handle_health_command(project_root, expected_generation, parsed)
  when :peek_events
    EventBus.peek(project_root, expected_generation,
      consumer: runtime_consumer_name(project_root, expected_generation, "commander"),
      types: parsed.types)
  when :ack_events
    EventBus.ack(project_root,
      consumer: runtime_consumer_name(project_root, expected_generation, "commander"),
      seq: parsed.seq)
  end
end
```

### 3.3 Constitution 到代码的映射

| 规则 | v2 硬化 |
|------|--------|
| **C1** 不编辑文件 | allowed-tools 无 tmux/state-control |
| **C2** LLM 分配 | `LLM_FOR_PHASE` + `--override-llm` 审计入口 |
| **C2** 审查≠修复 pane | 转换表 `close_review_pane` 强制 |
| **C3** Authority Level | L0 自动执行；L2 返回 `REQUIRES_HUMAN` |
| **C4** 批处理 | `BATCH commit` 不接受单 story |
| **C5** prototype 只读 | 引擎不暴露母版路径 |
| **C6** Gate 不跳过 | 前置条件检查 gate 链 |

---

## 第四部分：改造方案

### 4.1 分阶段策略

```
Phase 1: 转换引擎 + 命令网关 + generation.lock   → 事务完整 + 规则不可绕过
Phase 2: 事件总线 (peek/ack + 物化)               → 状态一致 + 故障恢复
Phase 3: 任务监控器                               → 消除轮询
Phase 4: 上下文装配器                              → 完全无状态
```

### 4.2 Phase 1: 转换引擎 + 命令网关

**新增：**

| 文件 | 行数 | 职责 |
|------|-----|------|
| `transition-engine.sh` | ~500 | 转换表(含 pre-dev) + 不变量(提交前) + trigger-seq 去重 + 不可逆副作用排序 |
| `command-gateway.sh` | ~250 | generation.lock fencing + 解析 + 去重 + 路由 |
| `generation.lock` | 1 | 唯一 generation 真相源 |

**修改：** SKILL.md allowed-tools 收窄。state-control.sh 仅内部用。

### 4.3 Phase 2: 事件总线

**新增：**

| 文件 | 行数 | 职责 |
|------|-----|------|
| `event-bus.sh` | ~400 | append + peek/ack + 完整物化 |
| `consumer-cursors.yaml` | — | runtime-specific consumer 游标 |

### 4.4 Phase 3: 任务监控器

**新增：**

| 文件 | 行数 | 职责 |
|------|-----|------|
| `task-monitor.sh` | ~450 | log-first 信号检测 + runtime 租约 + 恢复判定 |
| `monitor-control.sh` | ~180 | runtime-scoped 生命周期 |
| `watchdog-control.sh` | ~220 | runtime-scoped watchdog 生命周期 |
| `runtime-manager.sh` | ~100 | monitor/watchdog/inspector 统一编排 |
| `runtime-paths.sh` | ~50 | runtime 目录约定 |
| `agent-wrapper.py` | ~120 | worker 结构化状态/结果输出 |

#### Dry-Run 验证通道

为避免冷启动/运行时验证误改真实 story，v2 实现额外提供 `DISPATCH <story_id> noop --trigger-seq <N>`：

- 不推进业务 phase
- 不创建/修改业务文件
- 仍完整经过 wrapper / dispatch_state / task-monitor / event-bus 链路
- 预期最终输出：`MC_DONE NOOP <story_id> PASS`

### 4.5 Phase 4: 上下文装配器

**新增：**

| 文件 | 行数 | 职责 |
|------|-----|------|
| `context-assembler.sh` | ~200 | 规则子集 + 决策包 |
| `rules/` | ~10 文件 | 按事件类型的规则片段 |

### 4.6 推荐优先级

```
必做: Phase 1 + Phase 3  → ~1130 行 → 消除 ~80% 问题
建议: Phase 2            → ~400 行  → 故障恢复
可选: Phase 4            → ~200 行  → 完全无状态
总计: ~1730 行
```

---

## 附录 A：术语表

| 术语 | 含义 |
|------|------|
| Commit Point | event-log append 完成的时刻 |
| trigger-seq | 事件驱动的去重键：触发该决策的事件 seq |
| Peek/Ack | 两阶段消费：读不推进 + 显式推进 |
| generation.lock | 独立原子文件，generation 唯一真相源 |
| Materialized View | 从 event-log 重建的 gate-state 快照 |

## 附录 B：参考模式索引

| ID | 模式 | 来源 | 解决的问题 |
|----|------|------|-----------|
| M1 | 无状态协议 | HTTP/REST | 记忆衰变 |
| M2 | 按需换页 | OS Demand Paging | 上下文膨胀 |
| M3 | 哈佛架构 | CPU Architecture | 指令/数据稀释 |
| T1 | 存储过程 | Database | 多步事务不完整 |
| T2 | 有限状态机 | Automata Theory | 非法转换 |
| T3 | Saga(有限) | Microservices | 可逆操作恢复；不可逆→人类决策 |
| T4 | 约束 | Database Constraints | 不变量（提交前检查） |
| P1 | 类型系统 | Programming Language | C2 硬编码 + override 审计 |
| P2 | 能力安全 | OS Security | 执行环境级限制 |
| P3 | 守卫条件 | Design by Contract | 前置条件 |
| P4 | 准入语法 | SQL Parser | 命令验证 |
| S1 | 中断驱动 | OS I/O | 轮询消除 |
| S2 | WAL + Checkpoint | Database | 事件溯源 + 物化恢复 |
| S3 | Sentinel | Redis | 多源监控 |
| S4 | 优先级调度 | OS Scheduler | 事件优先级 |

## 附录 C：评审修正追踪

| # | 轮次 | 级别 | 问题 | 修正 | 影响章节 |
|---|------|------|------|------|---------|
| 1 | R1 | CRITICAL | 事件交付丢失 | 游标消费 + flag 仅唤醒 | §3.2.2 |
| 2 | R1 | CRITICAL | IDLE→dev_complete 假阳性 | PANE_IDLE_NO_SENTINEL 不自动推进 | §3.2.3 |
| 3 | R1 | CRITICAL | 状态机自相矛盾 | 唯一权威转换表 + 名称统一 | §3.2.1 |
| 4 | R1 | HIGH | generation fencing 不完整 | 所有命令 fencing + CONSUME 带 generation | §3.2.5 |
| 5 | R1 | HIGH | 原子性说过头 | 提交点语义 + 幂等重试 | §1.4 |
| 6 | R1 | HIGH | 物化规则不完整 | 完整物化覆盖所有字段 | §3.2.2 |
| 7 | R1 | HIGH | 向后兼容破坏硬化 | 旧命令仅内部用 | §4.2 |
| 8 | R1 | HIGH | 能力安全未落地 | allowed-tools 收窄 | P2 |
| 9 | R1 | HIGH | review_cycle<=3 冲突 | batch 级可配 + 不回溯 | §3.2.1 |
| 10 | R1 | HIGH | C2 不兼容 OVERRIDE | --override-llm 正式入口 | P1 |
| 11 | R1 | MEDIUM | git revert 补偿不安全 | merge 不可逆→人类决策 | T3 |
| 12 | R1 | MEDIUM | phase=merged 语义冲突 | regression 独立 phase | §3.2.1 |
| 13 | R2 | CRITICAL | consume 自动推进仍丢事件 | peek+ack 两阶段协议 | §3.2.2, §1.4 |
| 14 | R2 | HIGH | generation 真相源未定义 | generation.lock 独立原子文件 | §3.2.2, §3.1 |
| 15 | R2 | HIGH | 不变量在提交后检查 | 不变量在提交前(内存中)检查 | §3.2.1 |
| 16 | R2 | HIGH | 幂等缺 dedup key | trigger-seq 参数 | §3.2.1, §3.2.5 |
| 17 | R2 | MEDIUM | pre-dev phases 不在 FSM | 扩展 FSM 覆盖 queued→dev_ready | §3.2.1 |
| 18 | R2 | MEDIUM | merge 相对提交点顺序 | 不可逆副作用提交前执行+验证 | §1.4, §3.2.1 |
| — | R2 | — | fix cycle pane 策略 | commander_decides + cycle 3+ 强制新开 | §3.2.1 |
| 19 | R3 | HIGH | gate 写入者/时机矛盾(G4/G5/G10) | self-check vs inspector 双模型；inspector gate 无 record 副作用 | §3.2.1 |
| 20 | R3 | HIGH | trigger-seq 只覆盖 TRANSITION/DISPATCH | 所有事件驱动命令强制 trigger-seq + 各命令去重查询表 | §3.2.1, §3.2.5, §1.4 |
| 21 | R3 | MEDIUM | DISPATCH 幂等算法未具体化 | dispatch_with_dedup 含 pane 存活性检查 | §3.2.1 |
| 22 | — | — | session-restart 不再需要 | v2 无状态架构根治衰退；移除 restart-eligible/SESSION-RESTART/超时检查；watchdog 简化为纯合规审计 | §3.2.4 |
| 23 | R4 | HIGH | generation.lock 提交顺序矛盾 | 普通转换不涉及 generation；approve-failover 独立协议（先写 lock → 事件 → gate-state）；消除与通用流程的冲突 | §3.2.1, §3.2.2 |
| 24 | R4 | HIGH | 物化规则读 `p["phase"]` 但事件用 `to_phase` | 物化改为 `ss["phase"] = p["to_phase"]` | §3.2.2 |
| 25 | R5 | HIGH | trigger-seq 按 parsed.type 粗粒度判断 | `requires_trigger_seq?(parsed)` 按子命令判断；BATCH select/commit 免除，BATCH start_qa/start_merge_queue 强制 | §3.2.1, §3.2.6 |
| 26 | R5 | HIGH | HEALTH 命令幂等未闭合 | 所有 HEALTH action 写 `HEALTH_EXECUTED` 审计事件做 trigger-seq 去重；各 action 自身操作天然幂等 | §3.2.1 |
| 27 | R5 | MEDIUM | HUMAN_REQUEST vs HUMAN_INPUT 双命名 | 两者语义不同保留两个名称；HUMAN_REQUEST(指挥官请求介入) + HUMAN_INPUT(用户提供结果)；物化规则补全两者 | §3.2.2 |
| 28 | R6 | HIGH | HEALTH trigger-seq 一律 true 拒绝主动巡检 | trigger-seq 改为可选 | §3.2.1, §3.2.6 |
| 29 | R7 | MEDIUM | 无 trigger-seq 静默降级，审计灰区 | `--trigger-seq` 或 `--proactive` 二选一，两者都不带→拒绝；`HEALTH_PROACTIVE` 独立审计事件 | §3.2.1, §3.2.2, §3.2.6 |
| 30 | R8 | MEDIUM | MISSING_MODE 检查未出现在主流程伪代码 | command-gateway `when :health` 分支增加显式 guard | §3.2.6 |
| 31 | R9 | MEDIUM | "二选一"实为"至少一项"，同时提供未拒绝 | `||` 改为 `^`（XOR） | §3.2.6 |
