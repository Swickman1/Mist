// File integrity: streaming SHA-256 so multi-GB parts never sit in memory.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

async function assertFile(path: string): Promise<void> {
  try {
    const info = await stat(path)
    if (!info.isFile()) throw new Error(`sha256File: not a file: ${path}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`sha256File: file not found: ${path}`)
    throw error
  }
}

/** Lowercase hex SHA-256 of a file, read as a stream. */
export async function sha256File(path: string, signal?: AbortSignal): Promise<string> {
  await assertFile(path)
  const hash = createHash('sha256')
  const stream = createReadStream(path, { signal })
  for await (const chunk of stream) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

/** Hashes each path in order (sequentially, to keep disk access linear). */
export async function sha256Parts(paths: string[], signal?: AbortSignal): Promise<string[]> {
  const digests: string[] = []
  for (const path of paths) digests.push(await sha256File(path, signal))
  return digests
}
