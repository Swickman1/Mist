// One horizontally scrolling browse row: up to 20 TMDB cards (poster, title, year,
// rating) and a 'more' tile that pages to the next 20. Pages come from the session cache.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TmdbDiscoverMode, TmdbDiscoverResult, TmdbKind } from '../../../shared/types'
import { discoverPage } from '../browse'
import { Icon } from './Icon'

const CARD_WIDTH = 140

export function BrowseRow({ title, kind, mode, genreId }: { title: string; kind: TmdbKind; mode: TmdbDiscoverMode; genreId?: number }) {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<TmdbDiscoverResult | null>(null)

  // A different kind or genre starts the row over at page 1.
  useEffect(() => setPage(1), [kind, mode, genreId])

  useEffect(() => {
    let current = true
    setResult(null)
    void discoverPage(kind, mode, page, genreId).then((next) => current && setResult(next))
    return () => {
      current = false
    }
  }, [kind, mode, genreId, page])

  const cardStyle: React.CSSProperties = { width: CARD_WIDTH, flex: 'none' }

  return (
    <section className="section" aria-label={title}>
      <h2 className="section__title">
        {title} {page > 1 && <span>(page {page})</span>}
      </h2>
      {result && !result.ok ? (
        <p className="muted" role="status">
          {result.error}
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, scrollSnapType: 'x proximity' }}>
          {!result &&
            Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="tile" style={cardStyle} aria-hidden="true">
                <div className="tile__cover" style={{ background: 'var(--surface-2)' }} />
              </div>
            ))}
          {result?.ok &&
            result.hits.map((hit) => (
              <div key={hit.tmdbId} className="tile" style={{ ...cardStyle, scrollSnapAlign: 'start' }}>
                <button className="tile__cover" onClick={() => navigate(`/shows/tmdb/${hit.kind}/${hit.tmdbId}`)} aria-label={hit.title}>
                  {hit.posterUrl ? <img src={hit.posterUrl} alt="" draggable={false} /> : <span className="tile__glyph" style={{ opacity: 1 }}>?</span>}
                </button>
                <span className="tile__title">{hit.title}</span>
                <span className="tile__meta muted">{[hit.year, hit.rating ? `★ ${hit.rating.toFixed(1)}` : ''].filter(Boolean).join(' · ')}</span>
              </div>
            ))}
          {result?.ok && result.page < result.totalPages && (
            <div className="tile" style={cardStyle}>
              <button className="tile__cover" onClick={() => setPage(page + 1)} aria-label={`More ${title}`} style={{ display: 'grid', placeItems: 'center', background: 'var(--surface)' }}>
                <span style={{ display: 'grid', justifyItems: 'center', gap: 8, color: 'var(--text-2)' }}>
                  <Icon name="chevronRight" size={24} />
                  More
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
