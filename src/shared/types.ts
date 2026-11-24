// Single source of truth for every type shared by main, preload and renderer.

export const SOURCE_SHAPES = ['archive', 'installer', 'folder'] as const
export type SourceShape = (typeof SOURCE_SHAPES)[number]

export interface Part {
  /** Path relative to the source root; also the staged file name. */
  name: string
  sizeBytes: number
  /** Absolute source path on disk or a share. */
  path?: string
  /** file:// URL of the source. */
  url: string
  /** Natural order within the set (volume order for split archives). */
  index: number
  /** Lowercase hex; set from a sidecar checksum or by hashing the source. */
  sha256?: string
}

/** Parts pinned for an install, with their hashes. */
export interface Manifest {
  version: string
  parts: Part[]
  createdAt: number
}

export interface Game {
  id: string
  title: string
  art: string
  hero: string
  version: string
  sizeBytes: number
  description: string
  source?: string
  shape?: SourceShape
  parts?: Part[]
  manifest?: Manifest
  /** TMDB id, metadata only. */
  tmdbId?: number
  exeHint?: string
  vetted: boolean
  addedAt: number
}

export interface Show {
  id: string
  title: string
  poster: string
  hero: string
  year: number
  rating: number
  seasons: number[]
  /** TMDB id, metadata only. */
  tmdbId?: number
}

export interface Episode {
  id: string
  showId: string
  season: number
  episode: number
  title: string
  still: string
  durationSec: number
  positionSec: number
  /** The episode's video file inside its show folder, when found on disk. */
  filePath?: string
}

export type LibraryState = 'ready' | 'missing' | 'update'

export interface LibraryEntry {
  id: string
  kind: 'game' | 'show'
  refId: string
  path?: string
  addedAt: number
  lastPlayedAt?: number
  playtimeSec: number
  state: LibraryState
}

export type JobState =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'ready'
  | 'paused'
  | 'stalled'
  | 'failed'
  | 'cancelled'

export interface DownloadJob {
  id: string
  gameId: string
  state: JobState
  progress: number
  bytesTotal: number
  bytesDone: number
  speedBps: number
  reason?: string
  attempts: number
  createdAt: number
}

/** States in which a job holds a download slot. */
export const RUNNING_STATES: readonly JobState[] = ['resolving', 'downloading', 'verifying', 'extracting']
/** States in which a job is shown in the download bar. */
export const VISIBLE_STATES: readonly JobState[] = [...RUNNING_STATES, 'queued', 'paused', 'stalled', 'failed']

export interface SourceToggle {
  id: string
  name: string
  enabled: boolean
}

export const THEMES = ['mist', 'midnight'] as const
export type Theme = (typeof THEMES)[number]

export interface Settings {
  libraryPath: string
  stagingPath: string
  saveBackupPath: string
  concurrentDownloads: number
  sources: SourceToggle[]
  cacheBytes: number
  theme: Theme
}

/** Launch-at-login is OS state; only a packaged install can register itself. */
export interface StartupState {
  available: boolean
  enabled: boolean
}

export interface Snapshot {
  games: Game[]
  shows: Show[]
  episodes: Episode[]
  library: LibraryEntry[]
  jobs: DownloadJob[]
  settings: Settings
  watchlist: string[]
  appVersion: string
  startup: StartupState
}

export interface ActionResult {
  ok: boolean
  message: string
}

/** Every call the renderer can make into the main process. */
export interface MistCalls {
  snapshot(): Snapshot
  addGame(gameId: string, source?: { input: string; shape: SourceShape }): Promise<ActionResult>
  addShow(showId: string, path?: string): Promise<ActionResult>
  removeEntry(entryId: string): void
  clearLibrary(): void
  restoreSeed(): void
  play(entryId: string): ActionResult
  install(gameId: string): void
  setSource(gameId: string, input: string, shape: SourceShape): Promise<ActionResult>
  verifyGame(gameId: string): Promise<ActionResult>
  backupSaves(gameId: string): Promise<ActionResult>
  pauseJob(jobId: string): void
  resumeJob(jobId: string): void
  cancelJob(jobId: string): void
  retryJob(jobId: string): void
  pauseAll(): void
  cancelAll(): void
  setEpisodePosition(episodeId: string, positionSec: number): void
  toggleWatchlist(showId: string): void
  updateSettings(patch: Partial<Settings>): void
  clearCache(): void
  pickFolder(): Promise<string | null>
  setLaunchAtLogin(enabled: boolean): void
}

export type MistMethod = keyof MistCalls

export const MIST_METHODS = [
  'snapshot',
  'addGame',
  'addShow',
  'removeEntry',
  'clearLibrary',
  'restoreSeed',
  'play',
  'install',
  'setSource',
  'verifyGame',
  'backupSaves',
  'pauseJob',
  'resumeJob',
  'cancelJob',
  'retryJob',
  'pauseAll',
  'cancelAll',
  'setEpisodePosition',
  'toggleWatchlist',
  'updateSettings',
  'clearCache',
  'pickFolder',
  'setLaunchAtLogin'
] as const satisfies readonly MistMethod[]

// Compile-time check that MIST_METHODS lists every MistCalls method.
type MissingMethods = Exclude<MistMethod, (typeof MIST_METHODS)[number]>
export const ALL_METHODS_LISTED: MissingMethods extends never ? true : never = true

/** Methods that only read; every other call is followed by a snapshot broadcast. */
export const READ_ONLY_METHODS: readonly MistMethod[] = ['snapshot', 'pickFolder']

export const IPC = {
  call: 'mist:call',
  snapshot: 'mist:snapshot',
  jobs: 'mist:jobs'
} as const

/** Renderer-side view of MistCalls: every call is async over IPC. */
export type MistApi = {
  [K in MistMethod]: MistCalls[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never
} & {
  onSnapshot(listener: (snapshot: Snapshot) => void): () => void
  onJobs(listener: (jobs: DownloadJob[]) => void): () => void
  pathForFile(file: File): string
}
