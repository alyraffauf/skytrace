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

Install [Bun 1.3.14](https://bun.sh/), then run:

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

## Source organization

- `src/main.tsx` mounts React and installs application providers.
- `src/routes/` defines routes, lazy page loading, route errors, and internal URL helpers.
- `src/layouts/` contains the application shell and profile layout, including the profile outlet context.
- `src/pages/` contains route screens, with one file per profile tab under `pages/profile/`.
- `src/components/` contains reusable rendering. Feature components are grouped by actors, profile, feed, labels, lists, and blocks. Shared display elements live in `ui/`, record rows and menus in `records/`, and paging components in `pagination/`.
- `src/hooks/` contains custom React hooks for queries, timers, and interaction behavior.
- `src/data/` owns service access, parsing, pagination, query keys, and the query client.
- `src/lib/` contains non-React utilities and domain transformations.
- `src/config/` contains application settings; `src/types.ts` defines shared domain types.

Hooks use data services and utilities without importing rendering components. Keep helpers used only for rendering beside their component. Put new route registration in `routes/router.tsx` and profile tab definitions in `routes/profileTabs.ts`.

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

- `tests` covers the data clients, pagination seams, record parsing, and UI behavior.
- `scripts/generate-og.tsx` creates `public/og.png`.

To regenerate the social preview image, run:

```sh
bun run generate:og
```

The script uses its bundled Inter font file and replaces `public/og.png`.

## Deploy the static build

Run `bun run build`, then publish `dist` with a static host. The container's nginx configuration and the included `_redirects` file serve the app for profile pages, the named profile tabs, the legacy feed alias, and individual lists. Other paths and missing files must return HTTP 404 using `404.html`. Adding a route requires updating these hosting rules too.

The homepage is indexable. Profile and list responses carry `X-Robots-Tag: noindex`; their content remains accessible through the app and shared links. The container sets this header in nginx. Static hosts that support `_headers` can use the included file; other hosts must configure the equivalent response headers. Verify these headers on the original URL after any internal rewrite.

`robots.txt` allows crawling so search engines can read the indexing headers. Cloudflare may prepend its managed crawler policy; keep that policy and verify the response contains plain text without application HTML. No sitemap is generated, and `/sitemap.xml` must return 404.

After deployment, check `/`, a profile tab, and a list URL for the expected status and indexing header. Check an unknown route and a missing asset for 404 responses. Use Search Console's URL Inspection to confirm the homepage can be rendered and indexed. The local Vite development server does not apply production hosting rules.

SkyTrace respects the `!no-unauthenticated` profile self-label by default and does not load that account's Feed or Labeled posts tabs. To ignore the label in the container, set `SKYTRACE_IGNORE_NO_UNAUTHENTICATED` when you start it:

```sh
docker run -e SKYTRACE_IGNORE_NO_UNAUTHENTICATED=true ghcr.io/alyraffauf/skytrace:latest
```

Only the exact value `true` enables the override. The nginx entrypoint writes the setting to `runtime-config.js` before it starts the server. Restart the container after you change the variable. Non-container static deployments use the checked-in default, which keeps the override disabled.

An operator can hide profiles that block a specific Bluesky account by passing that account's DID at runtime:

```sh
docker run -e SKYTRACE_BLOCK_TARGET_DID=did:plc:example ghcr.io/alyraffauf/skytrace:latest
```

This check is opt-in. When `SKYTRACE_BLOCK_TARGET_DID` is unset or invalid, SkyTrace does not make the Constellation request and shows profiles normally. Restart the container after changing the value.

## License

SkyTrace is licensed under the [GNU Affero General Public License, version 3 only](./LICENSE.md).
