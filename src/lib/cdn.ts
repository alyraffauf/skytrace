type ImageTransform = 'avatar' | 'feed_thumbnail' | 'feed_fullsize'

export function cdnImageUrl(transform: ImageTransform, did: string, cid: string, format = 'jpeg'): string {
  return `https://cdn.bsky.app/img/${transform}/plain/${did}/${cid}@${format}`
}

export function pdsBlobUrl(pds: string, did: string, cid: string): string {
  const url = new URL('/xrpc/com.atproto.sync.getBlob', pds)
  url.searchParams.set('did', did)
  url.searchParams.set('cid', cid)
  return url.toString()
}
