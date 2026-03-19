# BidWise 并行开发工作流（Worktree 模式）

## 核心理念

将串行的 story pipeline 改为 **分阶段批处理 + Worktree 并行**：

- **同阶段批处理**：同一阶段的多个 story 并行执行
- **跨阶段流水线**：不同 story 可以处于不同阶段
- **人工介入点批量处理**：需要你介入时，集中处理多个 story 的同类决策

## 并行度建议

| 并行 story 数 | 适用场景 | 认知负担 |
|---------------|---------|---------|
| 2 | 首次尝试、story 间有轻度依赖 | 低 |
| 3 | 熟练后、story 完全独立 | 中 |
| 4+ | 不推荐 | 高，容易出错 |

## 工作流总览

```
Phase 1: 批量准备 (main 分支，顺序执行)
├─ create-story × N (Claude Code，交互式)
├─ Pencil UI/UX × N (需要 UI 的 story)
└─ validate-story × N (Codex)

Phase 2: 并行开发 (各自 worktree，并发执行)
├─ Terminal-1: worktree-A → dev-story Story-A
├─ Terminal-2: worktree-B → dev-story Story-B
└─ Terminal-3: worktree-C → dev-story Story-C

Phase 3: 并行审查 (各自 worktree，Codex 并发)
├─ Terminal-1: worktree-A → code-review
├─ Terminal-2: worktree-B → code-review
└─ Terminal-3: worktree-C → code-review

Phase 4: 批量裁决 (你集中审阅所有 review 意见)
├─ Story-A review 意见 → 接受/拒绝/给出理由
├─ Story-B review 意见 → 接受/拒绝/给出理由
└─ Story-C review 意见 → 接受/拒绝/给出理由

Phase 5: 并行修复 (各自 worktree)
├─ worktree-A: 修复 Story-A
├─ worktree-B: 修复 Story-B
└─ worktree-C: 修复 Story-C

Phase 6: 第二轮审查 → 重复 Phase 3-5 直到只剩低优先级项

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

在 main 分支上完成所有 story 的创建和验证。**这一步必须在 main 上完成**，
这样后续创建的 worktree 都能拿到 story 文件。

```bash
# 1. Claude Code 中逐个创建 story（交互式，无法并行）
/bmad-create-story   # Story A
/bmad-create-story   # Story B
/bmad-create-story   # Story C

# 2. 如需 UI/UX，用 Pencil 设计（逐个）

# 3. 提交所有 story 文件到 main
git add _bmad-output/implementation-artifacts/
git commit -m "feat: create stories A, B, C for parallel dev"

# 4. 切到 Codex 验证所有 story（可以在同一个 Codex 会话中批量验证）
```

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
# > /bmad-dev-story _bmad-output/implementation-artifacts/stories/story-1-2.md

# Terminal 2
cd ../BidWise-story-1-4
claude
# > /bmad-dev-story _bmad-output/implementation-artifacts/stories/story-1-4.md

# Terminal 3
cd ../BidWise-story-1-5
claude
# > /bmad-dev-story _bmad-output/implementation-artifacts/stories/story-1-5.md
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

### Phase 4-5: 批量裁决 + 并行修复

收到所有 review 意见后：

1. **集中阅读**所有 story 的 review 意见
2. **批量裁决**：对每个 story 的意见给出 接受/拒绝
3. **并行修复**：在各自 worktree 中修复

```bash
# 回到各 worktree 的 Claude Code 会话
# Terminal 1: 修复 Story 1-2 的 review 意见
# Terminal 2: 修复 Story 1-4 的 review 意见
```

### Phase 7: 顺序 UAT

UAT 需要你手动测试，建议逐个进行：

```bash
# 在每个 worktree 中运行应用并测试
cd ../BidWise-story-1-2
# ... 启动应用，手动测试 ...

# 测试通过后，切到下一个
cd ../BidWise-story-1-4
# ... 启动应用，手动测试 ...
```

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

### _bmad-output/ 共享文件
story 文件在 Phase 1 已提交到 main，所有 worktree 都会有。
但开发过程中如果修改了 story 文件，其他 worktree 不会自动同步。
**解决方案**：如果 dev-story 修改了 story 文件，开发完成后手动同步或在合并时处理。

### Pencil .pen 文件
.pen 文件是二进制/加密格式，不适合在多个 worktree 间 merge。
**解决方案**：所有 .pen 文件的设计工作在 Phase 1 完成并提交到 main，
之后 worktree 中只读取不修改。

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
