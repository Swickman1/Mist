import { useState } from 'react'
import { entryFor } from '../selectors'
import { api, useMist } from '../store'
import { SourceFields, type SourceDraft } from './AddSourcePanel'
import { Icon } from './Icon'
import { Modal } from './Modal'

export function AddFlow() {
  const { snapshot, addFlow, openAddFlow, notify } = useMist()
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<SourceDraft>({ input: '', shape: 'archive' })
  if (!addFlow) return null

  const isGame = addFlow === 'game'
  const candidates = isGame
    ? snapshot.games.filter((g) => !entryFor(snapshot, 'game', g.id)).map((g) => ({ id: g.id, title: g.title, art: g.art, meta: g.version }))
    : snapshot.shows.filter((s) => !entryFor(snapshot, 'show', s.id)).map((s) => ({ id: s.id, title: s.title, art: s.poster, meta: String(s.year) }))

  const close = () => {
    setSelected(null)
    setDraft({ input: '', shape: 'archive' })
    openAddFlow(null)
  }

  const submit = async () => {
    if (!selected) return
    const input = draft.input.trim()
    const result = isGame
      ? await api.addGame(selected, input ? { input, shape: draft.shape } : undefined)
      : await api.addShow(selected, input || undefined)
    notify(result)
    close()
  }

  return (
    <Modal title={isGame ? 'Add a game' : 'Add a show or movie'} onClose={close}>
      {candidates.length === 0 ? (
        <p className="muted">Everything in the catalog is already in your library.</p>
      ) : (
        <ul className="pick-grid">
          {candidates.map((c) => (
            <li key={c.id}>
              <button className={`pick${selected === c.id ? ' is-selected' : ''}`} onClick={() => setSelected(c.id)} aria-pressed={selected === c.id}>
                <img src={c.art} alt="" />
                <span className="pick__title">{c.title}</span>
                <span className="muted">{c.meta}</span>
                {selected === c.id && (
                  <span className="pick__tick">
                    <Icon name="check" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3 className="label">{isGame ? 'Source (optional)' : 'Folder (optional)'}</h3>
      {isGame ? (
        <SourceFields draft={draft} onChange={setDraft} />
      ) : (
        <div className="source-fields">
          <input className="field" value={draft.input} placeholder="Paste a folder path" onChange={(e) => setDraft({ ...draft, input: e.target.value })} />
          <button
            className="btn btn--ghost"
            onClick={async () => {
              const folder = await api.pickFolder()
              if (folder) setDraft({ ...draft, input: folder })
            }}
          >
            Browse
          </button>
        </div>
      )}
      <div className="row-end">
        <button className="btn btn--ghost" onClick={close}>
          Cancel
        </button>
        <button className="btn btn--primary" disabled={!selected} onClick={submit}>
          Add to library
        </button>
      </div>
    </Modal>
  )
}
