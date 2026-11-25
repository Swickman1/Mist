// <video> fallback backend: Chromium decodes H.264/VP9/AV1 + AAC/Opus over mist-media://.
// Used when mpv is not installed or cannot open the file.
import { useCallback, useEffect, useRef, useState } from 'react'
import { mediaUrl } from '../shared/media'
import type { PlayerProps } from './Player'

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

export function VideoPlayer({
  title,
  subtitle,
  filePath,
  poster,
  startAtSec,
  onPosition,
  notice,
  banner,
  onDismissBanner
}: PlayerProps & { notice?: string; banner?: string; onDismissBanner?(): void }) {
  const video = useRef<HTMLVideoElement>(null)
  const screen = useRef<HTMLDivElement>(null)
  const lastWrite = useRef(startAtSec)
  const startAt = useRef(startAtSec)
  const report = useRef(onPosition)
  report.current = onPosition
  const [started, setStarted] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bannerVisible, setBannerVisible] = useState(true)

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
      {banner && bannerVisible && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '8px 12px',
            border: '1px solid var(--border-strong)',
            borderLeft: '2px solid var(--amber)',
            borderRadius: 'var(--radius)',
            background: 'var(--surface-2)',
            fontSize: 12
          }}
        >
          <span style={{ flex: 1, userSelect: 'text' }}>{banner}</span>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => {
              setBannerVisible(false)
              onDismissBanner?.()
            }}
          >
            Dismiss
          </button>
        </div>
      )}
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
        <span className="muted player__time">{notice ? `${notice} · ` : ''}Space play/pause · ←/→ seek 10s · F fullscreen</span>
      </div>
    </div>
  )
}
