// mpv playback host. mpv (the reference libmpv player) renders into a borderless
// child window that tracks the renderer's player rectangle (--wid), and is driven
// over its JSON IPC named pipe. Hardware decoding uses hwdec=auto-safe, which drops
// to software inside mpv when a hardware decoder cannot start; if mpv itself
// fails to load the file with hwdec on, it is relaunched once with hwdec=no.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { connect, type Socket } from 'node:net'
import { join } from 'node:path'
import { app, BaseWindow, type BrowserWindow } from 'electron'
import type { PlayerBounds, PlayerEvent, PlayerOpenRequest, PlayerOpenResult } from '../shared/types'

export const MPV_CONFIG = {
  /** Checked in order; a bare name is looked up on PATH. */
  candidates: () => [
    join(process.resourcesPath, 'mpv', 'mpv.exe'),
    join(app.getAppPath(), 'vendor', 'mpv', 'mpv.exe'),
    'C:\\Program Files\\MPV Player\\mpv.exe',
    'C:\\Program Files\\mpv\\mpv.exe',
    'mpv.exe'
  ],
  pipeConnectMs: 5_000,
  loadTimeoutMs: 10_000,
  quitTimeoutMs: 1_500,
  seekStepSec: 10,
  /** Seconds between time events sent to the renderer. */
  timeEventSec: 1
}

function locateMpv(): string | undefined {
  for (const candidate of MPV_CONFIG.candidates()) {
    if (candidate.includes('\\')) {
      if (existsSync(candidate)) return candidate
      continue
    }
    try {
      const found = execFileSync('where', [candidate], { windowsHide: true, encoding: 'utf8' }).split(/\r?\n/).find(Boolean)
      if (found) return found.trim()
    } catch {
      // not on PATH
    }
  }
  return undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function connectPipe(path: string, timeoutMs: number): Promise<Socket> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      return await new Promise<Socket>((resolve, reject) => {
        const socket = connect(path)
        socket.once('connect', () => resolve(socket))
        socket.once('error', reject)
      })
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`mpv IPC pipe did not open: ${(error as Error).message}`)
      await sleep(50)
    }
  }
}

type MpvMessage = { event?: string; name?: string; data?: unknown; args?: string[]; request_id?: number; error?: string }

/** One mpv process + its child window, for one file. */
class Session {
  private socket?: Socket
  private nextRequest = 1
  private readonly pending = new Map<number, (data: unknown) => void>()
  private stderr = ''
  private position = 0
  private duration = 0
  private paused = false
  private lastTimeEvent = 0
  private exited = false
  readonly process: ChildProcess
  /** A web-contents-free native window: mpv's video child window is the only thing in it. */
  readonly window: BaseWindow
  /** Resolves true on file-loaded, false when mpv exits first. */
  readonly loaded: Promise<boolean>

  constructor(
    mpvPath: string,
    private readonly host: BrowserWindow,
    request: PlayerOpenRequest,
    hardwareDecode: boolean,
    private readonly emit: (event: PlayerEvent) => void,
    sessionId: number
  ) {
    this.window = new BaseWindow({
      parent: host,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      roundedCorners: false,
      backgroundColor: '#000000',
      title: request.title
    })
    this.setBounds(request.bounds)
    const hwnd = this.window.getNativeWindowHandle().readBigUInt64LE(0).toString()
    const pipe = `\\\\.\\pipe\\mist-mpv-${process.pid}-${sessionId}`

    this.process = spawn(
      mpvPath,
      [
        '--config=no',
        `--wid=${hwnd}`,
        `--input-ipc-server=${pipe}`,
        `--hwdec=${hardwareDecode ? 'auto-safe' : 'no'}`,
        `--start=${Math.max(0, request.startAtSec)}`,
        '--keep-open=yes',
        '--force-window=yes',
        '--osc=yes',
        '--hr-seek=yes',
        '--ytdl=no',
        '--no-terminal',
        '--msg-level=all=error',
        `--title=${request.title}`,
        '--',
        request.filePath
      ],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }
    )
    this.process.stderr?.on('data', (chunk: Buffer) => (this.stderr = (this.stderr + chunk.toString()).slice(-2000)))

