// A section with nothing in it yet: a short title, an optional line of context and
// the actions that fill it. Used instead of placeholder art.
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export interface EmptyAction {
  label: string
  onClick(): void
  primary?: boolean
}

export function EmptyState({ icon, title, body, actions, children }: { icon: IconName; title: string; body?: ReactNode; actions: EmptyAction[]; children?: ReactNode }) {
  return (
    <section className="empty" aria-label={title} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 32px' }}>
      <span style={{ color: 'var(--accent)' }}>
        <Icon name={icon} size={32} />
      </span>
      <h2 style={{ margin: 0, fontSize: 20, color: 'var(--text)' }}>{title}</h2>
      {body && <p style={{ margin: 0, maxWidth: 480 }}>{body}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {actions.map((action) => (
          <button key={action.label} className={`btn ${action.primary ? 'btn--primary' : 'btn--ghost'}`} onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
      {children}
    </section>
  )
}
