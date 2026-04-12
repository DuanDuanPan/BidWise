import { ConfigProvider, App as AntApp } from 'antd'
import { StyleProvider } from '@ant-design/cssinjs'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { antdTheme } from './theme/antdTheme'
import { ProjectKanban, ProjectWorkspace } from '@modules/project'
import { AssetModuleContainer } from '@modules/asset'
import { useAnalysisTaskMonitor } from '@modules/analysis/hooks/useAnalysis'
import { useReviewTaskMonitor } from '@modules/review/hooks/useReviewTaskMonitor'
import { CommandPaletteProvider } from '@renderer/shared/command-palette'

function App(): React.JSX.Element {
  useAnalysisTaskMonitor()
  useReviewTaskMonitor()

  return (
    <StyleProvider layer>
      <ConfigProvider theme={antdTheme}>
        <AntApp>
          <HashRouter>
            <CommandPaletteProvider>
              <Routes>
                <Route path="/" element={<ProjectKanban />} />
                <Route path="/project/:id" element={<ProjectWorkspace />} />
                <Route path="/asset" element={<AssetModuleContainer />} />
              </Routes>
            </CommandPaletteProvider>
          </HashRouter>
        </AntApp>
      </ConfigProvider>
    </StyleProvider>
  )
}

export default App
