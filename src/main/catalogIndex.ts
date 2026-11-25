import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface CatalogIndexItem {
  title: string
  pageUrl: string
  sizeBytes: number
}

interface CatalogIndexDoc {
  version: number
  generatedAt: string
  items: CatalogIndexItem[]
}

export interface BundledIndexFile {
  file: string
  items: CatalogIndexItem[]
}

/** First bundled catalog slices; more files can be added over time. */
export const BUNDLED_FILES = ['games.json'] as const

function asObject(value: unknown, where: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${where} must be an object`)
  return value as Record<string, unknown>
}

function parsePageUrl(value: unknown, where: string): string {
  if (typeof value !== 'string') throw new Error(`${where} must be a string`)
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`${where} must be http(s)`)
  return url.href
}

function parseSizeBytes(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${where} must be a non-negative number`)
  return Math.floor(value)
}

export function parseIndex(text: string): CatalogIndexDoc {
  const root = asObject(JSON.parse(text), 'index')
  if (root['version'] !== 1) throw new Error('version must be 1')
  if (typeof root['generatedAt'] !== 'string') throw new Error('generatedAt must be a string')
  if (!Array.isArray(root['items'])) throw new Error('items must be an array')

  const deduped: CatalogIndexItem[] = []
  const seen = new Set<string>()
  for (let i = 0; i < root['items'].length; i++) {
    const item = asObject(root['items'][i], `items[${i}]`)
    const title = String(item['title'] ?? '').trim()
    if (!title) throw new Error(`items[${i}].title must be non-blank`)
    const pageUrl = parsePageUrl(item['pageUrl'], `items[${i}].pageUrl`)
    if (seen.has(pageUrl)) continue
    seen.add(pageUrl)
    deduped.push({ title, pageUrl, sizeBytes: parseSizeBytes(item['sizeBytes'], `items[${i}].sizeBytes`) })
    if (deduped.length > 5000) throw new Error('items exceeds max of 5000 unique pageUrl entries')
  }

  return { version: 1, generatedAt: root['generatedAt'], items: deduped }
}

function bundledPath(file: string): string {
  if (app.isPackaged) return join(process.resourcesPath, 'index', file)
  return join(process.cwd(), 'index', file)
}

export async function loadBundled(): Promise<BundledIndexFile[]> {
  const loaded: BundledIndexFile[] = []
  for (const file of BUNDLED_FILES) {
    const path = bundledPath(file)
    try {
      const parsed = parseIndex(await readFile(path, 'utf8'))
      loaded.push({ file, items: parsed.items })
    } catch (error) {
      console.warn(`[mist] skipped bundled index file ${file}: ${(error as Error).message}`)
    }
  }
  return loaded
}
