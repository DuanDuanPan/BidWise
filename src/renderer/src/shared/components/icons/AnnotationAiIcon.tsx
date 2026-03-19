import type { IconProps } from './types'

export function AnnotationAiIcon({
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
        d="M2 3.5C2 2.67 2.67 2 3.5 2h9c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5H5l-3 3V3.5Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 5v1m0 2v1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="6" cy="7" r="0.5" fill={color} />
      <circle cx="10" cy="7" r="0.5" fill={color} />
    </svg>
  )
}
