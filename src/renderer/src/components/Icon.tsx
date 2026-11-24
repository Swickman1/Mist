const paths = {
  home: 'M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1z',
  games: 'M6 7h8a3.5 3.5 0 0 1 3.5 3.5v0A3.5 3.5 0 0 1 14 14H6a3.5 3.5 0 0 1-3.5-3.5v0A3.5 3.5 0 0 1 6 7zM6 9v3M4.5 10.5h3M13 10h.01M15 11.5h.01',
  shows: 'M3 5h14v10H3zM7 17h6M8 8.5l4 1.5-4 1.5z',
  downloads: 'M10 3v10M6 9l4 4 4-4M4 17h12',
  settings: 'M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4',
  search: 'M9 4a5 5 0 1 0 0 10A5 5 0 0 0 9 4zM13 13l4 4',
  play: 'M7 5l9 5-9 5z',
  chevronUp: 'M5 12l5-5 5 5',
  chevronDown: 'M5 8l5 5 5-5',
  chevronRight: 'M8 5l5 5-5 5',
  collapse: 'M12 5l-5 5 5 5M16 4v12',
  expand: 'M8 5l5 5-5 5M4 4v12',
  check: 'M4 10.5l4 4 8-9',
  plus: 'M10 4v12M4 10h12',
  close: 'M5 5l10 10M15 5L5 15',
  shield: 'M10 3l6 2v5c0 3.5-2.6 6-6 7-3.4-1-6-3.5-6-7V5zM7.5 10l2 2 3-3.5'
} as const

export type IconName = keyof typeof paths

const filled: IconName[] = ['play']

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const isFilled = filled.includes(name)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill={isFilled ? 'currentColor' : 'none'}
      stroke={isFilled ? 'none' : 'currentColor'}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
