import { useState } from 'react'
import type { SourceShape } from '../../../shared/types'
import { api } from '../store'

const SHAPES: SourceShape[] = ['archive', 'installer', 'magnet']

export interface SourceDraft {
  input: string
  shape: SourceShape
}

/** Paste field + shape selector + drop zone. Controlled by the parent. */
export function SourceFields({ draft, onChange }: { draft: SourceDraft; onChange: (draft: SourceDraft) => void }) {
  const [dragging, setDragging] = useState(false)

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (!file) return
    const path = api.pathForFile(file)
    const shape: SourceShape = /\.(exe|msi)$/i.test(path) ? 'installer' : 'archive'
    onChange({ input: path, shape })
  }

  return (
    <div className="source-fields">
      <input
        className="field"
        value={draft.input}
        placeholder="Paste a path or magnet link"
        aria-label="Source"
        onChange={(e) => {
          const input = e.target.value
          onChange({ input, shape: input.startsWith('magnet:') ? 'magnet' : draft.shape })
        }}
      />
      <div className="segmented" role="radiogroup" aria-label="Source shape">
        {SHAPES.map((shape) => (
          <button
            key={shape}
            role="radio"
            aria-checked={draft.shape === shape}
            className={draft.shape === shape ? 'is-selected' : ''}
            onClick={() => onChange({ ...draft, shape })}
          >
            {shape}
          </button>
        ))}
      </div>
      <div
        className={`dropzone${dragging ? ' is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        Drop a file or folder here
      </div>
    </div>
  )
}

/** Collapsed "Add source" disclosure on the game page. */
export function AddSourcePanel({ onSubmit }: { onSubmit: (draft: SourceDraft) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<SourceDraft>({ input: '', shape: 'archive' })

  return (
    <section className="disclosure">
      <button className="disclosure__head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={`disclosure__caret${open ? ' is-open' : ''}`}>▸</span> Add source
      </button>
      {open && (
        <div className="disclosure__body">
          <SourceFields draft={draft} onChange={setDraft} />
          <div className="row-end">
            <button className="btn btn--primary" disabled={!draft.input.trim()} onClick={() => onSubmit(draft)}>
              Save source
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
