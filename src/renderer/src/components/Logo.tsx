import iconUrl from '../../../../build/icon.svg'

/** App mark + wordmark; the same artwork as the taskbar / exe icon. */
export function Logo() {
  return (
    <div className="logo">
      <img src={iconUrl} width={22} height={22} alt="" draggable={false} />
      <span className="logo__word">MIST</span>
    </div>
  )
}
