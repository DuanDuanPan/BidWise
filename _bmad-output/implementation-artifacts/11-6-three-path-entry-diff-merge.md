# Story 11.6: 三路径结构入口 + diff 合并 UI

Status: ready-for-dev

## Story

As a 售前工程师,
I want 一个统一入口选择"通用模板 / AI 推荐 / Word 导入 / 从空开始"四种路径生成方案结构，且新结构与现有结构以 diff 形式合并,
So that 我无需在不同菜单里跳转，新生成的内容也不会静默覆盖我已有的工作。

## Acceptance Criteria

### AC1: 统一入口（无结构）

- **Given** 项目无方案结构
- **When** 进入"方案设计"阶段
- **Then** Modal 弹出统一入口选择器，列出四张卡片：
  - 📋 **通用模板**（复用 Story 3.3 的模板列表）
  - 🤖 **AI 推荐**（基于招标要求 - Story 11.8）
  - 📄 **导入 Word**（从已有文档提取目录 - Story 11.7）
  - ✏️ **从空开始**（手动逐节点搭建）
- [Source: epics.md Story 11.6 AC1]

### AC2: 统一入口（已有结构）

- **Given** 项目已有方案结构
- **When** 用户点击"添加分支"或"重新生成"按钮
- **Then** 同一入口选择器再次出现，但说明文案变为"将合并到现有结构"
- [Source: epics.md Story 11.6 AC2]

### AC3: diff 合并视图

- **Given** 用户选择 AI 推荐 / Word 导入 / 通用模板任一路径
- **When** 系统生成新结构
- **Then** 进入 diff 合并视图：左侧"当前结构"、右侧"建议结构"并排显示，新增节点标 `[+ 新增]`、未对应节点标 `[? 保留]`
- [Source: epics.md Story 11.6 AC3]

### AC4: jieba + Jaccard 节点匹配

- **Given** diff 视图节点匹配
- **When** 计算"当前节点"与"建议节点"对应关系
- **Then** 使用 jieba 分词 + Jaccard 相似度，阈值 ≥0.6 视为同节点；<0.6 视为新增 / 保留
- **And** 匹配缓存以 UUID 为 key（依赖 Story 11.1）
- [Source: epics.md Story 11.6 AC4]

### AC5: 三层级交互

- **Given** diff 合并视图
- **When** 用户操作
- **Then** 支持三层级交互：
  1. 节点级 checkbox（每个 AI 加的节点**默认未勾选**，逼用户主动接受）
  2. 批量按钮（"全部接受 AI 新增" / "保留我的全部"）
  3. 拖拽排序（用户可调整 AI 建议顺序）
- [Source: epics.md Story 11.6 AC5]

### AC6: 失败降级引导

- **Given** 任一生成路径失败（LLM 超时、Word 解析错、模板加载错）
- **When** 失败发生
- **Then** 显式提示失败原因 + 引导降级：`[重试]` `[改用通用模板]` `[稍后再试]`
- **And** 不静默兜底（避免劣化用户体验）
- [Source: epics.md Story 11.6 AC6]

### AC7: 应用合并结果

- **Given** 用户在 diff 视图确认勾选
- **When** 点击"应用合并"
- **Then** 接受勾选的 AI 节点写入 `chapterStore`（保留现有 + 新增 AI 节点 + 按拖拽顺序排序），调用 `chapterRepo` 持久化
- **And** 未勾选节点丢弃，不写入

## Tasks / Subtasks

- [ ] Task 1: 入口 Modal (AC: 1, 2)
  - [ ] 1.1 创建 `src/renderer/src/modules/editor/components/StructureSourceModal.tsx`
  - [ ] 1.2 props: `mode: 'create' | 'append'`, `onPathSelected: (path) => void`
  - [ ] 1.3 四卡片布局，每卡片含图标 / 标题 / 一句话描述 / 主按钮
  - [ ] 1.4 mode=append 时副标题改为"新生成的结构将与现有结构合并，您可以裁决"

- [ ] Task 2: jieba + Jaccard 匹配引擎 (AC: 4)
  - [ ] 2.1 创建 `src/main/services/structure-diff-service.ts`：
    ```typescript
    matchNodes(current: ChapterNode[], proposed: ChapterNode[]): DiffMatch[]
    ```
    返回数组：`{ currentId?: string; proposedId?: string; similarity: number; status: 'matched' | 'new' | 'kept' }`
  - [ ] 2.2 jieba 分词：使用 `nodejieba` npm 包（已有 / 新加 dependency）
  - [ ] 2.3 Jaccard：`|A ∩ B| / |A ∪ B|`，阈值 0.6
  - [ ] 2.4 IPC 通道 `structure:diff-match`

