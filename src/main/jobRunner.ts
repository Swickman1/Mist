// JobRunner: schedules jobs into download slots and drives each one through a real
// pipeline: resolving (resolve parts + pin hashes) → downloading (Transfer copies
// with resume) → verifying (per-part hash) → extracting (install) → ready.
// The tick turns live byte counts into progress and speed.
import { join } from 'node:path'
import { RUNNING_STATES, VISIBLE_STATES, type DownloadJob, type Game, type JobState, type Manifest } from '../shared/types'
import { resolverFor } from '../sources'
import { sha256File } from '../verify'
import type { Repository } from './repository'
import { clearStaging, Transfer, type TransferPhase } from './transfer'

const TICK_MS = 500
/** Weight of the newest speed sample in the smoothed speed. */
const SPEED_SMOOTHING = 0.35

/** Paused or cancelled: the pipeline stops quietly and keeps the state its caller set. */
class Interrupted extends Error {}

interface LiveJob {
  controller: AbortController
  transfer?: Transfer
  bytesDone: number
  sampledBytes: number
  sampledAt: number
}

export interface InstallResult {
  path: string
  exeHint?: string
}

/** Turns a fully staged, verified game into an installed library folder. */
export type Installer = (game: Game, stagingDir: string, signal: AbortSignal) => Promise<InstallResult>

const PHASE_STATE: Record<TransferPhase, JobState> = { copying: 'downloading', verifying: 'verifying', stalled: 'stalled' }

export class JobRunner {
  private readonly live = new Map<string, LiveJob>()
  private timer: NodeJS.Timeout | undefined

  constructor(
    private readonly repo: Repository,
    private readonly install: Installer,
    private readonly onJobsChanged: (jobs: DownloadJob[]) => void,
    private readonly onLibraryChanged: () => void
  ) {}

