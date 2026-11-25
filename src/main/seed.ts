// Fake seed data. Every row is local; art is generated SVG.
import type { DownloadJob, Episode, Game, LibraryEntry, Settings, Show, SourceShape } from '../shared/types'
import { join } from 'node:path'
import { makeArt } from './art'

const GB = 1024 ** 3
const DAY = 86_400_000

export interface SeedData {
  games: Game[]
  shows: Show[]
  episodes: Episode[]
  library: LibraryEntry[]
  jobs: DownloadJob[]
}

interface GameSeed {
  title: string
  version: string
  sizeGb: number
  description: string
  source?: string
  shape?: SourceShape
  vetted: boolean
  tmdbId: number
}

const GAME_SEEDS: GameSeed[] = [
  { tmdbId: 1004211, title: 'Hollow Orbit', version: '1.4.2', sizeGb: 38.2, vetted: true, shape: 'archive', source: 'D:\\Archive\\Games\\HollowOrbit-1.4.2.7z', description: 'A slow, lonely survival sim aboard a derelict ring station. Scavenge, patch the hull, and decide what to keep powered as the orbit decays.' },
  { tmdbId: 1004987, title: 'Saltmarsh', version: '0.9.7', sizeGb: 6.4, vetted: true, shape: 'installer', source: 'D:\\Archive\\Installers\\Saltmarsh_setup_0.9.7.exe', description: 'Tidal farming and quiet trade between three fishing villages. Seasons turn on the moon, not the calendar.' },
  { tmdbId: 1005302, title: 'Cinder Protocol', version: '2.1.0', sizeGb: 71.9, vetted: true, shape: 'archive', source: '\\\\nas\\games\\cinder-protocol-2.1.0.zip', description: 'Squad tactics in a city that burns a little more every turn. Fire spreads, smoke blinds, and nothing you build lasts.' },
  { tmdbId: 1005618, title: 'Tidewright', version: '1.0.3', sizeGb: 12.8, vetted: true, shape: 'installer', source: 'E:\\Backups\\tidewright-setup.exe', description: 'Shipbuilding puzzler. Every plank is simulated, every leak is your fault.' },
  { tmdbId: 1006045, title: 'Lantern Keep', version: '3.2.1', sizeGb: 22.5, vetted: false, shape: 'archive', source: 'D:\\Archive\\Games\\LanternKeep-3.2.1.7z', description: 'A roguelite about keeping one light lit through an endless night. Rooms rearrange whenever the flame gutters.' },
  { tmdbId: 1006391, title: 'Quiet Engines', version: '1.1.0', sizeGb: 4.1, vetted: true, shape: 'installer', source: 'D:\\Archive\\Installers\\QuietEngines_1.1.0.exe', description: 'Factory automation with a strict noise budget. Machines that run too loud wake the neighbours.' },
  { tmdbId: 1006720, title: 'Paper Kingdoms', version: '0.4.0', sizeGb: 2.3, vetted: true, shape: 'archive', source: 'D:\\Archive\\Games\\PaperKingdoms-0.4.0.zip', description: 'Fold, cut and stack paper provinces into a working realm. Rain is a natural disaster.' },
  { tmdbId: 1007134, title: 'Northbound', version: '2.0.5', sizeGb: 54.7, vetted: true, shape: 'folder', source: '\\\\nas\\games\\Northbound-2.0.5', description: 'An overland expedition across a frozen continent. Ration, navigate, and keep the dogs fed.' },
  { tmdbId: 1007509, title: 'Glasswing', version: '1.3.0', sizeGb: 18.9, vetted: true, shape: 'archive', source: '\\\\nas\\games\\glasswing-1.3.0.7z', description: 'A flight game about a courier moth carrying letters across a city of greenhouses.' },
  { tmdbId: 1007852, title: 'Rust & Rhyme', version: '1.0.0', sizeGb: 9.6, vetted: false, shape: 'installer', source: 'E:\\Backups\\rust-and-rhyme-setup.exe', description: 'A rhythm brawler where a scrapyard band fights its way to the county fair.' },
  { tmdbId: 1008266, title: 'Low Tide Racing', version: '0.8.2', sizeGb: 7.7, vetted: false, description: 'Arcade racing on sandbars that only exist between tides. Miss the window and the track is gone.' },
  { tmdbId: 1008613, title: 'Vault Seventeen', version: '1.2.4', sizeGb: 31.0, vetted: true, description: 'A heist planner. Spend days casing the vault, then watch the plan unravel in under four minutes.' }
]

