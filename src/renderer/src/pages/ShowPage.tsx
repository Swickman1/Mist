import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Stat } from '../components/Stat'
import { entryFor, episodeLabel, isInProgress, isWatched, nextEpisode } from '../selectors'
import { api, useMist } from '../store'

export function ShowPage() {
  const { id } = useParams()
  const { snapshot, openPlayer, notify } = useMist()
  const [refreshing, setRefreshing] = useState(false)
  const show = snapshot.shows.find((s) => s.id === id)
  if (!show) return <div className="page empty">Show not found.</div>

  const episodes = snapshot.episodes.filter((ep) => ep.showId === show.id)
  const next = nextEpisode(episodes)
  const resuming = next !== undefined && isInProgress(next)
  const onWatchlist = snapshot.watchlist.includes(show.id)
  const entry = entryFor(snapshot, 'show', show.id)
  const isMovie = episodes.length === 1
  const watchedCount = episodes.filter(isWatched).length

  return (
    <div className="page page--hero">
      <div className="hero">
        <img className="hero__art" src={show.hero} alt="" />
        <div className="hero__fade" />
        <div className="hero__content">
          <h1 className="hero__title">{show.title}</h1>
        </div>
      </div>

      <div className="playbar">
        <button className="btn btn--play btn--xl" disabled={!next} onClick={() => next && openPlayer(next.id)}>
          <Icon name="play" size={20} />
          {resuming ? `RESUME ${episodeLabel(next!)}` : 'PLAY'}
        </button>
        <div className="playbar__stats">
          <Stat label="Year" value={String(show.year)} />
          <Stat label="Rating" value={`★ ${show.rating.toFixed(1)}`} />
          <Stat label={isMovie ? 'Runtime' : 'Seasons'} value={isMovie ? `${Math.round(episodes[0].durationSec / 60)} min` : String(show.seasons.length)} />
          {!isMovie && <Stat label="Watched" value={`${watchedCount} of ${episodes.length}`} />}
        </div>
        <div className="playbar__tools">
          <button className="btn btn--ghost" onClick={() => api.toggleWatchlist(show.id)} aria-pressed={onWatchlist}>
            <Icon name={onWatchlist ? 'check' : 'plus'} />
            {onWatchlist ? 'On watchlist' : 'Add to watchlist'}
          </button>
          {!entry && (
            <button className="btn btn--ghost" onClick={async () => notify(await api.addShow(show.id))}>
              Add to library
            </button>
          )}
          {show.tmdbKind && (
            <button
              className="btn btn--ghost"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true)
                notify(await api.refreshMetadata(show.id))
                setRefreshing(false)
              }}
            >
              {refreshing ? 'Refreshing…' : 'Refresh metadata'}
            </button>
          )}
        </div>
      </div>

      <div className="page__body">
        {show.seasons.map((season) => (
          <section key={season} className="block">
            <h2 className="section__title">Season {season}</h2>
            <ol className="episodes">
              {episodes
                .filter((ep) => ep.season === season)
                .map((ep) => {
                  const watched = isWatched(ep)
                  return (
                    <li key={ep.id}>
                      <button className="episode" onClick={() => openPlayer(ep.id)}>
                        <img className="episode__still" src={ep.still} alt="" />
                        <span className="episode__num muted">{ep.episode}</span>
                        <span className="episode__info">
                          <span className="episode__title">{ep.title}</span>
                          <span className="muted">{Math.round(ep.durationSec / 60)} min</span>
                          <span className="episode__bar">
                            <span style={{ width: `${(ep.positionSec / ep.durationSec) * 100}%` }} />
                          </span>
                        </span>
                        <span className={`episode__tick${watched ? ' is-watched' : ''}`} aria-label={watched ? 'Watched' : 'Not watched'}>
                          {watched && <Icon name="check" />}
                        </span>
                      </button>
                    </li>
                  )
                })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}
