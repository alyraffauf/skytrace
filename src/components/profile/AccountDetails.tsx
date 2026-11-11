import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { formatDate } from '../../lib/dates'
import type { PublicDataService } from '../../data/publicData'
import type { ActorProfile } from '../../types'

export function AccountDetails({
  identity,
  service,
}: {
  identity: ActorProfile['identity']
  service: PublicDataService
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const detailsQuery = useQuery({ ...service.actors.accountDetailsQueryOptions(identity.did), enabled: detailsOpen })
  const pdsUrl = new URL(identity.pds)
  const aliases = (detailsQuery.data?.aliases ?? [])
    .filter((alias) => alias.toLowerCase() !== `at://${identity.handle.toLowerCase()}`)
    .map(formatAlias)
  const formerHandles = detailsQuery.data?.formerHandles ?? []
  return (
    <details onToggle={(event) => setDetailsOpen(event.currentTarget.open)} className="group mt-3">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 text-xs text-ui-muted hover:text-ui-text">
        Account details
        <ChevronDownIcon className="size-3.5 shrink-0 group-open:rotate-180" aria-hidden="true" />
      </summary>
      <dl className="mt-2 grid gap-3 text-xs">
        {detailsQuery.data?.createdAt && (
          <Detail label="Created">{formatDate(detailsQuery.data.createdAt) ?? detailsQuery.data.createdAt}</Detail>
        )}
        <Detail label="Personal Data Server">
          <a
            href={identity.pds}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 text-ui-accent hover:underline"
          >
            <img
              key={pdsUrl.origin}
              src={new URL('/favicon.ico', pdsUrl).href}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-3.5 shrink-0 object-contain"
              onError={(event) => {
                event.currentTarget.hidden = true
              }}
            />
            <span className="wrap-anywhere">{pdsUrl.host}</span>
          </a>
        </Detail>
        <Detail label="Decentralized Identifier">
          <span className="select-all break-all font-mono">{identity.did}</span>
        </Detail>
        {aliases.length > 0 && <DetailList label="Aliases" values={aliases} />}
        {formerHandles.length > 0 && (
          <DetailList label="Former handles" values={formerHandles.map((handle) => `@${handle}`)} />
        )}
      </dl>
      {detailsOpen && detailsQuery.isPending && (
        <p role="status" className="mt-3 text-xs text-ui-muted">
          Loading identity history...
        </p>
      )}
      {detailsQuery.isError && <p className="mt-3 text-xs text-ui-muted">Identity history unavailable.</p>}
    </details>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-ui-muted">{label}</dt>
      <dd className="min-w-0 text-ui-text wrap-anywhere">{children}</dd>
    </div>
  )
}

function DetailList({ label, values }: { label: string; values: string[] }) {
  return (
    <Detail label={label}>
      <ul className="grid gap-1">
        {values.map((value) => (
          <li key={value} className="wrap-anywhere">
            {value}
          </li>
        ))}
      </ul>
    </Detail>
  )
}

function formatAlias(alias: string): string {
  return alias.startsWith('at://') ? `@${alias.slice(5)}` : alias
}
