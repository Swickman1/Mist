// Local media: finds each episode's file inside its show folder and serves
// indexed files over mist-media:// with Range support for seeking.
import { createReadStream, existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import type { Episode, LibraryEntry } from '../shared/types'
import { ART_SOURCES, MEDIA_SCHEME, mediaPath, parseArtUrl, type ArtSource } from '../shared/media'
import type { Repository } from './repository'
import type { ArtCache } from './artCache'

const VIDEO_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska'
}

/** S01E04, s1e4, 1x04 */
const EPISODE_TAG = /s(\d{1,2})\s*e(\d{1,3})|(\d{1,2})x(\d{2,3})/i

/** Must run before app ready. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }])
}

async function videoFiles(root: string): Promise<{ path: string; name: string; size: number }[]> {
  const entries = await readdir(root, { withFileTypes: true, recursive: true })
  const videos = entries.filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() in VIDEO_TYPES)
  return Promise.all(
    videos.map(async (entry) => {
      const path = join(entry.parentPath, entry.name)
      return { path, name: entry.name, size: (await stat(path)).size }
    })
  )
}

/** Sets filePath on a show's episodes from the files in its library folder. Returns whether anything changed. */
export async function indexShow(repo: Repository, entry: LibraryEntry): Promise<boolean> {
  const episodes = repo.episodes.all().filter((episode) => episode.showId === entry.refId)
  const files = entry.path && existsSync(entry.path) ? await videoFiles(entry.path) : []
  const byTag = new Map<string, string>()
  for (const file of files) {
    const match = EPISODE_TAG.exec(file.name)
    if (match) byTag.set(`${Number(match[1] ?? match[3])}x${Number(match[2] ?? match[4])}`, file.path)
  }
  // A movie is a one-episode show: its file is the largest video in the folder.
  const movieFile = episodes.length === 1 ? [...files].sort((a, b) => b.size - a.size)[0]?.path : undefined

  let changed = false
  for (const episode of episodes) {
    const filePath = movieFile ?? byTag.get(`${episode.season}x${episode.episode}`)
    if (filePath === episode.filePath) continue
    const { filePath: _old, ...rest } = episode
    repo.episodes.put(filePath ? { ...rest, filePath } : (rest as Episode))
    changed = true
  }
  return changed
}

export async function indexAllShows(repo: Repository): Promise<boolean> {
  let changed = false
  for (const entry of repo.library.all().filter((row) => row.kind === 'show')) changed = (await indexShow(repo, entry)) || changed
  return changed
}

function parseRange(header: string | null, size: number): { start: number; end: number } | undefined {
  const match = header && /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match) return undefined
  const start = match[1] === '' ? Math.max(0, size - Number(match[2])) : Number(match[1])
  const end = match[1] !== '' && match[2] !== '' ? Math.min(Number(match[2]), size - 1) : size - 1
  return start <= end ? { start, end } : undefined
}

/** Cached artwork (TMDB or Steam); a miss is fetched from that source's CDN once and stored. */
async function serveArt(url: string, caches: Record<ArtSource, ArtCache>): Promise<Response> {
  const ref = parseArtUrl(url)
  if (!ref) return new Response('Forbidden', { status: 403 })
  try {
    const { bytes, type, fromCache } = await caches[ref.source].image(ref)
    if (!fromCache) console.log(`[mist] ${ref.source} image cache miss: ${ref.key}/${ref.asset}`)
    return new Response(new Uint8Array(bytes), { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'max-age=31536000, immutable' } })
  } catch {
    return new Response('Unavailable', { status: 502 })
  }
}

/** Serves indexed episode files and cached artwork; anything else is 403. */
export function handleMediaRequests(repo: Repository, caches: Record<ArtSource, ArtCache>): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    if (new URL(request.url).hostname in ART_SOURCES) return serveArt(request.url, caches)
    const path = mediaPath(request.url)
    if (!repo.episodes.all().some((episode) => episode.filePath === path)) return new Response('Forbidden', { status: 403 })
    let size: number
    try {
      size = (await stat(path)).size
    } catch {
      return new Response('Not found', { status: 404 })
    }
    const type = VIDEO_TYPES[extname(path).toLowerCase()]
    const range = parseRange(request.headers.get('range'), size)
    const { start, end } = range ?? { start: 0, end: size - 1 }
    const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
    const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1) }
    return range
      ? new Response(body, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}` } })
      : new Response(body, { status: 200, headers })
  })
}
