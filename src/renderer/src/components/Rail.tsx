import { NavLink } from 'react-router-dom'
import { visibleJobs } from '../selectors'
import { useMist } from '../store'
import { Icon, type IconName } from './Icon'

function RailItem({ to, icon, label, badge, end }: { to: string; icon: IconName; label: string; badge?: number; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `rail__item${isActive ? ' is-active' : ''}`} title={label}>
      <Icon name={icon} />
      <span className="rail__label">{label}</span>
      {badge ? <span className="rail__badge">{badge}</span> : null}
    </NavLink>
  )
}

export function Rail() {
  const { snapshot, railCollapsed, toggleRail } = useMist()
  const activeCount = visibleJobs(snapshot.jobs).length

  return (
    <nav className={`rail${railCollapsed ? ' is-collapsed' : ''}`} aria-label="Primary">
      <RailItem to="/" end icon="home" label="Home" />
      <RailItem to="/games" icon="games" label="Games" />
      <RailItem to="/shows" icon="shows" label="Shows & Movies" />
      <div className="rail__divider" />
      <RailItem to="/downloads" icon="downloads" label="Downloads" badge={activeCount} />
      <div className="rail__spacer" />
      <RailItem to="/settings" icon="settings" label="Settings" />
      <button className="rail__item rail__toggle" onClick={toggleRail} title={railCollapsed ? 'Expand rail' : 'Collapse rail'}>
        <Icon name={railCollapsed ? 'expand' : 'collapse'} />
        <span className="rail__label">Collapse</span>
      </button>
    </nav>
  )
}
