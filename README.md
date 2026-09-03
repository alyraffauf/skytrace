# SkyTrace

SkyTrace displays public AT Protocol records for Bluesky accounts. Search by handle, DID, or `bsky.app` profile URL. SkyTrace resolves the account and shows:

- posts and reposts in one chronological feed
- account labels, including removed and expired labels
- labeled posts
- accounts that the profile blocks and accounts that block it
- lists owned by the profile, lists that include it, and list members
- the account DID, PDS host, aliases, former handles, and creation date when available

SkyTrace does not require a Bluesky login. SkyTrace is a static frontend and has no backend of its own. It depends on Bluesky infrastructure, account PDS hosts, and community-run AT Protocol services. The browser sends requests directly to those servers.

## Run the app locally

Install [Bun 1.3.13](https://bun.sh/), then run:

```sh
bun install
bun run dev
```

Vite prints the local URL in the terminal. Open that URL and search for an account.

## Check a change

Run the full check before you commit:

```sh
bun run check
```

The command runs Oxlint, checks Prettier formatting, runs the Vitest suite in JSDOM, type-checks the code, and creates a production build.

Use the narrower commands while you work:

| Command                | Purpose                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `bun run lint`         | Check `src`, `tests`, `scripts`, and `vite.config.ts` with Oxlint. |
| `bun run format`       | Format the repository with Prettier.                               |
| `bun run format:check` | Check formatting without changing files.                           |
| `bun run test`         | Run the test suite once.                                           |
| `bun run test:watch`   | Run tests after file changes.                                      |
| `bun run typecheck`    | Check TypeScript without emitting files.                           |
| `bun run build`        | Type-check the app and write the production build to `dist`.       |
| `bun run preview`      | Serve the production build locally.                                |

## Data sources

SkyTrace makes these requests from the browser:

| Data                                       | Source                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| Account resolution and record lookup       | `slingshot.cute.haus`                                                                 |
| Search suggestions                         | `typeahead.waow.tech`                                                                 |
| Posts, reposts, lists, and outgoing blocks | The account's PDS                                                                     |
| Incoming blocks and list memberships       | `constellation.microcosm.blue`                                                        |
| Label events                               | `labelers.firehose.stream`, labeler services, and `public.api.bsky.app` as a fallback |
| PLC account history                        | `plc.directory`                                                                       |
| Avatars and post images                    | `cdn.bsky.app`                                                                        |
| Video files                                | The post author's PDS                                                                 |

SkyTrace runs up to six lookup requests and two pagination requests at once. `PublicDataCore` stops its main requests after 15 seconds, and the cache lives only in memory. If a successful page contains a malformed record, the UI keeps the usable records and marks the bad one. Label-source failures appear separately with a retry action.

## Project layout

The frontend uses React 19, TypeScript, Vite 8, Tailwind CSS 4, and TanStack Query.

- `src/pages` contains the home, profile, profile-tab, and list pages.
- `src/components` contains search, record rows, media, pagination, and error states.
- `src/data` resolves identities and loads records, backlinks, labels, feeds, and lists.
- `src/lib` contains caching, request scheduling, routing, parsing, and formatting helpers.
- `tests` covers the data clients, pagination seams, record parsing, and UI behavior.
- `scripts/generate-og.tsx` creates `public/og.png`.

To regenerate the social preview image, run:

```sh
bun run generate:og
```

The script uses its bundled Inter font file and replaces `public/og.png`.

## Deploy the static build

Run `bun run build`, then publish `dist` with a static host. SkyTrace uses client-side routes such as `/profile/:actor` and `/list/:actor/:rkey`, so the host must send unknown paths to `index.html`.

The repository includes `public/_redirects` with this rule:

```text
/* /index.html 200
```

Vite copies the rule into `dist` during the build. If your host does not support `_redirects`, configure the same fallback in the host settings.

Set `SITE_URL` to the site's public origin so social-image URLs use the deployed domain. Cloudflare Pages builds can use the automatic `CF_PAGES_URL` value instead.

## License

SkyTrace is licensed under the [GNU Affero General Public License, version 3 only](./LICENSE.md).
