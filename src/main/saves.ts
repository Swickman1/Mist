// Save backup: copies a game's save folders into
// <saveBackupPath>/<gameId>/<ISO timestamp>/, preserving their structure.
import { existsSync } from 'node:fs'
import { cp, readdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'

/** Known per-user folders a save path is relative to. */
export type SaveRoot = 'Documents' | 'AppData' | 'LocalAppData'

export interface SaveLocation {
  root: SaveRoot
  /** Relative to the root. */
  path: string
}

/** Where each game keeps its saves. Games not listed fall back to the folder picker. */
export const SAVE_RECIPES: Record<string, SaveLocation[]> = {
  'g-hollow-orbit': [
    { root: 'Documents', path: 'My Games\\Hollow Orbit' },
    { root: 'AppData', path: 'HollowOrbit\\Saves' }
  ],
  'g-saltmarsh': [{ root: 'AppData', path: 'Saltmarsh' }],
  'g-cinder-protocol': [
    { root: 'Documents', path: 'Cinder Protocol\\Profiles' },
    { root: 'LocalAppData', path: 'CinderProtocol\\Saved\\SaveGames' }
  ],
  'g-tidewright': [{ root: 'LocalAppData', path: 'Tidewright\\Saves' }],
  'g-lantern-keep': [{ root: 'AppData', path: 'LanternKeep' }],
  'g-quiet-engines': [{ root: 'Documents', path: 'Quiet Engines\\Saves' }],
  'g-paper-kingdoms': [{ root: 'AppData', path: 'PaperKingdoms\\saves' }],
  'g-northbound': [{ root: 'Documents', path: 'My Games\\Northbound' }],
  'g-glasswing': [{ root: 'LocalAppData', path: 'Glasswing\\Saves' }]
}

export interface BackupResult {
  /** Files copied. */
  count: number
  destination: string
}

async function countFiles(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  return entries.filter((entry) => entry.isFile()).length
}

/** ISO timestamp made safe for a Windows folder name (':' is not allowed). */
export function backupStamp(date: Date): string {
  return date.toISOString().replace(/:/g, '-')
}

/**
 * Copies every existing recipe location (or the picked folder when the game has no recipe).
 * Returns undefined when there was no recipe and the picker was cancelled.
 */
export async function backupSaves(
  gameId: string,
  backupRoot: string,
  roots: Record<SaveRoot, string>,
  pickFolder: () => Promise<string | null>,
  now = new Date()
): Promise<BackupResult | undefined> {
  const destination = join(backupRoot, gameId, backupStamp(now))
  const recipe = SAVE_RECIPES[gameId]

  const copies: { from: string; to: string }[] = []
  if (recipe) {
    for (const location of recipe) {
      const from = join(roots[location.root], location.path)
      if (existsSync(from)) copies.push({ from, to: join(destination, location.root, location.path) })
    }
  } else {
    const picked = await pickFolder()
    if (!picked) return undefined
    copies.push({ from: picked, to: join(destination, basename(picked)) })
  }

  let count = 0
  for (const { from, to } of copies) {
    await cp(from, to, { recursive: true, preserveTimestamps: true })
    count += await countFiles(to)
  }
  if (count === 0) await rm(destination, { recursive: true, force: true })
  return { count, destination }
}
