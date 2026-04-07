# Story 3-6: 文风模板与军工用语控制 — UX 设计规格

## 概述

本设计规格定义文风模板选择功能在方案撰写阶段的交互行为，覆盖从文风选择到 AI 生成内容应用文风约束的完整流程。设计遵循 Lovart 风格预设一键切换模式——用户在编辑器工具栏右侧选择文风，新生成的章节自动应用所选文风规范。

**范围约束：**

- 本 Story 交付的是"文风选择 UI + 文风持久化 + prompt 文风约束注入"
- 不涉及术语库自动替换（Story 5-3）或实时合规检测（Beta 阶段）
- 已生成章节不自动重新生成，仅新生成/重新生成时应用文风

## 信息架构

### 功能入口位置

```text
项目工作空间 → SOP 阶段 4（方案撰写）→ proposal-writing 三栏工作区
┌────────┬──────────────────────────────┬─────────────────┐
│ 文档   │  编辑器主内容区                │ 智能批注         │
│ 大纲树 │  ┌──────────────────────┐     │ 侧边栏          │
│        │  │ 工具栏     [文风选择▾] │ ←── 工具栏右侧区域
│ 240px  │  │                      │     │ 320px           │
│        │  │ H1/H2 标题            │     │                 │
│        │  │ 方案正文内容           │     │                 │
│        │  └──────────────────────┘     │                 │
└────────┴──────────────────────────────┴─────────────────┘
```

### 组件层级

```text
ProjectWorkspace (proposal-writing scope)
├── DocumentOutlineTree
├── EditorView
│   ├── EditorToolbar ← Story 3.6 新增轻量 toolbar；当前代码尚无现成 toolbar
│   │   ├── toolbarLeftSlot（预留；禁止添加未接线的假格式按钮）
│   │   └── WritingStyleSelector ← 新增组件（右侧区域）
│   └── PlateEditor
│       └── ...chapter content...
└── AnnotationPanel
```

---

## 页面流与交互状态

### 状态机

```text
                    ┌──────────────────────┐
                    │ 初始态               │
                    │ writingStyleId 未设置 │
                    │ → 默认显示"通用文风"  │
                    └──────────┬───────────┘
                               │ 用户在工具栏选择文风
                               ▼
                    ┌──────────────────────┐
                    │ 文风已选择            │
                    │ writingStyleId 持久化 │
                    │ Toast: "新文风将在下   │
                    │  次生成章节时生效"     │
                    └──────────┬───────────┘
                               │ 用户触发章节生成（Story 3.4 流程）
                               ▼
                    ┌──────────────────────┐
                    │ AI 生成应用文风约束    │
                    │ prompt 注入用语规范、  │
                    │ 禁用词、句式约束、语气 │
                    └──────────────────────┘
```

### 场景 1：首次进入方案编辑

1. 用户进入 SOP 阶段 4（方案撰写），加载 EditorView
2. WritingStyleSelector 初始化：
   a. 调用 `window.api.writingStyleList()` 获取可用文风列表
   b. 调用 `window.api.documentGetMetadata({ projectId })` 读取 `writingStyleId`
   c. 若 `writingStyleId` 未设置或为空，默认选中 `'general'`（通用文风）
3. 选择器显示当前文风名称（如"通用文风"）

### 场景 2：切换文风

1. 用户点击 WritingStyleSelector 下拉
2. 展示可用文风列表：
   - 每项显示文风名称（如"军工文风"）
   - 悬停时 Tooltip 显示描述（如"严谨精确的军工方案用语规范"）
   - 当前选中项有 ✓ 标记
3. 用户选择新文风（如"军工文风"）
4. 调用 `window.api.writingStyleUpdateProject({ projectId, writingStyleId: 'military' })`
5. `message.info('新文风将在下次生成章节时生效')`
6. 已有章节内容不变——仅后续生成/重新生成受影响

### 场景 3：AI 生成应用文风

1. 用户在某章节点击"AI 生成"按钮（Story 3.4 已有流程）
2. 系统自动加载当前项目文风模板
3. 将文风约束注入 prompt：
   - 语气要求（如"严谨、精确、客观、权威"）
   - 用语规范（如"使用'保障'不用'保证'"）
   - 禁用词列表（如"非常""特别好""大概"）
   - 句式约束（如"多用'本系统''本方案'主语"）
   - 示例段落
4. AI 生成的内容自动符合所选文风要求

### 场景 4：公司级自定义文风

1. 管理员在 `company-data/writing-styles/` 放置自定义文风 JSON
2. 系统扫描时自动发现并加入文风列表
3. 公司级文风同 id 覆盖内置文风
4. 用户在 WritingStyleSelector 中看到合并后的完整列表

---

## 组件规格

### WritingStyleSelector

**位置：** 编辑器工具栏右侧区域

**代码边界：** 当前仓库的 `EditorView.tsx` / `PlateEditor.tsx` 尚无现成工具栏；本 Story 新增轻量 `EditorToolbar` 外壳并把 `WritingStyleSelector` 放在右侧。左侧格式化按钮若未接入真实 Plate 命令，应留空或作为后续插槽，不显示不可操作按钮。

**视觉规格：**

