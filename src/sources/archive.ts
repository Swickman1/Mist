// Filesystem resolver core: turns a path (file or folder, local drive or share)
// into ordered Parts. Each shape only decides how to locate its payload.
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Part } from '../shared/types'
import { checkHost, hostAllowed, httpFetch, type HttpContext } from '../main/net'
import type { Resolver, SourceEntry } from './index'

/** Archive files, including split volumes: .partN.rar, .rNN and .001-style. */
export const ARCHIVE_PATTERN = /\.(rar|7z|zip|r\d{2}|\d{3})$/i

/** Sidecar checksum files: SHA256SUMS, checksums.txt, <name>.sha256, or any name containing 'checksum'. */
const CHECKSUM_FILES = /(^sha256sums(\.txt)?$|checksum|\.sha256$)/i
/** GNU coreutils style: '<hex>  <name>' (or '<hex> *<name>'). */
const CHECKSUM_LINE = /^([a-f0-9]{64})\s+\*?(.+?)\s*$/i
/** BSD style: 'SHA256 (<name>) = <hex>'. */
const CHECKSUM_LINE_BSD = /^SHA256 \((.+)\) = ([a-f0-9]{64})$/i
const naturally = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Files under `root`, relative to it, sorted naturally. */
export async function listFiles(root: string, recursive: boolean): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true, recursive })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .sort(naturally.compare)
}

/** Where a shape's payload lives, given the resolved root folder and (for a file input) that file. */
export interface Locator {
  recursive: boolean
  /** `given` is the input file's name relative to root, or undefined when the input is a folder. Returns parts in order. */
  locate(files: string[], given: string | undefined): string[]
}

/** The stem shared by every volume of a split archive, or undefined for a single archive. */
function volumeStem(name: string): string | undefined {
  const match = /^(.*?)(\.part\d+\.rar|\.r\d{2}|\.rar|\.\d{3})$/i.exec(name)
  return match ? match[1].toLowerCase() : undefined
}

/** Position of a file within its split set: .rar opens an old-style .rNN set; .partN / .NNN count up. */
function volumeRank(name: string): number {
  const part = /\.part(\d+)\.rar$/i.exec(name) ?? /\.(\d{3})$/.exec(name)
  if (part) return Number(part[1])
  const old = /\.r(\d{2})$/i.exec(name)
  if (old) return Number(old[1]) + 1
  return 0
}

/** Natural order, with split-archive volumes in extraction order. */
export function byVolume(a: string, b: string): number {
  return naturally.compare(volumeStem(a) ?? a, volumeStem(b) ?? b) || volumeRank(a) - volumeRank(b) || naturally.compare(a, b)
}

/** A single volume of a split archive brings its siblings along; anything else stands alone. */
export function withSiblingVolumes(files: string[], given: string): string[] {
  const stem = volumeStem(given)
  const isSplit = /\.part\d+\.rar$|\.r\d{2}$|\.\d{3}$/i.test(given) || files.some((f) => /\.r\d{2}$/i.test(f) && volumeStem(f) === stem)
  if (!isSplit || stem === undefined) return [given]
  return files.filter((f) => ARCHIVE_PATTERN.test(f) && volumeStem(f) === stem)
}

/** Reads sidecar checksum files (SHA256SUMS, checksums.txt, *.sha256) into name → hex. */
/** Adds a checksum file's entries (GNU or BSD lines, or a bare digest in <name>.sha256) to `sums`, keyed by lowercase basename. */
function parseChecksums(fileName: string, text: string, sums: Map<string, string>): void {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const gnu = CHECKSUM_LINE.exec(line)
    const bsd = CHECKSUM_LINE_BSD.exec(line)
    if (gnu) sums.set(basename(gnu[2]).toLowerCase(), gnu[1].toLowerCase())
    else if (bsd) sums.set(basename(bsd[1]).toLowerCase(), bsd[2].toLowerCase())
    else if (/^[a-f0-9]{64}$/i.test(line) && /\.sha256$/i.test(fileName)) {
      // "<name>.sha256" holding only the digest.
      sums.set(fileName.replace(/\.sha256$/i, '').toLowerCase(), line.toLowerCase())
    }
  }
}

