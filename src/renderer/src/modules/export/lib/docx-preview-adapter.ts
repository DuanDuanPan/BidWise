import { renderAsync } from 'docx-preview'

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

export async function renderDocxPreview(
  base64: string,
  bodyContainer: HTMLElement,
  styleContainer?: HTMLElement
): Promise<void> {
  const arrayBuffer = base64ToArrayBuffer(base64)
  await renderAsync(arrayBuffer, bodyContainer, styleContainer ?? bodyContainer, {
    inWrapper: true,
    ignoreLastRenderedPageBreak: false,
  })
}

export function clearPreview(container: HTMLElement): void {
  container.innerHTML = ''
}

export function getRenderedPageCount(container: HTMLElement): number | undefined {
  const pages = container.querySelectorAll('.docx-wrapper > section.docx')
  return pages.length > 0 ? pages.length : undefined
}
