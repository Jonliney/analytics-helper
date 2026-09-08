import assert from "node:assert/strict";
import test from "node:test";

import { createTracker, parseEvent } from "../src/index.js";

test("tracks a declared event and returns the adapter result", () => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const track = createTracker((event, properties) => {
    calls.push([event, properties]);
    return "captured" as const;
  });

  const result = track("Signup Completed", {
    method: "email",
    campaign_id: "launch",
  });

  assert.equal(result, "captured");
  assert.deepEqual(calls, [
    [
      "Signup Completed",
      { method: "email", campaign_id: "launch" },
    ],
  ]);
});

test("rejects missing required properties at runtime", () => {
  assert.throws(
    () => parseEvent("Signup Completed", {}),
    /expected one of|Invalid input/i,
  );
});

test("rejects undeclared properties at runtime", () => {
  assert.throws(
    () =>
      parseEvent("Signup Completed", {
        method: "email",
        unexpected: true,
      }),
    /unrecognized key/i,
  );
});

test("allows additional properties for events that explicitly opt in", () => {
  assert.deepEqual(
    parseEvent("Signup Started", {
      method: "sso",
      experiment_variant: "short-form",
    }),
    {
      method: "sso",
      experiment_variant: "short-form",
    },
  );
});