async function readChecksums(root: string, files: string[]): Promise<Map<string, string>> {
  const sums = new Map<string, string>()
  for (const file of files.filter((f) => CHECKSUM_FILES.test(basename(f)))) {
    parseChecksums(basename(file), await readFile(join(root, file), 'utf8'), sums)
  }
  return sums
}

/** Resolves `input` to ordered parts using a shape's locator. */
export async function resolvePath(input: string, locator: Locator): Promise<Part[]> {
  let info
  try {
    info = await stat(input)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`path not found: ${input}`)
    throw error
  }
  const root = info.isDirectory() ? input : dirname(input)
  const given = info.isDirectory() ? undefined : basename(input)
  const files = await listFiles(root, locator.recursive && given === undefined)
  const names = locator.locate(files, given)
  if (names.length === 0) throw new Error('no parts found at this path')

  const checksums = await readChecksums(root, files)
  return Promise.all(
    names.map(async (name, index): Promise<Part> => {
      const path = join(root, name)
      return {
        name,
        sizeBytes: (await stat(path)).size,
        path,
        url: pathToFileURL(path).href,
        index,
        sha256: checksums.get(basename(name).toLowerCase())
      }
    })
  )
}

const archiveLocator: Locator = {
  recursive: false,
  locate: (files, given) => (given ? withSiblingVolumes(files, given) : files.filter((f) => ARCHIVE_PATTERN.test(f))).sort(byVolume)
}

// ---- URL mode: a page (or a manifest JSON) on an allowlisted host ----

export function isUrlInput(input: string): boolean {
  return /^https?:\/\//i.test(input.trim())
}

/** One entry of a self-hosted manifest: [{ name, sizeBytes, url, sha256? }]. */
interface ManifestEntry {
  name: string
  sizeBytes: number
  url: string
  sha256?: string
}

interface GithubReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

interface GithubRelease {
  assets: GithubReleaseAsset[]
}

interface GithubReleaseRef {
  owner: string
  repo: string
  apiPath: string
}

const GITHUB_API_TIMEOUT_MS = 20_000

function githubReleaseRef(input: URL): GithubReleaseRef | undefined {
  if (input.hostname.toLowerCase().replace(/\.$/, '') !== 'github.com') return undefined
  const parts = input.pathname.split('/').filter(Boolean)
  if (parts.length < 3 || parts[2] !== 'releases') return undefined
  const owner = parts[0]
  const repo = parts[1]
  if (!owner || !repo) return undefined
  if (parts.length === 3 || (parts.length === 4 && parts[3] === 'latest')) return { owner, repo, apiPath: 'releases/latest' }
  if (parts.length === 5 && parts[3] === 'tag') return { owner, repo, apiPath: `releases/tags/${encodeURIComponent(decodeURIComponent(parts[4]))}` }
  return undefined
}

function withGithubApiHost(http: HttpContext): HttpContext {
  // GitHub release pages and api.github.com are the same publisher, so the API
  // host is allowed for this resolver flow even when the settings list only has
  // github.com.
  return { ...http, hosts: () => [...new Set([...http.hosts(), 'api.github.com'])] }
}

function isGithubRateLimit(response: Response, body: string): boolean {
  if (response.status !== 403) return false
  if ((response.headers.get('x-ratelimit-remaining') ?? '') === '0') return true
  return /rate limit/i.test(body)
}

