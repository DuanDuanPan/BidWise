# BidWise 并行开发工作流（Worktree 模式）

## 核心理念

将串行的 story pipeline 改为 **分阶段批处理 + Worktree 并行**：

- **同阶段批处理**：同一阶段的多个 story 并行执行
- **跨阶段流水线**：不同 story 可以处于不同阶段
- **人工介入点批量处理**：需要你介入时，集中处理多个 story 的同类决策

## 并行度建议

| 并行 story 数 | 适用场景                     | 认知负担     |
| ------------- | ---------------------------- | ------------ |
| 2             | 首次尝试、story 间有轻度依赖 | 低           |
| 3             | 熟练后、story 完全独立       | 中           |
| 4+            | 不推荐                       | 高，容易出错 |

## 工作流总览

```
Phase 1: 批量准备 (main 分支，按阶段批处理)
├─ create-story × M (master-control 走 headless worker mode 可并行；手工直跑仍是交互式串行)
├─ Pencil UI/UX × K (仅缺原型的 UI story；每个 story 独立 `.pen`)
├─ validate-story × N (batch 全量复核，含 ready-for-dev story)
└─ single batch commit to main

Phase 2: 并行开发 (各自 worktree，并发执行)
├─ Terminal-1: worktree-A → dev-story Story-A
├─ Terminal-2: worktree-B → dev-story Story-B
└─ Terminal-3: worktree-C → dev-story Story-C

Phase 3: 并行审查 (各自 worktree，Codex 并发)
├─ Terminal-1: worktree-A → code-review
├─ Terminal-2: worktree-B → code-review
└─ Terminal-3: worktree-C → code-review

Phase 4: 并行自动化 QA (各自 worktree)
├─ 生成/更新 Story 级 Playwright 测试
├─ 执行 smoke + @story-x-y 关键路径
└─ 产出 trace / screenshot / report / summary

Phase 5: 批量裁决 + 并行修复
├─ Story-A review / auto-QA 意见 → 接受/拒绝/给出理由
├─ Story-B review / auto-QA 意见 → 接受/拒绝/给出理由
└─ Story-C 在各自 worktree 修复

Phase 6: 第二轮审查/自动化 QA → 重复 Phase 3-5 直到阻塞问题清零

Phase 7: 顺序 UAT (你逐个验收)
├─ UAT Story-A → pass/fail
├─ UAT Story-B → pass/fail
└─ UAT Story-C → pass/fail

Phase 8: 顺序合并 (merge 到 main)
├─ merge story/A → main
├─ merge story/B → main (rebase on updated main)
└─ merge story/C → main (rebase on updated main)
```

## 详细操作步骤

### Phase 1: 批量准备

在 main 分支上完成 batch 内 story 的准备和验证。**这一步必须在 main 上完成**，
这样后续创建的 worktree 都能拿到 story 文件。

> `ready-for-dev` 的 story 可以直接纳入 batch，跳过 `create-story`，但仍建议在进入开发前做统一 validate。

```bash
# 0. 先选 batch：可混合 backlog + ready-for-dev

# 1. 手工模式下，Claude Code 中逐个创建缺失的 story（仅 backlog；交互式）
/bmad-create-story   # Story A
/bmad-create-story   # Story B
# Story C 如果已是 ready-for-dev，则跳过 create-story

# 1b. 若通过 master-control 批量准备，则 create phase 使用 headless worker contract + ACK 握手并行派发

# 2. 如需 UI/UX，只为缺原型的 UI story 补 Pencil 设计（逐个）

# 3. 切到 Codex，对 batch 中所有 story 做统一验证

# 4. 一次性提交本批次 story / prototype 产物到 main
git add _bmad-output/implementation-artifacts/
git commit -m "feat: prepare stories A, B, C for parallel dev"
```

> UI story 的 Pencil 原型采用“母版 + 派生”模式：先从 `_bmad-output/implementation-artifacts/prototypes/prototype.pen` 拷贝相关标准，再保存到 `_bmad-output/implementation-artifacts/prototypes/story-<id>.pen`，同时导出 reference PNG 并更新 `prototype-manifest.yaml`。

### Phase 2: 创建 Worktree 并行开发

```bash
# 创建 worktree（每个 story 一个独立的工作目录和分支）
git worktree add ../BidWise-story-1-2 -b story/1-2
git worktree add ../BidWise-story-1-4 -b story/1-4
git worktree add ../BidWise-story-1-5 -b story/1-5

# 验证
git worktree list
```

