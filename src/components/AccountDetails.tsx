import { ChevronRightIcon } from '@heroicons/react/24/outline'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { formatDate } from '../lib/dates'
import type { PublicDataService } from '../data/publicData'
import type { ActorProfile } from '../types'

export function AccountDetails({
  identity,
  service,
}: {
  identity: ActorProfile['identity']
  service: PublicDataService
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const detailsQuery = useQuery({ ...service.core.accountDetailsQueryOptions(identity.did), enabled: detailsOpen })
  const pdsUrl = new URL(identity.pds)
  return (
    <details
      onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      className="group mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800"
    >
      <summary className="flex min-h-9 cursor-pointer list-none items-start gap-2.5 text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100">
        <ChevronRightIcon className="mt-0.5 size-4 shrink-0 group-open:rotate-90" aria-hidden="true" />
        <span>
          <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">Account details</span>
          <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-500">DID, PDS, and identity history</span>
        </span>
      </summary>
      <dl className="mt-4 grid gap-3 text-xs text-zinc-500 dark:text-zinc-400">
        {detailsQuery.data?.createdAt && (
          <Detail label="Created" value={formatDate(detailsQuery.data.createdAt) ?? detailsQuery.data.createdAt} />
        )}
        {detailsQuery.data?.aliases.length ? (
          <DetailList label="Aliases" values={detailsQuery.data.aliases.map(formatAlias)} />
        ) : null}
        {detailsQuery.data?.formerHandles.length ? (
          <DetailList label="Former handles" values={detailsQuery.data.formerHandles.map((handle) => `@${handle}`)} />
        ) : null}
        <div className="min-w-0">
          <dt className="font-medium text-zinc-700 dark:text-zinc-300">Decentralized Identifier</dt>
          <dd className="mt-1 break-all font-mono text-[11px]">{identity.did}</dd>
        </div>
        <div className="min-w-0">
          <dt className="font-medium text-zinc-700 dark:text-zinc-300">Personal Data Server</dt>
          <dd className="mt-1 break-all font-mono text-[11px]">
            <a
              href={identity.pds}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-violet-700 hover:underline dark:text-violet-300"
            >
              <img
                src={new URL('/favicon.ico', pdsUrl).toString()}
                alt=""
                className="size-3.5 shrink-0 object-contain"
                onError={(event) => {
                  event.currentTarget.hidden = true
                }}
              />
              {pdsUrl.host}
            </a>
          </dd>
        </div>
        {detailsOpen && detailsQuery.isPending && (
          <div className="text-zinc-500 dark:text-zinc-400">Loading identity history...</div>
        )}
        {detailsQuery.isError && <div className="text-zinc-500 dark:text-zinc-400">Identity history unavailable.</div>}
      </dl>
    </details>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-medium text-zinc-700 dark:text-zinc-300">{label}</dt>
      <dd className="mt-1 break-all font-mono text-[11px]">{value}</dd>
    </div>
  )
}

function DetailList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="min-w-0">
      <dt className="font-medium text-zinc-700 dark:text-zinc-300">{label}</dt>
      <dd className="mt-1">
        <ul className="grid gap-1 font-mono text-[11px]">
          {values.map((value) => (
            <li key={value} className="break-all">
              {value}
            </li>
          ))}
        </ul>
      </dd>
    </div>
  )
}

function formatAlias(alias: string): string {
  return alias.startsWith('at://') ? `@${alias.slice(5)}` : alias
}
