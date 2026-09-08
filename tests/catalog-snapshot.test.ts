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
  assert.equal(events[0]!.properties.method!.optional, false);
  assert.equal(events[0]!.properties.method!.allowOtherValues, false);
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
