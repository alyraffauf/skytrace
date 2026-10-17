import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState } from 'react'

export function useRecordLinksPopup() {
  const [isOpen, setIsOpen] = useState(false)
  const popupId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const firstLinkRef = useRef<HTMLAnchorElement>(null)
  const [popupPosition, setPopupPosition] = useState({ left: 0, top: 0 })

  const positionPopup = useEffectEvent(() => {
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
    setPopupPosition({ left, top })
  })

  useLayoutEffect(() => {
    if (!isOpen) return
    positionPopup()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const closeOnOutsideInteraction = (event: Event) => {
      const target = event.target as Node
      if (!containerRef.current?.contains(target) && !popupRef.current?.contains(target)) setIsOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnOutsideInteraction)
    document.addEventListener('focusin', closeOnOutsideInteraction)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', positionPopup)
    window.addEventListener('scroll', positionPopup, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideInteraction)
      document.removeEventListener('focusin', closeOnOutsideInteraction)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', positionPopup)
      window.removeEventListener('scroll', positionPopup, true)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) firstLinkRef.current?.focus()
  }, [isOpen])

  const close = () => setIsOpen(false)
  const toggle = () => setIsOpen((open) => !open)

  return { containerRef, buttonRef, popupRef, firstLinkRef, popupId, isOpen, popupPosition, toggle, close }
}
