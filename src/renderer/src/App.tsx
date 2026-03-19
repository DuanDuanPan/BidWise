import { ConfigProvider, App as AntApp, Typography } from 'antd'
import { StyleProvider } from '@ant-design/cssinjs'

const theme = {
  token: {
    colorPrimary: '#1677FF',
    colorBgContainer: '#FFFFFF',
    colorBgLayout: '#FAFAFA',
    borderRadius: 6,
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
    boxShadowSecondary: '0 1px 4px 0 rgba(0, 0, 0, 0.05)',
    fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
    fontSize: 14,
    lineHeight: 1.5,
  },
}

function App(): React.JSX.Element {
  return (
    <StyleProvider layer>
      <ConfigProvider theme={theme}>
        <AntApp>
          <div
            className="bg-bg-global flex h-screen items-center justify-center"
            data-testid="app-root"
          >
            <Typography.Title level={2}>BidWise</Typography.Title>
          </div>
        </AntApp>
      </ConfigProvider>
    </StyleProvider>
  )
}

export default App
