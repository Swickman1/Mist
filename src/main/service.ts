// MistService: every renderer call lands here. Owns the repository and job runner.
import { app, BrowserWindow, dialog } from 'electron'
import type {
  ActionResult,
  LibraryEntry,
  MistCalls,
  PlayerBounds,
  PlayerOpenRequest,
  PlayerOpenResult,
  Settings,
  Snapshot,
  SourceShape,
  SteamSearchResult,
  TmdbDiscoverMode,
  TmdbDiscoverResult,
  TmdbGenresResult,
  TmdbKind,
  TmdbSearchResult
} from '../shared/types'
import { resolverFor } from '../sources'
import { sha256Parts } from '../verify'
import { existsSync } from 'node:fs'
import { applyChrome } from './chrome'
import { launchGame } from './install'
import { indexShow } from './media'
import type { MpvHost } from './mpv'
import { backupSaves } from './saves'
import { artUrlsOf, cacheKey, cachedArt, importTitle, METADATA_CONFIG, toHit, type ArtUrl } from './metadata'
import type { ArtCache } from './artCache'
import { cachedSteamArt, GAME_METADATA_CONFIG, importSteamGame, steamArtUrlsOf, toSteamHit, type SteamArtUrl } from './gameMetadata'
import { normaliseHosts, SUGGESTED_DOWNLOAD_HOSTS, type HttpContext } from './net'
import { SteamClient } from './steam'
import { TmdbClient } from './tmdb'
import { JobRunner } from './jobRunner'
import type { Repository } from './repository'

/** Shorter runs (crash on launch, a launcher that hands off and exits) do not count as play. */
const MIN_PLAYTIME_RUN_SEC = 10

export class MistService implements MistCalls {
  /** Where imported TMDB artwork is referenced from. */
  private readonly art: ArtUrl = cachedArt
  private readonly steam = new SteamClient()
  /** Where imported Steam artwork is referenced from. */
  private readonly steamArt: SteamArtUrl = cachedSteamArt
  private readonly tmdb = new TmdbClient(() => ({ key: this.repo.settings.tmdbKey, language: this.repo.settings.tmdbLanguage }))

  constructor(
    private readonly repo: Repository,
    private readonly runner: JobRunner,
    private readonly appVersion: string,
    private readonly window: () => BrowserWindow | undefined,
    private readonly mpv: MpvHost,
    /** Library rows changed outside an IPC call (e.g. playtime after a game exits). */
    private readonly onLibraryChanged: () => void,
    private readonly tmdbCache: ArtCache,
    private readonly steamCache: ArtCache,
    /** Allowlist + User-Agent for URL sources (shared with the job runner). */
    private readonly http: HttpContext
  ) {}

  snapshot(): Snapshot {
    return {
      games: this.repo.games.all(),
      shows: this.repo.shows.all(),
      episodes: this.repo.episodes.all(),
      library: this.repo.library.all(),
      jobs: this.runner.jobs(),
      settings: this.repo.settings,
      watchlist: this.repo.watchlist.all().map((row) => row.id),
      appVersion: this.appVersion,
      startup: { available: app.isPackaged, enabled: app.isPackaged && app.getLoginItemSettings().openAtLogin }
    }
  }

  async addGame(gameId: string, source?: { input: string; shape: SourceShape }): Promise<ActionResult> {
    const game = this.repo.games.get(gameId)!
    this.entryFor('game', gameId) ??
      this.repo.library.put({ id: `lib-${gameId}`, kind: 'game', refId: gameId, addedAt: Date.now(), playtimeSec: 0, state: 'missing' })
    if (source) {
      const result = await this.setSource(gameId, source.input, source.shape)
      if (!result.ok) return result
    }
    return { ok: true, message: `${game.title} added to your library` }
  }

  async addShow(showId: string, path?: string): Promise<ActionResult> {
    const show = this.repo.shows.get(showId)!
    const entry =
      this.entryFor('show', showId) ??
      this.repo.library.put({ id: `lib-${showId}`, kind: 'show', refId: showId, path, addedAt: Date.now(), playtimeSec: 0, state: path ? 'ready' : 'missing' })
    await indexShow(this.repo, entry)
    const found = this.repo.episodes.all().filter((episode) => episode.showId === showId && episode.filePath).length
    return { ok: true, message: `${show.title} added to your library · ${found} video file(s) found` }
  }