- [ ] Task 3: DiffMergeView 组件 (AC: 3, 5, 7)
  - [ ] 3.1 创建 `src/renderer/src/modules/editor/components/DiffMergeView.tsx`
  - [ ] 3.2 两栏布局：左 `CurrentStructureTree`（只读）、右 `ProposedStructureTree`（含 checkbox + 拖拽）
  - [ ] 3.3 节点关联连线视觉（matched 节点对齐显示）
  - [ ] 3.4 顶部批量按钮 + 底部"应用合并" / "取消"按钮
  - [ ] 3.5 受控 `selectedProposedIds: Set<string>` 状态，默认空集（AC5 强制）

- [ ] Task 4: 应用合并逻辑 (AC: 7)
  - [ ] 4.1 `chapterStore.applyMerge({ acceptedNodes, orderHints })`：批量插入接受的节点 + 排序
  - [ ] 4.2 持久化通过 11-1 的 `chapterRepo`
  - [ ] 4.3 关闭 Modal + Toast 反馈"已合并 N 个新章节"

- [ ] Task 5: 失败降级 UI (AC: 6)
  - [ ] 5.1 创建 `src/renderer/src/modules/editor/components/PathFailureFallback.tsx`：error 状态展示 + 三按钮
  - [ ] 5.2 [改用通用模板] 直接打开模板选择器
  - [ ] 5.3 错误码 → 友好中文文案映射

- [ ] Task 6: 集成到 SolutionDesignView (AC: 1, 2)
  - [ ] 6.1 修改 `src/renderer/src/modules/editor/components/SolutionDesignView.tsx`（已有，Story 3.3 创建）
  - [ ] 6.2 phase 增 `select-source-path` / `diff-merge`
  - [ ] 6.3 不再直接打开模板选择器，而是先打开 `StructureSourceModal`

- [ ] Task 7: 测试 (AC: 全部)
  - [ ] 7.1 `tests/unit/main/services/structure-diff-service.test.ts`：
    - 完全相同的两个节点 similarity=1
    - 一字之差节点 similarity ≥0.6
    - 完全不同 similarity <0.6
    - 中文 jieba 分词正确
  - [ ] 7.2 `tests/unit/renderer/modules/editor/components/StructureSourceModal.test.tsx`：四卡片渲染 + 路径选择回调
  - [ ] 7.3 `tests/unit/renderer/modules/editor/components/DiffMergeView.test.tsx`：
    - AI 节点默认未勾
    - 批量按钮全选 / 全保留
    - 拖拽排序更新内部 order
    - 应用合并触发正确 actions

## Dev Notes

### 关键决策（来自 Party Mode）

- **AI 节点默认未勾** — 用户工作永不静默覆盖
- **三路径输出统一进 diff** — 所有生成入口共用合并 UI
- **不静默降级** — 失败显式 + 引导用户主动选其他路径
- **jieba + Jaccard** — 用户裁决"字符串相似度"，阈值 0.6 起步，未来可升级 embedding

### 已有代码资产

| 已有文件 | 操作 |
|---|---|
| `src/renderer/src/modules/editor/components/SolutionDesignView.tsx` | 修改增 phase + 入口 Modal |
| `src/renderer/src/modules/editor/components/TemplateSelector.tsx` | 复用为"通用模板"路径 |
| Story 3.3 `template-service` | 复用为通用模板路径数据源 |
| Story 11.7 / 11.8 service | 提供其他两路径数据 |

### 依赖

- 阻塞前置：Story 11.1（UUID）
- 协同：Story 11.7（Word 路径数据）、11.8（AI 路径数据）、Story 3.3（通用模板路径数据）
- 阻塞下游：Story 11.7、11.8 的预览结束都进入本 story 的 diff 视图

### 禁止事项

- 禁止 AI 节点默认勾选
- 禁止失败时静默使用通用模板
- 禁止跨节点匹配缓存使用非 UUID
- 禁止破坏 Story 3.3 已有的 `SolutionDesignView` 内部 store 模式（不创新 store，使用本地 state）

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 11.6]
- [Source: _bmad-output/implementation-artifacts/3-3-template-driven-proposal-skeleton.md] — SolutionDesignView 现有结构
- [Source: nodejieba npm package] — 中文分词库

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
