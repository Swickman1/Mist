// Real transfer engine: copies a game's parts from disk / other drives / shares
// into <stagingPath>/<gameId>/, resuming from whatever is already staged.
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat, statfs, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Part } from '../shared/types'
import { httpFetch, HostNotAllowedError, type HttpContext } from './net'
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

export type TransferErrorCode = 'disk_full' | 'stalled' | 'blocked' | 'hash_mismatch' | 'source_missing'

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
  /** Reader for local parts (tests override it). */
  openSource?: (part: Part, start: number) => Readable
  /** Required for URL parts: allowlist + User-Agent. */
  http?: HttpContext
  /** Sent as Referer for URL parts: the page the parts came from. */
  referer?: string
}

/** A part to download over HTTP(S) rather than copy from disk. */
export function isUrlPart(part: Part): boolean {
  return !part.path && /^https?:\/\//i.test(part.url)
}

/** 'bytes <start>-<end>/<total>' -> start and total (total undefined when '*'). */
function parseContentRange(header: string | null): { start: number; total?: number } | undefined {
  const match = header && /^bytes (\d+)-\d+\/(\d+|\*)$/i.exec(header.trim())
  if (!match) return undefined
  return { start: Number(match[1]), total: match[2] === '*' ? undefined : Number(match[2]) }
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
  private readonly http?: HttpContext
  private readonly referer?: string

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
    this.http = options.http
    this.referer = options.referer
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
      if (!part.sha256) {
        // No published hash (a URL part without a sidecar): pin what arrived, so a
        // resume or a tampered staging file is still caught on later runs.
        this.events.onPhase('verifying', part.name)
        part.sha256 = await sha256File(this.stagedPath(part), this.signal)
        return
      }
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
        // Stalls and host refusals (403/429) share the same retry budget.
        if (!(error instanceof TransferError) || (error.code !== 'stalled' && error.code !== 'blocked')) throw error
        if (retry >= this.stallBackoffMs.length) {
          if (error.code === 'blocked') throw new TransferError('blocked', 'the host wants a browser check')
          throw new TransferError('stalled', `no progress for ${this.stallMs / 1000}s on ${part.name} after ${retry} retries`)
        }
        const wait = this.stallBackoffMs[retry]
        const why = error.code === 'blocked' ? `The host refused ${part.name} (${error.message.replace(/^blocked: /, '')})` : `No progress for ${this.stallMs / 1000}s on ${part.name}`
        this.events.onPhase('stalled', `${why}. Retry ${retry + 1} of ${this.stallBackoffMs.length} in ${wait / 1000}s`)
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
    const remote = isUrlPart(part)
    // Only local parts can be stat'ed up front; a URL part's reachability is its response.
    if (!remote && (await sizeOf(part.path!)) === undefined) throw new TransferError('source_missing', `${part.path} is not reachable`)
    this.setStaged(part, offset)

    if (offset < part.sizeBytes) {
      const stall = new AbortController()
      let lastProgress = Date.now()
      const watchdog = setInterval(() => {
        if (Date.now() - lastProgress > this.stallMs) stall.abort(new TransferError('stalled', part.name))
      }, Math.min(TRANSFER_CONFIG.watchdogMs, this.stallMs / 2))
      const signal = AbortSignal.any([this.signal, stall.signal])
      let source: Readable
      try {
        if (remote) {
          const opened = await this.openUrl(part, offset, signal)
          if (opened.restart) {
            // The server ignored Range: start this part over from byte zero.
            await rm(temp, { force: true })
            offset = 0
            this.setStaged(part, 0)
          }
          source = opened.stream
        } else {
          source = this.openSource(part, offset)
        }
      } catch (error) {
        clearInterval(watchdog)
        if (stall.signal.aborted && !this.signal.aborted) throw stall.signal.reason
        throw this.signal.aborted ? this.signal.reason : error
      }
      let copied = offset
      const counter = new Transform({
        transform: (chunk: Buffer, _encoding, callback) => {
          copied += chunk.length
          lastProgress = Date.now()
          this.setStaged(part, copied)
          callback(null, chunk)
        }
      })
      try {
        await pipeline(source, counter, createWriteStream(temp, { flags: 'a' }), { signal })
      } catch (error) {
        if (stall.signal.aborted && !this.signal.aborted) throw stall.signal.reason
        if (this.signal.aborted) throw this.signal.reason
        // A dropped connection mid-body is retried like a stall, resuming from what arrived.
        if (remote) throw new TransferError('stalled', `connection lost on ${part.name}: ${(error as Error).message}`)
        throw error
      } finally {
        clearInterval(watchdog)
      }
    }

    // Byte count before the hash step: a short read is source_missing, not a hash failure.
    const finalSize = await sizeOf(temp)
    if (finalSize !== part.sizeBytes) throw new TransferError('source_missing', `${part.name} ended at ${finalSize} of ${part.sizeBytes} bytes`)
    await rename(temp, dest)
  }

  /**
   * Opens a URL part at `offset` with a Range request (redirects re-checked against
   * the allowlist). 206 resumes; 200 means the server ignored Range, so the caller
   * restarts the part from zero.
   */
  private async openUrl(part: Part, offset: number, signal: AbortSignal): Promise<{ stream: Readable; restart: boolean }> {
    if (!this.http) throw new TransferError('source_missing', `${part.name}: no HTTP context for a URL part`)
    let response: Response
    try {
      ;({ response } = await httpFetch(part.url, { rangeFrom: offset, referer: this.referer, signal }, this.http))
    } catch (error) {
      if (error instanceof HostNotAllowedError) throw error
      if (signal.aborted) throw error
      throw new TransferError('stalled', `could not connect for ${part.name}: ${(error as Error).message}`)
    }
    const cancel = () => void response.body?.cancel().catch(() => undefined)
    if (response.status === 403 || response.status === 429) {
      cancel()
      throw new TransferError('blocked', `HTTP ${response.status}`)
    }
    if (response.status === 206) {
      const range = parseContentRange(response.headers.get('content-range'))
      if (!range || range.start !== offset) {
        cancel()
        throw new TransferError('source_missing', `${part.name}: server resumed at the wrong offset`)
      }
      if (range.total !== undefined && range.total !== part.sizeBytes) {
        cancel()
        throw new TransferError('source_missing', `${part.name} is now ${range.total} bytes, expected ${part.sizeBytes}`)
      }
      return { stream: Readable.fromWeb(response.body as never), restart: false }
    }
    if (response.status === 200) return { stream: Readable.fromWeb(response.body as never), restart: offset > 0 }
    cancel()
    throw new TransferError('source_missing', `${part.name}: HTTP ${response.status}`)
  }
}

/** Removes a game's staging folder (cancel, uninstall, or after install). */
export async function clearStaging(stagingDir: string): Promise<void> {
  await rm(stagingDir, { recursive: true, force: true })
}
