import { PosterTile } from '../components/Cards'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { entryFor } from '../selectors'
import { useMist } from '../store'

export function Shows() {
  const { snapshot, openAddFlow } = useMist()

  return (
    <div className="page">
      <header className="page__head">
        <h1>Shows & Movies</h1>
        <button className="btn btn--ghost" onClick={() => openAddFlow('show')}>
          <Icon name="plus" /> Add show
        </button>
      </header>
      {snapshot.shows.length === 0 ? (
        <EmptyState
          icon="shows"
          title="Nothing here yet"
          body="Browse what is trending on TMDB, or add a show or movie you have on disk."
          actions={[{ label: 'Browse trending', primary: true, onClick: () => openAddFlow('show') }]}
        />
      ) : (
        <div className="grid grid--dense">
          {snapshot.shows.map((show) => (
            <PosterTile key={show.id} show={show} owned={entryFor(snapshot, 'show', show.id) !== undefined} />
          ))}
        </div>
      )}
    </div>
  )
}
