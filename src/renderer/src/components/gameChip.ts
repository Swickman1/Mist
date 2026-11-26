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
    if (state === 'blocked') {
      return {
        state,
        label: 'ALLOW',
        title: `Allow ${job?.host ?? job?.reason}`,
        onClick: async (event) => {
          event.stopPropagation()
          const ok = await confirm({ title: 'Allow download host', message: `Allow downloads from ${job?.host ?? job?.reason}?`, confirmLabel: 'Allow' })
          if (ok) notify(await api.allowHost(job!.host!, job!.id))
        }
      }
    }
    if (state === 'missing' && !wasInstalled(entry)) return install
    return { state, label: state === 'downloading' && job ? `DOWNLOADING ${formatPercent(job.progress)}` : state.toUpperCase() }
  }

  const blockedHost = job?.host ?? (game.origin === 'index' ? hostFor(game.source) : undefined)
  const allow: GameChip | undefined =
    blockedHost && !hostAllowed(blockedHost, snapshot.settings.downloadHosts)
      ? {
          state: 'blocked',
          label: 'ALLOW',
          title: `Allow ${blockedHost}`,
          onClick: async (event) => {
            event.stopPropagation()
            const ok = await confirm({ title: 'Allow download host', message: `Allow downloads from ${blockedHost}?`, confirmLabel: 'Allow' })
            if (ok) notify(await api.allowHost(blockedHost, job?.id))
          }
        }
      : undefined

  if (allow) return allow
  return install
}