  removeEntry(entryId: string): void {
    const entry = this.repo.library.get(entryId)
    if (!entry) return
    if (entry.kind === 'game') this.runner.removeForGame(entry.refId)
    this.repo.library.delete(entryId)
  }

  clearLibrary(): void {
    this.repo.transaction(() => {
      this.repo.library.clear()
      this.repo.jobs.clear()
    })
  }

  clearCatalog(): void {
    // Stop running pipelines first so none of them writes into a cleared catalog.
    this.runner.cancelAll()
    this.repo.clearCatalog()
  }

  loadSampleData(): void {
    this.runner.cancelAll()
    this.repo.loadSampleData()
  }

  play(entryId: string): ActionResult {
    const entry = this.repo.library.get(entryId)!
    if (entry.kind === 'show') {
      this.repo.library.put({ ...entry, lastPlayedAt: Date.now() })
      return { ok: true, message: `Playing ${this.repo.shows.get(entry.refId)!.title}` }
    }
    const game = this.repo.games.get(entry.refId)!
    let child
    try {
      child = launchGame(entry, game)
    } catch (error) {
      if (entry.path && !existsSync(entry.path)) this.repo.library.put({ ...entry, state: 'missing' })
      return { ok: false, message: (error as Error).message }
    }
    const startedAt = Date.now()
    child.once('error', () => undefined) // a failed spawn must not crash main; it simply records no playtime
    child.once('exit', () => this.recordPlaytime(entryId, (Date.now() - startedAt) / 1000))
    this.repo.library.put({ ...entry, lastPlayedAt: startedAt })
    return { ok: true, message: `Launched ${game.title}` }
  }

  /** Adds a finished run to the entry's playtime: skips runs under MIN_PLAYTIME_RUN_SEC and entries removed meanwhile. */
  private recordPlaytime(entryId: string, elapsedSec: number): void {
    if (elapsedSec < MIN_PLAYTIME_RUN_SEC) return
    const entry = this.repo.library.get(entryId)
    if (!entry) return
    this.repo.library.put({ ...entry, playtimeSec: entry.playtimeSec + Math.round(elapsedSec) })
    this.onLibraryChanged()
  }

  install(gameId: string): void {
    this.entryFor('game', gameId) ??
      this.repo.library.put({ id: `lib-${gameId}`, kind: 'game', refId: gameId, addedAt: Date.now(), playtimeSec: 0, state: 'missing' })
    this.runner.enqueue(gameId)
  }

  async setSource(gameId: string, input: string, shape: SourceShape): Promise<ActionResult> {
    // A new source invalidates the pinned manifest; the next install re-resolves and re-hashes.
    const { manifest: _stale, ...game } = this.repo.games.get(gameId)!
    this.repo.games.put({ ...game, source: input, shape })
    try {
      const parts = await resolverFor(shape).resolve({ gameId, input, shape, http: this.http })
      this.repo.games.put({ ...game, source: input, shape, parts })
      return { ok: true, message: `Source resolved into ${parts.length} part(s)` }
    } catch (error) {
      return { ok: false, message: `Source saved. ${(error as Error).message}` }
    }
  }