interface ShowSeed {
  title: string
  year: number
  rating: number
  seasons: number
  episodesPerSeason: number
  minutes: number
  tmdbId: number
}

const SHOW_SEEDS: ShowSeed[] = [
  { tmdbId: 94605, title: 'The Long Shift', year: 2021, rating: 8.4, seasons: 2, episodesPerSeason: 8, minutes: 48 },
  { tmdbId: 71912, title: 'Harbor Lights', year: 2019, rating: 7.9, seasons: 3, episodesPerSeason: 6, minutes: 42 },
  { tmdbId: 215103, title: 'Marrow', year: 2023, rating: 8.8, seasons: 1, episodesPerSeason: 8, minutes: 55 },
  { tmdbId: 119051, title: 'Static Season', year: 2020, rating: 7.2, seasons: 2, episodesPerSeason: 10, minutes: 24 },
  { tmdbId: 88329, title: 'Copper Coast', year: 2018, rating: 8.1, seasons: 2, episodesPerSeason: 6, minutes: 58 },
  { tmdbId: 736526, title: 'Small Hours', year: 2022, rating: 7.6, seasons: 1, episodesPerSeason: 1, minutes: 104 },
  { tmdbId: 204154, title: 'Orbiters', year: 2024, rating: 8.0, seasons: 2, episodesPerSeason: 6, minutes: 46 },
  { tmdbId: 592695, title: 'The Cartographers', year: 2017, rating: 7.4, seasons: 1, episodesPerSeason: 1, minutes: 121 }
]

const EPISODE_WORDS = ['Arrival', 'Undertow', 'Glass', 'The Ledger', 'Northern Line', 'Lamps', 'Second Watch', 'Ballast', 'Dead Reckoning', 'Salt', 'Low Light', 'Return']

