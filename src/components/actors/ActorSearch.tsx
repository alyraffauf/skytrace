import { ActorSuggestions } from './ActorSuggestions'
import { useActorCombobox } from './useActorCombobox'
import { ArrowRightIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { type FormEvent, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { normalizeActorInput } from '../../lib/actors/input'
import { profilePath } from '../../routes/paths'

type ActorSearchProps = {
  autoFocus?: boolean
  compact?: boolean
}

export function ActorSearch({ autoFocus = false, compact = false }: ActorSearchProps) {
  const navigate = useNavigate()
  const listboxId = useId()
  const inputId = compact ? 'header-actor-search' : 'actor-search'
  const errorId = compact ? 'header-search-error' : 'search-error'
  const [error, setError] = useState('')
  const {
    input,
    suggestions,
    isFetching,
    showSuggestions,
    activeIndex,
    keyboardSelection,
    changeInput,
    handleFocus,
    handleBlur,
    handleInputKeyDown,
    selectPointerIndex,
    selectSuggestion,
  } = useActorCombobox({
    onSelect: (suggestion) => {
      setError('')
      navigate(profilePath(suggestion.did))
    },
  })

  const inputBaseClassName =
    'w-full border bg-white text-zinc-950 outline-none placeholder:text-zinc-400 focus-visible:border-violet-500 focus-visible:ring-1 focus-visible:ring-violet-500 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus-visible:border-violet-400 dark:focus-visible:ring-violet-400'
  const inputSizeClassName = compact
    ? 'h-8 rounded-sm pl-10 pr-11 text-base md:text-sm'
    : 'h-14 rounded-md pl-12 pr-14 text-base shadow-[0_10px_35px_-22px_rgba(124,58,237,0.45)]'
  let inputBorderClassName: string
  if (error) {
    inputBorderClassName = 'border-red-500'
  } else if (compact) {
    inputBorderClassName = 'border-zinc-500 hover:border-zinc-700 dark:border-zinc-500 dark:hover:border-zinc-300'
  } else {
    inputBorderClassName =
      'border-violet-500 hover:border-violet-700 dark:border-violet-500 dark:hover:border-violet-300'
  }
  const buttonBaseClassName = 'absolute top-1/2 grid -translate-y-1/2 place-items-center'
  const buttonVariantClassName = compact
    ? 'right-0 size-10 text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
    : 'right-0 size-14 text-violet-600 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-200'

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
      onFocus={handleFocus}
      onBlur={handleBlur}
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
            changeInput(event.target.value)
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
          className={`${inputSizeClassName} ${inputBaseClassName} ${inputBorderClassName}`}
        />
        <button
          type="submit"
          aria-label="Explore profile"
          className={`${buttonVariantClassName} ${buttonBaseClassName}`}
        >
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      {showSuggestions && (
        <ActorSuggestions
          listboxId={listboxId}
          suggestions={suggestions}
          isFetching={isFetching}
          activeIndex={activeIndex}
          keyboardSelection={keyboardSelection}
          onActiveIndexChange={selectPointerIndex}
          onSelect={selectSuggestion}
        />
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
