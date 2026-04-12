import { useState } from 'react'
import { Segmented } from 'antd'
import { AssetSearchPage } from './AssetSearchPage'
import { TerminologyPage } from './TerminologyPage'

type Tab = '资产库' | '术语库'

export function AssetModuleContainer(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('资产库')

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5' }}>
      <div style={{ padding: '16px 24px 0' }}>
        <Segmented
          options={['资产库', '术语库']}
          value={activeTab}
          onChange={(val) => setActiveTab(val as Tab)}
        />
      </div>
      <div style={{ display: activeTab === '资产库' ? 'block' : 'none' }}>
        <AssetSearchPage />
      </div>
      <div style={{ display: activeTab === '术语库' ? 'block' : 'none' }}>
        <TerminologyPage />
      </div>
    </div>
  )
}
