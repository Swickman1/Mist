// On-disk artwork + JSON cache for one metadata source (TMDB or Steam), under
// userData/<dirName>/<key>/. Images are fetched from the remote only on a miss;
// a refresh prunes images the title no longer references.
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { parseArtUrl, type ArtRef, type ArtSource } from '../shared/media'

export const ART_CACHE_CONFIG = {
  imageTimeoutMs: 20_000,
  /** Parallel image downloads when warming a title. */
  prefetchConcurrency: 4
}

const IMAGE_TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' }

export class ArtCache {
  readonly dir: string

  constructor(
    userData: string,
    dirName: string,
    readonly source: ArtSource,
    /** Remote base the validated src paths are relative to. */
    private readonly remoteBase: string
  ) {
    this.dir = join(userData, dirName)
  }

  async writeJson(key: string, name: string, data: unknown): Promise<void> {
    await mkdir(join(this.dir, key), { recursive: true })
    await writeFile(join(this.dir, key, `${name}.json`), JSON.stringify(data))
  }

  /** Cached JSON, or undefined when it was never written. */
  async readJson<T>(key: string, name: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(join(this.dir, key, `${name}.json`), 'utf8')) as T
    } catch {
      return undefined
    }
  }

  /** <asset>.<src flattened>: a changed remote image is a new file, never a stale hit. */
  imageFile(ref: ArtRef): string {
    return join(this.dir, ref.key, `${ref.asset}.${ref.src.split('/').slice(-2).join('.')}`)
  }

  /** Cached bytes; on a miss (only then) fetched from the remote, stored and returned. */
  async image(ref: ArtRef): Promise<{ bytes: Buffer; type: string; fromCache: boolean }> {
    const file = this.imageFile(ref)
    const type = IMAGE_TYPES[extname(ref.src).toLowerCase()]
    if (existsSync(file)) return { bytes: await readFile(file), type, fromCache: true }

    const response = await fetch(`${this.remoteBase}/${ref.src}`, { signal: AbortSignal.timeout(ART_CACHE_CONFIG.imageTimeoutMs) })
    if (!response.ok) throw new Error(`${this.source} image answered HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    await mkdir(join(this.dir, ref.key), { recursive: true })
    await writeFile(`${file}.tmp`, bytes)
    await rename(`${file}.tmp`, file)
    return { bytes, type, fromCache: false }
  }

  private refsOf(urls: string[]): ArtRef[] {
    return urls.map(parseArtUrl).filter((ref): ref is ArtRef => ref !== undefined && ref.source === this.source)
  }

  /** Warms the cache for these artwork URLs (other sources and remote URLs are skipped). Returns downloads made. */
  async prefetch(urls: string[]): Promise<number> {
    const queue = this.refsOf(urls).filter((ref) => !existsSync(this.imageFile(ref)))
    let downloaded = 0
    const worker = async () => {
      for (let ref = queue.shift(); ref; ref = queue.shift()) {
        try {
          await this.image(ref)
          downloaded++
        } catch {
          // offline or a CDN hiccup: fetched on first view instead
        }
      }
    }
    await Promise.all(Array.from({ length: ART_CACHE_CONFIG.prefetchConcurrency }, worker))
    return downloaded
  }

  /** Deletes cached images under `key` that none of `keepUrls` reference (JSON is kept). Returns files removed. */
  async prune(key: string, keepUrls: string[]): Promise<number> {
    const keep = new Set(this.refsOf(keepUrls).map((ref) => this.imageFile(ref)))
    let entries: string[]
    try {
      entries = await readdir(join(this.dir, key))
    } catch {
      return 0
    }
    let removed = 0
    for (const name of entries) {
      const file = join(this.dir, key, name)
      if (name.endsWith('.json') || keep.has(file)) continue
      await rm(file, { force: true })
      removed++
    }
    return removed
  }
}
