import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('languagechange', onChange)
  return () => window.removeEventListener('languagechange', onChange)
}

function getLanguageSnapshot() {
  // Safari can return a fresh languages array on every read.
  return JSON.stringify(navigator.languages)
}

export function usePreferredLanguages() {
  const snapshot = useSyncExternalStore(subscribe, getLanguageSnapshot, () => '["en"]')
  return JSON.parse(snapshot) as string[]
}