| 属性 | 值 |
|------|-----|
| 组件类型 | Ant Design `Select` (compact mode) |
| 宽度 | 120px（最小），自适应文风名称长度 |
| 高度 | 32px（与工具栏其他控件对齐） |
| 字号 | 13px |
| 前缀图标 | `EditOutlined` (Ant Design Icon) |
| 下拉位置 | bottomRight |
| 边框 | 无边框样式（`variant="borderless"`），hover 时显示底部线 |
| 背景 | 透明 |

**下拉列表项：**

| 属性 | 值 |
|------|-----|
| 每项高度 | 36px |
| 左侧 | 文风名称（如"军工文风"） |
| 右侧 | 来源标签：内置显示无标签，公司级显示灰色 `Tag`"自定义" |
| 描述 | Tooltip 显示完整描述文案 |
| 选中标记 | Ant Design 默认 ✓ 图标 |

**内置文风选项：**

| ID | 名称 | 描述 |
|----|------|------|
| `general` | 通用文风 | 专业清晰的通用技术写作规范 |
| `military` | 军工文风 | 严谨精确的军工方案用语规范 |
| `government` | 政企文风 | 稳重规范的政企文案写作风格 |

**交互行为：**

1. **初始化**：读取项目 metadata → 设置选中值 → fallback 到 `'general'`
2. **切换选择**：调用 IPC 更新 → 显示 info toast → 本地状态同步
3. **加载态**：首次加载文风列表时显示 `loading` 状态
4. **错误处理**：文风列表加载失败时使用缓存或显示默认 `'general'`
5. **无效 metadata**：metadata 中的 `writingStyleId` 不在文风列表时，UI fallback 到 `'general'`，但不自动重写 metadata

**Data Test IDs：**

- `data-testid="writing-style-selector"` — 选择器容器
- `data-testid="writing-style-option-{id}"` — 每个文风选项

---

### Toast 反馈

| 触发 | Toast 类型 | 文案 | 时长 |
|------|-----------|------|------|
| 切换文风成功 | `message.info` | "新文风将在下次生成章节时生效" | 3s |
| 切换文风失败 | `message.error` | "文风切换失败，请重试" | 5s |

---

## 视觉设计

### 工具栏集成

```text
EditorToolbar
┌─────────────────────────────────────────────────────────────┐
│  [B] [I] [U] [H1▾] [列表] [链接] [代码] │ ← 间隔 → │ ✏ 通用文风 ▾ │
└─────────────────────────────────────────────────────────────┘
                                                     ↑
                                              WritingStyleSelector
                                              无边框、紧凑、不抢焦点
```

### 文风选择下拉

```text
┌───────────────────────────┐
│  ✓  通用文风               │  ← 当前选中
│     军工文风               │
│     政企文风               │
│  ─────────────────────── │  ← 分隔线（仅有公司级时显示）
│     XX 行业文风    自定义   │  ← 公司级文风 + Tag
└───────────────────────────┘
```

### 文风切换后 Toast

```text
┌──────────────────────────────────────┐
│ ℹ️ 新文风将在下次生成章节时生效        │
└──────────────────────────────────────┘
```

---

## 无障碍

| 要求 | 实现方式 |
|------|---------|
| 键盘可操作 | Select 组件原生支持 Tab/Enter/↑↓ 导航 |
| 屏幕阅读器 | `aria-label="选择写作风格"` |
| 颜色对比 | 文字使用默认 Ant Design 色值，满足 WCAG AA |
| 状态通知 | Toast 使用 `aria-live="polite"` |

---

## 响应式行为

| 视口宽度 | 行为 |
|----------|------|
| ≥1920px | 完整显示文风名称 + 图标 |
| 1366-1920px | 完整显示文风名称 |
| <1366px | 仅显示图标 + Tooltip 显示当前文风名称 |

---

## 数据模型

### WritingStyleTemplate

```typescript
type WritingStyleId = string

interface WritingStyleTemplate {
  id: WritingStyleId           // 'military' | 'government' | 'general' | custom
  name: string                 // 显示名："军工文风"
  description: string          // 描述："严谨精确的军工方案用语规范"
  version: string              // "1.0.0"
  toneGuidance: string         // 语气要求描述
  vocabularyRules: string[]    // 用语规范列表
  forbiddenWords: string[]     // 禁用词列表
  sentencePatterns: string[]   // 句式约束列表
  exampleSnippet?: string      // 示例段落
  source: 'built-in' | 'company'
}

// JSON 文件格式；source 由 service 根据加载目录派生
type WritingStyleFileData = Omit<WritingStyleTemplate, 'source'>
```

### ProposalMetadata 扩展

```typescript
interface ProposalMetadata {
  // ...existing fields...
  writingStyleId?: WritingStyleId  // 新增：当前项目文风选择
}
```

---

## 边界与约束

1. **已生成章节不受影响**：切换文风后，已有章节内容不变。仅新生成/重新生成时应用新文风
2. **文风是 prompt 参数**：不新建独立 Agent，文风作为 generate-chapter prompt 的条件区块注入
3. **公司级覆盖内置**：同 id 的公司级文风覆盖内置文风，用户无感知
4. **默认文风**：未设置时 fallback 到 `'general'`（通用文风），不强制用户选择
5. **Alpha 边界**：文风约束通过 prompt 引导 AI 遵循，非运行时强制检查
6. **工具栏边界**：本 Story 只新增文风选择所需 toolbar 外壳，不交付新的粗体/斜体/标题等编辑命令
