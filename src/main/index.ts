import { app, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'node:path'
import { IPC, MIST_METHODS, READ_ONLY_METHODS, type MistMethod, type Theme } from '../shared/types'
import { APP_ID, appIconPath, titleBarOverlay, windowBackground } from './chrome'
import { installGame, reconcileInstalled } from './install'
import { JobRunner } from './jobRunner'
import { Repository } from './repository'
import { MistService } from './service'

const devServerUrl = process.env['ELECTRON_RENDERER_URL']
let mainWindow: BrowserWindow | undefined

/** Local protocols Mist always serves from disk or memory. */
const LOCAL_PROTOCOLS = ['file:', 'data:', 'blob:', 'devtools:', 'chrome-extension:']

/** The only remote hosts Mist may reach, over https, for title metadata and artwork. */
export const ALLOWED_HTTPS_HOSTS = ['image.tmdb.org', 'api.themoviedb.org']

/** Everything outside the local protocols, the dev server and the allowlist is cancelled and logged. */
function blockNetwork(): void {
  const devOrigin = devServerUrl ? new URL(devServerUrl) : undefined
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url)
    const local = LOCAL_PROTOCOLS.includes(url.protocol)
    const devServer = devOrigin !== undefined && url.host === devOrigin.host && ['http:', 'ws:'].includes(url.protocol)
    const metadata = url.protocol === 'https:' && ALLOWED_HTTPS_HOSTS.includes(url.hostname)
    const allowed = local || devServer || metadata
    if (!allowed) console.warn(`[mist] blocked network request: ${details.url}`)
    callback({ cancel: !allowed })
  })
}

function createWindow(theme: Theme): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarOverlay(theme),
    backgroundColor: windowBackground(theme),
    show: false,
    title: 'Mist',
    icon: appIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  if (devServerUrl) win.loadURL(devServerUrl)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

// One Mist at a time: a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) app.exit(0)

app.setAppUserModelId(APP_ID)

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(() => {
  blockNetwork()

  const repo = new Repository(join(app.getPath('userData'), 'mist.db'), app.getPath('home'))
  const broadcast = (channel: string, payload: unknown) => mainWindow?.webContents.send(channel, payload)
  const runner = new JobRunner(
    repo,
    (game, stagingDir, signal) => installGame(game, stagingDir, repo.settings.libraryPath, signal),
    (jobs) => broadcast(IPC.jobs, jobs),
    () => broadcast(IPC.snapshot, service.snapshot())
  )
  const service = new MistService(repo, runner, app.getVersion(), () => mainWindow)

  ipcMain.handle(IPC.call, async (_event, method: MistMethod, args: unknown[]) => {
    if (!MIST_METHODS.includes(method)) throw new Error(`Unknown method ${method}`)
    const result = await (service[method] as (...a: unknown[]) => unknown)(...args)
    if (!READ_ONLY_METHODS.includes(method)) broadcast(IPC.snapshot, service.snapshot())
    return result
  })

  reconcileInstalled(repo)
  runner.start()
  mainWindow = createWindow(repo.settings.theme)
  // Folders deleted while Mist was in the background show as MISSING when it is focused again.
  mainWindow.on('focus', () => reconcileInstalled(repo) && broadcast(IPC.snapshot, service.snapshot()))
  mainWindow.on('closed', () => (mainWindow = undefined))

  app.on('activate', () => {
    if (!mainWindow) mainWindow = createWindow(repo.settings.theme)
  })
  app.on('before-quit', () => runner.stop())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
