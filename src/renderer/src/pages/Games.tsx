// Games: one big browsable catalog. A featured spotlight, then every game
// with filter / sort controls.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Game } from '../../../shared/types'
import { EmptyState } from '../components/EmptyState'
import { GameTile, StateChip, type ChipState } from '../components/GameTile'
import { Icon } from '../components/Icon'
import { ui } from '../config'
import { entryFor, formatBytes, jobForGame, tileState } from '../selectors'
import { api, useMist } from '../store'

const PAGE_SIZE = 60

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'owned', label: 'In library' },
  { key: 'unowned', label: 'Not in library' }
] as const

const SORTS = [
  { key: 'title', label: 'Title A–Z', compare: (a: Game, b: Game) => a.title.localeCompare(b.title) },
  { key: 'newest', label: 'Recently added', compare: (a: Game, b: Game) => b.addedAt - a.addedAt },
  { key: 'size', label: 'Largest first', compare: (a: Game, b: Game) => b.sizeBytes - a.sizeBytes }
] as const

type FilterKey = (typeof FILTERS)[number]['key']
type SortKey = (typeof SORTS)[number]['key']

function hostFor(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

function hostInList(host: string, allowed: readonly string[]): boolean {
  const clean = host.toLowerCase().replace(/\.$/, '')
  return allowed.some((candidate) => clean === candidate || clean.endsWith(`.${candidate}`))
}

function Spotlight({ games }: { games: Game[] }) {
  const { snapshot } = useMist()
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % games.length), ui.spotlightRotateMs)
    return () => clearInterval(timer)
  }, [games.length, index])

  const game = games[index]
  const entry = entryFor(snapshot, 'game', game.id)
  const job = jobForGame(snapshot.jobs, game.id)

  return (
    <section className="spotlight" aria-label="Featured games">
      <button className="spotlight__main" onClick={() => navigate(`/games/${game.id}`)}>
        <img key={game.id} className="spotlight__art" src={game.hero} alt="" />
        <div className="spotlight__fade" />
        <div className="spotlight__content">
          <span className="spotlight__eyebrow">Featured</span>
          <h2 className="spotlight__title">{game.title}</h2>
          <p className="spotlight__desc">{game.description}</p>
          <div className="spotlight__meta">
            <span>v{game.version}</span>
            <span>{formatBytes(game.sizeBytes)}</span>
            {entry && <StateChip state={tileState(entry, job)} job={job} inline />}
          </div>
        </div>
      </button>
      <div className="spotlight__thumbs" role="tablist">
        {games.map((g, i) => (
          <button key={g.id} role="tab" aria-selected={i === index} className={`spotlight__thumb${i === index ? ' is-active' : ''}`} onClick={() => setIndex(i)} title={g.title}>
            <img src={g.hero} alt="" />
          </button>
        ))}
      </div>
    </section>
  )
}

export function Games() {
  const { snapshot, openAddFlow, notify } = useMist()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sort, setSort] = useState<SortKey>('title')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)

  useEffect(() => {
    setLimit(PAGE_SIZE)
  }, [filter, sort, query])

  const featured = useMemo(
    () => [...snapshot.games].filter((game) => game.origin !== 'index').sort((a, b) => b.addedAt - a.addedAt).slice(0, ui.spotlightCount),
    [snapshot.games]
  )

  const games = useMemo(() => {
    const q = query.trim().toLowerCase()
    const owned = (g: Game) => entryFor(snapshot, 'game', g.id) !== undefined
    const sorted = snapshot.games
      .filter((g) => g.title.toLowerCase().includes(q))
      .filter((g) => filter === 'all' || (filter === 'owned') === owned(g))
      .sort(SORTS.find((s) => s.key === sort)!.compare)
    const library = sorted.filter((game) => owned(game))
    const index = sorted.filter((game) => !owned(game) && game.origin === 'index')
    const rest = sorted.filter((game) => !owned(game) && game.origin !== 'index')
    return [...library, ...index, ...rest]
  }, [snapshot, filter, sort, query])

  const visibleGames = games.slice(0, limit)

  async function allowHost(host: string): Promise<void> {
    const hosts = new Set(snapshot.settings.downloadHosts)
    hosts.add(host)
    notify(await api.setDownloadHosts([...hosts].join('\n')))
  }

  function chipFor(game: Game): { state: ChipState; label: string; title?: string; onClick?: (event: React.MouseEvent) => void } | undefined {
    const entry = entryFor(snapshot, 'game', game.id)
    const job = jobForGame(snapshot.jobs, game.id)
    if (entry) return { state: tileState(entry, job), label: tileState(entry, job).toUpperCase() }

    if (game.origin === 'index') {
      const host = hostFor(game.source)
      const allowed = host ? hostInList(host, snapshot.settings.downloadHosts) : false
      if (host && !allowed) {
        // GitHub hosts in this first bundled file are already in SUGGESTED_DOWNLOAD_HOSTS;
        // this chip exists for future files that list other hosts.
        return {
          state: 'blocked',
          label: 'HOST BLOCKED',
          title: `Allow ${host}`,
          onClick: (event) => {
            event.stopPropagation()
            if (window.confirm(`Allow downloads from ${host}?`)) void allowHost(host)
          }
        }
      }
    }
    return { state: 'install', label: 'INSTALL' }
  }

  if (snapshot.games.length === 0) {
    return (
      <div className="page">
        <EmptyState
          icon="games"
          title="Nothing here yet"
          body="Find a game on the Steam store to add its details, then point it at your own files."
          actions={[{ label: 'Search Steam', primary: true, onClick: () => openAddFlow('game') }]}
        />
      </div>
    )
  }

  return (
    <div className="page">
      {featured.length > 0 && <Spotlight games={featured} />}

      <section className="section">
        <div className="toolbar">
          <h2 className="section__title">Browse games <span>({games.length})</span></h2>
          <div className="toolbar__controls">
            <div className="toolbar__search">
              <Icon name="search" />
              <input value={query} placeholder="Filter catalog" aria-label="Filter catalog" onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="segmented" role="radiogroup" aria-label="Show">
              {FILTERS.map((f) => (
                <button key={f.key} role="radio" aria-checked={filter === f.key} className={filter === f.key ? 'is-selected' : ''} onClick={() => setFilter(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <button className="btn btn--ghost" onClick={() => openAddFlow('game')}>
              <Icon name="plus" /> Add game
            </button>
          </div>
        </div>
        {games.length === 0 ? (
          <p className="empty">No games match these filters.</p>
        ) : (
            <div className="grid grid--catalog">
              {visibleGames.map((game) => (
                <GameTile
                  key={game.id}
                  game={game}
                  entry={entryFor(snapshot, 'game', game.id)}
                  job={jobForGame(snapshot.jobs, game.id)}
                  chip={chipFor(game)}
                  className={!entryFor(snapshot, 'game', game.id) && game.origin === 'index' ? 'is-unowned' : undefined}
                  meta={[game.sizeBytes > 0 ? formatBytes(game.sizeBytes) : undefined, game.version !== '—' ? `v${game.version}` : undefined].filter(Boolean).join(' · ')}
                />
              ))}
              {games.length > visibleGames.length && (
                <button className="tile tile--more" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
                  <span className="tile__more">Show 60 more</span>
                </button>
              )}
            </div>
          )}
      </section>
    </div>
  )
}