async function fetchGithubRelease(url: URL, http: HttpContext): Promise<GithubRelease | undefined> {
  const release = githubReleaseRef(url)
  if (!release) return undefined
  const apiUrl = `https://api.github.com/repos/${release.owner}/${release.repo}/${release.apiPath}`
  const { response, url: finalUrl } = await httpFetch(
    apiUrl,
    {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS)
    },
    withGithubApiHost(http)
  )
  const body = await response.text()
  if (isGithubRateLimit(response, body)) throw new Error('blocked: GitHub API rate limit exceeded; retry in a minute')
  if (!response.ok) throw new Error(`${new URL(finalUrl).hostname} answered HTTP ${response.status} for ${apiUrl}`)
  const parsed = JSON.parse(body) as Partial<GithubRelease>
  if (!Array.isArray(parsed.assets)) throw new Error('GitHub release API response is missing assets')
  return { assets: parsed.assets }
}

async function githubReleaseParts(url: URL, http: HttpContext): Promise<Part[] | undefined> {
  const release = await fetchGithubRelease(url, http)
  if (!release) return undefined

  const sums = new Map<string, string>()
  const parts: Part[] = []
  for (const asset of release.assets) {
    if (typeof asset.name !== 'string' || typeof asset.browser_download_url !== 'string' || typeof asset.size !== 'number') continue
    if (asset.name.toLowerCase().endsWith('.sig')) continue
    if (asset.name.toLowerCase().includes('checksum')) {
      try {
        checkHost(asset.browser_download_url, http.hosts())
        parseChecksums(asset.name, (await fetchText(asset.browser_download_url, http, url.href)).text, sums)
      } catch {
        // A checksum asset that cannot be read only means no published hash.
      }
      continue
    }
    if (!ARCHIVE_PATTERN.test(asset.name) || !(asset.size > 0)) continue
    checkHost(asset.browser_download_url, http.hosts())
    parts.push({
      name: asset.name,
      sizeBytes: Math.floor(asset.size),
      url: asset.browser_download_url,
      index: parts.length
    })
  }

  for (const part of parts) {
    const sha256 = sums.get(part.name.toLowerCase())
    if (sha256) part.sha256 = sha256
  }
  if (parts.length === 0) throw new Error('no parts found at this URL')
  return parts
}

async function fetchText(url: string, http: HttpContext, referer?: string): Promise<{ text: string; url: string; type: string }> {
  const { response, url: finalUrl } = await httpFetch(url, { referer }, http)
  if (!response.ok) throw new Error(`${new URL(finalUrl).hostname} answered HTTP ${response.status} for ${url}`)
  return { text: await response.text(), url: finalUrl, type: response.headers.get('content-type') ?? '' }
}

/** Size of a remote file: HEAD's Content-Length, else a 0-0 Range probe's Content-Range total. */
async function remoteSize(url: string, http: HttpContext, referer: string): Promise<number> {
  const head = await httpFetch(url, { method: 'HEAD', referer }, http)
  const length = Number(head.response.headers.get('content-length'))
  if (head.response.ok && length > 0) return length
  const probe = await httpFetch(url, { rangeFrom: 0, rangeTo: 0, referer }, http)
  await probe.response.body?.cancel()
  const total = /\/(\d+)$/.exec(probe.response.headers.get('content-range') ?? '')
  if (probe.response.status === 206 && total) return Number(total[1])
  throw new Error(`could not determine the size of ${decodeURIComponent(new URL(url).pathname.split('/').pop() ?? url)}`)
}

function manifestParts(json: unknown, base: string, http: HttpContext): Part[] {
  const entries = Array.isArray(json) ? json : (json as { parts?: unknown })?.parts
  if (!Array.isArray(entries)) throw new Error('manifest must be an array of { name, sizeBytes, url, sha256? }')
  return entries.map((raw, index): Part => {
    const entry = raw as ManifestEntry
    if (typeof entry?.name !== 'string' || typeof entry.url !== 'string' || !(entry.sizeBytes > 0)) {
      throw new Error(`manifest entry ${index + 1} needs a name, a url and a positive sizeBytes`)
    }
    const url = new URL(entry.url, base).href
    checkHost(url, http.hosts())
    return { name: entry.name, sizeBytes: entry.sizeBytes, url, index, ...(entry.sha256 ? { sha256: entry.sha256.toLowerCase() } : {}) }
  })
}