    this.loaded = new Promise<boolean>((resolve) => {
      this.process.once('exit', () => {
        this.exited = true
        resolve(false)
      })
      this.process.once('error', () => resolve(false))
      void this.attach(pipe, resolve)
    })
  }

  get lastError(): string {
    return this.stderr.trim().split(/\r?\n/).pop() || 'mpv exited before the file loaded'
  }

  get lastPosition(): number {
    return this.position
  }

  setBounds(bounds: PlayerBounds): void {
    const content = this.host.getContentBounds()
    this.window.setBounds({
      x: Math.round(content.x + bounds.x),
      y: Math.round(content.y + bounds.y),
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height))
    })
  }

  private async attach(pipe: string, onLoaded: (ok: boolean) => void): Promise<void> {
    try {
      this.socket = await connectPipe(pipe, MPV_CONFIG.pipeConnectMs)
    } catch {
      return
    }
    let buffer = ''
    this.socket.on('data', (chunk) => {
      buffer += chunk.toString()
      let newline
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line.trim()) this.onMessage(JSON.parse(line) as MpvMessage, onLoaded)
      }
    })
    this.socket.on('error', () => undefined)
    const step = MPV_CONFIG.seekStepSec
    for (const command of [
      ['observe_property', 1, 'time-pos'],
      ['observe_property', 2, 'duration'],
      ['observe_property', 3, 'pause'],
      ['observe_property', 4, 'hwdec-current'],
      ['observe_property', 5, 'eof-reached'],
      ['keybind', 'RIGHT', `seek ${step}`],
      ['keybind', 'LEFT', `seek -${step}`],
      ['keybind', 'l', `seek ${step}`],
      ['keybind', 'j', `seek -${step}`],
      ['keybind', 'k', 'cycle pause'],
      ['keybind', 'ESC', 'script-message mist-close']
    ]) {
      this.send(command)
    }
  }

  private onMessage(message: MpvMessage, onLoaded: (ok: boolean) => void): void {
    if (message.request_id !== undefined) {
      this.pending.get(message.request_id)?.(message.data)
      this.pending.delete(message.request_id)
      return
    }
    if (message.event === 'file-loaded') {
      this.window.showInactive()
      onLoaded(true)
    } else if (message.event === 'client-message' && message.args?.[0] === 'mist-close') {
      this.emit({ type: 'close-request' })
    } else if (message.event === 'property-change') {
      this.onProperty(message.name!, message.data)
    }
  }

  private onProperty(name: string, data: unknown): void {
    if (name === 'time-pos' && typeof data === 'number') {
      this.position = data
      if (Math.abs(data - this.lastTimeEvent) >= MPV_CONFIG.timeEventSec) this.emitTime()
    } else if (name === 'duration' && typeof data === 'number') {
      this.duration = data
    } else if (name === 'pause' && typeof data === 'boolean') {
      this.paused = data
      this.emitTime()
    } else if (name === 'hwdec-current' && typeof data === 'string') {
      this.emit({ type: 'decoder', hardware: data !== 'no' && data !== '', name: data || 'no' })
    } else if (name === 'eof-reached' && data === true) {
      this.emitTime()
      this.emit({ type: 'ended' })
    }
  }

  private emitTime(): void {
    this.lastTimeEvent = this.position
    this.emit({ type: 'time', position: this.position, duration: this.duration, paused: this.paused })
  }

  private send(command: unknown[]): number {
    const id = this.nextRequest++
    this.socket?.write(JSON.stringify({ command, request_id: id }) + '\n')
    return id
  }

  /** Reads a property, resolving undefined if mpv does not answer in time. */
  getProperty(name: string): Promise<unknown> {
    if (!this.socket || this.exited) return Promise.resolve(undefined)
    const id = this.send(['get_property', name])
    return Promise.race([new Promise((resolve) => this.pending.set(id, resolve)), sleep(MPV_CONFIG.quitTimeoutMs).then(() => undefined)])
  }

  async close(): Promise<void> {
    if (!this.exited) {
      this.send(['quit'])
      await Promise.race([new Promise((resolve) => this.process.once('exit', resolve)), sleep(MPV_CONFIG.quitTimeoutMs)])
      if (!this.exited) this.process.kill()
    }
    this.socket?.destroy()
    if (!this.window.isDestroyed()) this.window.destroy()
  }
}

/** The single mpv session behind the renderer's Player. */
export class MpvHost {
  private session?: Session
  private sessionCount = 0
  /** Bumped by every open/close so a superseded open stops instead of starting a session. */
  private generation = 0
  private bounds?: PlayerBounds
  private readonly follow = () => this.bounds && this.session?.setBounds(this.bounds)

  constructor(
    private readonly host: () => BrowserWindow | undefined,
    private readonly hardwareDecode: () => boolean,
    private readonly emit: (event: PlayerEvent) => void
  ) {}

  async open(request: PlayerOpenRequest): Promise<PlayerOpenResult> {
    await this.close()
    const generation = ++this.generation
    const win = this.host()
    const mpvPath = locateMpv()
    if (!win) return { backend: 'video', reason: 'no window' }
    if (!mpvPath) return { backend: 'video', reason: 'mpv is not installed' }
    this.bounds = request.bounds

    // Hardware first (when enabled); if mpv cannot load the file that way, once more in software.
    const attempts = this.hardwareDecode() ? [true, false] : [false]
    let reason = ''
    for (const hardware of attempts) {
      const session = new Session(mpvPath, win, request, hardware, this.emit, ++this.sessionCount)
      this.session = session
      const ok = await Promise.race([session.loaded, sleep(MPV_CONFIG.loadTimeoutMs).then(() => false)])
      if (generation !== this.generation) {
        await session.close()
        return { backend: 'video', reason: 'superseded' }
      }
      if (ok) {
        win.on('move', this.follow)
        win.on('resize', this.follow)
        return { backend: 'mpv' }
      }
      reason = session.lastError
      await session.close()
      this.session = undefined
    }
    return { backend: 'video', reason }
  }

  setBounds(bounds: PlayerBounds): void {
    this.bounds = bounds
    this.session?.setBounds(bounds)
  }

  async close(): Promise<number | null> {
    this.generation++
    const session = this.session
    if (!session) return null
    this.session = undefined
    const win = this.host()
    win?.off('move', this.follow)
    win?.off('resize', this.follow)
    const live = await session.getProperty('time-pos')
    await session.close()
    return typeof live === 'number' ? live : session.lastPosition
  }
}
