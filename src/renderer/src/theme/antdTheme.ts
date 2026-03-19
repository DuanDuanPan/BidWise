import type { ThemeConfig } from 'antd'
import { colors, bgColors, radius, shadows, fontFamily, spacing } from './tokens'

export const antdTheme: ThemeConfig = {
  token: {
    // 品牌色
    colorPrimary: colors.brand,
    colorSuccess: colors.success,
    colorWarning: colors.warning,
    colorError: colors.danger,
    colorInfo: colors.info,

    // 背景
    colorBgContainer: bgColors.content,
    colorBgLayout: bgColors.global,

    // 圆角
    borderRadius: radius.md,
    borderRadiusSM: radius.sm,
    borderRadiusLG: radius.lg,

    // 阴影（极简）
    boxShadow: shadows.sm,
    boxShadowSecondary: shadows.md,

    // 字体
    fontFamily: fontFamily.sans,
    fontFamilyCode: fontFamily.mono,
    fontSize: 14,
    lineHeight: 1.8,

    // 间距
    marginXS: spacing.xs,
    marginSM: spacing.sm,
    margin: spacing.md,
    marginLG: spacing.lg,
    marginXL: spacing.xl,
    paddingXS: spacing.xs,
    paddingSM: spacing.sm,
    padding: spacing.md,
    paddingLG: spacing.lg,
    paddingXL: spacing.xl,

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
      paddingLG: spacing.lg,
    },
  },
}
