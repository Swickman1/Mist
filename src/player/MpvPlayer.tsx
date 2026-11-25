// mpv backend: main hosts mpv in a child window laid exactly over this component's
// screen rectangle; this component keeps that rectangle in sync and turns mpv's
// time events into the Player contract's onPosition writes.
import { useEffect, useRef, useState } from 'react'
import type { PlayerBounds } from '../shared/types'
import type { PlayerProps } from './Player'

const WRITE_EVERY_SEC = 10

/** Mist keys → the mpv key name sent as `keypress` (mpv binds the action). */
const MPV_KEYS: Record<string, string> = {
  ' ': 'SPACE',
  k: 'SPACE',
  ArrowLeft: 'LEFT',
  j: 'LEFT',
  ArrowRight: 'RIGHT',
  l: 'RIGHT',
  f: 'f',
  Escape: 'ESC'
}

function boundsOf(el: HTMLElement): PlayerBounds {
  const rect = el.getBoundingClientRect()
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

const fill: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' }

export function MpvPlayer({
  title,
  subtitle,
  filePath,
  poster,
  startAtSec,
  onPosition,
  onClose,
  onUnavailable
}: PlayerProps & {
  filePath: string
  /** positionSec: where mpv was when it failed mid-playback. */
  onUnavailable(reason: string, showMissingBanner?: boolean, positionSec?: number): void
}) {
  const screen = useRef<HTMLDivElement>(null)
  const report = useRef(onPosition)
  report.current = onPosition
  const close = useRef(onClose)
  close.current = onClose
  const [status, setStatus] = useState<'opening' | 'playing'>('opening')
  const [decoder, setDecoder] = useState<string>('')

  useEffect(() => {
    const api = window.mist
    const el = screen.current!
    let alive = true
    let playing = false
    let lastWrite = startAtSec
    let paused = false
    /** Last position from mpv's 1s time events (writes only happen every 10s). */
    let lastKnown = startAtSec

    const write = (position: number) => {
      lastWrite = position
      report.current(position)
    }

    const off = api.onPlayer((event) => {
      if (event.type === 'time') {
        lastKnown = event.position
        const pauseChanged = event.paused !== paused
        paused = event.paused
        if (Math.abs(event.position - lastWrite) >= WRITE_EVERY_SEC || (pauseChanged && paused)) write(event.position)
      } else if (event.type === 'decoder') {
        setDecoder(event.hardware ? `hardware decode (${event.name})` : 'software decode')
      } else if (event.type === 'ended') {
        void api.playerClose().then((position) => position !== null && write(position))
      } else if (event.type === 'close-request') {
        close.current?.()
      } else if (event.type === 'error') {
        // mpv failed mid-playback: save where it got to and hand over to <video> from there.
        write(lastKnown)
        onUnavailable(event.message, false, lastKnown)
      }
    })

    // Mist keeps focus: keys are captured here (before the modal's own Esc handler)
    // and pressed inside mpv over IPC; the mpv window is never activated.
    const onKeyDown = (event: KeyboardEvent) => {
      const key = MPV_KEYS[event.key]
      if (!key || event.ctrlKey || event.altKey || event.metaKey || !playing) return
      event.preventDefault()
      event.stopPropagation()
      void api.playerKey(key)
    }
    window.addEventListener('keydown', onKeyDown, true)

    void api.playerOpen({ filePath, title, startAtSec, bounds: boundsOf(el) }).then((result) => {
      if (!alive) return
      if (result.backend === 'video') onUnavailable(result.reason, result.showMissingBanner)
      else {
        playing = true
        setStatus('playing')
      }
    })

    // Follow the screen's rectangle (size and position) each frame; send only when it changes.
    let last = ''
    let frame = 0
    const follow = () => {
      const bounds = boundsOf(el)
      const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`
      if (key !== last) {
        last = key
        void api.playerBounds(bounds)
      }
      frame = requestAnimationFrame(follow)
    }
    frame = requestAnimationFrame(follow)

    return () => {
      alive = false
      off()
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown, true)
      void api.playerClose().then((position) => playing && position !== null && report.current(position))
    }
    // One mpv session per mounted file; Player is keyed by episode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath])

  return (
    <div className="player" role="region" aria-label={`Player: ${title}`}>
      <div className="player__screen" ref={screen}>
        <img src={poster} alt="" style={{ ...fill, objectFit: 'cover', opacity: 0.6 }} />
        {status === 'opening' && (
          <span className="player__loading" aria-live="polite">
            <div className="player__loader" />
            <span>Starting mpv</span>
          </span>
        )}
      </div>
      <div className="player__meta">
        <span className="player__title">{title}</span>
        {subtitle && <span className="muted">{subtitle}</span>}
        <span className="muted player__time">
          mpv{decoder ? ` · ${decoder}` : ''} · Space play/pause · ←/→ seek 10s · Esc close
        </span>
      </div>
    </div>
  )
}
