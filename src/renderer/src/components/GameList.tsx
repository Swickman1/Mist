// Steam-style library column: every game, grouped by install state, filterable.
import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { DownloadJob, Game, LibraryEntry } from '../../../shared/types'
import { entryFor, formatPercent, jobForGame, tileState } from '../selectors'
import { useMist } from '../store'
import { Icon } from './Icon'

interface Row {
  game: Game
  entry?: LibraryEntry
  job?: DownloadJob
}

const GROUPS = [
  { key: 'installed', label: 'Installed' },
  { key: 'active', label: 'Downloading' },
  { key: 'missing', label: 'Not installed' },
  { key: 'catalog', label: 'Catalog' }
] as const

type GroupKey = (typeof GROUPS)[number]['key']

function groupOf({ entry, job }: Row): GroupKey {
  if (!entry) return 'catalog'
  const state = tileState(entry, job)
  if (state === 'downloading' || state === 'paused') return 'active'
  if (state === 'missing') return 'missing'
  return 'installed'
}

function Status({ row }: { row: Row }) {
  if (!row.entry) return null
  const state = tileState(row.entry, row.job)
  if (state === 'downloading' && row.job) return <span className="gamelist__pct">{formatPercent(row.job.progress)}</span>
  if (state === 'paused') return <span className="muted">Paused</span>
  if (state === 'update') return <span className="text-amber">Update</span>
  return null
}

export function GameList() {
  const { snapshot, openAddFlow } = useMist()
  const [filter, setFilter] = useState('')

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const rows: Row[] = snapshot.games
      .filter((game) => game.title.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((game) => ({ game, entry: entryFor(snapshot, 'game', game.id), job: jobForGame(snapshot.jobs, game.id) }))
    return GROUPS.map((group) => ({ ...group, rows: rows.filter((row) => groupOf(row) === group.key) })).filter((g) => g.rows.length > 0)
  }, [snapshot, filter])

  return (
    <aside className="gamelist" aria-label="Game library">
      <div className="gamelist__head">
        <NavLink to="/games" end className={({ isActive }) => `gamelist__home${isActive ? ' is-active' : ''}`}>
          <Icon name="home" /> Library home
        </NavLink>
        <button className="icon-btn" title="Add game" onClick={() => openAddFlow('game')}>
          <Icon name="plus" />
        </button>
      </div>
      <div className="gamelist__filter">
        <Icon name="search" />
        <input value={filter} placeholder="Filter games" aria-label="Filter games" onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="gamelist__scroll">
        {groups.map((group) => (
          <section key={group.key}>
            <h3 className="gamelist__group">
              {group.label} <span>({group.rows.length})</span>
            </h3>
            <ul>
              {group.rows.map((row) => (
                <li key={row.game.id}>
                  <NavLink
                    to={`/games/${row.game.id}`}
                    className={({ isActive }) => `gamelist__row gamelist__row--${group.key}${isActive ? ' is-active' : ''}`}
                  >
                    <img src={row.game.art} alt="" />
                    <span className="gamelist__title">{row.game.title}</span>
                    <Status row={row} />
                  </NavLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 && <p className="gamelist__empty muted">No games match “{filter}”.</p>}
      </div>
    </aside>
  )
}
