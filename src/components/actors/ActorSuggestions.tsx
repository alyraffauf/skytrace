import type { ActorSuggestion } from '../../types'
import { ImageWithFallback } from '../ui/ImageWithFallback'

export function ActorSuggestions({
  listboxId,
  suggestions,
  isFetching,
  activeIndex,
  onActiveIndexChange,
  onSelect,
}: {
  listboxId: string
  suggestions: ActorSuggestion[]
  isFetching: boolean
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onSelect: (suggestion: ActorSuggestion) => void
}) {
  return (
    <div className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-sm border border-zinc-300 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      {isFetching && suggestions.length === 0 ? (
        <p role="status" className="p-3 text-sm text-zinc-500 dark:text-zinc-400">
          Searching...
        </p>
      ) : suggestions.length > 0 ? (
        <ul id={listboxId} role="listbox" aria-label="Account suggestions" className="max-h-80 overflow-y-auto py-1">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.did} role="none">
              <button
                id={`${listboxId}-${index}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                tabIndex={-1}
                onPointerDown={(event) => event.preventDefault()}
                onPointerMove={() => onActiveIndexChange(index)}
                onClick={() => onSelect(suggestion)}
                className={`flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left ${activeIndex === index ? 'bg-violet-50 dark:bg-violet-950/40' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
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
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p role="status" className="p-3 text-sm text-zinc-500 dark:text-zinc-400">
          No matching accounts
        </p>
      )}
    </div>
  )
}
