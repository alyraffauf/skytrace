import type { ActorSuggestion } from '../../types'
import { ImageWithFallback } from '../ui/ImageWithFallback'
import { ComboboxOption, ComboboxOptions } from '@headlessui/react'

export function ActorSuggestions({ suggestions, isFetching }: { suggestions: ActorSuggestion[]; isFetching: boolean }) {
  return (
    <ComboboxOptions
      anchor={{ to: 'bottom', gap: 6 }}
      modal={false}
      aria-label="Account suggestions"
      className="z-50 w-[var(--input-width)] [--anchor-max-height:20rem] rounded-sm border border-zinc-300 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
    >
      {isFetching && suggestions.length === 0 ? (
        <p role="status" className="p-3 text-sm text-zinc-500 dark:text-zinc-400">
          Searching...
        </p>
      ) : suggestions.length > 0 ? (
        suggestions.map((suggestion) => (
          <ComboboxOption
            key={suggestion.did}
            value={suggestion}
            className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left data-focus:bg-violet-50 dark:data-focus:bg-violet-950/40"
          >
            <ImageWithFallback
              src={suggestion.avatar}
              alt=""
              fallback="avatar"
              fallbackClassName="size-8 shrink-0 rounded-full"
              className="size-8 shrink-0 rounded-full object-cover"
            />
            <span className="min-w-0">
              {suggestion.displayName && (
                <span className="block truncate text-sm font-medium text-zinc-950 dark:text-zinc-100">
                  {suggestion.displayName}
                </span>
              )}
              <span
                className={`block truncate text-sm ${suggestion.displayName ? 'text-zinc-600 dark:text-zinc-400' : 'font-medium text-zinc-950 dark:text-zinc-100'}`}
              >
                @{suggestion.handle}
              </span>
            </span>
          </ComboboxOption>
        ))
      ) : (
        <p role="status" className="p-3 text-sm text-zinc-500 dark:text-zinc-400">
          No matching accounts
        </p>
      )}
    </ComboboxOptions>
  )
}
