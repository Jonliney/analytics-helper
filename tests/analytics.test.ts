import assert from "node:assert/strict";
import test from "node:test";

import {
  createAnalytics,
  parseUserTraits,
  parseView,
  type AnalyticsClientValidationFailure,
  viewNames,
} from "../src/index.js";

test("validates every provider-neutral operation before calling the adapter", () => {
  const calls: Array<readonly [string, ...unknown[]]> = [];
  const analytics = createAnalytics({
    track(event, properties) {
      calls.push(["track", event, properties]);
      return "tracked" as const;
    },
    identify(userId, traits) {
      calls.push(["identify", userId, traits]);
      return "identified" as const;
    },
    view(name, properties) {
      calls.push(["view", name, properties]);
      return "viewed" as const;
    },
    clearIdentity() {
      calls.push(["clearIdentity"]);
      return "cleared" as const;
    },
  });

  assert.equal(
    analytics.track("Signup Completed", { method: "email" }),
    "tracked",
  );
  assert.equal(
    analytics.identify("user-123", { plan: "pro", is_employee: false }),
    "identified",
  );
  assert.equal(
    analytics.view(viewNames.integrationExample, { source: "direct" }),
    "viewed",
  );
  assert.equal(analytics.clearIdentity(), "cleared");

  assert.deepEqual(calls, [
    ["track", "Signup Completed", { method: "email" }],
    ["identify", "user-123", { plan: "pro", is_employee: false }],
    ["view", "Integration Example", { source: "direct" }],
    ["clearIdentity"],
  ]);
});

test("rejects invalid identities without calling the adapter", () => {
  let calls = 0;
  const analytics = createAnalytics({
    track() {},
    identify() {
      calls += 1;
    },
    view() {},
    clearIdentity() {},
  });
  const unsafeIdentify = analytics.identify as (
    userId: string,
    traits: unknown,
  ) => void;

  assert.throws(() => unsafeIdentify("  ", {}), /user ID cannot be empty/i);
  assert.throws(
    () => unsafeIdentify("user-123", { unexpected: true }),
    /unrecognized key/i,
  );
  assert.throws(
    () => unsafeIdentify("user-123", { is_employee: "no" }),
    /expected boolean/i,
  );
  assert.equal(calls, 0);
});

test("rejects unknown or invalid views without calling the adapter", () => {
  let calls = 0;
  const analytics = createAnalytics({
    track() {},
    identify() {},
    view() {
      calls += 1;
    },
    clearIdentity() {},
  });
  const unsafeView = analytics.view as (
    name: string,
    properties: unknown,
  ) => void;

  assert.throws(() => unsafeView("Missing View", {}), /unknown analytics view/i);
  assert.throws(
    () => unsafeView("Integration Example", { source: 42 }),
    /expected one of/i,
  );
  assert.equal(calls, 0);
});

test("applies one invalid-data policy to track, identify, and view", () => {
  const adapterCalls: string[] = [];
  const failures: AnalyticsClientValidationFailure[] = [];
  const analytics = createAnalytics(
    {
      track() {
        adapterCalls.push("track");
        return "tracked" as const;
      },
      identify() {
        adapterCalls.push("identify");
        return "identified" as const;
      },
      view() {
        adapterCalls.push("view");
        return "viewed" as const;
      },
      clearIdentity() {},
    },
    {
      onInvalid(failure) {
        failures.push(failure);
        return "dropped" as const;
      },
    },
  );
  const unsafeTrack = analytics.track as unknown as (
    event: string,
    properties: unknown,
  ) => string;
  const unsafeIdentify = analytics.identify as unknown as (
    userId: string,
    traits: unknown,
  ) => string;
  const unsafeView = analytics.view as unknown as (
    name: string,
    properties: unknown,
  ) => string;

  assert.equal(unsafeTrack("Signup Completed", {}), "dropped");
  assert.equal(unsafeIdentify("user-123", { unexpected: true }), "dropped");
  assert.equal(unsafeView("Missing View", {}), "dropped");
  assert.deepEqual(
    failures.map((failure) => failure.operation),
    ["track", "identify", "view"],
  );
  assert.deepEqual(adapterCalls, []);
  assert.equal(failures[0]?.operation, "track");
  assert.equal(
    failures[0]?.operation === "track" ? failures[0].event : undefined,
    "Signup Completed",
  );
  assert.equal(failures[1]?.operation, "identify");
  assert.equal(
    failures[1]?.operation === "identify" ? failures[1].userId : undefined,
    "user-123",
  );
  assert.equal(failures[2]?.operation, "view");
  assert.equal(
    failures[2]?.operation === "view" ? failures[2].name : undefined,
    "Missing View",
  );
  assert.ok(failures.every((failure) => failure.error instanceof Error));
});

test("exports standalone parsers for server boundaries", () => {
  assert.deepEqual(parseUserTraits({ plan: "enterprise" }), {
    plan: "enterprise",
  });
  assert.deepEqual(parseView("Integration Example", {}), {});
});

test("does not treat provider failures as validation failures", () => {
  const providerError = new Error("provider unavailable");
  let invalidHandlerCalled = false;
  const analytics = createAnalytics(
    {
      track() {
        throw providerError;
      },
      identify() {
        throw providerError;
      },
      view() {
        throw providerError;
      },
      clearIdentity() {},
    },
    {
      onInvalid() {
        invalidHandlerCalled = true;
      },
    },
  );

  assert.throws(
    () => analytics.identify("user-123", {}),
    (error) => error === providerError,
  );
  assert.throws(
    () => analytics.track("Signup Completed", { method: "email" }),
    (error) => error === providerError,
  );
  assert.throws(
    () => analytics.view(viewNames.integrationExample, {}),
    (error) => error === providerError,
  );
  assert.equal(invalidHandlerCalled, false);
});