/** Archive anchors on a page (or a manifest JSON) -> URL parts, in volume order, with sidecar sha256s. */
export async function resolveUrl(input: string, http: HttpContext | undefined): Promise<Part[]> {
  if (!http) throw new Error('URL sources need the download settings (internal: no HTTP context)')
  const source = new URL(input.trim())
  const githubParts = await githubReleaseParts(source, http)
  if (githubParts) return githubParts

  const page = await fetchText(source.href, http)
  if (/\.json$/i.test(new URL(page.url).pathname) || /json/i.test(page.type)) {
    const parts = manifestParts(JSON.parse(page.text), page.url, http)
    if (parts.length === 0) throw new Error('no parts found at this URL')
    return parts
  }

  const links = new Map<string, string>() // name -> absolute url
  const offList = new Map<string, string>() // archive name -> host, for links outside the allowlist
  const sidecars: { name: string; url: string }[] = []
  for (const match of page.text.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    let url: URL
    try {
      url = new URL(match[1].replace(/&amp;/g, '&'), page.url)
    } catch {
      continue
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
    const name = decodeURIComponent(url.pathname.split('/').pop() ?? '')
    if (ARCHIVE_PATTERN.test(name)) {
      // Links outside the allowlist are never fetched; they are only remembered for the checks below.
      if (!hostAllowed(url.hostname, http.hosts())) offList.set(name, url.hostname)
      else if (!links.has(name)) links.set(name, url.href)
    } else if (CHECKSUM_FILES.test(name)) sidecars.push({ name, url: url.href })
  }
  const names = [...links.keys()].sort(byVolume)
  if (names.length === 0 && offList.size) {
    throw new Error(`the parts on this page are on hosts not in your allowlist: ${[...new Set(offList.values())].join(', ')}`)
  }
  if (names.length === 0) throw new Error('no parts found at this URL')
  // A split set must come whole: a volume of a kept set on another host is an error, not a silent gap.
  const keptStems = new Set(names.map(volumeStem).filter(Boolean))
  for (const [name, host] of offList) {
    const stem = volumeStem(name)
    if (stem && keptStems.has(stem)) throw new Error(`${name} (part of the same set) is on ${host}, which is not in your allowlist`)
  }

  const sums = new Map<string, string>()
  for (const sidecar of sidecars) {
    try {
      checkHost(sidecar.url, http.hosts())
      parseChecksums(sidecar.name, (await fetchText(sidecar.url, http, page.url)).text, sums)
    } catch {
      // a sidecar on another host or an unreadable one only means no published hash
    }
  }

  const parts: Part[] = []
  for (const name of names) {
    const url = links.get(name)!
    checkHost(url, http.hosts())
    let sizeBytes: number
    try {
      sizeBytes = await remoteSize(url, http, page.url)
    } catch (error) {
      // Without a size the byte-count check cannot run. A standalone archive (e.g. a
      // generated 'source code' zip) is skipped; a volume of a split set cannot be.
      if (volumeStem(name) && keptStems.has(volumeStem(name)!) && names.filter((n) => volumeStem(n) === volumeStem(name)).length > 1) throw error
      console.warn(`[mist] skipped ${name}: ${(error as Error).message}`)
      continue
    }
    const sha256 = sums.get(name.toLowerCase())
    parts.push({ name, sizeBytes, url, index: parts.length, ...(sha256 ? { sha256 } : {}) })
  }
  if (parts.length === 0) throw new Error('no parts found at this URL (none of them report a size)')
  return parts
}

export const archiveResolver: Resolver = {
  resolve: (entry: SourceEntry) => (isUrlInput(entry.input) ? resolveUrl(entry.input, entry.http) : resolvePath(entry.input, archiveLocator))
}
