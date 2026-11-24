import { AddCards, PosterTile, StillCard } from '../components/Cards'
import { GameTile } from '../components/GameTile'
import { Icon } from '../components/Icon'
import { continueWatching, isWatched, jobForGame, libraryGames } from '../selectors'
import { useMist } from '../store'

/** Everything you own: what you were watching, your games, your shows and movies. */
export function Library() {
  const { snapshot, openAddFlow } = useMist()
  const watching = continueWatching(snapshot)
  const games = libraryGames(snapshot)
  const shows = snapshot.library
    .filter((entry) => entry.kind === 'show')
    .sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt))
    .map((entry) => snapshot.shows.find((s) => s.id === entry.refId)!)

  const showMeta = (showId: string): string => {
    const episodes = snapshot.episodes.filter((ep) => ep.showId === showId)
    if (episodes.length === 1) return isWatched(episodes[0]) ? 'Movie · Watched' : 'Movie'
    return `${episodes.filter(isWatched).length} of ${episodes.length} watched`
  }

  return (
    <div className="page">
      <header className="page__head">
        <h1>Library</h1>
        <div className="actions">
          <button className="btn btn--ghost" onClick={() => openAddFlow('game')}>
            <Icon name="plus" /> Add game
          </button>
          <button className="btn btn--ghost" onClick={() => openAddFlow('show')}>
            <Icon name="plus" /> Add show or movie
          </button>
        </div>
      </header>

      {snapshot.library.length === 0 && <AddCards />}

      {watching.length > 0 && (
        <section className="section">
          <h2 className="section__title">
            Continue watching <span>({watching.length})</span>
          </h2>
          <div className="grid grid--stills">
            {watching.map((episode) => (
              <StillCard key={episode.id} episode={episode} />
            ))}
          </div>
        </section>
      )}

      {shows.length > 0 && (
        <section className="section">
          <h2 className="section__title">
            Shows & movies <span>({shows.length})</span>
          </h2>
          <div className="grid grid--dense">
            {shows.map((show) => (
              <PosterTile key={show.id} show={show} owned meta={showMeta(show.id)} />
            ))}
          </div>
        </section>
      )}

      {games.length > 0 && (
        <section className="section">
          <h2 className="section__title">
            Games <span>({games.length})</span>
          </h2>
          <div className="grid grid--dense">
            {games.map(({ game, entry }) => (
              <GameTile key={entry.id} game={game} entry={entry} job={jobForGame(snapshot.jobs, game.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
