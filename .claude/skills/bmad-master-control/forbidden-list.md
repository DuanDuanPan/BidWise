# 禁忌清单（INCIDENT-DRIVEN FORBIDDEN LIST）

**来源：** 每条来自真实执行偏差，不是理论推演。
**读取规则：** 指挥官在 INITIALIZATION + 每次 gate 检查时 MUST 读取此清单。
**执行规则：** 如果即将采取与禁忌匹配的行动，MUST 立即停止并采用"正确做法"列。

| # | 禁忌 | 正确做法 | 来源事件 |
|---|------|---------|---------|
| F1 | **禁止逐 story 做完整闭环**（create→prototype→validate→commit 单个 story 后才处理下一个） | 分阶段批处理：先批量 create → 再批量 prototype → 再统一 validate → 单次 batch commit | 2026-03-19: Story 1-5 和 2-1 分别独立走完流程 |
| F2 | **禁止逐 story 单独 commit** | 全 batch 一次 commit（Step 2d），commit message 包含所有 story ID | 2026-03-19: 1-5 提交 8d619d8，2-1 另外提交 f0190a9 |
| F3 | **禁止直接修改 prototype.pen（母版）** | 派生到 `story-{id}.pen`，prototype.pen 只读 | 2026-03-19: Story 1-5 原型直接在 prototype.pen 上添加 frame |
| F4 | **禁止验证 FAIL 修复后跳过重新验证** | 每次修复后必须重新提交 codex 验证，直到 PASS 才能进入下一步 | 2026-03-19: Story 2-1 第 2 轮 codex FAIL → claude 修复 → 直接 commit |
| F5 | **禁止在 L0 转换时询问用户"继续？"** | L0 级别直接执行，不通知不等待 | 2026-03-19: Step 2→3 转换时输出"继续？"等待确认 |
| F6 | **禁止依赖 `bmad-create-story` 自动选 story** | 必须在指令中明确指定 story ID（如"请创建 Story 2-1"） | 2026-03-19: 未指定 ID，skill 自动选了 1-6 而非 batch 中的 2-1 |
| F7 | **禁止在独立 tmux session 创建子窗格** | 子窗格必须在用户当前 attach 的 session 中 split-window | 2026-03-19: 在 "mc" session 创建 dev pane，用户在 session "1" |
| F8 | **禁止指挥官在自身上下文执行构建/测试/写文件/git commit** | 所有构建、测试、文件写入、git 操作必须通过 tmux 子窗格派发 | 2026-03-20: 指挥官直接执行 pnpm test:unit、Write 工具创建文件 |
| F9 | **禁止用 `capture-pane -S -N`（固定行数）读取子窗格完整结果** | 使用三层协议：Signal (`-S -5` 检测 MC_DONE) → Full (`-S - -E -` 完整 scrollback) → Log (读 `pipe-pane` 日志文件) | 2026-03-20: 用 `-S -50` 读取，pane 高度只有 20 行导致截断，误判任务结果 |
| F10 | **禁止让 codex 执行文件编辑/修复**（codex 只做验证和审查，除非 C2 升级条件满足） | 验证 FAIL → 派发 claude 子窗格修复；仅 review_cycle >= 2 时 codex 可接手修复（C2 升级） | 2026-03-20: codex 验证发现问题后直接在同一 pane 中修复文件 |
| F11 | **禁止让执行过修复的窗格重新验证自己的修改（自我认证）** | 关闭旧窗格，开新 codex 窗格（fresh context）重新验证 | 2026-03-20: claude 修复后在同一窗格发送验证指令，失去独立性 |

| F12 | **禁止 `split-window -t {session}` 创建子窗格**（session 名会 split 当前活跃 pane，焦点变化后布局错乱） | 所有 `split-window` 必须用具体 pane ID 作为 `-t` 目标。创建顺序（先纵后横）：Bottom Anchor → `-t {commander_pane} -v -l 40%`；Inspector → `-t {commander_pane} -h -l 55%`；Utility → `-t {inspector_pane} -h -l 45%`；第一个工作任务复用 `bottom_anchor`，后续工作 pane 从当前最右侧 bottom pane `-h` 分裂 | 2026-03-20: Inspector 从 utility pane 右侧分割，而非 commander 右侧，布局与约定不符 |

| F13 | **禁止依赖 Pencil MCP 自动保存 .pen 文件**（`batch_design` 只修改内存状态，`open_document` 切换不触发保存，编辑器无 save 工具） | Prototype 步骤完成后，指挥官必须执行强制落盘：`batch_get(readDepth=99)` 读取完整内存节点树 → Python `json.load` 原文件获取 version+variables → 替换 children → `json.dump` 写回 .pen 文件 → `ls -la` 验证文件大小变化 | 2026-03-21: story-1-7.pen 和 story-1-9.pen 在 batch_design 成功后文件大小未变，设计内容仅存在于 Pencil 进程内存中，sub-pane 结束后设计丢失 |

| F14 | **禁止在 mixed window（上层控制区 + 下层工作区）上调用 `tmux select-layout`** | 工作层均衡只能使用 bottom-only `resize-pane -x` 方案；每次 split / kill / resize 后必须用 `pane_top` / `pane_left` 做几何校验 | 2026-03-21: `select-layout -t {bottom_anchor} even-horizontal` 把整窗 pane 拉平成同一水平行，误导指挥官认为初始化布局错误并触发重建 |

<!-- FORBIDDEN_LIST_END — 新条目追加到此标记之前 -->

## 自动更新机制

**触发源：**

| 触发源 | 时机 | 指挥官动作 |
|--------|------|-----------|
| Inspector VIOLATION | 主动监察或 gate 审查 | 立即通过子窗格追加条目 |
| Gate FAIL | 任何 gate assert 失败 | 记录到 incident log，batch 结束时批量转化 |
| 用户纠正 | 用户指出执行偏差 | 立即通过子窗格追加条目 |
| Watchdog ALERT | shell 监控检测到违规 | 监察官确认后通过子窗格追加条目 |

**编号规则：** 新条目编号递增（F12, F13, ...），不修改已有编号。

**治理层级（不可变性规则）：**
- **Constitution** — **不可变（immutable during execution）**。只有人类通过 git commit 修改。
- **Forbidden list** — Batch 内 append-only（指挥官通过子窗格追加），batch 结束时 git commit 固化。
- **Session journal** — 临时（ephemeral），batch 内自由读写，batch 结束归档。
- 如果某个 forbidden entry 在多个 batch 重复出现，Step 9 输出建议（L1 通知用户）："以下 pattern 重复 N 次，建议人工评估是否升级到 constitution"。**不自动修改 constitution。**
