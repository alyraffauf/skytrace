import { useEffect, useState } from 'react'

const LAST_SHOWN_COOKIE = 'skytrace-donate-last-shown'
const DAY_MS = 86_400_000
const COOKIE_RETENTION_DAYS = 400

function reminderIsDue() {
  const days = window.__SKYTRACE_CONFIG__?.donateReminderDays
  if (typeof days !== 'number' || !Number.isSafeInteger(days) || days <= 0 || days > COOKIE_RETENTION_DAYS) return false
  try {
    const cookie = document.cookie.split(';').find((cookie) => cookie.trim().startsWith(`${LAST_SHOWN_COOKIE}=`))
    const lastShown = Number(cookie?.split('=')[1])
    const now = Date.now()
    return !Number.isFinite(lastShown) || lastShown <= 0 || lastShown > now || now - lastShown >= days * DAY_MS
  } catch {
    return false
  }
}

export function useDonateReminder() {
  const [visible, setVisible] = useState(reminderIsDue)

  useEffect(() => {
    if (!visible) return
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    try {
      document.cookie = `${LAST_SHOWN_COOKIE}=${Date.now()}; Path=/; Max-Age=${(COOKIE_RETENTION_DAYS * DAY_MS) / 1000}; SameSite=Lax${secure}`
    } catch {
      // The reminder can still be dismissed when the browser blocks cookies.
    }
  }, [visible])

  return { visible, dismiss: () => setVisible(false) }
}
