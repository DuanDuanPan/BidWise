import type { IconProps } from './types'

export function SopCostIcon({
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
      <rect
        x="2.5"
        y="2"
        width="11"
        height="12"
        rx="1"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 5h6M5 7.5h6M5 10h3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
