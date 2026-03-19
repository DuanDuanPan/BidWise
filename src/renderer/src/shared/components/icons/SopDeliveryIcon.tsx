import type { IconProps } from './types'

export function SopDeliveryIcon({
  size = '1rem',
  className,
  color = 'currentColor',
}: IconProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M2 14l5.5-6L2 2l12 6-12 6Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7.5 8H14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
