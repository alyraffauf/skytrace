import { useSyncExternalStore } from 'react'

const fallbackLanguages = ['en']

function subscribe(onChange: () => void) {
  window.addEventListener('languagechange', onChange)
  return () => window.removeEventListener('languagechange', onChange)
}

function getLanguages() {
  return navigator.languages
}

export function usePreferredLanguages() {
  return useSyncExternalStore(subscribe, getLanguages, () => fallbackLanguages)
}
