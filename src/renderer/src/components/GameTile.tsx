import { useNavigate } from 'react-router-dom'
import type { DownloadJob, Game, LibraryEntry } from '../../../shared/types'
import { formatPercent, tileState, type TileState } from '../selectors'
import { api, useMist } from '../store'
import { Icon } from './Icon'

export type ChipState = TileState | 'blocked' | 'install'

export function StateChip({
  state,
  job,
  inline,
  label,
  onClick,
  title
}: {
  state: ChipState
  job?: DownloadJob
  inline?: boolean
  label?: string
  onClick?: (event: React.MouseEvent) => void
  title?: string
}) {
  const text = label ?? (state === 'downloading' && job ? `DOWNLOADING ${formatPercent(job.progress)}` : state.toUpperCase())
  const className = `chip chip--state chip--${state}${inline ? ' chip--inline' : ''}`
  if (onClick) {
    return (
      <button className={className} onClick={onClick} title={title}>
        {text}
      </button>
    )
  }
  return <span className={className}>{text}</span>
}

export function GameTile({
  game,
  entry,
  job,
  meta,
  chip,
  className
}: {
  game: Game
  entry?: LibraryEntry
  job?: DownloadJob
  meta?: string
  chip?: { state: ChipState; label?: string; onClick?: (event: React.MouseEvent) => void; title?: string }
  className?: string
}) {
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
    <div className={`tile${state === 'missing' ? ' is-missing' : ''}${className ? ` ${className}` : ''}`}>
      <button className="tile__cover" onClick={() => navigate(`/games/${game.id}`)} aria-label={game.title}>
        <img src={game.art} alt="" draggable={false} />
        {chip ? <StateChip state={chip.state} label={chip.label} onClick={chip.onClick} title={chip.title} /> : state && <StateChip state={state} job={job} />}
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
      {meta && <span className="tile__meta muted">{meta}</span>}
    </div>
  )
}
