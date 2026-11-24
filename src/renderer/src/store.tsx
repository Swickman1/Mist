// Renderer state: one snapshot from the main process plus transient UI state.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ActionResult, Snapshot } from '../../shared/types'
import { ui } from './config'

export const api = window.mist

export type AddKind = 'game' | 'show'

export interface Toast {
  id: number
  message: string
  tone: 'info' | 'error'
}

interface MistContext {
  snapshot: Snapshot
  toasts: Toast[]
  notify(result: ActionResult | string): void
  addFlow: AddKind | null
  openAddFlow(kind: AddKind | null): void
  playingEpisodeId: string | null
  openPlayer(episodeId: string | null): void
  railCollapsed: boolean
  toggleRail(): void
}

const Context = createContext<MistContext | null>(null)

export function MistProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [addFlow, openAddFlow] = useState<AddKind | null>(null)
  const [playingEpisodeId, openPlayer] = useState<string | null>(null)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const toastId = useRef(0)

  useEffect(() => {
    api.snapshot().then(setSnapshot)
    const offSnapshot = api.onSnapshot(setSnapshot)
    const offJobs = api.onJobs((jobs) => setSnapshot((current) => (current ? { ...current, jobs } : current)))
    return () => {
      offSnapshot()
      offJobs()
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = snapshot?.settings.theme ?? 'mist'
  }, [snapshot?.settings.theme])

  const notify = useCallback((result: ActionResult | string) => {
    const toast: Toast =
      typeof result === 'string'
        ? { id: ++toastId.current, message: result, tone: 'info' }
        : { id: ++toastId.current, message: result.message, tone: result.ok ? 'info' : 'error' }
    setToasts((list) => [...list, toast])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== toast.id)), ui.toastMs)
  }, [])

  const toggleRail = useCallback(() => setRailCollapsed((value) => !value), [])

  const value = useMemo(
    () =>
      snapshot && {
        snapshot,
        toasts,
        notify,
        addFlow,
        openAddFlow,
        playingEpisodeId,
        openPlayer,
        railCollapsed,
        toggleRail
      },
    [snapshot, toasts, notify, addFlow, playingEpisodeId, railCollapsed, toggleRail]
  )

  if (!value) return <div className="boot" />
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useMist(): MistContext {
  const value = useContext(Context)
  if (!value) throw new Error('useMist outside MistProvider')
  return value
}
