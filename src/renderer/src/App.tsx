import { ConfigProvider, App as AntApp } from 'antd'
import { StyleProvider } from '@ant-design/cssinjs'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { antdTheme } from './theme/antdTheme'
import { ProjectKanban } from '@modules/project'

function App(): React.JSX.Element {
  return (
    <StyleProvider layer>
      <ConfigProvider theme={antdTheme}>
        <AntApp>
          <HashRouter>
            <Routes>
              <Route path="/" element={<ProjectKanban />} />
              <Route
                path="/project/:id"
                element={
                  <div className="flex h-screen items-center justify-center text-gray-400">
                    项目工作空间（开发中）
                  </div>
                }
              />
            </Routes>
          </HashRouter>
        </AntApp>
      </ConfigProvider>
    </StyleProvider>
  )
}

export default App
