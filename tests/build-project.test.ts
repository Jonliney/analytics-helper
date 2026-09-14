import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildAnalyticsProject } from "../tooling/build-project.js";
import { LANGUAGE_NEUTRAL_CATALOG_SCHEMA_VERSION } from "../tooling/generate-catalog.js";
import { createCatalogFixture, validEvent } from "./catalog-fixture.js";

test("builds every artifact through one interface", (t) => {
  const root = createCatalogFixture(t, { "auth/auth.json": [validEvent] });

  const result = buildAnalyticsProject(root);

  assert.equal(result.eventCount, 1);
  assert.equal(result.propertySetCount, 0);
  assert.equal(result.viewCount, 0);
  assert.equal(result.hasUserTraits, false);
  assert.deepEqual(result.artifacts, [
    "event-definition.schema.json",
    "property-set-definition.schema.json",
    "user-traits-definition.schema.json",
    "view-definition.schema.json",
    "src/generated/analytics-events.ts",
    "generated/analytics-catalog.json",
  ]);

  for (const artifact of result.artifacts) {
    assert.equal(fs.existsSync(path.join(root, artifact)), true);
  }
});

test("renders all targets before writing any artifact", (t) => {
  const root = createCatalogFixture(t, {
    "auth/auth.json": [
      { ...validEvent, name: "2FA Started" },
      { ...validEvent, name: "2 FA Started" },
    ],
  });

  assert.throws(
    () => buildAnalyticsProject(root),
    /collision/,
  );
  assert.equal(fs.existsSync(path.join(root, "src/generated")), false);
  assert.equal(fs.existsSync(path.join(root, "generated")), false);
  assert.equal(
    fs.existsSync(path.join(root, "event-definition.schema.json")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(root, "property-set-definition.schema.json")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(root, "user-traits-definition.schema.json")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(root, "view-definition.schema.json")),
    false,
  );
});

test("builds typed user-trait and view contracts", (t) => {
  const root = createCatalogFixture(
    t,
    { "auth/auth.json": validEvent },
    {},
    {
      "app.json": {
        name: "Settings",
        key: "settings",
        description: "User views settings",
        properties: {
          section: { type: "string", enum: ["profile", "security"] },
        },
      },
    },
    {
      "user.json": {
        description: "Durable user traits",
        traits: {
          plan: { type: "string", enum: ["free", "pro"], optional: true },
        },
      },
    },
  );

  const result = buildAnalyticsProject(root);
  const typescript = fs.readFileSync(
    path.join(root, "src/generated/analytics-events.ts"),
    "utf8",
  );
  const neutral = JSON.parse(
    fs.readFileSync(path.join(root, "generated/analytics-catalog.json"), "utf8"),
  ) as { userTraits: unknown; views: unknown[] };

  assert.equal(result.viewCount, 1);
  assert.equal(result.hasUserTraits, true);
  assert.match(typescript, /settings: "Settings"/);
  assert.match(typescript, /"Settings": z\.strictObject/);
  assert.match(typescript, /"plan": z\.enum\(\["free", "pro"\]\)\.optional\(\)/);
  assert.notEqual(neutral.userTraits, null);
  assert.equal(neutral.views.length, 1);
});

test("renders expanded shared properties and traceability metadata", (t) => {
  const root = createCatalogFixture(
    t,
    {
      "auth/auth.json": {
        ...validEvent,
        purpose: "Measure registration conversion",
        propertySets: ["session_context"],
      },
    },
    {
      "session.json": {
        name: "session_context",
        description: "Current session properties",
        properties: { session_id: { type: "string" } },
      },
    },
  );

  const result = buildAnalyticsProject(root);
  const typescript = fs.readFileSync(
    path.join(root, "src/generated/analytics-events.ts"),
    "utf8",
  );
  const neutral = JSON.parse(
    fs.readFileSync(
      path.join(root, "generated/analytics-catalog.json"),
      "utf8",
    ),
  ) as {
    schemaVersion: number;
    propertySets: unknown[];
    events: Array<{
      key: string;
      purpose?: string;
      propertySets: string[];
      properties: object;
    }>;
  };

  assert.equal(result.propertySetCount, 1);
  assert.match(typescript, /"session_id": z\.string\(\)/);
  assert.match(typescript, /propertySets: \["session_context"\]/);
  assert.equal(
    neutral.schemaVersion,
    LANGUAGE_NEUTRAL_CATALOG_SCHEMA_VERSION,
  );
  assert.equal(neutral.propertySets.length, 1);
  assert.equal(neutral.events[0]?.key, "signupCompleted");
  assert.equal(neutral.events[0]?.purpose, "Measure registration conversion");
  assert.deepEqual(neutral.events[0]?.propertySets, ["session_context"]);
  assert.equal("session_id" in neutral.events[0]!.properties, true);
});
