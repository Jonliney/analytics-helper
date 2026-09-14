# Analytics event contracts

Define analytics events once, validate them in CI, and generate type-safe
TypeScript and language-neutral contracts.

## Add or edit an event

Add a JSON file anywhere under `src/definitions/events/`. A file can contain one
event or an array of related events.

```json
{
  "name": "Signup Completed",
  "domain": "auth",
  "key": "signupCompleted",
  "description": "User completes account registration",
  "purpose": "Measure registration conversion and acquisition performance",
  "allowAdditionalProperties": true,
  "properties": {
    "method": {
      "type": "string",
      "description": "Authentication method used",
      "enum": ["email", "google", "apple"],
      "allowOtherValues": true
    },
    "campaign_id": {
      "type": "string",
      "optional": true
    },
    "attempt_number": {
      "type": "number"
    }
  }
}
```

- Event names are sent to PostHog exactly as written. Any style is accepted and
  catalogs may mix styles, including `Signup Completed`, `signup_completed`,
  and `signupCompleted`.
- `domain` optionally groups generated TypeScript names, for example
  `eventNames.auth.signupCompleted`. Omit it to generate
  `eventNames.signupCompleted`. Folders and filenames do not affect this API.
- `key` is the required, stable programmatic identifier used by generated
  contracts, such as `signupCompleted`. It must be lower camel case and is
  intentionally independent of `name`.
- `description` explains what happened. Optional `purpose` explains why the
  organisation captures the event.
- `properties` is required, but may be empty.
- Property names use `snake_case`.
- Supported property types are `string`, `number`, and `boolean`.
- Properties are required unless `"optional": true` is set.
- String enums are strict by default.
- Event-level `allowAdditionalProperties` permits undeclared properties. Omit if not required.
- Property-level `allowOtherValues` makes a string enum recommended rather than
  exhaustive. TypeScript editors still suggest the listed values while allowing
  other strings. Omit if not required.
- Duplicate event names and unknown definition fields are rejected.

## Reuse common properties

Define a shared contract in `src/definitions/property-sets/`. Property set names
are globally unique, use `snake_case`, and are referenced by name rather than
file path.

```json
{
  "name": "session_context",
  "description": "Properties identifying the current session",
  "properties": {
    "session_id": { "type": "string" },
    "is_authenticated": { "type": "boolean", "optional": true }
  }
}
```

Reference it from any event:

```json
{
  "name": "Signup Completed",
  "key": "signupCompleted",
  "description": "User completes account registration",
  "propertySets": ["session_context"],
  "properties": {
    "method": { "type": "string" }
  }
}
```

Shared properties are expanded into every generated contract. An unknown set or
a property duplicated by another set or the event itself fails validation.
Property sets are flat and cannot reference other sets. They declare properties;
they do not automatically populate values at tracking time.

## Define user traits and views

Define durable information about identified users in
`src/definitions/traits/user.json`. This is one global contract. Trait
definitions use the same types, enums, and optional flags as event properties.

```json
{
  "description": "Durable traits associated with an identified user",
  "traits": {
    "email": { "type": "string", "optional": true },
    "plan": {
      "type": "string",
      "enum": ["free", "pro", "enterprise"],
      "optional": true
    }
  }
}
```

Define page or screen views in JSON files under `src/definitions/views/`:

```json
{
  "name": "Product Details",
  "key": "productDetails",
  "description": "User views a product",
  "properties": {
    "product_id": { "type": "string" }
  }
}
```

Views generate constants such as `viewNames.productDetails`. Traits and views
are strict by default and support `allowAdditionalTraits` and
`allowAdditionalProperties` respectively when an explicit escape hatch is
needed.

## Deprecate an event

Active events do not need a `status`. Deprecate an event before removing it:

```json
{
  "name": "Signup Started",
  "key": "signupStarted",
  "description": "User begins account registration",
  "status": "deprecated",
  "deprecatedSince": "2026-09-01",
  "replacement": "Signup Completed",
  "properties": {}
}
```

`replacement` is optional, but must refer to another active event. Generated
TypeScript contracts mark deprecated events for consumers. Git history
records when events were deprecated or removed.

## Validate and generate

```sh
pnpm validate   # validate event JSON
pnpm generate   # regenerate all contracts
pnpm impact     # report contract changes relative to HEAD
pnpm run ci     # build, type-check, and run all tests
```

Use `pnpm impact --base origin/main` to compare with another Git ref. The
default Markdown output can be copied into a ticket or saved with
`pnpm --silent impact --base origin/main > analytics-impact.md`. Add `--json` for a
machine-readable report. Impact reporting is informational: it recommends a
semantic version change but does not reject contract changes.

Commit definitions together with the generated `*-definition.schema.json`
files, `src/generated/`, and `generated/`.
`dist/` and `node_modules/` are local-only and must not be committed.

## TypeScript usage

Replace `data-system` with the published package name when the package is given
its company scope.

```ts
import { analytics } from "./analytics";
import { eventNames, viewNames } from "data-system";

analytics.track(eventNames.auth.signupCompleted, {
  method: "email",
  campaign_id: "spring-launch",
});

analytics.identify("user-123", { plan: "pro" });
analytics.view(viewNames.integrationExample, { source: "direct" });
analytics.clearIdentity();
```

Create `analytics` with `createAnalytics(adapter)`. The adapter is the only code
that knows about PostHog or another provider. Events, user traits, and views are
type checked and runtime validated before reaching it. `createTracker` remains
available when only event capture is required.

A runnable React, Vite, and PostHog integration is available in
[`examples/react-posthog`](examples/react-posthog). Copy its `.env.example` to
`.env`, add a PostHog project key, then run `pnpm build` and
`pnpm example:dev` from the repository root.

## Publish privately to npm

1. Change the package name in `package.json` to the company's npm scope, such as
   `@your-company/analytics`, and add the repository URL.
2. In npm, configure that package's trusted publisher for this GitHub repository,
   `.github/workflows/publish.yml`, and the `npm` environment.
3. Run **Prepare analytics release** from GitHub Actions on the default branch
   and select the version increment. It validates the contracts, commits the new
   version, and creates a tag.
4. The tag automatically runs **Publish analytics package**, which publishes
   with `restricted` access and creates the GitHub release.

If publication fails, rerun its failed job against the same tag; preparing a new
version is not required.

Publishing uses GitHub OIDC, so this repository does not need an npm publishing
token. A repository that installs the private package does need read access. Add
an `.npmrc` to that repository:

```ini
@your-company:registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

Set `NPM_TOKEN` locally using a read-only granular npm token, then add the
package:

```sh
pnpm add @your-company/analytics
```

For CI, store the same kind of read-only token as a GitHub Actions secret and
expose it to the install step:

```yaml
- run: pnpm install --frozen-lockfile
  env:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Never commit the token itself.

## Language-neutral catalog

The build also generates `generated/analytics-catalog.json`. Other tooling can
consume this catalog without parsing the TypeScript output. It contains events,
views, user traits, and reusable property sets. Each event contains its exact
provider `name`, stable programmatic `key`, and optional `domain`.
