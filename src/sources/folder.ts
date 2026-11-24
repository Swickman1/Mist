import type { Resolver } from './index'

export const folderResolver: Resolver = {
  async resolve() {
    throw new Error('folder resolver: not implemented')
  }
}
