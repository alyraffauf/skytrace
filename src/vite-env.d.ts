/// <reference types="vite/client" />

interface Window {
  readonly __SKYTRACE_CONFIG__?: {
    readonly ignoreNoUnauthenticated: boolean
    readonly minListBlocking?: number | null
    readonly blockTargetDid: string | null
    readonly hiddenDids?: readonly string[]
    readonly donateReminderDays?: number | null
  }
}
