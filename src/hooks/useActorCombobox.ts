import { useState, type FocusEvent, type KeyboardEvent } from 'react'
import { useActorSuggestions } from './useActorSuggestions'
import type { ActorSuggestion } from '../types'

export function useActorCombobox({ onSelect }: { onSelect: (suggestion: ActorSuggestion) => void }) {
  const [input, setInput] = useState('')
  const [hasFocus, setHasFocus] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [keyboardSelection, setKeyboardSelection] = useState(false)
  const { suggestions, isFetching, canShowSuggestions } = useActorSuggestions({ input, hasFocus })
  const showSuggestions = canShowSuggestions && !isDismissed

  if (activeIndex >= suggestions.length) {
    setActiveIndex(suggestions.length - 1)
  }

  function selectSuggestion(suggestion: ActorSuggestion) {
    setInput(`@${suggestion.handle}`)
    setIsDismissed(true)
    onSelect(suggestion)
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
      setKeyboardSelection(true)
      setActiveIndex((current) => (current + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setKeyboardSelection(true)
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      selectSuggestion(suggestions[activeIndex >= 0 ? activeIndex : 0])
    }
  }

  function changeInput(value: string) {
    setInput(value)
    setIsDismissed(false)
    setActiveIndex(-1)
  }

  function handleFocus() {
    setHasFocus(true)
  }

  function handleBlur(event: FocusEvent<HTMLFormElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setHasFocus(false)
  }

  function selectPointerIndex(index: number) {
    setKeyboardSelection(false)
    setActiveIndex(index)
  }

  return {
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
  }
}
