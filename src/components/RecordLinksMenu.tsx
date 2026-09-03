import { ArrowUpRightIcon, EllipsisHorizontalIcon } from '@heroicons/react/20/solid'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { pdslsRecordUrl, socialAppOrigins } from '../lib/links'

const socialApps = [
  { label: 'Bluesky', origin: socialAppOrigins.bluesky, favicon: '/favicons/bluesky.png' },
  { label: 'Blacksky', origin: socialAppOrigins.blacksky, favicon: '/favicons/blacksky.png' },
  { label: 'Witchsky', origin: socialAppOrigins.witchsky, favicon: '/favicons/witchsky.ico' },
  { label: 'mu', origin: socialAppOrigins.mu, favicon: '/favicons/mu.png' },
] as const

const PDSLS_FAVICON = '/favicons/pdsls.ico'

type RelatedRecord = { uri: string; label: string }

export function RecordLinksMenu({
  recordUri,
  socialPath,
  label,
  relatedRecords = [],
}: {
  recordUri: string
  socialPath?: string
  label: string
  relatedRecords?: RelatedRecord[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const popupId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const firstLinkRef = useRef<HTMLAnchorElement>(null)
  const [popupPosition, setPopupPosition] = useState({ left: 0, top: 0, ready: false })
  const recordUrl = pdslsRecordUrl(recordUri)

  const positionPopup = useCallback(() => {
    const button = buttonRef.current
    const popup = popupRef.current
    if (!button || !popup) return
    const margin = 8
    const gap = 4
    const buttonBounds = button.getBoundingClientRect()
    const popupBounds = popup.getBoundingClientRect()
    const left = Math.min(
      Math.max(margin, buttonBounds.right - popupBounds.width),
      window.innerWidth - popupBounds.width - margin,
    )
    const below = buttonBounds.bottom + gap
    const top =
      below + popupBounds.height <= window.innerHeight - margin
        ? below
        : Math.max(margin, buttonBounds.top - popupBounds.height - gap)
    setPopupPosition({ left, top, ready: true })
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) return
    positionPopup()
  }, [isOpen, positionPopup])

  useEffect(() => {
    if (!isOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node
      if (!containerRef.current?.contains(target) && !popupRef.current?.contains(target)) setIsOpen(false)
    }
    const closeOnFocusExit = (event: FocusEvent) => {
      const target = event.target as Node
      if (!containerRef.current?.contains(target) && !popupRef.current?.contains(target)) setIsOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('focusin', closeOnFocusExit)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', positionPopup)
    window.addEventListener('scroll', positionPopup, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('focusin', closeOnFocusExit)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', positionPopup)
      window.removeEventListener('scroll', positionPopup, true)
    }
  }, [isOpen, positionPopup])

  useEffect(() => {
    if (isOpen && popupPosition.ready) firstLinkRef.current?.focus()
  }, [isOpen, popupPosition.ready])

  if (!recordUrl) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Open links for ${label}`}
        aria-expanded={isOpen}
        aria-controls={popupId}
        onClick={() => {
          setPopupPosition((position) => ({ ...position, ready: false }))
          setIsOpen((open) => !open)
        }}
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
            <MenuLink
              ref={firstLinkRef}
              href={recordUrl}
              label="PDSls"
              favicon={PDSLS_FAVICON}
              close={() => setIsOpen(false)}
            />
            {relatedRecords.map((record) => {
              const url = pdslsRecordUrl(record.uri)
              return url ? (
                <MenuLink
                  key={record.uri}
                  href={url}
                  label={record.label}
                  favicon={PDSLS_FAVICON}
                  close={() => setIsOpen(false)}
                />
              ) : null
            })}
            {socialPath &&
              socialApps.map((app) => (
                <MenuLink
                  key={app.origin}
                  href={`${app.origin}${socialPath}`}
                  label={app.label}
                  favicon={app.favicon}
                  close={() => setIsOpen(false)}
                />
              ))}
          </div>,
          document.body,
        )}
    </div>
  )
}

const MenuLink = ({
  ref,
  href,
  label,
  favicon,
  close,
}: {
  ref?: React.Ref<HTMLAnchorElement>
  href: string
  label: string
  favicon: string
  close: () => void
}) => {
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
        <img
          src={favicon}
          alt=""
          className="max-h-4 max-w-4 object-contain"
          onError={(event) => {
            event.currentTarget.hidden = true
          }}
        />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ArrowUpRightIcon className="size-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
    </a>
  )
}
