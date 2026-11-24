// Shared cards used by Home, Library and the Shows section.
import { useNavigate } from 'react-router-dom'
import type { Episode, Show } from '../../../shared/types'
import { episodeLabel } from '../selectors'
import { useMist } from '../store'
import { Icon } from './Icon'

/** 16:9 still for an in-progress episode or movie; click resumes it. */
export function StillCard({ episode }: { episode: Episode }) {
  const { snapshot, openPlayer } = useMist()
  const show = snapshot.shows.find((s) => s.id === episode.showId)!
  const isMovie = snapshot.episodes.filter((ep) => ep.showId === show.id).length === 1
  const remainingMin = Math.round((episode.durationSec - episode.positionSec) / 60)

  return (
    <button className="still" onClick={() => openPlayer(episode.id)}>
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
      <span className="muted">{isMovie ? `Movie · ${remainingMin} min left` : `${episodeLabel(episode)} · ${episode.title}`}</span>
    </button>
  )
}

/** 2:3 poster for a show or movie. */
export function PosterTile({ show, owned, meta }: { show: Show; owned: boolean; meta?: string }) {
  const { snapshot } = useMist()
  const navigate = useNavigate()
  return (
    <div className={`tile${owned ? '' : ' is-unowned'}`}>
      <button className="tile__cover" onClick={() => navigate(`/shows/${show.id}`)} aria-label={show.title}>
        <img src={show.poster} alt="" draggable={false} />
        {snapshot.watchlist.includes(show.id) && <span className="chip chip--state">WATCHLIST</span>}
      </button>
      <span className="tile__title">{show.title}</span>
      <span className="tile__meta muted">{meta ?? `${show.year} · ★ ${show.rating.toFixed(1)}`}</span>
    </div>
  )
}

/** Shown while the library is empty: entry points into the add flow. */
export function AddCards() {
  const { openAddFlow } = useMist()
  return (
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
  )
}
