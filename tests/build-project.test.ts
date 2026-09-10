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
  assert.deepEqual(result.artifacts, [
    "event-definition.schema.json",
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
    /Java class name collision/,
  );
  assert.equal(fs.existsSync(path.join(root, "src/generated")), false);
  assert.equal(fs.existsSync(path.join(root, "generated")), false);
  assert.equal(
    fs.existsSync(path.join(root, "event-definition.schema.json")),
    false,
  );
});
