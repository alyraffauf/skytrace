import { TabList, Tab } from '@astryxdesign/core/TabList'
import { Link, matchPath, useLocation } from 'react-router-dom'
import { profilePath, profileTabPath } from '../../routes/paths'
import { enabledProfileTabs } from '../../routes/profileTabs'
import { useLayoutEffect, useRef } from 'react'

export function ProfileTabsNav({
  actor,
  blockedCount,
  blockedByCount,
}: {
  actor: string
  blockedCount?: number
  blockedByCount?: number
}) {
  const location = useLocation()
  const tabs = enabledProfileTabs()
  const activeTab =
    tabs.find(({ id }) => id !== 'feed' && matchPath(profileTabPath(actor, id), location.pathname))?.id ?? 'feed'
  const tabListRef = useRef<HTMLElement>(null)
  const previousCountsRef = useRef({ blockedCount, blockedByCount })

  // Counts can widen earlier tabs without resizing Astryx's scroll strip.
  useLayoutEffect(() => {
    const previousCounts = previousCountsRef.current
    previousCountsRef.current = { blockedCount, blockedByCount }
    if (previousCounts.blockedCount === blockedCount && previousCounts.blockedByCount === blockedByCount) return

    const selected = tabListRef.current?.querySelector<HTMLElement>('[aria-current]')
    const strip = selected?.closest<HTMLElement>('.astryx-tab-strip')
    if (!selected || !strip) return
    const tabBounds = selected.getBoundingClientRect()
    const stripBounds = strip.getBoundingClientRect()
    const inset = parseFloat(getComputedStyle(strip).scrollPaddingLeft) || 0
    const pastEnd = tabBounds.right - (stripBounds.right - inset)
    const pastStart = tabBounds.left - (stripBounds.left + inset)
    const delta = pastEnd > 0 ? pastEnd : pastStart < 0 ? pastStart : 0
    if (delta !== 0) strip.scrollTo({ left: strip.scrollLeft + delta, behavior: 'instant' })
  }, [blockedCount, blockedByCount])

  return (
    <TabList
      ref={tabListRef}
      aria-label="Profile sections"
      value={activeTab}
      onChange={() => {}}
      hasDivider
      overflow="scroll"
      size="lg"
      className="profile-tabs sticky top-12 z-30 gap-1 bg-ui-canvas px-3 pt-1 sm:px-5 lg:px-7"
    >
      {tabs.map(({ id, label }) => {
        const count = id === 'blocking' ? blockedCount : id === 'blocked-by' ? blockedByCount : undefined
        return (
          <Tab
            key={id}
            className="min-h-11"
            as={Link}
            href={id === 'feed' ? profilePath(actor) : profileTabPath(actor, id)}
            value={id}
            label={count === undefined ? label : `${label} (${count.toLocaleString()})`}
          />
        )
      })}
    </TabList>
  )
}
