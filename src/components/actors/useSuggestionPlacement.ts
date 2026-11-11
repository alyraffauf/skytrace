import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

const gap = 8
const viewportGutter = 8
const maximumHeight = 320

type SuggestionPlacement = { side: 'above' | 'below'; maxHeight: number }

export function calculateSuggestionPlacement({
  anchorTop,
  anchorBottom,
  contentHeight,
  viewportTop,
  viewportBottom,
}: {
  anchorTop: number
  anchorBottom: number
  contentHeight: number
  viewportTop: number
  viewportBottom: number
}): SuggestionPlacement {
  const above = Math.max(0, anchorTop - viewportTop - gap - viewportGutter)
  const below = Math.max(0, viewportBottom - anchorBottom - gap - viewportGutter)
  const desiredHeight = Math.min(contentHeight, maximumHeight)
  const side = below < desiredHeight && above > below ? 'above' : 'below'
  return { side, maxHeight: Math.min(maximumHeight, side === 'above' ? above : below) }
}

export function useSuggestionPlacement(anchorRef: RefObject<HTMLDivElement | null>) {
  const popupRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<SuggestionPlacement>({ side: 'below', maxHeight: maximumHeight })

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const popup = popupRef.current
    const content = contentRef.current
    if (!anchor || !popup || !content) return

    const update = () => {
      const bounds = anchor.getBoundingClientRect()
      const viewport = window.visualViewport
      const viewportTop = viewport?.offsetTop ?? 0
      const next = calculateSuggestionPlacement({
        anchorTop: bounds.top,
        anchorBottom: bounds.bottom,
        contentHeight: content.scrollHeight + popup.offsetHeight - popup.clientHeight,
        viewportTop,
        viewportBottom: viewportTop + (viewport?.height ?? window.innerHeight),
      })
      setPlacement((current) => (current.side === next.side && current.maxHeight === next.maxHeight ? current : next))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(anchor)
    observer.observe(content)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, { capture: true, passive: true })
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [anchorRef])

  return { popupRef, contentRef, ...placement }
}
