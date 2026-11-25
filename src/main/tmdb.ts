// TMDB client: one fetch wrapper (key, language, 20s timeout, one retry on 429
// honouring Retry-After) and typed results. The key comes from Settings and is
// never logged; request URLs carrying it are not printed anywhere.

export const TMDB_CONFIG = {
  apiBase: 'https://api.themoviedb.org/3',
  imageBase: 'https://image.tmdb.org/t/p',
  /** Mist only ever talks to these hosts from the main process. */
  hosts: ['api.themoviedb.org', 'image.tmdb.org'],
  timeoutMs: 20_000,
  /** Used when a 429 carries no Retry-After. */
  defaultRetryAfterSec: 2,
  maxRetryAfterSec: 30
}

export type TmdbErrorCode = 'no-key' | 'bad-key' | 'not-found' | 'rate-limited' | 'network' | 'http'

export class TmdbError extends Error {
  constructor(
    readonly code: TmdbErrorCode,
    message: string
  ) {
    super(message)
  }
}

// ---- typed results (only the fields Mist reads) ----

export interface TmdbTvResult {
  id: number
  name: string
  first_air_date?: string
  poster_path?: string | null
  overview: string
  vote_average: number
}

export interface TmdbMovieResult {
  id: number
  title: string
  release_date?: string
  poster_path?: string | null
  overview: string
  vote_average: number
}

export interface TmdbPage<T> {
  page: number
  total_pages: number
  results: T[]
}

export interface TmdbSearch<T> {
  page: number
  total_results: number
  results: T[]
}

/** Videos appended to a details call (append_to_response=videos). */
export interface TmdbVideos {
  results: { site: string; key: string; type: string; official?: boolean }[]
}

export interface TmdbTvDetails extends TmdbTvResult {
  videos?: TmdbVideos
  backdrop_path?: string | null
  episode_run_time: number[]
  seasons: { season_number: number; episode_count: number; name: string }[]
}

export interface TmdbSeasonDetails {
  season_number: number
  episodes: {
    season_number: number
    episode_number: number
    name: string
    overview: string
    runtime?: number | null
    still_path?: string | null
  }[]
}

export interface TmdbMovieDetails extends TmdbMovieResult {
  videos?: TmdbVideos
  backdrop_path?: string | null
  runtime?: number | null
}

export interface TmdbSettings {
  key: string
  language: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** v4 "API Read Access Tokens" are JWTs sent as a bearer header; v3 keys go in the query string. */
function isReadToken(key: string): boolean {
  return key.split('.').length === 3
}

export class TmdbClient {
  constructor(private readonly settings: () => TmdbSettings) {}

  /** GET an API path. Throws TmdbError with a message the UI can show as-is. */
  async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const { key, language } = this.settings()
    if (!key.trim()) throw new TmdbError('no-key', 'No TMDB API key: add one in Settings → Metadata')

    const url = new URL(`${TMDB_CONFIG.apiBase}${path}`)
    if (!TMDB_CONFIG.hosts.includes(url.hostname)) throw new TmdbError('http', `refusing non-TMDB host ${url.hostname}`)
    url.searchParams.set('language', language || 'en-US')
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value))
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (isReadToken(key.trim())) headers['Authorization'] = `Bearer ${key.trim()}`
    else url.searchParams.set('api_key', key.trim())

    for (let attempt = 0; ; attempt++) {
      let response: Response
      try {
        response = await fetch(url, { headers, signal: AbortSignal.timeout(TMDB_CONFIG.timeoutMs) })
      } catch (error) {
        const timedOut = (error as Error).name === 'TimeoutError'
        throw new TmdbError('network', timedOut ? 'TMDB did not answer within 20s' : 'Could not reach TMDB (offline?)')
      }
      if (response.status === 429 && attempt === 0) {
        const retryAfter = Number(response.headers.get('retry-after')) || TMDB_CONFIG.defaultRetryAfterSec
        await sleep(Math.min(retryAfter, TMDB_CONFIG.maxRetryAfterSec) * 1000)
        continue
      }
      if (response.ok) return (await response.json()) as T
      if (response.status === 401) throw new TmdbError('bad-key', 'TMDB rejected the API key: check it in Settings → Metadata')
      if (response.status === 404) throw new TmdbError('not-found', 'TMDB has no entry for that id')
      if (response.status === 429) throw new TmdbError('rate-limited', 'TMDB rate limit hit twice: try again shortly')
      throw new TmdbError('http', `TMDB answered HTTP ${response.status}`)
    }
  }

  /** Cheapest authenticated call: validates the key. */
  testKey(): Promise<{ images: { secure_base_url: string } }> {
    return this.get('/configuration')
  }

  searchTv(query: string): Promise<TmdbSearch<TmdbTvResult>> {
    return this.get('/search/tv', { query, include_adult: 'false' })
  }

  searchMovie(query: string): Promise<TmdbSearch<TmdbMovieResult>> {
    return this.get('/search/movie', { query, include_adult: 'false' })
  }

  tvDetails(tmdbId: number): Promise<TmdbTvDetails> {
    return this.get(`/tv/${tmdbId}`, { append_to_response: 'videos' })
  }

  seasonDetails(tmdbId: number, season: number): Promise<TmdbSeasonDetails> {
    return this.get(`/tv/${tmdbId}/season/${season}`)
  }

  movieDetails(tmdbId: number): Promise<TmdbMovieDetails> {
    return this.get(`/movie/${tmdbId}`, { append_to_response: 'videos' })
  }

  /** /trending/{kind}/week */
  trending(kind: 'tv' | 'movie', page: number): Promise<TmdbPage<TmdbTvResult | TmdbMovieResult>> {
    return this.get(`/trending/${kind}/week`, { page })
  }

  /** /discover/{kind} by popularity, optionally within one genre. */
  discover(kind: 'tv' | 'movie', page: number, genreId?: number): Promise<TmdbPage<TmdbTvResult | TmdbMovieResult>> {
    return this.get(`/discover/${kind}`, { page, sort_by: 'popularity.desc', include_adult: 'false', ...(genreId ? { with_genres: genreId } : {}) })
  }

  genres(kind: 'tv' | 'movie'): Promise<{ genres: { id: number; name: string }[] }> {
    return this.get(`/genre/${kind}/list`)
  }
}

/** Remote image URL for a TMDB file path at a size (w185, w300, w500, w1280 …). */
export function tmdbImageUrl(size: string, filePath: string): string {
  return `${TMDB_CONFIG.imageBase}/${size}${filePath}`
}
