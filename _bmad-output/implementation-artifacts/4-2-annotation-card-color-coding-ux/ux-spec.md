# Story 4-2: 批注卡片与五色分层着色 — UX 设计规格

## 概述

本设计规格定义五色批注卡片系统在方案撰写阶段右侧批注面板中的交互行为，覆盖从卡片渲染、操作按钮、状态变更到键盘导航的完整流程。设计基于 UX-DR9（五色变体 + 专属操作按钮组）、UX-DR24（无障碍三重编码）、UX-DR27（键盘导航快捷键）三条设计规范。

**范围约束：**

- 本 Story 交付"五色卡片渲染 + 类型专属操作按钮 + 状态变更 + 键盘导航"
- 不涉及过滤器、排序、微对话（Story 4.3）
- 不涉及跨角色通知或待决策协作流程（Story 4.4）
- "修改"/"查看"/"回复"三类操作为 Alpha 阶段 placeholder

## 信息架构

### 功能入口位置

```text
项目工作空间 → SOP 阶段 4（方案撰写）→ proposal-writing 三栏工作区
┌────────┬──────────────────────────────┬──────────────────┐
│ 文档   │  编辑器主内容区                │ 智能批注面板       │
│ 大纲树 │                              │ ┌──────────────┐ │
│        │                              │ │ 批注   3 待处理│ │
│ 240px  │                              │ ├──────────────┤ │
│        │                              │ │ ▌AI 建议卡片  │ │
│        │  方案正文 + AI 生成章节        │ │ ▌资产推荐卡片  │ │
│        │                              │ │ ▌评分预警卡片  │ │
│        │                              │ │ ▌对抗攻击卡片  │ │
│        │                              │ │ ▌人工批注卡片  │ │
│        │                              │ └──────────────┘ │
│        │                              │     320px        │
└────────┴──────────────────────────────┴──────────────────┘
```

### 组件层级

```text
ProjectWorkspace (proposal-writing scope)
├── DocumentOutlineTree
├── EditorView
│   └── PlateEditor
└── AnnotationPanel (本 Story 升级)
    ├── PanelHeader ("批注" + pill 计数器)
    ├── AnnotationCard × N (新增组件)
    │   ├── CardHeader (类型图标 + 文字标签 + 作者 · 时间)
    │   ├── CardContent (批注正文，3行 clamp)
    │   └── CardActions (类型专属操作按钮组)
    └── KeyboardNavigation (焦点管理 + 快捷操作)
```

---

## 五色编码系统

### 颜色定义（精确 hex 值）

| 批注类型 | 类型标识 | 颜色 hex | 中文标签 | 图标组件 |
|---------|---------|---------|---------|---------|
| AI 建议 | `ai-suggestion` | `#1677FF` 蓝 | AI 建议 | AnnotationAiIcon |
| 资产推荐 | `asset-recommendation` | `#52C41A` 绿 | 资产推荐 | AnnotationAssetIcon |
| 评分预警 | `score-warning` | `#FAAD14` 橙 | 评分预警 | AnnotationScoreIcon |
| 对抗攻击 | `adversarial` | `#FF4D4F` 红 | 对抗攻击 | AnnotationAttackIcon |
| 人工批注 | `human` | `#722ED1` 紫 | 人工批注 | AnnotationHumanIcon |
| 跨角色 | `cross-role` | `#722ED1` 紫 | 跨角色 | AnnotationHumanIcon (复用) |

### 三重编码（UX-DR24 无障碍）

每张批注卡片同时通过三种方式传达类型信息，不单靠颜色区分：

1. **图标**：类型专属图标，颜色使用对应 hex 值
2. **颜色**：卡片左边框 3px + 图标颜色
3. **文字标签**：Ant Design Tag 组件显示类型名称（如"AI 建议"）

---

## 页面流与交互状态

### AnnotationCard 状态机

```text
                    ┌────────────────────┐
                    │ pending (待处理)    │
                    │ opacity: 1.0       │
                    │ 操作按钮组可见       │
                    └──────┬─────────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
    正向操作按钮     驳回操作按钮     标记待决策
    (采纳/插入/     (驳回/忽略/     (标记待决策/
     处理/接受并修改/ 反驳)           请求指导)
     标记已处理)     │              │
            │              │              │
            ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────────┐
    │ accepted │  │ rejected │  │ needs-decision│
    │ 已采纳 ✓  │  │ 已驳回 ✗  │  │ 待决策 ⏳     │
    │ opacity  │  │ opacity  │  │ opacity       │
    │ 0.6      │  │ 0.6      │  │ 0.6           │
    │ 按钮隐藏  │  │ 按钮隐藏  │  │ 按钮隐藏      │
    └──────────┘  └──────────┘  └──────────────┘
```

