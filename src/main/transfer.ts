// Real transfer engine: copies a game's parts from disk / other drives / shares
// into <stagingPath>/<gameId>/, resuming from whatever is already staged.
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat, statfs, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Part } from '../shared/types'
import { sha256File } from '../verify'

export const TRANSFER_CONFIG = {
  /** No bytes for this long counts as a stall. */
  stallMs: 30_000,
  /** Backoff before each stall retry; its length is the retry count. */
  stallBackoffMs: [5_000, 15_000],
  /** Re-copies of a part whose hash does not match, after the first copy. */
  hashRetries: 3,
  watchdogMs: 1_000,
  tempSuffix: '.part'
}

export type TransferErrorCode = 'disk_full' | 'stalled' | 'hash_mismatch' | 'source_missing'

export class TransferError extends Error {
  constructor(
    readonly code: TransferErrorCode,
    message: string
  ) {
    super(`${code}: ${message}`)
  }
}

export type TransferPhase = 'copying' | 'verifying' | 'stalled'

export interface TransferEvents {
  /** Total bytes staged for this transfer (complete parts + partial temp files). */
  onBytes(bytesDone: number): void
  onPhase(phase: TransferPhase, detail?: string): void
}

/** Seams the tests (and nothing else) override. */
export interface TransferOptions {
  stallMs?: number
  stallBackoffMs?: number[]
  freeBytes?: (dir: string) => Promise<number>
  openSource?: (part: Part, start: number) => Readable
}

const GB = 1024 ** 3

function formatGb(bytes: number): string {
  return `${(bytes / GB).toFixed(bytes < GB ? 2 : 1)} GB`
}

