// Embedded (iframe) playback. EMBED_HOSTS is the one list everything else derives from:
// the session guard (src/main/index.ts) and the CSP's frame-src, connect-src, img-src and
// media-src (filled in at build time by electron.vite.config.ts, because a CSP is fixed
// when the page loads). Switching embedder means editing this list and EMBED_URL only.
import type { Show } from './types'

/** Hosts the iframe player and its page may reach, subdomains included. */
export const EMBED_HOSTS: readonly string[] = ['youtube-nocookie.com', 'youtube.com', 'ytimg.com', 'googlevideo.com']

/** Embed page URL prefix; the video id follows. Its host must be covered by EMBED_HOSTS. */
const EMBED_URL = 'https://www.youtube-nocookie.com/embed/'

/** CSP source list for EMBED_HOSTS: each host and its subdomains, https only. */
export function embedCspSources(): string {
  return EMBED_HOSTS.flatMap((host) => [`https://${host}`, `https://*.${host}`]).join(' ')
}

/** The show's trailer as an embed URL, or undefined when TMDB listed none. */
export function embedUrlFor(show: Show): string | undefined {
  if (!show.trailerKey) return undefined
  return `${EMBED_URL}${encodeURIComponent(show.trailerKey)}?autoplay=1&rel=0`
}