function slug(title: string): string {
  return title.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function buildSeed(now: number): SeedData {
  const games: Game[] = GAME_SEEDS.map((seed, i) => {
    const id = `g-${slug(seed.title)}`
    return {
      id,
      title: seed.title,
      art: makeArt(id, { width: 600, height: 900, label: seed.title }),
      hero: makeArt(`${id}-hero`, { width: 2100, height: 900 }),
      version: seed.version,
      sizeBytes: Math.round(seed.sizeGb * GB),
      description: seed.description,
      source: seed.source,
      shape: seed.shape,
      exeHint: `${seed.title.replace(/[^A-Za-z0-9]/g, '')}.exe`,
      tmdbId: seed.tmdbId,
      vetted: seed.vetted,
      addedAt: now - (i + 1) * 3 * DAY
    }
  })

  const shows: Show[] = SHOW_SEEDS.map((seed) => {
    const id = `s-${slug(seed.title)}`
    return {
      id,
      title: seed.title,
      poster: makeArt(id, { width: 600, height: 900, label: seed.title }),
      hero: makeArt(`${id}-hero`, { width: 2100, height: 900 }),
      year: seed.year,
      rating: seed.rating,
      seasons: Array.from({ length: seed.seasons }, (_, s) => s + 1),
      tmdbId: seed.tmdbId
    }
  })

  // Watch progress per show: [season, episode, fraction] for the in-progress episode.
  const progressByShow: Record<string, [number, number, number]> = {
    's-the-long-shift': [1, 4, 0.62],
    's-harbor-lights': [2, 3, 0.35],
    's-marrow': [1, 6, 0.78],
    's-static-season': [1, 9, 0.44],
    's-small-hours': [1, 1, 0.51]
  }

  const episodes: Episode[] = []
  SHOW_SEEDS.forEach((seed, showIndex) => {
    const show = shows[showIndex]
    const progress = progressByShow[show.id]
    for (const season of show.seasons) {
      for (let episode = 1; episode <= seed.episodesPerSeason; episode++) {
        const id = `${show.id}-s${season}e${episode}`
        const durationSec = seed.minutes * 60
        let positionSec = 0
        if (progress) {
          const [ps, pe, fraction] = progress
          if (season < ps || (season === ps && episode < pe)) positionSec = durationSec
          else if (season === ps && episode === pe) positionSec = Math.round(durationSec * fraction)
        }
        episodes.push({
          id,
          showId: show.id,
          season,
          episode,
          title: seed.episodesPerSeason === 1 ? show.title : EPISODE_WORDS[(episode + season * 3) % EPISODE_WORDS.length],
          still: makeArt(id, { width: 640, height: 360 }),
          durationSec,
          positionSec
        })
      }
    }
  })

  const byId = (id: string) => games.find((g) => g.id === id)!
  const gameEntry = (gameId: string, state: LibraryEntry['state'], installed: boolean, daysAgo: number, playHours: number): LibraryEntry => ({
    id: `lib-${gameId}`,
    kind: 'game',
    refId: gameId,
    path: installed ? `D:\\Mist\\Library\\${byId(gameId).title.replace(/[^A-Za-z0-9]/g, '')}` : undefined,
    addedAt: now - (daysAgo + 10) * DAY,
    lastPlayedAt: playHours > 0 ? now - daysAgo * DAY : undefined,
    playtimeSec: Math.round(playHours * 3600),
    state
  })

  const library: LibraryEntry[] = [
    gameEntry('g-hollow-orbit', 'ready', true, 0, 41.5),
    gameEntry('g-saltmarsh', 'ready', true, 2, 12.2),
    gameEntry('g-cinder-protocol', 'update', true, 5, 88),
    gameEntry('g-tidewright', 'ready', true, 9, 3.4),
    gameEntry('g-quiet-engines', 'ready', true, 14, 6.1),
    gameEntry('g-paper-kingdoms', 'missing', false, 30, 1.2),
    gameEntry('g-northbound', 'missing', false, 0, 0),
    gameEntry('g-glasswing', 'missing', false, 0, 0),
    gameEntry('g-lantern-keep', 'missing', false, 0, 0),
    gameEntry('g-rust-and-rhyme', 'missing', false, 0, 0),
    ...['s-the-long-shift', 's-harbor-lights', 's-marrow', 's-static-season', 's-small-hours'].map((showId, i): LibraryEntry => ({
      id: `lib-${showId}`,
      kind: 'show',
      refId: showId,
      path: `D:\\Mist\\Shows\\${showId.slice(2)}`,
      addedAt: now - (i + 4) * DAY,
      lastPlayedAt: now - i * 3_600_000,
      playtimeSec: 0,
      state: 'ready'
    }))
  ]

  const job = (gameId: string, state: DownloadJob['state'], progress: number, order: number): DownloadJob => {
    const bytesTotal = byId(gameId).sizeBytes
    return {
      id: `job-${gameId}`,
      gameId,
      state,
      progress,
      bytesTotal,
      bytesDone: Math.round(bytesTotal * progress),
      speedBps: 0,
      attempts: 0,
      createdAt: now - (10 - order) * 60_000
    }
  }

  // Real transfers only: one paused job. Resuming it copies from its source path.
  const jobs: DownloadJob[] = [job('g-glasswing', 'paused', 0.55, 1)]

  return { games, shows, episodes, library, jobs }
}

/** Default folders live under the user's home so they exist on any machine. */
export function defaultPaths(home: string): Pick<Settings, 'libraryPath' | 'stagingPath' | 'saveBackupPath'> {
  return {
    libraryPath: join(home, 'Mist Data', 'Library'),
    stagingPath: join(home, 'Mist Data', 'Staging'),
    saveBackupPath: join(home, 'Mist Data', 'SaveBackups')
  }
}

export function defaultSettings(home: string): Settings {
  return {
    ...defaultPaths(home),
    concurrentDownloads: 1,
    sources: [
      { id: 'local', name: 'Local folders', enabled: true },
      { id: 'nas', name: 'NAS share (\\\\nas\\games)', enabled: true },
      { id: 'removable', name: 'Removable drives', enabled: true }
    ],
    cacheBytes: Math.round(1.7 * GB),
    theme: 'mist',
    hardwareDecode: true,
    mpvBannerDismissed: false,
    tmdbKey: '',
    tmdbLanguage: 'en-US',
    downloadHosts: []
  }
}
