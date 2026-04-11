import { useCallback, useState } from 'react'
import type { AssetImportContext } from '@modules/asset/components/AssetImportDialog'

interface UseAssetImportResult {
  isOpen: boolean
  importContext: AssetImportContext | null
  openImport: (context: AssetImportContext) => void
  closeImport: () => void
}

export function useAssetImport(): UseAssetImportResult {
  const [isOpen, setIsOpen] = useState(false)
  const [importContext, setImportContext] = useState<AssetImportContext | null>(null)

  const openImport = useCallback((context: AssetImportContext) => {
    setImportContext(context)
    setIsOpen(true)
  }, [])

  const closeImport = useCallback(() => {
    setIsOpen(false)
    setImportContext(null)
  }, [])

  return { isOpen, importContext, openImport, closeImport }
}
