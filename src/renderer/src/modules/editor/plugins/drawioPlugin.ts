import { createPlatePlugin } from 'platejs/react'
import type { DrawioElementData } from '@shared/drawio-types'

export const DRAWIO_ELEMENT_TYPE = 'drawio'

export type DrawioElement = DrawioElementData & {
  type: typeof DRAWIO_ELEMENT_TYPE
  children: [{ text: '' }]
}

export const DrawioPlugin = createPlatePlugin({
  key: DRAWIO_ELEMENT_TYPE,
  node: {
    type: DRAWIO_ELEMENT_TYPE,
    isVoid: true,
    isElement: true,
  },
})
