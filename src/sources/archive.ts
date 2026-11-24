// Filesystem resolver core: turns a path (file or folder, local drive or share)
// into ordered Parts. Each shape only decides how to locate its payload.
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Part } from '../shared/types'
import type { Resolver, SourceEntry } from './index'

/** Archive files, including split volumes: .partN.rar, .rNN and .001-style. */
export const ARCHIVE_PATTERN = /\.(rar|7z|zip|r\d{2}|\d{3})$/i

const CHECKSUM_FILES = /(^sha256sums(\.txt)?$|^checksums?\.txt$|\.sha256$)/i
const CHECKSUM_LINE = /^([a-f0-9]{64})\s+\*?(.+?)\s*$/i
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
async function readChecksums(root: string, files: string[]): Promise<Map<string, string>> {
  const sums = new Map<string, string>()
  for (const file of files.filter((f) => CHECKSUM_FILES.test(basename(f)))) {
    const text = await readFile(join(root, file), 'utf8')
    const lines = text.split(/\r?\n/).filter(Boolean)
    for (const line of lines) {
      const match = CHECKSUM_LINE.exec(line.trim())
      if (match) sums.set(basename(match[2]).toLowerCase(), match[1].toLowerCase())
      else if (/^[a-f0-9]{64}$/i.test(line.trim()) && /\.sha256$/i.test(file)) {
        // "<name>.sha256" holding only the digest.
        sums.set(basename(file).replace(/\.sha256$/i, '').toLowerCase(), line.trim().toLowerCase())
      }
    }
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

export const archiveResolver: Resolver = {
  resolve: (entry: SourceEntry) => resolvePath(entry.input, archiveLocator)
}
