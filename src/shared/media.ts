// mist-media:// serves local files to the renderer (file:// is not loadable from
// the dev server origin):
//   mist-media://local/<path>                 an indexed episode's video file
//   mist-media://tmdb/<kind>-<id>/<asset>?src= cached TMDB artwork (fetched once on a miss)

export const MEDIA_SCHEME = 'mist-media'

export function mediaUrl(filePath: string): string {
  return `${MEDIA_SCHEME}://local/${encodeURIComponent(filePath)}`
}

export function mediaPath(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
}

/** <kind>-<tmdbId>, the cache folder name for a title. */
export const TMDB_CACHE_KEY = /^(tv|movie)-\d+$/
/** poster, hero, or still-s<season>e<episode>. */
export const TMDB_ASSET = /^(poster|hero|still-s\d+e\d+)$/
/** <size>/<file> as TMDB serves it, e.g. w500/abc123.jpg. */
export const TMDB_SRC = /^w\d+\/[A-Za-z0-9_-]+\.(jpg|jpeg|png)$/

export interface TmdbArtRef {
  key: string
  asset: string
  /** <size>/<file>, without the leading slash. */
  src: string
}

export function tmdbArtUrl(ref: TmdbArtRef): string {
  return `${MEDIA_SCHEME}://tmdb/${ref.key}/${ref.asset}?src=${encodeURIComponent(ref.src)}`
}

/** Parses and validates a mist-media://tmdb URL; undefined when it is not one. */
export function parseTmdbArtUrl(url: string): TmdbArtRef | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (parsed.protocol !== `${MEDIA_SCHEME}:` || parsed.hostname !== 'tmdb') return undefined
  const [key, asset] = parsed.pathname.replace(/^\//, '').split('/')
  const src = parsed.searchParams.get('src') ?? ''
  return TMDB_CACHE_KEY.test(key) && TMDB_ASSET.test(asset) && TMDB_SRC.test(src) ? { key, asset, src } : undefined
}
