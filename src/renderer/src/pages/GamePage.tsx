import { useParams } from 'react-router-dom'
import type { DownloadJob, LibraryEntry } from '../../../shared/types'
import { AddSourcePanel, type SourceDraft } from '../components/AddSourcePanel'
import { Icon } from '../components/Icon'
import { Stat } from '../components/Stat'
import { entryFor, formatBytes, formatHours, formatPercent, jobForGame, sourceLabel, wasInstalled } from '../selectors'
import { api, useMist } from '../store'

type Primary = { label: string; action: () => void; tone: 'play' | 'install' | 'busy' }

function primaryFor(gameId: string, entry: LibraryEntry | undefined, job: DownloadJob | undefined, play: () => void): Primary {
  if (job?.state === 'paused') return { label: 'PAUSED', action: () => api.resumeJob(job.id), tone: 'install' }
  if (job?.state === 'failed') return { label: 'REPAIR', action: () => api.retryJob(job.id), tone: 'install' }
  if (job) return { label: `DOWNLOADING ${formatPercent(job.progress)}`, action: () => api.pauseJob(job.id), tone: 'busy' }
  if (!entry) return { label: 'INSTALL', action: () => api.install(gameId), tone: 'install' }
  if (entry.state === 'missing') return { label: wasInstalled(entry) ? 'REPAIR' : 'INSTALL', action: () => api.install(gameId), tone: 'install' }
  return { label: 'PLAY', action: play, tone: 'play' }
}

function formatLastPlayed(at: number | undefined): string {
  if (!at) return 'Never'
  const days = Math.floor((Date.now() - at) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function GamePage() {
  const { id } = useParams()
  const { snapshot, notify } = useMist()
  const game = snapshot.games.find((g) => g.id === id)
  if (!game) return <div className="page empty">Game not found.</div>

  const entry = entryFor(snapshot, 'game', game.id)
  const job = jobForGame(snapshot.jobs, game.id)
  const installed = entry?.state === 'ready' || entry?.state === 'update'
  const play = async () => entry && notify(await api.play(entry.id))
  const primary = primaryFor(game.id, entry, job, play)

  const onPrimary = () => {
    if (primary.label === 'INSTALL' && !game.source) return notify({ ok: false, message: 'Add a source before installing' })
    primary.action()
  }

  const saveSource = async (draft: SourceDraft) => notify(await api.setSource(game.id, draft.input.trim(), draft.shape))

  return (
    <div className="page page--hero">
      <div className="hero">
        <img className="hero__art" src={game.hero} alt="" />
        <div className="hero__fade" />
        <div className="hero__content">
          <h1 className="hero__title">{game.title}</h1>
        </div>
      </div>

      <div className="playbar">
        <button className={`btn btn--${primary.tone} btn--xl`} onClick={onPrimary} title={primary.tone === 'busy' ? 'Click to pause' : undefined}>
          {primary.tone === 'play' && <Icon name="play" size={20} />}
          {primary.tone === 'install' && <Icon name="downloads" size={20} />}
          {primary.label}
        </button>
        {job && job.state !== 'failed' && (
          <div className="playbar__progress">
            <div className="progress__fill" style={{ width: `${job.progress * 100}%` }} />
          </div>
        )}
        <div className="playbar__stats">
          <Stat label="Last played" value={formatLastPlayed(entry?.lastPlayedAt)} />
          <Stat label="Play time" value={entry && entry.playtimeSec > 0 ? formatHours(entry.playtimeSec) : '—'} />
          <Stat label="Size" value={formatBytes(game.sizeBytes)} />
          <Stat label="Version" value={game.version} />
        </div>
        <div className="playbar__tools">
          {entry?.state === 'update' && !job && (
            <button className="btn btn--ghost" onClick={() => api.install(game.id)}>
              Update
            </button>
          )}
          {entry && (
            <button
              className="btn btn--ghost"
              onClick={() => {
                api.removeEntry(entry.id)
                notify(`${game.title} uninstalled`)
              }}
            >
              Uninstall
            </button>
          )}
        </div>
      </div>
      {job?.state === 'failed' && <p className="playbar__error text-red">{job.reason}</p>}

      <div className="page__body page__body--split">
        <div className="page__main">
          {!game.source && <AddSourcePanel onSubmit={saveSource} />}

          <section className="block">
            <h2 className="shelf-title">About</h2>
            <p className="prose">{game.description}</p>
          </section>

          <section className="block row">
            <div>
              <h2 className="shelf-title">Save files</h2>
              <p className="muted">{installed ? `${entry!.path}\\Saves` : 'No save files until the game is installed'}</p>
            </div>
            <button className="btn btn--ghost" disabled={!installed} onClick={async () => notify(await api.backupSaves(game.id))}>
              Back up
            </button>
          </section>
        </div>

        <aside className="block details">
          <h2 className="shelf-title">Details</h2>
          <dl>
            <dt>Source</dt>
            <dd title={game.source}>{sourceLabel(game)}</dd>
            <dt>Shape</dt>
            <dd>{game.shape ?? '—'}</dd>
            <dt>Launches</dt>
            <dd>{game.exeHint ?? '—'}</dd>
            <dt>Install path</dt>
            <dd>{entry?.path ?? 'Not installed'}</dd>
          </dl>
          {game.vetted && (
            <button className="verified" title="Re-verify files" onClick={async () => notify(await api.verifyGame(game.id))}>
              <Icon name="shield" /> Hash verified
            </button>
          )}
        </aside>
      </div>
    </div>
  )
}
