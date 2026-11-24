import type { ReactNode } from 'react'
import { THEMES, type Settings as SettingsShape, type Theme } from '../../../shared/types'
import { formatBytes } from '../selectors'
import { api, useMist } from '../store'

const THEME_LABEL: Record<Theme, string> = { mist: 'Mist', midnight: 'Midnight' }

type PathKey ='libraryPath' | 'stagingPath' | 'saveBackupPath'

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting__label">
        <span>{label}</span>
        {hint && <span className="muted">{hint}</span>}
      </div>
      <div className="setting__control">{children}</div>
    </div>
  )
}

function PathRow({ label, hint, field, settings }: { label: string; hint: string; field: PathKey; settings: SettingsShape }) {
  return (
    <Row label={label} hint={hint}>
      <input
        key={settings[field]}
        className="field"
        defaultValue={settings[field]}
        aria-label={label}
        onBlur={(e) => e.target.value !== settings[field] && api.updateSettings({ [field]: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <button
        className="btn btn--ghost"
        onClick={async () => {
          const folder = await api.pickFolder()
          if (folder) api.updateSettings({ [field]: folder })
        }}
      >
        Browse
      </button>
    </Row>
  )
}

export function Settings() {
  const { snapshot, notify } = useMist()
  const { settings } = snapshot
  const exclusionCommand = [settings.libraryPath, settings.stagingPath].map((p) => `Add-MpPreference -ExclusionPath "${p}"`).join('\n')

  return (
    <div className="page page--narrow">
      <header className="page__head">
        <h1>Settings</h1>
      </header>

      <section className="settings-group">
        <h2 className="section__title">Storage</h2>
        <PathRow label="Library path" hint="Where installed games live" field="libraryPath" settings={settings} />
        <PathRow label="Staging path" hint="Downloads land here before extraction" field="stagingPath" settings={settings} />
        <PathRow label="Save backup path" hint="Destination for Back up" field="saveBackupPath" settings={settings} />
        <Row label="Cache size" hint="Artwork and metadata">
          <span className="setting__value">{formatBytes(settings.cacheBytes)}</span>
          <button className="btn btn--ghost" disabled={settings.cacheBytes === 0} onClick={() => api.clearCache()}>
            Clear
          </button>
        </Row>
      </section>

      <section className="settings-group">
        <h2 className="section__title">Downloads</h2>
        <Row label="Concurrent downloads" hint="Jobs that run at the same time">
          <input
            type="range"
            min={1}
            max={4}
            step={1}
            value={settings.concurrentDownloads}
            onChange={(e) => api.updateSettings({ concurrentDownloads: Number(e.target.value) })}
            aria-label="Concurrent downloads"
          />
          <span className="setting__value">{settings.concurrentDownloads}</span>
        </Row>
        <Row label="Sources" hint="Where Mist may read from">
          <ul className="toggles">
            {settings.sources.map((source) => (
              <li key={source.id}>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={source.enabled}
                    onChange={() =>
                      api.updateSettings({ sources: settings.sources.map((s) => (s.id === source.id ? { ...s, enabled: !s.enabled } : s)) })
                    }
                  />
                  <span className="toggle__box" />
                  {source.name}
                </label>
              </li>
            ))}
          </ul>
        </Row>
      </section>

      <section className="settings-group">
        <h2 className="section__title">Windows Defender</h2>
        <Row label="Exclusions helper" hint="Scanning large game folders slows installs. Run this in an elevated PowerShell if you trust these folders.">
          <pre className="code">{exclusionCommand}</pre>
          <button
            className="btn btn--ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(exclusionCommand)
              notify('Command copied')
            }}
          >
            Copy
          </button>
        </Row>
      </section>

      <section className="settings-group">
        <h2 className="section__title">Startup</h2>
        <Row
          label="Launch at login"
          hint={snapshot.startup.available ? 'Start Mist when you sign in to Windows' : 'Available in the installed app, not in dev mode'}
        >
          <label className="toggle">
            <input
              type="checkbox"
              disabled={!snapshot.startup.available}
              checked={snapshot.startup.enabled}
              onChange={() => api.setLaunchAtLogin(!snapshot.startup.enabled)}
            />
            <span className="toggle__box" />
            {snapshot.startup.enabled ? 'On' : 'Off'}
          </label>
        </Row>
      </section>

      <section className="settings-group">
        <h2 className="section__title">Playback</h2>
        <Row label="Hardware decoding" hint="mpv uses the GPU decoder when it can and falls back to software automatically">
          <label className="toggle">
            <input type="checkbox" checked={settings.hardwareDecode} onChange={() => api.updateSettings({ hardwareDecode: !settings.hardwareDecode })} />
            <span className="toggle__box" />
            {settings.hardwareDecode ? 'On' : 'Off'}
          </label>
        </Row>
      </section>

      <section className="settings-group">
        <h2 className="section__title">Appearance</h2>
        <Row label="Theme" hint="Mist has drifting fog; Midnight is darker and still">
          <div className="segmented" role="radiogroup" aria-label="Theme">
            {THEMES.map((theme) => (
              <button key={theme} role="radio" aria-checked={settings.theme === theme} className={settings.theme === theme ? 'is-selected' : ''} onClick={() => api.updateSettings({ theme })}>
                {THEME_LABEL[theme]}
              </button>
            ))}
          </div>
        </Row>
      </section>

      <section className="settings-group">
        <h2 className="section__title">Library data</h2>
        <Row label="Clear library" hint="Removes every library entry and download. Catalog rows stay.">
          <button className="btn btn--ghost" onClick={() => api.clearLibrary()}>
            Clear library
          </button>
        </Row>
        <Row label="Restore sample data" hint="Re-seeds the database with the fake catalog">
          <button className="btn btn--ghost" onClick={() => api.restoreSeed()}>
            Restore
          </button>
        </Row>
      </section>

      <section className="settings-group">
        <h2 className="section__title">About</h2>
        <Row label="Mist" hint="Offline catalog and launcher. Makes no network requests.">
          <span className="setting__value">v{snapshot.appVersion}</span>
        </Row>
      </section>
    </div>
  )
}
