// MistService: every renderer call lands here. Owns the repository and job runner.
import { app, BrowserWindow, dialog } from 'electron'
import type { ActionResult, LibraryEntry, MistCalls, Settings, Snapshot, SourceShape } from '../shared/types'
import { resolverFor } from '../sources'
import { sha256Parts } from '../verify'
import { applyChrome } from './chrome'
import { JobRunner } from './jobRunner'
import type { Repository } from './repository'

export class MistService implements MistCalls {
  constructor(
    private readonly repo: Repository,
    private readonly runner: JobRunner,
    private readonly appVersion: string,
    private readonly window: () => BrowserWindow | undefined
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

  addShow(showId: string, path?: string): ActionResult {
    const show = this.repo.shows.get(showId)!
    this.entryFor('show', showId) ??
      this.repo.library.put({ id: `lib-${showId}`, kind: 'show', refId: showId, path, addedAt: Date.now(), playtimeSec: 0, state: path ? 'ready' : 'missing' })
    return { ok: true, message: `${show.title} added to your library` }
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

  restoreSeed(): void {
    this.repo.seed()
  }

  play(entryId: string): ActionResult {
    const entry = this.repo.library.get(entryId)!
    this.repo.library.put({ ...entry, lastPlayedAt: Date.now() })
    const title = entry.kind === 'game' ? this.repo.games.get(entry.refId)!.title : this.repo.shows.get(entry.refId)!.title
    return { ok: false, message: `Launching ${title} is not implemented yet` }
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
      const parts = await resolverFor(shape).resolve({ gameId, input, shape })
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

  backupSaves(gameId: string): ActionResult {
    const game = this.repo.games.get(gameId)!
    return { ok: false, message: `Backing up ${game.title} saves to ${this.repo.settings.saveBackupPath} is not implemented yet` }
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
