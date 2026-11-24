// Player: mpv first (any codec, hardware decode), the <video> element as the
// fallback when mpv is not installed or cannot open the file.
// These props are the contract both backends keep.
import { useState } from 'react'
import { MpvPlayer } from './MpvPlayer'
import { VideoPlayer } from './VideoPlayer'

export interface PlayerProps {
  title: string
  subtitle?: string
  /** Absolute path of the local video file; undefined when it was not found on disk. */
  filePath?: string
  /** Still shown until playback starts. */
  poster: string
  /** Where playback starts. */
  startAtSec: number
  /** Called every 10s while playing, and on pause, end and close. */
  onPosition(positionSec: number): void
}

export function Player(props: PlayerProps) {
  const [mpvUnavailable, setMpvUnavailable] = useState<string | null>(null)
  if (!props.filePath || mpvUnavailable !== null) {
    return <VideoPlayer {...props} notice={mpvUnavailable ? `mpv unavailable (${mpvUnavailable}), using built-in player` : undefined} />
  }
  return <MpvPlayer {...props} filePath={props.filePath} onUnavailable={setMpvUnavailable} />
}
