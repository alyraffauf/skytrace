import { IconButton } from '@astryxdesign/core/IconButton'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Text } from '@astryxdesign/core/Text'
import { useCombobox } from '@astryxdesign/core/Selector'
import { ArrowRightIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { type SubmitEvent, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { normalizeActorInput } from '../../lib/actors/input'
import { profilePath } from '../../routes/paths'
import { ActorSuggestions } from './ActorSuggestions'
import { useActorSuggestions } from './useActorSuggestions'

type ActorSearchProps = {
  autoFocus?: boolean
  compact?: boolean
}

export function ActorSearch({ autoFocus = false, compact = false }: ActorSearchProps) {
  const navigate = useNavigate()
  const inputId = compact ? 'header-actor-search' : 'actor-search'
  const errorId = `${inputId}-error`
  const [error, setError] = useState('')
  const [input, setInput] = useState('')
  const [hasFocus, setHasFocus] = useState(false)
  const [menuOpen, setMenuOpen] = useState(true)
  const anchorRef = useRef<HTMLDivElement>(null)
  const { suggestions, isFetching, canShowSuggestions } = useActorSuggestions({ input, hasFocus })
  const isOpen = menuOpen && canShowSuggestions
  let announcement = ''
  if (isOpen) {
    if (suggestions.length > 0) {
      announcement = `${suggestions.length} account ${suggestions.length === 1 ? 'suggestion' : 'suggestions'}`
    } else {
      announcement = isFetching ? 'Searching...' : 'No matching accounts'
    }
  }
  const combobox = useCombobox({
    selectableItems: canShowSuggestions ? suggestions.map(({ did }) => ({ value: did })) : [],
    hasSearch: true,
    isOpen,
    onOpen: () => setMenuOpen(true),
    onClose: () => setMenuOpen(false),
    onSelect: (did) => {
      const suggestion = suggestions.find((item) => item.did === did)
      if (!suggestion) return
      setInput(`@${suggestion.handle}`)
      setError('')
      navigate(profilePath(did))
    },
    listboxId: `${inputId}-suggestions`,
  })

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const actor = normalizeActorInput(input)
      setError('')
      setMenuOpen(false)
      navigate(profilePath(actor))
    } catch (inputError) {
      setError(inputError instanceof Error ? inputError.message : 'Enter a valid account.')
    }
  }

  return (
    <form
      onSubmit={submit}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setHasFocus(false)
          setMenuOpen(false)
        }
      }}
      className={compact ? 'relative w-full max-w-md' : 'relative w-full'}
      noValidate
    >
      <p role="status" aria-label="Account search" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
      <div ref={anchorRef} className="relative">
        <TextInput
          {...combobox.getFieldProps({
            onKeyDown: (event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
                event.preventDefault()
                event.currentTarget.closest('form')?.requestSubmit()
              }
              if (event.key === 'Tab') setMenuOpen(false)
            },
          })}
          id={inputId}
          label="AT Protocol account"
          isLabelHidden
          width="100%"
          size={compact ? 'md' : 'lg'}
          controlClassName={`actor-search-control ${compact ? 'actor-search-control--compact' : 'actor-search-control--home'}`}
          value={input}
          onChange={(value) => {
            setInput(value)
            combobox.setHighlightedIndex(-1)
            setMenuOpen(true)
            if (error) setError('')
          }}
          onFocus={() => {
            combobox.setHighlightedIndex(-1)
            setHasFocus(true)
            setMenuOpen(true)
          }}
          placeholder={compact ? 'Search...' : 'Handle, DID, or profile URL'}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="off"
          autoCapitalize="none"
          hasAutoCorrect={false}
          hasSpellCheck={false}
          hasAutoFocus={autoFocus}
          startIcon={<MagnifyingGlassIcon className={compact ? 'size-4.5' : 'size-5'} aria-hidden="true" />}
          status={error ? { type: 'error' } : undefined}
          statusVariant="detached"
        />
        <IconButton
          type="submit"
          label="Explore profile"
          variant="ghost"
          icon={<ArrowRightIcon className="size-4" aria-hidden="true" />}
          className={`actor-search-submit absolute right-0 top-1/2 -translate-y-1/2 ${compact ? 'size-8' : 'actor-search-submit--home size-14'}`}
        />
        {isOpen && (
          <ActorSuggestions
            anchorRef={anchorRef}
            suggestions={suggestions}
            isFetching={isFetching}
            listboxProps={combobox.getListboxProps()}
            getOptionProps={combobox.getOptionProps}
          />
        )}
      </div>
      {error && (
        <Text
          type="supporting"
          as="p"
          color="error"
          display="block"
          id={errorId}
          role="alert"
          className={
            compact ? 'absolute left-0 top-11 z-50 border border-ui-error-border bg-ui-surface px-2.5 py-1.5' : 'mt-2'
          }
        >
          {error}
        </Text>
      )}
    </form>
  )
}
