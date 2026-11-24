import { AddCards, StillCard } from '../components/Cards'
import { GameTile } from '../components/GameTile'
import { continueWatching, jobForGame, libraryGames } from '../selectors'
import { ui } from '../config'
import { useMist } from '../store'

export function Home() {
  const { snapshot } = useMist()
  const games = libraryGames(snapshot)
  const watching = continueWatching(snapshot).slice(0, ui.continueWatchingCount)
  const libraryEmpty = snapshot.library.length === 0

  return (
    <div className="page">
      {games.length > 0 && (
        <section className="section">
          <h2 className="section__title">Your Library</h2>
          <div className="grid grid--5">
            {games.map(({ game, entry }) => (
              <GameTile key={entry.id} game={game} entry={entry} job={jobForGame(snapshot.jobs, game.id)} />
            ))}
          </div>
        </section>
      )}

      {watching.length > 0 && (
        <section className="section">
          <h2 className="section__title">Continue Watching</h2>
          <div className="grid grid--4">
            {watching.map((episode) => (
              <StillCard key={episode.id} episode={episode} />
            ))}
          </div>
        </section>
      )}

      {libraryEmpty && (
        <section className="section">
          <h2 className="section__title">Add Something</h2>
          <AddCards />
        </section>
      )}
    </div>
  )
}
