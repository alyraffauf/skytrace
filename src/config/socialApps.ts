export const SOCIAL_APPS = [
  { label: 'Bluesky', origin: 'https://bsky.app', favicon: '/favicons/bluesky.png' },
  { label: 'Blacksky', origin: 'https://blacksky.community', favicon: '/favicons/blacksky.png' },
  { label: 'Witchsky', origin: 'https://witchsky.app', favicon: '/favicons/witchsky.ico' },
  { label: 'mu', origin: 'https://mu.social', favicon: '/favicons/mu.png' },
] as const

const socialAppHostnames = new Set(SOCIAL_APPS.map((app) => new URL(app.origin).hostname))

export function isSocialAppHostname(hostname: string): boolean {
  return socialAppHostnames.has(hostname.toLowerCase().replace(/^www\./, ''))
}
