import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { DonateReminder } from '../src/components/ui/DonateReminder'

const cookieName = 'skytrace-donate-last-shown'

beforeEach(() => {
  document.cookie = `${cookieName}=; Path=/; Max-Age=0`
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-08T00:00:00Z'))
})

it.each([undefined, null, 0, -1, 1.5])('disables the reminder for an unset or invalid interval: %s', (days) => {
  vi.stubGlobal('__SKYTRACE_CONFIG__', { donateReminderDays: days })
  render(<DonateReminder />)
  expect(screen.queryByText('Love SkyTrace?')).not.toBeInTheDocument()
  expect(document.cookie).not.toContain(cookieName)
})

it('records the first display and respects the configured interval across visits', () => {
  vi.stubGlobal('__SKYTRACE_CONFIG__', { donateReminderDays: 7 })
  const firstVisit = render(<DonateReminder />)
  expect(screen.getByText('Love SkyTrace?')).toBeVisible()
  expect(document.cookie).toContain(`${cookieName}=${Date.now()}`)
  firstVisit.unmount()

  vi.setSystemTime(new Date('2026-01-14T23:59:59.999Z'))
  const earlyVisit = render(<DonateReminder />)
  expect(screen.queryByText('Love SkyTrace?')).not.toBeInTheDocument()
  earlyVisit.unmount()

  vi.setSystemTime(new Date('2026-01-15T00:00:00Z'))
  const laterVisit = render(<DonateReminder />)
  expect(screen.getByText('Love SkyTrace?')).toBeVisible()
  expect(document.cookie).toContain(`${cookieName}=${Date.now()}`)
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByText('Love SkyTrace?')).not.toBeInTheDocument()
  laterVisit.unmount()

  render(<DonateReminder />)
  expect(screen.queryByText('Love SkyTrace?')).not.toBeInTheDocument()
})

it.each(['not-a-timestamp', '9999999999999'])('replaces an invalid or future timestamp: %s', (timestamp) => {
  vi.stubGlobal('__SKYTRACE_CONFIG__', { donateReminderDays: 7 })
  document.cookie = `${cookieName}=${timestamp}; Path=/`
  render(<DonateReminder />)
  expect(screen.getByText('Love SkyTrace?')).toBeVisible()
  expect(document.cookie).toContain(`${cookieName}=${Date.now()}`)
})
