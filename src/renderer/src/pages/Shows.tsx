import { PosterTile } from '../components/Cards'
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
      <div className="grid grid--dense">
        {snapshot.shows.map((show) => (
          <PosterTile key={show.id} show={show} owned={entryFor(snapshot, 'show', show.id) !== undefined} />
        ))}
      </div>
    </div>
  )
}
