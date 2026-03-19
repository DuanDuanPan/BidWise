import type { IconProps } from './types'

export function SopWritingIcon({
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
        d="M4 2h5l4 4v7.5c0 .28-.22.5-.5.5h-8a.5.5 0 0 1-.5-.5v-11c0-.28.22-.5.5-.5Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 2v4h4"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 9h4M6 11.5h2.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
