import type { IconProps } from './types'

export function AnnotationScoreIcon({
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
        d="M3 11a5 5 0 0 1 10 0"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 11V7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="6" r="1" fill={color} />
    </svg>
  )
}
