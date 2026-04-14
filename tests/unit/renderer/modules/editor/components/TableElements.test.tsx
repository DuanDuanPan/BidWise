import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import {
  TableElement,
  TableRowElement,
  TableCellElement,
  TableCellHeaderElement,
} from '@modules/editor/components/TableElements'

vi.mock('platejs/react', () => ({
  PlateElement: ({
    as,
    children,
    ...props
  }: {
    as?: keyof React.JSX.IntrinsicElements
    children?: React.ReactNode
  }) => {
    const Component = as ?? 'div'
    return React.createElement(Component, props, children)
  },
}))

function createElementProps(children?: React.ReactNode): {
  attributes: Record<string, unknown>
  children?: React.ReactNode
  editor: Record<string, unknown>
  element: Record<string, unknown>
} {
  return {
    attributes: {},
    children,
    editor: {},
    element: { type: 'mock' },
  }
}

describe('TableElements', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders table rows inside tbody to preserve valid DOM nesting', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { container } = render(
      <TableElement {...createElementProps()}>
        <TableRowElement {...createElementProps()}>
          <TableCellHeaderElement {...createElementProps()}>标题</TableCellHeaderElement>
          <TableCellElement {...createElementProps()}>内容</TableCellElement>
        </TableRowElement>
      </TableElement>
    )

    expect(container.querySelector('table > tbody')).toBeTruthy()
    expect(container.querySelector('table > tbody > tr')).toBeTruthy()
    expect(
      errorSpy.mock.calls.some((args) =>
        args.some(
          (arg) => typeof arg === 'string' && arg.includes('<tr> cannot be a child of <table>')
        )
      )
    ).toBe(false)
  })
})
