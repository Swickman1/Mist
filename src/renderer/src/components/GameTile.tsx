import { useNavigate } from 'react-router-dom'
import type { DownloadJob, Game, LibraryEntry } from '../../../shared/types'
import { formatPercent, tileState, type TileState } from '../selectors'
import { api, useMist } from '../store'
import { Icon } from './Icon'

export function StateChip({ state, job }: { state: TileState; job?: DownloadJob }) {
  const label = state === 'downloading' && job ? `DOWNLOADING ${formatPercent(job.progress)}` : state.toUpperCase()
  return <span className={`chip chip--state chip--${state}`}>{label}</span>
}

export function GameTile({ game, entry, job }: { game: Game; entry?: LibraryEntry; job?: DownloadJob }) {
  const navigate = useNavigate()
  const { notify } = useMist()
  const state = entry ? tileState(entry, job) : undefined
  const playable = state === 'ready' || state === 'update'

  const onGlyph = async (event: React.MouseEvent) => {
    event.stopPropagation()
    if (entry && playable) notify(await api.play(entry.id))
    else navigate(`/games/${game.id}`)
  }

  return (
    <div className={`tile${state === 'missing' ? ' is-missing' : ''}`}>
      <button className="tile__cover" onClick={() => navigate(`/games/${game.id}`)} aria-label={game.title}>
        <img src={game.art} alt="" draggable={false} />
        {state && <StateChip state={state} job={job} />}
        {state === 'downloading' && job && (
          <div className="tile__progress">
            <div className="progress__fill" style={{ width: `${job.progress * 100}%` }} />
          </div>
        )}
        <span className="tile__glyph" role="button" aria-label={playable ? `Play ${game.title}` : `Open ${game.title}`} onClick={onGlyph}>
          <Icon name="play" size={20} />
        </span>
      </button>
      <span className="tile__title">{game.title}</span>
    </div>
  )
}
