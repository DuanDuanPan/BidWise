/**
 * Design Token — 单一事实源 (SSoT)
 *
 * globals.css @theme 中的 CSS 自定义属性值必须与此文件保持同步。
 * antdTheme.ts 和所有组件均从此文件引用颜色/间距等 token。
 */

// ─── 品牌色 & 语义色 ───
export const colors = {
  brand: '#1677ff',
  brandLight: '#f0f5ff',
  success: '#52c41a',
  warning: '#faad14',
  danger: '#ff4d4f',
  info: '#1677ff',
} as const

// ─── 背景色 ───
export const bgColors = {
  global: '#fafafa',
  content: '#ffffff',
  sidebar: '#f5f5f5',
  hover: '#f0f0f0',
} as const

// ─── 批注五色 ───
export const annotationColors = {
  ai: '#1677ff',
  asset: '#52c41a',
  score: '#faad14',
  attack: '#ff4d4f',
  human: '#722ed1',
} as const

// ─── SOP 阶段状态色 ───
export const sopColors = {
  idle: '#d9d9d9',
  active: '#1677ff',
  done: '#52c41a',
  warning: '#faad14',
} as const

// ─── 间距 ───
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const

// ─── 圆角 ───
export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
} as const

// ─── 阴影 ───
export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
  md: '0 1px 4px 0 rgba(0, 0, 0, 0.05)',
  modal:
    '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
} as const

// ─── 动效时长 ───
export const duration = {
  micro: 150,
  panel: 300,
  content: 350,
  complex: 500,
} as const

// ─── 字体 ───
export const fontFamily = {
  sans: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  mono: '"JetBrains Mono", "Cascadia Code", "Consolas", monospace',
} as const
