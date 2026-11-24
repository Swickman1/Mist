// Local player: a native <video> on a mist-media:// URL. These props are the
// contract a future libmpv-backed player must keep.
import { useCallback, useEffect, useRef, useState } from 'react'
import { mediaUrl } from '../shared/media'

export interface PlayerProps {
  title: string
  subtitle?: string
  /** Absolute path of the local video file; undefined when it was not found on disk. */
  filePath?: string
  /** Still shown until the first play. */
  poster: string
  /** Where playback starts. */
  startAtSec: number
  /** Called every 10s while playing, and on pause, end and close. */
  onPosition(positionSec: number): void
}

const WRITE_EVERY_SEC = 10
const SEEK_STEP_SEC = 10
/** Starting this close to the end restarts from the beginning instead. */
const END_MARGIN_SEC = 5

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return `${h ? `${h}:${m.toString().padStart(2, '0')}` : m}:${s.toString().padStart(2, '0')}`
}

const fill: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' }

export function Player({ title, subtitle, filePath, poster, startAtSec, onPosition }: PlayerProps) {
  const video = useRef<HTMLVideoElement>(null)
  const screen = useRef<HTMLDivElement>(null)
  const lastWrite = useRef(startAtSec)
  const startAt = useRef(startAtSec)
  const report = useRef(onPosition)
  report.current = onPosition
  const [started, setStarted] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const write = useCallback(() => {
    const el = video.current
    if (!el || !Number.isFinite(el.currentTime) || el.currentTime === lastWrite.current) return
    lastWrite.current = el.currentTime
    report.current(el.currentTime)
  }, [])

  // Keyboard shortcuts work as soon as the player opens.
  useEffect(() => screen.current?.focus(), [])

  // Persist the position when the player closes.
  useEffect(() => () => write(), [write])

  const onLoadedMetadata = () => {
    const el = video.current!
    el.currentTime = startAt.current < el.duration - END_MARGIN_SEC ? startAt.current : 0
    setLoaded(true)
  }

  const onTimeUpdate = () => {
    if (Math.abs(video.current!.currentTime - lastWrite.current) >= WRITE_EVERY_SEC) write()
  }

  const play = () => {
    void video.current?.play()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const el = video.current
    if (!el) return
    const key = event.key.toLowerCase()
    if (key === 'arrowleft' || key === 'j') el.currentTime = Math.max(0, el.currentTime - SEEK_STEP_SEC)
    else if (key === 'arrowright' || key === 'l') el.currentTime = Math.min(el.duration, el.currentTime + SEEK_STEP_SEC)
    else if (key === ' ' || key === 'k') void (el.paused ? el.play() : el.pause())
    else if (key === 'f') void (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen())
    else return
    event.preventDefault()
  }

  return (
    <div className="player" role="region" aria-label={`Player: ${title}`}>
      <div className="player__screen" ref={screen} tabIndex={0} onKeyDown={onKeyDown}>
        {filePath && !error && (
          <video
            ref={video}
            style={{ ...fill, background: '#000' }}
            src={mediaUrl(filePath)}
            controls={started}
            preload="metadata"
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={onTimeUpdate}
            onPlay={() => setStarted(true)}
            onPause={write}
            onEnded={write}
            onError={() => setError('This file could not be played')}
          />
        )}
        {!started && (
          <button style={{ ...fill, padding: 0, border: 0, cursor: filePath && !error ? 'pointer' : 'default', background: 'transparent' }} onClick={play} disabled={!filePath || !!error || !loaded} aria-label={`Play ${title}`}>
            <img src={poster} alt="" style={{ ...fill, objectFit: 'cover', opacity: filePath && !error ? 0.85 : 0.35 }} />
            <span className="player__loading" aria-live="polite">
              {!filePath && <span>File not found in this show’s folder</span>}
              {error && <span>{error}</span>}
              {filePath && !error && !loaded && (
                <>
                  <div className="player__loader" />
                  <span>Loading</span>
                </>
              )}
              {filePath && !error && loaded && (
                <span style={{ fontSize: 14, color: 'var(--text)' }}>▶ {startAt.current > 0 ? `Resume at ${formatTime(startAt.current)}` : 'Play'}</span>
              )}
            </span>
          </button>
        )}
      </div>
      <div className="player__meta">
        <span className="player__title">{title}</span>
        {subtitle && <span className="muted">{subtitle}</span>}
        <span className="muted player__time">Space play/pause · ←/→ seek 10s · F fullscreen</span>
      </div>
    </div>
  )
}
