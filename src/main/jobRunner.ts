// Fake download runner: advances jobs through every JobState on a timer so the UI
// is genuinely exercised. Seeded faults make one job stall and one fail its hash check.
import { RUNNING_STATES, VISIBLE_STATES, type DownloadJob, type JobState } from '../shared/types'
import type { Repository } from './repository'
import type { SeededJob } from './seed'

const TICK_MS = 500
const DOWNLOAD_SECONDS = 18
const PHASE_MS: Partial<Record<JobState, number>> = { resolving: 1500, verifying: 2000, extracting: 2500 }
const STALL_AT_PROGRESS = 0.4
const STALL_RECOVER_MS = 15_000

export class JobRunner {
  private readonly phaseStartedAt = new Map<string, number>()
  private timer: NodeJS.Timeout | undefined
  private lastTick = Date.now()

  constructor(
    private readonly repo: Repository,
    private readonly onJobsChanged: (jobs: DownloadJob[]) => void,
    private readonly onLibraryChanged: () => void
  ) {}

  start(): void {
    // Jobs interrupted by a quit resume from the queue.
    for (const job of this.repo.jobs.all()) {
      if (RUNNING_STATES.includes(job.state)) this.repo.jobs.put({ ...job, state: 'queued', speedBps: 0 })
    }
    this.lastTick = Date.now()
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  stop(): void {
    clearInterval(this.timer)
  }

  jobs(): DownloadJob[] {
    return this.repo.jobs.all().map(({ fault: _fault, ...job }) => job)
  }

  enqueue(gameId: string): void {
    const existing = this.repo.jobs.all().find((job) => job.gameId === gameId && VISIBLE_STATES.includes(job.state))
    if (existing) {
      if (existing.state === 'paused') this.resume(existing.id)
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
    this.update(jobId, ['queued', 'stalled', ...RUNNING_STATES], { state: 'paused', speedBps: 0 })
  }

  resume(jobId: string): void {
    this.update(jobId, ['paused'], { state: 'queued' })
  }

  cancel(jobId: string): void {
    this.update(jobId, VISIBLE_STATES, { state: 'cancelled', speedBps: 0 })
  }

  retry(jobId: string): void {
    const job = this.repo.jobs.get(jobId)
    if (!job || !['failed', 'stalled', 'cancelled'].includes(job.state)) return
    const restart = job.state === 'failed'
    this.put({
      ...job,
      state: 'queued',
      reason: undefined,
      attempts: job.attempts + 1,
      bytesDone: restart ? 0 : job.bytesDone,
      progress: restart ? 0 : job.progress
    })
    this.publish()
  }

  pauseAll(): void {
    this.repo.jobs.all().forEach((job) => this.pause(job.id))
  }

  cancelAll(): void {
    this.repo.jobs.all().forEach((job) => this.cancel(job.id))
  }

  removeForGame(gameId: string): void {
    this.repo.jobs.all().filter((job) => job.gameId === gameId).forEach((job) => this.repo.jobs.delete(job.id))
    this.publish()
  }

  private update(jobId: string, from: readonly JobState[], patch: Partial<SeededJob>): void {
    const job = this.repo.jobs.get(jobId)
    if (!job || !from.includes(job.state)) return
    this.put({ ...job, ...patch })
    this.publish()
  }

  private put(job: SeededJob): void {
    const previous = this.repo.jobs.get(job.id)
    if (previous?.state !== job.state) this.phaseStartedAt.set(job.id, Date.now())
    this.repo.jobs.put(job)
  }

  private publish(): void {
    this.onJobsChanged(this.jobs())
  }

  private elapsed(job: SeededJob, now: number): number {
    return now - (this.phaseStartedAt.get(job.id) ?? now)
  }

  private tick(): void {
    const now = Date.now()
    const dt = (now - this.lastTick) / 1000
    this.lastTick = now
    const jobs = this.repo.jobs.all().sort((a, b) => a.createdAt - b.createdAt)
    let changed = false
    let libraryChanged = false

    let running = jobs.filter((job) => RUNNING_STATES.includes(job.state)).length
    for (const job of jobs) {
      if (job.state === 'queued' && running < this.repo.settings.concurrentDownloads) {
        job.state = 'resolving'
        this.put(job)
        running++
        changed = true
      }
    }

    for (const job of jobs) {
      const next = this.advance(job, now, dt)
      if (!next) continue
      this.put(next)
      changed = true
      if (next.state === 'ready') {
        this.markInstalled(next.gameId)
        libraryChanged = true
      }
    }

    if (changed) this.publish()
    if (libraryChanged) this.onLibraryChanged()
  }

  /** Returns the job's next value, or undefined when nothing changed this tick. */
  private advance(job: SeededJob, now: number, dt: number): SeededJob | undefined {
    const elapsed = this.elapsed(job, now)
    switch (job.state) {
      case 'resolving':
        return elapsed >= PHASE_MS.resolving! ? { ...job, state: 'downloading' } : undefined
      case 'downloading': {
        const baseSpeed = job.bytesTotal / DOWNLOAD_SECONDS
        const speedBps = Math.round(baseSpeed * (0.8 + Math.random() * 0.4))
        const bytesDone = Math.min(job.bytesTotal, job.bytesDone + speedBps * dt)
        const progress = bytesDone / job.bytesTotal
        if (job.fault === 'stall' && job.attempts === 0 && progress >= STALL_AT_PROGRESS) {
          return { ...job, state: 'stalled', speedBps: 0, reason: 'No data received from source for 30s' }
        }
        if (bytesDone >= job.bytesTotal) return { ...job, state: 'verifying', bytesDone, progress: 1, speedBps: 0 }
        return { ...job, bytesDone, progress, speedBps }
      }
      case 'verifying':
        if (elapsed < PHASE_MS.verifying!) return undefined
        if (job.fault === 'hash' && job.attempts === 0) {
          return { ...job, state: 'failed', reason: 'Hash mismatch on part 2 of 3 (expected 3f9a…c21e, got 9b07…44d1)' }
        }
        return { ...job, state: 'extracting' }
      case 'extracting':
        return elapsed >= PHASE_MS.extracting! ? { ...job, state: 'ready', speedBps: 0 } : undefined
      case 'stalled':
        // Simulated reconnect: the second attempt goes through.
        return elapsed >= STALL_RECOVER_MS ? { ...job, state: 'queued', reason: undefined, attempts: job.attempts + 1 } : undefined
      default:
        return undefined
    }
  }

  private markInstalled(gameId: string): void {
    const entry = this.repo.library.all().find((row) => row.kind === 'game' && row.refId === gameId)
    if (!entry) return
    const game = this.repo.games.get(gameId)!
    this.repo.library.put({
      ...entry,
      state: 'ready',
      path: `${this.repo.settings.libraryPath}\\${game.title.replace(/[^A-Za-z0-9]/g, '')}`
    })
  }
}
