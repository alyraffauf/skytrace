/// <reference types="vite/client" />

interface Window {
  readonly __SKYTRACE_CONFIG__?: {
    readonly ignoreNoUnauthenticated: boolean
  }
}
