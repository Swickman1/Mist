// mist-media:// serves local files to the renderer (file:// is not loadable from
// the dev server origin):
//   mist-media://local/<path>                    an indexed episode's video file
//   mist-media://<source>/<key>/<asset>?src=...  cached artwork (fetched once on a miss)
// where <source> is tmdb (shows/movies) or steam (games).

export const MEDIA_SCHEME = 'mist-media'

export function mediaUrl(filePath: string): string {
  return `${MEDIA_SCHEME}://local/${encodeURIComponent(filePath)}`
}

export function mediaPath(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
}

/** Three validation regexes per artwork source: cache key, asset name, remote src path. */
export const ART_SOURCES = {
  tmdb: {
    /** <kind>-<tmdbId> */
    key: /^(tv|movie)-\d+$/,
    /** poster, hero, still-s<season>e<episode> */
    asset: /^(poster|hero|still-s\d+e\d+)$/,
    /** <size>/<file> under image.tmdb.org/t/p/ */
    src: /^w\d+\/[A-Za-z0-9_-]+\.(jpg|jpeg|png)$/
  },
  steam: {
    /** <appid> */
    key: /^\d+$/,
    asset: /^(capsule|hero|header)$/,
    /** store_item_assets/steam/apps/<appid>/[<sha1>/]<file> under shared.akamai.steamstatic.com */
    src: /^store_item_assets\/steam\/apps\/\d+\/([0-9a-f]{40}\/)?[A-Za-z0-9_-]+\.(jpg|jpeg|png)$/
  }
} as const

export type ArtSource = keyof typeof ART_SOURCES

export interface ArtRef {
  source: ArtSource
  key: string
  asset: string
  /** Remote path relative to the source's image base, without a leading slash. */
  src: string
}

export function artUrl(ref: ArtRef): string {
  return `${MEDIA_SCHEME}://${ref.source}/${ref.key}/${ref.asset}?src=${encodeURIComponent(ref.src)}`
}

/** Parses and validates a cached-artwork URL; undefined when it is not one (or fails validation). */
export function parseArtUrl(url: string): ArtRef | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (parsed.protocol !== `${MEDIA_SCHEME}:` || !(parsed.hostname in ART_SOURCES)) return undefined
  const source = parsed.hostname as ArtSource
  const rules = ART_SOURCES[source]
  const [key, asset] = parsed.pathname.replace(/^\//, '').split('/')
  const src = parsed.searchParams.get('src') ?? ''
  if (!rules.key.test(key) || !rules.asset.test(asset) || !rules.src.test(src)) return undefined
  // A Steam image must belong to the app its cache key names.
  if (source === 'steam' && !src.startsWith(`store_item_assets/steam/apps/${key}/`)) return undefined
  return { source, key, asset, src }
}
