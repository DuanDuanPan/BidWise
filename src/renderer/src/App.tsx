import { ConfigProvider, App as AntApp } from 'antd'
import { StyleProvider } from '@ant-design/cssinjs'
import { antdTheme } from './theme/antdTheme'
import { DesignSystemDemo } from './shared/components/DesignSystemDemo'

function App(): React.JSX.Element {
  return (
    <StyleProvider layer>
      <ConfigProvider theme={antdTheme}>
        <AntApp>
          <div data-testid="app-root">
            <DesignSystemDemo />
          </div>
        </AntApp>
      </ConfigProvider>
    </StyleProvider>
  )
}

export default App
