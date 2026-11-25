// On-disk TMDB cache under userData/tmdb-cache/<kind>-<id>/: the JSON responses
// an import used, and image bytes, so imported titles keep their artwork offline.
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { parseTmdbArtUrl, type TmdbArtRef } from '../shared/media'
import { TMDB_CONFIG } from './tmdb'

export const TMDB_CACHE_CONFIG = {
  dirName: 'tmdb-cache',
  imageTimeoutMs: 20_000,
  /** Parallel image downloads when warming a title. */
  prefetchConcurrency: 4
}

const IMAGE_TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' }

export class TmdbCache {
  readonly dir: string

  constructor(userData: string) {
    this.dir = join(userData, TMDB_CACHE_CONFIG.dirName)
  }

  async writeJson(key: string, name: string, data: unknown): Promise<void> {
    await mkdir(join(this.dir, key), { recursive: true })
    await writeFile(join(this.dir, key, `${name}.json`), JSON.stringify(data))
  }

  imageFile(ref: TmdbArtRef): string {
    return join(this.dir, ref.key, `${ref.asset}${extname(ref.src)}`)
  }

  /**
   * The cached bytes for an artwork ref. On a miss, and only then, the image is
   * fetched from image.tmdb.org, written to the cache and returned.
   */
  async image(ref: TmdbArtRef): Promise<{ bytes: Buffer; type: string; fromCache: boolean }> {
    const file = this.imageFile(ref)
    const type = IMAGE_TYPES[extname(ref.src).toLowerCase()]
    if (existsSync(file)) return { bytes: await readFile(file), type, fromCache: true }

    const response = await fetch(`${TMDB_CONFIG.imageBase}/${ref.src}`, { signal: AbortSignal.timeout(TMDB_CACHE_CONFIG.imageTimeoutMs) })
    if (!response.ok) throw new Error(`image.tmdb.org answered HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    await mkdir(join(this.dir, ref.key), { recursive: true })
    await writeFile(`${file}.tmp`, bytes)
    await rename(`${file}.tmp`, file)
    return { bytes, type, fromCache: false }
  }

  /** Warms the cache for these artwork URLs (non-TMDB URLs are skipped). Returns how many were downloaded. */
  async prefetch(urls: string[]): Promise<number> {
    const refs = urls.map(parseTmdbArtUrl).filter((ref): ref is TmdbArtRef => ref !== undefined && !existsSync(this.imageFile(ref)))
    let downloaded = 0
    const queue = [...refs]
    const worker = async () => {
      for (let ref = queue.shift(); ref; ref = queue.shift()) {
        try {
          await this.image(ref)
          downloaded++
        } catch {
          // offline or a TMDB hiccup: the image is fetched on first view instead
        }
      }
    }
    await Promise.all(Array.from({ length: TMDB_CACHE_CONFIG.prefetchConcurrency }, worker))
    return downloaded
  }
}
