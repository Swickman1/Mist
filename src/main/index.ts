import { app, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'node:path'
import { IPC, MIST_METHODS, READ_ONLY_METHODS, type MistMethod, type Theme } from '../shared/types'
import { MEDIA_SCHEME } from '../shared/media'
import { APP_ID, appIconPath, titleBarOverlay, windowBackground } from './chrome'
import { installGame, reconcileInstalled } from './install'
import { JobRunner } from './jobRunner'
import { MpvHost, MpvPidFile } from './mpv'
import { hostAllowed } from './net'
import { handleMediaRequests, indexAllShows, registerMediaScheme } from './media'
import { migrateRemoteArt } from './metadata'
import { Repository } from './repository'
import { MistService } from './service'
import { ArtCache } from './artCache'
import { migrateRemoteSteamArt } from './gameMetadata'
import { STEAM_CONFIG } from './steam'
import { TMDB_CONFIG } from './tmdb'

const devServerUrl = process.env['ELECTRON_RENDERER_URL']
let mainWindow: BrowserWindow | undefined

/** Local protocols Mist always serves from disk or memory. */
const LOCAL_PROTOCOLS = ['file:', 'data:', 'blob:', 'devtools:', 'chrome-extension:', `${MEDIA_SCHEME}:`]

/** Fixed metadata hosts (TMDB, Steam store) Mist may reach over https. */
export const METADATA_HOSTS = ['image.tmdb.org', 'api.themoviedb.org', 'store.steampowered.com', 'shared.akamai.steamstatic.com']

/** Everything the session may reach over https: the metadata hosts plus the user's download hosts, read live. */
function allowedHttpsHosts(downloadHosts: readonly string[]): string[] {
  return [...METADATA_HOSTS, ...downloadHosts]
}

/** Everything outside the local protocols, the dev server and the allowlist is cancelled and logged. */
function blockNetwork(downloadHosts: () => readonly string[]): void {
  const devOrigin = devServerUrl ? new URL(devServerUrl) : undefined
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url)
    const local = LOCAL_PROTOCOLS.includes(url.protocol)
    const devServer = devOrigin !== undefined && url.host === devOrigin.host && ['http:', 'ws:'].includes(url.protocol)
    const metadata = url.protocol === 'https:' && hostAllowed(url.hostname, allowedHttpsHosts(downloadHosts()))
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
registerMediaScheme()

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(() => {
  // mpv processes left by a crash or hard kill of the previous run.
  const mpvPids = new MpvPidFile(join(app.getPath('userData'), 'mpv-pids.json'))
  const swept = mpvPids.sweep()
  if (swept.length) console.warn(`[mist] killed stale mpv processes: ${swept.join(', ')}`)

  const repo = new Repository(join(app.getPath('userData'), 'mist.db'), app.getPath('home'))
  // The session guard reads the download hosts live, so Settings edits apply at once.
  blockNetwork(() => repo.settings.downloadHosts)
  const broadcast = (channel: string, payload: unknown) => mainWindow?.webContents.send(channel, payload)
  /** Allowlist (read live from settings) + User-Agent for every URL source. */
  const http = { hosts: () => repo.settings.downloadHosts, userAgent: `Mist/${app.getVersion()}` }
  const runner = new JobRunner(
    repo,
    (game, stagingDir, signal) => installGame(game, stagingDir, repo.settings.libraryPath, signal),
    (jobs) => broadcast(IPC.jobs, jobs),
    () => broadcast(IPC.snapshot, service.snapshot()),
    http
  )
  const mpv = new MpvHost(() => mainWindow, () => repo.settings.hardwareDecode, (event) => broadcast(IPC.player, event), mpvPids)
  const tmdbCache = new ArtCache(app.getPath('userData'), 'tmdb-cache', 'tmdb', TMDB_CONFIG.imageBase)
  const steamCache = new ArtCache(app.getPath('userData'), 'steam-cache', 'steam', STEAM_CONFIG.imageBase)
  const service: MistService = new MistService(
    repo,
    runner,
    app.getVersion(),
    () => mainWindow,
    mpv,
    () => broadcast(IPC.snapshot, service.snapshot()),
    tmdbCache,
    steamCache,
    http
  )

  ipcMain.handle(IPC.call, async (_event, method: MistMethod, args: unknown[]) => {
    if (!MIST_METHODS.includes(method)) throw new Error(`Unknown method ${method}`)
    const result = await (service[method] as (...a: unknown[]) => unknown)(...args)
    if (!READ_ONLY_METHODS.includes(method)) broadcast(IPC.snapshot, service.snapshot())
    return result
  })

  reconcileInstalled(repo)
  migrateRemoteArt(repo)
  migrateRemoteSteamArt(repo)
  handleMediaRequests(repo, { tmdb: tmdbCache, steam: steamCache })
  void indexAllShows(repo).then((changed) => changed && broadcast(IPC.snapshot, service.snapshot()))
  runner.start()
  mainWindow = createWindow(repo.settings.theme)
  // Folders deleted while Mist was in the background show as MISSING when it is focused again.
  mainWindow.on('focus', () => reconcileInstalled(repo) && broadcast(IPC.snapshot, service.snapshot()))
  mainWindow.on('close', () => void mpv.close())
  mainWindow.on('closed', () => (mainWindow = undefined))

  app.on('activate', () => {
    if (!mainWindow) mainWindow = createWindow(repo.settings.theme)
  })
  app.on('before-quit', () => {
    runner.stop()
    void mpv.close()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
