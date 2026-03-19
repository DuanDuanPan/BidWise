# Story 1.4: UI 框架与设计系统基础

Status: review

## Story

As a 售前工程师,
I want 视觉一致、专业克制的应用界面,
so that 我可以在长时间工作中保持舒适，信息层级清晰。

## Acceptance Criteria (验收标准)

1. **AC-1: Design Token 完整配置**
   - Given 应用启动
   - When 界面渲染
   - Then Ant Design 5.x 组件使用定制 Design Token 展示（减少边框/阴影、加大留白），ConfigProvider 覆盖 Ant Design 全局 token（colorPrimary、borderRadius、boxShadow、fontFamily、间距等）
   - Then Tailwind `@theme` 中定义的自定义 token 与 Ant Design ConfigProvider token 数值一致（单一事实源）
   - [Source: epics.md Story 1.4 AC — UX-DR1, UX-DR2]

2. **AC-2: 色彩系统完整**
   - Given 色彩系统已配置
   - When 查看界面元素
   - Then 品牌主色 `#1677FF`、语义色（成功绿 `#52C41A` / 警告橙 `#FAAD14` / 危险红 `#FF4D4F` / 信息蓝 `#1677FF`）、界面底色分层（全局 `#FAFAFA` / 内容 `#FFFFFF` / 侧栏 `#F5F5F5`）正确应用
   - Then 批注五色编码（蓝/绿/橙/红/紫 `#722ED1`）和 SOP 阶段状态色（灰 `#D9D9D9`/蓝/绿/橙）作为 Tailwind 自定义色和 CSS 变量可用
   - [Source: ux-design-specification.md §色彩系统 — UX-DR3]

3. **AC-3: 字体系统与排版层级**
   - Given 用户在 Windows 或 macOS 上运行
   - When 文本渲染
   - Then 正文使用系统中文字体（PingFang SC / Microsoft YaHei），代码/技术参数使用 JetBrains Mono
   - Then 排版层级完整：H1(24px/600)、H2(20px/600)、H3(16px/600)、H4(14px/600)、Body(14px/400/行高1.8)、Body-Small(12px/400)、Caption(12px/400)
   - Then 每个层级均有对应的 Tailwind utility class 或 CSS class 可用
   - [Source: ux-design-specification.md §字体系统 — UX-DR4]

4. **AC-4: 间距系统**
   - Given 间距系统已配置
   - When 布局渲染
   - Then 遵循 8px 基准网格（xs-4px / sm-8px / md-16px / lg-24px / xl-32px / 2xl-48px）
   - Then 间距 token 在 Tailwind 和 Ant Design 中同时生效
   - [Source: ux-design-specification.md §间距与布局基础 — UX-DR5]

5. **AC-5: Tailwind + Ant Design 共存无冲突**
   - Given Tailwind CSS 已集成
   - When 与 Ant Design 组件共存
   - Then 无样式冲突，CSS `@layer` 优先级正确（`theme < base < antd < components < utilities`）
   - Then 可以用 Tailwind utility 覆盖 Ant Design 组件的特定样式
   - **验证方式：** 编写一个 Demo 页面同时包含 Ant Design Button/Card/Tag 和 Tailwind 自定义样式，确认无冲突
   - [Source: epics.md Story 1.4 AC]

6. **AC-6: 跨平台一致性**
   - Given 用户在 Windows 和 macOS 上运行
   - When 对比界面行为
   - Then 提供 `isMac` 检测 utility，快捷键展示自动 Ctrl↔Cmd 适配
   - Then 使用 rem + SVG 图标实现高 DPI 自动适配
   - [Source: epics.md Story 1.4 AC — NFR28, UX-DR26]

7. **AC-7: 自定义图标集**
   - Given 自定义图标需求
   - When 设计系统配置
   - Then 包含批注类型图标（5 个：AI建议/资产推荐/评分预警/对抗攻击/人工批注）、SOP 阶段图标（6 个：需求分析/方案设计/方案撰写/成本评估/评审打磨/交付归档）、交叉火力图标（1 个）、来源类型图标（3 个：资产库/知识库/AI推理）
   - Then 图标为 SVG React 组件，支持 16px/20px 双尺寸，线性风格 1.5px 线宽圆角端点
   - [Source: ux-design-specification.md §图标系统 — UX-DR22]

