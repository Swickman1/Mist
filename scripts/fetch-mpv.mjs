// npm run fetch-mpv: puts the pinned mpv build in vendor/mpv/ so `npm run dist`
// can bundle it. mpv.exe is over GitHub's 100 MB file limit, so it lives on a
// release of this repo instead of in git (see vendor/mpv/SOURCE.md).
//
//   node scripts/fetch-mpv.mjs              fail (exit 1) when it cannot get mpv: used by dist
//   node scripts/fetch-mpv.mjs --warn-only  warn and exit 0: used by postinstall, since dev runs without mpv
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const MPV_VERSION = '0.42.0'
const RELEASE_URL = `https://github.com/Swickman1/Mist/releases/download/mpv-${MPV_VERSION}`
const DIR = join('vendor', 'mpv')

/** Pinned release assets. mpv.exe is required; d3dcompiler_43.dll ships with this build. */
const ASSETS = [
  { name: 'mpv.exe', sha256: 'b35a85247f6fec859d1d8d5db433e36d1a53daddd52d394353658e78ec3c9454' },
  { name: 'd3dcompiler_43.dll', sha256: '4b074a3976399dc735484f5d43d04b519b7bdee8ac719d9ab8ed6bd4e6be0345' }
]

const FAILURE = 'vendor/mpv/mpv.exe missing — winget install shinchiro.mpv, then copy mpv.exe and LICENSE into vendor/mpv'
const warnOnly = process.argv.includes('--warn-only')

async function sha256Of(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

/** Downloads into <name>.download while hashing; renames into place only when the sha256 matches. */
async function download({ name, sha256 }) {
  const target = join(DIR, name)
  const temp = `${target}.download`
  const response = await fetch(`${RELEASE_URL}/${name}`, { redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`GET ${name}: HTTP ${response.status}`)
  const hash = createHash('sha256')
  const hashing = Readable.fromWeb(response.body)
  hashing.on('data', (chunk) => hash.update(chunk))
  try {
    await pipeline(hashing, createWriteStream(temp))
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
  const actual = hash.digest('hex')
  if (actual !== sha256) {
    await rm(temp, { force: true })
    throw new Error(`${name}: sha256 mismatch (expected ${sha256}, got ${actual}); deleted`)
  }
  await rename(temp, target)
}

async function main() {
  await mkdir(DIR, { recursive: true })
  for (const asset of ASSETS) {
    const path = join(DIR, asset.name)
    if (existsSync(path) && (await sha256Of(path)) === asset.sha256) {
      console.log(`fetch-mpv: ${asset.name} ok (pinned ${MPV_VERSION})`)
      continue
    }
    console.log(`fetch-mpv: downloading ${asset.name} (mpv ${MPV_VERSION})…`)
    await download(asset)
    console.log(`fetch-mpv: ${asset.name} verified`)
  }
  if (!existsSync(join(DIR, 'LICENSE'))) throw new Error('vendor/mpv/LICENSE is missing (it is committed; restore it with git checkout)')
}

main().catch((error) => {
  const message = `fetch-mpv: ${error.message}\n${FAILURE}`
  if (warnOnly) {
    console.warn(`\n[warning] ${message}\nThe app still runs in dev without mpv (built-in player); 'npm run dist' will need it.\n`)
    process.exit(0)
  }
  console.error(`\n${message}\n`)
  process.exit(1)
})
