import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

export function useRecordLinksPopup() {
  const [isOpen, setIsOpen] = useState(false)
  const popupId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const firstLinkRef = useRef<HTMLAnchorElement>(null)
  const [popupPosition, setPopupPosition] = useState({ left: 0, top: 0, ready: false })

  const positionPopup = useCallback(() => {
    const button = buttonRef.current
    const popup = popupRef.current
    if (!button || !popup) return
    const margin = 8
    const gap = 4
    const buttonBounds = button.getBoundingClientRect()
    const popupBounds = popup.getBoundingClientRect()
    const left = Math.min(
      Math.max(margin, buttonBounds.right - popupBounds.width),
      window.innerWidth - popupBounds.width - margin,
    )
    const below = buttonBounds.bottom + gap
    const top =
      below + popupBounds.height <= window.innerHeight - margin
        ? below
        : Math.max(margin, buttonBounds.top - popupBounds.height - gap)
    setPopupPosition({ left, top, ready: true })
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) return
    positionPopup()
  }, [isOpen, positionPopup])

  useEffect(() => {
    if (!isOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node
      if (!containerRef.current?.contains(target) && !popupRef.current?.contains(target)) setIsOpen(false)
    }
    const closeOnFocusExit = (event: FocusEvent) => {
      const target = event.target as Node
      if (!containerRef.current?.contains(target) && !popupRef.current?.contains(target)) setIsOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('focusin', closeOnFocusExit)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', positionPopup)
    window.addEventListener('scroll', positionPopup, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('focusin', closeOnFocusExit)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', positionPopup)
      window.removeEventListener('scroll', positionPopup, true)
    }
  }, [isOpen, positionPopup])

  useEffect(() => {
    if (isOpen && popupPosition.ready) firstLinkRef.current?.focus()
  }, [isOpen, popupPosition.ready])

  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => {
    setPopupPosition((position) => ({ ...position, ready: false }))
    setIsOpen((open) => !open)
  }, [])

  return { containerRef, buttonRef, popupRef, firstLinkRef, popupId, isOpen, popupPosition, toggle, close }
}
