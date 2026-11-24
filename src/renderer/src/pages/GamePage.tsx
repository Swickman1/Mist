import { useNavigate, useParams } from 'react-router-dom'
import type { DownloadJob, LibraryEntry } from '../../../shared/types'
import { AddSourcePanel, type SourceDraft } from '../components/AddSourcePanel'
import { Icon } from '../components/Icon'
import { entryFor, formatBytes, formatHours, formatPercent, jobForGame, sourceLabel, wasInstalled } from '../selectors'
import { api, useMist } from '../store'

type Primary = { label: string; action: () => void; busy?: boolean }

function primaryFor(gameId: string, entry: LibraryEntry | undefined, job: DownloadJob | undefined, play: () => void): Primary {
  if (job?.state === 'paused') return { label: 'PAUSED', action: () => api.resumeJob(job.id) }
  if (job?.state === 'failed') return { label: 'REPAIR', action: () => api.retryJob(job.id) }
  if (job) return { label: `DOWNLOADING ${formatPercent(job.progress)}`, action: () => api.pauseJob(job.id), busy: true }
  if (!entry) return { label: 'INSTALL', action: () => api.install(gameId) }
  if (entry.state === 'missing') return { label: wasInstalled(entry) ? 'REPAIR' : 'INSTALL', action: () => api.install(gameId) }
  return { label: 'PLAY', action: play }
}

export function GamePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { snapshot, notify } = useMist()
  const game = snapshot.games.find((g) => g.id === id)
  if (!game) return <div className="page empty">Game not found.</div>

  const entry = entryFor(snapshot, 'game', game.id)
  const job = jobForGame(snapshot.jobs, game.id)
  const installed = entry?.state === 'ready' || entry?.state === 'update'
  const play = async () => entry && notify(await api.play(entry.id))
  const primary = primaryFor(game.id, entry, job, play)

  const install = () => {
    if (!game.source) return notify({ ok: false, message: 'Add a source before installing' })
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
          <div className="chips">
            <span className="chip">v{game.version}</span>
            <span className="chip">{formatBytes(game.sizeBytes)}</span>
            <span className="chip" title={game.source}>
              {sourceLabel(game)}
            </span>
            {game.vetted && (
              <button className="chip chip--verified" title="Re-verify files" onClick={async () => notify(await api.verifyGame(game.id))}>
                <Icon name="shield" size={12} /> Hash verified
              </button>
            )}
            {entry && entry.playtimeSec > 0 && <span className="chip">{formatHours(entry.playtimeSec)} played</span>}
          </div>
          <div className="actions">
            <button
              className={`btn btn--primary btn--lg${primary.busy ? ' is-busy' : ''}`}
              onClick={primary.label === 'INSTALL' ? install : primary.action}
              title={primary.busy ? 'Click to pause' : undefined}
            >
              {primary.label === 'PLAY' && <Icon name="play" />}
              {primary.label}
            </button>
            {entry?.state === 'update' && !job && (
              <button className="btn btn--ghost btn--lg" onClick={() => api.install(game.id)}>
                Update
              </button>
            )}
            {entry && (
              <button
                className="btn btn--ghost btn--lg"
                onClick={() => {
                  api.removeEntry(entry.id)
                  notify(`${game.title} uninstalled`)
                }}
              >
                Uninstall
              </button>
            )}
          </div>
          {job?.state === 'failed' && <p className="text-red">{job.reason}</p>}
        </div>
      </div>

      <div className="page__body">
        {!game.source && <AddSourcePanel onSubmit={saveSource} />}

        <section className="block">
          <h2 className="section__title">About</h2>
          <p className="prose">{game.description}</p>
          {game.exeHint && <p className="muted">Launches {game.exeHint}</p>}
        </section>

        <section className="block row">
          <div>
            <h2 className="section__title">Save files</h2>
            <p className="muted">{installed ? `${entry!.path}\\Saves` : 'No save files until the game is installed'}</p>
          </div>
          <button className="btn btn--ghost" disabled={!installed} onClick={async () => notify(await api.backupSaves(game.id))}>
            Back up
          </button>
        </section>

        <button className="link" onClick={() => navigate(-1)}>
          ← Back
        </button>
      </div>
    </div>
  )
}