### 类型专属操作按钮

| 类型 | 按钮 1 (primary) | 按钮 2 | 按钮 3 |
|------|-----------------|--------|--------|
| AI 建议 (蓝) | 采纳 → accepted | 驳回 → rejected | 修改 → placeholder |
| 资产推荐 (绿) | 插入 → accepted | 忽略 → rejected | 查看 → placeholder |
| 评分预警 (橙) | 处理 → accepted | 标记待决策 → needs-decision | — |
| 对抗攻击 (红) | 接受并修改 → accepted | 反驳 → rejected | 请求指导 → needs-decision |
| 人工/跨角色 (紫) | 标记已处理 → accepted | 回复 → placeholder | — |

---

## 组件规格

### AnnotationCard

**视觉规格：**

| 属性 | 值 |
|------|-----|
| 外层容器 | Frame，圆角 8px，背景 `#FFFFFF` |
| 左边框 | 3px 宽，颜色 = `ANNOTATION_TYPE_COLORS[type]` |
| 内边距 | 12px |
| 卡片间距 | 8px（列表中卡片之间） |
| 聚焦态 | 蓝色 2px outline (`#1677FF`)，offset 2px |

**Header 区域：**

| 属性 | 值 |
|------|-----|
| 布局 | 水平排列，垂直居中 |
| 图标 | 16×16px，颜色 = 类型色 |
| 类型标签 | Ant Design Tag，字号 12px，颜色 = 类型色 |
| 作者 · 时间 | 灰色文字 `#8C8C8C`，字号 12px，右对齐 |

**Content 区域：**

| 属性 | 值 |
|------|-----|
| 字号 | 13px |
| 行高 | 1.6 |
| 行数限制 | 3 行 clamp（`-webkit-line-clamp: 3`） |
| 溢出 | Tooltip 查看全文 |
| 文字颜色 | `#1F1F1F` |

**Action 区域：**

| 属性 | 值 |
|------|-----|
| 布局 | 水平排列，右对齐 |
| 按钮类型 | Ant Design Button size="small" |
| Primary 按钮 | type="primary"，使用类型色作为背景 |
| 其他按钮 | type="default" |
| 间距 | 8px |
| 可见性 | 仅 `status === 'pending'` 时显示 |

**已处理态：**

| 属性 | 值 |
|------|-----|
| 整体透明度 | 0.6 |
| 操作按钮 | 隐藏 |
| 状态标签 | 替代按钮区域显示，如"已采纳 ✓"、"已驳回 ✗"、"待决策 ⏳" |
| 状态标签颜色 | accepted=#52C41A, rejected=#FF4D4F, needs-decision=#FAAD14 |

**Data Test IDs：**

- `data-testid="annotation-card"` — 卡片容器
- `data-annotation-id={annotation.id}` — 批注 ID

---

### 键盘导航

| 快捷键 | 行为 | 条件 |
|--------|------|------|
| `Alt+↑` | 聚焦上一张卡片（到头循环到末尾） | 面板展开 + 有批注 |
| `Alt+↓` | 聚焦下一张卡片（到末循环到头部） | 面板展开 + 有批注 |
| `Alt+Enter` | 执行聚焦卡片的 primary 操作 | 聚焦卡片 status=pending |
| `Alt+Backspace` | 执行聚焦卡片的驳回操作 | 聚焦卡片 status=pending 且有 reject 按钮；评分预警/人工/跨角色无 reject 时 no-op + 轻量提示 |
| `Alt+D` | 标记聚焦卡片为 needs-decision | 聚焦卡片 status=pending |

**聚焦态视觉：**
- 蓝色 2px outline（`#1677FF`）
- 自动 `scrollIntoView({ block: 'nearest' })`
- 有批注时默认聚焦第一张卡片；列表变化后聚焦索引保持在有效范围内
- 仅在标准展开面板或 compact flyout 打开时响应键盘事件
- 当事件目标位于输入控件、contenteditable、`role="textbox"` 或编辑器内容区时不拦截，避免与编辑器快捷键冲突