/** Makes a part's relative name safe as a path under the staging dir. */
export function sanitiseName(name: string): string {
  return name
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((segment) => {
      const clean = segment.replace(/[<>:"|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '')
      return clean === '' || clean === '..' ? '_' : clean
    })
    .join('\\')
}

async function sizeOf(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).size
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

async function statfsFree(dir: string): Promise<number> {
  const info = await statfs(dir)
  return info.bavail * info.bsize
}

export class Transfer {
  private readonly controller = new AbortController()
  private readonly staged = new Map<number, number>()
  private readonly stallMs: number
  private readonly stallBackoffMs: number[]
  private readonly freeBytes: (dir: string) => Promise<number>
  private readonly openSource: (part: Part, start: number) => Readable

  constructor(
    readonly stagingDir: string,
    readonly parts: Part[],
    private readonly events: TransferEvents,
    options: TransferOptions = {}
  ) {
    this.stallMs = options.stallMs ?? TRANSFER_CONFIG.stallMs
    this.stallBackoffMs = options.stallBackoffMs ?? TRANSFER_CONFIG.stallBackoffMs
    this.freeBytes = options.freeBytes ?? statfsFree
    this.openSource = options.openSource ?? ((part, start) => createReadStream(part.path!, { start }))
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  get bytesTotal(): number {
    return this.parts.reduce((sum, part) => sum + part.sizeBytes, 0)
  }

  get bytesDone(): number {
    let sum = 0
    for (const bytes of this.staged.values()) sum += bytes
    return sum
  }

  stagedPath(part: Part): string {
    return join(this.stagingDir, sanitiseName(part.name))
  }

  /** Reads what is already staged so progress and resume start from the right offset. */
  async scan(): Promise<number> {
    for (const part of this.parts) {
      const done = await sizeOf(this.stagedPath(part))
      const partial = await sizeOf(this.stagedPath(part) + TRANSFER_CONFIG.tempSuffix)
      this.staged.set(part.index, Math.min(part.sizeBytes, done ?? partial ?? 0))
    }
    this.events.onBytes(this.bytesDone)
    return this.bytesDone
  }

  /** Copies and verifies every part. Rejects with TransferError, or the abort reason when paused/cancelled. */
  async run(): Promise<void> {
    await mkdir(this.stagingDir, { recursive: true })
    await this.scan()
    await this.checkFreeSpace()
    for (const part of this.parts) await this.copyVerified(part)
  }

  /** Stops copying and keeps staged bytes for a later resume. */
  abort(reason: unknown): void {
    this.controller.abort(reason)
  }

  private async checkFreeSpace(): Promise<void> {
    const needed = this.bytesTotal - this.bytesDone
    const free = await this.freeBytes(this.stagingDir)
    if (free < needed) throw new TransferError('disk_full', `need ${formatGb(needed)}, ${formatGb(free)} free on the staging drive`)
  }

  private setStaged(part: Part, bytes: number): void {
    this.staged.set(part.index, bytes)
    this.events.onBytes(this.bytesDone)
  }

  /** Copy, hash, and on mismatch delete only this part and copy it again. */
  private async copyVerified(part: Part): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      await this.copyWithStallRetry(part)
      if (!part.sha256) return
      this.events.onPhase('verifying', part.name)
      const digest = await sha256File(this.stagedPath(part), this.signal)
      if (digest === part.sha256) return
      await unlink(this.stagedPath(part))
      this.setStaged(part, 0)
      if (attempt >= TRANSFER_CONFIG.hashRetries) {
        throw new TransferError('hash_mismatch', `${part.name} still does not match its sha256 after ${TRANSFER_CONFIG.hashRetries} re-copies`)
      }
    }
  }

  private async copyWithStallRetry(part: Part): Promise<void> {
    for (let retry = 0; ; retry++) {
      try {
        this.events.onPhase('copying', part.name)
        await this.copy(part)
        return
      } catch (error) {
        if (!(error instanceof TransferError) || error.code !== 'stalled') throw error
        if (retry >= this.stallBackoffMs.length) {
          throw new TransferError('stalled', `no progress for ${this.stallMs / 1000}s on ${part.name} after ${retry} retries`)
        }
        const wait = this.stallBackoffMs[retry]
        this.events.onPhase('stalled', `No progress for ${this.stallMs / 1000}s on ${part.name}. Retry ${retry + 1} of ${this.stallBackoffMs.length} in ${wait / 1000}s`)
        await sleep(wait, this.signal)
      }
    }
  }

  /** Appends from the temp file's current length, then renames it into place. */
  private async copy(part: Part): Promise<void> {
    const dest = this.stagedPath(part)
    const temp = dest + TRANSFER_CONFIG.tempSuffix
    await mkdir(dirname(dest), { recursive: true })

    if ((await sizeOf(dest)) === part.sizeBytes) return this.setStaged(part, part.sizeBytes)

    let offset = (await sizeOf(temp)) ?? 0
    if (offset > part.sizeBytes) {
      await unlink(temp)
      offset = 0
    }
    if ((await sizeOf(part.path!)) === undefined) throw new TransferError('source_missing', `${part.path} is not reachable`)
    this.setStaged(part, offset)

    if (offset < part.sizeBytes) {
      const stall = new AbortController()
      let lastProgress = Date.now()
      let copied = offset
      const watchdog = setInterval(() => {
        if (Date.now() - lastProgress > this.stallMs) stall.abort(new TransferError('stalled', part.name))
      }, Math.min(TRANSFER_CONFIG.watchdogMs, this.stallMs / 2))
      const counter = new Transform({
        transform: (chunk: Buffer, _encoding, callback) => {
          copied += chunk.length
          lastProgress = Date.now()
          this.setStaged(part, copied)
          callback(null, chunk)
        }
      })
      try {
        await pipeline(this.openSource(part, offset), counter, createWriteStream(temp, { flags: 'a' }), {
          signal: AbortSignal.any([this.signal, stall.signal])
        })
      } catch (error) {
        if (stall.signal.aborted && !this.signal.aborted) throw stall.signal.reason
        throw this.signal.aborted ? this.signal.reason : error
      } finally {
        clearInterval(watchdog)
      }
    }

    const finalSize = await sizeOf(temp)
    if (finalSize !== part.sizeBytes) throw new TransferError('source_missing', `${part.name} ended at ${finalSize} of ${part.sizeBytes} bytes`)
    await rename(temp, dest)
  }
}

/** Removes a game's staging folder (cancel, uninstall, or after install). */
export async function clearStaging(stagingDir: string): Promise<void> {
  await rm(stagingDir, { recursive: true, force: true })
}
