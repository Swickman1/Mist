// Pure derivations over the snapshot. Components never re-implement these rules.
import { RUNNING_STATES, VISIBLE_STATES, type DownloadJob, type Episode, type Game, type LibraryEntry, type Snapshot } from '../../shared/types'
import { ui } from './config'

export type TileState = 'ready' | 'downloading' | 'paused' | 'failed' | 'missing' | 'update'

export function visibleJobs(jobs: DownloadJob[]): DownloadJob[] {
  return jobs.filter((job) => VISIBLE_STATES.includes(job.state)).sort((a, b) => a.createdAt - b.createdAt)
}

export function jobForGame(jobs: DownloadJob[], gameId: string): DownloadJob | undefined {
  return visibleJobs(jobs).find((job) => job.gameId === gameId)
}

export function entryFor(snapshot: Snapshot, kind: LibraryEntry['kind'], refId: string): LibraryEntry | undefined {
  return snapshot.library.find((entry) => entry.kind === kind && entry.refId === refId)
}

export function tileState(entry: LibraryEntry, job: DownloadJob | undefined): TileState {
  if (job && job.state === 'paused') return 'paused'
  if (job && job.state === 'failed') return 'failed'
  if (job) return 'downloading'
  return entry.state
}

export function wasInstalled(entry: LibraryEntry): boolean {
  return entry.path !== undefined || entry.lastPlayedAt !== undefined
}

export function libraryGames(snapshot: Snapshot): { game: Game; entry: LibraryEntry }[] {
  return snapshot.library
    .filter((entry) => entry.kind === 'game')
    .sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt))
    .map((entry) => ({ entry, game: snapshot.games.find((g) => g.id === entry.refId)! }))
}

export function isWatched(episode: Episode): boolean {
  return episode.positionSec >= episode.durationSec * ui.watchedFraction
}

export function isInProgress(episode: Episode): boolean {
  return episode.positionSec > 0 && !isWatched(episode)
}

/** One in-progress episode per show in the library, most recently watched first. */
export function continueWatching(snapshot: Snapshot): Episode[] {
  return snapshot.library
    .filter((entry) => entry.kind === 'show')
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
    .map((entry) => snapshot.episodes.find((ep) => ep.showId === entry.refId && isInProgress(ep)))
    .filter((ep): ep is Episode => ep !== undefined)
}

/** The episode PLAY/RESUME should open: the in-progress one, else the first unwatched. */
export function nextEpisode(episodes: Episode[]): Episode | undefined {
  return episodes.find(isInProgress) ?? episodes.find((ep) => !isWatched(ep)) ?? episodes[0]
}

export function isRunning(job: DownloadJob): boolean {
  return RUNNING_STATES.includes(job.state)
}

export function episodeLabel(episode: Episode): string {
  return `S${episode.season}E${episode.episode}`
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`
}

export function formatPercent(progress: number): string {
  return `${Math.floor(progress * 100)}%`
}

export function formatHours(sec: number): string {
  return sec < 3600 ? `${Math.round(sec / 60)} min` : `${(sec / 3600).toFixed(1)} h`
}

export function sourceLabel(game: Game): string {
  if (!game.source) return 'No source'
  return game.source.split(/[\\/]/).pop() ?? game.source
}

export function gameTitle(snapshot: Snapshot, gameId: string): string {
  return snapshot.games.find((g) => g.id === gameId)?.title ?? gameId
}