然后打开多个终端窗口，每个 worktree 启动独立的 Claude Code 会话：

```bash
# Terminal 1
cd ../BidWise-story-1-2
claude
# > /bmad-dev-story _bmad-output/implementation-artifacts/story-1-2.md

# Terminal 2
cd ../BidWise-story-1-4
claude
# > /bmad-dev-story _bmad-output/implementation-artifacts/story-1-4.md

# Terminal 3
cd ../BidWise-story-1-5
claude
# > /bmad-dev-story _bmad-output/implementation-artifacts/story-1-5.md
```

> **关键**：每个 Claude Code 会话运行在自己的 worktree 中，互不干扰。
> 你可以在不同终端之间切换，在 Claude Code 需要你输入时介入。

### Phase 3: 并行 Code Review

开发完成后，在每个 worktree 中提交代码，然后启动 Codex 进行 review：

```bash
# Terminal 1（在 worktree-1-2 中）
cd ../BidWise-story-1-2
codex  # 或打开 Codex 指向这个目录
# > /bmad-code-review

# Terminal 2（在 worktree-1-4 中）
cd ../BidWise-story-1-4
codex
# > /bmad-code-review

# 可以同时提交多个 review，不用等一个完成再提交下一个
```

### Phase 4: 并行自动化 QA

Code Review 通过后，不直接把人拉进 UAT。先让模型补齐并执行自动化端到端测试：

```bash
# Terminal 1（在 worktree-1-2 中）
cd ../BidWise-story-1-2

# 1. 先跑全局 smoke
pnpm test:e2e:smoke

# 2. 再跑 Story 级关键路径（约定测试标题带 @story-1-2）
pnpm exec playwright test -g @story-1-2

# 3. 如需人工复看浏览器执行过程
pnpm test:e2e:headed

# 4. 查看报告
pnpm test:e2e:report
```

自动化 QA 的输出建议保存为：

- `_bmad-output/implementation-artifacts/tests/auto-qa-story-1-2.md`
- `playwright-report/`
- `test-results/playwright/`

对 UI story，自动化 QA 摘要还应注明：

- AC 覆盖矩阵（哪些已自动化，哪些仍需人工）
- 生成的测试清单及 `@p0/@p1` 标签
- 使用的 prototype manifest 条目
- 使用的 reference PNG 路径
- 是否完成与 reference PNG 的视觉对照

### Phase 5-6: 批量裁决 + 并行修复

收到所有 review 和 auto-QA 意见后：

1. **集中阅读**所有 story 的 review / E2E 失败信息
2. **批量裁决**：对每个 story 的意见给出 接受/拒绝
3. **并行修复**：在各自 worktree 中修复

```bash
# 回到各 worktree 的 Claude Code 会话
# Terminal 1: 修复 Story 1-2 的 review 意见
# Terminal 2: 修复 Story 1-4 的 review 意见
```

### Phase 7: 顺序 UAT

UAT 仍需要你手动测试，但现在应基于自动化报告做“更高价值”的检查，而不是重复机器已经覆盖的冒烟路径：

```bash
# 在每个 worktree 中运行应用并测试
cd ../BidWise-story-1-2

# 1. 先看自动化 QA 摘要
cat _bmad-output/implementation-artifacts/tests/auto-qa-story-1-2.md

# 2. 如有失败证据，先看 Playwright 报告
pnpm test:e2e:report

# 3. 再启动应用做人工 UAT
pnpm dev

# 测试通过后，切到下一个
cd ../BidWise-story-1-4
# ... 重复同样流程 ...
```

人工 UAT 重点放在这些自动化不擅长的问题：

- 业务判断是否正确
- 中文文案、数字、日期、行业术语是否自然
- 视觉细节、排版、层级、密度是否符合预期
- 异常操作、恢复路径、长流程体验是否顺滑

如果 UAT 发现问题，交给 Codex 在对应 worktree 中修复。

### Phase 8: 顺序合并

