import { ConfigProvider, App as AntApp } from 'antd'
import { StyleProvider } from '@ant-design/cssinjs'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { antdTheme } from './theme/antdTheme'
import { ProjectKanban, ProjectWorkspace } from '@modules/project'
import { AssetSearchPage } from '@modules/asset'
import { useAnalysisTaskMonitor } from '@modules/analysis/hooks/useAnalysis'
import { CommandPaletteProvider } from '@renderer/shared/command-palette'

function App(): React.JSX.Element {
  useAnalysisTaskMonitor()

  return (
    <StyleProvider layer>
      <ConfigProvider theme={antdTheme}>
        <AntApp>
          <HashRouter>
            <CommandPaletteProvider>
              <Routes>
                <Route path="/" element={<ProjectKanban />} />
                <Route path="/project/:id" element={<ProjectWorkspace />} />
                <Route path="/asset" element={<AssetSearchPage />} />
              </Routes>
            </CommandPaletteProvider>
          </HashRouter>
        </AntApp>
      </ConfigProvider>
    </StyleProvider>
  )
}

export default App
