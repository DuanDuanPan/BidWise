# UX Specification: Story 3-8 — Mermaid 架构图草图生成

## Overview

在方案编辑器中内嵌 Mermaid 架构图生成能力，让售前工程师通过文字快速描述架构，系统自动渲染为可视化图表。与 draw.io (Story 3-7) 互补：draw.io 用于精细交互式绘图，Mermaid 用于快速文本描述生成草图。

## Target Pages / Screens

| Screen | State | Description |
|--------|-------|-------------|
| Screen 1 | 默认态 — 工具栏含"插入 Mermaid 图表"按钮 | 编辑器工具栏左侧新增"插入 Mermaid 图表"按钮，位于"插入架构图"(draw.io) 旁边 |
| Screen 2 | 编辑态 — 代码编辑区 + 实时预览区 | 点击按钮后插入 Mermaid void element，自动进入编辑模式，上半区代码编辑、下半区 SVG 预览 |
| Screen 3 | 预览态 — SVG 图表收起 | 编辑完成后代码区收起，仅显示渲染后的 SVG 图表 + 标题行 + "编辑"/"删除"按钮 |
| Screen 4 | 错误态 — 语法错误优雅提示 | 输入无效 Mermaid 语法时，预览区显示行号+错误描述，保留上次成功 SVG 作为背景 |

## Key Interactions

### 插入 Mermaid 图表
- 触发：点击工具栏"插入 Mermaid 图表"按钮（`@ant-design/icons` 图标 + 文字）
- 行为：在编辑器光标位置插入空白 Mermaid void element
- 自动进入编辑态，代码区预填充示例模板 `graph TD\n  A[开始] --> B[结束]`
- 按钮在编辑器无焦点或无可用插入位置时 disabled

### 实时渲染预览
- 用户在代码编辑区（textarea，等宽字体）输入 Mermaid 语法
- 500ms 防抖后自动调用 `mermaid.render()` 渲染 SVG
- 渲染不在输入事件同步路径执行，避免阻塞编辑器输入响应
- 使用递增 render counter 忽略过期渲染结果
- 每次渲染使用唯一 DOM ID（`mermaid-${diagramId}-${counter}`）

### 语法错误处理
- 捕获 `mermaid.parse()` / `mermaid.render()` 异常
- 预览区显示可读错误提示：行号（若可用）+ 错误描述
- 保留上一次成功渲染的 SVG 作为背景（降低挫败感）
- 不导致编辑器崩溃或白屏

### 编辑/预览模式切换
- 编辑→预览：点击"完成"按钮 / 点击 void element 外部
- 预览→编辑：双击 SVG 图表 / 点击"编辑"按钮
- 切换到预览模式时：更新 Plate node data + IPC 保存 SVG 资产
- 保存失败不丢失 Markdown 中的 source，显示非阻塞 warning

### 标题编辑
- 预览模式下点击标题文本 → 变为可编辑 input
- 失焦后保存标题到 void element 的 `caption` 字段

### 删除图表
- 预览模式下点击"删除"按钮 → 弹出确认对话框（Ant Design Modal.confirm）
- 确认后移除 Slate void element 节点
- 尽力删除 assets/ 中的 SVG 文件（IPC，不阻塞）

## Acceptance Criteria Mapping

| AC | Screen | Visual Verification |
|----|--------|-------------------|
| AC1 | Screen 1→2 | 工具栏按钮触发插入，代码区+预览区展开，模板预填充 |
| AC2 | Screen 2 | 输入 Mermaid 语法后 500ms 防抖渲染 SVG |
| AC3 | Screen 4 | 无效语法显示行号+错误，保留上次成功 SVG |
| AC4 | Screen 2↔3 | 完成/编辑按钮切换，双击 SVG 重新编辑 |
| AC5 | — | Markdown 序列化（非视觉，不原型化） |
| AC6 | — | SVG 资产持久化（非视觉，不原型化） |
| AC7 | Screen 3 | 删除按钮移除区块并触发资产清理 |
| AC8 | Screen 3 | 标题可编辑，失焦保存 |

## Visual & Layout Constraints

### Toolbar
- 沿用 Story 3-6 EditorToolbar 布局
- 左侧新增"插入 Mermaid 图表"按钮，位于"插入架构图"(draw.io) 按钮右侧
- 仅使用 `@ant-design/icons` 图标体系 + "插入 Mermaid 图表" 文字
- 按钮样式：32px 高，cornerRadius 4，hover 态 `$brand-light` 背景

