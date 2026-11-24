import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { entryFor } from '../selectors'
import { useMist } from '../store'

export function Shows() {
  const { snapshot, openAddFlow } = useMist()
  const navigate = useNavigate()

  return (
    <div className="page">
      <header className="page__head">
        <h1>Shows & Movies</h1>
        <button className="btn btn--ghost" onClick={() => openAddFlow('show')}>
          <Icon name="plus" /> Add show
        </button>
      </header>
      <div className="grid grid--dense">
        {snapshot.shows.map((show) => {
          const owned = entryFor(snapshot, 'show', show.id)
          return (
            <div key={show.id} className={`tile${owned ? '' : ' is-unowned'}`}>
              <button className="tile__cover" onClick={() => navigate(`/shows/${show.id}`)} aria-label={show.title}>
                <img src={show.poster} alt="" draggable={false} />
                {snapshot.watchlist.includes(show.id) && <span className="chip chip--state">WATCHLIST</span>}
              </button>
              <span className="tile__title">{show.title}</span>
              <span className="tile__meta muted">
                {show.year} · ★ {show.rating.toFixed(1)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
