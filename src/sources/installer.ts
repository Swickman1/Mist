// Installer payload: a setup .exe/.msi plus any data files that ship beside it
// (Inno Setup style "setup-1.bin", "setup-2.bin" …).
import { basename, extname } from 'node:path'
import type { Resolver, SourceEntry } from './index'
import { resolvePath, type Locator } from './archive'

const INSTALLER = /\.(exe|msi)$/i

function companions(files: string[], installer: string): string[] {
  const stem = basename(installer, extname(installer)).toLowerCase()
  return files.filter((f) => /\.bin$/i.test(f) && basename(f).toLowerCase().startsWith(stem))
}

const installerLocator: Locator = {
  recursive: false,
  locate(files, given) {
    const installer = given ?? files.filter((f) => INSTALLER.test(f)).sort((a, b) => Number(/^setup/i.test(b)) - Number(/^setup/i.test(a)))[0]
    if (!installer || !INSTALLER.test(installer)) return []
    return [installer, ...companions(files, installer)]
  }
}

export const installerResolver: Resolver = {
  resolve: (entry: SourceEntry) => resolvePath(entry.input, installerLocator)
}
