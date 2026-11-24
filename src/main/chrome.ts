// Native Windows caption buttons (minimize / maximize / close) drawn by the OS
// over our custom title bar. Colors follow the active theme.
import type { BrowserWindow } from 'electron'
import type { Theme } from '../shared/types'

export const TITLEBAR_HEIGHT = 40

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
