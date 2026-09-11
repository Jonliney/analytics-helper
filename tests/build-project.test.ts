import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildAnalyticsProject } from "../tooling/build-project.js";
import { createCatalogFixture, validEvent } from "./catalog-fixture.js";

test("builds every language artifact through one interface", (t) => {
  const root = createCatalogFixture(t, { "auth/auth.json": [validEvent] });

  const result = buildAnalyticsProject(root);

  assert.equal(result.eventCount, 1);
  assert.equal(result.propertySetCount, 0);
  assert.deepEqual(result.artifacts, [
    "event-definition.schema.json",
    "property-set-definition.schema.json",
    "src/generated/analytics-events.ts",
    "generated/analytics-catalog.json",
    "generated/java/com/company/analytics/AnalyticsEvents.java",
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
});

test("renders expanded shared properties and traceability metadata", (t) => {
  const root = createCatalogFixture(
    t,
    {
      "auth/auth.json": {
        ...validEvent,
        propertySets: ["session_context"],
      },
    },
    {
      "session.json": {
        name: "session_context",
        description: "Current session properties",
        owner: "data-platform",
        properties: { session_id: { type: "string" } },
      },
    },
  );

  const result = buildAnalyticsProject(root);
  const typescript = fs.readFileSync(
    path.join(root, "src/generated/analytics-events.ts"),
    "utf8",
  );
  const java = fs.readFileSync(
    path.join(
      root,
      "generated/java/com/company/analytics/AnalyticsEvents.java",
    ),
    "utf8",
  );
  const neutral = JSON.parse(
    fs.readFileSync(
      path.join(root, "generated/analytics-catalog.json"),
      "utf8",
    ),
  ) as {
    propertySets: unknown[];
    events: Array<{ propertySets: string[]; properties: object }>;
  };

  assert.equal(result.propertySetCount, 1);
  assert.match(typescript, /"session_id": z\.string\(\)/);
  assert.match(typescript, /propertySets: \["session_context"\]/);
  assert.match(java, /String sessionId/);
  assert.equal(neutral.propertySets.length, 1);
  assert.deepEqual(neutral.events[0]?.propertySets, ["session_context"]);
  assert.equal("session_id" in neutral.events[0]!.properties, true);
});
