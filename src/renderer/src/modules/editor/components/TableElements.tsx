/**
 * Table node rendering components for Plate.js editor.
 * Maps table/tr/td/th Plate nodes to semantic HTML elements
 * so that CSS selectors and screen readers work correctly.
 */
import React from 'react'
import { PlateElement, type PlateElementProps } from 'platejs/react'

export function TableElement(props: PlateElementProps): React.JSX.Element {
  const { children, ...rest } = props
  return (
    <PlateElement {...rest} as="table">
      <tbody>{children}</tbody>
    </PlateElement>
  )
}

export function TableRowElement(props: PlateElementProps): React.JSX.Element {
  return <PlateElement {...props} as="tr" />
}

export function TableCellElement(props: PlateElementProps): React.JSX.Element {
  return <PlateElement {...props} as="td" />
}

export function TableCellHeaderElement(props: PlateElementProps): React.JSX.Element {
  return <PlateElement {...props} as="th" />
}