### Mermaid 编辑区块（编辑态 — Screen 2）
- 块级 void element，独占一行
- 蓝色 2px 实线边框（以当前 PNG / `.pen` 原型为准）
- 上半区：代码编辑区
  - `<textarea>` 等宽字体（`"Cascadia Code", "Fira Code", monospace"`）
  - 浅色背景 `#f8f9fa`，padding 12px
  - 最小高度 120px，可自动增长
  - 行号显示（左侧 gutter）
- 下半区：SVG 实时预览
  - 白色背景，padding 16px
  - 预览区最小高度 200px
  - 渲染中显示加载指示器
- 底部工具栏：
  - 左侧："完成"按钮（主按钮样式，`$brand` 背景）
  - 右侧：图表类型提示文字（灰色，如"Mermaid 架构图"）

### Mermaid 预览区块（预览态 — Screen 3）
- 浅灰背景 `bg-gray-50`，圆角 8px（与 draw.io 预览态一致）
- SVG 图表居中显示，max-height 400px，溢出滚动
- 底部标题行：
  - 标题文字（可编辑，点击变为 input）
  - "编辑"按钮 + "删除"按钮
  - 背景 `$bg-content`，padding 8px 12px
- 选中态：蓝色实线边框 2px `$brand`

### 错误态（Screen 4）
- 预览区顶部显示红色错误横幅
  - 红色左边框 3px + 浅红背景
  - 错误图标 + 行号 + 错误描述文字
- 错误横幅下方保留上次成功渲染的 SVG（半透明叠加，opacity 0.4）
- 代码编辑区不受影响，可继续编辑

## Information Architecture

```
EditorToolbar
├── [已有] 格式按钮组
├── [已有] "插入架构图" (draw.io) 按钮
├── [新增] "插入 Mermaid 图表" 按钮
└── [已有] 文风选择器

MermaidElement (void element)
├── 编辑模式
│   ├── CodeEditor (textarea + 行号)
│   ├── MermaidRenderer (SVG 预览)
│   │   ├── 成功态：SVG innerHTML
│   │   ├── 错误态：错误横幅 + 上次成功 SVG
│   │   └── 加载态：spinner
│   └── ActionBar ("完成"按钮)
└── 预览模式
    ├── SVG 图表（居中，max-height 400px）
    ├── Caption (可编辑标题)
    └── ActionBar ("编辑" + "删除"按钮)
```

## Data Flow

```
用户点击"插入 Mermaid 图表"
  ↓
EditorToolbar → PlateEditor.insertMermaid()
  ↓
MermaidElement 渲染 → 自动进入编辑模式（预填充模板）
  ↓
用户在 textarea 输入 Mermaid 源码
  ↓ 500ms 防抖
MermaidRenderer → mermaid.render(uniqueId, source) → SVG
  ↓
预览区 innerHTML 注入 SVG
  ↓
用户点击"完成" / 点击外部
  ↓
更新 Plate node data → IPC: mermaid:save-asset → assets/{assetFileName}
  ↓
编辑器自动保存 → Markdown 序列化 → HTML 注释 + 围栏代码块
```

## Design System Tokens

沿用项目设计变量：
- `$text-primary`, `$text-secondary` — 文字颜色
- `$bg-content`, `$bg-global` — 背景色
- `$brand`, `$brand-light` — 品牌色 / 品牌浅色
- `$border` — 边框色
- `$info` — 信息色
- `$success` — 成功色
- `$error` — 错误色（错误横幅）
- Font body: `"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`
- Font code: `"Cascadia Code", "Fira Code", "SF Mono", monospace`
- Screen width: 1200px

## Comparison with draw.io (Story 3-7)

| 维度 | draw.io (3-7) | Mermaid (3-8) |
|------|---------------|---------------|
| 编辑 UI | iframe 内嵌编辑器 | 代码 textarea + SVG 预览 |
| 渲染 | iframe 内部 | 本地 mermaid.js |
| 预览态 | PNG 缩略图 | SVG 图表 |
| 错误处理 | iframe 内部处理 | 宿主层错误横幅 |
| 资产格式 | .drawio + .png | 仅 .svg |
| 编辑态高度 | 固定 500px (iframe) | 代码区自适应 + 预览区 min 200px |
| 共同点 | 蓝色 2px 实线边框、浅灰预览背景、标题可编辑、编辑/删除按钮 |
