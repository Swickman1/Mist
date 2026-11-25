// Embedded (iframe) playback. EMBED_HOSTS is the one list everything else derives from:
// the session guard (src/main/index.ts) and the CSP's frame-src, connect-src, img-src and
// media-src (filled in at build time by electron.vite.config.ts, because a CSP is fixed
// when the page loads). Switching embedder means editing this list and EMBED_URL only.
import type { Episode, Show } from './types'

/** Hosts the iframe player and its page may reach, subdomains included. */
export const EMBED_HOSTS: readonly string[] = ['bingeapi.st']

/** Embed page URL prefix. Its host must be covered by EMBED_HOSTS. */
const EMBED_URL = 'https://bingeapi.st/embed/'
const TRAILER_URL = 'https://www.youtube-nocookie.com/embed/'

/** CSP source list for EMBED_HOSTS: each host and its subdomains, https only. */
export function embedCspSources(): string {
  return EMBED_HOSTS.flatMap((host) => [`https://${host}`, `https://*.${host}`]).join(' ')
}

/** Binge API embed URL for one episode, or undefined when no TMDB id is known. */
export function embedUrlFor(show: Show, episode: Pick<Episode, 'season' | 'episode'>): string | undefined {
  if (!show.tmdbId) return undefined
  const kind = show.tmdbKind ?? 'tv'
  if (kind === 'movie') return `${EMBED_URL}movie/${encodeURIComponent(String(show.tmdbId))}`
  return `${EMBED_URL}tv/${encodeURIComponent(String(show.tmdbId))}/${encodeURIComponent(String(episode.season))}/${encodeURIComponent(String(episode.episode))}`
}

/** The show's trailer as an embed URL, or undefined when TMDB listed none. */
export function trailerUrlFor(show: Show): string | undefined {
  if (!show.trailerKey) return undefined
  return `${TRAILER_URL}${encodeURIComponent(show.trailerKey)}?autoplay=1&rel=0`
}
