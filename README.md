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

This runs lint, formatting checks, tests, type checking, and a production build. See [package.json](package.json) for individual commands.

## Deploy

Follow the [deployment guide](docs/deployment.md). See [runtime configuration](docs/configuration.md) for profile visibility and list filters.

Edit [src/content/faq.md](src/content/faq.md) to change the FAQ. Its [template syntax](docs/configuration.md#faq-template) uses the instance settings.

## License

[AGPL-3.0-only](LICENSE.md).
