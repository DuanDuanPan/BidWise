import type { IconProps } from './types'

export function AnnotationHumanIcon({
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
      <circle cx="8" cy="5" r="2.5" stroke={color} strokeWidth="1.5" />
      <path
        d="M3 14c0-2.76 2.24-5 5-5s5 2.24 5 5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
