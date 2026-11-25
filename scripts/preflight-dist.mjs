// Runs before `npm run dist`: the installer bundles vendor/mpv, which electron-builder
// otherwise reports only as an unhelpful missing extraResources source.
import { existsSync } from 'node:fs'

const MESSAGE = 'vendor/mpv/mpv.exe missing — winget install shinchiro.mpv, then copy mpv.exe and LICENSE into vendor/mpv'
const REQUIRED = ['vendor/mpv/mpv.exe', 'vendor/mpv/LICENSE']

const missing = REQUIRED.filter((path) => !existsSync(path))
if (missing.length) {
  console.error(`\n${MESSAGE}\n(missing: ${missing.join(', ')})\n`)
  process.exit(1)
}
console.log('preflight: vendor/mpv ok')
