import { HashRouter, Route, Routes } from 'react-router-dom'
import { AddFlow } from './components/AddFlow'
import { DownloadBar } from './components/DownloadBar'
import { Fog } from './components/Fog'
import { PlayerModal } from './components/PlayerModal'
import { Rail } from './components/Rail'
import { TitleBar } from './components/TitleBar'
import { Toasts } from './components/Toasts'
import { ui } from './config'
import { Downloads } from './pages/Downloads'
import { GamePage } from './pages/GamePage'
import { Games } from './pages/Games'
import { Home } from './pages/Home'
import { Library } from './pages/Library'
import { Settings } from './pages/Settings'
import { ShowPage } from './pages/ShowPage'
import { Shows } from './pages/Shows'
import { visibleJobs } from './selectors'
import { useMist } from './store'

export function App() {
  const { snapshot, railCollapsed } = useMist()
  const barVisible = visibleJobs(snapshot.jobs).length > 0
  const layoutVars = {
    '--rail': `${railCollapsed ? ui.railCollapsedWidth : ui.railWidth}px`,
    // Main view reserves the collapsed bar's height so it never covers content.
    '--bar-reserve': `${barVisible ? ui.barCollapsedHeight : 0}px`,
    '--bar-expanded': `${ui.barExpandedHeight}px`
  } as React.CSSProperties

  return (
    <HashRouter>
      <div className="app" style={layoutVars}>
        <Fog />
        <TitleBar />
        <div className="shell">
          <Rail />
          <main className="main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/library" element={<Library />} />
              <Route path="/games" element={<Games />} />
              <Route path="/games/:id" element={<GamePage />} />
              <Route path="/shows" element={<Shows />} />
              <Route path="/shows/:id" element={<ShowPage />} />
              <Route path="/downloads" element={<Downloads />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
        <DownloadBar />
        <AddFlow />
        <PlayerModal />
        <Toasts />
      </div>
    </HashRouter>
  )
}
