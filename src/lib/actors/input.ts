import { isDid, isHandle } from '@atcute/lexicons/syntax'
import { isSocialAppHostname } from '../../config/socialApps'

export function normalizeActorInput(input: string): string {
  let value = input.trim()
  if (!value) throw new Error('Enter a handle, DID, or profile URL.')

  if (/^https?:\/\//i.test(value)) {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new Error('That profile URL is not valid.')
    }
    if (!isSocialAppHostname(url.hostname)) throw new Error('Use a supported social app profile URL.')
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'profile' || !parts[1]) throw new Error('That URL does not point to a profile.')
    value = decodeURIComponent(parts[1])
  }

  value = value.replace(/^@/, '').trim()
  if (isDid(value)) return value
  const handle = value.toLowerCase().replace(/\.$/, '')
  if (!isHandle(handle)) throw new Error('Enter a valid handle or DID.')
  return handle
}
