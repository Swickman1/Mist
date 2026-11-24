import { JobRow } from '../components/JobRow'
import { formatSpeed, visibleJobs } from '../selectors'
import { api, useMist } from '../store'

export function Downloads() {
  const { snapshot } = useMist()
  const active = visibleJobs(snapshot.jobs)
  const finished = snapshot.jobs.filter((job) => job.state === 'ready' || job.state === 'cancelled').sort((a, b) => b.createdAt - a.createdAt)
  const speed = active.reduce((sum, job) => sum + job.speedBps, 0)

  return (
    <div className="page">
      <header className="page__head">
        <h1>Downloads</h1>
        {active.length > 0 && (
          <div className="actions">
            <span className="muted">
              {formatSpeed(speed)} · {active.length} active · {snapshot.settings.concurrentDownloads} at a time
            </span>
            <button className="btn btn--ghost" onClick={() => api.pauseAll()}>
              Pause all
            </button>
            <button className="btn btn--ghost" onClick={() => api.cancelAll()}>
              Cancel all
            </button>
          </div>
        )}
      </header>
      <section className="section">
        <h2 className="section__title">Queue</h2>
        {active.length === 0 ? (
          <p className="empty">Nothing downloading.</p>
        ) : (
          <ul className="job-list">
            {active.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        )}
      </section>
      {finished.length > 0 && (
        <section className="section">
          <h2 className="section__title">History</h2>
          <ul className="job-list">
            {finished.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
