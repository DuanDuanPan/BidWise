import type { IconProps } from './types'

export function SourceKnowledgeIcon({
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
        d="M2 3c0-.55.45-1 1-1h3.5c.55 0 1.08.22 1.47.6L8 2.65l.03-.05c.39-.38.92-.6 1.47-.6H13c.55 0 1 .45 1 1v9c0 .55-.45 1-1 1H9.5c-.55 0-1.08.22-1.47.6l-.03.05-.03-.05c-.39-.38-.92-.6-1.47-.6H3c-.55 0-1-.45-1-1V3Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 3v10" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}
