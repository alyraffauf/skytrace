# Runtime configuration

The container entrypoint writes environment settings to `runtime-config.js` at startup. Static deployments read the same properties from `window.__SKYTRACE_CONFIG__` in that file. See the [deployment guide](deployment.md) to apply changes.

| Container variable                   | JavaScript property       | Default | Effect                                                                                                                                                     |
| ------------------------------------ | ------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKYTRACE_IGNORE_NO_UNAUTHENTICATED` | `ignoreNoUnauthenticated` | `false` | Allows Feed and Labeled posts for profiles with the `!no-unauthenticated` self-label. Only the exact value `true` enables the override.                    |
| `SKYTRACE_BLOCK_TARGET_DID`          | `blockTargetDid`          | `null`  | Hides profiles that block or are blocked by this account. An unset or invalid DID disables the check.                                                      |
| `SKYTRACE_HIDDEN_DIDS`               | `hiddenDids`              | `[]`    | Hides specific profiles. The container accepts comma-separated DIDs, trims whitespace, and drops invalid entries. JavaScript uses an array of DID strings. |
| `MIN_LIST_BLOCKING`                  | `minListBlocking`         | `null`  | Requires a minimum number of accounts to block a moderation list before it appears on Listed On. Curation lists remain visible.                            |
| `SKYTRACE_DONATE_REMINDER_DAYS`      | `donateReminderDays`      | `null`  | Sets the number of days between donation popups. Unset, zero, or invalid values disable the popup.                                                         |

Explicit hiding takes precedence over an instance block, which takes precedence over a profile's opt-out. An explicit match skips block checks. Hidden profiles show the instance-block message, whether opened by handle or DID.

`MIN_LIST_BLOCKING` accepts whole numbers from `0` through `9007199254740991`. Unset or invalid values disable the filter. A value of `0` still fetches the count and accepts any nonnegative result. If Constellation cannot supply the count, SkyTrace withholds the moderation list and shows a membership error.

`SKYTRACE_DONATE_REMINDER_DAYS` accepts whole numbers from `1` through `400`, matching the cookie's 400-day lifetime. Unset or out-of-range values disable the popup. Set it to `7` for a seven-day interval. The app checks a cookie on profile and list pages and records when the popup appears. Visitors without a cookie see it immediately on those pages when reminders are enabled.

## FAQ template

[src/content/faq.md](../src/content/faq.md) supplies the `/faq` page. [FaqPage.tsx](../src/pages/FaqPage.tsx) fills template values from runtime settings before rendering Markdown.

Conditional sections use `<!-- if NAME -->` and `<!-- endif -->`. Supported names are `opt-out-enabled`, `opt-out-disabled`, `minimum-enabled`, and `minimum-disabled`. Nested sections are unsupported.

The template has these placeholders:

- `{{optOutAccountUrl}}` is the configured block-target account's Bluesky URL.
- `{{minimumBlocking}}` is the formatted minimum blocker count.
- `{{blockingAccounts}}` is `account blocks` for a count of one, otherwise `accounts block`.
