import { ArrowRightIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useQuery } from '@tanstack/react-query'
import { type FormEvent, type KeyboardEvent, useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { queryKeys } from '../data/queryKeys'
import { searchActorsTypeahead } from '../data/xrpc'
import { normalizeActorInput } from '../lib/parse'
import { profilePath } from '../lib/routes'
import type { ActorSuggestion } from '../types'
import { ImageWithFallback } from './Images'

type ActorSearchProps = {
  autoFocus?: boolean
  compact?: boolean
}

export function ActorSearch({ autoFocus = false, compact = false }: ActorSearchProps) {
  const navigate = useNavigate()
  const listboxId = useId()
  const inputId = compact ? 'header-actor-search' : 'actor-search'
  const errorId = compact ? 'header-search-error' : 'search-error'
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [hasFocus, setHasFocus] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [debouncedInput, setDebouncedInput] = useState('')

  const typeaheadQuery = input.trim().replace(/^@/, '')
  const canSuggest =
    typeaheadQuery.length >= 2 && !typeaheadQuery.startsWith('did:') && !/^https?:\/\//i.test(typeaheadQuery)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedInput(canSuggest ? typeaheadQuery : ''), 180)
    return () => window.clearTimeout(timer)
  }, [canSuggest, typeaheadQuery])

  const suggestionsQuery = useQuery({
    queryKey: queryKeys.actorSuggestions(debouncedInput),
    queryFn: ({ signal }) => searchActorsTypeahead(debouncedInput, signal),
    enabled: hasFocus && debouncedInput.length >= 2,
    staleTime: 5 * 60_000,
  })
  const suggestions = suggestionsQuery.data ?? []
  const showSuggestions =
    hasFocus &&
    !isDismissed &&
    canSuggest &&
    debouncedInput === typeaheadQuery &&
    (suggestionsQuery.isFetching || suggestionsQuery.isSuccess)

  useEffect(() => {
    setActiveIndex((current) => (current >= suggestions.length ? suggestions.length - 1 : current))
  }, [suggestions.length])

  function selectSuggestion(suggestion: ActorSuggestion) {
    setInput(`@${suggestion.handle}`)
    setError('')
    setIsDismissed(true)
    navigate(profilePath(suggestion.did))
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && showSuggestions) {
      event.preventDefault()
      setIsDismissed(true)
      setActiveIndex(-1)
      return
    }
    if (!showSuggestions || suggestions.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      selectSuggestion(suggestions[activeIndex >= 0 ? activeIndex : 0])
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const actor = normalizeActorInput(input)
      setError('')
      navigate(profilePath(actor))
    } catch (inputError) {
      setError(inputError instanceof Error ? inputError.message : 'Enter a valid account.')
    }
  }

  return (
    <form
      onSubmit={submit}
      onFocus={() => setHasFocus(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHasFocus(false)
      }}
      className={compact ? 'relative w-full max-w-md' : 'relative w-full'}
      noValidate
    >
      <label htmlFor={inputId} className="sr-only">
        AT Protocol account
      </label>
      <div className="relative">
        <MagnifyingGlassIcon
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 ${compact ? 'left-3 size-[18px]' : 'left-4 size-5'}`}
          aria-hidden="true"
        />
        <input
          id={inputId}
          value={input}
          onChange={(event) => {
            setInput(event.target.value)
            setIsDismissed(false)
            setActiveIndex(-1)
            if (error) setError('')
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={compact ? 'Search...' : 'Handle, DID, or profile URL'}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          aria-autocomplete="list"
          aria-controls={showSuggestions ? listboxId : undefined}
          aria-expanded={showSuggestions}
          aria-activedescendant={showSuggestions && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          role="combobox"
          autoComplete="off"
          autoFocus={autoFocus}
          className={`${compact ? 'h-8 rounded-sm pl-10 pr-11 text-base md:text-sm' : 'h-14 rounded-md pl-12 pr-14 text-base shadow-[0_10px_35px_-22px_rgba(124,58,237,0.45)]'} w-full border bg-white text-zinc-950 outline-none placeholder:text-zinc-400 focus-visible:border-violet-500 focus-visible:ring-1 focus-visible:ring-violet-500 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:border-violet-400 dark:focus-visible:ring-violet-400 ${error ? 'border-red-500' : compact ? 'border-zinc-500 hover:border-zinc-700 dark:border-zinc-500 dark:hover:border-zinc-300' : 'border-violet-500 hover:border-violet-700 dark:border-violet-500 dark:hover:border-violet-300'}`}
        />
        <button
          type="submit"
          aria-label="Explore profile"
          className={`${compact ? 'right-0 size-10 text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100' : 'right-0 size-14 text-violet-600 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-200'} absolute top-1/2 grid -translate-y-1/2 place-items-center`}
        >
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      {showSuggestions && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-sm border border-zinc-300 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {suggestionsQuery.isFetching && suggestions.length === 0 ? (
            <p role="status" className="px-3 py-3 text-sm text-zinc-500 dark:text-zinc-400">
              Searching...
            </p>
          ) : suggestions.length > 0 ? (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Account suggestions"
              className="max-h-80 overflow-y-auto py-1"
            >
              {suggestions.map((suggestion, index) => (
                <li key={suggestion.did} role="none">
                  <button
                    id={`${listboxId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    tabIndex={-1}
                    onPointerDown={(event) => event.preventDefault()}
                    onPointerMove={() => setActiveIndex(index)}
                    onClick={() => selectSuggestion(suggestion)}
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
            <p role="status" className="px-3 py-3 text-sm text-zinc-500 dark:text-zinc-400">
              No matching accounts
            </p>
          )}
        </div>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className={
            compact
              ? 'absolute left-0 top-11 z-50 border border-red-900 bg-white px-2.5 py-1.5 text-xs text-red-800 dark:bg-zinc-900 dark:text-red-300'
              : 'mt-2 text-sm text-red-600 dark:text-red-400'
          }
        >
          {error}
        </p>
      )}
    </form>
  )
}
