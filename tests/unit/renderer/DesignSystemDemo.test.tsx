import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DesignSystemDemo } from '@renderer/shared/components/DesignSystemDemo'

describe('DesignSystemDemo', () => {
  afterEach(() => {
    cleanup()
  })

  it('should render the demo page', () => {
    render(<DesignSystemDemo />)
    expect(screen.getByTestId('design-system-demo')).toBeInTheDocument()
  })

  it('should include color palette section', () => {
    render(<DesignSystemDemo />)
    expect(screen.getByTestId('color-palette')).toBeInTheDocument()
  })

  it('should include annotation colors section', () => {
    render(<DesignSystemDemo />)
    expect(screen.getByTestId('annotation-colors')).toBeInTheDocument()
  })

  it('should include typography section', () => {
    render(<DesignSystemDemo />)
    expect(screen.getByTestId('typography')).toBeInTheDocument()
  })

  it('should include icon sections', () => {
    render(<DesignSystemDemo />)
    expect(screen.getByTestId('annotation-icons')).toBeInTheDocument()
    expect(screen.getByTestId('sop-icons')).toBeInTheDocument()
    expect(screen.getByTestId('other-icons')).toBeInTheDocument()
  })

  it('should include Ant Design components section', () => {
    render(<DesignSystemDemo />)
    expect(screen.getByTestId('antd-components')).toBeInTheDocument()
  })

  it('should include Tailwind override Ant Design section', () => {
    render(<DesignSystemDemo />)
    expect(screen.getByTestId('tailwind-override')).toBeInTheDocument()
  })

  it('should include animation tokens section', () => {
    render(<DesignSystemDemo />)
    expect(screen.getByTestId('animation-tokens')).toBeInTheDocument()
  })

  it('should include platform utils section', () => {
    render(<DesignSystemDemo />)
    expect(screen.getByTestId('platform-utils')).toBeInTheDocument()
  })
})
