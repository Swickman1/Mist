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
  /** For URL sources: the page the parts came from, sent as Referer (survives restarts). */
  sourcePage?: string
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
  /** Steam app id when the metadata came from the Steam store. */
  steamAppId?: number
  genres?: string[]
  /** As Steam shows it, e.g. 'Sep 25, 2025'. */
  releaseDate?: string
  /** Steam's 460x215 header image. */
  header?: string
  exeHint?: string
  vetted: boolean
  addedAt: number
}

export type TmdbKind = 'tv' | 'movie'

/** One TMDB search result as shown in the add flow. */
export interface TmdbHit {
  tmdbId: number
  kind: TmdbKind
  title: string
  year?: number
  /** Small remote poster for the result list, when TMDB has one. */
  posterUrl?: string
  overview: string
  rating: number
}

export type TmdbSearchResult = { ok: true; hits: TmdbHit[] } | { ok: false; error: string }

/** One Steam store search result as shown in the add flow. */
export interface SteamHit {
  appId: number
  title: string
  /** Steam's small landscape capsule (231x87), remote. */
  capsuleUrl: string
  /** e.g. '$20.99', 'Free', or undefined when Steam lists no price. */
  price?: string
}

export type SteamSearchResult = { ok: true; hits: SteamHit[] } | { ok: false; error: string }

/** Browse rows on the Shows tab: TMDB's weekly trending list, or discover by popularity. */
export type TmdbDiscoverMode = 'trending' | 'popular'

export type TmdbDiscoverResult = { ok: true; hits: TmdbHit[]; page: number; totalPages: number } | { ok: false; error: string }

export interface TmdbGenre {
  id: number
  name: string
}

export type TmdbGenresResult = { ok: true; genres: TmdbGenre[] } | { ok: false; error: string }

export interface Show {
  id: string
  title: string
  poster: string
  hero: string
  year: number
  rating: number
  seasons: number[]
  /** TMDB id. With tmdbKind set, the show was imported from TMDB and can be refreshed. */
  tmdbId?: number
  tmdbKind?: TmdbKind
  overview?: string
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
  overview?: string
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
  /** mpv hardware decoding (auto-safe); software is used when it is off or fails. */
  hardwareDecode: boolean
  /** The player's 'mpv is not installed' banner was dismissed. */
  mpvBannerDismissed: boolean
  /** TMDB API key (v3 key or v4 read token), entered in Settings; empty = metadata off. */
  tmdbKey: string
  /** TMDB language tag, e.g. en-US. */
  tmdbLanguage: string
  /** Hosts HTTP(S) sources may download from: bare hostnames, subdomains implied. */
  downloadHosts: string[]
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

/** Player rectangle in CSS pixels, relative to the window's content area. */
export interface PlayerBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PlayerOpenRequest {
  filePath: string
  title: string
  startAtSec: number
  bounds: PlayerBounds
}

/** mpv when it is available and opened the file; otherwise the renderer falls back to <video>. */
export type PlayerOpenResult =
  | { backend: 'mpv' }
  | {
      backend: 'video'
      reason: string
      /** No mpv.exe was found at all. */
      mpvMissing?: boolean
      /** mpvMissing and the banner has not been dismissed. */
      showMissingBanner?: boolean
    }

export type PlayerEvent =
  | { type: 'time'; position: number; duration: number; paused: boolean }
  | { type: 'decoder'; hardware: boolean; name: string }
  | { type: 'ended' }
  | { type: 'close-request' }
  | { type: 'error'; message: string }

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
  /** Deletes all games, shows, episodes, library entries and jobs. Settings stay. */
  clearCatalog(): void
  /** Replaces the catalog with the built-in sample data. Settings stay. */
  loadSampleData(): void
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
  playerOpen(request: PlayerOpenRequest): Promise<PlayerOpenResult>
  playerBounds(bounds: PlayerBounds): void
  /** Stops mpv and returns its last position in seconds (null when nothing was playing). */
  playerClose(): Promise<number | null>
  /** Sends one mpv key name (SPACE, LEFT, RIGHT, f, ESC …) as `keypress`, so Mist keeps keyboard focus. */
  playerKey(key: string): void
  /** Checks the TMDB key in settings against the API. */
  tmdbTest(): Promise<ActionResult>
  tmdbSearch(kind: TmdbKind, query: string): Promise<TmdbSearchResult>
  /** One page (20) of a browse row; genreId applies to 'popular' (TMDB's trending list has no genre filter). */
  tmdbDiscover(kind: TmdbKind, mode: TmdbDiscoverMode, page: number, genreId?: number): Promise<TmdbDiscoverResult>
  tmdbGenres(kind: TmdbKind): Promise<TmdbGenresResult>
  /** Imports a browsed title's metadata (show + episodes) into the catalog without adding it to the library. */
  importTmdbTitle(kind: TmdbKind, tmdbId: number): Promise<ActionResult & { showId?: string }>
  /** Creates (or updates) the show/movie from TMDB with its seasons and episodes, then adds it to the library. */
  addShowFromTmdb(kind: TmdbKind, tmdbId: number, path?: string): Promise<ActionResult>
  /** Re-fetches a TMDB-imported title: updates metadata, never filePath, positionSec or library rows. */
  refreshMetadata(showId: string): Promise<ActionResult>
  steamSearch(query: string): Promise<SteamSearchResult>
  /** Creates (or updates the metadata of) a game from its Steam store page, then adds it to the library. */
  addGameFromSteam(appId: number, source?: { input: string; shape: SourceShape }): Promise<ActionResult>
  /** Re-fetches a Steam-linked game's store page: metadata only, never source, manifest, exeHint or library rows. */
  refreshGameMetadata(gameId: string): Promise<ActionResult>
  /** Validates and saves the download host allowlist (one hostname per line). */
  setDownloadHosts(text: string): Promise<ActionResult>
  /** The built-in suggestions for the allowlist. */
  suggestedDownloadHosts(): Promise<string[]>
  setLaunchAtLogin(enabled: boolean): void
}

