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
      key: "paymentCompleted",
    },
  });

  const result = loadEventCatalog(root);

  assert.deepEqual(
    result.events.map(({ name }) => name),
    ["Payment Completed", "Signup Completed"],
  );
  assert.deepEqual(result.sources, [
    "src/definitions/events/auth/signup.json",
    "src/definitions/events/billing/payment.json",
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
      {
        ...validEvent,
        name: "Signup Started",
        key: "signupStarted",
        properties: {},
      },
      validEvent,
    ],
  });

  const result = loadEventCatalog(root);

  assert.deepEqual(
    result.events.map(({ name }) => name),
    ["Signup Completed", "Signup Started"],
  );
  assert.deepEqual(result.sources, [
    "src/definitions/events/auth/auth.json",
  ]);
});

test("loads views and the company user-trait contract", (t) => {
  const root = createCatalogFixture(
    t,
    { "auth/auth.json": validEvent },
    {},
    {
      "settings.json": {
        name: "Settings",
        key: "settings",
        description: "User views settings",
        properties: { section: { type: "string" } },
      },
    },
    {
      "user.json": {
        description: "Durable user traits",
        traits: { plan: { type: "string", optional: true } },
      },
    },
  );

  const result = loadEventCatalog(root);

  assert.equal(result.views[0]?.name, "Settings");
  assert.equal(result.views[0]?.allowAdditionalProperties, false);
  assert.equal(result.userTraits?.traits.plan?.optional, true);
  assert.deepEqual(result.sources, [
    "src/definitions/events/auth/auth.json",
    "src/definitions/traits/user.json",
    "src/definitions/views/settings.json",
  ]);
});

test("rejects duplicate view names, keys, and multiple user-trait contracts", (t) => {
  const root = createCatalogFixture(
    t,
    { "auth/auth.json": validEvent },
    {},
    {
      "first.json": {
        name: "Settings",
        key: "settings",
        description: "First view",
        properties: {},
      },
      "second.json": [
        {
          name: "Settings",
          key: "otherSettings",
          description: "Duplicate name",
          properties: {},
        },
        {
          name: "Account",
          key: "settings",
          description: "Duplicate key",
          properties: {},
        },
      ],
    },
    {
      "first.json": { description: "First", traits: {} },
      "second.json": { description: "Second", traits: {} },
    },
  );

  assert.throws(
    () => loadEventCatalog(root),
    (error: unknown) => {
      assert.ok(error instanceof CatalogValidationError);
      assert.match(error.message, /duplicate view name "Settings"/);
      assert.match(error.message, /duplicate view key "settings"/);
      assert.match(error.message, /expected one user trait definition file, found 2/);
      return true;
    },
  );
});

test("expands reusable property sets into every referencing event", (t) => {
  const root = createCatalogFixture(
    t,
    {
      "auth/auth.json": [
        { ...validEvent, propertySets: ["session_context"] },
        {
          ...validEvent,
          name: "Signup Started",
          key: "signupStarted",
          propertySets: ["session_context"],
          properties: {},
        },
      ],
    },
    {
      "context.json": {
        name: "session_context",
        description: "Properties identifying the current session",
        properties: {
          session_id: { type: "string" },
          is_authenticated: { type: "boolean", optional: true },
        },
      },
    },
  );

  const catalog = loadEventCatalog(root);

  assert.equal(catalog.propertySets.length, 1);
  assert.deepEqual(catalog.sources, [
    "src/definitions/events/auth/auth.json",
    "src/definitions/property-sets/context.json",
  ]);
  for (const event of catalog.events) {
    assert.deepEqual(event.propertySets, ["session_context"]);
    assert.equal(event.properties.session_id?.type, "string");
    assert.equal(event.properties.session_id?.optional, false);
    assert.equal(event.properties.is_authenticated?.optional, true);
  }
});

