// The one rule for a game card's state chip, shared by every GameTile.
// A card is never left without an action when there is something to do:
// a failed job offers RETRY, and a game that was never installed offers INSTALL.
import { hostAllowed } from '../../../shared/hosts'
import type { DownloadJob, Game, LibraryEntry } from '../../../shared/types'
import { formatPercent, tileState, wasInstalled, type TileState } from '../selectors'
import { api, useMist } from '../store'

export type ChipState = TileState | 'blocked' | 'install'

export interface GameChip {
  state: ChipState
  label: string
  title?: string
  onClick?: (event: React.MouseEvent) => void
}

function hostFor(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return undefined
  }
}

/** The chip for a card: library state, RETRY, HOST BLOCKED or INSTALL. */
export function useGameChip(game: Game, entry: LibraryEntry | undefined, job: DownloadJob | undefined): GameChip {
  const { snapshot, notify, confirm } = useMist()

  const install: GameChip = {
    state: 'install',
    label: 'INSTALL',
    onClick: (event) => {
      event.stopPropagation()
      api.install(game.id)
    }
  }

  if (entry) {
    const state = tileState(entry, job)
    if (state === 'failed') {
      return {
        state,
        label: 'RETRY',
        title: job!.reason,
        onClick: (event) => {
          event.stopPropagation()
          api.retryJob(job!.id)
        }
      }
    }
    if (state === 'missing' && !wasInstalled(entry)) return install
    return { state, label: state === 'downloading' && job ? `DOWNLOADING ${formatPercent(job.progress)}` : state.toUpperCase() }
  }

  const host = game.origin === 'index' ? hostFor(game.source) : undefined
  if (host && !hostAllowed(host, snapshot.settings.downloadHosts)) {
    return {
      state: 'blocked',
      label: 'HOST BLOCKED',
      title: `Allow ${host}`,
      onClick: async (event) => {
        event.stopPropagation()
        const allowed = await confirm({ title: 'Allow download host', message: `Allow downloads from ${host}?`, confirmLabel: 'Allow' })
        if (!allowed) return
        const hosts = new Set(snapshot.settings.downloadHosts)
        hosts.add(host)
        notify(await api.setDownloadHosts([...hosts].join('\n')))
      }
    }
  }
  return install
}
