// Local SQLite persistence. Each entity lives in its own document table.
import Database from 'better-sqlite3'
import { THEMES, type Episode, type Game, type LibraryEntry, type Settings, type Show } from '../shared/types'
import { buildSeed, defaultSettings, type SeededJob } from './seed'

class DocTable<T extends { id: string }> {
  private readonly selectAll: Database.Statement<[], { data: string }>
  private readonly selectOne: Database.Statement<[string], { data: string }>
  private readonly upsert: Database.Statement<[string, string]>
  private readonly remove: Database.Statement<[string]>
  private readonly truncate: Database.Statement<[]>

  constructor(db: Database.Database, name: string) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${name} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`)
    this.selectAll = db.prepare(`SELECT data FROM ${name} ORDER BY rowid`)
    this.selectOne = db.prepare(`SELECT data FROM ${name} WHERE id = ?`)
    this.upsert = db.prepare(`INSERT INTO ${name} (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`)
    this.remove = db.prepare(`DELETE FROM ${name} WHERE id = ?`)
    this.truncate = db.prepare(`DELETE FROM ${name}`)
  }

  all(): T[] {
    return this.selectAll.all().map((row) => JSON.parse(row.data) as T)
  }

  get(id: string): T | undefined {
    const row = this.selectOne.get(id)
    return row ? (JSON.parse(row.data) as T) : undefined
  }

  put(item: T): T {
    this.upsert.run(item.id, JSON.stringify(item))
    return item
  }

  delete(id: string): void {
    this.remove.run(id)
  }

  clear(): void {
    this.truncate.run()
  }
}

interface SettingsDoc {
  id: 'settings'
  value: Settings
}

export class Repository {
  private readonly db: Database.Database
  readonly games: DocTable<Game>
  readonly shows: DocTable<Show>
  readonly episodes: DocTable<Episode>
  readonly library: DocTable<LibraryEntry>
  readonly jobs: DocTable<SeededJob>
  readonly watchlist: DocTable<{ id: string }>
  private readonly settingsTable: DocTable<SettingsDoc>

  constructor(file: string) {
    this.db = new Database(file)
    this.db.pragma('journal_mode = WAL')
    this.games = new DocTable(this.db, 'games')
    this.shows = new DocTable(this.db, 'shows')
    this.episodes = new DocTable(this.db, 'episodes')
    this.library = new DocTable(this.db, 'library')
    this.jobs = new DocTable(this.db, 'jobs')
    this.watchlist = new DocTable(this.db, 'watchlist')
    this.settingsTable = new DocTable(this.db, 'settings')
    if (this.games.all().length === 0) this.seed()
    this.migrateTheme()
  }

  /** Databases from before the mist theme stored 'dark' / 'near-black'. */
  private migrateTheme(): void {
    const settings = this.settings
    if (THEMES.includes(settings.theme)) return
    this.settings = { ...settings, theme: (settings.theme as string) === 'near-black' ? 'midnight' : 'mist' }
  }

  get settings(): Settings {
    return this.settingsTable.get('settings')!.value
  }

  set settings(value: Settings) {
    this.settingsTable.put({ id: 'settings', value })
  }

  transaction(work: () => void): void {
    this.db.transaction(work)()
  }

  /** Wipes every table and writes fresh seed rows. */
  seed(): void {
    this.transaction(() => {
      for (const table of [this.games, this.shows, this.episodes, this.library, this.jobs, this.watchlist, this.settingsTable]) table.clear()
      const data = buildSeed(Date.now())
      data.games.forEach((row) => this.games.put(row))
      data.shows.forEach((row) => this.shows.put(row))
      data.episodes.forEach((row) => this.episodes.put(row))
      data.library.forEach((row) => this.library.put(row))
      data.jobs.forEach((row) => this.jobs.put(row))
      this.watchlist.put({ id: 's-copper-coast' })
      this.settings = defaultSettings()
    })
  }
}
