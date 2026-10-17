import { useEffect, useRef } from 'react'

export function useActiveProfileTabScroll({
  pathname,
  blockedCount,
  blockedByCount,
}: {
  pathname: string
  blockedCount?: number
  blockedByCount?: number
}) {
  const tabListRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const tabList = tabListRef.current
    const activeTab = tabList?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!tabList || !activeTab) return
    const left = activeTab.offsetLeft
    const right = left + activeTab.offsetWidth
    if (left < tabList.scrollLeft || right > tabList.scrollLeft + tabList.clientWidth) {
      tabList.scrollTo({
        behavior: 'smooth',
        left: left - (tabList.clientWidth - activeTab.offsetWidth) / 2,
      })
    }
  }, [blockedByCount, blockedCount, pathname])

  return tabListRef
}
