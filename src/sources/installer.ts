import type { Resolver } from './index'

export const installerResolver: Resolver = {
  async resolve() {
    throw new Error('installer resolver: not implemented')
  }
}
