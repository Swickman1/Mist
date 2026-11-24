// Global overlay pinned to the window bottom. Lives outside the routes so it
// survives navigation. Collapsed it is passive: it never takes focus and the
// main view reserves its height so the last row is never covered.
import { useState } from 'react'
import { formatPercent, formatSpeed, gameTitle, isRunning, visibleJobs } from '../selectors'
import { api, useMist } from '../store'
import { Icon } from './Icon'
import { JobRow, JobStatus } from './JobRow'

export function DownloadBar() {
  const { snapshot } = useMist()
  const [expanded, setExpanded] = useState(false)
  const jobs = visibleJobs(snapshot.jobs)
  if (jobs.length === 0) return null

  const current = jobs.find(isRunning) ?? jobs[0]
  const totalSpeed = jobs.reduce((sum, job) => sum + job.speedBps, 0)
  const finished = snapshot.jobs.filter((job) => job.state === 'ready').length

  return (
    <section className={`dlbar${expanded ? ' is-expanded' : ''}`} aria-label="Downloads" aria-live="off">
      <button className="dlbar__head" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        {expanded ? (
          <>
            <span className="dlbar__name">
              Downloads · {formatSpeed(totalSpeed)} · {jobs.indexOf(current) + 1} of {jobs.length}
            </span>
            <span className="muted">{finished} completed this session</span>
          </>
        ) : (
          <>
            <span className="dlbar__name">{gameTitle(snapshot, current.gameId)}</span>
            <span className="dlbar__pct">{formatPercent(current.progress)}</span>
            <JobStatus job={current} />
            <div className="dlbar__mini">
              <div className="progress__fill" style={{ width: `${current.progress * 100}%` }} />
            </div>
          </>
        )}
        <span className="dlbar__chevron">
          <Icon name={expanded ? 'chevronDown' : 'chevronUp'} />
        </span>
      </button>
      {expanded && (
        <>
          <div className="dlbar__toolbar">
            <button className="btn btn--ghost btn--sm" onClick={() => api.pauseAll()}>
              Pause all
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => api.cancelAll()}>
              Cancel all
            </button>
          </div>
          <ul className="dlbar__list">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
