// /shows/tmdb/:kind/:tmdbId — a browsed title. If it is already in the catalog this
// hands straight over to its show page; otherwise its metadata is imported once
// (a skeleton shows meanwhile) and then it hands over.
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import type { ActionResult, TmdbKind } from '../../../shared/types'
import { EmptyState } from '../components/EmptyState'
import { api, useMist } from '../store'

/** One import per title per session, even across StrictMode's double mount. */
const imports = new Map<string, Promise<ActionResult & { showId?: string }>>()

function importOnce(kind: TmdbKind, tmdbId: number): Promise<ActionResult & { showId?: string }> {
  const key = `${kind}:${tmdbId}`
  let request = imports.get(key)
  if (!request) {
    request = api.importTmdbTitle(kind, tmdbId)
    imports.set(key, request)
    void request.then((result) => !result.ok && imports.delete(key))
  }
  return request
}

function Skeleton() {
  const block = (style: React.CSSProperties) => <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius)', ...style }} />
  return (
    <div className="page page--hero" aria-busy="true" aria-label="Loading title">
      {block({ aspectRatio: '21 / 9', maxHeight: 440, borderRadius: 0 })}
      <div className="page__body" style={{ marginTop: 16 }}>
        {block({ height: 80 })}
        {block({ height: 24, width: '40%' })}
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i}>{block({ height: 72 })}</div>
        ))}
      </div>
    </div>
  )
}

export function TmdbTitle() {
  const { kind, tmdbId } = useParams()
  const { snapshot } = useMist()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const titleKind = kind === 'movie' ? 'movie' : 'tv'
  const id = Number(tmdbId)
  const existing = snapshot.shows.find((show) => show.tmdbKind === titleKind && show.tmdbId === id)

  useEffect(() => {
    if (existing || !Number.isFinite(id)) return
    let current = true
    setError(null)
    void importOnce(titleKind, id).then((result) => {
      if (!current) return
      if (result.ok && result.showId) navigate(`/shows/${result.showId}`, { replace: true })
      else setError(result.message)
    })
    return () => {
      current = false
    }
    // existing is re-checked on every render; the import itself runs once per view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleKind, id, attempt])

  if (existing) return <Navigate to={`/shows/${existing.id}`} replace />
  if (error) {
    return (
      <div className="page">
        <EmptyState
          icon="shows"
          title="Could not load this title"
          body={error}
          actions={[
            { label: 'Try again', primary: true, onClick: () => setAttempt(attempt + 1) },
            { label: 'Back', onClick: () => navigate(-1) }
          ]}
        />
      </div>
    )
  }
  return <Skeleton />
}