  async verifyGame(gameId: string): Promise<ActionResult> {
    const parts = this.repo.games.get(gameId)!.manifest?.parts.filter((part) => part.path && part.sha256)
    if (!parts?.length) return { ok: false, message: 'No install manifest with hashes to verify against' }
    try {
      const digests = await sha256Parts(parts.map((part) => part.path!))
      const bad = parts.filter((part, i) => digests[i] !== part.sha256)
      if (bad.length) return { ok: false, message: `Hash mismatch: ${bad.map((part) => part.name).join(', ')}` }
      return { ok: true, message: `${parts.length} part(s) match their sha256` }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
  }

  async backupSaves(gameId: string): Promise<ActionResult> {
    const game = this.repo.games.get(gameId)!
    const roots = { Documents: app.getPath('documents'), AppData: app.getPath('appData'), LocalAppData: process.env['LOCALAPPDATA']! }
    try {
      const result = await backupSaves(gameId, this.repo.settings.saveBackupPath, roots, () => this.pickFolder())
      if (!result) return { ok: false, message: 'Backup cancelled' }
      if (result.count === 0) return { ok: false, message: `No ${game.title} save files found in their usual folders` }
      return { ok: true, message: `Backed up ${result.count} file(s) to ${result.destination}` }
    } catch (error) {
      return { ok: false, message: `Backup failed: ${(error as Error).message}` }
    }
  }

  pauseJob(jobId: string): void {
    this.runner.pause(jobId)
  }

  resumeJob(jobId: string): void {
    this.runner.resume(jobId)
  }

  cancelJob(jobId: string): void {
    this.runner.cancel(jobId)
  }

  retryJob(jobId: string): void {
    this.runner.retry(jobId)
  }

  pauseAll(): void {
    this.runner.pauseAll()
  }

  cancelAll(): void {
    this.runner.cancelAll()
  }

  setEpisodePosition(episodeId: string, positionSec: number): void {
    const episode = this.repo.episodes.get(episodeId)!
    this.repo.episodes.put({ ...episode, positionSec: Math.max(0, Math.min(episode.durationSec, positionSec)) })
  }

  toggleWatchlist(showId: string): void {
    if (this.repo.watchlist.get(showId)) this.repo.watchlist.delete(showId)
    else this.repo.watchlist.put({ id: showId })
  }

  updateSettings(patch: Partial<Settings>): void {
    this.repo.settings = { ...this.repo.settings, ...patch }
    const win = this.window()
    if (patch.theme && win) applyChrome(win, patch.theme)
  }

  clearCache(): void {
    this.updateSettings({ cacheBytes: 0 })
  }

  setLaunchAtLogin(enabled: boolean): void {
    if (!app.isPackaged) return
    app.setLoginItemSettings({ openAtLogin: enabled })
  }

  async playerOpen(request: PlayerOpenRequest): Promise<PlayerOpenResult> {
    const result = await this.mpv.open(request)
    if (result.backend === 'video' && result.mpvMissing) return { ...result, showMissingBanner: !this.repo.settings.mpvBannerDismissed }
    return result
  }

  playerBounds(bounds: PlayerBounds): void {
    this.mpv.setBounds(bounds)
  }

  playerClose(): Promise<number | null> {
    return this.mpv.close()
  }

  playerKey(key: string): void {
    this.mpv.key(key)
  }

  async tmdbDiscover(kind: TmdbKind, mode: TmdbDiscoverMode, page: number, genreId?: number): Promise<TmdbDiscoverResult> {
    try {
      const result = mode === 'trending' ? await this.tmdb.trending(kind, page) : await this.tmdb.discover(kind, page, genreId)
      return {
        ok: true,
        hits: result.results.slice(0, METADATA_CONFIG.browseRowLimit).map((item) => toHit(kind, item)),
        page: result.page,
        totalPages: result.total_pages
      }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  }

  async tmdbGenres(kind: TmdbKind): Promise<TmdbGenresResult> {
    try {
      return { ok: true, genres: (await this.tmdb.genres(kind)).genres }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  }

  async importTmdbTitle(kind: TmdbKind, tmdbId: number): Promise<ActionResult & { showId?: string }> {
    try {
      const { show, created } = await importTitle(this.tmdb, this.repo, this.tmdbCache, kind, tmdbId, this.art)
      void this.tmdbCache.prefetch(artUrlsOf(this.repo, show.id))
      return { ok: true, message: `${show.title} ${kind === 'movie' ? 'movie' : `· ${created} episodes`} imported`, showId: show.id }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
  }

  async tmdbSearch(kind: TmdbKind, query: string): Promise<TmdbSearchResult> {
    if (query.trim().length < 2) return { ok: true, hits: [] }
    try {
      const page = kind === 'tv' ? await this.tmdb.searchTv(query.trim()) : await this.tmdb.searchMovie(query.trim())
      return { ok: true, hits: page.results.slice(0, METADATA_CONFIG.searchResultLimit).map((result) => toHit(kind, result)) }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  }

  async addShowFromTmdb(kind: TmdbKind, tmdbId: number, path?: string): Promise<ActionResult> {
    let imported
    try {
      imported = await importTitle(this.tmdb, this.repo, this.tmdbCache, kind, tmdbId, this.art)
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
    const { show, created, updated } = imported
    await this.addShow(show.id, path)
    // Warm the artwork cache in the background so the title works offline from here on.
    void this.tmdbCache.prefetch(artUrlsOf(this.repo, show.id))
    const what =
      kind === 'movie'
        ? `movie, ${created ? '1 episode created' : '1 episode updated'}`
        : `${created} episode${created === 1 ? '' : 's'} created${updated ? `, ${updated} updated` : ''}`
    const files = path ? ` · ${this.repo.episodes.all().filter((episode) => episode.showId === show.id && episode.filePath).length} video file(s) found` : ''
    return { ok: true, message: `${show.title} added · ${what}${files}` }
  }

  async steamSearch(query: string): Promise<SteamSearchResult> {
    if (query.trim().length < 2) return { ok: true, hits: [] }
    try {
      const result = await this.steam.search(query.trim())
      const apps = result.items.filter((item) => item.type === 'app')
      return { ok: true, hits: apps.slice(0, GAME_METADATA_CONFIG.searchResultLimit).map(toSteamHit) }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  }

  async addGameFromSteam(appId: number, source?: { input: string; shape: SourceShape }): Promise<ActionResult> {
    let imported
    try {
      imported = await importSteamGame(this.steam, this.repo, this.steamCache, appId, this.steamArt)
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
    const { game, created } = imported
    // Warm the artwork cache in the background so the game's art works offline from here on.
    void this.steamCache.prefetch(steamArtUrlsOf(game))
    const added = await this.addGame(game.id, source)
    if (!added.ok) return added
    const facts = [game.genres?.slice(0, 3).join(', '), game.releaseDate && `released ${game.releaseDate}`].filter(Boolean).join(' · ')
    return { ok: true, message: `${game.title} ${created ? 'added' : 'metadata updated'}${facts ? ` · ${facts}` : ''}` }
  }

  async setDownloadHosts(text: string): Promise<ActionResult> {
    const result = normaliseHosts(text.split(/\r?\n/))
    if (!result.ok) return { ok: false, message: result.error }
    this.updateSettings({ downloadHosts: result.hosts })
    return { ok: true, message: `${result.hosts.length} download host(s) allowed` }
  }

  async suggestedDownloadHosts(): Promise<string[]> {
    return SUGGESTED_DOWNLOAD_HOSTS
  }

  async refreshGameMetadata(gameId: string): Promise<ActionResult> {
    const before = this.repo.games.get(gameId)
    if (!before?.steamAppId) return { ok: false, message: 'This game is not linked to a Steam store page' }
    let imported
    try {
      // fresh: the one place appdetails is called again for a cached app.
      imported = await importSteamGame(this.steam, this.repo, this.steamCache, before.steamAppId, this.steamArt, true)
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
    const { game } = imported
    const pruned = await this.steamCache.prune(String(before.steamAppId), steamArtUrlsOf(game))
    void this.steamCache.prefetch(steamArtUrlsOf(game))
    return { ok: true, message: `${game.title} refreshed${pruned ? ` · ${pruned} stale image(s) removed` : ''}` }
  }

  async refreshMetadata(showId: string): Promise<ActionResult> {
    const show = this.repo.shows.get(showId)
    if (!show?.tmdbKind || !show.tmdbId) return { ok: false, message: 'This title was not imported from TMDB' }
    let imported
    try {
      imported = await importTitle(this.tmdb, this.repo, this.tmdbCache, show.tmdbKind, show.tmdbId, this.art)
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
    await this.tmdbCache.prune(cacheKey(show.tmdbKind, show.tmdbId), artUrlsOf(this.repo, showId))
    void this.tmdbCache.prefetch(artUrlsOf(this.repo, showId))
    const { created, updated } = imported
    return { ok: true, message: `${imported.show.title} refreshed · ${updated} episode(s) updated${created ? `, ${created} new` : ''}` }
  }

  async tmdbTest(): Promise<ActionResult> {
    try {
      await this.tmdb.testKey()
      return { ok: true, message: 'TMDB key is valid' }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
  }

  async pickFolder(): Promise<string | null> {
    const win = this.window()
    const options: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0]
  }

  private entryFor(kind: LibraryEntry['kind'], refId: string): LibraryEntry | undefined {
    return this.repo.library.all().find((row) => row.kind === kind && row.refId === refId)
  }
}
