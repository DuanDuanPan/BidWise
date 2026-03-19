import '@testing-library/jest-dom/vitest'

// Mock window.matchMedia for Ant Design responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Mock window.getComputedStyle for Ant Design Table (rc-table scrollbar measurement)
// jsdom doesn't implement this for pseudo-elements
window.getComputedStyle = (_elt: Element) => {
  return {
    getPropertyValue: () => '',
    overflow: '',
    overflowX: '',
    overflowY: '',
    display: 'block',
    width: '0px',
  } as unknown as CSSStyleDeclaration
}
