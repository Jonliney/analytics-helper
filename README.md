# Analytics event contracts

Define analytics events once, validate them in CI, and generate type-safe
TypeScript, Java, and language-neutral contracts.

## Add or edit an event

Add a JSON file anywhere under `events/`. A file can contain one event or an
array of related events.

```json
{
  "name": "Signup Completed",
  "domain": "auth",
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
- `domain` optionally groups generated TypeScript names, for example
  `eventNames.auth.signupCompleted`. Omit it to generate
  `eventNames.signupCompleted`. Folders and filenames do not affect this API.
- The event key is derived from `name`. Add an optional lower-camel `key`, such
  as `"key": "registrationFinished"`, only when you need to override it.
- `description`, `owner`, and `properties` are required. Owners use lowercase
  identifiers such as `growth` or `identity-platform`.
- Property names use `snake_case`.
- Supported property types are `string`, `number`, and `boolean`.
- Properties are required unless `"optional": true` is set.
- String enums are strict by default.
- Event-level `allowAdditionalProperties` permits undeclared properties. Omit if not required.
- Property-level `allowOtherValues` makes a string enum recommended rather than
  exhaustive. TypeScript editors still suggest the listed values while allowing
  other strings. Omit if not required.
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

`replacement` is optional, but must refer to another active event. Generated
TypeScript and Java contracts mark deprecated events for consumers. Git history
records when events were deprecated or removed.

## Validate and generate

```sh
pnpm validate   # validate event JSON
pnpm generate   # regenerate every language contract
pnpm run ci     # build, type-check, and run all tests
```

Commit event definitions together with `event-definition.schema.json`,
`src/generated/`, and `generated/`. `dist/` and `node_modules/` are local-only
and must not be committed.

## TypeScript usage

Replace `data-system` with the published package name when the package is given
its company scope.

```ts
import posthog from "posthog-js";
import { createTracker, eventNames } from "data-system";

const track = createTracker((event, properties) =>
  posthog.capture(event, properties),
);

track(eventNames.auth.signupCompleted, {
  method: "email",
  campaign_id: "spring-launch",
});
```

Unknown events, missing required properties, invalid enum values, and unexpected
properties fail TypeScript checking and runtime validation. Use
`parseEvent(name, properties)` when validation is needed without capture. Raw
event strings remain supported, but `eventNames` provides autocomplete and
deprecation guidance.

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

## Other languages

The build also generates:

- Java 17 records and enums in
  `generated/java/com/company/analytics/AnalyticsEvents.java`.
- A language-neutral catalog in `generated/analytics-catalog.json` for Swift and
  future generators.

Java class names are derived from event names. When generating Java, every event
name must contain at least one ASCII letter or number. Names that cannot form a
class name, or two names that produce the same class name, fail generation with a
clear error.
