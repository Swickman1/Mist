// MistService: every renderer call lands here. Owns the repository and job runner.
import { BrowserWindow, dialog } from 'electron'
import type { ActionResult, LibraryEntry, MistCalls, Settings, Snapshot, SourceShape, WindowAction } from '../shared/types'
import { resolverFor } from '../sources'
import { sha256File } from '../verify'
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
      appVersion: this.appVersion
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
    const game = this.repo.games.get(gameId)!
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
    const entry = this.entryFor('game', gameId)
    if (!entry?.path) return { ok: false, message: 'Nothing installed to verify' }
    try {
      const digest = await sha256File(entry.path)
      return { ok: true, message: `sha256 ${digest}` }
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
  }

  clearCache(): void {
    this.updateSettings({ cacheBytes: 0 })
  }

  async pickFolder(): Promise<string | null> {
    const win = this.window()
    const options: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : result.filePaths[0]
  }

  windowControl(action: WindowAction): void {
    const win = this.window()
    if (!win) return
    if (action === 'minimize') win.minimize()
    else if (action === 'close') win.close()
    else if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  }

  private entryFor(kind: LibraryEntry['kind'], refId: string): LibraryEntry | undefined {
    return this.repo.library.all().find((row) => row.kind === kind && row.refId === refId)
  }
}
