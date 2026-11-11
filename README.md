# SkyTrace

Browse public Bluesky records by handle, DID, or `bsky.app` profile URL. SkyTrace shows posts, labels, blocks, lists, and account history without a login.

The app is a static React frontend. Your browser contacts account PDS hosts and [AT Protocol services](src/config/serviceUrls.ts) directly.

## Run locally

With [Bun 1.3.14](https://bun.sh/) installed, run:

```sh
bun install
bun run dev
```

## Check changes

```sh
bun run check
```

This checks the generated theme, lint, formatting, tests, types, and a production build. See [package.json](package.json) for individual commands.

## Change the theme

Edit [src/theme/skytraceTheme.ts](src/theme/skytraceTheme.ts), then run `bun run theme:build`. Commit the source and regenerated files in `src/theme/generated/` together. `bun run theme:check` detects stale output.

Keep Astryx core, theme, and CLI packages on the same release. The app uses self-hosted Inter and follows the system color scheme.

Astryx owns control styling and the shared visual values. Set colors and typography in the theme and inherit Astryx Neutral's radius scale. Preserve component defaults through props rather than adding Tailwind color, font, or radius overrides to Astryx controls.

Tailwind provides layout utilities and styles for app content. Its `ui-*` colors, semantic radii, and common text sizes in [src/index.css](src/index.css) reference Astryx tokens. The default Tailwind color and radius palettes are disabled. The app imports Astryx's reset, component CSS, and generated theme, and omits Tailwind's Preflight reset. Search keeps its custom home sizing and inline submit button, with visual values defined in the theme.

Use `bg-ui-canvas` for page backgrounds, including sticky headers, profile sidebars, tabs, and the footer. It stays white in light mode and near-black in dark mode. Reserve `bg-ui-surface` for raised content such as menus.

Record menus use bottom sheets when CSS anchor positioning is unavailable. Search uses Astryx's combobox hook with an inline dropdown that flips and caps its height to fit the visible viewport, so suggestions do not require anchor positioning.

## Deploy

Follow the [deployment guide](docs/deployment.md). See [runtime configuration](docs/configuration.md) for profile visibility and list filters.

Edit [src/content/faq.md](src/content/faq.md) to change the FAQ. Its [template syntax](docs/configuration.md#faq-template) uses the instance settings.

## License

[AGPL-3.0-only](LICENSE.md).
