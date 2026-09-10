# Analytics event contracts

This repository is the source of truth for product analytics events. It validates
event definitions in CI and generates a TypeScript package containing exact event
names, property types, and strict Zod schemas.

## Event names

The package does not enforce a naming convention. Existing and new catalogs can
use human-readable names, `snake_case`, `camelCase`, namespaced identifiers, or
another provider convention:

- `Signup Started`
- `signup_started`
- `signupStarted`
- `auth:signup-started`

Consistency within a product area is useful guidance, but CI does not reject a
catalog that contains multiple styles. Use a stable name that describes what
happened, not where the instrumentation is implemented. The value is sent to
PostHog exactly as written and should be treated as a permanent identifier.
Renaming it creates a different event in analytics.

Names must be non-empty and cannot contain accidental leading or trailing
whitespace. These are data-quality protections rather than style rules.

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

## Event lifecycle

Events are active by default, so existing definitions do not need a `status`
field. Deprecate an event before removing it from the catalog:

```json
{
  "name": "Signup Started",
  "description": "A user begins account registration",
  "owner": "growth",
  "status": "deprecated",
  "deprecatedSince": "2026-09-01",
  "replacement": "Signup Completed",
  "properties": {}
}
```

`deprecatedSince` is required for deprecated events and must be an ISO calendar
date (`YYYY-MM-DD`). `replacement` is optional; when supplied, it must name a
different active event in the same catalog. This prevents broken or circular
migration guidance.

The TypeScript generator adds `@deprecated` documentation to the event's schema
and definition. The Java generator adds Javadoc plus `@Deprecated(since = "...")`
to its record. Consumers therefore receive migration guidance through their
normal editor and compiler tooling.

Removal is a two-release process:

1. Mark the event deprecated, publish the change, and migrate consumers.
2. Once the configured grace period has elapsed, remove it and publish a major
   version.

The grace period is set in `analytics.config.json`; it is currently 90 days. CI
blocks removal of an active event and removal of a deprecated event before its
deadline. Passing the lifecycle policy does not make deletion backwards-
compatible: removing any event still requires a major version bump. The previous
published catalog must contain the deprecation, so adding the metadata and
deleting the event in one change is also rejected.

`owner` remains a non-empty team identifier rather than a registry-backed value.
When the company has an authoritative team registry, validation can be added to
the project configuration without changing each language renderer.

Contract changes affect every consumer:

- Adding an optional property is backwards-compatible.
- Adding a required property is breaking until every call site supplies it.
- Deprecating or reactivating an event is a patch-level metadata change.
- Renaming or removing an event, property, or enum value is breaking.

To make a change:

1. Edit or add a JSON file under `events/`.
2. Run `pnpm validate` for authoring feedback.
3. Run `pnpm generate` to update the authoring JSON Schema and every language
   output.
4. Run `pnpm test` and `pnpm typecheck`.
5. Commit the definition and generated files together, then publish a package
   version appropriate for the compatibility impact.

`pnpm run ci` performs validation, generation, compilation, type-checking, and
tests. The GitHub workflow runs this command for pull requests and `main` pushes,
then fails if the committed generated artifacts differ from a clean build.

## Compatibility checks

Compare the working event definitions with a Git ref containing a previously
generated catalog:

```sh
pnpm compatibility --base-ref main
pnpm compatibility --base-ref v1.2.3 --bump minor
```

The comparison reports every contract change and the minimum semantic version
bump:

- `major`: an existing tracking call can stop compiling or fail validation;
- `minor`: events or accepted values are added, or validation is relaxed;
- `patch`: descriptions, ownership, or recommended open-enum values change;
- `none`: the contracts are equivalent, including when only ordering changes.

Lifecycle policy violations are reported separately from semantic-version
impact. A sufficient major bump cannot override the minimum deprecation period.

Pull-request CI writes the comparison against the exact base commit to the GitHub
Actions summary. The publishing workflow compares against the tag matching the
current package version and rejects an insufficient selected bump. If no prior
tagged catalog exists, the first release establishes the compatibility baseline.

These rules describe the TypeScript tracking interface and runtime contract. The
generated Java demonstration is not yet a published compatibility surface; define
and enforce its source-compatibility policy when it becomes a Maven artifact.

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
By default, invalid events throw, which makes mistakes immediately visible in
development and tests.

Applications that must not interrupt a production user flow can explicitly report
and drop invalid events:

```ts
export const track = createTracker(
  (event, properties) => posthog.capture(event, properties),
  {
    onInvalid({ event, properties, error }) {
      reportAnalyticsError(error, { event, properties });
      // Returning without calling PostHog drops the invalid event.
    },
  },
);
```

`onInvalid` only handles catalog validation failures. The capture adapter is not
called for an invalid event, while errors thrown by PostHog still propagate to the
caller. The handler's return type is included in the return type of `track`; avoid
logging raw properties unless they meet the application's privacy requirements.

For validation without capture, use `parseEvent(name, value)`. The package also
exports `eventSchemas`, `eventDefinitions`, `AnalyticsEventName`,
`AnalyticsEvents`, `AnalyticsValidationFailure`, `TrackerOptions`, and the
discriminated `AnalyticsEvent` union.

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
change rather than an unvalidated escape hatch. Update the Zod authoring schema in
`tooling/authoring-schema.ts`, the affected language renderers, and their tests.
The authored TypeScript types and `event-definition.schema.json` are inferred and
generated from that schema, so the authoring contract has one source of truth.
Conformance tests run representative definitions through both Zod and Ajv to
ensure external Draft-07 consumers observe the same validation rules.

## Maintainer architecture

Repository commands live in `scripts/`; they are command-line adapters used by
`package.json` and CI. Reusable generation and validation implementation lives in
`tooling/`, while `src/` contains the runtime package published to consumers.

The package has these deliberate seams:

| Module interface                       | What its implementation hides                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseAuthoredEventDefinitionFile(value)` | Authoring validation, accepted JSON shapes, property-name conventions, and default values. Its input and output types are inferred from the same Zod schema.                     |
| `renderEventDefinitionJsonSchema()`    | Draft-07 JSON Schema conversion and publishing metadata derived from the authoring schema.                                                                                         |
| `loadEventCatalog(rootDirectory)`      | Recursive discovery, JSON parsing, schema validation, duplicate detection, sorting, provenance, and normalization of default values. Renderers receive only the normalized events. |
| `compareCatalogs(previous, current)`   | Event/property matching, enum-set comparison, compatibility classification, lifecycle removal policy, and calculation of the minimum semantic version bump.                         |
| `loadAnalyticsProjectConfig(rootDirectory)` | Repository policy configuration and validation, currently including the event deprecation grace period.                                                                    |
| `buildAnalyticsProject(rootDirectory)` | The output registry, language renderers, output locations, and write ordering. Every target is rendered before any artifact is written.                                            |
| `createTracker(capture, options?)`     | Event lookup, compile-time property matching, runtime Zod validation, invalid-event policy, and forwarding to the injected analytics adapter.                                      |

File and folder layout is authoring provenance, not part of the generated contract.
If a future language target needs product-area grouping, add explicit event metadata
rather than deriving semantic behavior from paths.

To add a language, implement one renderer over the normalized `EventDefinition[]`
and register its output in `tooling/build-project.ts`. It should not read files or
reimplement schema defaults.