  start(): void {
    // Jobs interrupted by a quit go back to the queue and resume from what is staged.
    for (const job of this.repo.jobs.all()) {
      if (RUNNING_STATES.includes(job.state) || job.state === 'stalled') this.repo.jobs.put({ ...job, state: 'queued', speedBps: 0 })
    }
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  stop(): void {
    clearInterval(this.timer)
    for (const live of this.live.values()) live.controller.abort(new Interrupted('quit'))
  }

  jobs(): DownloadJob[] {
    return this.repo.jobs.all()
  }

  stagingDir(gameId: string): string {
    return join(this.repo.settings.stagingPath, gameId)
  }

  enqueue(gameId: string): void {
    const existing = this.repo.jobs.all().find((job) => job.gameId === gameId && VISIBLE_STATES.includes(job.state))
    if (existing) {
      if (existing.state === 'paused') this.resume(existing.id)
      if (existing.state === 'failed') this.retry(existing.id)
      return
    }
    const game = this.repo.games.get(gameId)!
    const now = Date.now()
    this.repo.jobs.put({
      id: `job-${gameId}-${now}`,
      gameId,
      state: 'queued',
      progress: 0,
      bytesTotal: game.sizeBytes,
      bytesDone: 0,
      speedBps: 0,
      attempts: 0,
      createdAt: now
    })
    this.publish()
  }

  pause(jobId: string): void {
    if (this.patch(jobId, ['queued', 'stalled', ...RUNNING_STATES], { state: 'paused', speedBps: 0 })) this.interrupt(jobId, 'paused')
  }

  resume(jobId: string): void {
    this.patch(jobId, ['paused'], { state: 'queued' })
  }

  cancel(jobId: string): void {
    const job = this.repo.jobs.get(jobId)
    if (!this.patch(jobId, VISIBLE_STATES, { state: 'cancelled', speedBps: 0, reason: undefined })) return
    this.interrupt(jobId, 'cancelled')
    void clearStaging(this.stagingDir(job!.gameId))
  }

  retry(jobId: string): void {
    const job = this.repo.jobs.get(jobId)
    if (!job || !['failed', 'stalled', 'cancelled'].includes(job.state)) return
    this.repo.jobs.put({ ...job, state: 'queued', reason: undefined, speedBps: 0, attempts: job.attempts + 1 })
    this.publish()
  }

  pauseAll(): void {
    this.repo.jobs.all().forEach((job) => this.pause(job.id))
  }

  cancelAll(): void {
    this.repo.jobs.all().forEach((job) => this.cancel(job.id))
  }

  removeForGame(gameId: string): void {
    for (const job of this.repo.jobs.all().filter((row) => row.gameId === gameId)) {
      this.interrupt(job.id, 'removed')
      this.repo.jobs.delete(job.id)
    }
    void clearStaging(this.stagingDir(gameId))
    this.publish()
  }

  /** Applies a patch when the job is in one of `from`. Returns whether it applied. */
  private patch(jobId: string, from: readonly JobState[], patch: Partial<DownloadJob>): boolean {
    const job = this.repo.jobs.get(jobId)
    if (!job || !from.includes(job.state)) return false
    this.repo.jobs.put({ ...job, ...patch })
    this.publish()
    return true
  }

  private interrupt(jobId: string, why: string): void {
    const live = this.live.get(jobId)
    if (!live) return
    live.controller.abort(new Interrupted(why))
    live.transfer?.abort(new Interrupted(why))
  }

  /** Pipeline-side state change; ignored once the job was paused or cancelled. */
  private set(jobId: string, patch: Partial<DownloadJob>): void {
    if (this.live.get(jobId)?.controller.signal.aborted) return
    const job = this.repo.jobs.get(jobId)
    if (!job) return
    this.repo.jobs.put({ ...job, ...patch })
    this.publish()
  }

  private publish(): void {
    this.onJobsChanged(this.jobs())
  }

  private tick(): void {
    const queued = this.repo.jobs
      .all()
      .filter((job) => job.state === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt)
    for (const job of queued) {
      if (this.live.size >= this.repo.settings.concurrentDownloads) break
      void this.run(job)
    }

    const now = Date.now()
    let changed = false
    for (const [jobId, live] of this.live) {
      const job = this.repo.jobs.get(jobId)
      if (!job) continue
      const next = this.advance(job, live, now)
      if (!next) continue
      this.repo.jobs.put(next)
      changed = true
    }
    if (changed) this.publish()
  }

  /** Real bytes → progress; bytes over time → smoothed speed. */
  private advance(job: DownloadJob, live: LiveJob, now: number): DownloadJob | undefined {
    if (job.state !== 'downloading' && job.state !== 'stalled' && job.state !== 'verifying') return undefined
    const dt = (now - live.sampledAt) / 1000
    const sample = dt > 0 ? Math.max(0, live.bytesDone - live.sampledBytes) / dt : 0
    live.sampledBytes = live.bytesDone
    live.sampledAt = now
    const speedBps = job.state === 'downloading' ? Math.round(job.speedBps + SPEED_SMOOTHING * (sample - job.speedBps)) : 0
    const progress = job.bytesTotal > 0 ? live.bytesDone / job.bytesTotal : 0
    if (job.bytesDone === live.bytesDone && job.speedBps === speedBps) return undefined
    return { ...job, bytesDone: live.bytesDone, progress, speedBps }
  }

  private async run(job: DownloadJob): Promise<void> {
    const live: LiveJob = { controller: new AbortController(), bytesDone: job.bytesDone, sampledBytes: job.bytesDone, sampledAt: Date.now() }
    this.live.set(job.id, live)
    const signal = live.controller.signal
    this.set(job.id, { state: 'resolving', reason: undefined, speedBps: 0 })
    try {
      const game = this.repo.games.get(job.gameId)!
      const manifest = await this.manifestFor(game, signal)
      const stagingDir = this.stagingDir(game.id)
      const transfer = new Transfer(stagingDir, manifest.parts, {
        onBytes: (bytes) => (live.bytesDone = bytes),
        onPhase: (phase, detail) => this.set(job.id, { state: PHASE_STATE[phase], reason: phase === 'stalled' ? detail : undefined })
      })
      live.transfer = transfer
      this.set(job.id, { bytesTotal: transfer.bytesTotal })
      signal.throwIfAborted()
      await transfer.run()

      this.set(job.id, { state: 'extracting', bytesDone: transfer.bytesTotal, progress: 1, speedBps: 0, reason: undefined })
      const installed = await this.install(this.repo.games.get(game.id)!, stagingDir, signal)
      signal.throwIfAborted()
      this.markInstalled(game.id, installed)
      this.set(job.id, { state: 'ready' })
    } catch (error) {
      if (signal.aborted || error instanceof Interrupted) return
      this.set(job.id, { state: 'failed', speedBps: 0, reason: (error as Error).message })
    } finally {
      this.live.delete(job.id)
    }
  }

  /** Resolves the game's source into parts with pinned hashes, reusing a still-valid manifest. */
  private async manifestFor(game: Game, signal: AbortSignal): Promise<Manifest> {
    if (!game.source || !game.shape) throw new Error('No source set for this game')
    const parts = await resolverFor(game.shape).resolve({ gameId: game.id, input: game.source, shape: game.shape })
    const pinned = game.manifest?.parts
    const unchanged =
      pinned !== undefined &&
      game.manifest!.version === game.version &&
      pinned.length === parts.length &&
      pinned.every((part, i) => part.path === parts[i].path && part.sizeBytes === parts[i].sizeBytes && part.sha256)
    if (unchanged) return game.manifest!

    // No sidecar checksum: hash the source once so every staged copy can be checked against it.
    for (const part of parts) {
      if (!part.sha256) part.sha256 = await sha256File(part.path!, signal)
    }
    const manifest: Manifest = { version: game.version, parts, createdAt: Date.now() }
    this.repo.games.put({ ...this.repo.games.get(game.id)!, parts, manifest })
    return manifest
  }

  private markInstalled(gameId: string, installed: InstallResult): void {
    const entry = this.repo.library.all().find((row) => row.kind === 'game' && row.refId === gameId)
    if (entry) this.repo.library.put({ ...entry, state: 'ready', path: installed.path })
    if (installed.exeHint) this.repo.games.put({ ...this.repo.games.get(gameId)!, exeHint: installed.exeHint })
    this.onLibraryChanged()
  }
}
