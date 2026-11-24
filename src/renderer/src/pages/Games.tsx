import { GameTile } from '../components/GameTile'
import { entryFor, jobForGame, libraryGames } from '../selectors'
import { ui } from '../config'
import { useMist } from '../store'

/** Library home: a recent-games shelf, then every game as capsules. */
export function Games() {
  const { snapshot } = useMist()
  const recent = libraryGames(snapshot)
    .filter(({ entry }) => entry.lastPlayedAt !== undefined)
    .slice(0, ui.recentShelfCount)

  return (
    <div className="page">
      {recent.length > 0 && (
        <section className="section">
          <h2 className="shelf-title">Recent games</h2>
          <div className="grid grid--5">
            {recent.map(({ game, entry }) => (
              <GameTile key={game.id} game={game} entry={entry} job={jobForGame(snapshot.jobs, game.id)} />
            ))}
          </div>
        </section>
      )}
      <section className="section">
        <h2 className="shelf-title">
          All games <span>({snapshot.games.length})</span>
        </h2>
        <div className="grid grid--dense">
          {snapshot.games.map((game) => (
            <GameTile key={game.id} game={game} entry={entryFor(snapshot, 'game', game.id)} job={jobForGame(snapshot.jobs, game.id)} />
          ))}
        </div>
      </section>
    </div>
  )
}
