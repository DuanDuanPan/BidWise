import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import App from '@renderer/App'

describe('App component', () => {
  afterEach(() => {
    cleanup()
  })

  it('should render the app root', () => {
    render(<App />)
    const root = screen.getByTestId('app-root')
    expect(root).toBeInTheDocument()
  })

  it('should display BidWise title', () => {
    render(<App />)
    expect(screen.getByText('BidWise')).toBeInTheDocument()
  })
})
