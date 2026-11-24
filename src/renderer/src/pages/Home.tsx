import { GameTile } from '../components/GameTile'
import { Icon } from '../components/Icon'
import { continueWatching, episodeLabel, jobForGame, libraryGames } from '../selectors'
import { ui } from '../config'
import { useMist } from '../store'

export function Home() {
  const { snapshot, openPlayer, openAddFlow } = useMist()
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
            {watching.map((episode) => {
              const show = snapshot.shows.find((s) => s.id === episode.showId)!
              return (
                <button key={episode.id} className="still" onClick={() => openPlayer(episode.id)}>
                  <div className="still__frame">
                    <img src={episode.still} alt="" />
                    <span className="still__glyph">
                      <Icon name="play" size={20} />
                    </span>
                    <div className="still__progress">
                      <div style={{ width: `${(episode.positionSec / episode.durationSec) * 100}%` }} />
                    </div>
                  </div>
                  <span className="still__title">{show.title}</span>
                  <span className="muted">
                    {episodeLabel(episode)} · {episode.title}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {libraryEmpty && (
        <section className="section">
          <h2 className="section__title">Add Something</h2>
          <div className="add-cards">
            <button className="add-card" onClick={() => openAddFlow('game')}>
              <Icon name="games" size={32} />
              <span className="add-card__title">Add a game</span>
              <span className="muted">Point Mist at an archive, installer or folder you own.</span>
            </button>
            <button className="add-card" onClick={() => openAddFlow('show')}>
              <Icon name="shows" size={32} />
              <span className="add-card__title">Add a show or movie</span>
              <span className="muted">Pick a folder of episodes or a single film.</span>
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
