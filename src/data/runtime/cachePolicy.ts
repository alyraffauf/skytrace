const MINUTE_MS = 60_000

export const CACHE_TTL_MS = {
  identity: 10 * MINUTE_MS,
  profile: 2 * MINUTE_MS,
  record: 2 * MINUTE_MS,
  activity: MINUTE_MS,
} as const
