// Iframe backend: plays an embed page from EMBED_HOSTS when there is no local file.
// Needs no file and no download host; whether the page plays is up to the third party.
import { useEffect, useRef, useState } from 'react'
import { EMBED_HOSTS } from '../shared/embed'
import { hostAllowed } from '../shared/hosts'
import type { PlayerProps } from './Player'

const WRITE_EVERY_MS = 10_000
/** With no load event and no message by then, the embed is treated as failed. */
const WATCHDOG_MS = 12_000

type EmbedMessage = { type: 'time'; currentTime: number } | { type: 'duration'; duration: number }

function parseMessage(data: unknown): EmbedMessage | undefined {
  if (!data || typeof data !== 'object') return undefined
  const message = data as Record<string, unknown>
  if (message['type'] === 'time' && typeof message['currentTime'] === 'number') return { type: 'time', currentTime: message['currentTime'] }
  if (message['type'] === 'duration' && typeof message['duration'] === 'number') return { type: 'duration', duration: message['duration'] }
  return undefined
}

function fromEmbedHost(origin: string): boolean {
  try {
    return hostAllowed(new URL(origin).hostname, EMBED_HOSTS)
  } catch {
    return false
  }
}

export function IframePlayer({ title, subtitle, embedUrl, embedLabel, onPosition }: PlayerProps & { embedUrl: string }) {
  const [alive, setAlive] = useState(false)
  const [failed, setFailed] = useState(false)
  const latest = useRef<number | undefined>(undefined)
  const lastWrite = useRef(0)
  const report = useRef(onPosition)
  report.current = onPosition

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!fromEmbedHost(event.origin)) return
      const message = parseMessage(event.data)
      if (!message) return
      setAlive(true)
      if (message.type !== 'time') return
      latest.current = message.currentTime
      if (Date.now() - lastWrite.current < WRITE_EVERY_MS) return
      lastWrite.current = Date.now()
      report.current(message.currentTime)
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      if (latest.current !== undefined) report.current(latest.current)
    }
  }, [])

  useEffect(() => {
    if (alive) return
    const timer = setTimeout(() => setFailed(true), WATCHDOG_MS)
    return () => clearTimeout(timer)
  }, [alive])

  return (
    <div className="player" role="region" aria-label={`Player: ${title}`}>
      <div className="player__screen">
        {failed ? (
          <span className="player__loading" aria-live="polite">
            <span>Could not load the player</span>
            <button className="btn btn--ghost btn--sm" onClick={() => void window.mist.openExternal(embedUrl)}>
              Open in browser
            </button>
          </span>
        ) : (
          <iframe
            src={embedUrl}
            title={title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, background: '#000' }}
            allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="origin"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
            onLoad={() => setAlive(true)}
          />
        )}
      </div>
      <div className="player__meta">
        <span className="player__title">{title}</span>
        {subtitle && <span className="muted">{subtitle}</span>}
        {embedLabel && <span className="muted player__time">{embedLabel}</span>}
      </div>
    </div>
  )
}
