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
  });
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
  assert.equal(compareCatalogs([signupCompleted], []).requiredBump, "major");

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
