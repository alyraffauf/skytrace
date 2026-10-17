# Deploy SkyTrace

## Run the container

```sh
docker run -p 8080:80 ghcr.io/alyraffauf/skytrace:latest
```

Open `http://localhost:8080`. Pass environment variables with `-e` to change settings. See the [configuration guide](configuration.md) for the full list. Change requires recreating the container.

## Publish a static build

```sh
bun install --frozen-lockfile
bun run build
```

Copy the `dist/` folder to your static host. If you need custom settings, edit [public/runtime-config.js](../public/runtime-config.js) before running `bun run build`, or edit the deployed `runtime-config.js` directly.

## Hosting setup

Your host needs three things:

1. Route all app paths to `index.html` so the router can handle them.
2. Serve fingerprinted assets with long cache headers.
3. Return `404` for unknown routes, not a catch-all redirect.

Two files in the repo handle this for you:

- [public/_redirects](../public/_redirects) — rewrites app routes to `index.html`. Use this on Netlify or Cloudflare Pages.
- [public/_headers](../public/_headers) — sets `Cache-Control` and `X-Robots-Tag: noindex` for profile and list URLs.
- [nginx.conf](../nginx.conf) — the container's equivalent rules, including a one-year cache for fingerprinted assets.

If your host does not support `_redirects` or `_headers`, translate the rules into its config. The key point is that unknown routes must return a `404` with `404.html`. A catch-all rewrite to `index.html` breaks things.

Whenever you add a new app route, update `_redirects`, `nginx.conf`, and `_headers` if the route needs different headers.

## Verify the deployment

Hit these URLs after deploying:

- `/` returns `200` with no `noindex` header.
- A profile tab URL and a list URL return `200` with `X-Robots-Tag: noindex`.
- An unknown route, a missing asset, and `/sitemap.xml` return `404`.
- `/runtime-config.js` returns JavaScript with `Cache-Control: no-store`.
- `/robots.txt` returns plain text and allows crawling so the `noindex` headers on profile URLs are read correctly.

If Cloudflare adds a managed crawler policy to `robots.txt`, leave it alone. Use Search Console's URL Inspection to confirm Google can render the homepage.

Vite's dev server does not apply these rules.
