import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { AnnotationAiIcon, SopAnalysisIcon, CrossfireIcon } from '@renderer/shared/components/icons'

describe('Icon components', () => {
  afterEach(() => {
    cleanup()
  })

  it('should render AnnotationAiIcon with default size 1rem', () => {
    const { container } = render(<AnnotationAiIcon />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg?.getAttribute('width')).toBe('1rem')
    expect(svg?.getAttribute('height')).toBe('1rem')
  })

  it('should render AnnotationAiIcon with size 1.25rem', () => {
    const { container } = render(<AnnotationAiIcon size="1.25rem" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('1.25rem')
    expect(svg?.getAttribute('height')).toBe('1.25rem')
  })

  it('should apply className prop', () => {
    const { container } = render(<AnnotationAiIcon className="test-class" />)
    const svg = container.querySelector('svg')
    expect(svg?.classList.contains('test-class')).toBe(true)
  })

  it('should apply custom color', () => {
    const { container } = render(<AnnotationAiIcon color="#FF0000" />)
    const path = container.querySelector('path')
    expect(path?.getAttribute('stroke')).toBe('#FF0000')
  })

  it('should use currentColor by default', () => {
    const { container } = render(<AnnotationAiIcon />)
    const path = container.querySelector('path')
    expect(path?.getAttribute('stroke')).toBe('currentColor')
  })

  it('should render SopAnalysisIcon', () => {
    const { container } = render(<SopAnalysisIcon />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('should render CrossfireIcon', () => {
    const { container } = render(<CrossfireIcon />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
