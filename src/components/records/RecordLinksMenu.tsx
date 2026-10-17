import { ArrowUpRightIcon, EllipsisHorizontalIcon } from '@heroicons/react/20/solid'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { SOCIAL_APPS } from '../../config/socialApps'
import { pdslsRecordUrl, skythreadPostUrl, socialPathForAtUri } from '../../lib/links'

const PDSLS_FAVICON = '/favicons/pdsls.ico'

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

  return (
    <Menu as="div" className="relative">
      <MenuButton
        aria-label={`Open links for ${label}`}
        className="grid size-10 place-items-center text-zinc-600 hover:text-violet-800 dark:text-zinc-400 dark:hover:text-violet-300 sm:size-8"
      >
        <EllipsisHorizontalIcon className="size-5" aria-hidden="true" />
      </MenuButton>
      <MenuItems
        anchor={{ to: 'bottom end', gap: 4, padding: 8 }}
        modal={false}
        className="z-[100] w-40 max-w-[calc(100vw-1rem)] overflow-hidden rounded-sm border border-zinc-300 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/40"
      >
        <MenuLink href={recordUrl} label="PDSls" favicon={PDSLS_FAVICON} />
        {socialPath &&
          SOCIAL_APPS.map((app) => (
            <MenuLink key={app.origin} href={`${app.origin}${socialPath}`} label={app.label} favicon={app.favicon} />
          ))}
        {skythreadUrl && <MenuLink href={skythreadUrl} label="Skythread" icon="🌤" />}
      </MenuItems>
    </Menu>
  )
}

type MenuLinkProps = {
  href: string
  label: string
} & ({ favicon: string; icon?: never } | { favicon?: never; icon: string })

const MenuLink = ({ href, label, favicon, icon }: MenuLinkProps) => {
  return (
    <MenuItem
      as="a"
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex min-h-11 items-center gap-2 px-2.5 py-1.5 text-sm text-zinc-800 data-focus:bg-violet-50 data-focus:text-violet-900 dark:text-zinc-200 dark:data-focus:bg-violet-950/40 dark:data-focus:text-violet-200 sm:min-h-10"
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
    </MenuItem>
  )
}
