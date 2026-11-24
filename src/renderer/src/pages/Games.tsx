import { GameTile } from '../components/GameTile'
import { Icon } from '../components/Icon'
import { entryFor, jobForGame } from '../selectors'
import { useMist } from '../store'

export function Games() {
  const { snapshot, openAddFlow } = useMist()
  const owned = snapshot.games.filter((g) => entryFor(snapshot, 'game', g.id))
  const catalog = snapshot.games.filter((g) => !entryFor(snapshot, 'game', g.id))

  return (
    <div className="page">
      <header className="page__head">
        <h1>Games</h1>
        <button className="btn btn--ghost" onClick={() => openAddFlow('game')}>
          <Icon name="plus" /> Add game
        </button>
      </header>
      <section className="section">
        <h2 className="section__title">
          In library <span className="muted">{owned.length}</span>
        </h2>
        {owned.length === 0 ? (
          <p className="empty">No games in your library yet.</p>
        ) : (
          <div className="grid grid--dense">
            {owned.map((game) => (
              <GameTile key={game.id} game={game} entry={entryFor(snapshot, 'game', game.id)} job={jobForGame(snapshot.jobs, game.id)} />
            ))}
          </div>
        )}
      </section>
      {catalog.length > 0 && (
        <section className="section">
          <h2 className="section__title">
            Catalog <span className="muted">{catalog.length}</span>
          </h2>
          <div className="grid grid--dense">
            {catalog.map((game) => (
              <GameTile key={game.id} game={game} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
