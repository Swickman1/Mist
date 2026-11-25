import { Modal } from './Modal'
import { useMist } from '../store'

export function ConfirmModal() {
  const { confirmState, resolveConfirm } = useMist()
  if (!confirmState) return null

  return (
    <Modal title={confirmState.title} onClose={() => resolveConfirm(false)}>
      <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
        {confirmState.message}
      </p>
      <div className="row-end">
        <button className="btn btn--ghost" onClick={() => resolveConfirm(false)}>
          {confirmState.cancelLabel}
        </button>
        <button className="btn btn--primary" onClick={() => resolveConfirm(true)}>
          {confirmState.confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
