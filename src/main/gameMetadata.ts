// Maps Steam store data onto Mist's Game rows. Used by add (create) and refresh
// (update): metadata fields only. source, shape, parts, manifest, exeHint,
// version, size and library rows are never touched.
import type { Game, SteamHit } from '../shared/types'
import type { Repository } from './repository'
import { STEAM_CONFIG, type SteamAppDetails, type SteamClient, type SteamSearchItem } from './steam'

export const GAME_METADATA_CONFIG = {
  searchResultLimit: 12,
  /** Portrait 2:3 library capsule -> Game.art; wide library hero -> Game.hero. */
  files: { capsule: 'library_600x900.jpg', hero: 'library_hero.jpg' },
  headTimeoutMs: 10_000
}

export type SteamArtAsset = 'capsule' | 'hero' | 'header'

/** Where a stored Steam image is referenced from: remote here; the cache (task 3) points it at mist-media. */
export type SteamArtUrl = (ref: { appId: number; asset: SteamArtAsset; url: string }) => string

export const remoteSteamArt: SteamArtUrl = ({ url }) => url

export function gameIdFor(appId: number): string {
  return `g-steam-${appId}`
}

function formatPrice(price: SteamSearchItem['price']): string | undefined {
  if (!price) return undefined
  if (price.final === 0) return 'Free'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: price.currency }).format(price.final / 100)
}

export function toSteamHit(item: SteamSearchItem): SteamHit {
  return { appId: item.id, title: item.name, capsuleUrl: item.tiny_image, price: formatPrice(item.price) }
}

/** Steam's short_description carries HTML entities. */
function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

/** Image URLs without the cache-busting ?t= query. */
function withoutQuery(url: string): string {
  return url.split('?')[0]
}

function storeAsset(appId: number, file: string): string {
  return `${STEAM_CONFIG.imageBase}/store_item_assets/steam/apps/${appId}/${file}`
}

/** CDN HEAD check (not rate-limited like the store API): not every app has the library images. */
async function exists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(GAME_METADATA_CONFIG.headTimeoutMs) })
    return response.ok
  } catch {
    return false
  }
}

export interface SteamImportResult {
  game: Game
  created: boolean
  details: SteamAppDetails
}

/**
 * Upserts the Game row for a Steam app from its store details. `details` lets a
 * caller pass cached JSON instead of calling appdetails again.
 */
export async function importSteamGame(steam: SteamClient, repo: Repository, appId: number, art: SteamArtUrl, cached?: SteamAppDetails): Promise<SteamImportResult> {
  const details = cached ?? (await steam.appDetails(appId))
  if (details.type !== 'game') throw new Error(`“${details.name}” is ${details.type} content on Steam, not a game`)

  const header = withoutQuery(details.header_image)
  const capsuleUrl = storeAsset(appId, GAME_METADATA_CONFIG.files.capsule)
  const heroUrl = storeAsset(appId, GAME_METADATA_CONFIG.files.hero)
  const [hasCapsule, hasHero] = await Promise.all([exists(capsuleUrl), exists(heroUrl)])

  const metadata = {
    title: details.name,
    description: decodeEntities(details.short_description),
    genres: details.genres?.map((genre) => genre.description) ?? [],
    releaseDate: details.release_date?.date || undefined,
    art: art({ appId, asset: 'capsule', url: hasCapsule ? capsuleUrl : header }),
    hero: art({ appId, asset: 'hero', url: hasHero ? heroUrl : header }),
    header: art({ appId, asset: 'header', url: header }),
    steamAppId: appId
  }

  const id = gameIdFor(appId)
  const existing = repo.games.get(id)
  const game: Game = existing
    ? { ...existing, ...metadata }
    : { id, ...metadata, version: '—', sizeBytes: 0, vetted: false, addedAt: Date.now() }
  repo.games.put(game)
  return { game, created: !existing, details }
}
