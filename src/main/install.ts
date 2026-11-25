// Install: turn a verified staging folder into <libraryPath>/<safe title>,
// detect the game's exe, and launch it. Also reconciles installed paths on disk.
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, relative } from 'node:path'
import { promisify } from 'node:util'
import type { Game, LibraryEntry } from '../shared/types'
import type { InstallResult } from './jobRunner'
import type { Repository } from './repository'
import { clearStaging, sanitiseName, TRANSFER_CONFIG } from './transfer'

const run = promisify(execFile)

export const INSTALL_CONFIG = {
  outDir: '_out',
  sevenZip: ['7z.exe', 'C:\\Program Files\\7-Zip\\7z.exe', 'C:\\Program Files (x86)\\7-Zip\\7z.exe'],
  unrar: ['UnRAR.exe', 'C:\\Program Files\\WinRAR\\UnRAR.exe', 'C:\\Program Files (x86)\\WinRAR\\UnRAR.exe'],
  tar: ['C:\\Windows\\System32\\tar.exe'],
  /** Executables that are never the game itself. */
  notTheGame: /unins|setup|install|redist|vcredist|dxsetup|directx|crashhandler|crashpad|prereq|launcherhelper/i
}

/** A Windows-safe folder name for a title. */
export function safeTitle(title: string): string {
  return title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/[. ]+$/, '').trim() || 'Untitled'
}

/** First existing candidate: absolute paths are checked on disk, bare names on PATH. */
async function findTool(candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (candidate.includes('\\')) {
      if (existsSync(candidate)) return candidate
      continue
    }
    try {
      const { stdout } = await run('where', [candidate], { windowsHide: true })
      const found = stdout.split(/\r?\n/).find(Boolean)
      if (found) return found.trim()
    } catch {
      // not on PATH
    }
  }
  return undefined
}

/** One archive per set: the first volume of each split group, in manifest order. */
function archiveEntryPoints(game: Game, stagingDir: string): string[] {
  const seen = new Set<string>()
  const entries: string[] = []
  for (const part of [...game.manifest!.parts].sort((a, b) => a.index - b.index)) {
    const stem = part.name.replace(/(\.part\d+\.rar|\.r\d{2}|\.rar|\.\d{3}|\.7z|\.zip)$/i, '').toLowerCase()
    if (seen.has(stem)) continue
    seen.add(stem)
    entries.push(join(stagingDir, sanitiseName(part.name)))
  }
  return entries
}

async function extract(archive: string, outDir: string, signal: AbortSignal): Promise<void> {
  const options = { signal, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }
  const sevenZip = await findTool(INSTALL_CONFIG.sevenZip)
  if (sevenZip) {
    await run(sevenZip, ['x', '-y', '-bso0', '-bsp0', `-o${outDir}`, archive], options)
    return
  }
  const isRar = /\.(rar|r\d{2})$/i.test(archive)
  const unrar = isRar ? await findTool(INSTALL_CONFIG.unrar) : undefined
  if (unrar) {
    await run(unrar, ['x', '-y', '-idq', archive, outDir + '\\'], options)
    return
  }
  const tar = !isRar && !/\.\d{3}$/.test(archive) ? await findTool(INSTALL_CONFIG.tar) : undefined
  if (tar) {
    await run(tar, ['-xf', archive, '-C', outDir], options)
    return
  }
  throw new Error(`no extractor for ${basename(archive)}: install 7-Zip`)
}

