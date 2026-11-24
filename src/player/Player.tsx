export interface PlayerProps {
  title: string
  subtitle?: string
  startAtSec: number
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function Player({ title, subtitle, startAtSec }: PlayerProps) {
  return (
    <div className="player" role="region" aria-label={`Player: ${title}`}>
      <div className="player__screen">
        <div className="player__loading" aria-live="polite">
          <div className="player__loader" />
          <span>Loading</span>
        </div>
      </div>
      <div className="player__meta">
        <span className="player__title">{title}</span>
        {subtitle && <span className="muted">{subtitle}</span>}
        <span className="muted player__time">Resume at {formatTime(startAtSec)} · playback not implemented</span>
      </div>
    </div>
  )
}