---

### AnnotationPanel 壳层合同（不可更改）

| 属性 | 值 |
|------|-----|
| 展开宽度 | 320px |
| 折叠宽度 | 40px |
| 紧凑图标栏 | 48px + flyout |
| Header | "批注" 标题 + 蓝色 pill "N 待处理"（N=0 隐藏） |
| ARIA | `role="complementary"`, `aria-label="智能批注"`, `aria-live="polite"` |
| 状态 | loading / empty / list / error |
| data-testid | `annotation-panel` |

---

## 视觉设计

### 五色卡片列表

```text
AnnotationPanel (320px)
┌──────────────────────────────┐
│  批注                3 待处理  │  ← Header + pill
├──────────────────────────────┤
│ ▎🤖 AI 建议  系统助手 · 2分钟前 │  ← 蓝色左边框 + 图标 + Tag
│ ▎建议在系统架构描述中增加高可  │
│ ▎用集群部署说明，强化方案的…   │  ← 3行 clamp
│ ▎     [采纳] [驳回] [修改]    │  ← 操作按钮组
├──────────────────────────────┤
│ ▎📦 资产推荐  资产库 · 5分钟前  │  ← 绿色左边框
│ ▎推荐复用"XX项目"中的数据库   │
│ ▎高可用架构章节，匹配度 87%… │
│ ▎     [插入] [忽略] [查看]    │
├──────────────────────────────┤
│ ▎⚠️ 评分预警  评分引擎 · 8分前  │  ← 橙色左边框
│ ▎"安全保障措施"章节缺失，该   │
│ ▎项在评分模型中权重 15%…      │
│ ▎         [处理] [标记待决策]  │
├──────────────────────────────┤
│ ▎🎯 对抗攻击  对抗引擎 · 12分前 │  ← 红色左边框  opacity:0.6
│ ▎已采纳 ✓                     │  ← 已处理状态标签
├──────────────────────────────┤
│ ▎👤 人工批注  张工 · 1小时前    │  ← 紫色左边框
│ ▎注意第三章需要补充国产化替…   │
│ ▎   [标记已处理] [回复]        │
└──────────────────────────────┘
```

### 聚焦态

```text
┌──────────────────────────────┐  ← 蓝色 2px outline
│ ▎🤖 AI 建议  系统助手 · 2分钟前 │
│ ▎建议在系统架构描述中增加高可  │
│ ▎用集群部署说明，强化方案的…   │
│ ▎     [采纳] [驳回] [修改]    │
└──────────────────────────────┘
  Alt+↑/↓ 切换  Alt+Enter 采纳  Alt+Backspace 驳回
```

---

## 无障碍

| 要求 | 实现方式 |
|------|---------|
| 三重编码 | 图标 + 颜色 + 文字标签（不单靠颜色） |
| 键盘完全可操作 | Alt+↑↓ 导航 + Alt+Enter/Backspace/D 操作 |
| 屏幕阅读器 | 卡片 `aria-label` 包含类型+作者+摘要 |
| 焦点可见 | 2px 蓝色 outline |
| 状态通知 | `aria-live="polite"` 面板级别 |
| 颜色对比 | 所有色值满足 WCAG AA（4.5:1 对比度） |

---

## 响应式行为

| 视口宽度 | AnnotationPanel 行为 |
|----------|---------------------|
| ≥1920px | 展开 320px，完整卡片列表 |
| 1366-1920px | 展开 320px 或自动折叠为 48px 图标栏 |
| <1366px | 自动折叠为 48px 图标栏 + flyout 展开 |

---

## 边界与约束

1. **壳层合同不可更改**：320px/40px/48px 尺寸、header、pill 计数器、loading / empty / list / error 状态均由 Story 4.1 固定
2. **不新建 store**：使用已有 `annotationStore` 的 CRUD actions
3. **不新增 IPC**：使用 Story 4.1 的 `annotation:update` 通道
4. **Placeholder 操作**：修改/查看/回复 Alpha 阶段仅 `message.info` 提示
5. **cross-role 复用紫色**：与 human 共享颜色和图标，仅文字标签区分
6. **已处理不隐藏**：opacity 0.6 降低视觉权重，仍在列表中可见
