// Seam: turns a user-supplied source into concrete downloadable parts.
// Handlers are intentionally unimplemented; the UI surfaces their errors.
import type { Part, SourceShape } from '../shared/types'
import type { HttpContext } from '../main/net'
import { archiveResolver } from './archive'
import { installerResolver } from './installer'
import { folderResolver } from './folder'

export interface SourceEntry {
  gameId: string
  input: string
  shape: SourceShape
  /** Needed when `input` is an http(s) URL: allowlist + User-Agent. */
  http?: HttpContext
}

export interface Resolver {
  resolve(entry: SourceEntry): Promise<Part[]>
}

const resolvers: Record<SourceShape, Resolver> = {
  archive: archiveResolver,
  installer: installerResolver,
  folder: folderResolver
}

export function resolverFor(shape: SourceShape): Resolver {
  return resolvers[shape]
}
