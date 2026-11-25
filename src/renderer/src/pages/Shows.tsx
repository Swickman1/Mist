import { useEffect, useState } from 'react'
import type { TmdbGenre, TmdbKind } from '../../../shared/types'
import { browseSession, genreList } from '../browse'
import { BrowseRow } from '../components/BrowseRow'
import { PosterTile } from '../components/Cards'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { entryFor } from '../selectors'
import { useMist } from '../store'

/** Shows/Movies toggle, genre chips, and the Trending / Popular rows. */
function Browse() {
  const [kind, setKind] = useState<TmdbKind>('tv')
  const [genre, setGenre] = useState<TmdbGenre | null>(null)
  const [genres, setGenres] = useState<TmdbGenre[]>([])

  useEffect(() => {
    let current = true
    setGenre(null)
    void genreList(kind).then((result) => current && setGenres(result.ok ? result.genres : []))
    return () => {
      current = false
    }
  }, [kind])

  const noun = kind === 'tv' ? 'shows' : 'movies'
  return (
    <>
      <div className="toolbar" style={{ marginTop: 32 }}>
        <h2 className="section__title">Browse TMDB</h2>
        <div className="segmented" role="radiogroup" aria-label="Browse type">
          {(['tv', 'movie'] as TmdbKind[]).map((option) => (
            <button key={option} role="radio" aria-checked={kind === option} className={kind === option ? 'is-selected' : ''} onClick={() => setKind(option)}>
              {option === 'tv' ? 'Shows' : 'Movies'}
            </button>
          ))}
        </div>
      </div>
      {genres.length > 0 && (
        <div role="radiogroup" aria-label="Genre" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 8 }}>
          {[null, ...genres].map((option) => {
            const selected = (genre?.id ?? null) === (option?.id ?? null)
            return (
              <button
                key={option?.id ?? 'all'}
                role="radio"
                aria-checked={selected}
                className={`btn btn--sm ${selected ? 'btn--primary' : 'btn--ghost'}`}
                style={{ flex: 'none' }}
                onClick={() => setGenre(option)}
              >
                {option?.name ?? 'All genres'}
              </button>
            )
          })}
        </div>
      )}
      <BrowseRow title={`Trending ${noun} this week`} kind={kind} mode="trending" />
      <BrowseRow title={genre ? `Popular ${genre.name.toLowerCase()} ${noun}` : `Popular ${noun}`} kind={kind} mode="popular" genreId={genre?.id} />
    </>
  )
}

export function Shows() {
  const { snapshot, openAddFlow } = useMist()
  const [browsing, setBrowsing] = useState(browseSession.open || snapshot.shows.length > 0)

  const openBrowse = () => {
    browseSession.open = true
    setBrowsing(true)
  }

  return (
    <div className="page">
      <header className="page__head">
        <h1>Shows & Movies</h1>
        <button className="btn btn--ghost" onClick={() => openAddFlow('show')}>
          <Icon name="plus" /> Add show
        </button>
      </header>
      {snapshot.shows.length > 0 && (
        <section className="section">
          <h2 className="section__title">
            In your catalog <span>({snapshot.shows.length})</span>
          </h2>
          <div className="grid grid--dense">
            {snapshot.shows.map((show) => (
              <PosterTile key={show.id} show={show} owned={entryFor(snapshot, 'show', show.id) !== undefined} />
            ))}
          </div>
        </section>
      )}
      {browsing ? (
        <Browse />
      ) : (
        <EmptyState
          icon="shows"
          title="Nothing here yet"
          body="Browse what is trending on TMDB, or add a show or movie you have on disk."
          actions={[
            { label: 'Browse trending', primary: true, onClick: openBrowse },
            { label: 'Add from disk', onClick: () => openAddFlow('show') }
          ]}
        />
      )}
    </div>
  )
}
