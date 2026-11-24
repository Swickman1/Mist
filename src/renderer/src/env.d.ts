import type { MistApi } from '../../shared/types'

declare global {
  interface Window {
    mist: MistApi
  }
}
