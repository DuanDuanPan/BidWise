# UX Specification: Story 3-7 — draw.io 架构图内嵌编辑

## Overview

在方案编辑器中内嵌 draw.io 架构图编辑能力，让售前工程师无需切换工具即可在方案中管理架构图。本 UX 覆盖插入、编辑、预览、重新编辑四个核心交互态。

## Target Pages / Screens

| Screen | State | Description |
|--------|-------|-------------|
| Screen 1 | 默认态 — 工具栏含"插入架构图"按钮 | 编辑器工具栏左侧新增"插入架构图"按钮，右侧保留文风选择器 |
| Screen 2 | 编辑态 — draw.io iframe 展开 | 点击"插入架构图"后，光标位置插入 draw.io 编辑区块，iframe 展开 |
| Screen 3 | 预览态 — PNG 缩略图收起 | 编辑完成后 iframe 收起，显示 PNG 缩略图 + 标题 + 编辑 / 删除按钮 |
| Screen 4 | 重编辑态 — 双击缩略图重新打开 | 双击缩略图或点击"编辑"按钮，iframe 重新展开并回填已有数据 |

## Key Interactions

### 插入架构图
- 触发：点击工具栏"插入架构图"按钮（图标 + 文字）
- 行为：在编辑器光标位置插入空白 draw.io void element
- 自动进入编辑态，展开 iframe
- 按钮在编辑器无焦点或无可用插入位置时 disabled

### draw.io iframe 编辑
- iframe 加载 `https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1`
- iframe sandbox: `allow-scripts allow-same-origin allow-popups`
- 宽度 100%，Alpha 阶段固定高度 500px，不实现拖拽改高
- postMessage 通信协议：init → load → save → export → exit
- 父页面只接受 `https://embed.diagrams.net` 的 JSON-string 消息，并对 `event.data` 做 safe-parse
- 编辑态截图中的保存 / 关闭控件映射为 draw.io embed mode 原生 Save / Exit 按钮；宿主层不重复叠加第二套按钮

### 保存与预览切换
- 用户在 draw.io 中保存 → 触发 PNG 导出 → 资产持久化成功后 iframe 收起
- 用户关闭且存在未保存修改时，先确认是否放弃修改，再允许收起到预览态
- 保存失败时保持编辑态，保留最近一次成功预览，并提示用户重试
- 预览态显示：PNG 缩略图 + 图表标题（可编辑）+ "编辑" / "删除" 按钮
- 数据持久化到 Plate void element + assets 目录（IPC 通道）
- 若重开文档时 `.drawio` / `.png` 资产缺失，区块显示 warning placeholder + "编辑" / "删除" 操作，不得导致整页崩溃

### 重新编辑
- 双击缩略图或点击"编辑"按钮
- iframe 重新展开，回填已有 XML 数据
- 编辑态与新建态一致

## Acceptance Criteria Mapping

| AC | Screen | Visual Verification |
|----|--------|-------------------|
| AC1 | Screen 1→2 | 工具栏按钮触发插入，iframe 嵌入 |
| AC2 | Screen 2→3 | postMessage 保存后 PNG 预览 |
| AC3 | Screen 3→4 | 双击缩略图或点击编辑按钮加载已有图表 |
| AC4 | Screen 2→3 | 保存后 iframe 收起为缩略图 |
| AC5 | — | Markdown 序列化（非视觉，不原型化） |
| AC6 | — | 反序列化恢复（非视觉，不原型化） |
| AC7 | Screen 2 | renderer CSP 放开 `frame-src`，iframe sandbox 与 exact-origin message 校验 |
| AC8 | Screen 3 | 删除按钮移除区块并触发资产清理 |

## Visual & Layout Constraints

### Toolbar
- 沿用 Story 3-6 EditorToolbar 布局
- 左侧新增"插入架构图"按钮（复用现有 `@ant-design/icons` / shared icon 体系 + "插入架构图" 文字）
- PNG 中出现的格式化按钮仅作视觉上下文示意，不属于本 Story 的必交付范围
- 按钮样式：32px 高，cornerRadius 4，hover 态 `$brand-light` 背景

### draw.io 编辑区块
- 块级 void element，独占一行
- 编辑态：蓝色虚线边框，iframe 高度 500px
- 预览态：浅灰背景，圆角 8px，内含 PNG 缩略图 + 标题行 + 操作栏
- 选中态：蓝色实线边框 2px `$brand`

### 缩略图预览
- PNG 图片居中显示，max-height 300px
- 底部标题行：标题文字（可编辑）+ "编辑" 按钮 + "删除" 按钮
- 标题行背景 `$bg-content`，padding 8px 12px

### 安全指示器
- iframe 编辑态右上角：锁图标 + "安全沙箱" 文字，表示 CSP 限制

## Design System Tokens

沿用项目设计变量：
- `$text-primary`, `$text-secondary` — 文字颜色
- `$bg-content`, `$bg-global` — 背景色
- `$brand`, `$brand-light` — 品牌色 / 品牌浅色
- `$border` — 边框色
- `$info` — 信息色
- `$success` — 成功色
- Font: `"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`
- Screen width: 1200px
