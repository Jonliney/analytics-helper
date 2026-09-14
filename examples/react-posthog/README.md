# React + PostHog integration example

This private Vite app imports the repository package through its public
`data-system` API and sends a type-safe `Signup Completed` event to PostHog.

From the repository root:

```sh
cp examples/react-posthog/.env.example examples/react-posthog/.env
# Replace VITE_POSTHOG_KEY with a PostHog project key.
pnpm install
pnpm build
pnpm example:dev
```

Open the local Vite URL and select **Track Signup Completed**. The event appears
in PostHog with `method: "email"` and `campaign_id: "integration-example"`.

If no key is configured, the example logs the capture call to the browser
console instead. The app is a private workspace package and is excluded from the
published npm package.
