import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CatalogValidationError,
  loadEventCatalog,
} from "../tooling/event-catalog.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

function createFixture(eventFiles: Record<string, unknown>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-catalog-"));
  fs.cpSync(
    path.join(repositoryRoot, "event-definition.schema.json"),
    path.join(root, "event-definition.schema.json"),
  );

  for (const [relativePath, value] of Object.entries(eventFiles)) {
    const file = path.join(root, "events", relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  }

  return root;
}

const validEvent = {
  name: "Signup Completed",
  description: "A user signs up",
  owner: "growth",
  properties: {
    method: { type: "string", enum: ["email", "google"] },
    campaign_id: { type: "string", optional: true },
  },
};

test("loads and sorts valid definitions from nested folders", () => {
  const root = createFixture({
    "auth/signup.json": validEvent,
    "billing/payment.json": {
      ...validEvent,
      name: "Payment Completed",
    },
  });

  const result = loadEventCatalog(root);

  assert.deepEqual(
    result.events.map(({ definition }) => definition.name),
    ["Payment Completed", "Signup Completed"],
  );
});

test("loads multiple events from one product-area file", () => {
  const root = createFixture({
    "auth/auth.json": [
      { ...validEvent, name: "Signup Started", properties: {} },
      validEvent,
    ],
  });

  const result = loadEventCatalog(root);

  assert.deepEqual(
    result.events.map(({ definition }) => definition.name),
    ["Signup Completed", "Signup Started"],
  );
  assert.deepEqual(
    result.events.map(({ source }) => source),
    ["events/auth/auth.json", "events/auth/auth.json"],
  );
});

test("reports invalid definitions and duplicate event names together", () => {
  const root = createFixture({
    "auth/first.json": validEvent,
    "auth/second.json": validEvent,
    "broken.json": {
      ...validEvent,
      name: "not valid",
      unexpected: true,
    },
  });

  assert.throws(
    () => loadEventCatalog(root),
    (error: unknown) => {
      assert.ok(error instanceof CatalogValidationError);
      assert.match(error.message, /duplicate event name "Signup Completed"/);
      assert.match(error.message, /must match pattern/);
      assert.match(error.message, /must NOT have additional properties/);
      return true;
    },
  );
});

test("reports malformed JSON with its source file", () => {
  const root = createFixture({ "auth/signup.json": validEvent });
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
