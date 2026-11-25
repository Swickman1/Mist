export function hostAllowed(hostname: string, allowed: readonly string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return allowed.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))
}
