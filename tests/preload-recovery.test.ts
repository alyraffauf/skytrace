import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isPreloadError, registerPreloadRecovery } from '../src/routes/preloadRecovery'

let unregister = () => {}

beforeEach(() => window.sessionStorage.clear())
afterEach(() => unregister())

function dispatchPreloadError(error = new TypeError('Failed to fetch dynamically imported module')) {
  const event = Object.assign(new Event('vite:preloadError', { cancelable: true }), { payload: error })
  window.dispatchEvent(event)
  return event
}

describe('module download recovery', () => {
  it('reloads once and suppresses further failures while navigation is pending', () => {
    const reload = vi.fn()
    unregister = registerPreloadRecovery(reload)
    const firstEvent = dispatchPreloadError()
    const secondEvent = dispatchPreloadError()

    expect(reload).toHaveBeenCalledTimes(1)
    expect(firstEvent.defaultPrevented).toBe(true)
    expect(secondEvent.defaultPrevented).toBe(true)
    expect(isPreloadError(firstEvent.payload)).toBe(true)
    expect(isPreloadError(new Error('An unrelated error'))).toBe(false)
  })

  it('lets the error reach the page after this build has already tried a reload', () => {
    unregister = registerPreloadRecovery(vi.fn())
    dispatchPreloadError()
    unregister()

    const reloadAfterNavigation = vi.fn()
    unregister = registerPreloadRecovery(reloadAfterNavigation)
    const event = dispatchPreloadError()

    expect(reloadAfterNavigation).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
    expect(isPreloadError(event.payload)).toBe(true)
  })

  it('allows recovery when a different build previously reloaded', () => {
    window.sessionStorage.setItem('skytrace:preload-reload:older-build', '1')
    const reload = vi.fn()
    unregister = registerPreloadRecovery(reload)

    dispatchPreloadError()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it.each(['getItem', 'setItem'] as const)('does not risk a reload loop when storage %s fails', (method) => {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError')
    })
    const reload = vi.fn()
    unregister = registerPreloadRecovery(reload)

    const event = dispatchPreloadError()

    expect(reload).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
    expect(isPreloadError(event.payload)).toBe(true)
  })

  it('removes the event listener when unregistered', () => {
    const reload = vi.fn()
    unregister = registerPreloadRecovery(reload)
    unregister()

    const event = dispatchPreloadError()

    expect(reload).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })
})
