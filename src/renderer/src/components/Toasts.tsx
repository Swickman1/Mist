import { useMist } from '../store'

export function Toasts() {
  const { toasts } = useMist()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.tone === 'error' ? ' toast--error' : ''}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
