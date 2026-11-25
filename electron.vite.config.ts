import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import { embedCspSources } from './src/shared/embed'

/** Fills %EMBED_SOURCES% in index.html's CSP from EMBED_HOSTS, so the CSP and the session guard share one list. */
function embedCsp(): Plugin {
  return {
    name: 'mist-embed-csp',
    transformIndexHtml: (html) => html.replaceAll('%EMBED_SOURCES%', embedCspSources())
  }
}

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [react(), embedCsp()],
    server: { fs: { allow: ['..'] } }
  }
})
