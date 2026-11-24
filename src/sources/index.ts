// Seam: turns a user-supplied source into concrete downloadable parts.
// Handlers are intentionally unimplemented; the UI surfaces their errors.
import type { Part, SourceShape } from '../shared/types'
import { archiveResolver } from './archive'
import { installerResolver } from './installer'
import { magnetResolver } from './magnet'

export interface SourceEntry {
  gameId: string
  input: string
  shape: SourceShape
}

export interface Resolver {
  resolve(entry: SourceEntry): Promise<Part[]>
}

const resolvers: Record<SourceShape, Resolver> = {
  archive: archiveResolver,
  installer: installerResolver,
  magnet: magnetResolver
}

export function resolverFor(shape: SourceShape): Resolver {
  return resolvers[shape]
}
