// Session cache for Shows-tab browsing: one request per (kind, mode, genre, page)
// and per genre list, kept for the session so switching tabs never refetches.
// Failed requests are dropped from the cache so a retry asks again.
import type { TmdbDiscoverMode, TmdbDiscoverResult, TmdbGenresResult, TmdbKind } from '../../shared/types'
import { api } from './store'

const pages = new Map<string, Promise<TmdbDiscoverResult>>()
const genres = new Map<TmdbKind, Promise<TmdbGenresResult>>()

/** The Shows tab's browse section stays open for the rest of the session once opened. */
export const browseSession = { open: false }

export function discoverPage(kind: TmdbKind, mode: TmdbDiscoverMode, page: number, genreId?: number): Promise<TmdbDiscoverResult> {
  const key = `${kind}|${mode}|${genreId ?? ''}|${page}`
  let request = pages.get(key)
  if (!request) {
    request = api.tmdbDiscover(kind, mode, page, genreId)
    pages.set(key, request)
    void request.then((result) => !result.ok && pages.delete(key))
  }
  return request
}

export function genreList(kind: TmdbKind): Promise<TmdbGenresResult> {
  let request = genres.get(kind)
  if (!request) {
    request = api.tmdbGenres(kind)
    genres.set(kind, request)
    void request.then((result) => !result.ok && genres.delete(kind))
  }
  return request
}
