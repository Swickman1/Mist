// Native Windows caption buttons (minimize / maximize / close) drawn by the OS
// over our custom title bar. Colors follow the active theme.
import { app, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { Theme } from '../shared/types'

/** Must match "build.appId" in package.json so taskbar grouping and pinning line up. */
export const APP_ID = 'com.mist.launcher'

export const TITLEBAR_HEIGHT = 40

/** Window/taskbar icon: shipped next to the exe when packaged, from build/ in dev. */
export function appIconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icon.ico') : join(app.getAppPath(), 'build', 'icon.ico')
}

const CHROME: Record<Theme, { color: string; symbolColor: string; background: string }> = {
  mist: { color: '#0c1218', symbolColor: '#c3d1de', background: '#0e141b' },
  midnight: { color: '#05080b', symbolColor: '#aab8c6', background: '#06090c' }
}

export function titleBarOverlay(theme: Theme): Electron.TitleBarOverlayOptions {
  return { color: CHROME[theme].color, symbolColor: CHROME[theme].symbolColor, height: TITLEBAR_HEIGHT }
}

export function windowBackground(theme: Theme): string {
  return CHROME[theme].background
}

export function applyChrome(win: BrowserWindow, theme: Theme): void {
  win.setTitleBarOverlay(titleBarOverlay(theme))
  win.setBackgroundColor(windowBackground(theme))
}
