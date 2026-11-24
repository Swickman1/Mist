import type { Resolver } from './index'

export const magnetResolver: Resolver = {
  async resolve() {
    throw new Error('magnet resolver: not implemented')
  }
}
