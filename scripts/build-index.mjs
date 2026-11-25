// npm run index [-- --fixture] [-- --out <path>]
// Builds index/catalog-extra.json from the adapters in scripts/index-sources/ (never touches games.json).
// Each adapter exports default { name, url, fixture?, parse(html) -> { title, pageUrl, sizeBytes? }[] }.
// Pages are fetched one at a time, 1s apart; --fixture reads each adapter's local fixture instead.
// Row order is kept (adapters by file name, rows in page order) because Mist ranks rows by position.
import { readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const CONFIG = {
  delayMs: 1000,
  maxItems: 2000,
  defaultOut: 'index/catalog-extra.json'
}

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const sourcesDir = join(here, 'index-sources')
const args = process.argv.slice(2)
const fixtureMode = args.includes('--fixture')
const outIndex = args.indexOf('--out')
const outPath = resolve(root, outIndex >= 0 ? args[outIndex + 1] : CONFIG.defaultOut)

const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const userAgent = `Mist/${version}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function loadAdapters() {
  const files = (await readdir(sourcesDir)).filter((name) => name.endsWith('.mjs')).sort()
  return Promise.all(files.map(async (file) => (await import(pathToFileURL(join(sourcesDir, file)).href)).default))
}

async function pageFor(adapter) {
  if (fixtureMode) {
    if (!adapter.fixture) throw new Error('no fixture')
    return readFile(join(sourcesDir, adapter.fixture), 'utf8')
  }
  const response = await fetch(adapter.url, { headers: { 'User-Agent': userAgent } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

/** Keeps rows with a non-blank title and an http(s) pageUrl; sizeBytes only when a non-negative number. */
function clean(row) {
  const title = String(row?.title ?? '').trim()
  let pageUrl
  try {
    pageUrl = new URL(row?.pageUrl)
  } catch {
    return undefined
  }
  if (!title || !['https:', 'http:'].includes(pageUrl.protocol)) return undefined
  const size = Number(row.sizeBytes)
  return { title, pageUrl: pageUrl.href, sizeBytes: Number.isFinite(size) && size >= 0 ? Math.floor(size) : 0 }
}

const adapters = await loadAdapters()
const rows = []
const empty = []
for (const [i, adapter] of adapters.entries()) {
  if (i > 0 && !fixtureMode) await sleep(CONFIG.delayMs)
  try {
    const found = adapter.parse(await pageFor(adapter)).map(clean).filter(Boolean)
    console.log(`[index] ${adapter.name}: ${found.length} row(s)`)
    if (found.length === 0) empty.push(adapter.name)
    rows.push(...found)
  } catch (error) {
    console.warn(`[index] ${adapter.name}: skipped (${error.message})`)
    empty.push(adapter.name)
  }
}

const seen = new Set()
const items = rows.filter((row) => !seen.has(row.pageUrl) && seen.add(row.pageUrl)).slice(0, CONFIG.maxItems)
if (items.length > 0) {
  const doc = { version: 1, generatedAt: new Date().toISOString(), items }
  await writeFile(`${outPath}.tmp`, JSON.stringify(doc, null, 2) + '\n')
  await rename(`${outPath}.tmp`, outPath)
  console.log(`[index] wrote ${items.length} row(s) (${rows.length - items.length} duplicate or over the cap) to ${outPath}`)
} else {
  console.error(`[index] no rows at all; ${outPath} left as it was`)
}

if (empty.length > 0) {
  console.error(`[index] no rows from: ${empty.join(', ')}`)
  // exitCode, not exit(): exiting with a fetch socket still open trips a libuv assertion on Windows.
  process.exitCode = 1
}
