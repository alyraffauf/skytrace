import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { SOCIAL_APPS } from '../../config/socialApps'
import { pdslsRecordUrl, skythreadPostUrl, socialPathForAtUri } from '../../lib/links'

export function RecordLinksMenu({
  recordUri,
  socialPath = socialPathForAtUri(recordUri),
  label,
}: {
  recordUri: string
  socialPath?: string
  label: string
}) {
  const recordUrl = pdslsRecordUrl(recordUri)
  const skythreadUrl = skythreadPostUrl(recordUri)
  if (!recordUrl) return null

  const items = [
    { label: 'PDSls', href: recordUrl, icon: <MenuFavicon src="/favicons/pdsls.ico" /> },
    ...(socialPath
      ? SOCIAL_APPS.map((app) => ({
          label: app.label,
          href: `${app.origin}${socialPath}`,
          icon: <MenuFavicon src={app.favicon} />,
        }))
      : []),
    ...(skythreadUrl
      ? [{ label: 'Skythread', href: skythreadUrl, icon: <MenuFavicon src="/favicons/skythread.svg" /> }]
      : []),
  ].map((item) => ({ ...item, target: '_blank' as const, rel: 'noreferrer' }))

  // A sheet keeps links usable on browsers without CSS anchor positioning.
  const hasAnchors = typeof CSS !== 'undefined' && CSS.supports('anchor-name', '--skytrace')
  return (
    <MoreMenu
      label={`Open links for ${label}`}
      items={items}
      size="lg"
      alignment="end"
      presentation={hasAnchors ? 'adaptive' : 'bottom-sheet'}
    />
  )
}

function MenuFavicon({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      className="size-4 object-contain"
      onError={(event) => {
        event.currentTarget.hidden = true
      }}
    />
  )
}
