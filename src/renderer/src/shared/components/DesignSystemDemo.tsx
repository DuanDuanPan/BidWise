import { Button, Card, Tag, Steps, Table } from 'antd'
import {
  AnnotationAiIcon,
  AnnotationAssetIcon,
  AnnotationScoreIcon,
  AnnotationAttackIcon,
  AnnotationHumanIcon,
  SopAnalysisIcon,
  SopDesignIcon,
  SopWritingIcon,
  SopCostIcon,
  SopReviewIcon,
  SopDeliveryIcon,
  CrossfireIcon,
  SourceAssetIcon,
  SourceKnowledgeIcon,
  SourceAiIcon,
} from './icons'
import { formatShortcut, modKey } from '../lib/platform'
import { colors, bgColors, annotationColors, sopColors } from '../../theme/tokens'

function ColorSwatch({ name, color }: { name: string; color: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <div className="h-8 w-8 rounded-md border border-gray-200" style={{ background: color }} />
      <div>
        <div className="text-body-small font-medium">{name}</div>
        <div className="text-caption text-gray-400">{color}</div>
      </div>
    </div>
  )
}

export function DesignSystemDemo(): React.JSX.Element {
  return (
    <div className="bg-bg-global min-h-screen p-6" data-testid="design-system-demo">
      <h1 className="text-h1 mb-6">Design System Demo</h1>

      {/* 色彩系统 */}
      <section className="mb-8">
        <h2 className="text-h2 mb-4">色彩系统</h2>

        <div className="mb-4">
          <h3 className="text-h3 mb-2">品牌色 & 语义色</h3>
          <div className="flex flex-wrap gap-4" data-testid="color-palette">
            <ColorSwatch name="品牌主色" color={colors.brand} />
            <ColorSwatch name="品牌浅色" color={colors.brandLight} />
            <ColorSwatch name="成功" color={colors.success} />
            <ColorSwatch name="警告" color={colors.warning} />
            <ColorSwatch name="危险" color={colors.danger} />
            <ColorSwatch name="信息" color={colors.info} />
          </div>
        </div>

        <div className="mb-4">
          <h3 className="text-h3 mb-2">批注五色</h3>
          <div className="flex flex-wrap gap-4" data-testid="annotation-colors">
            <ColorSwatch name="AI建议" color={annotationColors.ai} />
            <ColorSwatch name="资产推荐" color={annotationColors.asset} />
            <ColorSwatch name="评分预警" color={annotationColors.score} />
            <ColorSwatch name="对抗攻击" color={annotationColors.attack} />
            <ColorSwatch name="人工批注" color={annotationColors.human} />
          </div>
        </div>

        <div className="mb-4">
          <h3 className="text-h3 mb-2">SOP 状态色</h3>
          <div className="flex flex-wrap gap-4" data-testid="sop-colors">
            <ColorSwatch name="空闲" color={sopColors.idle} />
            <ColorSwatch name="进行中" color={sopColors.active} />
            <ColorSwatch name="完成" color={sopColors.done} />
            <ColorSwatch name="警告" color={sopColors.warning} />
          </div>
        </div>

        <div>
          <h3 className="text-h3 mb-2">底色分层</h3>
          <div className="flex gap-4" data-testid="bg-colors">
            <div className="bg-bg-global rounded-md border border-gray-200 p-4">
              <span className="text-body-small">全局底色 {bgColors.global}</span>
            </div>
            <div className="bg-bg-content rounded-md border border-gray-200 p-4">
              <span className="text-body-small">内容底色 {bgColors.content}</span>
            </div>
            <div className="bg-bg-sidebar rounded-md border border-gray-200 p-4">
              <span className="text-body-small">侧栏底色 {bgColors.sidebar}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 排版层级 */}
      <section className="mb-8">
        <h2 className="text-h2 mb-4">排版层级</h2>
        <div className="bg-bg-content rounded-lg p-6 shadow-sm" data-testid="typography">
          <p className="text-h1">H1 — 24px / 600 / 1.4</p>
          <p className="text-h2">H2 — 20px / 600 / 1.4</p>
          <p className="text-h3">H3 — 17px / 600 / 1.5</p>
          <p className="text-h4">H4 — 15px / 600 / 1.6</p>
          <p className="text-body">Body — 14px / 400 / 1.8</p>
          <p className="text-body-proposal">Body Proposal — 14px / 400 / 1.8（方案正文）</p>
          <p className="text-body-small">Body Small — 12px / 400 / 1.6</p>
          <p className="text-caption">Caption — 12px / 400 / 1.4</p>
          <p className="text-body-small mt-4 font-mono">JetBrains Mono — 等宽字体</p>
        </div>
      </section>

      {/* 间距可视化 */}
      <section className="mb-8">
        <h2 className="text-h2 mb-4">间距系统 (8px 基准网格)</h2>
        <div className="flex items-end gap-2" data-testid="spacing">
          {[
            { name: 'xs', size: '4px' },
            { name: 'sm', size: '8px' },
            { name: 'md', size: '16px' },
            { name: 'lg', size: '24px' },
            { name: 'xl', size: '32px' },
            { name: '2xl', size: '48px' },
          ].map((s) => (
            <div key={s.name} className="flex flex-col items-center">
              <div className="bg-brand mb-1" style={{ width: s.size, height: s.size }} />
              <span className="text-caption">{s.name}</span>
              <span className="text-caption text-gray-400">{s.size}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Ant Design 组件 */}
      <section className="mb-8">
        <h2 className="text-h2 mb-4">Ant Design 组件 + Tailwind 共存</h2>
        <div className="flex flex-wrap gap-4" data-testid="antd-components">
          <Card title="Card 标题" className="w-72">
            <p className="text-body">Card 内容，使用 Tailwind text-body class</p>
            <div className="mt-2 flex gap-1">
              <Tag color="blue">标签A</Tag>
              <Tag color="green">标签B</Tag>
              <Tag color="orange">标签C</Tag>
            </div>
          </Card>
          <div className="flex flex-col gap-2">
            <Button type="primary">主按钮</Button>
            <Button>默认按钮</Button>
            <Button type="dashed">虚线按钮</Button>
            <Button type="text">文本按钮</Button>
          </div>
        </div>
        <div className="mt-4">
          <Steps
            size="small"
            current={1}
            items={[
              { title: '需求分析' },
              { title: '方案设计' },
              { title: '方案撰写' },
              { title: '交付归档' },
            ]}
          />
        </div>
        <div className="mt-4">
          <Table
            size="small"
            dataSource={[
              { key: '1', name: 'Token', value: '--color-brand', usage: '品牌主色' },
              { key: '2', name: 'Token', value: '--spacing-md', usage: '中等间距 16px' },
            ]}
            columns={[
              { title: '名称', dataIndex: 'name', key: 'name' },
              { title: '值', dataIndex: 'value', key: 'value' },
              { title: '用途', dataIndex: 'usage', key: 'usage' },
            ]}
            pagination={false}
          />
        </div>
      </section>

      {/* AC-5: Tailwind 覆盖 Ant Design 样式 */}
      <section className="mb-8">
        <h2 className="text-h2 mb-4">Tailwind 覆盖 Ant Design 示例</h2>
        <div className="flex flex-wrap gap-4" data-testid="tailwind-override">
          <Button type="primary" className="rounded-full px-8">
            圆角覆盖按钮
          </Button>
          <Card className="border-brand w-72 border-2 !shadow-none" title="Tailwind 覆盖 Card">
            <p className="text-body text-brand">品牌色文字 (Tailwind text-brand 覆盖 Ant Design)</p>
          </Card>
        </div>
      </section>

      {/* 自定义图标 */}
      <section className="mb-8">
        <h2 className="text-h2 mb-4">自定义图标</h2>

        <div className="mb-4">
          <h3 className="text-h3 mb-2">批注类型 (1rem / 1.25rem)</h3>
          <div className="flex flex-wrap gap-6" data-testid="annotation-icons">
            {[
              { Icon: AnnotationAiIcon, name: 'AI建议', color: annotationColors.ai },
              { Icon: AnnotationAssetIcon, name: '资产推荐', color: annotationColors.asset },
              { Icon: AnnotationScoreIcon, name: '评分预警', color: annotationColors.score },
              { Icon: AnnotationAttackIcon, name: '对抗攻击', color: annotationColors.attack },
              { Icon: AnnotationHumanIcon, name: '人工批注', color: annotationColors.human },
            ].map(({ Icon, name, color }) => (
              <div key={name} className="flex flex-col items-center gap-1">
                <div className="flex gap-2">
                  <Icon size="1rem" color={color} />
                  <Icon size="1.25rem" color={color} />
                </div>
                <span className="text-caption">{name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <h3 className="text-h3 mb-2">SOP 阶段</h3>
          <div className="flex flex-wrap gap-6" data-testid="sop-icons">
            {[
              { Icon: SopAnalysisIcon, name: '需求分析' },
              { Icon: SopDesignIcon, name: '方案设计' },
              { Icon: SopWritingIcon, name: '方案撰写' },
              { Icon: SopCostIcon, name: '成本评估' },
              { Icon: SopReviewIcon, name: '评审打磨' },
              { Icon: SopDeliveryIcon, name: '交付归档' },
            ].map(({ Icon, name }) => (
              <div key={name} className="flex flex-col items-center gap-1">
                <div className="flex gap-2">
                  <Icon size="1rem" />
                  <Icon size="1.25rem" />
                </div>
                <span className="text-caption">{name}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-h3 mb-2">其他图标</h3>
          <div className="flex flex-wrap gap-6" data-testid="other-icons">
            {[
              { Icon: CrossfireIcon, name: '交叉火力' },
              { Icon: SourceAssetIcon, name: '资产库' },
              { Icon: SourceKnowledgeIcon, name: '知识库' },
              { Icon: SourceAiIcon, name: 'AI推理' },
            ].map(({ Icon, name }) => (
              <div key={name} className="flex flex-col items-center gap-1">
                <div className="flex gap-2">
                  <Icon size="1rem" />
                  <Icon size="1.25rem" />
                </div>
                <span className="text-caption">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 动效 Token */}
      <section className="mb-8">
        <h2 className="text-h2 mb-4">动效 Token</h2>
        <div className="bg-bg-content rounded-lg p-6 shadow-sm" data-testid="animation-tokens">
          <div className="text-body-small space-y-1">
            <p>
              <code className="font-mono">--duration-micro: 150ms</code> — 微交互
            </p>
            <p>
              <code className="font-mono">--duration-panel: 300ms</code> — 面板过渡
            </p>
            <p>
              <code className="font-mono">--duration-content: 350ms</code> — 内容过渡
            </p>
            <p>
              <code className="font-mono">--duration-complex: 500ms</code> — 复杂动画
            </p>
            <p>
              <code className="font-mono">--ease-out</code> — cubic-bezier(0, 0, 0.2, 1)
            </p>
            <p>
              <code className="font-mono">--ease-in-out</code> — cubic-bezier(0.4, 0, 0.2, 1)
            </p>
          </div>
        </div>
      </section>

      {/* 跨平台 */}
      <section className="mb-8">
        <h2 className="text-h2 mb-4">跨平台工具</h2>
        <div className="bg-bg-content rounded-lg p-6 shadow-sm" data-testid="platform-utils">
          <p className="text-body">
            修饰键: <code className="font-mono">{modKey}</code>
          </p>
          <p className="text-body">
            快捷键示例: <code className="font-mono">{formatShortcut('Ctrl+S')}</code> (保存)
          </p>
          <p className="text-body">
            快捷键示例: <code className="font-mono">{formatShortcut('Ctrl+Shift+P')}</code>{' '}
            (命令面板)
          </p>
        </div>
      </section>
    </div>
  )
}
