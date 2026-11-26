import type { DownloadJob } from '../../../shared/types'
import { formatBytes, formatPercent, formatSpeed, gameTitle } from '../selectors'
import { api, useMist } from '../store'

const STATE_LABEL: Record<DownloadJob['state'], string> = {
  queued: 'Queued',
  resolving: 'Resolving',
  downloading: 'Downloading',
  verifying: 'Verifying',
  extracting: 'Extracting',
  ready: 'Ready',
  paused: 'Paused',
  stalled: 'Stalled',
  failed: 'Failed',
  cancelled: 'Cancelled',
  blocked_host: 'HOST BLOCKED'
}

export function JobStatus({ job }: { job: DownloadJob }) {
  if (job.state === 'stalled') return <span className="text-amber">STALLED · {job.reason}</span>
  if (job.state === 'failed') return <span className="text-red">FAILED · {job.reason}</span>
  if (job.state === 'downloading') return <span className="muted">{formatSpeed(job.speedBps)}</span>
  return <span className="muted">{STATE_LABEL[job.state]}</span>
}

export function JobRow({ job }: { job: DownloadJob }) {
  const { snapshot } = useMist()
  return (
    <li className="job">
      <div className="job__main">
        <div className="job__line">
          <span className="job__title">{gameTitle(snapshot, job.gameId)}</span>
          <JobStatus job={job} />
        </div>
        <div className="progress" aria-label={`${formatPercent(job.progress)} downloaded`}>
          <div className="progress__fill" style={{ width: `${job.progress * 100}%` }} />
        </div>
        <div className="job__line muted">
          <span>
            {formatBytes(job.bytesDone)} of {formatBytes(job.bytesTotal)}
            {job.attempts > 0 && ` · attempt ${job.attempts + 1}`}
          </span>
          <span>{formatPercent(job.progress)}</span>
        </div>
      </div>
      <div className="job__actions">
        {job.state === 'failed' && (
          <button className="btn btn--primary btn--sm" onClick={() => api.retryJob(job.id)}>
            Retry
          </button>
        )}
        {job.state === 'paused' ? (
          <button className="btn btn--ghost btn--sm" onClick={() => api.resumeJob(job.id)}>
            Resume
          </button>
        ) : (
          job.state !== 'failed' &&
          job.state !== 'ready' &&
          job.state !== 'cancelled' && (
            <button className="btn btn--ghost btn--sm" onClick={() => api.pauseJob(job.id)}>
              Pause
            </button>
          )
        )}
        {job.state !== 'ready' && job.state !== 'cancelled' && (
          <button className="btn btn--ghost btn--sm" onClick={() => api.cancelJob(job.id)}>
            Cancel
          </button>
        )}
      </div>
    </li>
  )
}