test("rejects unknown property sets and property collisions", (t) => {
  const root = createCatalogFixture(
    t,
    {
      "auth/auth.json": {
        ...validEvent,
        propertySets: [
          "session_context",
          "experiment_context",
          "missing_context",
        ],
        properties: {
          ...validEvent.properties,
          session_id: { type: "number" },
        },
      },
    },
    {
      "contexts.json": [
        {
          name: "session_context",
          description: "Current session",
          properties: { session_id: { type: "string" } },
        },
        {
          name: "experiment_context",
          description: "Current experiment",
          properties: { session_id: { type: "string" } },
        },
      ],
    },
  );

  assert.throws(
    () => loadEventCatalog(root),
    (error: unknown) => {
      assert.ok(error instanceof CatalogValidationError);
      assert.match(error.message, /unknown property set "missing_context"/);
      assert.match(
        error.message,
        /property "session_id" from both property sets "session_context" and "experiment_context"/,
      );
      assert.match(
        error.message,
        /declares property "session_id".*already provided by property set "session_context"/,
      );
      return true;
    },
  );
});

test("rejects duplicate global property set names", (t) => {
  const propertySet = {
    name: "session_context",
    description: "Current session",
    properties: { session_id: { type: "string" } },
  };
  const root = createCatalogFixture(
    t,
    { "auth/auth.json": validEvent },
    {
      "first.json": propertySet,
      "nested/second.json": propertySet,
    },
  );

  assert.throws(
    () => loadEventCatalog(root),
    /duplicate property set name "session_context".*src\/definitions\/property-sets\/first\.json.*src\/definitions\/property-sets\/nested\/second\.json/,
  );
});

test("validates eventNames keys within their generated scopes", (t) => {
  const root = createCatalogFixture(t, {
    "events.json": [
      { ...validEvent, name: "Sign Up", domain: "auth", key: "signUp" },
      { ...validEvent, name: "sign_up", domain: "auth", key: "signUp" },
      { ...validEvent, name: "Auth", key: "auth" },
      {
        ...validEvent,
        name: "Password Reset",
        domain: "auth",
        key: "passwordReset",
      },
    ],
  });

  assert.throws(
    () => loadEventCatalog(root),
    (error: unknown) => {
      assert.ok(error instanceof CatalogValidationError);
      assert.match(error.message, /eventNames key collision in domain "auth"/);
      assert.match(
        error.message,
        /Root event "Auth".*conflicts with domain "auth".*different event "key"/,
      );
      return true;
    },
  );
});

test("allows the same eventNames key in different domains", (t) => {
  const root = createCatalogFixture(t, {
    "events.json": [
      {
        ...validEvent,
        name: "Auth Completed",
        domain: "auth",
        key: "completed",
      },
      {
        ...validEvent,
        name: "Payment Completed",
        domain: "billing",
        key: "completed",
      },
    ],
  });

  assert.equal(loadEventCatalog(root).events.length, 2);
});

test("validates replacement events across the complete catalog", (t) => {
  const root = createCatalogFixture(t, {
    "auth/auth.json": [
      validEvent,
      {
        ...validEvent,
        name: "Signup Started",
        key: "signupStarted",
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
        key: "missingReplacementDeprecated",
        status: "deprecated",
        deprecatedSince: "2026-09-01",
        replacement: "Does Not Exist",
      },
      {
        ...validEvent,
        name: "Self Replacement Deprecated",
        key: "selfReplacementDeprecated",
        status: "deprecated",
        deprecatedSince: "2026-09-01",
        replacement: "Self Replacement Deprecated",
      },
      {
        ...validEvent,
        name: "Deprecated Target",
        key: "deprecatedTarget",
        status: "deprecated",
        deprecatedSince: "2026-09-01",
      },
      {
        ...validEvent,
        name: "Deprecated Replacement Deprecated",
        key: "deprecatedReplacementDeprecated",
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
  const malformedFile = path.join(
    root,
    "src",
    "definitions",
    "events",
    "auth",
    "malformed.json",
  );
  fs.writeFileSync(malformedFile, "{ not-json }");

  assert.throws(
    () => loadEventCatalog(root),
    (error: unknown) => {
      assert.ok(error instanceof CatalogValidationError);
      assert.match(
        error.message,
        /src\/definitions\/events\/auth\/malformed\.json: invalid JSON/,
      );
      return true;
    },
  );
});
