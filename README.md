# Analytics event contracts

Define analytics events once, validate them in CI, and generate type-safe
TypeScript, Java, and language-neutral contracts.

## Add or edit an event

Add a JSON file anywhere under `events/`. A file can contain one event or an
array of related events.

```json
{
  "name": "Signup Completed",
  "description": "User completes account registration",
  "owner": "growth",
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
- `description`, `owner`, and `properties` are required. Owners use lowercase
  identifiers such as `growth` or `identity-platform`.
- Property names use `snake_case`.
- Supported property types are `string`, `number`, and `boolean`.
- Properties are required unless `"optional": true` is set.
- String enums are strict by default.
- Event-level `allowAdditionalProperties` permits undeclared properties. Omit if not required.
- Property-level `allowOtherValues` makes a string enum recommended rather than
  exhaustive. Omit if not required.
- Duplicate event names and unknown definition fields are rejected.

## Deprecate an event

Active events do not need a `status`. Deprecate an event before removing it:

```json
{
  "name": "Signup Started",
  "description": "User begins account registration",
  "owner": "growth",
  "status": "deprecated",
  "deprecatedSince": "2026-09-01",
  "replacement": "Signup Completed",
  "properties": {}
}
```

`replacement` is optional, but must refer to another active event. CI prevents
active events from being removed and enforces the deprecation period configured
in `analytics.config.json`. Removing an event is still a major version change.

## Validate and generate

```sh
pnpm validate   # validate event JSON and project configuration
pnpm generate   # regenerate every language contract
pnpm run ci     # build, type-check, and run all tests
```

Commit event definitions together with `event-definition.schema.json`,
`src/generated/`, and `generated/`. `dist/` and `node_modules/` are local-only
and must not be committed.

To inspect the compatibility impact against another Git ref:

```sh
pnpm compatibility --base-ref main
```

## TypeScript usage

Replace `data-system` with the published package name when the package is given
its company scope.

```ts
import posthog from "posthog-js";
import { createTracker } from "data-system";

const track = createTracker((event, properties) =>
  posthog.capture(event, properties),
);

track("Signup Completed", {
  method: "email",
  campaign_id: "spring-launch",
});
```

Unknown events, missing required properties, invalid enum values, and unexpected
properties fail TypeScript checking and runtime validation. Use
`parseEvent(name, properties)` when validation is needed without capture.

## Other languages

The build also generates:

- Java 17 records and enums in
  `generated/java/com/company/analytics/AnalyticsEvents.java`.
- A language-neutral catalog in `generated/analytics-catalog.json` for Swift and
  future generators.

The manual **Publish analytics package** GitHub Action validates the repository,
checks the selected semantic-version bump, publishes the npm package, and creates
a release containing the cross-language contracts.
