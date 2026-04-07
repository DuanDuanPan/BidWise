# UX Specification: Story 4-3 — 智能批注面板与上下文优先级排序

## Overview

将批注面板从"平铺列表"升级为"上下文感知的智能面板"——根据 SOP 阶段、编辑位置和批注类型动态排序，提供类型/状态双重过滤，处理过载场景，并增加"向系统提问"微对话能力。

## Target Pages / Screens

| Screen | State | Description |
|--------|-------|-------------|
| Screen 1 | 智能面板默认态 | 类型过滤器（5色圆点）+ 状态过滤器（待处理/已处理/待决策）+ 上下文排序列表 + 计数器 |
| Screen 2 | 过载应急面板 | 待处理批注 >15 时弹出三选项面板：逐条处理 / 补充上下文重新生成 / 仅查看高优先级 |
| Screen 3 | 零批注态 + 向系统提问 | 章节级零批注消息 + 底部"向系统提问"入口展开后输入区域 |
| Screen 4 | 向系统提问 Streaming 回答 | 输入问题后以任务进度 + 本地 progressive reveal 呈现回答，完成后自动创建 AI 批注 |

## Key Interactions

### 类型过滤器
- 5 个着色圆点按钮（蓝/绿/橙/红/紫），默认全选
- 紫色按钮同时控制 `human` + `cross-role`
- Toggle 切换：选中态实心圆 + 外圈高亮 / 未选中态空心圆 + opacity 0.4
- Tooltip 显示类型名称

### 状态过滤器
- 三标签：待处理（默认）/ 已处理 / 待决策
- 每个标签显示数量 Badge
- Badge 数量基于“当前章节 scope + 当前类型过滤”计算
- 实时递减

### 上下文排序
- 当前章节存在时，面板默认只展示当前章节批注；其他章节批注不在默认视图中出现
- 排序优先级：① pending 优先 ② SOP 阶段权重 ③ 时间 DESC
- SOP 阶段权重映射：撰写→AI建议置顶，评审→对抗置顶

### 过载应急
- 触发：当前章节 scope 下、当前类型过滤后的 pending 批注 >15 且状态标签为“待处理”
- 横幅 + 三选项卡片：[A] 逐条处理 [B] 补充上下文（Alpha 占位）[C] 高优先级摘要

### 向系统提问
- 面板底部固定按钮
- 展开输入区：TextArea + 提交
- Story 4.3 Alpha 使用任务进度 + 完成后本地 progressive reveal 呈现 Streaming 风格回答
- 完成后自动创建 ai-suggestion 批注

### 章节联动
- 编辑器切换章节 → 面板自动切换到当前章节 scope
- 零批注显示："本章节 AI 审查完毕，未发现需要您关注的问题"

## Acceptance Criteria Mapping

| AC | Screen | Visual Verification |
|----|--------|-------------------|
| AC1 | Screen 1 | SOP 阶段排序——撰写态 AI 建议置顶 |
| AC2 | Screen 1 | 5 色圆点 + 三标签状态过滤 + Badge 计数 |
| AC3 | Screen 3 | 章节级零批注消息 |
| AC4 | Screen 2 | 过载应急面板三选项 |
| AC5 | Screen 1 | 各状态计数器（待处理 N / 已处理 N / 待决策 N） |
| AC6 | Screen 3, 4 | 向系统提问入口 + Streaming 回答 |
| AC7 | Screen 1 | 章节联动切换（当前章节 scope 自动更新） |

## Visual & Layout Constraints

### Panel Layout
- 沿用 Story 4.1/4.2 shell 合同：320px 宽（expanded）
- Header: 40px 高，含标题 + PendingPill
- 过滤器区域：固定在列表上方，约 68px 高
- 列表区域：可滚动
- 底部：向系统提问按钮固定

### 过滤器
- 类型圆点：16px 直径，使用五色编码
- 状态标签：Segmented 样式，12px 字体 + Badge 计数
- 水平排列，padding 8px 12px

### 过载面板
- 横幅：警告色背景，位于过滤器下方、列表上方
- 三选项卡片：垂直排列，圆角 8px

### 向系统提问
- 底部固定区域：44px 高按钮
- 展开后：TextArea 3 行 + 提交按钮
- Streaming 区域：气泡样式，品牌色边框

## Design System Tokens

沿用项目设计变量：
- `$annotation-ai` (#1677FF), `$annotation-asset` (#52C41A), `$annotation-score` (#FAAD14), `$annotation-attack` (#FF4D4F), `$annotation-human` (#722ED1)
- `$text-primary`, `$text-secondary`, `$bg-content`, `$bg-global`, `$brand`, `$brand-light`, `$border`
- Panel width: 320px (expanded)