```bash
# 回到主仓库
cd /Volumes/Data/Work/Code/StartUp/BidWise

# 合并第一个 story
git merge story/1-2
# 更新 sprint-status.yaml

# 合并第二个 story（先 rebase 确保基于最新 main）
cd ../BidWise-story-1-4
git rebase main
cd /Volumes/Data/Work/Code/StartUp/BidWise
git merge story/1-4

# 合并第三个 story
cd ../BidWise-story-1-5
git rebase main
cd /Volumes/Data/Work/Code/StartUp/BidWise
git merge story/1-5

# 清理 worktree
git worktree remove ../BidWise-story-1-2
git worktree remove ../BidWise-story-1-4
git worktree remove ../BidWise-story-1-5

# 清理远程分支（如果推送过）
git branch -d story/1-2 story/1-4 story/1-5
```

## 选择可并行 Story 的原则

**可以并行的 story 特征：**

- 属于不同子系统/模块（如 UI vs 后端 vs 数据层）
- 不修改相同文件
- 没有数据依赖（A 的输出不是 B 的输入）

**不可以并行的 story：**

- Enabler story 和依赖它的 story（如 1-1 必须先于 1-2/1-4/1-5）
- 修改相同核心组件的 story

**Epic 1 并行分析示例：**

```
1-1 (project-init) ← 必须先完成，是所有 story 的前置
     ├─ 1-2 (data-persistence)  ──→ 1-3 (ipc-security)
     ├─ 1-4 (ui-framework)      ──→ 1-7 (workspace-layout)
     ├─ 1-5 (project-crud)      ──→ 1-8 (smart-todo)
     └─ 1-6 (sop-navigation)    ──→ 1-9 (command-palette)

可并行批次：
  Batch 1: [1-1] (单独，基础设施)
  Batch 2: [1-2, 1-4, 1-5, 1-6] (4路并行，互不依赖)
  Batch 3: [1-3, 1-7, 1-8, 1-9, 1-10] (5路并行，各自依赖上一批的不同 story)
```

## 注意事项

### sprint-status.yaml 冲突

`sprint-status.yaml` 会在每个 worktree 中被修改。
**解决方案**：只在 main 分支上更新 sprint-status.yaml，worktree 中不要修改它。
合并后在 main 上统一更新状态。

### \_bmad-output/ 共享文件

story 文件在 Phase 1 已提交到 main，所有 worktree 都会有。
但开发过程中如果修改了 story 文件，其他 worktree 不会自动同步。
**解决方案**：如果 dev-story 修改了 story 文件，开发完成后手动同步或在合并时处理。

### Pencil .pen 文件

.pen 文件是二进制/加密格式，不适合在多个 worktree 间 merge。
**解决方案**：所有 .pen 文件的设计工作在 Phase 1 完成并提交到 main，
之后 worktree 中只读取不修改。

母版与派生规则：

- `prototype.pen` 是项目级标准母版，只读使用
- `story-<id>.pen` 是 story 级派生工作文件
- 新 story 原型应先从 `prototype.pen` 拷贝相关标准 frame / 组件 / token，再进行定制

原型文件使用 story 绑定路径：

- `_bmad-output/implementation-artifacts/prototypes/story-<id>.pen`
- `_bmad-output/implementation-artifacts/prototypes/story-<id>/`（导出 PNG）
- `_bmad-output/implementation-artifacts/prototypes/prototype-manifest.yaml`
- `_bmad-output/implementation-artifacts/prototypes/prototype.pen`（只读母版）

保存校验规则：

- Prototype 完成后必须确认 `.pen` 文件存在
- 必须确认至少一个 reference PNG 已导出
- 必须确认 manifest 中有对应 story 条目
- 必须确认 manifest 记录了该 story 从 `prototype.pen` 继承的标准片段
- 新增/更新原型时，必须确认 `git status` 能看到这些文件的变更
- 建议用 `Story X.Y — 页面/组件名` 作为 frame 名称，便于后续定位

风格一致性规则：

- 不依赖“大家一起改同一个 `.pen`”来保持一致
- 统一风格基线来自 `prototype.pen`、Story 1.4 设计系统、UX 规范和对应基础参考 PNG
- 每个 story 原型都必须复用同一套 typography / spacing / color / component 规则
- 如某个 story 需要引入新的全局视觉规则，应先更新风格基线，再更新具体 story 原型

### 建议的终端布局

使用 tmux 或 iTerm2 的分屏功能，每个 worktree 一个 pane：

```
┌──────────────────┬──────────────────┐
│ Story 1-2        │ Story 1-4        │
│ (Claude Code)    │ (Claude Code)    │
├──────────────────┼──────────────────┤
│ Story 1-5        │ Main (管理)      │
│ (Claude Code)    │ (git/status)     │
└──────────────────┴──────────────────┘
```
