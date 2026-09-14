# React + PostHog integration example

This private Vite app imports the repository package through its public
`data-system` interface. It demonstrates type-safe event tracking, user
identification, view tracking, and identity clearing through a PostHog adapter.

From the repository root:

```sh
cp examples/react-posthog/.env.example examples/react-posthog/.env
# Replace VITE_POSTHOG_KEY with a PostHog project key.
pnpm install
pnpm build
pnpm example:dev
```

Open the local Vite URL and use the four buttons. Only `src/analytics.ts` knows
about PostHog; the application calls the provider-neutral analytics interface.

If no key is configured, the example logs the capture call to the browser
console instead. The app is a private workspace package and is excluded from the
published npm package.