export type MistMethod = keyof MistCalls

export const MIST_METHODS = [
  'snapshot',
  'addGame',
  'addShow',
  'removeEntry',
  'clearLibrary',
  'clearCatalog',
  'loadSampleData',
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
  'setLaunchAtLogin',
  'playerOpen',
  'playerBounds',
  'playerClose',
  'playerKey',
  'tmdbTest',
  'tmdbSearch',
  'tmdbDiscover',
  'tmdbGenres',
  'importTmdbTitle',
  'addShowFromTmdb',
  'refreshMetadata',
  'steamSearch',
  'addGameFromSteam',
  'refreshGameMetadata',
  'setDownloadHosts',
  'suggestedDownloadHosts'
] as const satisfies readonly MistMethod[]

// Compile-time check that MIST_METHODS lists every MistCalls method.
type MissingMethods = Exclude<MistMethod, (typeof MIST_METHODS)[number]>
export const ALL_METHODS_LISTED: MissingMethods extends never ? true : never = true

/** Methods that only read; every other call is followed by a snapshot broadcast. */
export const READ_ONLY_METHODS: readonly MistMethod[] = ['snapshot', 'pickFolder', 'playerOpen', 'playerBounds', 'playerClose', 'playerKey', 'tmdbTest', 'tmdbSearch', 'tmdbDiscover', 'tmdbGenres', 'steamSearch', 'suggestedDownloadHosts']

export const IPC = {
  call: 'mist:call',
  snapshot: 'mist:snapshot',
  jobs: 'mist:jobs',
  player: 'mist:player'
} as const

/** Renderer-side view of MistCalls: every call is async over IPC. */
export type MistApi = {
  [K in MistMethod]: MistCalls[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never
} & {
  onSnapshot(listener: (snapshot: Snapshot) => void): () => void
  onJobs(listener: (jobs: DownloadJob[]) => void): () => void
  onPlayer(listener: (event: PlayerEvent) => void): () => void
  pathForFile(file: File): string
}
