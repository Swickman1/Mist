import { Outlet } from 'react-router-dom'
import { GameList } from '../components/GameList'

/** Games section: library column on the left, library home or a game page on the right. */
export function GamesLayout() {
  return (
    <div className="games-layout">
      <GameList />
      <div className="games-layout__view">
        <Outlet />
      </div>
    </div>
  )
}
