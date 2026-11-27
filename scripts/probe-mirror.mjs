import { mkdirSync, writeFileSync } from 'node:fs'

const mode = process.argv[2]
const url = process.argv[3]
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

if (!mode || !url) {
  console.log('usage: node scripts/probe-mirror.mjs <page|mirror> <url>')
  process.exit(1)
}

const headers = { 'User-Agent': UA }
if (mode === 'mirror') {
  headers['Referer'] = 'https://steamrip.com/'
  headers['Range'] = 'bytes=0-131071'
}

const res = await fetch(url, { headers, redirect: 'follow' })
const buf = Buffer.from(await res.arrayBuffer())
const text = buf.toString('utf8')
const ct = res.headers.get('content-type') ?? ''

console.log('--- request ---')
console.log(`${mode} ${url}`)
console.log('--- response ---')
console.log(`status: ${res.status}`)
console.log(`final url: ${res.url}`)
console.log(`redirected: ${res.url !== url}`)
console.log(`content-type: ${ct}`)
console.log(`content-range: ${res.headers.get('content-range') ?? '(none)'}`)
console.log(`accept-ranges: ${res.headers.get('accept-ranges') ?? '(none)'}`)
console.log(`disposition: ${res.headers.get('content-disposition') ?? '(none)'}`)
console.log(`bytes: ${buf.length}`)
console.log(`title: ${(text.match(/<title>([^<]*)/i) ?? [])[1] ?? '(none)'}`)

if (res.status === 206) {
  console.log('--- verdict ---')
  console.log('DIRECT_FILE (range honoured)')
  process.exit(0)
}
if (/^(application\/(zip|x-rar|octet-stream|x-7z|x-iso))|^(application\/vnd\.rar)/i.test(ct)) {
  console.log('--- verdict ---')
  console.log('DIRECT_FILE (binary content-type)')
  process.exit(0)
}

const hrefs = [...text.matchAll(/href="([^"]+)"/gi)].map((m) => m[1])
const interesting = [...new Set(hrefs)].filter((h) => /\.(zip|rar|7z|iso|exe)(\?|$)/i.test(h) || /download|api|contents|token|direct|getlink/i.test(h))
console.log('--- links ---')
console.log(interesting.slice(0, 40).join('\n') || '(none)')

const inline = [...text.matchAll(/<script[^>]*>([\s\S]{0,4000}?)<\/script>/gi)]
  .map((m) => m[1])
  .filter((s) => /location\.(href|replace)|window\.open|atob\(/.test(s))
console.log('--- scripts mentioning location/redirect ---')
console.log(inline.length ? inline.slice(0, 3).join('\n=====\n').slice(0, 3000) : '(none)')

console.log('--- body head ---')
console.log(text.slice(0, 400).replace(/\s+/g, ' '))

mkdirSync('probe-out', { recursive: true })
const out = `probe-out/${Date.now()}-${mode}.html`
writeFileSync(out, text)
console.log(`saved: ${out}`)
console.log(text.slice(0, 2500).replace(/\s+/g, ' '))
console.log('--- all script tags ---')
console.log([...text.matchAll(/<script[^>]*>([\s\S]{0,3000}?)<\/script>/gi)].map((m) => m[1]).join('\n=====\n').slice(0, 5000) || '(none)')