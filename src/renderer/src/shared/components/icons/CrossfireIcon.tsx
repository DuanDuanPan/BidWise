import type { IconProps } from './types'

export function CrossfireIcon({
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
      <path d="M2 14L14 2M2 2l12 12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M14 2l-3 .5.5.5M14 2l-.5 3-.5-.5M2 14l3-.5-.5-.5M2 14l.5-3 .5.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
