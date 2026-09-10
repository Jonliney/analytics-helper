import assert from "node:assert/strict";
import test from "node:test";

import {
  createTracker,
  parseEvent,
  type AnalyticsValidationFailure,
} from "../src/index.js";

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
    parseEvent("signup_started", {
      method: "sso",
      experiment_variant: "short-form",
    }),
    {
      method: "sso",
      experiment_variant: "short-form",
    },
  );
});

test("throws invalid events by default without calling the adapter", () => {
  let adapterCalled = false;
  const track = createTracker(() => {
    adapterCalled = true;
  });
  const unsafeTrack = track as unknown as (
    event: string,
    properties: unknown,
  ) => void;

  assert.throws(
    () => unsafeTrack("Signup Completed", {}),
    /expected one of|Invalid input/i,
  );
  assert.equal(adapterCalled, false);
});

test("can report and drop invalid events without calling the adapter", () => {
  const failures: AnalyticsValidationFailure[] = [];
  let adapterCalled = false;
  const track = createTracker(
    () => {
      adapterCalled = true;
      return "captured" as const;
    },
    {
      onInvalid(failure) {
        failures.push(failure);
        return "dropped" as const;
      },
    },
  );
  const unsafeTrack = track as unknown as (
    event: string,
    properties: unknown,
  ) => "captured" | "dropped";
  const invalidProperties = {};

  const result = unsafeTrack("Signup Completed", invalidProperties);

  assert.equal(result, "dropped");
  assert.equal(adapterCalled, false);
  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.event, "Signup Completed");
  assert.equal(failures[0]?.properties, invalidProperties);
  assert.ok(failures[0]?.error instanceof Error);
});

test("does not treat adapter errors as validation failures", () => {
  const adapterError = new Error("PostHog is unavailable");
  let invalidHandlerCalled = false;
  const track = createTracker(
    () => {
      throw adapterError;
    },
    {
      onInvalid() {
        invalidHandlerCalled = true;
      },
    },
  );

  assert.throws(
    () => track("Signup Completed", { method: "email" }),
    (error) => error === adapterError,
  );
  assert.equal(invalidHandlerCalled, false);
});
