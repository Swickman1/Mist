// Maps TMDB titles onto Mist's Show / Episode rows. Used by add (create) and by
// refresh (update): metadata fields are overwritten, but filePath, positionSec
// and library rows are never touched.
import { artUrl } from '../shared/media'
import type { Episode, Show, TmdbHit, TmdbKind } from '../shared/types'
import { makeArt } from './art'
import type { Repository } from './repository'
import { TMDB_CONFIG, tmdbImageUrl, type TmdbClient, type TmdbMovieResult, type TmdbTvResult } from './tmdb'
import type { ArtCache } from './artCache'

export const METADATA_CONFIG = {
  sizes: { poster: 'w500', hero: 'w1280', still: 'w300', searchPoster: 'w185' },
  /** Used when TMDB has no runtime for an episode / movie. */
  fallbackEpisodeMinutes: 45,
  fallbackMovieMinutes: 100,
  searchResultLimit: 12,
  /** Season 0 is TMDB's "Specials"; it is skipped. */
  skipSpecials: true
}

export type ArtAsset = 'poster' | 'hero' | `still-s${number}e${number}`

/** Where a stored TMDB image is referenced from. */
export type ArtUrl = (ref: { kind: TmdbKind; tmdbId: number; asset: ArtAsset; size: string; path: string }) => string

export function cacheKey(kind: TmdbKind, tmdbId: number): string {
  return `${kind}-${tmdbId}`
}

/** Stored artwork goes through mist-media://tmdb, served from userData/tmdb-cache (remote only on a miss). */
export const cachedArt: ArtUrl = ({ kind, tmdbId, asset, size, path }) =>
  artUrl({ source: 'tmdb', key: cacheKey(kind, tmdbId), asset, src: `${size}${path}` })

export function showIdFor(kind: TmdbKind, tmdbId: number): string {
  return `s-tmdb-${kind}-${tmdbId}`
}

function yearOf(date: string | undefined): number {
  const year = Number(date?.slice(0, 4))
  return Number.isFinite(year) && year > 0 ? year : 0
}

function rating(value: number): number {
  return Math.round(value * 10) / 10
}

export function toHit(kind: TmdbKind, result: TmdbTvResult | TmdbMovieResult): TmdbHit {
  const title = 'name' in result ? result.name : result.title
  const date = 'first_air_date' in result ? result.first_air_date : (result as TmdbMovieResult).release_date
  return {
    tmdbId: result.id,
    kind,
    title,
    year: yearOf(date) || undefined,
    posterUrl: result.poster_path ? tmdbImageUrl(METADATA_CONFIG.sizes.searchPoster, result.poster_path) : undefined,
    overview: result.overview,
    rating: rating(result.vote_average)
  }
}

interface EpisodeDraft {
  season: number
  episode: number
  title: string
  overview: string
  durationSec: number
  stillPath?: string | null
}

export interface ImportResult {
  show: Show
  created: number
  updated: number
}

