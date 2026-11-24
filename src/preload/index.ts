import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, MIST_METHODS, type DownloadJob, type MistApi, type Snapshot } from '../shared/types'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const calls = Object.fromEntries(
  MIST_METHODS.map((method) => [method, (...args: unknown[]) => ipcRenderer.invoke(IPC.call, method, args)])
)

const api = {
  ...calls,
  onSnapshot: (listener: (snapshot: Snapshot) => void) => subscribe(IPC.snapshot, listener),
  onJobs: (listener: (jobs: DownloadJob[]) => void) => subscribe(IPC.jobs, listener),
  pathForFile: (file: File) => webUtils.getPathForFile(file)
} as MistApi

contextBridge.exposeInMainWorld('mist', api)
