import { DonateButton } from '../components/ui/DonateButton'
import { DonateReminder } from '../components/ui/DonateReminder'
import { RainCloud } from '../components/ui/RainCloud'
import { Link, Outlet, ScrollRestoration } from 'react-router-dom'
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useRouteMetadata } from '../routes/metadata'
import { ActorSearch } from '../components/actors/ActorSearch'

export function AppLayout() {
  const footerRef = useRef<HTMLElement>(null)
  const [footerHeight, setFooterHeight] = useState<number>()
  const { presentation } = useRouteMetadata()
  const isHomeRoute = presentation === 'home'
  const isExplorerRoute = presentation === 'explorer'

  useLayoutEffect(() => {
    const footer = footerRef.current
    if (!footer) return
    const updateHeight = () => setFooterHeight(footer.getBoundingClientRect().height)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(footer)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className="flex min-h-screen min-h-dvh flex-col bg-ui-canvas pb-[calc(2.75rem+env(safe-area-inset-bottom))] text-ui-text"
      style={
        {
          paddingBottom: footerHeight,
          '--app-footer-height': footerHeight === undefined ? undefined : `${footerHeight}px`,
        } as CSSProperties
      }
    >
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-50 -translate-y-20 border border-ui-border-strong bg-ui-canvas px-3 py-2 text-sm font-semibold text-ui-text focus:translate-y-0"
      >
        Skip to content
      </a>
      {!isHomeRoute && (
        <header className="sticky top-0 z-40 border-b border-ui-border bg-ui-canvas">
          <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-5 px-4 sm:px-6 lg:px-8">
            <Link to="/" className="flex shrink-0 items-center gap-2.5">
              <RainCloud className="rain-cloud size-5 shrink-0 stroke-[1.8] text-ui-accent" />
              <span className="text-base font-semibold">SkyTrace</span>
            </Link>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
              {isExplorerRoute && (
                <div className="hidden w-full max-w-md md:block">
                  <ActorSearch compact />
                </div>
              )}
              <DonateButton className="shrink-0 px-2.5" />
            </div>
          </div>
        </header>
      )}
      <main
        id="main-content"
        tabIndex={-1}
        className={`mx-auto w-full max-w-[1440px] flex-1 ${isExplorerRoute ? '' : 'flex px-5 sm:px-8'}`}
      >
        <Outlet />
      </main>
      <footer
        ref={footerRef}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-ui-border bg-ui-canvas pb-[env(safe-area-inset-bottom)] text-xs text-ui-muted"
      >
        <div className="mx-auto flex min-h-11 max-w-[1440px] flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:px-6 sm:py-0 lg:px-8">
          <nav aria-label="About SkyTrace" className="flex items-center gap-3 justify-self-start">
            <Link to="/faq" className="rounded-ui-inner text-ui-muted hover:text-ui-accent hover:underline">
              FAQ
            </Link>
            <a
              href="https://bsky.app/profile/skytrace.aly.town"
              target="_blank"
              rel="noreferrer"
              className="rounded-ui-inner text-ui-muted hover:text-ui-accent hover:underline"
            >
              Bluesky
            </a>
          </nav>
          <span className="text-center">
            Made by{' '}
            <a
              href="https://aly.codes"
              target="_blank"
              rel="noreferrer"
              className="rounded-ui-inner font-medium text-ui-text hover:text-ui-accent hover:underline"
            >
              Aly Raffauf
            </a>
          </span>
          <a
            href="https://tangled.org/aly.codes/skytrace"
            target="_blank"
            rel="noreferrer"
            className="justify-self-end rounded-ui-inner text-right text-ui-muted hover:text-ui-accent hover:underline"
          >
            Tangled
          </a>
        </div>
      </footer>
      <ScrollRestoration />
      {isExplorerRoute && <DonateReminder />}
    </div>
  )
}
