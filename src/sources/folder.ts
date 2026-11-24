// Folder payload: an already-extracted game. Every file, recursively, keeping
// its relative path so the tree is rebuilt as-is.
import type { Resolver, SourceEntry } from './index'
import { resolvePath, type Locator } from './archive'

const folderLocator: Locator = {
  recursive: true,
  locate: (files, given) => (given ? [given] : files)
}

export const folderResolver: Resolver = {
  resolve: (entry: SourceEntry) => resolvePath(entry.input, folderLocator)
}
