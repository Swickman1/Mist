// mist-media:// serves local video files to the renderer (file:// is not loadable
// from the dev server origin). Main only serves paths that are indexed episodes.

export const MEDIA_SCHEME = 'mist-media'

export function mediaUrl(filePath: string): string {
  return `${MEDIA_SCHEME}://local/${encodeURIComponent(filePath)}`
}

export function mediaPath(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
}
