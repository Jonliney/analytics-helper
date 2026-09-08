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

Unknown event names, missing required properties, invalid enum values, and extra
properties fail TypeScript checking. They are also rejected at runtime before the
PostHog adapter is called.

For validation without capture, use `parseEvent(name, value)`. The package also
exports `eventSchemas`, `eventDefinitions`, `AnalyticsEventName`,
`AnalyticsEvents`, and the discriminated `AnalyticsEvent` union.

## Other languages

Java, Swift, and other ecosystems cannot import an npm TypeScript module directly.
The build also emits `generated/analytics-catalog.json`, exposed as
`data-system/catalog.json`. It is a stable, language-neutral input for generators
or native packages such as `analytics-java` and `analytics-swift`.

Adding a new property type or event-level metadata field is intentionally a tool
change rather than an unvalidated escape hatch. Update the JSON Schema, the types
in `tooling/event-catalog.ts`, the renderer in `tooling/generate-catalog.ts`, and
their tests. This keeps every generated language contract aligned.
