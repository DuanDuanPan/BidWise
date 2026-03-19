import type { IconProps } from './types'

export function SopDesignIcon({
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
        d="M12.5 2.5l1 1-8.5 8.5-2.5 1 1-2.5 8.5-8.5Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.5 4.5l1 1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
