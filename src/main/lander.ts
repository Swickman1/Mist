// Resolves a file-host landing page to a real file URL by running its page in a
// hidden window on the app partition. Hosts gate the file behind WASM, a token in
// a script variable, or a challenge, so the URL does not exist until their page runs.
import { BrowserWindow } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'

export const LANDER_PARTITION = 'persist:mist'
const LANDER_TIMEOUT_MS = 90_000
const FILE_PATTERN = /\.(zip|rar|7z|iso|exe|bin)(\?|$)/i

export class LanderError extends Error {}

export interface ResolvedFile {
  url: string
  /** From Content-Disposition, when the host sends one. */
  name?: string
}

interface PendingLander {
  pageKey: string
  onFile(url: string, name?: string): void
}

let active: PendingLander | undefined

export function log(line: string): void {
  try {
    mkdirSync('probe-out', { recursive: true })
    appendFileSync('probe-out/lander.log', `${new Date().toISOString()} ${line}\n`)
  } catch {
    // logging must never break a resolve
  }
}

export function isLander(): boolean {
  return active !== undefined
}

function keyOf(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    return parsed.pathname + parsed.search
  } catch {
    return undefined
  }
}

function nameFromDisposition(value: string): string | undefined {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(value)
  if (!match) return undefined
  try {
    return decodeURIComponent(match[1].trim())
  } catch {
    return match[1].trim()
  }
}

export function noteLanderRequest(url: string): void {
  if (!active || !FILE_PATTERN.test(url)) return
  if (keyOf(url) === active.pageKey) return
  active.onFile(url)
}

export function noteLanderResponse(url: string, headers: Record<string, string[]>): void {
  if (!active || keyOf(url) === active.pageKey) return
  const disposition = (headers['Content-Disposition'] ?? headers['content-disposition'] ?? []).join(' ')
  const type = (headers['Content-Type'] ?? headers['content-type'] ?? []).join(' ')
  if (!/attachment/i.test(disposition) && !/octet-stream|zip|rar|7z|x-iso|x-msdownload/i.test(type)) return
  active.onFile(url, nameFromDisposition(disposition))
}

export function isLanderHost(hostname: string): boolean {
  const LANDER_HOSTS = [
    'steamrip.com',
    'megadb.net',
    'bzzhr.to',
    'itsfileditchfiles.st',
    'fileditch.com',
    'gofile.io',
    '1fichier.com',
    'filecrypt.cc',
    'getintopc.com',
    'gamedownloadfree.com'
  ]
  return LANDER_HOSTS.includes(hostname)
}

export async function resolveLander(pageUrl: string): Promise<ResolvedFile> {
  if (active !== undefined) throw new LanderError('another lander is still resolving')

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: { partition: LANDER_PARTITION, sandbox: true, contextIsolation: true, backgroundThrottling: false }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  log(`start ${pageUrl}`)

  return new Promise<ResolvedFile>((resolve, reject) => {
    let settled = false
    let navigated = false
    let finalSeenAt: number | undefined
    let polls = 0
    const finish = (url?: string, name?: string, error?: Error): void => {
      if (settled) return
      settled = true
      active = undefined
      clearTimeout(timer)
      clearInterval(poll)
      log(`finish ${url ?? 'none'}${name ? ` as ${name}` : ''}`)
      setTimeout(() => {
        if (!win.isDestroyed()) win.destroy()
      }, 5_000)
      if (url) resolve({ url, ...(name ? { name } : {}) })
      else reject(error ?? new LanderError(`could not resolve ${pageUrl}`))
    }
    const timer = setTimeout(() => finish(undefined, undefined, new LanderError(`timed out resolving ${pageUrl}`)), LANDER_TIMEOUT_MS)

    const poll = setInterval(() => {
      polls += 1
      void win.webContents
        .executeJavaScript(`(() => {
          const span = document.getElementById('tc5a32eed1f')
          const html = span ? span.innerHTML : ''
          const anchor = [...document.querySelectorAll('a[href]')].find((a) => /\\.(zip|rar|7z|iso|exe)(\\?|$)/i.test(a.href))
          const inline = html.match(/href=["']([^"']+)["']/i)
          return {
            anchor: anchor ? anchor.href : null,
            inline: inline ? new URL(inline[1], location.href).href : null,
            final: typeof window.finalDownloadUrl === 'string' ? window.finalDownloadUrl : null
          }
        })()`)
        .then((state: { anchor?: string | null; inline?: string | null; final?: string | null } | null) => {
          const anchor = state?.anchor ?? undefined
          const inline = state?.inline ?? undefined
          const final = state?.final ?? undefined
          log(`poll ${polls}: ${anchor ?? inline ?? final ?? 'nothing'}`)
          if (anchor ?? inline) return finish(anchor ?? inline)
          if (!final) return
          finalSeenAt ??= Date.now()
          if (navigated || Date.now() - finalSeenAt < 11_000) return
          navigated = true
          log(`probe ${final}`)
          void win.webContents
            .executeJavaScript(`(async () => {
              const r = await fetch(${JSON.stringify(final)}, { referrer: 'https://steamrip.com/' })
              const info = { status: r.status, type: r.headers.get('content-type'), url: r.url, disposition: r.headers.get('content-disposition') }
              await r.body?.cancel()
              return info
            })()`)
            .then((info: { status: number; type: string | null; url: string; disposition: string | null } | null) => {
              log(`probe result ${JSON.stringify(info)}`)
              if (!info) return
              const binary = /octet-stream|zip|rar|7z|x-iso|x-msdownload/i.test(info.type ?? '') || /attachment/i.test(info.disposition ?? '')
              if (binary) finish(info.url, info.disposition ? nameFromDisposition(info.disposition) : undefined)
            })
            .catch((error) => log(`probe failed: ${(error as Error).message}`))
        })
        .catch((error) => log(`poll ${polls} failed: ${(error as Error).message}`))
    }, 1_000)

    active = { pageKey: keyOf(pageUrl) ?? '', onFile: (url, name) => finish(url, name) }
    win.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (code === -3 || !isMainFrame) return
      finish(undefined, undefined, new LanderError(`${pageUrl} failed to load: ${description} (${code})`))
    })
    void win.loadURL(pageUrl, { httpReferrer: 'https://steamrip.com/' })
  })
}