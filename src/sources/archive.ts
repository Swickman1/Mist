import type { Resolver } from './index'

export const archiveResolver: Resolver = {
  async resolve() {
    throw new Error('archive resolver: not implemented')
  }
}
