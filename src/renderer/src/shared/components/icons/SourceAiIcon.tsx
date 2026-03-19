import type { IconProps } from './types'

export function SourceAiIcon({
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
      <rect x="3" y="3" width="10" height="10" rx="1.5" stroke={color} strokeWidth="1.5" />
      <path d="M6 6h4M6 8h4M6 10h2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M1 6h2M1 10h2M13 6h2M13 10h2M6 1v2M10 1v2M6 13v2M10 13v2"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