8. **AC-8: 动效基础 token**
   - Given 动效系统已配置
   - When 查看 CSS 变量
   - Then 动效时长 token 可用：微交互(150-200ms)、面板过渡(300ms)、内容过渡(300-400ms)、复杂动画(500ms)
   - Then 缓动曲线 token 可用：`ease-out`、`ease-in-out`
   - [Source: ux-design-specification.md §动效规范]

## Tasks / Subtasks (任务分解)

- [x] **Task 1: 扩展 Design Token 系统** (AC: #1, #2, #4, #8)
  - [x] 1.1 扩展 `globals.css` 中 `@theme` 块：添加批注五色（`--color-annotation-ai`, `--color-annotation-asset`, `--color-annotation-score`, `--color-annotation-attack`, `--color-annotation-human`）、SOP 状态四色（`--color-sop-idle`, `--color-sop-active`, `--color-sop-done`, `--color-sop-warning`）、品牌辅色 `--color-brand-light: #F0F5FF`
  - [x] 1.2 添加动效时长 token 到 `@theme`：`--duration-micro: 150ms`、`--duration-panel: 300ms`、`--duration-content: 350ms`、`--duration-complex: 500ms`
  - [x] 1.3 添加缓动曲线 CSS 变量（`@theme` 不支持 transition-timing-function，放 `@layer base` 里的 `:root`）：`--ease-out`、`--ease-in-out`
  - [x] 1.4 添加圆角 token：`--radius-sm: 4px`、`--radius-md: 6px`、`--radius-lg: 8px`
  - [x] 1.5 添加阴影 token（极简风格）：`--shadow-sm`、`--shadow-md`

- [x] **Task 2: 完善 Ant Design 主题配置** (AC: #1, #2, #3, #4)
  - [x] 2.1 在 `App.tsx` 中扩展 ConfigProvider theme 的 `token` 字段：补齐 colorSuccess/colorWarning/colorError/colorInfo、controlHeight、padding/margin 相关 token、wireframe: false
  - [x] 2.2 添加 `components` 级 token 覆盖（Ant Design 5.x Component Token）：Button（减少阴影）、Card（减少边框、增大内间距）、Steps（后续 Story 1.6 使用）
  - [x] 2.3 将主题配置提取为独立文件 `src/renderer/src/theme/antdTheme.ts`，导出 `ThemeConfig` 对象
  - [x] 2.4 确认 Ant Design token 数值与 Tailwind `@theme` 数值对齐（单一事实源）

- [x] **Task 3: 排版系统** (AC: #3)
  - [x] 3.1 在 `globals.css` 的 `@layer components` 中定义排版 utility classes：`.text-h1` 到 `.text-caption`，每个 class 包含 font-size、font-weight、line-height
  - [x] 3.2 确保方案正文行高 1.8（区别于常规 UI 的 1.5）——创建 `.text-body-proposal` class
  - [x] 3.3 JetBrains Mono 字体加载方式：在 `index.html` 添加 Google Fonts `<link>` 或本地字体文件（推荐本地，因为 Electron 桌面应用可能离线）
  - [x] 3.4 在 `resources/fonts/` 放置 JetBrains Mono woff2 文件，`globals.css` 中 `@font-face` 声明

- [x] **Task 4: 自定义图标组件** (AC: #7)
  - [x] 4.1 创建 `src/renderer/src/shared/components/icons/` 目录
  - [x] 4.2 创建 5 个批注类型 SVG 图标 React 组件：`AnnotationAiIcon`、`AnnotationAssetIcon`、`AnnotationScoreIcon`、`AnnotationAttackIcon`、`AnnotationHumanIcon`
  - [x] 4.3 创建 6 个 SOP 阶段 SVG 图标 React 组件：`SopAnalysisIcon`（放大镜）、`SopDesignIcon`（画笔）、`SopWritingIcon`（钢笔）、`SopCostIcon`（计算器）、`SopReviewIcon`（盾牌）、`SopDeliveryIcon`（发送）
  - [x] 4.4 创建交叉火力图标：`CrossfireIcon`（双箭头交叉或闪电）
  - [x] 4.5 创建 3 个来源类型图标：`SourceAssetIcon`、`SourceKnowledgeIcon`、`SourceAiIcon`
  - [x] 4.6 所有图标统一 props 接口：`{ size?: 16 | 20; className?: string; color?: string }`，默认 `currentColor`
  - [x] 4.7 创建 `src/renderer/src/shared/components/icons/index.ts` barrel 导出

- [x] **Task 5: 跨平台工具** (AC: #6)
  - [x] 5.1 创建 `src/renderer/src/shared/lib/platform.ts`：导出 `isMac: boolean`、`modKey: 'Cmd' | 'Ctrl'`、`formatShortcut(key: string): string`（自动 Ctrl↔Cmd 转换显示文本）
  - [x] 5.2 确保 SVG 图标使用 `em` 或固定 px + `viewBox` 实现高 DPI 适配

- [x] **Task 6: Demo 验证页面** (AC: #5, #1, #2, #3, #7, #8)
  - [x] 6.1 创建 `src/renderer/src/shared/components/DesignSystemDemo.tsx`：展示所有 Design Token 效果
  - [x] 6.2 Demo 内容包含：色彩面板（品牌色+语义色+批注色+SOP色+底色）、排版层级展示、间距可视化、Ant Design 组件（Button/Card/Tag/Steps/Table 各一个）+ Tailwind 自定义样式共存、所有自定义图标展示
  - [x] 6.3 在 `App.tsx` 中临时挂载 `<DesignSystemDemo />` 供视觉验收
  - [x] 6.4 验证 Ant Design 和 Tailwind 样式无冲突

- [x] **Task 7: 测试** (AC: #1-#8)
  - [x] 7.1 单元测试：`platform.ts` 的 `formatShortcut` 函数
  - [x] 7.2 组件测试：至少一个 Icon 组件可渲染、支持 size 和 className prop
  - [x] 7.3 组件测试：`DesignSystemDemo` 可渲染且包含关键 DOM 节点

## Dev Notes (开发指南)

### Story 1.1 已有基础（不要重复创建）

Story 1.1 已完成以下设施，本 Story 是在其基础上**扩展和完善**：

| 已有 | 文件 | 本 Story 的动作 |
|------|------|----------------|
| Ant Design 5.29.3 + @ant-design/cssinjs 已安装 | `package.json` | 不需要重新安装 |
| Tailwind v4 CSS-based 配置 | `postcss.config.js` | 不修改 |
| 基础 Design Token（品牌色/底色/间距/字体栈） | `globals.css` `@theme` 块 | **扩展**：添加批注五色、SOP四色、动效token、圆角、阴影 |
| ConfigProvider 基础主题 | `App.tsx` | **扩展**：提取到独立文件，补齐完整 token |
| StyleProvider layer CSS 层级兼容 | `App.tsx` | 不修改 |
| CSS `@layer` 声明 | `globals.css` 第一行 | 不修改（`theme, base, antd, components, utilities`） |

### 关键代码指引

#### 1. globals.css 扩展方向

当前 `globals.css` 已有：
```css
@layer theme, base, antd, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/preflight.css" layer(base);
@import "tailwindcss/utilities.css" layer(utilities);

@theme {
  --color-brand: #1677FF;
  --color-brand-light: #F0F5FF;  /* 已有则保留，没有则添加 */
  --color-success: #52C41A;
  --color-warning: #FAAD14;
  --color-danger: #FF4D4F;
  --color-info: #1677FF;
  --color-bg-global: #FAFAFA;
  --color-bg-content: #FFFFFF;
  --color-bg-sidebar: #F5F5F5;
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-2xl: 48px;
  --font-sans: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
  --font-mono: "JetBrains Mono", "Cascadia Code", "Consolas", monospace;
}
```

需要追加的 token（在同一 `@theme` 块内）：
```css
@theme {
  /* === 已有 token 保留 === */

  /* 批注五色 */
  --color-annotation-ai: #1677FF;
  --color-annotation-asset: #52C41A;
  --color-annotation-score: #FAAD14;
  --color-annotation-attack: #FF4D4F;
  --color-annotation-human: #722ED1;

  /* SOP 阶段状态色 */
  --color-sop-idle: #D9D9D9;
  --color-sop-active: #1677FF;
  --color-sop-done: #52C41A;
  --color-sop-warning: #FAAD14;

  /* 圆角 */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;

  /* 阴影（极简） */
  /* 注意：Tailwind v4 @theme 中 boxShadow 需用 --shadow-* 命名 */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.03);
  --shadow-md: 0 1px 4px 0 rgba(0, 0, 0, 0.05);

  /* 动效时长 */
  --duration-micro: 150ms;
  --duration-panel: 300ms;
  --duration-content: 350ms;
  --duration-complex: 500ms;
}
```

缓动曲线放 `@layer base`（`@theme` 不直接支持 `transition-timing-function`）：
```css
@layer base {
  :root {
    --ease-out: cubic-bezier(0, 0, 0.2, 1);
    --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  }
}
```

排版 utility classes 放 `@layer components`：
```css
@layer components {
  .text-h1 { font-size: 24px; font-weight: 600; line-height: 1.4; }
  .text-h2 { font-size: 20px; font-weight: 600; line-height: 1.4; }
  .text-h3 { font-size: 16px; font-weight: 600; line-height: 1.5; }
  .text-h4 { font-size: 14px; font-weight: 600; line-height: 1.5; }
  .text-body { font-size: 14px; font-weight: 400; line-height: 1.5; }
  .text-body-proposal { font-size: 14px; font-weight: 400; line-height: 1.8; }
  .text-body-small { font-size: 12px; font-weight: 400; line-height: 1.6; }
  .text-caption { font-size: 12px; font-weight: 400; line-height: 1.4; }
}
```

#### 2. Ant Design 主题提取

创建 `src/renderer/src/theme/antdTheme.ts`：
```typescript
import type { ThemeConfig } from 'antd'

export const antdTheme: ThemeConfig = {
  token: {
    // 品牌色
    colorPrimary: '#1677FF',
    colorSuccess: '#52C41A',
    colorWarning: '#FAAD14',
    colorError: '#FF4D4F',
    colorInfo: '#1677FF',

    // 背景
    colorBgContainer: '#FFFFFF',
    colorBgLayout: '#FAFAFA',

    // 圆角
    borderRadius: 6,
    borderRadiusSM: 4,
    borderRadiusLG: 8,

    // 阴影（极简）
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
    boxShadowSecondary: '0 1px 4px 0 rgba(0, 0, 0, 0.05)',

    // 字体
    fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
    fontFamilyCode: '"JetBrains Mono", "Cascadia Code", "Consolas", monospace',
    fontSize: 14,
    lineHeight: 1.5,

    // 间距（Ant Design 用 margin/padding token）
    marginXS: 4,
    marginSM: 8,
    margin: 16,
    marginLG: 24,
    marginXL: 32,
    paddingXS: 4,
    paddingSM: 8,
    padding: 16,
    paddingLG: 24,
    paddingXL: 32,

    // 尺寸
    controlHeight: 36,
    wireframe: false,
  },
  components: {
    Button: {
      boxShadow: 'none',
      primaryShadow: 'none',
    },
    Card: {
      paddingLG: 24,
    },
  },
}
```

然后 `App.tsx` 改为 `import { antdTheme } from './theme/antdTheme'`，ConfigProvider 用 `theme={antdTheme}`。

#### 3. 自定义 SVG 图标规范

所有图标统一接口：
```typescript
// src/renderer/src/shared/components/icons/types.ts
export interface IconProps {
  size?: 16 | 20
  className?: string
  color?: string
}
```

图标模板（每个图标一个文件）：
```tsx
// src/renderer/src/shared/components/icons/AnnotationAiIcon.tsx
import type { IconProps } from './types'

export function AnnotationAiIcon({ size = 16, className, color = 'currentColor' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* 线性风格，1.5px 线宽，圆角端点 */}
      <path
        d="..."
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
```

**图标设计指引（帮助 LLM 生成合理的 SVG path）：**

| 图标 | 视觉意象 | SVG 建议 |
|------|---------|---------|
| AnnotationAiIcon | 对话气泡 + 星号/闪电 | 圆角矩形气泡 + 内部星号 |
| AnnotationAssetIcon | 文件夹/盒子 | 打开的文件夹线条 |
| AnnotationScoreIcon | 仪表盘/量表 | 半圆弧 + 指针 |
| AnnotationAttackIcon | 盾牌 + 感叹号 | 盾牌轮廓 + 中心感叹号 |
| AnnotationHumanIcon | 用户/人形 | 头+肩膀线条 |
| SopAnalysisIcon | 放大镜 | 圆圈 + 斜线把手 |
| SopDesignIcon | 画笔 | 倾斜画笔线条 |
| SopWritingIcon | 钢笔/文档 | 笔尖或带线文档 |
| SopCostIcon | 计算器/币 | 简化计算器轮廓 |
| SopReviewIcon | 盾牌/审查 | 盾牌 + 勾号 |
| SopDeliveryIcon | 发送/箭头 | 纸飞机或向右箭头 |
| CrossfireIcon | 交叉冲突 | 双箭头交叉 ⚔ |
| SourceAssetIcon | 资产库 | 小数据库圆柱 |
| SourceKnowledgeIcon | 知识库 | 书本线条 |
| SourceAiIcon | AI 推理 | CPU/芯片线条 |

#### 4. JetBrains Mono 本地字体

Electron 桌面应用可能离线运行，不要用 Google Fonts CDN。

1. 下载 JetBrains Mono woff2：https://github.com/JetBrains/JetBrainsMono/releases
2. 放置到 `resources/fonts/JetBrainsMono-Regular.woff2`、`JetBrainsMono-Bold.woff2`
3. 在 `globals.css` 中声明（`@layer base` 内）：

```css
@layer base {
  @font-face {
    font-family: 'JetBrains Mono';
    src: url('/resources/fonts/JetBrainsMono-Regular.woff2') format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: 'JetBrains Mono';
    src: url('/resources/fonts/JetBrainsMono-Bold.woff2') format('woff2');
    font-weight: 700;
    font-style: normal;
    font-display: swap;
  }
}
```

**注意 Electron 中静态资源路径：** electron-vite 的 renderer 静态资源使用 `public` 目录或 `resources/` 需确认构建配置。如果 `resources/fonts/` 不被 vite 处理，可将字体文件放到 `src/renderer/public/fonts/` 或直接 `src/renderer/src/assets/fonts/` 并通过 `import` 引入 URL。推荐使用 `src/renderer/src/assets/fonts/` + CSS `url()` import 方式，让 Vite 处理路径。

#### 5. 跨平台工具

```typescript
// src/renderer/src/shared/lib/platform.ts
export const isMac = navigator.platform.toUpperCase().includes('MAC')
export const modKey = isMac ? 'Cmd' : 'Ctrl'

/**
 * 格式化快捷键显示文本，自动 Ctrl↔Cmd 适配
 * 输入 'Ctrl+K' → macOS 输出 '⌘K'，Windows 输出 'Ctrl+K'
 */
export function formatShortcut(shortcut: string): string {
  if (isMac) {
    return shortcut
      .replace(/Ctrl\+/gi, '⌘')
      .replace(/Alt\+/gi, '⌥')
      .replace(/Shift\+/gi, '⇧')
  }
  return shortcut
}
```

### 架构对齐

**新增文件（本 Story 范围）：**
```
src/renderer/src/
├── theme/
│   └── antdTheme.ts              ← Ant Design 主题配置（从 App.tsx 提取）
├── assets/
│   └── fonts/
│       ├── JetBrainsMono-Regular.woff2
│       └── JetBrainsMono-Bold.woff2
├── shared/
│   ├── components/
│   │   ├── icons/
│   │   │   ├── types.ts          ← IconProps 接口
│   │   │   ├── AnnotationAiIcon.tsx
│   │   │   ├── AnnotationAssetIcon.tsx
│   │   │   ├── AnnotationScoreIcon.tsx
│   │   │   ├── AnnotationAttackIcon.tsx
│   │   │   ├── AnnotationHumanIcon.tsx
│   │   │   ├── SopAnalysisIcon.tsx
│   │   │   ├── SopDesignIcon.tsx
│   │   │   ├── SopWritingIcon.tsx
│   │   │   ├── SopCostIcon.tsx
│   │   │   ├── SopReviewIcon.tsx
│   │   │   ├── SopDeliveryIcon.tsx
│   │   │   ├── CrossfireIcon.tsx
│   │   │   ├── SourceAssetIcon.tsx
│   │   │   ├── SourceKnowledgeIcon.tsx
│   │   │   ├── SourceAiIcon.tsx
│   │   │   └── index.ts          ← barrel 导出
│   │   └── DesignSystemDemo.tsx  ← 验证用 Demo 页面
│   └── lib/
│       └── platform.ts           ← 跨平台工具
```

**修改文件（本 Story 范围）：**
- `src/renderer/src/globals.css` — 扩展 `@theme` token + 排版 classes + `@font-face`
- `src/renderer/src/App.tsx` — 将内联 theme 替换为 `import { antdTheme }` + 临时挂载 Demo

### 关键约束

- **禁止** 创建 `tailwind.config.ts`——Tailwind v4 使用 CSS-based 配置（`@theme` 指令）
- **禁止** 用相对路径 `../../` 导入——使用 `@renderer/*`、`@shared/*`、`@modules/*` 别名
- **禁止** 使用 Google Fonts CDN——Electron 桌面应用需要本地字体
- **禁止** 修改 `postcss.config.js`——已在 Story 1.1 配置完成
- **Alpha 阶段**全白基础布局——SOP 深色顶栏和深色状态栏是 Beta 范围，本 Story 不实现
- Demo 页面是**临时**验收用，后续 Story 会替换为真实页面路由

### 命名规范速查

| 类别 | 规则 | 本 Story 示例 |
|------|------|-------------|
| React 组件 | PascalCase | `AnnotationAiIcon`, `DesignSystemDemo` |
| 组件文件 | PascalCase.tsx | `AnnotationAiIcon.tsx` |
| 工具函数 | camelCase | `formatShortcut`, `isMac` |
| 目录 | kebab-case | `icons/`, `theme/` |
| CSS class | kebab-case (Tailwind convention) | `.text-h1`, `.text-body-proposal` |
| Token 变量 | `--{category}-{name}` | `--color-annotation-ai`, `--duration-micro` |

### 禁止事项（Anti-Patterns）

- **禁止** 渲染进程直接 import Node.js 模块
- **禁止** 相对路径 import 超过 1 层（`../../` 违规）
- **禁止** throw 裸字符串（必须用 BidWiseError）
- **禁止** Loading 状态用 `isLoading` / `fetching` / `pending`（统一 `loading: boolean`）

### Previous Story Intelligence

**来自 Story 1.1 的关键经验：**

1. **Tailwind v4 重大变更**：不再有 `tailwind.config.ts`，全部在 CSS `@theme` 中配置。本 Story 继续在 `@theme` 块内扩展 token。
2. **Ant Design CSS 层级兼容**：`@ant-design/cssinjs` + `StyleProvider layer` 已配置，`@layer` 声明顺序为 `theme, base, antd, components, utilities`。Ant Design 在 `antd` 层，Tailwind utilities 在最高优先级 `utilities` 层——这意味着 Tailwind class 可以覆盖 Ant Design 样式。
3. **electron-vite 5 静态资源**：renderer 的静态资源放 `src/renderer/src/` 子目录，由 Vite 处理。字体文件推荐放 `src/renderer/src/assets/fonts/`。
4. **Ant Design 版本**：5.29.3（5.x 维护模式但稳定，6.x 已发布但架构指定 5.x）。
5. **React 19**：项目使用 React 19.2.1，所有组件必须兼容 React 19。

### Git Intelligence

最近 5 个 commit 反映 Story 1.1 完整生命周期：
- `16d21af` 添加 Claude 项目记忆文件
- `5d979cc` chore: story 1.1 done
- `b532a7e` feat: merge story/1-1 into main
- `462c436` fix: code review 第二轮残留修复 — data 目录名 + ESLint scripts 覆盖
- `f8dd42f` fix: code review 6 项修复 — sandbox/IPC/cold-start/alias/data-dir/lint-staged

**经验**：code review 发现了多轮问题，说明需要注意架构文档中的细节约束（目录名、配置一致性）。

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4 — AC 与 UX-DR 引用]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#设计系统基础 — Ant Design 5.x + Tailwind CSS 混合架构]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#视觉设计基础 — 色彩/字体/间距/动效/图标完整规范]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#设计方向决策 — Alpha 全白布局，Beta 深色 SOP/状态栏]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#组件策略 — Ant Design 覆盖 60%，自定义 40%]
- [Source: _bmad-output/planning-artifacts/architecture.md — 路径别名、命名规范、强制规则、反模式]
- [Source: _bmad-output/implementation-artifacts/story-1-1.md — Tailwind v4 / Ant Design CSS 层级兼容方案、已有 Design Token]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- jsdom 缺少 `window.getComputedStyle` 和 `window.matchMedia`，通过测试 setup 文件 mock 解决

### Completion Notes List

- Task 1: 扩展 globals.css @theme 块，添加批注五色、SOP 四色、圆角、阴影、动效时长 token，缓动曲线放 @layer base :root
- Task 2: 创建 antdTheme.ts 独立主题文件，包含完整 token（品牌色/语义色/圆角/阴影/字体/间距/尺寸）+ 组件级覆盖（Button/Card），App.tsx 改为 import 引用
- Task 3: 添加 8 个排版 utility class（text-h1 ~ text-caption + text-body-proposal），本地 JetBrains Mono woff2 字体 @font-face 声明
- Task 4: 创建 15 个 SVG 图标 React 组件（5 批注 + 6 SOP + 1 交叉火力 + 3 来源），统一 IconProps 接口，barrel 导出
- Task 5: platform.ts 跨平台工具（isMac/modKey/formatShortcut），图标使用固定 px + viewBox 高 DPI 适配
- Task 6: DesignSystemDemo 完整展示所有 Design Token、排版、间距、图标、Ant Design 组件 + Tailwind 共存、动效 token、跨平台工具
- Task 7: 34 个测试全部通过（platform 9 个、icons 7 个、DesignSystemDemo 8 个、App 2 个 + 既有 8 个）

### File List

**新增文件：**
- `src/renderer/src/theme/antdTheme.ts`
- `src/renderer/src/assets/fonts/JetBrainsMono-Regular.woff2`
- `src/renderer/src/assets/fonts/JetBrainsMono-Bold.woff2`
- `src/renderer/src/shared/components/icons/types.ts`
- `src/renderer/src/shared/components/icons/AnnotationAiIcon.tsx`
- `src/renderer/src/shared/components/icons/AnnotationAssetIcon.tsx`
- `src/renderer/src/shared/components/icons/AnnotationScoreIcon.tsx`
- `src/renderer/src/shared/components/icons/AnnotationAttackIcon.tsx`
- `src/renderer/src/shared/components/icons/AnnotationHumanIcon.tsx`
- `src/renderer/src/shared/components/icons/SopAnalysisIcon.tsx`
- `src/renderer/src/shared/components/icons/SopDesignIcon.tsx`
- `src/renderer/src/shared/components/icons/SopWritingIcon.tsx`
- `src/renderer/src/shared/components/icons/SopCostIcon.tsx`
- `src/renderer/src/shared/components/icons/SopReviewIcon.tsx`
- `src/renderer/src/shared/components/icons/SopDeliveryIcon.tsx`
- `src/renderer/src/shared/components/icons/CrossfireIcon.tsx`
- `src/renderer/src/shared/components/icons/SourceAssetIcon.tsx`
- `src/renderer/src/shared/components/icons/SourceKnowledgeIcon.tsx`
- `src/renderer/src/shared/components/icons/SourceAiIcon.tsx`
- `src/renderer/src/shared/components/icons/index.ts`
- `src/renderer/src/shared/components/DesignSystemDemo.tsx`
- `src/renderer/src/shared/lib/platform.ts`
- `tests/unit/renderer/platform.test.ts`
- `tests/unit/renderer/icons.test.tsx`
- `tests/unit/renderer/DesignSystemDemo.test.tsx`

**修改文件：**
- `src/renderer/src/globals.css` — 扩展 @theme token + @font-face + 排版 classes + 缓动曲线
- `src/renderer/src/App.tsx` — import antdTheme 替代内联主题 + 挂载 DesignSystemDemo
- `tests/unit/renderer/setup.ts` — 添加 matchMedia/getComputedStyle mock
- `tests/unit/renderer/App.test.tsx` — 适配新的 App 内容

### Change Log

- 2026-03-19: Story 文件创建，comprehensive context engine 分析完成
- 2026-03-19: 全部 7 个 Task 实现完成，34 个测试通过，ESLint 和 TypeScript 检查通过
