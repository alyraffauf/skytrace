import { useEffect, useRef } from 'react'
import type { ActorSuggestion } from '../types'

export function useSuggestionScroll({
  activeIndex,
  keyboardSelection,
  suggestions,
}: {
  activeIndex: number
  keyboardSelection: boolean
  suggestions: ActorSuggestion[]
}) {
  const listboxRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!keyboardSelection || activeIndex < 0) return
    const listbox = listboxRef.current
    const activeOption = listbox?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!listbox || !activeOption) return
    const viewportTop = listbox.getBoundingClientRect().top + listbox.clientTop
    const viewportBottom = viewportTop + listbox.clientHeight
    const optionBounds = activeOption.getBoundingClientRect()
    if (optionBounds.top < viewportTop) {
      listbox.scrollTop -= viewportTop - optionBounds.top
    } else if (optionBounds.bottom > viewportBottom) {
      listbox.scrollTop += optionBounds.bottom - viewportBottom
    }
  }, [activeIndex, keyboardSelection, suggestions])

  return listboxRef
}
