import assert from "node:assert/strict";
import test from "node:test";

import {
  compareCatalogs,
  isVersionBumpSufficient,
} from "../tooling/catalog-compatibility.js";
import type {
  EventDefinition,
  PropertyDefinition,
} from "../tooling/event-catalog.js";

const stringProperty: PropertyDefinition = {
  type: "string",
  optional: false,
  enum: ["email", "google"],
  allowOtherValues: false,
};

const optionalProperty: PropertyDefinition = {
  type: "string",
  optional: true,
  allowOtherValues: false,
};

const signupCompleted: EventDefinition = {
  name: "Signup Completed",
  description: "A user completes registration",
  owner: "growth",
  status: "active",
  allowAdditionalProperties: false,
  properties: {
    method: stringProperty,
    campaign_id: optionalProperty,
  },
};

test("reports no bump for an unchanged contract", () => {
  assert.deepEqual(compareCatalogs([signupCompleted], [signupCompleted]), {
    requiredBump: "none",
    changes: [],
    policyViolations: [],
  });
});

test("classifies lifecycle metadata changes as patch", () => {
  const deprecated: EventDefinition = {
    ...signupCompleted,
    status: "deprecated",
    deprecatedSince: "2026-09-01",
    replacement: "Signup Started",
  };
  const comparison = compareCatalogs([signupCompleted], [deprecated]);

  assert.equal(comparison.requiredBump, "patch");
  assert.deepEqual(
    comparison.changes.map(({ message }) => message),
    [
      "Event was deprecated on 2026-09-01. Use Signup Started instead.",
    ],
  );
});

test("classifies metadata-only changes as patch", () => {
  const comparison = compareCatalogs(
    [signupCompleted],
    [
      {
        ...signupCompleted,
        description: "Updated description",
        owner: "identity",
      },
    ],
  );

  assert.equal(comparison.requiredBump, "patch");
  assert.deepEqual(
    comparison.changes.map(({ impact }) => impact),
    ["patch", "patch"],
  );
});

test("classifies additive and relaxed changes as minor", () => {
  const current: EventDefinition = {
    ...signupCompleted,
    allowAdditionalProperties: true,
    properties: {
      ...signupCompleted.properties,
      method: { ...stringProperty, optional: true },
      campaign_source: optionalProperty,
    },
  };
  const comparison = compareCatalogs(
    [signupCompleted],
    [current, { ...signupCompleted, name: "Signup Started" }],
  );

  assert.equal(comparison.requiredBump, "minor");
  assert.equal(
    comparison.changes.every(({ impact }) => impact === "minor"),
    true,
  );
});

test("classifies tracking-call-breaking changes as major", () => {
  const current: EventDefinition = {
    ...signupCompleted,
    properties: {
      method: { ...stringProperty, type: "number", enum: undefined },
      required_source: { ...optionalProperty, optional: false },
    },
  };
  const comparison = compareCatalogs([signupCompleted], [current]);

  assert.equal(comparison.requiredBump, "major");
  assert.deepEqual(
    comparison.changes.map(({ message }) => message),
    [
      "Property was removed.",
      "Type changed from string to number.",
      "Required property was added.",
    ],
  );
});

test("classifies removals and stricter open policies as major", () => {
  const activeRemoval = compareCatalogs([signupCompleted], []);
  assert.equal(activeRemoval.requiredBump, "major");
  assert.match(
    activeRemoval.policyViolations[0]!.message,
    /must be deprecated in a published catalog/,
  );

  const openEvent: EventDefinition = {
    ...signupCompleted,
    allowAdditionalProperties: true,
    properties: {
      ...signupCompleted.properties,
      method: { ...stringProperty, allowOtherValues: true },
    },
  };
  const closedEvent: EventDefinition = {
    ...openEvent,
    allowAdditionalProperties: false,
    properties: {
      ...openEvent.properties,
      method: { ...stringProperty, allowOtherValues: false },
      campaign_id: { ...optionalProperty, optional: false },
    },
  };

  const comparison = compareCatalogs([openEvent], [closedEvent]);
  assert.equal(comparison.requiredBump, "major");
  assert.equal(
    comparison.changes.every(({ impact }) => impact === "major"),
    true,
  );
});

test("allows deprecated event removal only after the configured period", () => {
  const deprecated: EventDefinition = {
    ...signupCompleted,
    status: "deprecated",
    deprecatedSince: "2026-01-01",
  };
  const beforeDeadline = compareCatalogs([deprecated], [], {
    asOf: "2026-03-31",
    deprecationGracePeriodDays: 90,
  });
  const onDeadline = compareCatalogs([deprecated], [], {
    asOf: "2026-04-01",
    deprecationGracePeriodDays: 90,
  });

  assert.equal(beforeDeadline.requiredBump, "major");
  assert.match(
    beforeDeadline.policyViolations[0]!.message,
    /cannot be removed until 2026-04-01/,
  );
  assert.deepEqual(onDeadline.policyViolations, []);
});

test("rejects invalid lifecycle comparison options", () => {
  assert.throws(
    () => compareCatalogs([signupCompleted], [], { asOf: "2026-02-30" }),
    /Invalid comparison date/,
  );
  assert.throws(
    () =>
      compareCatalogs([signupCompleted], [], {
        deprecationGracePeriodDays: 1.5,
      }),
    /non-negative integer/,
  );
});

test("classifies closed and open string value changes", () => {
  const withMethod = (method: PropertyDefinition): EventDefinition => ({
    ...signupCompleted,
    properties: { ...signupCompleted.properties, method },
  });

  assert.equal(
    compareCatalogs(
      [signupCompleted],
      [withMethod({ ...stringProperty, enum: ["email"] })],
    ).requiredBump,
    "major",
  );
  assert.equal(
    compareCatalogs(
      [signupCompleted],
      [withMethod({ ...stringProperty, enum: ["email", "google", "sso"] })],
    ).requiredBump,
    "minor",
  );
  assert.equal(
    compareCatalogs(
      [withMethod({ ...stringProperty, allowOtherValues: true })],
      [
        withMethod({
          ...stringProperty,
          enum: ["email", "google", "sso"],
          allowOtherValues: true,
        }),
      ],
    ).requiredBump,
    "patch",
  );
  assert.equal(
    compareCatalogs(
      [signupCompleted],
      [withMethod({ ...stringProperty, enum: ["google", "email"] })],
    ).requiredBump,
    "none",
  );
});

test("checks a selected version bump against the required bump", () => {
  assert.equal(isVersionBumpSufficient("patch", "minor"), false);
  assert.equal(isVersionBumpSufficient("minor", "minor"), true);
  assert.equal(isVersionBumpSufficient("major", "minor"), true);
  assert.equal(isVersionBumpSufficient("patch", "none"), true);
});
