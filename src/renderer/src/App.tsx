import { ConfigProvider, App as AntApp } from 'antd'
import { StyleProvider } from '@ant-design/cssinjs'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { antdTheme } from './theme/antdTheme'
import { ProjectKanban, ProjectWorkspace } from '@modules/project'
import { useAnalysisTaskMonitor } from '@modules/analysis/hooks/useAnalysis'

function App(): React.JSX.Element {
  useAnalysisTaskMonitor()

  return (
    <StyleProvider layer>
      <ConfigProvider theme={antdTheme}>
        <AntApp>
          <HashRouter>
            <Routes>
              <Route path="/" element={<ProjectKanban />} />
              <Route path="/project/:id" element={<ProjectWorkspace />} />
            </Routes>
          </HashRouter>
        </AntApp>
      </ConfigProvider>
    </StyleProvider>
  )
}

export default App
