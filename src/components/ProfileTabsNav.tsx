import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { profilePath, profileTabPath } from '../lib/routes'
import { PROFILE_TABS } from '../profileTabRoutes'

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
  }, [blockedByCount, blockedCount, location.pathname])

  return (
    <nav
      aria-label="Profile sections"
      className="sticky top-12 z-30 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div ref={tabListRef} className="tabs-scroll scrollbar-none flex gap-6 overflow-x-auto px-4 sm:px-6 lg:px-7">
        {PROFILE_TABS.map(({ id, path, label }) => {
          const count = id === 'blocking' ? blockedCount : id === 'blocked-by' ? blockedByCount : undefined
          return (
            <NavLink
              key={id}
              to={path ? profileTabPath(actor, path) : profilePath(actor)}
              end={!path}
              className={({ isActive }) =>
                `flex min-h-12 shrink-0 items-center justify-center whitespace-nowrap border-b-2 px-0.5 text-sm font-medium sm:min-h-0 sm:py-3 ${isActive ? 'border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300' : 'border-transparent text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'}`
              }
            >
              {label}
              {count !== undefined && ` (${count.toLocaleString()})`}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
