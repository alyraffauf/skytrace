import { ArrowUpRightIcon, EllipsisHorizontalIcon } from '@heroicons/react/20/solid'
import { useRecordLinksPopup } from './useRecordLinksPopup'
import { createPortal } from 'react-dom'
import { SOCIAL_APPS } from '../config/socialApps'
import { pdslsRecordUrl, skythreadPostUrl } from '../lib/links'

const PDSLS_FAVICON = '/favicons/pdsls.ico'

export function RecordLinksMenu({
  recordUri,
  socialPath,
  label,
}: {
  recordUri: string
  socialPath?: string
  label: string
}) {
  const { containerRef, buttonRef, popupRef, firstLinkRef, popupId, isOpen, popupPosition, toggle, close } =
    useRecordLinksPopup()
  const recordUrl = pdslsRecordUrl(recordUri)
  const skythreadUrl = skythreadPostUrl(recordUri)

  if (!recordUrl) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Open links for ${label}`}
        aria-expanded={isOpen}
        aria-controls={popupId}
        onClick={toggle}
        className="grid size-10 place-items-center text-zinc-600 hover:text-violet-800 dark:text-zinc-400 dark:hover:text-violet-300 sm:size-8"
      >
        <EllipsisHorizontalIcon className="size-5" aria-hidden="true" />
      </button>
      {isOpen &&
        createPortal(
          <div
            ref={popupRef}
            id={popupId}
            data-record-links
            style={{
              left: popupPosition.left,
              top: popupPosition.top,
              visibility: popupPosition.ready ? 'visible' : 'hidden',
            }}
            className="fixed z-[100] w-40 max-w-[calc(100vw-1rem)] overflow-hidden rounded-sm border border-zinc-300 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/40"
          >
            <MenuLink ref={firstLinkRef} href={recordUrl} label="PDSls" favicon={PDSLS_FAVICON} close={close} />
            {socialPath &&
              SOCIAL_APPS.map((app) => (
                <MenuLink
                  key={app.origin}
                  href={`${app.origin}${socialPath}`}
                  label={app.label}
                  favicon={app.favicon}
                  close={close}
                />
              ))}
            {skythreadUrl && <MenuLink href={skythreadUrl} label="Skythread" icon="🌤" close={close} />}
          </div>,
          document.body,
        )}
    </div>
  )
}

type MenuLinkProps = {
  ref?: React.Ref<HTMLAnchorElement>
  href: string
  label: string
  close: () => void
} & ({ favicon: string; icon?: never } | { favicon?: never; icon: string })

const MenuLink = ({ ref, href, label, favicon, icon, close }: MenuLinkProps) => {
  return (
    <a
      ref={ref}
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={close}
      className="flex min-h-11 items-center gap-2 px-2.5 py-1.5 text-sm text-zinc-800 hover:bg-violet-50 hover:text-violet-900 dark:text-zinc-200 dark:hover:bg-violet-950/40 dark:hover:text-violet-200 sm:min-h-10"
    >
      <span className="grid size-4 shrink-0 place-items-center" aria-hidden="true">
        {icon ?? (
          <img
            src={favicon}
            alt=""
            className="max-h-4 max-w-4 object-contain"
            onError={(event) => {
              event.currentTarget.hidden = true
            }}
          />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ArrowUpRightIcon className="size-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
    </a>
  )
}
