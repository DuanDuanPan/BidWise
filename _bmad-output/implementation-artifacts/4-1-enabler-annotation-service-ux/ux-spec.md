# Story 4-1: Annotation Service 基础架构与批注数据模型 — UX 设计规格

## 1. 功能概述

本 Story 是批注系统的基础设施 Enabler。

交付范围：
- 建立批注数据模型、SQLite 持久化、IPC 通道、renderer store
- 将 Story 1.7 的右侧 `AnnotationPanel` 从壳层/占位升级为真实批注面板
- 用真实 `loading / empty / list` 三态替换 Story 3.4 的“章节生成摘要”过渡占位

**本 Story 不实现**：
- 4.2 的完整五色卡片操作区与键盘动作
- 4.3 的智能排序、过滤器、过载应急、微对话
- 4.4 的待决策协作者通知与跨角色线程
- “新增批注”按钮等可视化创建入口

## 2. 信息架构

```text
ProjectWorkspace（三栏壳层，沿用 Story 1.7）
├── LeftPanel: DocumentOutlineTree
├── CenterPanel: PlateEditor
└── RightPanel: AnnotationPanel
    ├── PanelHeader
    │   ├── VisibleTitle: 批注
    │   ├── PendingPill: "3 待处理"（仅待处理数 > 0 时显示）
    │   └── LoadingSpinner（仅 loading 时显示）
    ├── AnnotationList（简化列表）
    │   └── AnnotationItem
    │       ├── TypeChip
    │       ├── StatusChip
    │       ├── Content
    │       └── Meta: author · relative time
    ├── EmptyState
    └── LoadingSkeletonState
```

## 3. 核心交互模式

### 3.1 面板头

- 展开态可见标题：`批注`
- 壳层可访问性名称保持 Story 1.7 的 `aria-label="智能批注"`
- 待处理数 > 0 时，标题右侧显示蓝色 pill：`N 待处理`
- 待处理数 = 0 时，展开态不显示 pill
- loading 时在标题右侧显示小型 spinner
- 紧凑模式图标栏可继续使用小型 numeric badge，不要求与展开态完全同构

### 3.2 简化列表态

列表按 `createdAt DESC` 排列。

每条批注仅展示：
- 类型 chip
- 状态 chip
- 批注正文
- `author · relative time`

本 Story **不出现** 4.2 的操作按钮（采纳/驳回/查看等）。

### 3.3 类型 chip（4.1 简化版）

4.1 只要求简化文本 chip，不要求完整五色卡片。

| type | 文案 | 4.1 视觉处理 |
|------|------|--------------|
| `ai-suggestion` | AI 建议 | 蓝色浅底 chip |
| `asset-recommendation` | 资产推荐 | 绿色浅底 chip |
| `score-warning` | 评分预警 | 橙色浅底 chip |
| `adversarial` | 对抗攻击 | 红色浅底 chip |
| `human` | 人工批注 | 紫色浅底 chip |
| `cross-role` | 跨角色 | 简化青色 / 中性 chip；专属交互留给 Story 4.4 |

### 3.4 状态 chip

| status | 文案 | 视觉 |
|--------|------|------|
| `pending` | 待处理 | 灰色描边 |
| `accepted` | 已采纳 | 绿色实底 |
| `rejected` | 已拒绝 | 红色描边 |
| `needs-decision` | 待决策 | 蓝色描边 / 强调态，完整流程留给 Story 4.4 |

### 3.5 空态

参考 `Nh3y0.png`：

- 图标容器置中
- 标题：`本项目暂无批注`
- 说明文案：
  - 第一行：`批注将在 AI 生成、评分分析、`
  - 第二行：`对抗检测等流程中自动创建`

空态必须是非空白面板，不能只留下壳层。

### 3.6 加载态

参考 `pEmrs.png`：

- header 显示 `批注 + spinner`
- 内容区显示 3 条 skeleton 卡片
- 底部辅助文案：`正在加载批注数据...`

### 3.7 紧凑模式 / flyout

- Story 1.7 的 48px 图标栏 + flyout 交互保持不变
- flyout 打开后，内部内容必须与标准展开态一致，不能退回占位文案
- 也就是说：紧凑模式同样需要支持 loading / empty / list 三态

## 4. 页面流

### 4.1 进入 proposal-writing 阶段

```text
用户进入项目工作空间
  ↓
切到 proposal-writing 阶段
  ↓
ProjectWorkspace 触发 loadAnnotations(projectId)
  ↓
AnnotationPanel 显示 loading skeleton
  ↓
加载完成后进入：
  - list state
  - empty state
```

### 4.2 非 proposal-writing 阶段

- 本 Story 不要求在其他 SOP 阶段主动加载批注
- 壳层仍在，但 4.1 的自动加载触发点限定在 `proposal-writing`

## 5. 视觉规格

### 5.1 壳层几何

- **必须沿用 Story 1.7 已实现壳层**
  - 展开宽度：320px
  - 折叠条：40px
  - 紧凑图标栏：48px
- `.pen` 原型中的更宽画板只是内容参考，不是允许修改壳层宽度的依据

### 5.2 展开态面板

- 背景：`#FAFAFA`
- 内边距：16px
- 列表项间距：12px
- 顶部分隔线：浅灰 1px

### 5.3 列表项

- 背景：`#FFFFFF`
- 圆角：8px
- 内边距：12px
- 阴影：`0 1px 2px rgba(0,0,0,0.06)`
- 正文字号：13px
- 元信息字号：11px

### 5.4 Pending pill

- 展开态使用蓝色 pill，而不是纯数字红点
- 文案格式：`3 待处理`
- 零待处理时隐藏

## 6. 状态管理约束

4.1 的 renderer store 应按项目分桶，而不是使用单一全局 `loading/error`：

```ts
interface AnnotationProjectState {
  items: AnnotationRecord[]
  loading: boolean
  error: string | null
  loaded: boolean
}

interface AnnotationState {
  projects: Record<string, AnnotationProjectState>
}
```

## 7. 无障碍

- 外层 panel 保持 `role="complementary"` 与 `aria-live="polite"`
- 列表态使用 `role="list"` / `role="listitem"`
- 状态 chip 需含可读文本，不靠颜色单独传达
- 空态必须保留描述性文案，不仅是图标

## 8. 交付边界

**本 Story 交付**
- header pill
- loading skeleton
- empty state
- simplified list
- compact flyout 内同态内容

**本 Story 不交付**
- 完整五色卡片组件族
- 过滤器 / 智能排序 / 过载应急
- 线程内操作按钮
- 新建批注按钮
- 4.4 跨角色协作交互
