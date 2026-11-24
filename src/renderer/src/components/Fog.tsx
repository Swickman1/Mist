// Drifting fog behind the whole app. Purely decorative, never interactive.
export function Fog() {
  return (
    <div className="fog" aria-hidden="true">
      <div className="fog__glow" />
      <div className="fog__layer fog__layer--far" />
      <div className="fog__layer fog__layer--near" />
    </div>
  )
}
