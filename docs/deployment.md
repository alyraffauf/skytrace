# Deploy SkyTrace

## Run the container

```sh
docker run -p 8080:80 ghcr.io/alyraffauf/skytrace:latest
```

Open `http://localhost:8080`. To change [runtime settings](configuration.md), pass environment variables with `-e` when you start the container. Recreate the container to change those variables.

## Publish a static build

```sh
bun install --frozen-lockfile
bun run build
```

Publish `dist/` to your static host. For custom settings, edit [public/runtime-config.js](../public/runtime-config.js) before building, or edit `runtime-config.js` in the deployed files.

Configure the host with these files:

- [public/_redirects](../public/_redirects) rewrites known app routes to `index.html`.
- [public/_headers](../public/_headers) sets cache rules and `X-Robots-Tag: noindex` for profile and list URLs.
- [nginx.conf](../nginx.conf) supplies the container's equivalent rules, including a one-year cache for fingerprinted assets.

If your host does not support `_redirects` or `_headers`, translate the rules into its configuration. Return HTTP 404 with `404.html` for unknown routes and missing files. Avoid a catch-all rewrite to `index.html`.

When adding app routes, update both `_redirects` and `nginx.conf`. Update `_headers` if the new routes need different headers.

## Verify the deployment

Check responses on the original URLs after any internal rewrite:

- `/` returns 200 without `noindex`.
- A profile tab and a list URL return 200 with `X-Robots-Tag: noindex`.
- An unknown route, a missing asset, and `/sitemap.xml` return 404.
- `/runtime-config.js` returns JavaScript with `Cache-Control: no-store`.
- `/robots.txt` returns plain text and allows crawling so search engines can read indexing headers.

If Cloudflare adds a managed crawler policy to `robots.txt`, keep that policy. Use Search Console's URL Inspection to check that Google can render and index the homepage.

Vite's development server does not apply these hosting rules.
