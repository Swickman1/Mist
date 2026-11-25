// Embedded (iframe) playback: the hosts the player may frame, and the embed URL for a show.
// Swapping embedder is a change to this file only; the CSP in src/renderer/index.html
// must list the same host, because a CSP is fixed when the page loads.
import type { Show } from './types'

/** Hosts the iframe player may load, subdomains included. The first one builds embed URLs. */
export const EMBED_HOSTS: readonly string[] = ['www.youtube-nocookie.com']

/** The show's trailer as an embed URL, or undefined when TMDB listed none. */
export function embedUrlFor(show: Show): string | undefined {
  if (!show.trailerKey) return undefined
  return `https://${EMBED_HOSTS[0]}/embed/${encodeURIComponent(show.trailerKey)}?autoplay=1&rel=0`
}
