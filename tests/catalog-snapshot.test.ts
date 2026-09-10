import assert from "node:assert/strict";
import test from "node:test";

import { parseCatalogSnapshot } from "../tooling/catalog-snapshot.js";

test("normalizes omitted defaults in older version-one catalogs", () => {
  const events = parseCatalogSnapshot(
    JSON.stringify({
      schemaVersion: 1,
      events: [
        {
          name: "Signup Completed",
          description: "A user completes registration",
          owner: "growth",
          properties: {
            method: {
              type: "string",
              enum: ["email", "google"],
            },
          },
        },
      ],
    }),
    "previous catalog",
  );

  assert.equal(events[0]!.allowAdditionalProperties, false);
  assert.equal(events[0]!.status, "active");
  assert.equal(events[0]!.properties.method!.optional, false);
  assert.equal(events[0]!.properties.method!.allowOtherValues, false);
});

test("parses lifecycle metadata from generated catalogs", () => {
  const events = parseCatalogSnapshot(
    JSON.stringify({
      schemaVersion: 1,
      events: [
        {
          name: "Signup Started",
          description: "A user starts registration",
          owner: "growth",
          status: "deprecated",
          deprecatedSince: "2026-09-01",
          replacement: "Signup Completed",
          properties: {},
        },
      ],
    }),
  );

  assert.equal(events[0]!.status, "deprecated");
  if (events[0]!.status === "deprecated") {
    assert.equal(events[0]!.deprecatedSince, "2026-09-01");
    assert.equal(events[0]!.replacement, "Signup Completed");
  }
});

test("rejects unsupported and duplicate catalog snapshots", () => {
  assert.throws(
    () => parseCatalogSnapshot('{"schemaVersion":2,"events":[]}'),
    /not a supported analytics catalog/,
  );

  const event = {
    name: "Signup Completed",
    description: "A user completes registration",
    owner: "growth",
    properties: {},
  };
  assert.throws(
    () =>
      parseCatalogSnapshot(
        JSON.stringify({ schemaVersion: 1, events: [event, event] }),
      ),
    /duplicate event/,
  );
});