/** Fetches a title's details (and for tv every season) and upserts the show and its episodes. */
export async function importTitle(
  tmdb: TmdbClient,
  repo: Repository,
  cache: ArtCache,
  kind: TmdbKind,
  tmdbId: number,
  art: ArtUrl
): Promise<ImportResult> {
  const showId = showIdFor(kind, tmdbId)
  const { sizes } = METADATA_CONFIG
  let title: string
  let base: Pick<Show, 'year' | 'rating' | 'overview'>
  let posterPath: string | null | undefined
  let backdropPath: string | null | undefined
  const drafts: EpisodeDraft[] = []

  if (kind === 'tv') {
    const details = await tmdb.tvDetails(tmdbId)
    await cache.writeJson(cacheKey(kind, tmdbId), 'details', details)
    title = details.name
    base = { year: yearOf(details.first_air_date), rating: rating(details.vote_average), overview: details.overview }
    posterPath = details.poster_path
    backdropPath = details.backdrop_path
    const defaultMinutes = details.episode_run_time[0] ?? METADATA_CONFIG.fallbackEpisodeMinutes
    const seasons = details.seasons.filter((s) => !(METADATA_CONFIG.skipSpecials && s.season_number === 0) && s.episode_count > 0)
    for (const season of seasons) {
      const detail = await tmdb.seasonDetails(tmdbId, season.season_number)
      await cache.writeJson(cacheKey(kind, tmdbId), `season-${season.season_number}`, detail)
      for (const ep of detail.episodes) {
        drafts.push({
          season: ep.season_number,
          episode: ep.episode_number,
          title: ep.name || `Episode ${ep.episode_number}`,
          overview: ep.overview,
          durationSec: (ep.runtime || defaultMinutes) * 60,
          stillPath: ep.still_path
        })
      }
    }
  } else {
    const details = await tmdb.movieDetails(tmdbId)
    await cache.writeJson(cacheKey(kind, tmdbId), 'details', details)
    title = details.title
    base = { year: yearOf(details.release_date), rating: rating(details.vote_average), overview: details.overview }
    posterPath = details.poster_path
    backdropPath = details.backdrop_path
    // A movie is a one-episode show: synthetic season 1 / episode 1.
    drafts.push({
      season: 1,
      episode: 1,
      title: details.title,
      overview: details.overview,
      durationSec: (details.runtime || METADATA_CONFIG.fallbackMovieMinutes) * 60,
      stillPath: details.backdrop_path
    })
  }

  const ref = (asset: ArtAsset, size: string, path: string) => art({ kind, tmdbId, asset, size, path })
  const existing = repo.shows.get(showId)
  const show: Show = {
    ...existing,
    id: showId,
    title,
    ...base,
    poster: posterPath ? ref('poster', sizes.poster, posterPath) : makeArt(showId, { width: 600, height: 900, label: title }),
    hero: backdropPath ? ref('hero', sizes.hero, backdropPath) : makeArt(`${showId}-hero`, { width: 2100, height: 900 }),
    seasons: [...new Set(drafts.map((d) => d.season))].sort((a, b) => a - b),
    tmdbId,
    tmdbKind: kind
  }

  let created = 0
  let updated = 0
  repo.transaction(() => {
    repo.shows.put(show)
    for (const draft of drafts) {
      const id = `${showId}-s${draft.season}e${draft.episode}`
      const asset: ArtAsset = `still-s${draft.season}e${draft.episode}`
      const current = repo.episodes.get(id)
      const next: Episode = {
        id,
        showId,
        season: draft.season,
        episode: draft.episode,
        title: draft.title,
        overview: draft.overview,
        still: draft.stillPath ? ref(asset, sizes.still, draft.stillPath) : makeArt(id, { width: 640, height: 360 }),
        durationSec: draft.durationSec,
        // Playback state and the on-disk file belong to the user, not to TMDB.
        positionSec: current?.positionSec ?? 0,
        ...(current?.filePath ? { filePath: current.filePath } : {})
      }
      repo.episodes.put(next)
      if (current) updated++
      else created++
    }
  })
  return { show, created, updated }
}

/** Every stored artwork URL of a show (poster, hero, episode stills), for warming the cache. */
export function artUrlsOf(repo: Repository, showId: string): string[] {
  const show = repo.shows.get(showId)
  if (!show) return []
  return [show.poster, show.hero, ...repo.episodes.all().filter((e) => e.showId === showId).map((e) => e.still)]
}

/** Rows imported before the cache existed (remote image.tmdb.org URLs) switch to cached mist-media URLs. */
export function migrateRemoteArt(repo: Repository): number {
  const prefix = `${TMDB_CONFIG.imageBase}/`
  const toCached = (url: string, kind: TmdbKind, tmdbId: number, asset: ArtAsset) => {
    if (!url.startsWith(prefix)) return url
    const [size, ...rest] = url.slice(prefix.length).split('/')
    return cachedArt({ kind, tmdbId, asset, size, path: `/${rest.join('/')}` })
  }
  let changed = 0
  repo.transaction(() => {
    for (const show of repo.shows.all()) {
      if (!show.tmdbKind || !show.tmdbId) continue
      const { tmdbKind: kind, tmdbId } = show
      const next = { ...show, poster: toCached(show.poster, kind, tmdbId, 'poster'), hero: toCached(show.hero, kind, tmdbId, 'hero') }
      if (next.poster !== show.poster || next.hero !== show.hero) {
        repo.shows.put(next)
        changed++
      }
      for (const episode of repo.episodes.all().filter((e) => e.showId === show.id)) {
        const still = toCached(episode.still, kind, tmdbId, `still-s${episode.season}e${episode.episode}`)
        if (still !== episode.still) {
          repo.episodes.put({ ...episode, still })
          changed++
        }
      }
    }
  })
  return changed
}
