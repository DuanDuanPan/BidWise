import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRenderAsync = vi.fn()

vi.mock('docx-preview', () => ({
  renderAsync: (...args: unknown[]) => mockRenderAsync(...args),
}))

import {
  base64ToArrayBuffer,
  renderDocxPreview,
  clearPreview,
  getRenderedPageCount,
} from '@modules/export/lib/docx-preview-adapter'

describe('docx-preview-adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRenderAsync.mockResolvedValue(undefined)
  })

  describe('base64ToArrayBuffer', () => {
    it('converts base64 string to ArrayBuffer', () => {
      const base64 = btoa('hello world')
      const buffer = base64ToArrayBuffer(base64)
      const view = new Uint8Array(buffer)
      const decoded = String.fromCharCode(...view)
      expect(decoded).toBe('hello world')
    })
  })

  describe('renderDocxPreview', () => {
    it('calls renderAsync with correct options', async () => {
      const container = document.createElement('div')
      const base64 = btoa('fake docx')

      await renderDocxPreview(base64, container)

      expect(mockRenderAsync).toHaveBeenCalledWith(expect.any(ArrayBuffer), container, container, {
        inWrapper: true,
        ignoreLastRenderedPageBreak: false,
      })
    })

    it('uses separate style container when provided', async () => {
      const body = document.createElement('div')
      const style = document.createElement('div')
      const base64 = btoa('fake')

      await renderDocxPreview(base64, body, style)

      expect(mockRenderAsync).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        body,
        style,
        expect.any(Object)
      )
    })
  })

  describe('clearPreview', () => {
    it('clears container innerHTML', () => {
      const container = document.createElement('div')
      container.innerHTML = '<div>content</div>'
      clearPreview(container)
      expect(container.innerHTML).toBe('')
    })
  })

  describe('getRenderedPageCount', () => {
    it('returns count of .docx sections inside .docx-wrapper', () => {
      const container = document.createElement('div')
      const wrapper = document.createElement('div')
      wrapper.className = 'docx-wrapper'
      const section1 = document.createElement('section')
      section1.className = 'docx'
      const section2 = document.createElement('section')
      section2.className = 'docx'
      wrapper.appendChild(section1)
      wrapper.appendChild(section2)
      container.appendChild(wrapper)

      expect(getRenderedPageCount(container)).toBe(2)
    })

    it('returns undefined when no pages found', () => {
      const container = document.createElement('div')
      expect(getRenderedPageCount(container)).toBeUndefined()
    })
  })
})
