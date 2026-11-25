// Player backends, in order: a local file plays in mpv (any codec, hardware decode)
// with the <video> element as its fallback; with no file, an embed URL plays in the
// iframe backend; with neither, the <video> backend shows the missing-file state.
// These props are the contract both backends keep.
import { useRef, useState } from 'react'
import { IframePlayer } from './IframePlayer'
import { MpvPlayer } from './MpvPlayer'
import { VideoPlayer } from './VideoPlayer'

export interface PlayerProps {
  title: string
  subtitle?: string
  /** Absolute path of the local video file; undefined when it was not found on disk. */
  filePath?: string
  /** Embed page (EMBED_HOSTS only) played in an iframe when there is no filePath. */
  embedUrl?: string
  /** One line under the iframe player saying what the embed is. */
  embedLabel?: string
  /** Still shown until playback starts. */
  poster: string
  /** Where playback starts. */
  startAtSec: number
  /** Called every 10s while playing, and on pause, end and close. */
  onPosition(positionSec: number): void
  /** Asks the host to close the player (Esc inside mpv). */
  onClose?(): void
}

export const MPV_MISSING_BANNER = 'mpv is not installed — HEVC and AC-3 files will not play. winget install shinchiro.mpv'

export function Player(props: PlayerProps) {
  const [fallback, setFallback] = useState<{ reason: string; showMissingBanner: boolean; positionSec: number } | null>(null)
  // Latest position from either backend, so a fallback resumes where playback was, not at the original resume point.
  const latest = useRef(props.startAtSec)
  const onPosition = (positionSec: number) => {
    latest.current = positionSec
    props.onPosition(positionSec)
  }

  if (!props.filePath && props.embedUrl) return <IframePlayer {...props} embedUrl={props.embedUrl} />

  if (!props.filePath || fallback !== null) {
    return (
      <VideoPlayer
        {...props}
        startAtSec={fallback ? fallback.positionSec : props.startAtSec}
        onPosition={onPosition}
        notice={fallback ? `mpv unavailable (${fallback.reason}), using built-in player` : undefined}
        banner={fallback?.showMissingBanner ? MPV_MISSING_BANNER : undefined}
        onDismissBanner={() => void window.mist.updateSettings({ mpvBannerDismissed: true })}
      />
    )
  }
  return (
    <MpvPlayer
      {...props}
      filePath={props.filePath}
      onPosition={onPosition}
      onUnavailable={(reason, showMissingBanner, positionSec) =>
        setFallback({ reason, showMissingBanner: showMissingBanner ?? false, positionSec: positionSec ?? latest.current })
      }
    />
  )
}
