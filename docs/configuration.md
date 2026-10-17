# Runtime configuration

SkyTrace reads its settings from `runtime-config.js`, a file created at startup in the container or edited directly on static hosts. The table below lists every setting and what it does.

## Settings

| Container variable                   | JavaScript property       | Default | Effect                                                                                                                              |
| ------------------------------------ | ------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `SKYTRACE_IGNORE_NO_UNAUTHENTICATED` | `ignoreNoUnauthenticated` | `false` | Shows Feed and Labeled posts for profiles with the `!no-unauthenticated` self-label. Only the exact value `true` enables this.      |
| `SKYTRACE_BLOCK_TARGET_DID`          | `blockTargetDid`          | `null`  | Hides profiles that block or are blocked by this account. Unset or an invalid DID disables the check.                               |
| `SKYTRACE_HIDDEN_DIDS`               | `hiddenDids`              | `[]`    | Hides specific profiles. Comma-separated DIDs in the container, trimmed and validated. JavaScript receives an array of strings.     |
| `SKYTRACE_MIN_LIST_BLOCKING`         | `minListBlocking`         | `null`  | Requires a minimum number of members before a moderation list shows on the Listed On tab. Curation lists stay visible regardless.   |
| `SKYTRACE_DONATE_REMINDER_DAYS`      | `donateReminderDays`      | `null`  | How often the donate popup reappears, in days. Set to `7` for a weekly reminder. Unset, zero, or out of range disables it entirely. |

## How precedence works

Explicit hiding beats instance-level blocking, which beats a profile's opt-out. If an account is explicitly listed in `SKYTRACE_HIDDEN_DIDS`, SkyTrace skips the block check and shows the hidden profile message immediately.

Hidden profiles show the same block message whether you look them up by handle or DID.

## Settings details

### Minimum list blocking

`SKYTRACE_MIN_LIST_BLOCKING` accepts integers from `0` to `9007199254740991`. Anything outside that range falls back to `null` (disabled). A value of `0` still triggers the fetch but accepts any nonnegative member count.

When SkyTrace can't load the member count for a list, it hides the list on Listed On and shows a membership error instead.

### Donate reminders

Set `SKYTRACE_DONATE_REMINDER_DAYS` to any integer from `1` through `400`. The popup checks `localStorage` on profile and list pages and records when it last appeared. Visitors who have never seen the popup see it immediately.

## FAQ template

The FAQ page lives at [src/content/faq.md](../src/content/faq.md) and gets filled with runtime values by [FaqPage.tsx](../src/pages/FaqPage.tsx) before rendering.

Sections can be conditionally included using `<!-- if NAME -->` and `<!-- endif -->`. Supported condition names:

- `opt-out-enabled` / `opt-out-disabled` — whether a block target is configured
- `minimum-enabled` / `minimum-disabled` — whether a minimum blocker count is set

Template placeholders:

- `{{optOutAccountUrl}}` — the block target's Bluesky profile URL
- `{{minimumBlocking}}` — the formatted minimum count
- `{{blockingAccounts}}` — `account blocks` for one, `accounts block` for more
