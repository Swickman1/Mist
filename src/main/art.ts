// Deterministic local placeholder art as SVG data URIs. No network.

function hashString(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function seededRandom(seed: number): () => number {
  let t = seed
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function wrapWords(text: string, maxChars: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxChars && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

export interface ArtOptions {
  width: number
  height: number
  /** Title baked into the image (covers/posters). Omit for heroes and stills. */
  label?: string
}

export function makeArt(key: string, { width, height, label }: ArtOptions): string {
  const rand = seededRandom(hashString(key))
  const hue = Math.floor(rand() * 360)
  const hue2 = (hue + 30 + Math.floor(rand() * 60)) % 360
  const glowHue = (hue + 150 + Math.floor(rand() * 60)) % 360
  const angle = Math.floor(rand() * 360)
  const cx = Math.round(width * (0.2 + rand() * 0.6))
  const cy = Math.round(height * (0.15 + rand() * 0.4))
  const radius = Math.round(Math.min(width, height) * (0.18 + rand() * 0.22))

  const bands = Array.from({ length: 4 }, (_, i) => {
    const y = Math.round(height * (0.35 + i * 0.14 + rand() * 0.06))
    const skew = Math.round((rand() - 0.5) * height * 0.3)
    return `<path d="M0 ${y} L${width} ${y + skew} L${width} ${height} L0 ${height} Z" fill="hsl(${hue},40%,${8 + i * 3}%)" opacity="${0.55 + i * 0.1}"/>`
  }).join('')

  let text = ''
  if (label) {
    const size = Math.round(width * 0.1)
    const lines = wrapWords(label.toUpperCase(), 11)
    const startY = height - Math.round(size * 0.9) - (lines.length - 1) * Math.round(size * 1.05)
    text = lines
      .map(
        (line, i) =>
          `<text x="${Math.round(width * 0.08)}" y="${startY + i * Math.round(size * 1.05)}" font-family="Inter, Segoe UI, sans-serif" font-weight="800" font-size="${size}" letter-spacing="1" fill="#F4F6F8">${escapeXml(line)}</text>`
      )
      .join('')
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)">` +
    `<stop offset="0" stop-color="hsl(${hue},45%,16%)"/><stop offset="1" stop-color="hsl(${hue2},55%,34%)"/></linearGradient>` +
    `<radialGradient id="r"><stop offset="0" stop-color="hsl(${glowHue},70%,70%)" stop-opacity=".85"/>` +
    `<stop offset="1" stop-color="hsl(${glowHue},70%,50%)" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="${width}" height="${height}" fill="url(#g)"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${radius * 2}" fill="url(#r)"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${Math.round(radius * 0.45)}" fill="hsl(${glowHue},60%,82%)" opacity=".9"/>` +
    bands +
    text +
    `</svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
