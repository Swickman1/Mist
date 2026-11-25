// Download host allowlist + the one HTTP helper downloads use. Main-process fetch
// bypasses the renderer's session guard, so checkHost() is the only thing that
// stops an arbitrary URL: every request and every redirect hop goes through it.
import { hostAllowed } from '../shared/hosts'
export { hostAllowed } from '../shared/hosts'

/** Offered by Settings → "Add suggested hosts": freely downloadable, official sources. */
export const SUGGESTED_DOWNLOAD_HOSTS = [
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'archive.org'
]

export const NET_CONFIG = {
  maxRedirects: 10,
  timeoutMs: 30_000
}

/** One DNS label: letters, digits, hyphens; no leading/trailing hyphen. */
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export class HostNotAllowedError extends Error {
  constructor(readonly host: string) {
    super(`host not allowed: ${host} (add it in Settings → Downloads)`)
  }
}

/**
 * Normalises a hosts list (one per line): trims, lowercases, drops blanks and
 * duplicates. Anything with a scheme, path, port or invalid label is an error.
 */
export function normaliseHosts(lines: string[]): { ok: true; hosts: string[] } | { ok: false; error: string } {
  const hosts: string[] = []
  for (const raw of lines) {
    const line = raw.trim().toLowerCase().replace(/\.$/, '')
    if (!line) continue
    const labels = line.split('.')
    if (line.length > 253 || !labels.every((label) => LABEL.test(label))) {
      return { ok: false, error: `“${raw.trim()}” is not a hostname: use a bare name like example.com (no scheme, path or port)` }
    }
    if (!hosts.includes(line)) hosts.push(line)
  }
  return { ok: true, hosts }
}

/** Throws HostNotAllowedError (naming the host) unless `url` is http(s) on an allowed host. Returns the parsed URL. */
export function checkHost(url: string, hosts: readonly string[]): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new HostNotAllowedError(url)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new HostNotAllowedError(`${parsed.protocol}//${parsed.hostname}`)
  if (!hostAllowed(parsed.hostname, hosts)) throw new HostNotAllowedError(parsed.hostname)
  return parsed
}

export interface HttpContext {
  /** Current allowlist (read live, so Settings edits apply to the next request). */
  hosts: () => readonly string[]
  userAgent: string
}

export interface HttpRequest {
  method?: 'GET' | 'HEAD'
  /** Extra request headers, e.g. Accept for JSON APIs. */
  headers?: Record<string, string>
  /** Byte offset for a Range request. */
  rangeFrom?: number
  /** A closed range, e.g. 0-0 to probe a size. */
  rangeTo?: number
  referer?: string
  signal?: AbortSignal
}

/**
 * fetch with redirects followed by hand so every hop is re-checked against the
 * allowlist. Returns the final response and URL.
 */
export async function httpFetch(url: string, request: HttpRequest, context: HttpContext): Promise<{ response: Response; url: string }> {
  let current = url
  for (let hop = 0; hop <= NET_CONFIG.maxRedirects; hop++) {
    checkHost(current, context.hosts())
    const headers: Record<string, string> = { 'User-Agent': context.userAgent, ...request.headers }
    if (request.referer) headers['Referer'] = request.referer
    if (request.rangeFrom !== undefined) headers['Range'] = `bytes=${request.rangeFrom}-${request.rangeTo ?? ''}`
    const response = await fetch(current, {
      method: request.method ?? 'GET',
      headers,
      redirect: 'manual',
      signal: request.signal ?? AbortSignal.timeout(NET_CONFIG.timeoutMs)
    })
    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel()
      current = new URL(location, current).href
      continue
    }
    return { response, url: current }
  }
  throw new Error(`too many redirects from ${new URL(url).hostname}`)
}
