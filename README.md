# Analytics event contracts

This repository is the source of truth for product analytics events. It validates
event definitions in CI and generates a TypeScript package containing exact event
names, property types, and strict Zod schemas.

## Naming convention

Event names use a human-readable `Object Action` convention in Title Case:

- `Signup Started`
- `Signup Completed`
- `Password Reset Requested`

Use a stable name that describes what happened, not where the instrumentation is
implemented. The value is sent to PostHog exactly as written and should be treated
as a permanent identifier. Renaming it creates a different event in analytics.

Property names use `snake_case`, such as `campaign_id` and `signup_method`. This
keeps properties comfortable to use in code, queries, and exported data.

## Organising event files

JSON files can live anywhere under `events/`; folders are only for organisation.
A file may contain either one event object or an array of events.

### One event per file

```text
events/
  auth/
    signup-started.json
    signup-completed.json
  billing/
    checkout-completed.json
```

```json
{
  "name": "Signup Started",
  "description": "A user begins account registration",
  "owner": "growth",
  "properties": {}
}
```

### Grouped by product area

```text
events/
  auth.json
  billing.json
```

```json
[
  {
    "name": "Signup Started",
    "description": "A user begins account registration",
    "owner": "growth",
    "properties": {}
  },
  {
    "name": "Signup Completed",
    "description": "A user completes account registration",
    "owner": "growth",
    "properties": {
      "method": {
        "type": "string",
        "enum": ["email", "google", "apple"]
      }
    }
  }
]
```

Both layouts generate the same consumer interface. Choose the layout that is
easiest for the owning team to maintain. Empty arrays and duplicate event names
are rejected.

## Adding or changing properties

Add the property beneath the event's `properties` object:

```json
"properties": {
  "method": {
    "type": "string",
    "description": "Authentication method used",
    "enum": ["email", "google", "apple"]
  },
  "campaign_id": {
    "type": "string",
    "description": "Acquisition campaign, when available",
    "optional": true
  },
  "attempt_number": { "type": "number" },
  "is_invited": { "type": "boolean" }
}
```

Supported types are `string`, `number`, and `boolean`. String properties can have
a non-empty `enum`. Properties are required by default; add `"optional": true`
only when callers legitimately may not have the value.

### Controlled flexibility

Strict contracts are the default because they catch misspelled properties and
unexpected enum values close to the call site. Events that genuinely need temporary
or experiment-specific properties can opt in explicitly:

```json
{
  "name": "Signup Started",
  "description": "A user begins account registration",
  "owner": "growth",
  "allowAdditionalProperties": true,
  "properties": {
    "method": {
      "type": "string",
      "enum": ["email", "google", "apple"],
      "allowOtherValues": true
    }
  }
}
```

`allowAdditionalProperties` permits undeclared keys but still requires every
declared required property. `allowOtherValues` changes a string enum from an
exhaustive list into a documented list of recommended values; its generated type
becomes `string`. Keep both flags off unless the event has a concrete need for an
open contract.

Contract changes affect every consumer:

- Adding an optional property is backwards-compatible.
- Adding a required property is breaking until every call site supplies it.
- Renaming or removing an event, property, or enum value is breaking.

To make a change:

1. Edit or add a JSON file under `events/`.
2. Run `pnpm validate` for authoring feedback.
3. Run `pnpm generate` to update the TypeScript and language-neutral outputs.
4. Run `pnpm test` and `pnpm typecheck`.
5. Commit the definition and generated files together, then publish a package
   version appropriate for the compatibility impact.

`pnpm run ci` performs validation, generation, compilation, type-checking, and
tests. The GitHub workflow runs this command for pull requests and `main` pushes.

## Publishing a release

The `Publish analytics package` workflow is manually available under GitHub
Actions. It offers three choices:

- version increment: `patch`, `minor`, or `major`;
- npm tag: `latest` or `next`;
- visibility: `restricted` or `public`.

The workflow validates and builds every output, compiles the generated Java,
increments the package version, commits and tags it, publishes it to npm, and
creates a GitHub release containing the language-neutral catalog and Java source.

Before its first use:

1. Replace `data-system` with the real scoped package name.
2. Add an exact `repository.url` to `package.json`.
3. Publish or reserve the package on npm, then configure npm trusted publishing
   for this GitHub repository, `publish.yml`, and the `npm` environment. Enable
   direct `npm publish` as an allowed action.
4. Ensure GitHub Actions may push release commits and tags to the default branch.

The workflow uses npm trusted publishing with short-lived OIDC credentials; it
does not require a long-lived `NPM_TOKEN`.

## TypeScript consumer

The repository currently retains its existing npm name, `data-system`. Rename it
to the company's real scope (for example, `@company/analytics-ts`) before publishing.

```ts
import posthog from "posthog-js";
import { createTracker } from "data-system";

export const track = createTracker((event, properties) =>
  posthog.capture(event, properties),
);

track("Signup Completed", {
  method: "email",
  campaign_id: "spring-launch",
});
```

Unknown event names and missing required properties always fail TypeScript
checking. Invalid enum values and extra properties also fail unless that particular
property or event has explicitly enabled the controlled flexibility flags above.
The same contract is enforced at runtime before the PostHog adapter is called.

For validation without capture, use `parseEvent(name, value)`. The package also
exports `eventSchemas`, `eventDefinitions`, `AnalyticsEventName`,
`AnalyticsEvents`, and the discriminated `AnalyticsEvent` union.

## Java consumer

The build emits Java 17 records and enums at
`generated/java/com/company/analytics/AnalyticsEvents.java`. CI compiles this file.
See `examples/java/README.md` for a PostHog server adapter and typed usage example.

For production adoption, publish the generated source as a small Maven package.
Each GitHub release also contains it in a cross-language archive, which is useful
for evaluation before Maven publication is configured.

## Other languages

Swift and other ecosystems cannot import the npm module directly. The build emits
`generated/analytics-catalog.json`, exposed as `data-system/catalog.json`, as the
stable language-neutral input for additional native generators.

Adding a new property type or event-level metadata field is intentionally a tool
change rather than an unvalidated escape hatch. Update the JSON Schema, the types
in `tooling/event-catalog.ts`, the TypeScript renderer, every native renderer, and
their tests. This keeps every generated language contract aligned.

## Performance

Validation compiles the JSON Schema once per command, then validates each file in
one pass. Generation sorts events once and renders each target linearly. Use
`pnpm benchmark` to exercise 300 events across 300 separate files—the deliberately
less efficient layout—when changing validation or generation code.

The main scaling consideration is consumer bundle size rather than repository
generation time: importing the runtime tracker initializes every Zod schema. At a
few hundred events this is normally modest, but if browser bundle measurements
become material, the next step is generated product-area subpath exports rather
than weakening validation globally.
