import type { IconProps } from './types'

export function SourceAssetIcon({
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
      <ellipse cx="8" cy="4" rx="5" ry="2" stroke={color} strokeWidth="1.5" />
      <path d="M3 4v4c0 1.1 2.24 2 5 2s5-.9 5-2V4" stroke={color} strokeWidth="1.5" />
      <path d="M3 8v4c0 1.1 2.24 2 5 2s5-.9 5-2V8" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}
