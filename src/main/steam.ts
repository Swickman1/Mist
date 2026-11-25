// Steam store client for game metadata: public, keyless endpoints. One fetch
// wrapper with a 20s timeout and one retry on 429 honouring Retry-After. Steam
// rate-limits appdetails hard, so callers only use it from a user action and
// cache the JSON (see steam cache / metadata import).

export const STEAM_CONFIG = {
  apiBase: 'https://store.steampowered.com/api',
  imageBase: 'https://shared.akamai.steamstatic.com',
  /** The only hosts Mist talks to for Steam metadata and artwork. */
  hosts: ['store.steampowered.com', 'shared.akamai.steamstatic.com'],
  countryCode: 'US',
  language: 'en',
  timeoutMs: 20_000,
  defaultRetryAfterSec: 2,
  maxRetryAfterSec: 30
}

export type SteamErrorCode = 'not-found' | 'rate-limited' | 'network' | 'http'

export class SteamError extends Error {
  constructor(
    readonly code: SteamErrorCode,
    message: string
  ) {
    super(message)
  }
}

// ---- typed results (only the fields Mist reads) ----

export interface SteamSearchItem {
  type: string
  name: string
  id: number
  tiny_image: string
  price?: { currency: string; initial: number; final: number }
}

export interface SteamSearch {
  total: number
  items: SteamSearchItem[]
}

export interface SteamAppDetails {
  type: string
  name: string
  steam_appid: number
  short_description: string
  header_image: string
  capsule_image: string
  genres?: { id: string; description: string }[]
  release_date?: { coming_soon: boolean; date: string }
  developers?: string[]
}

type AppDetailsResponse = Record<string, { success: boolean; data?: SteamAppDetails }>

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class SteamClient {
  /** GET a store API path with cc/l. Throws SteamError with a message the UI can show as-is. */
  async get<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(`${STEAM_CONFIG.apiBase}${path}`)
    if (!STEAM_CONFIG.hosts.includes(url.hostname)) throw new SteamError('http', `refusing non-Steam host ${url.hostname}`)
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value))
    url.searchParams.set('cc', STEAM_CONFIG.countryCode)
    url.searchParams.set('l', STEAM_CONFIG.language)

    for (let attempt = 0; ; attempt++) {
      let response: Response
      try {
        response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(STEAM_CONFIG.timeoutMs) })
      } catch (error) {
        const timedOut = (error as Error).name === 'TimeoutError'
        throw new SteamError('network', timedOut ? 'Steam did not answer within 20s' : 'Could not reach the Steam store (offline?)')
      }
      if (response.status === 429 && attempt === 0) {
        const retryAfter = Number(response.headers.get('retry-after')) || STEAM_CONFIG.defaultRetryAfterSec
        await sleep(Math.min(retryAfter, STEAM_CONFIG.maxRetryAfterSec) * 1000)
        continue
      }
      if (response.ok) return (await response.json()) as T
      // Steam answers 403 as well as 429 when it is throttling a client.
      if (response.status === 429 || response.status === 403) throw new SteamError('rate-limited', 'Steam is rate-limiting requests: try again in a minute')
      throw new SteamError('http', `Steam answered HTTP ${response.status}`)
    }
  }

  search(term: string): Promise<SteamSearch> {
    return this.get('/storesearch/', { term })
  }

  /** One app's store details; not-found when Steam has no public page for it. */
  async appDetails(appId: number): Promise<SteamAppDetails> {
    const response = await this.get<AppDetailsResponse>('/appdetails/', { appids: appId })
    const entry = response[String(appId)]
    if (!entry?.success || !entry.data) throw new SteamError('not-found', `Steam has no store page for app ${appId}`)
    return entry.data
  }
}