/** Runs a setup program silently into outDir (Inno Setup flags for .exe, msiexec for .msi). */
async function runInstaller(installer: string, outDir: string, signal: AbortSignal): Promise<void> {
  const options = { signal, windowsHide: true }
  if (extname(installer).toLowerCase() === '.msi') {
    await run('msiexec', ['/i', installer, '/qn', '/norestart', `TARGETDIR=${outDir}`], options)
    return
  }
  await run(installer, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${outDir}`], options)
}

/** An archive that wraps everything in one top-level folder installs that folder. */
async function payloadRoot(outDir: string): Promise<string> {
  const entries = await readdir(outDir, { withFileTypes: true })
  return entries.length === 1 && entries[0].isDirectory() ? join(outDir, entries[0].name) : outDir
}

/** rename when on the same volume, copy + delete across volumes. */
async function move(from: string, to: string): Promise<void> {
  await rm(to, { recursive: true, force: true })
  await mkdir(dirname(to), { recursive: true })
  try {
    await rename(from, to)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
    await cp(from, to, { recursive: true })
    await rm(from, { recursive: true, force: true })
  }
}

/** The game's exe relative to its folder: the largest non-helper .exe at the top level, else one level down. */
export async function detectExe(root: string): Promise<string | undefined> {
  for (const depth of [0, 1]) {
    const entries = await readdir(root, { withFileTypes: true, recursive: depth > 0 })
    const candidates = entries.filter(
      (entry) =>
        entry.isFile() &&
        extname(entry.name).toLowerCase() === '.exe' &&
        !INSTALL_CONFIG.notTheGame.test(entry.name) &&
        relative(root, entry.parentPath).split(/[\\/]/).filter(Boolean).length === depth
    )
    if (candidates.length === 0) continue
    const sized = await Promise.all(candidates.map(async (entry) => ({ path: join(entry.parentPath, entry.name), size: (await stat(join(entry.parentPath, entry.name))).size })))
    sized.sort((a, b) => b.size - a.size)
    return relative(root, sized[0].path)
  }
  return undefined
}

/** Extract / run / move the staged payload into the library, then delete staging. */
export async function installGame(game: Game, stagingDir: string, libraryPath: string, signal: AbortSignal): Promise<InstallResult> {
  const outDir = join(stagingDir, INSTALL_CONFIG.outDir)
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  if (game.shape === 'archive') {
    for (const archive of archiveEntryPoints(game, stagingDir)) await extract(archive, outDir, signal)
  } else if (game.shape === 'installer') {
    const installer = game.manifest!.parts.find((part) => /\.(exe|msi)$/i.test(part.name))!
    await runInstaller(join(stagingDir, sanitiseName(installer.name)), outDir, signal)
  } else {
    // folder: the staged tree is the game; move it under _out without the temp files.
    for (const entry of await readdir(stagingDir)) {
      if (entry === INSTALL_CONFIG.outDir || entry.endsWith(TRANSFER_CONFIG.tempSuffix)) continue
      await rename(join(stagingDir, entry), join(outDir, entry))
    }
  }
  signal.throwIfAborted()

  const target = join(libraryPath, safeTitle(game.title))
  await move(await payloadRoot(outDir), target)
  const exeHint = await detectExe(target)
  await clearStaging(stagingDir)
  return { path: target, exeHint }
}

/** Launches the game's exe detached from Mist and returns it (for playtime). Throws when it is not on disk. */
export function launchGame(entry: LibraryEntry, game: Game): ChildProcess {
  if (!entry.path || !game.exeHint) throw new Error(`${game.title} has no executable to launch`)
  const exe = join(entry.path, game.exeHint)
  if (!existsSync(exe)) throw new Error(`${exe} is missing`)
  const child = spawn(exe, [], { cwd: dirname(exe), detached: true, stdio: 'ignore', windowsHide: false })
  // Detached and unref'd: Mist can quit while the game runs; 'exit' still fires while Mist is alive.
  child.unref()
  return child
}

/** Marks every ready/update entry whose folder is gone as missing. Returns whether anything changed. */
export function reconcileInstalled(repo: Repository): boolean {
  let changed = false
  for (const entry of repo.library.all()) {
    if (entry.state === 'missing' || !entry.path || existsSync(entry.path)) continue
    repo.library.put({ ...entry, state: 'missing' })
    changed = true
  }
  return changed
}
