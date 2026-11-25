import { useEffect, useState } from 'react'
import type { TmdbHit, TmdbKind } from '../../../shared/types'
import { entryFor } from '../selectors'
import { api, useMist } from '../store'
import { SourceFields, type SourceDraft } from './AddSourcePanel'
import { Icon } from './Icon'
import { Modal } from './Modal'

const SEARCH_DEBOUNCE_MS = 350

interface Candidate {
  id: string
  title: string
  art?: string
  meta: string
}

/** Selection is either a catalog id or a TMDB hit (`tmdb:<kind>:<id>`). */
const tmdbKey = (hit: TmdbHit) => `tmdb:${hit.kind}:${hit.tmdbId}`

export function AddFlow() {
  const { snapshot, addFlow, openAddFlow, notify } = useMist()
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<SourceDraft>({ input: '', shape: 'archive' })
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<TmdbKind>('tv')
  const [hits, setHits] = useState<TmdbHit[]>([])
  const [searchStatus, setSearchStatus] = useState<string>('')
  const [busy, setBusy] = useState(false)

  // Debounced TMDB search for the show flow.
  useEffect(() => {
    if (addFlow !== 'show' || query.trim().length < 2) {
      setHits([])
      setSearchStatus('')
      return
    }
    setSearchStatus('Searching TMDB…')
    let current = true
    const timer = setTimeout(async () => {
      const result = await api.tmdbSearch(kind, query)
      if (!current) return
      if (!result.ok) {
        setHits([])
        setSearchStatus(result.error)
      } else {
        setHits(result.hits)
        setSearchStatus(result.hits.length ? '' : 'No results on TMDB')
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [addFlow, query, kind])

  if (!addFlow) return null

  const isGame = addFlow === 'game'
  const searching = !isGame && query.trim().length >= 2
  const candidates: Candidate[] = isGame
    ? snapshot.games.filter((g) => !entryFor(snapshot, 'game', g.id)).map((g) => ({ id: g.id, title: g.title, art: g.art, meta: g.version }))
    : searching
      ? hits.map((hit) => ({ id: tmdbKey(hit), title: hit.title, art: hit.posterUrl, meta: [hit.year, hit.rating ? `★ ${hit.rating}` : ''].filter(Boolean).join(' · ') }))
      : snapshot.shows.filter((s) => !entryFor(snapshot, 'show', s.id)).map((s) => ({ id: s.id, title: s.title, art: s.poster, meta: String(s.year) }))

  const close = () => {
    setSelected(null)
    setDraft({ input: '', shape: 'archive' })
    setQuery('')
    setHits([])
    setBusy(false)
    openAddFlow(null)
  }

  const submit = async () => {
    if (!selected) return
    const input = draft.input.trim()
    setBusy(true)
    let result
    if (isGame) result = await api.addGame(selected, input ? { input, shape: draft.shape } : undefined)
    else if (selected.startsWith('tmdb:')) {
      const [, hitKind, id] = selected.split(':')
      result = await api.addShowFromTmdb(hitKind as TmdbKind, Number(id), input || undefined)
    } else result = await api.addShow(selected, input || undefined)
    notify(result)
    if (result.ok) close()
    else setBusy(false)
  }

  return (
    <Modal title={isGame ? 'Add a game' : 'Add a show or movie'} onClose={close}>
      {!isGame && (
        <div className="source-fields" style={{ marginBottom: 16 }}>
          <input
            className="field"
            value={query}
            placeholder={kind === 'tv' ? 'Search TMDB for a show' : 'Search TMDB for a movie'}
            aria-label="Search TMDB"
            autoFocus
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(null)
            }}
          />
          <div className="segmented" role="radiogroup" aria-label="Search type">
            {(['tv', 'movie'] as TmdbKind[]).map((option) => (
              <button
                key={option}
                role="radio"
                aria-checked={kind === option}
                className={kind === option ? 'is-selected' : ''}
                onClick={() => {
                  setKind(option)
                  setSelected(null)
                }}
              >
                {option === 'tv' ? 'Shows' : 'Movies'}
              </button>
            ))}
          </div>
          {searchStatus && (
            <span className="muted" role="status" style={{ alignSelf: 'center', fontSize: 12 }}>
              {searchStatus}
            </span>
          )}
        </div>
      )}
      {candidates.length === 0 ? (
        !searching && <p className="muted">{isGame ? 'Everything in the catalog is already in your library.' : 'Search TMDB above, or everything in the catalog is already in your library.'}</p>
      ) : (
        <ul className="pick-grid">
          {candidates.map((c) => (
            <li key={c.id}>
              <button className={`pick${selected === c.id ? ' is-selected' : ''}`} onClick={() => setSelected(c.id)} aria-pressed={selected === c.id}>
                {c.art ? <img src={c.art} alt="" /> : <span style={{ display: 'block', aspectRatio: '2 / 3', background: 'var(--surface-2)', borderRadius: 2 }} />}
                <span className="pick__title">{c.title}</span>
                <span className="muted">{c.meta}</span>
                {selected === c.id && (
                  <span className="pick__tick">
                    <Icon name="check" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3 className="label">{isGame ? 'Source (optional)' : 'Folder (optional)'}</h3>
      {isGame ? (
        <SourceFields draft={draft} onChange={setDraft} />
      ) : (
        <div className="source-fields">
          <input className="field" value={draft.input} placeholder="Paste a folder path" onChange={(e) => setDraft({ ...draft, input: e.target.value })} />
          <button
            className="btn btn--ghost"
            onClick={async () => {
              const folder = await api.pickFolder()
              if (folder) setDraft({ ...draft, input: folder })
            }}
          >
            Browse
          </button>
        </div>
      )}
      <div className="row-end">
        <button className="btn btn--ghost" onClick={close}>
          Cancel
        </button>
        <button className="btn btn--primary" disabled={!selected || busy} onClick={submit}>
          {busy ? 'Adding…' : 'Add to library'}
        </button>
      </div>
    </Modal>
  )
}
