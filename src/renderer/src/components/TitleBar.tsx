// Custom title bar. Windows draws the native minimize / maximize / close
// buttons on the right (titleBarOverlay); this bar reserves their space.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ui } from '../config'
import { useMist } from '../store'
import { Icon } from './Icon'
import { Logo } from './Logo'

interface Result {
  id: string
  title: string
  kind: 'Game' | 'Show'
  art: string
  to: string
}

export function TitleBar() {
  const { snapshot } = useMist()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return [
      ...snapshot.games.map((g): Result => ({ id: g.id, title: g.title, kind: 'Game', art: g.art, to: `/games/${g.id}` })),
      ...snapshot.shows.map((s): Result => ({ id: s.id, title: s.title, kind: 'Show', art: s.poster, to: `/shows/${s.id}` }))
    ]
      .filter((r) => r.title.toLowerCase().includes(q))
      .slice(0, ui.searchResultLimit)
  }, [query, snapshot.games, snapshot.shows])

  const go = (result: Result) => {
    navigate(result.to)
    setQuery('')
    setOpen(false)
  }

  return (
    <header className="titlebar">
      <Logo />

      <div className="search no-drag">
        <Icon name="search" size={16} />
        <input
          value={query}
          placeholder="Search games, shows and movies"
          aria-label="Search library"
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) go(results[0])
            if (e.key === 'Escape') setQuery('')
          }}
        />
        {open && query && (
          <ul className="search__results" role="listbox">
            {results.length === 0 && <li className="search__empty">No matches</li>}
            {results.map((r) => (
              <li key={r.id}>
                <button onMouseDown={() => go(r)}>
                  <img src={r.art} alt="" />
                  <span>{r.title}</span>
                  <span className="muted">{r.kind}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="titlebar__end">
        <div className="avatar no-drag" aria-label="Local profile" title="Local profile">
          M
        </div>
      </div>
    </header>
  )
}
