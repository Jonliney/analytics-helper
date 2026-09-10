import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  CatalogValidationError,
  loadEventCatalog,
} from "../tooling/event-catalog.js";
import { createCatalogFixture, validEvent } from "./catalog-fixture.js";

test("loads and sorts valid definitions from nested folders", (t) => {
  const root = createCatalogFixture(t, {
    "auth/signup.json": validEvent,
    "billing/payment.json": {
      ...validEvent,
      name: "Payment Completed",
    },
  });

  const result = loadEventCatalog(root);

  assert.deepEqual(
    result.events.map(({ name }) => name),
    ["Payment Completed", "Signup Completed"],
  );
  assert.deepEqual(result.sources, [
    "events/auth/signup.json",
    "events/billing/payment.json",
  ]);

  const signup = result.events.find(({ name }) => name === "Signup Completed")!;
  assert.equal(signup.allowAdditionalProperties, false);
  assert.equal(signup.properties.method!.optional, false);
  assert.equal(signup.properties.method!.allowOtherValues, false);
  assert.equal(signup.properties.campaign_id!.optional, true);
});

test("loads multiple events from one product-area file", (t) => {
  const root = createCatalogFixture(t, {
    "auth/auth.json": [
      { ...validEvent, name: "Signup Started", properties: {} },
      validEvent,
    ],
  });

  const result = loadEventCatalog(root);

  assert.deepEqual(
    result.events.map(({ name }) => name),
    ["Signup Completed", "Signup Started"],
  );
  assert.deepEqual(result.sources, ["events/auth/auth.json"]);
});

test("validates replacement events across the complete catalog", (t) => {
  const root = createCatalogFixture(t, {
    "auth/auth.json": [
      validEvent,
      {
        ...validEvent,
        name: "Signup Started",
        status: "deprecated",
        deprecatedSince: "2026-09-01",
        replacement: "Signup Completed",
      },
    ],
  });

  const deprecated = loadEventCatalog(root).events.find(
    ({ name }) => name === "Signup Started",
  );

  assert.equal(deprecated?.status, "deprecated");
  if (deprecated?.status === "deprecated") {
    assert.equal(deprecated.replacement, "Signup Completed");
  }
});

test("rejects missing, self-referential, and deprecated replacements", (t) => {
  const root = createCatalogFixture(t, {
    "auth/events.json": [
      {
        ...validEvent,
        name: "Missing Replacement Deprecated",
        status: "deprecated",
        deprecatedSince: "2026-09-01",
        replacement: "Does Not Exist",
      },
      {
        ...validEvent,
        name: "Self Replacement Deprecated",
        status: "deprecated",
        deprecatedSince: "2026-09-01",
        replacement: "Self Replacement Deprecated",
      },
      {
        ...validEvent,
        name: "Deprecated Target",
        status: "deprecated",
        deprecatedSince: "2026-09-01",
      },
      {
        ...validEvent,
        name: "Deprecated Replacement Deprecated",
        status: "deprecated",
        deprecatedSince: "2026-09-01",
        replacement: "Deprecated Target",
      },
    ],
  });

  assert.throws(
    () => loadEventCatalog(root),
    (error: unknown) => {
      assert.ok(error instanceof CatalogValidationError);
      assert.match(error.message, /replacement event "Does Not Exist" does not exist/);
      assert.match(error.message, /replacement cannot refer to the same event/);
      assert.match(error.message, /replacement event "Deprecated Target" is deprecated/);
      return true;
    },
  );
});

test("reports invalid definitions and duplicate event names together", (t) => {
  const root = createCatalogFixture(t, {
    "auth/first.json": validEvent,
    "auth/second.json": validEvent,
    "broken.json": {
      ...validEvent,
      name: " padded event name",
      unexpected: true,
    },
  });

  assert.throws(
    () => loadEventCatalog(root),
    (error: unknown) => {
      assert.ok(error instanceof CatalogValidationError);
      assert.match(error.message, /duplicate event name "Signup Completed"/);
      assert.match(error.message, /must match pattern/);
      assert.match(error.message, /Unrecognized key.*unexpected/);
      return true;
    },
  );
});

test("rejects duplicate enum values and misplaced flexibility flags", (t) => {
  const root = createCatalogFixture(t, {
    "duplicate-enum.json": {
      ...validEvent,
      name: "Duplicate Enum Tested",
      properties: {
        method: { type: "string", enum: ["email", "email"] },
      },
    },
    "misplaced-flag.json": {
      ...validEvent,
      name: "Misplaced Flag Tested",
      properties: {
        method: { type: "string", allowOtherValues: true },
      },
    },
  });

  assert.throws(
    () => loadEventCatalog(root),
    (error: unknown) => {
      assert.ok(error instanceof CatalogValidationError);
      assert.match(error.message, /Enum values must be unique/);
      assert.match(error.message, /allowOtherValues/);
      return true;
    },
  );
});

test("reports malformed JSON with its source file", (t) => {
  const root = createCatalogFixture(t, { "auth/signup.json": validEvent });
  const malformedFile = path.join(root, "events", "auth", "malformed.json");
  fs.writeFileSync(malformedFile, "{ not-json }");

  assert.throws(
    () => loadEventCatalog(root),
    (error: unknown) => {
      assert.ok(error instanceof CatalogValidationError);
      assert.match(error.message, /events\/auth\/malformed\.json: invalid JSON/);
      return true;
    },
  );
});
