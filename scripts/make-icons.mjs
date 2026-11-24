// Renders build/icon.svg (+ icon-small.svg for tiny sizes) into build/icon.png
// and a multi-size build/icon.ico. Run: npm run icons
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const large = readFileSync('build/icon.svg')
const small = readFileSync('build/icon-small.svg')
const SIZES = [16, 24, 32, 48, 64, 128, 256]
const SMALL_MAX = 32

const render = (svg, size) => sharp(svg, { density: Math.max(72, (size / 1024) * 72 * 4) }).resize(size, size).png().toBuffer()

const pngs = await Promise.all(SIZES.map((size) => render(size <= SMALL_MAX ? small : large, size)))

// ICO container with embedded PNG images (supported since Windows Vista).
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(SIZES.length, 4)
const entries = []
let offset = 6 + 16 * SIZES.length
SIZES.forEach((size, i) => {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size >= 256 ? 0 : size, 0)
  entry.writeUInt8(size >= 256 ? 0 : size, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(pngs[i].length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += pngs[i].length
  entries.push(entry)
})
writeFileSync('build/icon.ico', Buffer.concat([header, ...entries, ...pngs]))
writeFileSync('build/icon.png', await render(large, 512))
console.log(`icon.ico (${SIZES.join(', ')}) + icon.png 512`)
